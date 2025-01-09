# HTTP Archive query to get distribution of number of external scripts and % of deferred scripts.
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

# See query results here: https://github.com/GoogleChromeLabs/wpp-research/pull/29
SELECT
  client,
  percentile,
  APPROX_QUANTILES(CAST(JSON_VALUE(custom_metrics.javascript.script_tags.src) AS INT64), 1000)[OFFSET(percentile * 10)] AS external_scripts,
  APPROX_QUANTILES(CAST(JSON_VALUE(custom_metrics.javascript.script_tags.defer) AS INT64) / CAST(JSON_VALUE(custom_metrics.javascript.script_tags.src) AS INT64), 1000)[OFFSET(percentile * 10)] AS pct_deferred
FROM
  `httparchive.crawl.pages`,
  UNNEST(technologies) AS technology,
  UNNEST([10, 25, 50, 75, 90, 100]) AS percentile
WHERE
  date = '2022-10-01'
  AND is_root_page
  AND technology.technology = 'WordPress'
  AND CAST(JSON_VALUE(custom_metrics.javascript.script_tags.src) AS INT64) > 0
GROUP BY
  client,
  percentile
ORDER BY
  client,
  percentile
