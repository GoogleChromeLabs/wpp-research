CREATE TEMP FUNCTION getAttr(attributes STRING, attribute STRING) RETURNS STRING LANGUAGE js AS '''
  try {
    const data = JSON.parse(attributes);
    const attr = data.find(attr => attr["name"] === attribute)
    return attr.value
  } catch (e) {
    return null;
  }
''';

WITH lazypress AS (
  SELECT
    page,
    getAttr(JSON_EXTRACT(payload, '$._performance.lcp_elem_stats.attributes'), 'loading') = 'lazy' AS native_lazy,
    getAttr(JSON_EXTRACT(payload, '$._performance.lcp_elem_stats.attributes'), 'class') AS class,
    JSON_EXTRACT_SCALAR(payload, '$._performance.lcp_elem_stats.nodeName') = 'IMG' AS img_lcp
  FROM
    `httparchive.all.pages`,
    UNNEST(technologies) AS t
  WHERE
    date = '2023-02-01' AND
    client = 'desktop' AND 
    is_root_page AND
    t.technology = 'WordPress'
),

totals AS (
  SELECT
    COUNT(DISTINCT page) AS total
  FROM
    lazypress
  WHERE
    native_lazy
),

classes AS (
  SELECT
    class,
    ARRAY_AGG(DISTINCT page LIMIT 3) sample_pages,
    COUNT(0) AS freq,
    COUNT(DISTINCT page) AS pages,
    SUM(COUNT(0)) OVER () AS total,
    COUNT(0) / SUM(COUNT(0)) OVER () AS pct
  FROM
    lazypress,
    UNNEST(REGEXP_EXTRACT_ALL(class, r'([^\s]+)')) AS class
  WHERE
    native_lazy
  GROUP BY
    class
)


SELECT
  class,
  freq,
  classes.total,
  pct,
  pages,
  totals.total AS total_pages,
  pages / totals.total AS pct_pages,
  sample_pages[OFFSET(0)] AS sample_page_1,
  sample_pages[OFFSET(1)] AS sample_page_2,
  sample_pages[OFFSET(2)] AS sample_page_3
FROM
  classes,
  totals
ORDER BY
  pages DESC
LIMIT
  50
