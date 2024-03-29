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


CREATE TEMPORARY FUNCTION
  getSrcsetSizesAccuracy(payload STRING)
  RETURNS ARRAY<STRUCT<sizesAbsoluteError INT64,
  sizesRelativeError FLOAT64,
  wDescriptorAbsoluteError INT64,
  wDescriptorRelativeError FLOAT64,
  actualSizesEstimatedWastedLoadedPixels INT64,
  actualSizesEstimatedWastedLoadedBytes FLOAT64,
  wastedLoadedPercent FLOAT64>>
  LANGUAGE js AS '''
try {
  var $ = JSON.parse(payload);
  var responsiveImages = JSON.parse($._responsive_images);
  responsiveImages = responsiveImages['responsive-images'];
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

CREATE TEMPORARY FUNCTION IS_CMS(technologies ARRAY<STRUCT<technology STRING, categories ARRAY<STRING>, info ARRAY<STRING>>>, cms STRING, version STRING) RETURNS BOOL AS (
  EXISTS(
    SELECT * FROM UNNEST(technologies) AS technology, UNNEST(technology.info) AS info
    WHERE technology.technology = cms
    AND (
      version = ""
      OR ENDS_WITH(version, ".x") AND (STARTS_WITH(info, RTRIM(version, "x")) OR info = RTRIM(version, ".x"))
      OR info = version
    )
  )
);

WITH wordpressSizesData AS (
  SELECT
    client,
    image
  FROM
    `httparchive.all.pages`,
    UNNEST(getSrcsetSizesAccuracy(payload)) AS image
  WHERE
    date = '2024-02-01'
    AND IS_CMS(technologies, 'WordPress', '')
    AND is_root_page = TRUE
)

SELECT
  percentile,
  client,
  APPROX_QUANTILES(image.sizesAbsoluteError, 100)[OFFSET(percentile)] AS sizesAbsoluteError,
  APPROX_QUANTILES(image.sizesRelativeError, 100)[OFFSET(percentile)] AS sizesRelativeError,
  APPROX_QUANTILES(image.wDescriptorAbsoluteError, 100)[OFFSET(percentile)] AS wDescriptorAbsoluteError,
  APPROX_QUANTILES(image.wDescriptorRelativeError, 100)[OFFSET(percentile)] AS wDescriptorRelativeError,
  APPROX_QUANTILES(image.actualSizesEstimatedWastedLoadedPixels, 100)[OFFSET(percentile)] AS actualSizesEstimatedWastedLoadedPixels,
  APPROX_QUANTILES(image.actualSizesEstimatedWastedLoadedBytes, 100)[OFFSET(percentile)] AS actualSizesEstimatedWastedLoadedBytes,
  APPROX_QUANTILES(image.wastedLoadedPercent, 100)[OFFSET(percentile)] AS wastedLoadedPercent
FROM
  wordpressSizesData,
  UNNEST([10, 20, 30, 40, 50, 60, 70, 80, 90]) AS percentile
GROUP BY
  percentile,
  client
ORDER BY
  percentile,
  client
