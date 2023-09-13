[Back to docs overview](./README.md)

# Be careful when using UNNEST in BigQuery

## TL;DR

* When using UNNEST in BigQuery in the FROM clause, rows may be duplicated, which then of course results in duplicate counts that can lead to skewed data.
* It is by no means a bad practice to use UNNEST, but if you do, **double check** that you’re doing it right. For example, by taking one URL out of the results and ensuring that it is only among the results the intended number of times (e.g. once in total, or once per client/device).
* If you want to query by certain values within a repeated field (array field), instead of using UNNEST in the FROM clause it may be safer to use an EXISTS with a subquery: When using UNNEST in that subquery, it won’t affect the overall query.

## Context

* In order to detect the CMS that a site uses, the `technologies` field of the `httparchive.pages.all` table should be used.
* The field is a repeatable field / array of objects, which encompasses not only CMSs, but all kinds of technologies, using [Wappalyzer](https://www.wappalyzer.com/) under the hood for detection.
* Because the field is an array of objects, you cannot just use a simple clause like `WHERE technologies = "WordPress"`. Instead, accessing fields from within an array is usually achieved using [UNNEST](https://cloud.google.com/bigquery/docs/reference/standard-sql/query-syntax#unnest_operator), which however can lead to duplicate results when used incorrectly.

## Examples

All of the examples below are valid BigQuery queries, but most of them will lead to wrong results that include duplicates. Different examples are provided as reference points, including correct and incorrect ones.

### 1. ❌ Unnesting technologies
```sql
SELECT
  client, page
FROM
  `httparchive.pages.all`,
  UNNEST(technologies) AS technology
```

Because of unnesting the technologies field, you end up with several instances of each URL, because every URL has multiple technologies.

### 2. ✅ Unnesting technologies, limiting to one technology
```sql
SELECT
  client, page
FROM
  `httparchive.pages.all`,
  UNNEST(technologies) AS technology
WHERE
  technology.technology = "WordPress"
```

Even though you unnest, you then limit results to the “WordPress” technology which should only be present once per matching URL.

### 3. ❌ Unnesting technology categories
```sql
SELECT
  client, page
FROM
  `httparchive.pages.all`,
  UNNEST(technologies) AS technology,
  UNNEST(technology.categories) AS category
WHERE
  technology.technology = "WordPress"
```

For the same reason as the 1. query, you now may end up with multiple instances of each URL, because a technology may have multiple categories.

### 4. ❌ Unnesting technology version information
```sql
SELECT
  client, page
FROM
  `httparchive.pages.all`,
  UNNEST(technologies) AS technology,
  UNNEST(technology.info) AS version
WHERE
  technology.technology = "WordPress"
```

For the same reason as the 1. query, you now may end up with multiple instances of each URL, because a technology may have multiple categories, and each category will have a version attached.

### 5. ❌ Unnesting technology version information, limiting to one version
```sql
SELECT
  client, page
FROM
  `httparchive.pages.all`,
  UNNEST(technologies) AS technology,
  UNNEST(technology.info) AS version
WHERE
  technology.technology = "WordPress"
  AND version = "6.3"
```

Despite specifying the version, you have the same problem as in the 4. query, because the duplicated versions typically match and therefore would both satisfy the 6.3 condition.

### 6. ❌ Unnesting technology version information, limiting to one version and category
```sql
SELECT
  client, page
FROM
  `httparchive.pages.all`,
  UNNEST(technologies) AS technology,
  UNNEST(technology.categories) AS category,
  UNNEST(technology.info) AS version
WHERE
  technology.technology = "WordPress"
  AND version = "6.3"
  AND category = "CMS"
```

You may think that the 5. query can be fixed by limiting results to only one of the “WordPress” categories (“CMS” and “Blogs”). However, even with that limitation the rows will still be duplicated because the technology.info field is not directly associated with the technology.categories field.

### 7. ✅ Unnesting technology version information in WHERE clause, limiting to one version
```sql
SELECT
  client, page
FROM
  `httparchive.pages.all`,
  UNNEST(technologies) AS technology
WHERE
  technology.technology = "WordPress"
  AND "6.3" IN UNNEST(technology.info)
```

Here the UNNEST happens only in the WHERE query so it doesn’t result in duplicated rows. This is effectively the correct version of the 5. query.

### 8. ❌ Unnesting technology version information, limiting to multiple versions
```sql
SELECT
  client, page
FROM
  `httparchive.pages.all`,
  UNNEST(technologies) AS technology,
  UNNEST(technology.info) AS version
WHERE
  technology.technology = "WordPress"
  AND STARTS_WITH(version, "6.3.")
```

This query has the exact same problem as the 5. query, and is simply here as an example for how to use a slightly more complex function rather than a simple equality check.

### 9. ✅ Unnesting technology version information in WHERE clause, limiting to multiple versions
```sql
SELECT
  client, page
FROM
  `httparchive.pages.all`,
  UNNEST(technologies) AS technology
WHERE
  technology.technology = "WordPress"
  AND STARTS_WITH(technology.info[SAFE_OFFSET(0)], "6.3.")
```

This is the correct version of the 8. query: You cannot use the same UNNEST approach from the 7. query here, but by simply trying to match the first version value it should work as expected.

### 10. 🎉 Unnesting within a subquery
```sql
SELECT
  client, page
FROM
  `httparchive.pages.all`
WHERE
  EXISTS (
    SELECT
      *
    FROM
      UNNEST(technologies) AS technology,
      UNNEST(technology.info) AS version
    WHERE
      technology.technology = "WordPress"
      AND version = "6.3"
  )
```

This is the safest way to query for values within a repeated field (array field) without risking any duplicated rows, by using an EXISTS subquery and only using UNNEST there. This way the unnesting only affects the subquery and thus there is no risk of duplicated rows.

## Reusable helper function

For the common task of limiting to only sites of a specific CMS or platform, consider using the following helper function in your queries:

```sql
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
```

* The function can be used to match records of a specific CMS, e.g. like `IS_CMS(technologies, "WordPress", "")`
* The function can be used to match records of a specific CMS and specific version, e.g. like `IS_CMS(technologies, "WordPress", "6.3")`
* Note that the above would not match e.g. 6.3.1. To achieve that, the function can also be used to match records of a specific CMS and specific version with a simple wildcard mechanism, e.g. like `IS_CMS(technologies, "WordPress", "6.3.x")` (will match 6.3, 6.3.0, 6.3.1 etc.)

This makes queries like the above examples a lot simpler. Below is a full example:

```sql
SELECT
  client, page
FROM
  `httparchive.pages.all`
WHERE
  IS_CMS(technologies, "WordPress", "6.3.x")
```
