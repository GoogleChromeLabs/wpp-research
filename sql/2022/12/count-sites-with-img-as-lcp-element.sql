# HTTP Archive query to get Performance Lab plugin version distribution in a given month.
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

SELECT 
  lh._TABLE_SUFFIX as client, 
  count(lh.url) as sites 
FROM 
  `httparchive.lighthouse.2022_10_01_*` as lh 
  JOIN `httparchive.technologies.2022_10_01_*` as tech ON tech.url = lh.url 
where 
  lh._TABLE_SUFFIX = tech._TABLE_SUFFIX 
  and app = 'WordPress' 
  and category = 'CMS' 
  and REGEXP_CONTAINS(
    JSON_EXTRACT(
      report, '$.audits.largest-contentful-paint-element.details.items'
    ), 
    '<img'
  ) 
group by 
  lh._TABLE_SUFFIX

