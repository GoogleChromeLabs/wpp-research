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

# See query results here: https://github.com/GoogleChromeLabs/wpp-research/pull/13
SELECT
  client,
  technology.technology AS app,
  COUNT(DISTINCT page) AS sites,
  COUNT(DISTINCT page) / total AS pct_sites
FROM
  `httparchive.crawl.pages`,
  UNNEST(technologies) AS technology
JOIN (
  SELECT
    client,
    COUNT(DISTINCT page) AS total
  FROM
    `httparchive.crawl.pages`,
    UNNEST(technologies) AS technology
  WHERE
    date = '2022-10-01'
    AND is_root_page
    AND technology.technology = "WordPress"
  GROUP BY
    client
)
USING
  (client)
WHERE
  date = '2022-10-01'
  AND is_root_page
  AND technology.technology IN (
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
