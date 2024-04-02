# HTTP Archive query to get median image LCP and size in MB per image format.
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
# See **TODO**

SELECT
  format,
  APPROX_QUANTILES(lcp, 1000)[
    OFFSET
      (500)] AS median_lcp,
  APPROX_QUANTILES(bytesImg, 1000)[
    OFFSET
      (500)] / 1024 / 1024 AS median_img_mbytes
FROM (
       SELECT
         DISTINCT url,
                  info AS version
       FROM
         `httparchive.technologies.2024_01_01_mobile`
       WHERE
           app = 'WordPress')
       JOIN (
  SELECT
    url,
    format,
    bytesImg
  FROM (
         SELECT
           pageid,
           format
         FROM
           `httparchive.summary_requests.2024_01_01_mobile`
         WHERE
             format IN ("webp",
                        "png",
                        "gif",
                        "jpg",
                        "avif")
         GROUP BY
           pageid,
           format)
         JOIN (
    SELECT
      pageid,
      url,
      bytesImg
    FROM
      `httparchive.summary_pages.2024_01_01_mobile`)
              USING
                (pageid))
            USING
              (url)
       JOIN (
  SELECT
    url,
    CAST(JSON_EXTRACT_SCALAR(payload, "$['_chromeUserTiming.LargestContentfulPaint']") AS INT64) / 1000 AS lcp
  FROM
    `httparchive.pages.2024_01_01_mobile`)
            USING
              (url)
GROUP BY
  format


-- format median_lcp median_img_mbytes
-- avif   8.844      1.248234748840332
-- webp   8.436      0.76087188720703125
-- gif    9.06       1.1151218414306641
-- png    9.143      1.0731716156005859
-- jpg    9.202      1.1317033767700195
