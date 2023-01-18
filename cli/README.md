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

#### Required arguments

* `--test` (`-t`): You need to pass a WebPageTest result ID (e.g. "221011_AiDcV7_GGM") or URL (e.g. "https://www.webpagetest.org/result/221011_AiDcV7_GGM/"). You can optionally pass multiple test result IDs to merge their metrics. This is usually not relevant but can be helpful to combine multiple results with similar test configuration, to effectively have more test runs than the limit of 9 that WebPageTest imposes.
* `--metrics` (`-m`): You need to pass one or more WebPageTest metrics. Any metrics available on the "Graph Page Data" view (e.g. "https://www.webpagetest.org/graph_page_data.php?tests=221011_AiDcV7_GGM&median_value=1") are available. For a full list, please see the source code of the `createGetSingleMetricValue_()` function in the `lib/wpt/result.mjs` file. Additionally, you can access any Server-Timing metric by its identifier prefixed with "Server-Timing:". You can even aggregate multiple metrics in one via addition (` + `) and/or subtraction (` - `). Make sure to include a space before and after the arithmetic operator.

#### Examples

Get median Time to First Byte, First Contentful Paint, and Largest Contentful Paint:
```
wpt-metrics --test 221011_AiDcV7_GGM --metrics TTFB FCP LCP
```

Same as above, but results are formatted as CSV:
```
wpt-metrics --test 221011_AiDcV7_GGM --metrics TTFB FCP LCP --format csv
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

#### Required arguments

* `--test` (`-t`): You need to pass a WebPageTest result ID (e.g. "221011_AiDcV7_GGM") or URL (e.g. "https://www.webpagetest.org/result/221011_AiDcV7_GGM/"). You can optionally pass multiple test result IDs to merge their metrics. This is usually not relevant but can be helpful to combine multiple results with similar test configuration, to effectively have more test runs than the limit of 9 that WebPageTest imposes.

#### Examples

Get Server-Timing header medians:
```
wpt-server-timing --test 221011_AiDcV7_GGM
```

Same as above, but results are formatted as CSV:
```
wpt-server-timing --test 221011_AiDcV7_GGM --format csv
```

Get Server-Timing header medians _and_ all individual run values:
```
wpt-server-timing --test 221011_AiDcV7_GGM --include-runs
```

### `benchmark-url`

Sends the selected number of requests with a certain concurrency to provided URLs to find out the median response time for each URL. It can also track Server-Timing metrics and get median values for each of them.

#### Arguments

* `--url` (`-u`): An URL to benchmark.
* `--concurrency` (`-c`): Number of requests to make at the same time.
* `--number` (`-n`): Total number of requests to send.
* `--file` (`-f`): File with URLs (one URL per line) to run benchmark tests for.
* `--output` (`-o`): The output format.

#### Examples

Send 10 request, 2 requests at the same time:
```
benchmark-url --url https://example.com/ -n 10 -c 2
```

Same as above, but results are formatted as CSV:
```
benchmark-url --url https://example.com/ -n 10 -c 2 --output csv
```

To run benchmark tests for URLs from a file:
```
benchmark-url -f path/to/urls.txt -n 5
```
