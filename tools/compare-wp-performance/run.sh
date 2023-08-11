#!/usr/bin/env bash

OLD_VERSION=${1-latest}
NEW_VERSION=${2-trunk}
SKIP_INIT=${3-false}

SCRIPT_DIR=$( cd -- "$( dirname -- "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )

# Configure WordPress versions

rm -rf "$SCRIPT_DIR/old/.wp-env.override.json"
rm -rf "$SCRIPT_DIR/new/.wp-env.override.json"

if [[ $OLD_VERSION == 'trunk' ]]; then
	OLD_VERSION='master'
fi

if [[ $NEW_VERSION == 'trunk' ]]; then
	NEW_VERSION='master'
fi

echo "Old version: $OLD_VERSION"

if [[ $OLD_VERSION != 'latest' ]]; then
	if [[ "$OLD_VERSION" == *".zip"* ]]; then
		echo "{\"core\":\"$OLD_VERSION\"}" >> "$SCRIPT_DIR/old/.wp-env.override.json"
	else
		echo "{\"core\":\"WordPress/WordPress#$OLD_VERSION\"}" >> "$SCRIPT_DIR/old/.wp-env.override.json"
	fi
fi

echo "New version: $NEW_VERSION"

if [[ "$NEW_VERSION" == *".zip"* ]]; then
	echo "{\"core\":\"$NEW_VERSION\"}" >> "$SCRIPT_DIR/new/.wp-env.override.json"
else
	echo "{\"core\":\"WordPress/WordPress#$NEW_VERSION\"}" >> "$SCRIPT_DIR/new/.wp-env.override.json"
fi

if [[ $SKIP_INIT != 'true' ]]; then

	# Install WordPress

	(cd "$SCRIPT_DIR/old" && npm i && npm run wp-env --silent start)
	(cd "$SCRIPT_DIR/new" && npm i && npm run wp-env --silent start)

	# Update permalink structure

	(cd "$SCRIPT_DIR/old" && npm run wp-env --silent run tests-cli wp rewrite structure '/%postname%/' -- --hard)
	(cd "$SCRIPT_DIR/new" && npm run wp-env --silent run tests-cli wp rewrite structure '/%postname%/' -- --hard)

	# Delete any data that might already exist by re-installing WordPress.
	# Prevents mock data from being duplicated on subsequent runs.

	(cd "$SCRIPT_DIR/old" && npm run wp-env --silent run tests-cli wp db reset -- --yes)
	(cd "$SCRIPT_DIR/old" && npm run wp-env --silent run tests-cli wp core install -- --url=http://localhost:8891 --title=old --admin_user=admin --admin_password=password --admin_email=wordpress@example.com --skip-email)
	(cd "$SCRIPT_DIR/new" && npm run wp-env --silent run tests-cli wp db reset -- --yes)
	(cd "$SCRIPT_DIR/new" && npm run wp-env --silent run tests-cli wp core install -- --url=http://localhost:8881 --title=new --admin_user=admin --admin_password=password --admin_email=wordpress@example.com --skip-email)

	# Activate plugins (again)

	(cd "$SCRIPT_DIR/old" && npm run wp-env --silent run tests-cli wp plugin activate performance-lab wordpress-importer)
	(cd "$SCRIPT_DIR/new" && npm run wp-env --silent run tests-cli wp plugin activate performance-lab wordpress-importer)

	# Import mock data

	(cd "$SCRIPT_DIR/old" && npm run wp-env --silent run tests-cli curl https://raw.githubusercontent.com/WordPress/theme-test-data/b9752e0533a5acbb876951a8cbb5bcc69a56474c/themeunittestdata.wordpress.xml -- --output /tmp/themeunittestdata.wordpress.xml)
	(cd "$SCRIPT_DIR/old" && npm run wp-env --silent run tests-cli wp import /tmp/themeunittestdata.wordpress.xml -- --authors=create)
	(cd "$SCRIPT_DIR/new" && npm run wp-env --silent run tests-cli curl https://raw.githubusercontent.com/WordPress/theme-test-data/b9752e0533a5acbb876951a8cbb5bcc69a56474c/themeunittestdata.wordpress.xml -- --output /tmp/themeunittestdata.wordpress.xml)
	(cd "$SCRIPT_DIR/new" && npm run wp-env --silent run tests-cli wp import /tmp/themeunittestdata.wordpress.xml -- --authors=create)

	# Deactivate WordPress Importer

	(cd "$SCRIPT_DIR/old" && npm run wp-env --silent run tests-cli wp plugin deactivate wordpress-importer)
	(cd "$SCRIPT_DIR/new" && npm run wp-env --silent run tests-cli wp plugin deactivate wordpress-importer)

else

	(cd "$SCRIPT_DIR/old" && npm run wp-env --silent start)
	(cd "$SCRIPT_DIR/new" && npm run wp-env --silent start)

fi

# Install block theme

(cd "$SCRIPT_DIR/old" && npm run wp-env --silent run tests-cli wp theme activate twentytwentythree)
(cd "$SCRIPT_DIR/new" && npm run wp-env --silent run tests-cli wp theme activate twentytwentythree)

# Benchmark Web Vitals

npm run research --silent -- benchmark-web-vitals -u http://localhost:8881/ -n 20 -p -o csv > before.csv
npm run research --silent -- benchmark-web-vitals -u http://localhost:8891/ -n 20 -p -o csv > after.csv
node "$SCRIPT_DIR/scripts/results.js"  "Web Vitals (Block Theme)" before.csv after.csv

# Benchmark Server-Timing

npm run research --silent  -- benchmark-server-timing -u http://localhost:8881/ -n 100 -p -o csv > before.csv
npm run research --silent  -- benchmark-server-timing -u http://localhost:8891/ -n 100 -p -o csv > after.csv
node "$SCRIPT_DIR/scripts/results.js"  "Server-Timing (Block Theme)" before.csv after.csv

# Install classic theme

(cd "$SCRIPT_DIR/old" && npm run wp-env --silent run tests-cli wp theme activate twentytwentyone)
(cd "$SCRIPT_DIR/new" && npm run wp-env --silent run tests-cli wp theme activate twentytwentyone)

# Benchmark Web Vitals

npm run research --silent -- benchmark-web-vitals -u http://localhost:8881/ -n 20 -p -o csv > before.csv
npm run research --silent -- benchmark-web-vitals -u http://localhost:8891/ -n 20 -p -o csv > after.csv
node "$SCRIPT_DIR/scripts/results.js"  "Web Vitals (Classic Theme)" before.csv after.csv

# Benchmark Server-Timing

npm run research --silent  -- benchmark-server-timing -u http://localhost:8881/ -n 100 -p -o csv > before.csv
npm run research --silent  -- benchmark-server-timing -u http://localhost:8891/ -n 100 -p -o csv > after.csv
node "$SCRIPT_DIR/scripts/results.js" "Server-Timing (Classic Theme)" before.csv after.csv

# Shutdown sites again

(cd "$SCRIPT_DIR/old" && npm run wp-env --silent stop)
(cd "$SCRIPT_DIR/new" && npm run wp-env --silent stop)
