# HTTP Archive query to get distribution of alloptions query time and its percentage of the total load time.
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

# See query results here: https://github.com/GoogleChromeLabs/wpp-research/pull/36
CREATE TEMP FUNCTION EXTRACT_SERVER_TIMING_METRIC(metrics ARRAY<STRUCT<name STRING, dur STRING, `desc` STRING>>, metric_name STRING) RETURNS FLOAT64 LANGUAGE js AS r'''
const entry = metrics.find(metric => metric.name === metric_name);
if ( ! entry ) {
  return null;
}
return parseFloat(entry.dur);
''';

WITH relevantServerTimings AS (
  SELECT
    client,
    url,
    EXTRACT_SERVER_TIMING_METRIC(httparchive.all.PARSE_SERVER_TIMING_HEADER(response_header.value), 'wp-load-alloptions-query') AS alloptions_query_time,
    EXTRACT_SERVER_TIMING_METRIC(httparchive.all.PARSE_SERVER_TIMING_HEADER(response_header.value), 'wp-before-template') AS before_template_time
  FROM
    `httparchive.all.requests`,
    UNNEST(response_headers) AS response_header
  WHERE
    date = '2023-01-01'
    AND type = "html"
    AND LOWER(response_header.name) = 'server-timing'
    # Checking for this value here means we can skip joining the results with the technologies data
    # since realistically only WordPress sites will provide this Server-Timing header metric.
    AND CONTAINS_SUBSTR(response_header.value, 'wp-load-alloptions-query;')
)

SELECT
  client,
  percentile,
  APPROX_QUANTILES(alloptions_query_time, 1000)[OFFSET(percentile * 10)] AS alloptions_query_time,
  APPROX_QUANTILES(alloptions_query_time / before_template_time, 1000)[OFFSET(percentile * 10)] AS pct_query_time
FROM
  relevantServerTimings,
  UNNEST([10, 25, 50, 75, 90, 100]) AS percentile
GROUP BY
  client,
  percentile
ORDER BY
  client,
  percentile
