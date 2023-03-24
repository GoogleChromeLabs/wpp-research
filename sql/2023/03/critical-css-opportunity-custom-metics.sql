# HTTP Archive query to get % of WordPress sites not having Critical CSS implementation.
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

# See query results here: https://github.com/GoogleChromeLabs/wpp-research/pull/38
SELECT
  client,
  total_wp_sites,
  sites_with_critical_css,
  (total_wp_sites - sites_with_critical_css) AS sites_without_critical_css,
  (total_wp_sites - sites_with_critical_css) / total_wp_sites AS opportunity
FROM (
  SELECT
    pages._TABLE_SUFFIX AS client,
    COUNT(pages.url) AS total_wp_sites,
    COUNTIF(
	      CAST(JSON_EXTRACT_SCALAR(JSON_EXTRACT_SCALAR(payload, '$._css'), '$.externalCssInHead') AS INT64) = 0
	      AND CAST(JSON_EXTRACT_SCALAR(JSON_EXTRACT_SCALAR(payload, '$._css'), '$.inlineCssInHead') AS INT64) > 0
	      AND CAST(JSON_EXTRACT_SCALAR(JSON_EXTRACT_SCALAR(payload, '$._css'), '$.externalCssInBody') AS INT64) > 0
	    ) AS sites_with_critical_css
  FROM
    `httparchive.pages.2022_03_01_*` AS pages
  WHERE
    JSON_EXTRACT(pages.payload, '$._detected_apps.WordPress') IS NOT NULL
  GROUP BY
    pages._TABLE_SUFFIX )
