# HTTP Archive query to get scripts blocking in head, counted by plugin.
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

SELECT
  is_root_page,
  JSON_EXTRACT(custom_metrics, '$.cms.wordpress.has_embed_block') AS has_embed_block,
  COUNT(*) AS page_count,
  ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER (), 1) AS percentage_of_total
FROM
  `httparchive.all.pages`,
  UNNEST(technologies) AS technology
WHERE
  date = CAST('2023-12-01' AS DATE)
  AND technology.technology = 'WordPress'
GROUP BY
  has_embed_block,
  is_root_page
ORDER BY percentage_of_total DESC
