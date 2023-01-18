# HTTP Archive query to get distribution of number of web fonts used per site only for WordPress sites that use at least 1 web font.
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

# See query results here: https://github.com/GoogleChromeLabs/wpp-research/pull/34
SELECT
  sp._TABLE_SUFFIX AS client,
  percentile,
  APPROX_QUANTILES(reqFont, 1000)[OFFSET(percentile * 10)] AS num_web_fonts
FROM
  `httparchive.summary_pages.2022_12_01_*` AS sp,
  UNNEST([10, 25, 50, 75, 90, 95, 99, 100]) AS percentile
JOIN
  `httparchive.technologies.2022_12_01_*` AS th
ON
  th.url = sp.url
  AND sp._TABLE_SUFFIX = th._TABLE_SUFFIX
WHERE
  reqFont IS NOT NULL
  AND bytesFont IS NOT NULL
  AND th.app = 'WordPress'
  AND th.category = 'CMS'
GROUP BY
  client,
  percentile
ORDER BY
  client,
  percentile
