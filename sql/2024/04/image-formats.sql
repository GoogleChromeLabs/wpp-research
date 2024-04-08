# HTTP Archive query to get median image size per image type for LCP images.
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
# See https://github.com/GoogleChromeLabs/wpp-research/pull/97

CREATE TEMPORARY FUNCTION
  IS_CMS(technologies ARRAY<STRUCT<technology STRING,
                                   categories ARRAY<STRING>,
                                   info ARRAY<STRING>>>,
         cms STRING,
         version STRING)
  RETURNS BOOL AS ( EXISTS(
  SELECT
    *
  FROM
    UNNEST(technologies) AS technology,
    UNNEST(technology.info) AS info
  WHERE
      technology.technology = cms
    AND ( version = ""
    OR ENDS_WITH(version, ".x")
            AND (STARTS_WITH(info, RTRIM(version, "x"))
        OR info = RTRIM(version, ".x"))
    OR info = version ) ) );

WITH
  pagesWithImages AS (
    SELECT
      date,
      client,
      page,
      LOWER(JSON_EXTRACT_SCALAR(custom_metrics, '$.performance.lcp_elem_stats.nodeName')) = 'img' AS has_lcp_image,
      LOWER(JSON_EXTRACT_SCALAR(custom_metrics, '$.performance.lcp_elem_stats.url')) = JSON_EXTRACT_SCALAR(images, '$.url') AS is_lcp_image,
      JSON_EXTRACT_SCALAR(images, '$.url') AS url,
      JSON_EXTRACT_SCALAR(images, '$.naturalWidth') AS image_width,
      JSON_EXTRACT_SCALAR(images, '$.naturalHeight') AS image_height,
      CAST(JSON_EXTRACT_SCALAR(images, '$.naturalWidth') AS NUMERIC) * CAST(JSON_EXTRACT_SCALAR(images, '$.naturalWidth') AS NUMERIC) AS image_dimensions
    FROM
      `httparchive.all.pages`,
      UNNEST(JSON_EXTRACT_ARRAY(custom_metrics, '$.Images')) AS images
    WHERE
      IS_CMS(technologies,
             'WordPress',
             '')
      AND date = '2024-02-01' ),

  requests AS (
    SELECT
      date,
      client,
      page,
      url,
      LOWER(CAST(JSON_EXTRACT_SCALAR(summary, "$.mimeType") AS STRING)) AS mime_type,
      CAST( JSON_EXTRACT_SCALAR(summary, "$.respSize") AS NUMERIC) AS resp_size,
    FROM
      `httparchive.all.requests`
    WHERE
        LOWER(CAST(JSON_EXTRACT_SCALAR(summary, "$.mimeType") AS STRING)) != ''
      AND date = '2024-02-01' )

SELECT
  client,
  is_lcp_image,
  APPROX_QUANTILES(image_width, 1000)[
    OFFSET
      (500)] AS median_width,
  APPROX_QUANTILES(image_height, 1000)[
    OFFSET
      (500)] AS median_height,
  APPROX_QUANTILES(resp_size, 1000)[
    OFFSET
      (500)] AS median_file_size,
  mime_type
FROM
  pagesWithImages
    JOIN
  requests
  USING
    ( page,
      client,
      url )
GROUP BY
  client,
  is_lcp_image,
  url,
  mime_type
ORDER BY
  client,
  median_width,
  median_height,
  median_file_size,
  mime_type
