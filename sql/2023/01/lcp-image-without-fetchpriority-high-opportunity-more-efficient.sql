# HTTP Archive query to get % of WordPress sites not having fetchpriority='high' on LCP image.
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

# See query results here: https://github.com/GoogleChromeLabs/wpp-research/pull/27
CREATE TEMP FUNCTION
  getFetchPriorityAttr(attributes STRING)
  RETURNS STRING
  LANGUAGE js AS '''
try {
  const data = JSON.parse(attributes);
  const fetchpriorityAttr = data.find(attr => attr["name"] === "fetchpriority")
  return fetchpriorityAttr.value;
} catch (e) {
  return "";
}
''';

WITH
  lcp_stats AS (
  SELECT
    _TABLE_SUFFIX AS client,
    url,
    JSON_EXTRACT_SCALAR(payload, '$._performance.lcp_elem_stats.nodeName') AS nodeName,
    JSON_EXTRACT_SCALAR(payload, '$._performance.lcp_elem_stats.url') AS elementUrl,
    JSON_EXTRACT(payload, '$._performance.lcp_elem_stats.attributes') AS attributes,
    JSON_EXTRACT(payload, '$._detected_apps.WordPress') AS wpVersion,
    getFetchPriorityAttr(JSON_EXTRACT(payload, '$._performance.lcp_elem_stats.attributes')) AS fetchpriority,
  FROM
    `httparchive.pages.2022_10_01_*`
)

SELECT
  client,
  COUNTIF(fetchpriority = "high"
    AND nodeName = "IMG" ) AS `with_fetchpriority_on_lcp`,
  COUNTIF(nodeName = "IMG") - COUNTIF(fetchpriority = "high"
    AND nodeName = "IMG" ) AS `without_fetchpriority_on_lcp`,
  COUNTIF(nodeName = "IMG") AS `total_with_lcp`,
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
