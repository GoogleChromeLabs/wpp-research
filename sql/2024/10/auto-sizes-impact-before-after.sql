# HTTP Archive query to compare the image sizes attribute impact of using the `auto-sizes` plugin.
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
#
# See https://github.com/GoogleChromeLabs/wpp-research/pull/162

# This intentionally queries between May and June, since in July additional functionality was added to the
# `auto-sizes` plugin, which we do not want to influence the results here.
DECLARE DATE_BEFORE DATE DEFAULT '2024-05-01';
DECLARE DATE_AFTER DATE DEFAULT '2024-06-01';

CREATE TEMPORARY FUNCTION GET_IMG_SIZES_ACCURACY(custom_metrics STRING) RETURNS
  ARRAY<STRUCT<url STRING,
  hasSrcset BOOL,
  hasSizes BOOL,
  sizesAbsoluteError FLOAT64,
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
      CAST(JSON_EXTRACT_SCALAR(image, '$.url') AS STRING) AS url,
      CAST(JSON_EXTRACT_SCALAR(image, '$.hasSrcset') AS BOOL) AS hasSrcset,
      CAST(JSON_EXTRACT_SCALAR(image, '$.hasSizes') AS BOOL) AS hasSizes,
      CAST(JSON_EXTRACT_SCALAR(image, '$.sizesAbsoluteError') AS FLOAT64) AS sizesAbsoluteError,
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

CREATE TEMPORARY FUNCTION GET_GENERATOR_CONTENTS(custom_metrics STRING) RETURNS ARRAY<STRING> AS (
  ARRAY(
    SELECT
      JSON_EXTRACT_SCALAR(metaNode, '$.content') AS content
    FROM
      UNNEST(JSON_EXTRACT_ARRAY(JSON_EXTRACT(custom_metrics, '$.almanac.meta-nodes.nodes'))) AS metaNode
    WHERE
      JSON_EXTRACT_SCALAR(metaNode, '$.name') = 'generator'
  )
);

CREATE TEMPORARY FUNCTION HAS_GENERATOR(custom_metrics STRING, identifier STRING) RETURNS BOOL AS (
  EXISTS(
    SELECT
      *
    FROM
      UNNEST(GET_GENERATOR_CONTENTS(custom_metrics)) AS generator
    WHERE
      generator LIKE CONCAT(identifier, ' %')
  )
);

WITH relevantUrlsAfter AS (
  SELECT
    client,
    page,
    custom_metrics
  FROM
    `httparchive.all.pages`
  WHERE
    date = DATE_AFTER
    AND is_root_page = TRUE
    AND IS_CMS(technologies, 'WordPress', '')
    AND HAS_GENERATOR(custom_metrics, 'auto-sizes') = TRUE
),

relevantUrlsBefore AS (
  SELECT
    client,
    page,
    before.custom_metrics AS custom_metrics
  FROM
    `httparchive.all.pages` AS before
  INNER JOIN
    relevantUrlsAfter AS after
  USING
    (client, page)
  WHERE
    date = DATE_BEFORE
    AND is_root_page = TRUE
    AND IS_CMS(technologies, 'WordPress', '')
    AND HAS_GENERATOR(before.custom_metrics, 'auto-sizes') = FALSE
),

imageSizesDataAfter AS (
  SELECT
    client,
    page,
    image.url AS image_url,
    image
  FROM
    relevantUrlsAfter,
    UNNEST(GET_IMG_SIZES_ACCURACY(custom_metrics)) AS image
  WHERE
    image.hasSrcset = TRUE
    AND image.hasSizes = TRUE
),

imageSizesDataBefore AS (
  SELECT
    client,
    page,
    image.url AS image_url,
    image
  FROM
    relevantUrlsBefore,
    UNNEST(GET_IMG_SIZES_ACCURACY(custom_metrics)) AS image
  WHERE
    image.hasSrcset = TRUE
    AND image.hasSizes = TRUE
)

SELECT
  client,
  percentile,
  COUNT(DISTINCT page) AS numSites,
  COUNT(image_url) AS numImages,
  APPROX_QUANTILES(before.image.sizesAbsoluteError, 100)[OFFSET(percentile)] AS sizesAbsoluteErrorBefore,
  APPROX_QUANTILES(before.image.sizesRelativeError, 100)[OFFSET(percentile)] AS sizesRelativeErrorBefore,
  APPROX_QUANTILES(before.image.idealSizesSelectedResourceEstimatedPixels, 100)[OFFSET(percentile)] AS idealSizesSelectedResourceEstimatedPixelsBefore,
  APPROX_QUANTILES(before.image.actualSizesEstimatedWastedLoadedPixels, 100)[OFFSET(percentile)] AS actualSizesEstimatedWastedLoadedPixelsBefore,
  APPROX_QUANTILES(before.image.relativeSizesEstimatedWastedLoadedPixels, 100)[OFFSET(percentile)] AS relativeSizesEstimatedWastedLoadedPixelsBefore,
  APPROX_QUANTILES(before.image.idealSizesSelectedResourceEstimatedBytes, 100)[OFFSET(percentile)] AS idealSizesSelectedResourceEstimatedBytesBefore,
  APPROX_QUANTILES(before.image.actualSizesEstimatedWastedLoadedBytes, 100)[OFFSET(percentile)] AS actualSizesEstimatedWastedLoadedBytesBefore,
  APPROX_QUANTILES(before.image.relativeSizesEstimatedWastedLoadedBytes, 100)[OFFSET(percentile)] AS relativeSizesEstimatedWastedLoadedBytesBefore,
  APPROX_QUANTILES(after.image.sizesAbsoluteError, 100)[OFFSET(percentile)] AS sizesAbsoluteErrorAfter,
  APPROX_QUANTILES(after.image.sizesRelativeError, 100)[OFFSET(percentile)] AS sizesRelativeErrorAfter,
  APPROX_QUANTILES(after.image.idealSizesSelectedResourceEstimatedPixels, 100)[OFFSET(percentile)] AS idealSizesSelectedResourceEstimatedPixelsAfter,
  APPROX_QUANTILES(after.image.actualSizesEstimatedWastedLoadedPixels, 100)[OFFSET(percentile)] AS actualSizesEstimatedWastedLoadedPixelsAfter,
  APPROX_QUANTILES(after.image.relativeSizesEstimatedWastedLoadedPixels, 100)[OFFSET(percentile)] AS relativeSizesEstimatedWastedLoadedPixelsAfter,
  APPROX_QUANTILES(after.image.idealSizesSelectedResourceEstimatedBytes, 100)[OFFSET(percentile)] AS idealSizesSelectedResourceEstimatedBytesAfter,
  APPROX_QUANTILES(after.image.actualSizesEstimatedWastedLoadedBytes, 100)[OFFSET(percentile)] AS actualSizesEstimatedWastedLoadedBytesAfter,
  APPROX_QUANTILES(after.image.relativeSizesEstimatedWastedLoadedBytes, 100)[OFFSET(percentile)] AS relativeSizesEstimatedWastedLoadedBytesAfter,
FROM
  imageSizesDataBefore AS before,
  UNNEST([10, 20, 30, 40, 50, 60, 70, 80, 90]) AS percentile
INNER JOIN
  imageSizesDataAfter AS after
USING
  (client, page, image_url)
GROUP BY
  client,
  percentile
ORDER BY
  client,
  percentile
