# HTTP Archive query to get the number of WordPress sites on version >= 5.5 that use any images and lazy-load them.
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

# See query results here: https://github.com/GoogleChromeLabs/wpp-research/pull/51
CREATE TEMPORARY FUNCTION get_image_loading_attributes(images JSON)
RETURNS ARRAY<STRUCT<loading STRING>>
LANGUAGE js AS '''
var result = [];
try {
  for (const img of images){
    result.push({
      loading: img.loading
    })
  }
} catch (e) {}
return result;
''';

SELECT
  client,
  COUNT(DISTINCT page) AS urls_with_images,
  COUNT(DISTINCT IF (loading = 'lazy', page, NULL)) AS urls_with_loading_lazy,
  COUNT(DISTINCT IF (loading = 'lazy', page, NULL)) / COUNT(DISTINCT page) AS pct_with_loading_lazy
FROM
  `httparchive.crawl.pages`,
  UNNEST(technologies) AS technology,
  UNNEST(get_image_loading_attributes(custom_metrics.other.Images)) AS image_loading
WHERE
  date = '2023-03-01'
  AND is_root_page
  AND technology.technology = 'WordPress'
  AND EXISTS(
    SELECT
      version
    FROM
      UNNEST(technology.info) AS version
    WHERE
      CAST(REGEXP_EXTRACT(version, r'^(\d+\.\d+)') AS FLOAT64) >= 5.5
  )
GROUP BY
  client
ORDER BY
  client ASC
