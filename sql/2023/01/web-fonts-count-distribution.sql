# HTTP Archive query to get distribution of number of web fonts used per site only for WordPress sites that use at least 1 web font for a given month.
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

# See query results here: https://github.com/GoogleChromeLabs/wpp-research/pull/34
SELECT
  reqFont AS num_webfonts,
  sp._TABLE_SUFFIX AS client,
  COUNT( DISTINCT(sp.url) ) AS sites,
  COUNT( DISTINCT(sp.url) )/total AS pct_sites
FROM
  `httparchive.summary_pages.2022_12_01_*` AS sp
JOIN
  `httparchive.technologies.2022_12_01_*` AS th
ON
  th.url = sp.url
  AND sp._TABLE_SUFFIX = th._TABLE_SUFFIX
JOIN (
  SELECT
    _TABLE_SUFFIX,
    COUNT(DISTINCT url) AS total
  FROM
    `httparchive.technologies.2022_10_01_*`
  WHERE
    app = "WordPress"
    AND category = 'CMS'
  GROUP BY
    _TABLE_SUFFIX ) th2
ON
  sp._TABLE_SUFFIX = th2._TABLE_SUFFIX
WHERE
  reqFont IS NOT NULL
  AND reqFont > 0
  AND bytesFont IS NOT NULL
  AND th.app = 'WordPress'
  AND th.category = 'CMS'
GROUP BY
  sp._TABLE_SUFFIX,
  reqFont,
  total
ORDER BY
  num_webfonts,
  client
