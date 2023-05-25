# HTTP Archive query to get TTFB information of WordPress sites by language.
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

SELECT
  client,
  lang,
  COUNT(DISTINCT origin) AS n,
  SUM(
    IF
      (ttfb.start < 200, ttfb.density, 0)) / SUM(ttfb.density) AS fast,
  SUM(
    IF
      (ttfb.start >= 200
         AND ttfb.start < 1000, ttfb.density, 0)) / SUM(ttfb.density) AS avg,
  SUM(
    IF
      (ttfb.start >= 1000, ttfb.density, 0)) / SUM(ttfb.density) AS slow
FROM
  `chrome-ux-report.all.202304`,
  UNNEST(experimental.time_to_first_byte.histogram.bin) AS ttfb
    JOIN (
    SELECT
        _TABLE_SUFFIX AS client,
        TRIM(LOWER(JSON_VALUE(JSON_VALUE(payload, '$._almanac'), '$.html_node.lang'))) AS lang,
        url
    FROM
      `httparchive.pages.2023_05_01_*`
        JOIN (
        SELECT
            _TABLE_SUFFIX
        FROM
          `httparchive.technologies.2023_05_01_*`
        WHERE
            app = 'WordPress'
          AND category = 'CMS'
          AND info != ''
        GROUP BY
            _TABLE_SUFFIX )
             USING
               (_TABLE_SUFFIX)
    GROUP BY
        _TABLE_SUFFIX,
        lang,
        url )
         ON
               client =
               IF
                 (form_factor.name = 'desktop', 'desktop', 'mobile')
             AND CONCAT(origin, '/') = url
GROUP BY
  lang,
  client
ORDER BY
  lang ASC,
  client ASC
