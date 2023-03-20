# HTTP Archive query to get % of WordPress sites that have loading='lazy' on LCP image.
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

# See query results here: https://github.com/GoogleChromeLabs/wpp-research/pull/49
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

lazy_loaded_lcp AS (
  SELECT
    COUNT(DISTINCT page) AS total
  FROM
    lazypress
  WHERE
    img_lcp
    AND native_lazy
),

total_lcp AS (
  SELECT
    COUNT(DISTINCT page) AS total
  FROM
    lazypress
  WHERE
    img_lcp
)

SELECT
  lazy_loaded_lcp.total AS lazy_loaded_lcp,
  total_lcp.total AS total_lcp,
  lazy_loaded_lcp.total / total_lcp.total AS pct_lazy_loaded
FROM
  lazy_loaded_lcp,
  total_lcp
