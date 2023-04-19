Using XHProf with the WordPress core development environment
============================================================

[XHProf](https://www.php.net/manual/en/book.xhprof.php) is an open source PHP profiler.

### Setup with WordPress core development environment

1. git clone https://github.com/WordPress/wordpress-develop.git
2. Setup the environment using [these](https://github.com/wordPress/wordpress-develop/#development-environment-commands) instructions.
3. Start environment, using `npm run env:start`
4. Go to http://localhost:8889 and setup site.
5. Stop environment, using `npm run env:stop`
6. Copy [docker-compose.override.yml](docker-compose.override.yml) and [xhprof.php](xhprof.php) into the root of wordpress-develop directory.
7. Add `require_once  __DIR__ . '/xhprof.php';` to wp-config.php ( to enable profiler ).
8. Start environment, using `npm run env:start`
9. Go to http://localhost:8142/ to see profiler UI.
