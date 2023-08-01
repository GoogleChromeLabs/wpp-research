CREATE TEMP FUNCTION GET_BLOCKING_HEAD_SOURCES (custom_metrics STRING) RETURNS ARRAY<STRING> LANGUAGE js AS '''

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
 * @param {object} data
 * @param {object} data.cms
 * @param {object} data.cms.wordpress
 * @param {Array<{src: string, intended_strategy: string, async: boolean, defer: boolean, in_footer: boolean}>} data.cms.wordpress.scripts
 * @return {Array} Sources.
 */
function getBlockingHeadScriptSources(data) {
  const sources = [];
  for ( const script of data.cms.wordpress.scripts ) {

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
  const data = JSON.parse(custom_metrics);
  sources.push(...getBlockingHeadScriptSources(data));
} catch (e) {}
return sources;
''';

WITH all_sources AS (
  SELECT
    GET_BLOCKING_HEAD_SOURCES(custom_metrics) AS sources,
  FROM
    `httparchive.all.pages`,
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
  source_count >= 500
ORDER BY
  source_count DESC
