# HTTP Archive query to get counts of theme/plugin scripts blocking in head.
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
CREATE TEMP FUNCTION GET_BLOCKING_HEAD_SOURCES (cms JSON) RETURNS ARRAY<STRING> LANGUAGE js AS '''

const sourceRegExp = new RegExp( '/wp-content/(?<type>plugin|theme)s/(?<slug>[^/]+)/(?<path>[^\?]+)' );

/**
 * Get slug of extension prefixed by theme/plugin from URL.
 *
 * @param {string} src Script URL.
 * @return {?{type: "plugin"|"theme", slug: string, path: string}} Source info if matched.
 */
function getSource(src) {
  const matches = src.match( sourceRegExp );
  if (matches) {
    return matches.groups;
  }
  return null;
}

/**
 * Get script sources for scripts in the head which are blocking (not async nor defer).
 *
 * @param {object} cms
 * @param {object} cms.wordpress
 * @param {Array<{src: string, intended_strategy: string, async: boolean, defer: boolean, in_footer: boolean}>} cms.wordpress.scripts
 * @return {Array} Sources.
 */
function getBlockingHeadScriptSources(cms) {
  const sources = [];
  for ( const script of cms.wordpress.scripts ) {

    const source = getSource(script.src);
    if (!source) {
      continue;
    }

    // Blocking script in head only.
    if (!script.in_footer && !script.async && !script.defer) {
      sources.push( [ source.type, source.slug ].join( ':' ) );
      sources.push( [ source.type, source.slug, source.path ].join( ':' ) );
    }
  }
  return sources;
}

const sources = [];
try {
  sources.push(...getBlockingHeadScriptSources(cms));
} catch (e) {}
return sources;
''';

WITH all_sources AS (
  SELECT
    GET_BLOCKING_HEAD_SOURCES(custom_metrics.cms) AS sources,
  FROM
    `httparchive.crawl.pages`,
    UNNEST(technologies) AS technology
  WHERE
    date = CAST("2023-07-01" AS DATE)
    AND technology.technology = "WordPress"
    AND is_root_page = TRUE
)

SELECT
  source,
  COUNT(source) AS source_count
FROM
  all_sources,
  UNNEST(sources) AS source
GROUP BY
  source
HAVING
  source_count >= 10000
ORDER BY
  source_count DESC
