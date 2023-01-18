# HTTP Archive query to get % of WordPress sites that use various font-display strategy for any web fonts.
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
CREATE TEMPORARY FUNCTION
  getFontDisplay(json STRING)
  RETURNS ARRAY < STRING >
  LANGUAGE js OPTIONS(library = "gs://httparchive/lib/css-utils.js") AS '''
try {
  const ast = JSON.parse(json);
  const result = [];
  walkDeclarations(ast, decl => {
    result.push(decl.value);
  }, {
    properties: 'font-display',
    rules: r => r.type === 'font-face'
  });
  return result;
} catch (e) {
  return [];
}
''';

SELECT
  client,
  font_display,
  pages,
  total,
  pages / total AS pct
FROM (
  SELECT
    th._TABLE_SUFFIX AS client,
    font_display,
    COUNT(DISTINCT page) AS pages
  FROM
    `httparchive.experimental_parsed_css.2022_12_01_*` AS parsed_css,
    UNNEST(getFontDisplay(css)) AS font_display
  JOIN
    `httparchive.technologies.2022_12_01_*` AS th
  ON
    th.url = parsed_css.page
    AND parsed_css.is_root_page = TRUE
    AND parsed_css._TABLE_SUFFIX = th._TABLE_SUFFIX
  WHERE
    th.app = 'WordPress'
    AND th.category = 'CMS'
  GROUP BY
    client,
    font_display )
JOIN (
  SELECT
    _TABLE_SUFFIX AS client,
    COUNT(DISTINCT url) AS total
  FROM
    `httparchive.technologies.2022_12_01_*`
  WHERE
    app = 'WordPress'
    AND category = 'CMS'
  GROUP BY
    client)
USING
  (client)
ORDER BY
  client,
  pct DESC
