#standardSQL
CREATE TEMPORARY FUNCTION getDeferredScripts(payload STRING)
RETURNS ARRAY<STRUCT<defer INT64>>
LANGUAGE js AS '''
try {
  var $ = JSON.parse(payload);
  var javascript = JSON.parse($._javascript);
  return [javascript['script_tags']['defer']]
} catch (e) {
  return [];
}
''';

SELECT
  percentile,
  client,
  APPROX_QUANTILES(defer, 1000)[OFFSET(percentile * 10)] AS deferred_scripts_per_page,
FROM (
   SELECT
    tpage._TABLE_SUFFIX AS client,
    tpage.url AS page,
    COUNTIF(CAST(JSON_EXTRACT(JSON_EXTRACT_SCALAR(payload, '$._javascript'), '$.script_tags.defer') AS INT64) > 0) AS defer,
  FROM
        `httparchive.pages.2022_06_01_*` AS tpage
    JOIN
        `httparchive.technologies.2022_06_01_*` AS tech
    ON
        tpage.url = tech.url
  
  LEFT JOIN
    UNNEST(getDeferredScripts(payload)) AS strategy
  GROUP BY
    client,
    page),
  UNNEST([10, 25, 50, 75, 90, 100]) AS percentile
GROUP BY
  percentile,
  client
ORDER BY
  client,
  percentile
