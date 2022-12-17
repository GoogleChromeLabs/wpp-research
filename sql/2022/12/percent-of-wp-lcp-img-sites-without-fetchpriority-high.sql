# HTTP Archive query to get Performance Lab plugin version distribution in a given month.
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

SELECT 
  lh._TABLE_SUFFIX AS client, 
  ( total-COUNT(lh.url) ) AS `wp_sites_without_fetchpriority_on_lcp_img`,
  total as `total_wp_sites_with_img_as_lcp`,
   ROUND( (total-COUNT(lh.url))*100/total, 3 ) AS `opportunity_score_in_percent`
FROM 
  `httparchive.lighthouse.2022_10_01_*` AS lh
JOIN
  `httparchive.technologies.2022_10_01_*` AS tech
ON
  tech.url = lh.url
JOIN
(
  SELECT 
    lh._TABLE_SUFFIX, 
    COUNT(lh.url) as total 
  FROM 
    `httparchive.lighthouse.2022_10_01_*` as lh 
  JOIN 
    `httparchive.technologies.2022_10_01_*` as tech 
  ON 
    tech.url = lh.url 
  WHERE 
    lh._TABLE_SUFFIX = tech._TABLE_SUFFIX 
  AND 
    app = 'WordPress' 
  AND 
    category = 'CMS' 
  AND 
    REGEXP_CONTAINS(
      JSON_EXTRACT(
        report, '$.audits.largest-contentful-paint-element.details.items'
      ), 
      '<img'
    ) 
  GROUP BY 
    lh._TABLE_SUFFIX
) a
ON
  a._TABLE_SUFFIX = lh._TABLE_SUFFIX
WHERE 
  lh._TABLE_SUFFIX = tech._TABLE_SUFFIX 
AND 
  app = 'WordPress' 
AND
  category = 'CMS' 
AND
  REGEXP_CONTAINS(
    JSON_EXTRACT(
      report, '$.audits.largest-contentful-paint-element.details.items'
    ), 
    '<img.*fetchpriority.{3}high'
  ) 
GROUP BY 
  lh._TABLE_SUFFIX,
  total
