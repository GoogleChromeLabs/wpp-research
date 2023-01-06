# HTTP Archive query to get % of WordPress sites not having Critical CSS implementation.
#
# WPP Research, Copyright 2022 Google LLC
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

# See query results here: https://github.com/GoogleChromeLabs/wpp-research/pull/16
CREATE TEMP FUNCTION
  getRenderBlockingCSSCount(lighthouse STRING)
  RETURNS INT64
  LANGUAGE js AS '''
try {
const report = JSON.parse(lighthouse);
const networkItems = report.audits["network-requests"].details.items
const renderBlockingCss = networkItems.filter(item => item.resourceType == "Stylesheet" && item.priority == "VeryHigh");
return renderBlockingCss.length
} catch (e) {
return -1;
}
''';
SELECT
  client,
  total_wp_sites,
  sites_with_critical_css,
  (total_wp_sites-sites_with_critical_css) AS sites_without_critical_css,
  CONCAT(ROUND((total_wp_sites-sites_with_critical_css)*100/total_wp_sites, 3),' %') AS opportunity
FROM (
  SELECT
    ap.client,
    COUNT(ap.page) AS total_wp_sites,
    COUNTIF( getRenderBlockingCSSCount(lighthouse) = 0
      AND IFNULL( REGEXP_CONTAINS( response_body, '<head.+<style(.+)/style>.+/head>' ), FALSE ) ) AS sites_with_critical_css
  FROM
    `httparchive.all.pages` ap,
    UNNEST(technologies) AS technologies,
    UNNEST(technologies.categories) AS category
  JOIN
    `httparchive.all.requests` ar
  ON
    ap.page = ar.page
    AND ap.date = ar.date
    AND ap.client = ar.client
  WHERE
    ap.is_root_page = TRUE
    AND ar.is_root_page = TRUE
    AND category = "CMS"
    AND technologies.technology = "WordPress"
    AND REGEXP_CONTAINS(JSON_EXTRACT(lighthouse,'$.audits.network-requests.details.items' ), '"priority"')
    AND ap.date = "2022-11-01"
  GROUP BY
    client,
    response_body )