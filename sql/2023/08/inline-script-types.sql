# HTTP Archive query to get counts for types of WordPress inline scripts.
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

# See query results here: https://github.com/GoogleChromeLabs/wpp-research/pull/64
CREATE TEMP FUNCTION GET_INLINE_SCRIPT_TYPES (custom_metrics STRING) RETURNS ARRAY<STRING> LANGUAGE js AS '''

/**
 * Get script types.
 *
 * @param {object} data
 * @param {object} data.cms
 * @param {object} data.cms.wordpress
 * @param {Array<{after_script_size: number, before_script_size: number, extra_script_size: number, translations_script_size: number}>} data.cms.wordpress.scripts
 * @return {Array} Script types.
 */
function getScriptTypes(data) {
  const scriptTypes = [];
  for (const script of data.cms.wordpress.scripts) {
    scriptTypes.push( (new Array( script.after_script_size )).fill( 'after' ) );
    scriptTypes.push( (new Array( script.before_script_size )).fill( 'before' ) );
    scriptTypes.push( (new Array( script.extra_script_size )).fill( 'extra' ) );
    scriptTypes.push( (new Array( script.translations_script_size )).fill( 'translations' ) );
  }
  return scriptTypes;
}

const scriptTypes = [];
try {
  const data = JSON.parse(custom_metrics);
  scriptTypes.push(...getScriptTypes(data));
} catch (e) {}
return scriptTypes;

''';

WITH all_types AS (
  SELECT
    GET_INLINE_SCRIPT_TYPES(custom_metrics) AS script_types,
  FROM
    `httparchive.all.pages`,
    UNNEST(technologies) AS technology
  WHERE
    date = CAST("2023-07-01" AS DATE)
    AND technology.technology = "WordPress"
    AND is_root_page = TRUE
)

SELECT
  script_type,
  COUNT(script_type) as num_scripts,
FROM
  all_types,
  UNNEST(script_types) AS script_type
GROUP BY
  script_type
ORDER BY
  num_scripts DESC
