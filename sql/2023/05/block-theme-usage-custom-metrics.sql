# HTTP Archive query to get % WordPress sites using a block theme via custom metrics.
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

# See query results here: https://github.com/GoogleChromeLabs/wpp-research/pull/53
SELECT
  client,
  COUNT(DISTINCT page) AS total_wp_sites,
  COUNT(DISTINCT IF(CAST(JSON_EXTRACT_SCALAR(custom_metrics, "$.cms.wordpress.block_theme") AS BOOL), page, null)) AS with_block_theme,
  COUNT(DISTINCT IF(CAST(JSON_EXTRACT_SCALAR(custom_metrics, "$.cms.wordpress.block_theme") AS BOOL), page, null)) / COUNT(DISTINCT page) AS pct_total
FROM
  `httparchive.all.pages`,
  UNNEST(technologies) AS technology
WHERE
  date = "2023-04-01"
  AND technology.technology = "WordPress"
  AND is_root_page = true
GROUP BY
  client
ORDER BY
  client
