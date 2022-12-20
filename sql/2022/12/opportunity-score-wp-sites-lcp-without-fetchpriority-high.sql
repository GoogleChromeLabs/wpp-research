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
SELECT
  lh._TABLE_SUFFIX AS `Client`,
  COUNT(DISTINCT lh.url) AS `With_fetchpriority_on_LCP`, 
  (total-COUNT(DISTINCT lh.url)) AS `Without_fetchpriority_on_LCP`,
  total AS `Total_with_LCP`,
  totalwp AS `Total_WP_sites`,
  CONCAT(ROUND((total-COUNT(DISTINCT lh.url))*100/total, 3),' %') AS `Opportunity_Score`,
  CONCAT(ROUND((total-COUNT(DISTINCT lh.url))*100/totalwp, 3),' %') AS `Overall_Opportunity_Score`
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
    COUNT(DISTINCT lh.url) AS total 
  FROM
    `httparchive.lighthouse.2022_10_01_*` AS lh 
  JOIN
    `httparchive.technologies.2022_10_01_*` AS tech 
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
) tlcp
ON
  tlcp._TABLE_SUFFIX = lh._TABLE_SUFFIX
JOIN
(
  SELECT
    _TABLE_SUFFIX, 
    COUNT(DISTINCT url) AS totalwp 
  FROM
    `httparchive.technologies.2022_10_01_*`
  WHERE
    app = 'WordPress' 
  AND
    category = 'CMS'
  GROUP BY
    _TABLE_SUFFIX
) twp
ON
  twp._TABLE_SUFFIX = lh._TABLE_SUFFIX
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
  total,
  totalwp
ORDER BY
  Client ASC