# HTTP Archive query to get diff for Web Vitals passing rates of sites that enabled the Speculation Rules API from one month to the next.
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
# See https://github.com/GoogleChromeLabs/wpp-research/pull/112
CREATE TEMP FUNCTION GET_SPECULATIONRULES(custom_metrics STRING) RETURNS STRING AS (
  (
    SELECT
      script
    FROM
      UNNEST(JSON_EXTRACT_ARRAY(custom_metrics, "$.almanac.scripts.nodes")) AS script
    WHERE
      LOWER(JSON_EXTRACT_SCALAR(script, "$.type")) = 'speculationrules'
    LIMIT
      1
  )
);

CREATE TEMP FUNCTION GET_ORIGIN_NAV_PASS_RATE(good FLOAT64, needs_improvement FLOAT64, poor FLOAT64) RETURNS FLOAT64 AS (
  SAFE_DIVIDE(good, good + needs_improvement + poor)
);

CREATE TEMP FUNCTION IS_GOOD(good FLOAT64, needs_improvement FLOAT64, poor FLOAT64) RETURNS BOOL AS (
  SAFE_DIVIDE(good, good + needs_improvement + poor) >= 0.75
);

CREATE TEMP FUNCTION IS_NON_ZERO(good FLOAT64, needs_improvement FLOAT64, poor FLOAT64) RETURNS BOOL AS (
  good + needs_improvement + poor > 0
);

WITH newUrlsWithSpeculationRules AS (
  SELECT
    date,
    client,
    page
  FROM
    `httparchive.all.pages`
  WHERE
    date = '2024-02-01'
    AND is_root_page
    AND GET_SPECULATIONRULES(custom_metrics) IS NOT NULL
),

urlsWhichEnabledSpeculationRules AS (
  SELECT
    IF(client = 'mobile', 'phone', 'desktop') AS device,
    TRIM(page, '/') AS origin
  FROM
    `httparchive.all.pages` p
  INNER JOIN
    newUrlsWithSpeculationRules
  USING
    (client, page)
  WHERE
    p.date = '2024-01-01'
    AND is_root_page
    AND GET_SPECULATIONRULES(custom_metrics) IS NULL
),

crux AS (
  SELECT
    date,
    device,
    origin,

    # Web Vitals nav pass rates per origin
    GET_ORIGIN_NAV_PASS_RATE(fast_lcp, avg_lcp, slow_lcp) AS lcp_pass_rate,
    GET_ORIGIN_NAV_PASS_RATE(fast_inp, avg_inp, slow_inp) AS inp_pass_rate,
    GET_ORIGIN_NAV_PASS_RATE(small_cls, medium_cls, large_cls) AS cls_pass_rate,
    GET_ORIGIN_NAV_PASS_RATE(fast_fcp, avg_fcp, slow_fcp) AS fcp_pass_rate,
    GET_ORIGIN_NAV_PASS_RATE(fast_ttfb, avg_ttfb, slow_ttfb) AS ttfb_pass_rate,
    GET_ORIGIN_NAV_PASS_RATE(fast_fid, avg_fid, slow_fid) AS fid_pass_rate
  FROM
    `chrome-ux-report.materialized.device_summary`
  INNER JOIN
    urlsWhichEnabledSpeculationRules
  USING
    (device, origin)
  WHERE
    (date = '2024-01-01' OR date = '2024-02-01')
    AND device IN ('desktop', 'phone')
)

SELECT
  device,
  oldCrux.date AS oldDate,
  newCrux.date AS newDate,
  COUNT(origin) AS num_origins,
  percentile,
  APPROX_QUANTILES(newCrux.lcp_pass_rate - oldCrux.lcp_pass_rate, 100)[OFFSET(percentile)] AS lcp_diff,
  APPROX_QUANTILES(newCrux.inp_pass_rate - oldCrux.inp_pass_rate, 100)[OFFSET(percentile)] AS inp_diff,
  APPROX_QUANTILES(newCrux.cls_pass_rate - oldCrux.cls_pass_rate, 100)[OFFSET(percentile)] AS cls_diff,
  APPROX_QUANTILES(newCrux.fcp_pass_rate - oldCrux.fcp_pass_rate, 100)[OFFSET(percentile)] AS fcp_diff,
  APPROX_QUANTILES(newCrux.ttfb_pass_rate - oldCrux.ttfb_pass_rate, 100)[OFFSET(percentile)] AS ttfb_diff,
  APPROX_QUANTILES(newCrux.fid_pass_rate - oldCrux.fid_pass_rate, 100)[OFFSET(percentile)] AS fid_diff
FROM (
  SELECT * FROM crux WHERE date = '2024-01-01'
) oldCrux, UNNEST([10, 25, 50, 75, 90, 100]) AS percentile
INNER JOIN (
  SELECT * FROM crux WHERE date = '2024-02-01'
) newCrux
USING
  (device, origin)
GROUP BY
  device,
  oldDate,
  newDate,
  percentile
ORDER BY
  device,
  percentile
