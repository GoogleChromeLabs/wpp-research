# HTTP Archive query to get % of WordPress sites using atleast one web font.
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
  sp._TABLE_SUFFIX AS client,
  COUNTIF(reqFont > 0) AS site_with_web_fonts,
  COUNT(distinct(th.url)) AS total,
  COUNTIF(reqFont > 0) / COUNT(distinct(th.url)) AS pct_site_with_web_fonts
FROM
  `httparchive.summary_pages.2022_12_01_*` AS sp
JOIN
  `httparchive.technologies.2022_12_01_*` AS th
ON
  th.url = sp.url
  AND sp._TABLE_SUFFIX = th._TABLE_SUFFIX
WHERE
  reqFont IS NOT NULL
  AND bytesFont IS NOT NULL
  AND th.app = 'WordPress'
  AND th.category = 'CMS'
GROUP BY
  sp._TABLE_SUFFIX
