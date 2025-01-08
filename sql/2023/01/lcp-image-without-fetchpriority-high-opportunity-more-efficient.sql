# HTTP Archive query to get % of WordPress sites not having fetchpriority='high' on LCP image.
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

# See query results here: https://github.com/GoogleChromeLabs/wpp-research/pull/27
CREATE TEMP FUNCTION
  getFetchPriorityAttr(performance JSON)
  RETURNS STRING
  LANGUAGE js AS '''
try {
  const data = performance.lcp_elem_stats.attributes;
  const fetchpriorityAttr = data.find(attr => attr["name"] === "fetchpriority")
  return fetchpriorityAttr.value;
} catch (e) {
  return "";
}
''';

WITH
  lcp_stats AS (
  # The `DISTINCT` is necessary to strip duplicate entries due to `UNNEST(technology.info)` which will result in 2 entries for each actual record.
  SELECT DISTINCT
    client,
    page AS url,
    JSON_VALUE(custom_metrics.performance.lcp_elem_stats.nodeName) AS nodeName,
    JSON_VALUE(custom_metrics.performance.lcp_elem_stats.url) AS elementUrl,
    wpVersion,
    getFetchPriorityAttr(custom_metrics.performance) AS fetchpriority,
  FROM
    `httparchive.crawl.pages`,
    UNNEST(technologies) AS technology,
    UNNEST(technology.info) AS wpVersion
  WHERE
    date = '2022-10-01'
    AND is_root_page
    AND technology.technology = 'WordPress'
)

SELECT
  client,
  COUNTIF(fetchpriority = "high"
    AND nodeName = "IMG" ) AS with_fetchpriority_on_lcp,
  COUNTIF(nodeName = "IMG") - COUNTIF(fetchpriority = "high"
    AND nodeName = "IMG" ) AS without_fetchpriority_on_lcp,
  COUNTIF(nodeName = "IMG") AS total_with_lcp,
  COUNT(0) AS total_wp_sites,
  (COUNTIF(nodeName = "IMG") - COUNTIF(fetchpriority = "high"
    AND nodeName = "IMG" )) / COUNTIF(nodeName = "IMG") AS pct_opportunity,
  (COUNTIF(nodeName = "IMG") - COUNTIF(fetchpriority = "high"
    AND nodeName = "IMG" )) / COUNT(0) AS pct_overall_opportunity
FROM
  lcp_stats
WHERE
  wpVersion IS NOT NULL
GROUP BY
  client
ORDER BY
  client
