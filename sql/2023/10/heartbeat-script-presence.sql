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

CREATE TEMP FUNCTION HAS_SCRIPT(handle STRING, cms JSON) RETURNS BOOL LANGUAGE js AS
# language=javascript
'''

/**
 * Get whether a script is present.
 *
 * @param {string} handle
 * @param {object} cms
 * @param {object} cms.wordpress
 * @param {Array<{handle: string}>} cms.wordpress.scripts
 * @return {boolean}
 */
function hasScript(handle, cms) {
  for (const script of cms.wordpress.scripts) {
    if (script.handle === handle) {
      return true;
    }
  }
  return false;
}

try {
  return hasScript(handle, cms);
} catch (e) {}
return false;

''';

WITH script_presence AS (
  SELECT
    HAS_SCRIPT("heartbeat", custom_metrics.cms) AS has_script,
  FROM
    `httparchive.crawl.pages`,
    UNNEST(technologies) AS technology
  WHERE
    date = CAST("2023-08-01" AS DATE) AND
    client = "mobile" AND
    technology.technology = "WordPress" AND
    is_root_page = TRUE
)

SELECT
  has_script,
  COUNT(has_script) AS count,
FROM
  script_presence
GROUP BY
  has_script
