# HTTP Archive query to get counts of content-types used for WordPress pages.
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

# See query results here: https://github.com/GoogleChromeLabs/wpp-research/pull/74
WITH pages AS (
    SELECT
      page AS url
    FROM
      `httparchive.all.pages`,
      UNNEST(technologies) AS t
    WHERE
      date = '2023-08-01' AND
      is_root_page AND
      client = 'mobile' AND
      t.technology = 'WordPress'
  ),

  # h/t https://discuss.httparchive.org/t/help-finding-list-of-home-pages-with-specific-http-response-header/2567/2
  requests AS (
    SELECT
      url,
      REGEXP_REPLACE( resp_headers.value, ' *;.*$', '' ) AS content_type
    FROM
      `httparchive.all.requests`,
      UNNEST(response_headers) as resp_headers
    WHERE
      date = "2023-08-01" AND
      is_root_page AND
      client = 'mobile' AND
      lower(resp_headers.name) = 'content-type' AND
      is_main_document AND
      root_page = url
  )

SELECT
  content_type,
  COUNT(content_type) AS count
FROM
  requests
INNER JOIN
  pages
USING
  (url)
GROUP BY
  content_type
ORDER BY
  count DESC
