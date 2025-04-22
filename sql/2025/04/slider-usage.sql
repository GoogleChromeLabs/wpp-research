  # HTTP Archive query to get % of WordPress sites using a slider/carousel library.
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

DECLARE
  DATE_TO_QUERY DATE DEFAULT '2025-03-01';

CREATE TEMPORARY FUNCTION
  HAS_TECHNOLOGY(technologies ARRAY<STRUCT<technology STRING,
    categories ARRAY<STRING>,
    info ARRAY<STRING>>>,
    technologyToFind STRING)
  RETURNS BOOL AS ( EXISTS(
    SELECT
      *
    FROM
      UNNEST(technologies) AS technology
    WHERE
      technology.technology = technologyToFind ) );

CREATE TEMPORARY FUNCTION
  HAS_SLIDER(technologies ARRAY<STRUCT<technology STRING,
    categories ARRAY<STRING>,
    info ARRAY<STRING>>>)
  RETURNS BOOL AS (
    EXISTS(
    SELECT
      *
    FROM
      UNNEST(technologies) AS technology
    WHERE
      technology.technology IN (
        'FlexSlider',
        'Flickity',
        'Master Slider',
        'MetaSlider',
        'OWL Carousel',
        'Slick',
        'Slider Revolution',
        'Smart Slider 3',
        'Swiper'
      )
    )
  );

SELECT
  client,
  COUNT(page) AS total_wp_sites,
  COUNT(IF(HAS_SLIDER(technologies), page, NULL)) AS total_slider,
  COUNT(IF(HAS_SLIDER(technologies), page, NULL)) / COUNT(page) AS pct_total
FROM
  `httparchive.crawl.pages`
WHERE
  date = DATE_TO_QUERY
  AND is_root_page
  AND HAS_TECHNOLOGY(technologies, 'WordPress')
GROUP BY
  client
ORDER BY
  client
