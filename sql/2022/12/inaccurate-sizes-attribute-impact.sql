# HTTP Archive query to measure impact of inaccurate sizes attributes per <img> for WordPress sites.
#
# WPP Research, Copyright 2022 Google LLC
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     https://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

# See query results here: https://github.com/GoogleChromeLabs/wpp-research/pull/19
CREATE TEMPORARY FUNCTION
  getSrcsetSizesAccuracy(responsive_images JSON)
  RETURNS ARRAY<STRUCT<sizesAbsoluteError INT64,
  sizesRelativeError FLOAT64,
  wDescriptorAbsoluteError INT64,
  wDescriptorRelativeError FLOAT64,
  actualSizesEstimatedWastedLoadedPixels INT64,
  actualSizesEstimatedWastedLoadedBytes FLOAT64,
  wastedLoadedPercent FLOAT64>>
  LANGUAGE js AS '''
try {
  var responsiveImages = responsive_images['responsive-images'];
  return responsiveImages.map(({
    sizesAbsoluteError,
    sizesRelativeError,
    wDescriptorAbsoluteError,
    wDescriptorRelativeError,
    idealSizesSelectedResourceEstimatedPixels,
    actualSizesEstimatedWastedLoadedPixels,
    actualSizesEstimatedWastedLoadedBytes
  }) => {
    let wastedLoadedPercent;
    if ( idealSizesSelectedResourceEstimatedPixels > 0 ) {
      wastedLoadedPercent = actualSizesEstimatedWastedLoadedPixels / idealSizesSelectedResourceEstimatedPixels;
    } else {
      wastedLoadedPercent = null;
    }
    return {
      sizesAbsoluteError,
      sizesRelativeError,
      wDescriptorAbsoluteError,
      wDescriptorRelativeError,
      actualSizesEstimatedWastedLoadedPixels,
      actualSizesEstimatedWastedLoadedBytes,
      wastedLoadedPercent
    };
  }
);
} catch (e) {
  return [];
}
''';
SELECT
  percentile,
  client,
  APPROX_QUANTILES(image.sizesAbsoluteError, 1000)[OFFSET(percentile * 10)] AS sizesAbsoluteError,
  APPROX_QUANTILES(image.sizesRelativeError, 1000)[OFFSET(percentile * 10)] AS sizesRelativeError,
  APPROX_QUANTILES(image.wDescriptorAbsoluteError, 1000)[OFFSET(percentile * 10)] AS wDescriptorAbsoluteError,
  APPROX_QUANTILES(image.wDescriptorRelativeError, 1000)[OFFSET(percentile * 10)] AS wDescriptorRelativeError,
  APPROX_QUANTILES(image.actualSizesEstimatedWastedLoadedPixels, 1000)[OFFSET(percentile * 10)] AS actualSizesEstimatedWastedLoadedPixels,
  APPROX_QUANTILES(image.actualSizesEstimatedWastedLoadedBytes, 1000)[OFFSET(percentile * 10)] AS actualSizesEstimatedWastedLoadedBytes,
  APPROX_QUANTILES(image.wastedLoadedPercent, 1000)[OFFSET(percentile * 10)] AS wastedLoadedPercent
FROM (
  SELECT
    client,
    image
  FROM
    `httparchive.crawl.pages`,
    UNNEST(technologies) AS technology,
    UNNEST(getSrcsetSizesAccuracy(custom_metrics.responsive_images)) AS image
  WHERE
    date = '2022-10-01'
    AND is_root_page
    AND technology.technology = 'WordPress' ),
  UNNEST([10, 25, 50, 75, 90]) AS percentile
GROUP BY
  percentile,
  client
ORDER BY
  percentile,
  client
