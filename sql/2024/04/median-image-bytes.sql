# HTTP Archive query to get median image size per image type.
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
CREATE TEMPORARY FUNCTION
  IS_IMAGE (summary STRING)
  RETURNS BOOLEAN AS ( LOWER(CAST(JSON_EXTRACT_SCALAR(summary, "$.mimeType") AS STRING)) IN ('image/webp',
                                                                                             'image/png',
                                                                                             'image/jpeg',
                                                                                             'image/avif',
                                                                                             'image/gif',
                                                                                             'image/bmp'));
WITH
  pages AS (
    SELECT
      date,
      client,
      page
    FROM
      `httparchive.all.pages`
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
      LOWER(CAST(JSON_EXTRACT_SCALAR(summary, "$.mimeType") AS STRING)) AS mimeType,
      CAST( JSON_EXTRACT_SCALAR(summary, "$.respSize") AS NUMERIC) AS respSize,
    FROM
      `httparchive.all.requests`
    WHERE
      IS_IMAGE(summary)
      AND date = '2024-02-01' )
SELECT
  mimeType,
  APPROX_QUANTILES(respSize, 1000)[
    OFFSET
      (500)] AS median_respSize
FROM
  requests
    JOIN
  pages
  USING
    (client,
     page,
     date)
GROUP BY
  client,
  mimeType
ORDER BY
  mimeType,
  median_respSize
