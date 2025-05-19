# HTTP Archive query to get % WordPress sites using Featured Image in block themes.
#
# WPP Research, Copyright 2025 Google LLC
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

# See query results here: https://github.com/GoogleChromeLabs/wpp-research/pull/184

DECLARE
  DATE_TO_QUERY DATE DEFAULT '2025-04-01';

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

WITH wordpress AS (
  SELECT
    client,
    page
  FROM
    `httparchive.crawl.pages`
  WHERE
    date = DATE_TO_QUERY
    AND IS_CMS(technologies, 'WordPress', '')
    AND is_root_page = TRUE
),

featuredImageBlockDetection AS (
  SELECT
    client,
    page,
    REGEXP_CONTAINS(response_body, r'<figure class="wp-block-post-featured-image">') AS has_featured_image_block
  FROM
    `httparchive.crawl.requests`
  WHERE
    date = DATE_TO_QUERY
    AND is_root_page = TRUE
    AND is_main_document
    AND response_body LIKE '%<div class="wp-site-blocks">%'
)

SELECT
  client,
  COUNT(IF(has_featured_image_block, page, NULL)) AS urls,
  COUNT(page) AS total,
  COUNT(IF(has_featured_image_block, page, NULL)) / COUNT(page) AS pct_total
FROM
  wordpress
JOIN
  featuredImageBlockDetection
USING
  (client, page)
GROUP BY
  client
ORDER BY
  client
