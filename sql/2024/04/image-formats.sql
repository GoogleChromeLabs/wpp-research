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

DECLARE
  DATE_TO_QUERY DATE DEFAULT '2024-03-01';

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

CREATE TEMPORARY FUNCTION
  IS_IMAGE (summary STRING)
  RETURNS BOOLEAN AS ( LOWER(CAST(JSON_EXTRACT_SCALAR(summary, "$.mimeType") AS STRING)) IN ('image/webp',
                                                                                             'image/png',
                                                                                             'image/jpeg',
                                                                                             'image/avif',
                                                                                             'image/gif',
                                                                                             'image/bmp'));

CREATE TEMPORARY FUNCTION
  GET_LCP_ELEMENT_ATTRIBUTE(custom_metrics STRING,
                            attribute STRING)
  RETURNS STRING AS ( (
  SELECT
    JSON_EXTRACT_SCALAR(attr, "$.value") AS v
  FROM
    UNNEST(JSON_EXTRACT_ARRAY(JSON_EXTRACT(custom_metrics, '$.performance.lcp_elem_stats.attributes'))) AS attr
  WHERE
      JSON_EXTRACT_SCALAR(attr, "$.name") = attribute
  LIMIT
    1 ) );

CREATE TEMPORARY FUNCTION
  GET_LCP_IMAGE_ATTRIBUTE_VALUE(custom_metrics STRING,
                                attribute STRING)
  RETURNS STRING AS ( (
  SELECT
    JSON_EXTRACT_SCALAR(attributes, CONCAT("$.", attribute)) AS v
  FROM
    UNNEST(JSON_EXTRACT_ARRAY(custom_metrics, '$.Images')) AS attributes
  WHERE
    JSON_EXTRACT_SCALAR(attributes, CONCAT("$.", attribute)) IS NOT NULL
    AND JSON_EXTRACT_SCALAR(attributes, CONCAT("$.", 'url')) = GET_LCP_ELEMENT_ATTRIBUTE(custom_metrics,
                                                                                         'url')
  LIMIT
    1 ) );
WITH
  pagesWithLcpImages AS (
    SELECT
      date,
      client,
      page,
      GET_LCP_ELEMENT_ATTRIBUTE(custom_metrics,
                                'url') AS url,
      GET_LCP_IMAGE_ATTRIBUTE_VALUE(custom_metrics,
                                    'naturalWidth') AS image_width,
      GET_LCP_IMAGE_ATTRIBUTE_VALUE(custom_metrics,
                                    'naturalHeight') AS image_height
    FROM
      `httparchive.all.pages`
    WHERE
      IS_CMS(technologies,
             'WordPress',
             '')
      AND LOWER(JSON_EXTRACT_SCALAR(custom_metrics, '$.performance.lcp_elem_stats.nodeName')) = 'img'
      AND GET_LCP_IMAGE_ATTRIBUTE_VALUE(custom_metrics,
                                        'naturalWidth') IS NOT NULL
      AND GET_LCP_IMAGE_ATTRIBUTE_VALUE(custom_metrics,
                                        'naturalHeight') IS NOT NULL
      AND date = DATE_TO_QUERY ),
  imageRequests AS (
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
      IS_IMAGE(summary)
      AND date = DATE_TO_QUERY )

SELECT
  date,
  client,
  mime_type,
  COUNT(url) AS num_lcp_images,
  APPROX_QUANTILES(image_width, 1000)[
    OFFSET
      (500)] AS median_width,
  APPROX_QUANTILES(image_height, 1000)[
    OFFSET
      (500)] AS median_height,
  APPROX_QUANTILES(resp_size, 1000)[
    OFFSET
      (500)] AS median_file_size
FROM
  pagesWithLcpImages
    JOIN
  imageRequests
  USING
    ( date,
      page,
      client,
      url )
GROUP BY
  date,
  client,
  mime_type
ORDER BY
  client,
  median_file_size,
  median_width,
  median_height,
  mime_type
