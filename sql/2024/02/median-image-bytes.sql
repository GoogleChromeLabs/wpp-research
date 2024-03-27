# HTTP Archive query to get median image size in MB per image format.
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
# See **TODO**

SELECT
  format,
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
           format,
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
GROUP BY
  format


-- format median_img_mbytes
-- avif	  1.2932262420654297
-- webp	  0.81642627716064453
-- jpg    1.2288293838500977
-- gif    1.2155523300170898
-- png    1.1658077239990234
