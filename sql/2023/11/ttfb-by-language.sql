# HTTP Archive query to get TTFB information of WordPress sites by whether they are localized or not.
#
# WPP Research, Copyright 2023 Google LLC
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
# See https://github.com/GoogleChromeLabs/wpp-research/pull/54
CREATE TEMP FUNCTION
  IS_GOOD(good FLOAT64,
          needs_improvement FLOAT64,
          poor FLOAT64)
  RETURNS BOOL AS ( SAFE_DIVIDE(good, good + needs_improvement + poor) >= 0.75 );
CREATE TEMP FUNCTION
  IS_NON_ZERO(good FLOAT64,
              needs_improvement FLOAT64,
              poor FLOAT64)
  RETURNS BOOL AS ( good + needs_improvement + poor > 0 );
CREATE TEMP FUNCTION
  IS_LOCALIZED(lang STRING)
  RETURNS BOOL AS ( lang IS NOT NULL
  AND lang != "en"
  AND lang != "en-us" );
WITH
  pages AS (
    SELECT
      client,
      IS_LOCALIZED(REPLACE(TRIM(LOWER(JSON_VALUE(JSON_VALUE(payload, '$._almanac'), '$.html_node.lang'))), '_', '-' )) AS is_localized,
      page AS url,
    FROM
      `httparchive.all.pages`,
      UNNEST(technologies) AS t
    WHERE
        date = '2023-10-01'
      AND is_root_page
      AND t.technology = 'WordPress' ),
  devices AS (
    SELECT
      device,
      origin,
      CONCAT(origin, '/') AS url,
      IF
        (device = 'desktop', 'desktop', 'mobile') AS client,
      IS_NON_ZERO(fast_ttfb,
                  avg_ttfb,
                  slow_ttfb) AS any_ttfb,
      IS_GOOD(fast_ttfb,
              avg_ttfb,
              slow_ttfb) AS good_ttfb
    FROM
      `chrome-ux-report.materialized.device_summary`
    WHERE
        date = CAST("2023-10-01" AS DATE)
      AND device IN ('desktop',
                     'tablet',
                     'phone') )
SELECT
  client,
  is_localized,
  SAFE_DIVIDE(COUNTIF(good_ttfb), COUNTIF(any_ttfb)) AS ttfb_passing_rate
FROM
  devices
    JOIN
  pages
  USING
    (client,
     url)
GROUP BY
  is_localized,
  client,
ORDER BY
  is_localized ASC,
  good_ttfb ASC,
  client ASC
