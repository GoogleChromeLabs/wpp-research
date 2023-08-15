# Browsing the available SQL queries

This directory is an ever-growing collection of BigQuery SQL queries focused on specific WordPress performance research, usually relying on HTTP Archive data.

Queries are added on demand and organized in year + month directories.

## Adding a new query

Once you are ready to add a new query to the repository, open a pull request following these guidelines:

1. Implement the query in a `.sql` file.
    * Use a brief but descriptive name for what the query is for.
    * Include the license header, and change the description in the first line.
2. Make sure the query is placed in the year-month based folder structure based on the current month.
3. Run the query (outside of GitHub) and post the results into the PR description (see [#13](https://github.com/GoogleChromeLabs/wpp-research/pull/13) for an example).
4. Add a comment above the query in the `.sql` file with a link to the PR to make it easy to view the query results.
5. Add the query to the query index below, following the format.

## Query index

### 2023/08

* [Counts for WordPress theme/plugin script placements (whether blocking/async/defer in head/footer)](./2023/08/theme-plugin-script-placements.sql)
* [Counts of theme/plugin scripts blocking in head](./2023/08/blocking-in-head-scripts-from-themes-and-plugins.sql)

### 2023/04

* [Number of WordPress sites on version >= 5.5 that use any images and lazy-load them](./2023/04/image-lazy-loading-usage.sql)

### 2023/03

* [Top class names used on lazy loaded LCP images](./2023/03/top-lazy-lcp-class-names.sql)
* [% of WordPress sites that do not implement Critical CSS via custom metrics](./2023/03/critical-css-opportunity-custom-metrics.sql)
* [% of WordPress sites that do not implement Critical CSS via custom metrics (using `$._renderBlockingCSS`)](./2023/03/critical-css-opportunity-custom-metrics-alternative.sql)

### 2023/01

* [% of WordPress sites that lazy-load their LCP image](./2023/01/lazyloaded-lcp-opportunity.sql)
* [% WordPress sites using a block theme](./2023/01/block-theme-usage.sql)
* [% of WordPress sites that do not implement Critical CSS](./2023/01/critical-css-opportunity.sql)
* [% of WordPress sites that have any deferred scripts](./2023/01/sites-with-deferred-scripts.sql)
* [Distribution of number of external scripts and % of deferred scripts](./2023/01/external-deferred-scripts-distribution.sql)
* [% of WordPress sites not having fetchpriority='high' on LCP image (slightly more efficient)](./2023/01/lcp-image-without-fetchpriority-high-opportunity-more-efficient.sql)
* [Core Web Vital "good" rates by WordPress version](./2023/01/cwvs-by-wordpress-version.sql)
* [WebP adoption by WordPress version](./2023/01/webp-adoption-by-wordpress-version.sql)
* [% of WordPress sites that use any web fonts](./2023/01/web-fonts-usage.sql)
* [Distribution of number of web fonts used per site](./2023/01/web-fonts-count-distribution.sql)
* [% of WordPress sites that use various font-display strategy for any web fonts](./2023/01/font-display-strategy-usage.sql)
* [Distribution of alloptions query time and its percentage of the total load time](./2023/01/alloptions-query-time-distribution.sql)
* [Number of sites with slow alloptions queries (>10% of total load time)](./2023/01/sites-with-slow-alloptions-queries.sql)

### 2022/12

* [% of WordPress sites that use core theme with jQuery in a given month](./2022/12/usage-of-core-themes-with-jquery.sql)
* [% of WordPress sites not having fetchpriority='high' on LCP image](./2022/12/lcp-image-without-fetchpriority-high-opportunity.sql)
* [Impact of inaccurate sizes attributes per "img" tag](./2022/12/inaccurate-sizes-attribute-impact.sql)

### 2022/11

* [Performance Lab plugin version distribution in a given month](./2022/11/performance-lab-version-distribution.sql)
