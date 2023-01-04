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

# See query results here: https://github.com/GoogleChromeLabs/wpp-research/pull/15
CREATE TEMP FUNCTION getFetchPriorityAttr(attributes STRING) RETURNS STRING LANGUAGE js AS '''
try {
const data = JSON.parse(attributes);
const fetchpriorityAttr = data.find(attr => attr["name"] === "fetchpriority")
return fetchpriorityAttr.value
} catch (e) {
return "";
}
''';

SELECT
  client,
  with_fetchpriority_on_lcp,
  (total_with_lcp-with_fetchpriority_on_lcp) AS without_fetchpriority_on_lcp,
  total_with_lcp,
  total_wp_sites,
  CONCAT(ROUND((total_with_lcp-with_fetchpriority_on_lcp)*100/total_with_lcp, 3),' %') AS opportunity,
  CONCAT(ROUND((total_with_lcp-with_fetchpriority_on_lcp)*100/total_wp_sites, 3),' %') AS overall_opportunity
FROM (
  SELECT 
  client,
  COUNTIF( 
    getFetchPriorityAttr(JSON_EXTRACT(payload, '$._performance.lcp_elem_stats.attributes')) = "high"
    AND
    JSON_EXTRACT_SCALAR(payload, '$._performance.lcp_elem_stats.nodeName') = "IMG"
  ) AS `with_fetchpriority_on_lcp`,
  COUNTIF(JSON_EXTRACT_SCALAR(payload, '$._performance.lcp_elem_stats.nodeName') = "IMG") AS `total_with_lcp`,
  COUNT(page) AS `total_wp_sites`,
  FROM `httparchive.all.pages`, 
      UNNEST(technologies) as technologies,
      UNNEST(technologies.categories) as category  
  WHERE 
    is_root_page = TRUE
  AND 
    category = "CMS"
  AND
    technologies.technology = "WordPress"
  AND
  date IN (
      "2022-11-01"
    )
  GROUP BY
    client
  ORDER BY
    client ASC
)
