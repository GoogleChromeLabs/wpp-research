# HTTP Archive query to determine frequency of the same image being the LCP element between desktop and mobile on WordPress pages.
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

# See query results here: https://github.com/GoogleChromeLabs/wpp-research/pull/73

# h/t https://github.com/GoogleChromeLabs/wpp-research/blob/0b6c2ca8ddc2c68d4eddcb3d4e069c5e75a2ca16/sql/2023/03/top-lazy-lcp-class-names.sql#L18-L26
CREATE TEMP FUNCTION getAttr(performance JSON, attribute STRING) RETURNS STRING LANGUAGE js AS '''
  try {
    const data = performance.lcp_elem_stats.attributes;
    const attr = data.find(attr => attr["name"] === attribute)
    return attr.value
  } catch (e) {
    return null;
  }
''';

# h/t https://colab.research.google.com/drive/1lbTFTy1IoifpqkynKuualVjrLVSj1i0r#scrollTo=wszyW57bElAb&line=47&uniqifier=1
CREATE TEMPORARY FUNCTION IS_CMS(technologies ARRAY<STRUCT<technology STRING, categories ARRAY<STRING>, info ARRAY<STRING>>>, cms STRING, version STRING) RETURNS BOOL AS (
  EXISTS(
    SELECT * FROM UNNEST(technologies) AS technology, UNNEST(technology.info) AS info
    WHERE technology.technology = cms
      AND (
          version = ""
        OR ENDS_WITH(version, ".x") AND (STARTS_WITH(info, RTRIM(version, "x")) OR info = RTRIM(version, ".x"))
        OR info = version
      )
  )
);

WITH all_device_wordpress_lcp AS (
    SELECT
      page,
      IF(client = "mobile", "phone", "desktop") AS device,
      IF(getAttr(custom_metrics.performance, 'fetchpriority') = 'high', true, false) AS has_fetchpriority,
      JSON_VALUE(custom_metrics.performance.lcp_elem_stats.nodeName) AS lcp_element,
    FROM
      `httparchive.crawl.pages`
    WHERE
      date = '2023-08-01' AND
      is_root_page AND
      IS_CMS(technologies, "WordPress", "6.3.x")
  ),

  matched_device_wordpress_lcp AS (
    SELECT
      IF(desktop_wordpress_lcp.has_fetchpriority = mobile_wordpress_lcp.has_fetchpriority, true, false) AS lcp_images_both_have_fetchpriority
    FROM
      ( SELECT * FROM all_device_wordpress_lcp WHERE device = 'desktop' AND lcp_element = 'IMG' ) AS desktop_wordpress_lcp
    INNER JOIN
      ( SELECT * FROM all_device_wordpress_lcp WHERE device = 'phone' AND lcp_element = 'IMG' ) AS mobile_wordpress_lcp
    ON
      desktop_wordpress_lcp.page = mobile_wordpress_lcp.page
    WHERE
      desktop_wordpress_lcp.has_fetchpriority OR mobile_wordpress_lcp.has_fetchpriority
  )

SELECT
  lcp_images_both_have_fetchpriority,
  COUNT( lcp_images_both_have_fetchpriority ) as count
FROM
  matched_device_wordpress_lcp
GROUP BY
  lcp_images_both_have_fetchpriority
