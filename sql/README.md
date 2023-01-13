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

### 2023/01

* [WebP adoption by WordPress version](./2023/01/webp-adoption-by-wordpress-version.sql)

### 2022/12

* [% of WordPress sites that use core theme with jQuery in a given month](./2022/12/usage-of-core-themes-with-jquery.sql)
* [% of WordPress sites not having fetchpriority='high' on LCP image](./2022/12/lcp-image-without-fetchpriority-high-opportunity.sql)
* [Impact of inaccurate sizes attributes per "img" tag](./2022/12/inaccurate-sizes-attribute-impact.sql)

### 2022/11

* [Performance Lab plugin version distribution in a given month](./2022/11/performance-lab-version-distribution.sql)
