Setup of the Blackfire profiler tool with WordPress
===============================================

[Blackfire](https://www.blackfire.io/) is a PHP profiling tool. It requires a payment to use, however, they do offer open source license. 

To run the profiler, you will need a Blackfire account, [login](https://blackfire.io/login?target=/docs/php/configuration) or [sign up](https://blackfire.io/login?target=/docs/php/configuration) to setup an environment.


### Using Blackfire with the WordPress core development environment.

Before setting up this environment you will need the following information. This information can be found within your Blackfire account. 

- `BLACKFIRE_CLIENT_ID`
- `BLACKFIRE_CLIENT_TOKEN`
- `BLACKFIRE_SERVER_ID`
- `BLACKFIRE_SERVER_TOKEN`

1. Git checkout [wordPress/wordpress-develop](https://github.com/wordPress/wordpress-develop/). 
2. Setup the WordPress core development environment with these [instructions](https://github.com/wordPress/wordpress-develop/#development-environment-commands).
3. Copy the [docker-compose.override.yml](docker-compose.override.yml) into the root directory. 
4. Setup `BLACKFIRE_CLIENT_ID` / `BLACKFIRE_CLIENT_TOKEN` / `BLACKFIRE_SERVER_ID` / `BLACKFIRE_SERVER_TOKEN` as environment variables. 
5. If the environment is running, type `npm run env:stop`. Then type `npm run env:start`
6. Run the profiler using [Chrome extension](https://chrome.google.com/webstore/detail/blackfire-profiler/miefikpgahefdbcgoiicnmpbeeomffld). 

Different version of PHP can be tested using environment variables like so:

```
LOCAL_PHP=7.2-fpm npm run env:start
```

The list of available PHP versions can be found on [docker hub](https://hub.docker.com/r/spacedmonkey/php-blackfire/tags). 