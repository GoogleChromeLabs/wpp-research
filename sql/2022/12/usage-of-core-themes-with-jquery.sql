# HTTP Archive query to get usage of WordPress core themes with jQuery in a given month.
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

SELECT
  _TABLE_SUFFIX AS client,
  app,
  COUNT(DISTINCT url) AS sites,
  COUNT(DISTINCT url) / total AS pct_sites
FROM
  `httparchive.technologies.2022_10_01_*`
JOIN (
  SELECT
    _TABLE_SUFFIX,
    COUNT(DISTINCT url) AS total
  FROM
    `httparchive.technologies.2022_10_01_*`
  WHERE
    app = "WordPress"
  GROUP BY
    _TABLE_SUFFIX
)
USING
  (_TABLE_SUFFIX)
WHERE
  app IN (
    "Twenty Eleven",
    "Twenty Twelve",
    "Twenty Thirteen",
    "Twenty Fourteen",
    "Twenty Fifteen",
    "Twenty Sixteen",
    "Twenty Seventeen"
  )
GROUP BY
  client,
  app,
  total
ORDER BY
  client ASC,
  sites DESC
