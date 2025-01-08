# HTTP Archive query to get counts for WordPress theme/plugin script placements (whether blocking/async/defer in head/footer).
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

# See query results here: https://github.com/GoogleChromeLabs/wpp-research/pull/63
CREATE TEMP FUNCTION GET_SCRIPT_PLACEMENTS (cms JSON) RETURNS ARRAY<STRING> LANGUAGE js AS '''

const sourceRegExp = new RegExp('/wp-content/(plugin|theme)s/([^/]+)/');

/**
 * Get script placements.
 *
 * @param {object} cms
 * @param {object} cms.wordpress
 * @param {Array<{src: string, intended_strategy: string, async: boolean, defer: boolean, in_footer: boolean}>} cms.wordpress.scripts
 * @return {Array} Placements.
 */
function getScriptPlacements(cms) {
  const placements = [];
  for (const script of cms.wordpress.scripts) {
    if (!sourceRegExp.test(script.src)) {
      continue;
    }

    const position = script.in_footer ? 'footer' : 'head';

    if (script.async) {
      placements.push(`async_in_${position}`);
    } else if (script.defer) {
      placements.push(`defer_in_${position}`);
    } else {
      placements.push(`blocking_in_${position}`);
    }
  }
  return placements;
}

const placements = [];
try {
  placements.push(...getScriptPlacements(cms));
} catch (e) {}
return placements;
''';

WITH all_placements AS (
  SELECT
    GET_SCRIPT_PLACEMENTS(custom_metrics.cms) AS placements,
  FROM
    `httparchive.crawl.pages`,
    UNNEST(technologies) AS technology
  WHERE
    date = CAST("2023-07-01" AS DATE)
    AND technology.technology = "WordPress"
    AND is_root_page = TRUE
)

SELECT
  placement,
  COUNT(placement) as num_scripts,
FROM
  all_placements,
  UNNEST(placements) AS placement
GROUP BY
  placement
ORDER BY
  num_scripts DESC
