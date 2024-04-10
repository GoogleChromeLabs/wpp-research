# HTTP Archive query to measure impact of inaccurate sizes attributes per <img> for WordPress sites.
#
# WPP Research, Copyright 2024 Google LLC
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

DECLARE DATE_TO_QUERY DATE DEFAULT '2024-03-01';

CREATE TEMPORARY FUNCTION GET_IMG_SIZES_ACCURACY(custom_metrics STRING) RETURNS
  ARRAY<STRUCT<hasSrcset BOOL,
  hasSizes BOOL,
  sizesAbsoluteError INT64,
  sizesRelativeError FLOAT64,
  idealSizesSelectedResourceEstimatedPixels INT64,
  actualSizesEstimatedWastedLoadedPixels INT64,
  relativeSizesEstimatedWastedLoadedPixels FLOAT64,
  idealSizesSelectedResourceEstimatedBytes FLOAT64,
  actualSizesEstimatedWastedLoadedBytes FLOAT64,
  relativeSizesEstimatedWastedLoadedBytes FLOAT64>>
AS (
  ARRAY(
    SELECT AS STRUCT
      CAST(JSON_EXTRACT_SCALAR(image, '$.hasSrcset') AS BOOL) AS hasSrcset,
      CAST(JSON_EXTRACT_SCALAR(image, '$.hasSizes') AS BOOL) AS hasSizes,
      CAST(JSON_EXTRACT_SCALAR(image, '$.sizesAbsoluteError') AS INT64) AS sizesAbsoluteError,
      CAST(JSON_EXTRACT_SCALAR(image, '$.sizesRelativeError') AS FLOAT64) AS sizesRelativeError,
      CAST(JSON_EXTRACT_SCALAR(image, '$.idealSizesSelectedResourceEstimatedPixels') AS INT64) AS idealSizesSelectedResourceEstimatedPixels,
      CAST(JSON_EXTRACT_SCALAR(image, '$.actualSizesEstimatedWastedLoadedPixels') AS INT64) AS actualSizesEstimatedWastedLoadedPixels,
      SAFE_DIVIDE(
        CAST(JSON_EXTRACT_SCALAR(image, '$.actualSizesEstimatedWastedLoadedPixels') AS INT64),
        CAST(JSON_EXTRACT_SCALAR(image, '$.idealSizesSelectedResourceEstimatedPixels') AS INT64)
      ) AS relativeSizesEstimatedWastedLoadedPixels,
      CAST(JSON_EXTRACT_SCALAR(image, '$.idealSizesSelectedResourceEstimatedBytes') AS FLOAT64) AS idealSizesSelectedResourceEstimatedBytes,
      CAST(JSON_EXTRACT_SCALAR(image, '$.actualSizesEstimatedWastedLoadedBytes') AS FLOAT64) AS actualSizesEstimatedWastedLoadedBytes,
      SAFE_DIVIDE(
        CAST(JSON_EXTRACT_SCALAR(image, '$.actualSizesEstimatedWastedLoadedBytes') AS FLOAT64),
        CAST(JSON_EXTRACT_SCALAR(image, '$.idealSizesSelectedResourceEstimatedBytes') AS FLOAT64)
      ) AS relativeSizesEstimatedWastedLoadedBytes,
    FROM
      UNNEST(JSON_EXTRACT_ARRAY(custom_metrics, '$.responsive_images.responsive-images')) AS image
  )
);

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
    UNNEST(GET_IMG_SIZES_ACCURACY(custom_metrics)) AS image
  WHERE
    date = DATE_TO_QUERY
    AND IS_CMS(technologies, 'WordPress', '')
    AND is_root_page = TRUE
    AND image.hasSrcset = TRUE
    AND image.hasSizes = TRUE
)

SELECT
  percentile,
  client,
  APPROX_QUANTILES(image.sizesAbsoluteError, 100)[OFFSET(percentile)] AS sizesAbsoluteError,
  APPROX_QUANTILES(image.sizesRelativeError, 100)[OFFSET(percentile)] AS sizesRelativeError,
  APPROX_QUANTILES(image.idealSizesSelectedResourceEstimatedPixels, 100)[OFFSET(percentile)] AS idealSizesSelectedResourceEstimatedPixels,
  APPROX_QUANTILES(image.actualSizesEstimatedWastedLoadedPixels, 100)[OFFSET(percentile)] AS actualSizesEstimatedWastedLoadedPixels,
  APPROX_QUANTILES(image.relativeSizesEstimatedWastedLoadedPixels, 100)[OFFSET(percentile)] AS relativeSizesEstimatedWastedLoadedPixels,
  APPROX_QUANTILES(image.idealSizesSelectedResourceEstimatedBytes, 100)[OFFSET(percentile)] AS idealSizesSelectedResourceEstimatedBytes,
  APPROX_QUANTILES(image.actualSizesEstimatedWastedLoadedBytes, 100)[OFFSET(percentile)] AS actualSizesEstimatedWastedLoadedBytes,
  APPROX_QUANTILES(image.relativeSizesEstimatedWastedLoadedBytes, 100)[OFFSET(percentile)] AS relativeSizesEstimatedWastedLoadedBytes,
FROM
  wordpressSizesData,
  UNNEST([10, 20, 30, 40, 50, 60, 70, 80, 90]) AS percentile
GROUP BY
  percentile,
  client
ORDER BY
  percentile,
  client
