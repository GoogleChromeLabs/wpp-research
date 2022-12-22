# HTTP Archive query to get Core Web Vitals "good" rates by WordPress version.
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

# See https://github.com/GoogleChromeLabs/wpp-research/pull/18

CREATE TEMP FUNCTION IS_GOOD(good FLOAT64, needs_improvement FLOAT64, poor FLOAT64)
RETURNS BOOL
AS (
  good / (good + needs_improvement + poor) >= 0.75
);

CREATE TEMP FUNCTION IS_NON_ZERO(good FLOAT64, needs_improvement FLOAT64, poor FLOAT64)
RETURNS BOOL
AS (
  good + needs_improvement + poor > 0
);

SELECT *
FROM
  (
    SELECT
      REGEXP_EXTRACT(info, '(\\d.\\d).*') AS major_version,
      client,
      COUNT(DISTINCT url) AS origins,
      COUNT(DISTINCT IF(good_fid, url, NULL)) AS origins_with_good_fid,
      COUNT(DISTINCT IF(good_cls, url, NULL)) AS origins_with_good_cls,
      COUNT(DISTINCT IF(good_lcp, url, NULL)) AS origins_with_good_lcp,
      COUNT(DISTINCT IF(any_fid, url, NULL)) AS origins_with_any_fid,
      COUNT(DISTINCT IF(any_cls, url, NULL)) AS origins_with_any_cls,
      COUNT(DISTINCT IF(any_lcp, url, NULL)) AS origins_with_any_lcp,
      COUNT(DISTINCT IF(good_cwv, url, NULL)) AS origins_with_good_cwv,
      COUNT(DISTINCT IF(any_lcp AND any_cls, url, NULL)) AS origins_eligible_for_cwv,
      SAFE_DIVIDE(COUNTIF(good_cwv), COUNTIF(any_lcp AND any_cls))
        AS pct_eligible_origins_with_good_cwv
    FROM
      (
        SELECT
          date,
          CONCAT(origin, '/') AS url,
          IF(device = 'desktop', 'desktop', 'mobile') AS client,
          IS_NON_ZERO(fast_fid, avg_fid, slow_fid) AS any_fid,
          IS_GOOD(fast_fid, avg_fid, slow_fid) AS good_fid,
          IS_NON_ZERO(small_cls, medium_cls, large_cls) AS any_cls,
          IS_GOOD(small_cls, medium_cls, large_cls) AS good_cls,
          IS_NON_ZERO(fast_lcp, avg_lcp, slow_lcp) AS any_lcp,
          IS_GOOD(fast_lcp, avg_lcp, slow_lcp) AS good_lcp,
          (IS_GOOD(fast_fid, avg_fid, slow_fid) OR fast_fid IS NULL)
            AND IS_GOOD(small_cls, medium_cls, large_cls)
            AND IS_GOOD(fast_lcp, avg_lcp, slow_lcp) AS good_cwv
        FROM
          `chrome-ux-report.materialized.device_summary`
        WHERE
          date = '2022-10-01' AND device IN ('desktop', 'tablet', 'phone')
      )
    JOIN
      (
        SELECT DISTINCT
          CAST('2022-10-01' AS DATE) AS date,
          category,
          app,
          info,
          _TABLE_SUFFIX AS client,
          url
        FROM
          `httparchive.technologies.2022_10_01_*`
        WHERE
          app = 'WordPress'
          AND info != ''
      )
      USING (date, url, client)
    GROUP BY
      date,
      major_version,
      app,
      info,
      client
  )
WHERE origins > 100
ORDER BY major_version DESC
