# WP Profiler

WP Profiler is an mu-plugin implementation of the [PHP Profiler](https://github.com/perftools/php-profiler) library to make it easier to submit XHProf profiling data to XHGui.

## Installation instructions

After installing this mu-plugin in your application of choice, you'll need to run `composer install` to install the PHP Profiler library dependency. Next, you will need to configure the profiler settings in `plugin.php` to connect to your XHGui application.

To use this as a standalone profiler with WordPress, a sample `.wp-env.json` configuration is included.

See: https://github.com/WordPress/gutenberg/pull/48147 for the status of having XHProf supported directly in the `@wordpress/env` (i.e., `wp-env`) package.

## Disclaimer

This is not an officially supported Google product
