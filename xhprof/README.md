Using XHProf with the WordPress core development environment
============================================================

[XHProf](https://www.php.net/manual/en/book.xhprof.php) is an open source PHP profile.

### Setup with WordPress core development environment

1. git clone https://github.com/WordPress/wordpress-develop.git
2. Setup the environment using [these](https://github.com/wordPress/wordpress-develop/#development-environment-commands) instructions.
3. Start environment, using `npm run env:start`
4. Go to http://localhost:8889 and setup site.
5. Stop environment, using `npm run env:stop`
6. Copy docker-compose.override.yml into the root of wordpress-develop directory.
7. Copy advanced-cache.php into the src/wp-content directory.
8. Add `define( 'WP_CACHE', true );` to wp-config.php ( to enable profiler ).
9. Start environment, using `npm run env:start`
10. Go to http://localhost:8142/ to see profiler UI. 
