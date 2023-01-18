# HTTP Archive query to get % WordPress sites using a block theme.
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

# See query results here: https://github.com/GoogleChromeLabs/wpp-research/pull/32
SELECT
  _TABLE_SUFFIX AS client,
  COUNT(DISTINCT url) AS with_block_theme,
  total_wp_sites,
  COUNT(DISTINCT url) / total_wp_sites AS pct_total,
  # For reference, include number of sites greater than or equal to WP 5.9, since only then block theme support was launched.
  wp_gte_59
FROM
  `httparchive.technologies.2022_11_01_*`
JOIN
  `httparchive.response_bodies.2022_11_01_*`
USING
  (_TABLE_SUFFIX, url)
JOIN (
  SELECT
    _TABLE_SUFFIX,
    COUNT(DISTINCT IF (info = '' OR CAST(REGEXP_EXTRACT(info, r'^(\d+\.\d+)') AS FLOAT64) >= 5.9, url, NULL)) AS wp_gte_59,
    COUNT(DISTINCT url) AS total_wp_sites
  FROM
    `httparchive.technologies.2022_11_01_*`
  WHERE
    app = "WordPress"
  GROUP BY
    _TABLE_SUFFIX )
USING
  (_TABLE_SUFFIX)
WHERE
  app = "WordPress"
  AND (info = '' OR CAST(REGEXP_EXTRACT(info, r'^(\d+\.\d+)') AS FLOAT64) >= 5.9)
  AND body LIKE '%<div class="wp-site-blocks">%'
GROUP BY
  client,
  wp_gte_59,
  total_wp_sites
ORDER BY
  client
