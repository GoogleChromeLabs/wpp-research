# HTTP Archive query to get WebP adoption by WordPress (major) version.
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

SELECT
  mobile.version,
  ROUND(pct_webp_mobile, 3) AS pct_webp_mobile,
  ROUND(pct_webp_desktop, 3) AS pct_webp_desktop
FROM
  (
    SELECT
      version, pct_webp AS pct_webp_mobile
    FROM
      (
        SELECT
          version,
          COUNTIF(has_webp) AS pages_with_webp,
          COUNT(0) AS pages,
          COUNTIF(has_webp) / COUNT(0) AS pct_webp
        FROM
          (
            SELECT DISTINCT
              url,
              REGEXP_EXTRACT(info, r'(\d\.\d+)') AS version
            FROM
              `httparchive.technologies.2022_10_01_mobile`
            WHERE
              app = 'WordPress'
          )
        JOIN
          (
            SELECT
              url,
              has_webp
            FROM
              (
                SELECT
                  pageid,
                  COUNTIF(ext = 'webp') > 0 AS has_webp
                FROM
                  `httparchive.summary_requests.2022_10_01_mobile`
                GROUP BY
                  pageid
              )
            JOIN
              (
                SELECT
                  pageid,
                  url
                FROM
                  `httparchive.summary_pages.2022_10_01_mobile`
              )
              USING (pageid)
          )
          USING (url)
        WHERE version IS NOT NULL
        GROUP BY
          version
        ORDER BY
          version ASC
      )
    WHERE pages > 1500
  ) AS mobile
JOIN
  (
    SELECT
      version, pct_webp AS pct_webp_desktop
    FROM
      (
        SELECT
          version,
          COUNTIF(has_webp) AS pages_with_webp,
          COUNT(0) AS pages,
          COUNTIF(has_webp) / COUNT(0) AS pct_webp
        FROM
          (
            SELECT DISTINCT
              url,
              REGEXP_EXTRACT(info, r'(\d\.\d+)') AS version
            FROM
              `httparchive.technologies.2022_10_01_desktop`
            WHERE
              app = 'WordPress'
          )
        JOIN
          (
            SELECT
              url,
              has_webp
            FROM
              (
                SELECT
                  pageid,
                  COUNTIF(ext = 'webp') > 0 AS has_webp
                FROM
                  `httparchive.summary_requests.2022_10_01_desktop`
                GROUP BY
                  pageid
              )
            JOIN
              (
                SELECT
                  pageid,
                  url
                FROM
                  `httparchive.summary_pages.2022_10_01_desktop`
              )
              USING (pageid)
          )
          USING (url)
        WHERE version IS NOT NULL
        GROUP BY
          version
        ORDER BY
          version ASC
      )
    WHERE pages > 1500
  ) AS desktop
  ON mobile.version = desktop.version
  ORDER BY mobile.version DESC
