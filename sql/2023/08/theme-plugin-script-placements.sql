CREATE TEMP FUNCTION GET_SCRIPT_PLACEMENTS (custom_metrics STRING) RETURNS ARRAY<STRING> LANGUAGE js AS '''

const sourceRegExp = new RegExp('/wp-content/(plugin|theme)s/([^/]+)/');

/**
 * Get script placements.
 *
 * @param {object} data
 * @param {object} data.cms
 * @param {object} data.cms.wordpress
 * @param {Array<{src: string, intended_strategy: string, async: boolean, defer: boolean, in_footer: boolean}>} data.cms.wordpress.scripts
 * @return {Array} Placements.
 */
function getScriptPlacements(data) {
  const placements = [];
  for (const script of data.cms.wordpress.scripts) {
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
  const data = JSON.parse(custom_metrics);
  placements.push(...getScriptPlacements(data));
} catch (e) {}
return placements;
''';

WITH all_placements AS (
  SELECT
    GET_SCRIPT_PLACEMENTS(custom_metrics) AS placements,
  FROM
    `httparchive.all.pages` /*TABLESAMPLE SYSTEM (1 PERCENT)*/,
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
