# HTTP Archive query to get % of WordPress sites that use defer on any script.
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
  har_pages._TABLE_SUFFIX AS client,
  COUNTIF(CAST(JSON_EXTRACT(JSON_EXTRACT_SCALAR(payload, '$._javascript'), '$.script_tags.async') AS INT64) > 0) AS async,
  COUNTIF(CAST(JSON_EXTRACT(JSON_EXTRACT_SCALAR(payload, '$._javascript'), '$.script_tags.defer') AS INT64) > 0) AS defer,
  COUNTIF(CAST(JSON_EXTRACT(JSON_EXTRACT_SCALAR(payload, '$._javascript'), '$.script_tags.async_and_defer') AS INT64) > 0) AS async_and_defer,
  COUNTIF(CAST(JSON_EXTRACT(JSON_EXTRACT_SCALAR(payload, '$._javascript'), '$.script_tags.type_module') AS INT64) > 0) AS module,
  COUNTIF(CAST(JSON_EXTRACT(JSON_EXTRACT_SCALAR(payload, '$._javascript'), '$.script_tags.nomodule') AS INT64) > 0) AS nomodule,
  COUNTIF(CAST(JSON_EXTRACT(JSON_EXTRACT_SCALAR(payload, '$._javascript'), '$.script_tags.async') AS INT64) > 0) / COUNT(0) AS async_pct,
  COUNTIF(CAST(JSON_EXTRACT(JSON_EXTRACT_SCALAR(payload, '$._javascript'), '$.script_tags.defer') AS INT64) > 0) / COUNT(0) AS defer_pct,
  COUNTIF(CAST(JSON_EXTRACT(JSON_EXTRACT_SCALAR(payload, '$._javascript'), '$.script_tags.async_and_defer') AS INT64) > 0) / COUNT(0) AS async_and_defer_pct,
  COUNTIF(CAST(JSON_EXTRACT(JSON_EXTRACT_SCALAR(payload, '$._javascript'), '$.script_tags.type_module') AS INT64) > 0) / COUNT(0) AS module_pct,
  COUNTIF(CAST(JSON_EXTRACT(JSON_EXTRACT_SCALAR(payload, '$._javascript'), '$.script_tags.nomodule') AS INT64) > 0) / COUNT(0) AS nomodule_pct,
  COUNTIF(CAST(JSON_EXTRACT(JSON_EXTRACT_SCALAR(payload, '$._javascript'), '$.script_tags.async') AS INT64) = 0 AND CAST(JSON_EXTRACT(JSON_EXTRACT_SCALAR(payload, '$._javascript'), '$.script_tags.defer') AS INT64) = 0) AS neither,
  COUNTIF(CAST(JSON_EXTRACT(JSON_EXTRACT_SCALAR(payload, '$._javascript'), '$.script_tags.async') AS INT64) = 0 AND CAST(JSON_EXTRACT(JSON_EXTRACT_SCALAR(payload, '$._javascript'), '$.script_tags.defer') AS INT64) = 0) / COUNT(0) AS neither_pct
FROM
  `httparchive.pages.2022_06_01_*` as har_pages
      JOIN
        `httparchive.technologies.2022_10_01_*` AS har_tech
    ON
        har_tech.url = har_pages.url
    WHERE
        har_pages._TABLE_SUFFIX = har_tech._TABLE_SUFFIX
    AND
        app = 'WordPress'
    AND
        category = 'CMS'
GROUP BY
  client
