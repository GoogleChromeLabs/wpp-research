Setup of blackfire profiler tool with WordPress
===============================================

[Blackfire](https://www.blackfire.io/) is an PHP profiling tool. It is paid for solution, however, they do offer open source licenese. 

To run the profiler, you will need a blackfire account, [login](https://blackfire.io/login?target=/docs/php/configuration) or [sign up](https://blackfire.io/login?target=/docs/php/configuration) and to setup an enviroment. 


### Using blackfire with WordPress core developement envoriment.

Before setting up this envoriment you will need the following information. This information can be found within your blackfire acccount. 

- `BLACKFIRE_CLIENT_ID`
- `BLACKFIRE_CLIENT_TOKEN`
- `BLACKFIRE_SERVER_ID`
- `BLACKFIRE_SERVER_TOKEN`

1. Git checkout [wordPress/wordpress-develop](https://github.com/wordPress/wordpress-develop/). 
2. Setup WordPress core development envoriment with these [instructions](https://github.com/wordPress/wordpress-develop/#development-environment-commands).
3. Copy the [docker-compose.override.yml](docker-compose.override.yml) into the root directory. 
4. Setup BLACKFIRE_CLIENT_ID / BLACKFIRE_CLIENT_TOKEN / BLACKFIRE_SERVER_ID / BLACKFIRE_SERVER_TOKEN as envoriment variables. 
5. If envoriment is running, type `npm run env:stop`. The type `npm run env:start`
6. Run the profiler using (Chrome extension)[https://chrome.google.com/webstore/detail/blackfire-profiler/miefikpgahefdbcgoiicnmpbeeomffld]. 

Different version of PHP can be tested using envoriemnt variables like so:

```

LOCAL_PHP=7.2-fpm npm run env:start
```

The list of avaliable PHP version can be found on (docker hub)[https://hub.docker.com/r/spacedmonkey/wpdev-docker-images-blackfire/tags]. 