# HTTP Archive query to get % WordPress sites using a block theme.
#
# WPP Research, Copyright 2025 Google LLC
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

# See query results here: https://github.com/GoogleChromeLabs/wpp-research/pull/184
SELECT
  client,
  COUNT(DISTINCT page) AS with_block_theme,
  total_wp_sites,
  COUNT(DISTINCT url) / total_wp_sites AS pct_total,
  # For reference, include number of sites greater than or equal to WP 5.9, since only then block theme support was launched.
  wp_gte_59
FROM
  `httparchive.crawl.pages`,
  UNNEST(technologies) AS technology,
  UNNEST(technology.info) AS version
JOIN
  `httparchive.crawl.requests`
USING
  (date, client, page, is_root_page)
JOIN (
  SELECT
    client,
    COUNT(DISTINCT IF (version = '' OR CAST(REGEXP_EXTRACT(version, r'^(\d+\.\d+)') AS FLOAT64) >= 5.9, page, NULL)) AS wp_gte_59,
    COUNT(DISTINCT page) AS total_wp_sites
  FROM
    `httparchive.crawl.pages`,
    UNNEST(technologies) AS technology,
    UNNEST(technology.info) AS version
  WHERE
    date = '2025-03-01'
    AND is_root_page
    AND technology.technology = "WordPress"
  GROUP BY
    client )
USING
  (client)
WHERE
  date = '2025-03-01'
  AND is_root_page
  AND technology.technology = "WordPress"
  AND (version = '' OR CAST(REGEXP_EXTRACT(version, r'^(\d+\.\d+)') AS FLOAT64) >= 5.9)
  AND response_body LIKE '%<figure class="wp-block-post-featured-image">%'
GROUP BY
  client,
  wp_gte_59,
  total_wp_sites
ORDER BY
  client
