# HTTP Archive query to get active install counts for Performance Lab plugins
# (with or without the Performance Lab plugin).
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
# See https://github.com/GoogleChromeLabs/wpp-research/pull/146

DECLARE
  DATE_TO_QUERY DATE DEFAULT '2024-07-01';

CREATE TEMPORARY FUNCTION HAS_TECHNOLOGY(technologies ARRAY<STRUCT<technology STRING, categories ARRAY<STRING>, info ARRAY<STRING>>>, technologyToFind STRING) RETURNS BOOL AS (
  EXISTS(
    SELECT
      *
    FROM
      UNNEST(technologies) AS technology
    WHERE technology.technology = technologyToFind
  )
);

CREATE TEMPORARY FUNCTION GET_GENERATOR_CONTENTS(other JSON) RETURNS ARRAY<STRING> AS (
  ARRAY(
    SELECT
      JSON_VALUE(metaNode.content) AS content
    FROM
      UNNEST(JSON_QUERY_ARRAY(other.almanac["meta-nodes"].nodes)) AS metaNode
    WHERE
      JSON_VALUE(metaNode.name) = 'generator'
  )
);

CREATE TEMPORARY FUNCTION HAS_PERFORMANCE_LAB(contents ARRAY<STRING>) RETURNS BOOL AS (
  EXISTS(
    SELECT
      *
    FROM
      UNNEST(contents) AS content
    WHERE
      STARTS_WITH(content, 'performance-lab ')
  )
);

CREATE TEMPORARY FUNCTION EXTRACT_PL_PLUGINS_FROM_GENERATOR_CONTENTS(contents ARRAY<STRING>) RETURNS ARRAY<STRING> AS (
  ARRAY(
    SELECT
      REGEXP_EXTRACT(content, '^([a-z0-9-]+) ') AS slug
    FROM
      UNNEST(contents) as content
    WHERE
      REGEXP_EXTRACT(content, '^([a-z0-9-]+) ') IN UNNEST([
        'auto-sizes',
        'dominant-color-images',
        'embed-optimizer',
        'image-prioritizer',
        'optimization-detective',
        'performant-translations', # Developed in separate repository.
        'speculation-rules',
        'web-worker-offloading',
        'webp-uploads'
      ])
  )
);

WITH urlsWithPerformanceLabPlugins AS (
  SELECT
    client,
    page,
    HAS_PERFORMANCE_LAB(GET_GENERATOR_CONTENTS(custom_metrics.other)) AS has_pl,
    EXTRACT_PL_PLUGINS_FROM_GENERATOR_CONTENTS(GET_GENERATOR_CONTENTS(custom_metrics.other)) AS plugins
  FROM
    `httparchive.crawl.pages`
  WHERE
    date = DATE_TO_QUERY
    AND HAS_TECHNOLOGY(technologies, 'WordPress')
    AND is_root_page = TRUE
    AND ARRAY_LENGTH(EXTRACT_PL_PLUGINS_FROM_GENERATOR_CONTENTS(GET_GENERATOR_CONTENTS(custom_metrics.other))) > 0
)

SELECT
  client,
  plugin,
  COUNT(DISTINCT page) AS urls,
  COUNT(DISTINCT IF(has_pl = TRUE, page, NULL)) AS urls_with_pl,
  COUNT(DISTINCT IF(has_pl = FALSE, page, NULL)) AS urls_without_pl,
  COUNT(DISTINCT IF(has_pl = TRUE, page, NULL)) / COUNT(DISTINCT page) AS pct_with_pl
FROM
  urlsWithPerformanceLabPlugins,
  UNNEST(plugins) AS plugin
GROUP BY
  client,
  plugin
ORDER BY
  client,
  urls DESC
