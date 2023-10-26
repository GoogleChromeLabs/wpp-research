# HTTP Archive query for how often WordPress pages have bf-cache disabled.
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

# See query results here: https://github.com/GoogleChromeLabs/wpp-research/pull/75

WITH

  wordPressPages AS (
    SELECT
      page as url
    FROM
      `httparchive.all.pages`,
      UNNEST(technologies) AS t
    WHERE
      date = '2023-08-01' AND
      client = 'mobile' AND
      is_root_page AND
      t.technology = 'WordPress'
  ),

  lighthouseAudits AS (
    SELECT
      url,
      JSON_EXTRACT(report, '$.audits.bf-cache.score') AS bfCacheScore
    FROM
      `httparchive.lighthouse.2023_08_01_mobile`
  )

SELECT
  bfCacheScore,
  COUNT(bfCacheScore) as count
FROM
  lighthouseAudits
INNER JOIN
  wordPressPages
USING
  (url)
GROUP BY
  bfCacheScore
ORDER BY
  count DESC
