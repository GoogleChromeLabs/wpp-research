# HTTP Archive query to measure the usage of third-party render blocking scripts for WordPress sites.
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

# See query results here: https://github.com/GoogleChromeLabs/wpp-research/pull/33
SELECT
  percentile,
  client,
  host,
  APPROX_QUANTILES(requests, 1000)[OFFSET(percentile * 10)] AS num_requests
FROM (
  SELECT
    client,
    page,
  IF
    (NET.HOST(requests.url) IN (
      SELECT
        domain
      FROM
        `httparchive.almanac.third_parties`
      WHERE
        date = '2022-06-01'
        AND category != 'hosting' ), 'third party', 'first party') AS host,
    COUNT(0) AS requests
  FROM
    `httparchive.almanac.requests` AS requests
  JOIN
    `httparchive.pages.2022_06_01_*` AS pages
  ON
    pages.url = requests.page
  WHERE
    date = '2022-06-01'
    AND type = 'script'
    AND JSON_EXTRACT(pages.payload, '$._detected_apps.WordPress') IS NOT NULL
    AND CAST(JSON_EXTRACT( pages.payload, '$._renderBlockingJS') AS INT64) > 0
  GROUP BY
    client,
    page,
    host),
  UNNEST([10, 25, 50, 75, 90, 100]) AS percentile
GROUP BY
  percentile,
  client,
  host
ORDER BY
  client,
  percentile,
  host
