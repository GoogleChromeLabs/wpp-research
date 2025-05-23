# Using the research CLI commands

The research command (`npm run research`) exposes various useful tools around WordPress performance research, for example using WebPageTest.

This guide provides instructions for how to use the available commands. Additionally, you can use `npm run research -- help` for a full CLI reference.

## Available commands

**Note:** All commands need to be invoked via `npm run research -- <command>`. This prefix is going to be omitted in the instructions below.

For example, when an example in the below instructions says:

`demo-command --demo-argument Yes`

The full command to run is:

`npm run research -- demo-command --demo-argument Yes`

### `wpt-metrics`

Gets performance metrics for a [WebPageTest](https://www.webpagetest.org) result.

This command parses the median values for given metrics out of the WebPageTest result data.

By default, only the median values are returned. You can optionally request all the individual run values as well.

#### Arguments

* `--test` (`-t`): You need to pass a WebPageTest result ID (e.g. "221011_AiDcV7_GGM") or URL (e.g. "https://www.webpagetest.org/result/221011_AiDcV7_GGM/"). You can optionally pass multiple test result IDs to merge their metrics. This is usually not relevant but can be helpful to combine multiple results with similar test configuration, to effectively have more test runs than the limit of 9 that WebPageTest imposes.
* `--metrics` (`-m`): You need to pass one or more WebPageTest metrics. Any metrics available on the "Graph Page Data" view (e.g. "https://www.webpagetest.org/graph_page_data.php?tests=221011_AiDcV7_GGM&median_value=1") are available. For a full list, please see the source code of the `createGetSingleMetricValue_()` function in the `lib/wpt/result.mjs` file. Additionally, you can access any Server-Timing metric by its identifier prefixed with "Server-Timing:". You can even aggregate multiple metrics in one via addition (` + `) and/or subtraction (` - `). Make sure to include a space before and after the arithmetic operator.
* `--format` (`-f`): The output format: Either "table", "csv", or "md".
* `--show-percentiles` (`-p`): Whether to show more granular percentiles instead of only the median.
* `--include-runs` (`-i`): Whether to also show the full results for all runs.
* `--rows-as-columns` (`-r`): Whether to inverse rows and columns.

#### Examples

Get median Time to First Byte, First Contentful Paint, and Largest Contentful Paint:
```
wpt-metrics --test 221011_AiDcV7_GGM --metrics TTFB FCP LCP
```

Same as above, but results are formatted as CSV:
```
wpt-metrics --test 221011_AiDcV7_GGM --metrics TTFB FCP LCP --format csv
```

Get percentile values for Time to First Byte, First Contentful Paint, and Largest Contentful Paint:
```
wpt-metrics --test 221011_AiDcV7_GGM --metrics TTFB FCP LCP --show-percentiles
```

Get Time to First Byte median _and_ all individual run values:
```
wpt-metrics --test 221011_AiDcV7_GGM --metrics TTFB --include-runs
```

Get Cumulative Layout Shift median _and_ all individual run values, with rows and columns inverted:
```
wpt-metrics --test 221011_AiDcV7_GGM --metrics CLS --include-runs --rows-as-columns
```

Get median value for the difference between Largest Contentful Paint and Time to First Byte:
```
wpt-metrics --test 221011_AiDcV7_GGM --metrics "LCP - TTFB"
```

Get median value for a Server-Timing metric called "wp-before-template":
```
wpt-metrics --test 221011_AiDcV7_GGM --metrics Server-Timing:wp-before-template
```

Get median value for the sum of two Server-Timing metrics "wp-before-template" and "wp-template":
```
wpt-metrics --test 221011_AiDcV7_GGM --metrics "Server-Timing:wp-before-template + Server-Timing:wp-template"
```

### `wpt-server-timing`

Gets Server-Timing metrics for a [WebPageTest](https://www.webpagetest.org) result.

These are not available by default for any WebPageTest result. They are only available if the corresponding page is configured to send a [`Server-Timing` header](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Server-Timing). This command parses all available Server-Timing header values out of the WebPageTest result data.

By default, only the median values are returned. You can optionally request all the individual run values as well.

#### Arguments

* `--test` (`-t`): You need to pass a WebPageTest result ID (e.g. "221011_AiDcV7_GGM") or URL (e.g. "https://www.webpagetest.org/result/221011_AiDcV7_GGM/"). You can optionally pass multiple test result IDs to merge their metrics. This is usually not relevant but can be helpful to combine multiple results with similar test configuration, to effectively have more test runs than the limit of 9 that WebPageTest imposes.
* `--format` (`-f`): The output format: Either "table", "csv", or "md".
* `--show-percentiles` (`-p`): Whether to show more granular percentiles instead of only the median.
* `--include-runs` (`-i`): Whether to also show the full results for all runs.
* `--rows-as-columns` (`-r`): Whether to inverse rows and columns.

#### Examples

Get Server-Timing header medians:
```
wpt-server-timing --test 221011_AiDcV7_GGM
```

Same as above, but results are formatted as CSV:
```
wpt-server-timing --test 221011_AiDcV7_GGM --format csv
```

Get Server-Timing header percentile values:
```
wpt-server-timing --test 221011_AiDcV7_GGM --show-percentiles
```

Get Server-Timing header medians _and_ all individual run values:
```
wpt-server-timing --test 221011_AiDcV7_GGM --include-runs
```

### `benchmark-server-timing`

Sends the selected number of requests with a certain concurrency to provided URLs to find out the median response time for each URL. It also tracks medians for any Server-Timing metrics present in the response.

#### Arguments

* `--url` (`-u`): A URL to benchmark. Multiple URLs may be specified by repeating this argument.
* `--concurrency` (`-c`): Number of requests to make at the same time.
* `--number` (`-n`): Total number of requests to send.
* `--file` (`-f`): File with URLs (one URL per line) to run benchmark tests for.
* `--output` (`-o`): The output format: Either "table", "csv", or "md".
* `--show-percentiles` (`-p`): Whether to show more granular percentiles instead of only the median.

#### Examples

Send 10 request, 2 requests at the same time:
```
benchmark-server-timing --url https://example.com/ -n 10 -c 2
```

Same as above, but results are formatted as CSV:
```
benchmark-server-timing --url https://example.com/ -n 10 -c 2 --output csv
```

To include more granular percentiles rather than only the median for each metric:
```
benchmark-server-timing --url https://example.com/ -n 10 -c 2 --show-percentiles
```

To run benchmark tests for URLs from a file:
```
benchmark-server-timing -f path/to/urls.txt -n 5
```

### `benchmark-web-vitals`

Loads the provided URLs in a headless browser several times to measure median Web Vitals metrics for each URL. Currently the results cover load time metrics FCP, LCP, and TTFB, as well as the aggregate metric "LCP-TTFB", which is useful to assess client-side performance specifically. Including additional metrics is explored in a [follow up pull request](https://github.com/GoogleChromeLabs/wpp-research/pull/41).

#### Arguments

* `--url` (`-u`): A URL to benchmark. Multiple URLs may be specified by repeating this argument.
* `--number` (`-n`): Total number of requests to send.
* `--file` (`-f`): File with URLs (one URL per line) to run benchmark tests for.
* `--metrics` (`-m`): Which metrics to include; by default these are "FCP", "LCP", "TTFB" and "LCP-TTFB".
* `--output` (`-o`): The output format: Either "table", "csv", or "md".
* `--show-percentiles` (`-p`): Whether to show more granular percentiles instead of only the median.
* `--throttle-cpu` (`-t`): Enable CPU throttling to emulate slow CPUs.
* `--network-conditions` (`-c`): Enable emulation of network conditions. Options: "Slow 3G", "Fast 3G", "Slow 4G", "Fast 4G", "broadband". Note that "Fast 3G" and "Slow 4G" are identical, and this is used in Lighthouse for testing on mobile. The "broadband" value corresponds to what Lighthouse uses for testing on desktop: 10,240 kb/s throughput with 40 ms TCP RTT.
* `--emulate-device` (`-e`): Emulate a specific device, like "Moto G4" or "iPad". See list of [known devices](https://pptr.dev/api/puppeteer.knowndevices). 
* `--window-viewport` (`-w`): Specify the viewport window size, like "mobile" (an alias for "412x823") or "desktop" (an alias for "1350x940"). Defaults to "960x700" if no device is being emulated.
* `--pause-duration`: Specify the number of milliseconds to pause between making requests in order to give the server a chance to catch its breath. This is to prevent CPU from getting increasingly taxed which would progressively reflect poorly on TTFB. It's also provided as an option to be a good netizen when benchmarking a site in the field since the `rnd` query parameter will usually bust page caches.
* `--skip-network-priming`: Skip priming the network before making an initial request with metric collection. By default, an initial request is made to a benchmarked URL without collecting any metrics. This is to ensure that the DNS lookups have been cached in the operating system so that the TTFB for the initial request won't be slower than the rest.

#### Examples

Send 10 requests to a single URL:
```bash
benchmark-web-vitals --url https://example.com/ -n 10
```

Same as above, but results are formatted as CSV:
```bash
benchmark-web-vitals --url https://example.com/ -n 10 --output csv
```

To include a different (sub)set of metrics (e.g. "TTFB" and "LCP-TTFB"):
```bash
benchmark-web-vitals --url https://example.com/ -n 10 --metrics TTFB "LCP-TTFB"
```

To include a custom Server-Timing metric like `wp-total` (only if configured on the server):
```bash
benchmark-web-vitals --url https://example.com/ -n 10 --metrics ST:wp-total
```

To include more granular percentiles rather than only the median for each metric:
```bash
benchmark-web-vitals --url https://example.com/ -n 10 --show-percentiles
```

To run benchmark tests for URLs from a file:
```bash
benchmark-web-vitals -f path/to/urls.txt -n 5
```

To make a request that throttles the CPU 4x while also emulating Fast 3G network conditions on a mobile viewport:
```bash
benchmark-web-vitals --url https://example.com/ -t 4 -c "Fast 3G" -w "360x800"
```

### `analyze-loading-optimization`

Loads the given URL with both desktop and mobile emulation and gathers information about how well its elements are optimized for loading, such as whether the LCP image has `fetchpriority=high` and whether there are lazy-loaded images in the initial viewport.

#### Arguments

* `--url` (`-u`): A URL to analyze.
* `--output` (`-o`): The output format, either "table", "json", "csv", "csv-oneline", or "md".

#### Examples

Analyze WordPress.org for loading optimization issues and present the information in a table (which is the same structure if `csv` is used):

```bash
analyze-loading-optimization -- -u https://wordpress.org/ -o table
╔══════════════════════════════╤════════╤═════════╗
║ field                        │ mobile │ desktop ║
╟──────────────────────────────┼────────┼─────────╢
║ lcpMetric                    │ 991.5  │ 620.5   ║
╟──────────────────────────────┼────────┼─────────╢
║ lcpElement                   │ H1     │ IMG     ║
╟──────────────────────────────┼────────┼─────────╢
║ lcpElementIsLazyLoaded       │ false  │ false   ║
╟──────────────────────────────┼────────┼─────────╢
║ lcpImageMissingFetchPriority │ false  │ true    ║
╟──────────────────────────────┼────────┼─────────╢
║ fetchPriorityCount           │ 0      │ 0       ║
╟──────────────────────────────┼────────┼─────────╢
║ fetchPriorityInsideViewport  │ 0      │ 0       ║
╟──────────────────────────────┼────────┼─────────╢
║ fetchPriorityOutsideViewport │ 0      │ 0       ║
╟──────────────────────────────┼────────┼─────────╢
║ lazyLoadableCount            │ 14     │ 14      ║
╟──────────────────────────────┼────────┼─────────╢
║ lazyLoadedInsideViewport     │ 0      │ 0       ║
╟──────────────────────────────┼────────┼─────────╢
║ lazyLoadedOutsideViewport    │ 0      │ 0       ║
╟──────────────────────────────┼────────┼─────────╢
║ eagerLoadedInsideViewport    │ 0      │ 0       ║
╟──────────────────────────────┼────────┼─────────╢
║ eagerLoadedOutsideViewport   │ 14     │ 14      ║
╟──────────────────────────────┼────────┼─────────╢
║ errors                       │ 14     │ 15      ║
╚══════════════════════════════╧════════╧═════════╝
```

Same as above, but results are formatted as JSON, which includes the underlying error codes:

```bash
analyze-loading-optimization -- -u https://wordpress.org/ -o json
{
    "url": "https://wordpress.org/",
    "deviceAnalyses": {
        "mobile": {
            "lcpMetric": 1122.3999999761581,
            "lcpElement": "H1",
            "lcpElementIsLazyLoaded": false,
            "lcpImageMissingFetchPriority": false,
            "fetchPriorityCount": 0,
            "fetchPriorityInsideViewport": 0,
            "fetchPriorityOutsideViewport": 0,
            "lazyLoadableCount": 14,
            "lazyLoadedInsideViewport": 0,
            "lazyLoadedOutsideViewport": 0,
            "eagerLoadedInsideViewport": 0,
            "eagerLoadedOutsideViewport": 14,
            "errors": [
                "EAGER_LOADED_ELEMENT_OUTSIDE_INITIAL_VIEWPORT",
                "EAGER_LOADED_ELEMENT_OUTSIDE_INITIAL_VIEWPORT",
                "EAGER_LOADED_ELEMENT_OUTSIDE_INITIAL_VIEWPORT",
                "EAGER_LOADED_ELEMENT_OUTSIDE_INITIAL_VIEWPORT",
                "EAGER_LOADED_ELEMENT_OUTSIDE_INITIAL_VIEWPORT",
                "EAGER_LOADED_ELEMENT_OUTSIDE_INITIAL_VIEWPORT",
                "EAGER_LOADED_ELEMENT_OUTSIDE_INITIAL_VIEWPORT",
                "EAGER_LOADED_ELEMENT_OUTSIDE_INITIAL_VIEWPORT",
                "EAGER_LOADED_ELEMENT_OUTSIDE_INITIAL_VIEWPORT",
                "EAGER_LOADED_ELEMENT_OUTSIDE_INITIAL_VIEWPORT",
                "EAGER_LOADED_ELEMENT_OUTSIDE_INITIAL_VIEWPORT",
                "EAGER_LOADED_ELEMENT_OUTSIDE_INITIAL_VIEWPORT",
                "EAGER_LOADED_ELEMENT_OUTSIDE_INITIAL_VIEWPORT",
                "EAGER_LOADED_ELEMENT_OUTSIDE_INITIAL_VIEWPORT"
            ]
        },
        "desktop": {
            "lcpMetric": 502,
            "lcpElement": "IMG",
            "lcpElementIsLazyLoaded": false,
            "lcpImageMissingFetchPriority": true,
            "fetchPriorityCount": 0,
            "fetchPriorityInsideViewport": 0,
            "fetchPriorityOutsideViewport": 0,
            "lazyLoadableCount": 14,
            "lazyLoadedInsideViewport": 0,
            "lazyLoadedOutsideViewport": 0,
            "eagerLoadedInsideViewport": 0,
            "eagerLoadedOutsideViewport": 14,
            "errors": [
                "LCP_IMAGE_MISSING_FETCHPRIORITY",
                "EAGER_LOADED_ELEMENT_OUTSIDE_INITIAL_VIEWPORT",
                "EAGER_LOADED_ELEMENT_OUTSIDE_INITIAL_VIEWPORT",
                "EAGER_LOADED_ELEMENT_OUTSIDE_INITIAL_VIEWPORT",
                "EAGER_LOADED_ELEMENT_OUTSIDE_INITIAL_VIEWPORT",
                "EAGER_LOADED_ELEMENT_OUTSIDE_INITIAL_VIEWPORT",
                "EAGER_LOADED_ELEMENT_OUTSIDE_INITIAL_VIEWPORT",
                "EAGER_LOADED_ELEMENT_OUTSIDE_INITIAL_VIEWPORT",
                "EAGER_LOADED_ELEMENT_OUTSIDE_INITIAL_VIEWPORT",
                "EAGER_LOADED_ELEMENT_OUTSIDE_INITIAL_VIEWPORT",
                "EAGER_LOADED_ELEMENT_OUTSIDE_INITIAL_VIEWPORT",
                "EAGER_LOADED_ELEMENT_OUTSIDE_INITIAL_VIEWPORT",
                "EAGER_LOADED_ELEMENT_OUTSIDE_INITIAL_VIEWPORT",
                "EAGER_LOADED_ELEMENT_OUTSIDE_INITIAL_VIEWPORT",
                "EAGER_LOADED_ELEMENT_OUTSIDE_INITIAL_VIEWPORT"
            ]
        }
    }
}
```

There is also a `csv-oneline` format which is useful for collating results for a set of URLs. For example, given a file `urls.txt`:

```
https://wordpress.org/
https://make.wordpress.org/
https://wptavern.com/
```

And given a Bash script `batch-analyze-loading-optimization.sh`:

```bash
#!/bin/bash

url_count=0
while read url; do
	echo "$url_count. $url" > /dev/stderr
	if npm run --silent research analyze-loading-optimization -- -u "$url" -o csv-oneline | tail -n $( [[ $url_count = 0 ]] && echo 2 || echo 1 ); then
		url_count=$(($url_count + 1 ))
	fi
done
```

Running this command:

```bash
cat urls.txt | ./batch-analyze-loading-optimization.sh > analyses.csv
```

Results in an `analyses.csv` file that contains:

```
url,mobile:lcpMetric,mobile:lcpElement,mobile:lcpElementIsLazyLoaded,mobile:lcpImageMissingFetchPriority,mobile:fetchPriorityCount,mobile:fetchPriorityInsideViewport,mobile:fetchPriorityOutsideViewport,mobile:lazyLoadableCount,mobile:lazyLoadedInsideViewport,mobile:lazyLoadedOutsideViewport,mobile:eagerLoadedInsideViewport,mobile:eagerLoadedOutsideViewport,mobile:errors,desktop:lcpMetric,desktop:lcpElement,desktop:lcpElementIsLazyLoaded,desktop:lcpImageMissingFetchPriority,desktop:fetchPriorityCount,desktop:fetchPriorityInsideViewport,desktop:fetchPriorityOutsideViewport,desktop:lazyLoadableCount,desktop:lazyLoadedInsideViewport,desktop:lazyLoadedOutsideViewport,desktop:eagerLoadedInsideViewport,desktop:eagerLoadedOutsideViewport,desktop:errors
https://wordpress.org/,917.4,IMG,false,true,0,0,0,14,0,0,0,14,15,659.8,IMG,false,true,0,0,0,14,0,0,0,14,15
https://make.wordpress.org/,926.6,IMG,false,false,1,1,0,3,0,0,1,2,2,650.1,IMG,false,false,1,1,0,3,0,0,1,2,2
https://wptavern.com/,996.5,IMG,true,true,0,0,0,12,2,8,0,2,6,722.5,IMG,true,true,0,0,0,12,2,8,0,2,6
```

This can then be, for example, pasted into a Google Sheet for further analysis.
