# HTTP Archive query to get the usage of different WordPress template types on the home page.
#
# WPP Research, Copyright 2024 Google LLC
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
#
# See https://github.com/GoogleChromeLabs/wpp-research/pull/150

DECLARE DATE_TO_QUERY DATE DEFAULT '2024-07-01';

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

CREATE TEMPORARY FUNCTION GET_CONTENT_TYPE(cms JSON) RETURNS STRUCT<template STRING, postType STRING, taxonomy STRING> AS (
  STRUCT(
    CAST(JSON_VALUE(cms.wordpress.content_type.template) AS STRING) AS template,
    CAST(JSON_VALUE(cms.wordpress.content_type.post_type) AS STRING) AS postType,
    CAST(JSON_VALUE(cms.wordpress.content_type.taxonomy) AS STRING) AS taxonomy
  )
);

WITH contentTypes AS (
  SELECT
    date,
    "WordPress" AS cms,
    IF(client = "mobile", "phone", "desktop") AS device,
    page AS url,
    GET_CONTENT_TYPE(custom_metrics.cms) AS contentType
  FROM
    `httparchive.crawl.pages`
  WHERE
    date = DATE_TO_QUERY
    AND IS_CMS(technologies, "WordPress", "")
    AND is_root_page = TRUE
)

SELECT
  date,
  cms,
  device,
  contentType.template AS contentTypeSummary,
  COUNT(url) AS urls
FROM
  contentTypes
GROUP BY
  date,
  cms,
  device,
  contentType.template
ORDER BY
  date ASC,
  cms ASC,
  device ASC,
  urls DESC
