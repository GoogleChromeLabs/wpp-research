# HTTP Archive query for the frequency of reasons for which WordPress pages have bf-cache disabled.
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

CREATE TEMP FUNCTION getItemReasons(items STRING) RETURNS ARRAY<STRING> LANGUAGE js AS
# language=javascript
'''
  try {
    if ( ! items ) {
      return [];
    }
    const parsedItems = JSON.parse(items);
    const reasons = [];
    for ( const item of parsedItems ) {
      reasons.push( item.reason );
    }
    return reasons;
  } catch (e) {
    return [];
  }
''';

WITH

   wordPressPages AS (
    SELECT
      page as url,
      getItemReasons( JSON_EXTRACT(lighthouse, '$.audits.bf-cache.details.items')) AS reasons
    FROM
      `httparchive.all.pages`,
      UNNEST(technologies) AS t
    WHERE
      date = '2023-08-01' AND
      client = 'mobile' AND
      is_root_page AND
      t.technology = 'WordPress'
  )

SELECT
  reason,
  COUNT(url) as count
FROM
  wordPressPages,
  UNNEST(reasons) AS reason
GROUP BY
  reason
ORDER BY
  count DESC
