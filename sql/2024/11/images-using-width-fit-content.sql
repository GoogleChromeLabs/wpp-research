# HTTP Archive query to get % of WordPress URLs with images that use `width: fit-content`.
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
# See https://github.com/GoogleChromeLabs/wpp-research/pull/163

DECLARE DATE_TO_QUERY DATE DEFAULT '2024-10-01';

CREATE TEMPORARY FUNCTION GET_IMG_DATA(custom_metrics STRING) RETURNS
  ARRAY<STRUCT<url STRING,
  width_attr STRING,
  height_attr STRING,
  width_client STRING,
  height_client STRING,
  width_computed STRING,
  height_computed STRING>>
AS (
  ARRAY(
    SELECT AS STRUCT
      CAST(JSON_EXTRACT_SCALAR(image, '$.url') AS STRING) AS url,
      CAST(JSON_EXTRACT_SCALAR(image, '$.widthAttribute') AS STRING) AS width_attr,
      CAST(JSON_EXTRACT_SCALAR(image, '$.heightAttribute') AS STRING) AS height_attr,
      CAST(JSON_EXTRACT_SCALAR(image, '$.clientWidth') AS STRING) AS width_client,
      CAST(JSON_EXTRACT_SCALAR(image, '$.clientHeight') AS STRING) AS height_client,
      CAST(JSON_EXTRACT_SCALAR(image, '$.computedSizingStyles.width') AS STRING) AS width_computed,
      CAST(JSON_EXTRACT_SCALAR(image, '$.computedSizingStyles.height') AS STRING) AS height_computed
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

WITH relevantUrls AS (
  SELECT
    client,
    page,
    custom_metrics
  FROM
    `httparchive.all.pages`
  WHERE
    date = DATE_TO_QUERY
    AND IS_CMS(technologies, 'WordPress', '')
),

images AS (
  SELECT
    client,
    page,
    image.*
  FROM
    relevantUrls,
    UNNEST(GET_IMG_DATA(custom_metrics)) AS image
)

SELECT
  client,
  COUNT(DISTINCT IF(width_computed = 'fit-content', page, NULL)) AS urls_with_width_fit_content,
  COUNT(IF(width_computed = 'fit-content', url, NULL)) AS images_with_width_fit_content,
  COUNT(DISTINCT page) AS urls_total,
  COUNT(url) AS images_total,
  COUNT(DISTINCT IF(width_computed = 'fit-content', page, NULL)) / COUNT(DISTINCT page) AS urls_pct,
  COUNT(IF(width_computed = 'fit-content', url, NULL)) / COUNT(url) AS images_pct
FROM
  images
GROUP BY
  client
ORDER BY
  client
