/**
 * CLI command to benchmark several URLs for Core Web Vitals and other key metrics.
 *
 * WPP Research, Copyright 2023 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/**
 * External dependencies
 */
import puppeteer, { Browser, PredefinedNetworkConditions } from 'puppeteer';
import round from 'lodash-es/round.js';

/* eslint-disable jsdoc/valid-types */
/** @typedef {import("puppeteer").NetworkConditions} NetworkConditions */
/** @typedef {keyof typeof import("puppeteer").networkConditions} NetworkConditionName */
/* eslint-enable jsdoc/valid-types */

/**
 * Internal dependencies
 */
import { getURLs } from '../lib/cli/args.mjs';
import {
	log,
	formats,
	table,
	isValidTableFormat,
	OUTPUT_FORMAT_TABLE,
} from '../lib/cli/logger.mjs';
import { calcPercentile } from '../lib/util/math.mjs';
import {
	KEY_PERCENTILES,
	MEDIAN_PERCENTILES,
} from '../lib/util/percentiles.mjs';

export const options = [
	{
		argname: '-u, --url <url>',
		description: 'A URL to run benchmark tests for',
	},
	{
		argname: '-n, --number <number>',
		description: 'Number of requests to perform',
		defaults: 1,
	},
	{
		argname: '-f, --file <file>',
		description: 'File with URLs to run benchmark tests for',
	},
	{
		argname: '-o, --output <output>',
		description: 'Output format: csv or table',
		defaults: OUTPUT_FORMAT_TABLE,
	},
	{
		argname: '-p, --show-percentiles',
		description:
			'Whether to show more granular percentiles instead of only the median',
	},
	{
		argname: '-t, --throttle-cpu <factor>',
		description: 'Enable CPU throttling to emulate slow CPUs',
	},
	{
		argname: '-c, --network-conditions <predefined>',
		description:
			'Enable emulation of network conditions (may be either "Slow 3G" or "Fast 3G")',
	},
];

/**
 * @typedef {Object} Params
 * @property {?string}            url               - See above.
 * @property {number}             amount            - See above.
 * @property {?string}            file              - See above.
 * @property {string}             output            - See above.
 * @property {boolean}            showPercentiles   - See above.
 * @property {?number}            cpuThrottleFactor - See above.
 * @property {?NetworkConditions} networkConditions - See above.
 */

/**
 * @param {Object}                opt
 * @param {?string}               opt.url
 * @param {string|number}         opt.number
 * @param {?string}               opt.file
 * @param {string}                opt.output
 * @param {boolean}               opt.showPercentiles
 * @param {?string}               opt.throttleCpu
 * @param {?NetworkConditionName} opt.networkConditions
 * @return {Params} Parameters.
 */
function getParamsFromOptions( opt ) {
	const params = {
		url: opt.url,
		amount:
			typeof opt.number === 'number'
				? opt.number
				: parseInt( opt.number, 10 ),
		file: opt.file,
		output: opt.output,
		showPercentiles: Boolean( opt.showPercentiles ),
		cpuThrottleFactor: null,
		networkConditions: null,
	};

	if ( isNaN( params.amount ) ) {
		throw new Error(
			`Supplied number "${ opt.number }" is not an integer.`
		);
	}

	if ( ! isValidTableFormat( params.output ) ) {
		throw new Error(
			`Invalid output ${ opt.output }. The output format provided via the --output (-o) argument must be either "table" or "csv".`
		);
	}

	if ( ! params.file && ! params.url ) {
		throw new Error(
			'You need to provide a URL to benchmark via the --url (-u) argument, or a file with multiple URLs via the --file (-f) argument.'
		);
	}

	if ( opt.throttleCpu ) {
		params.cpuThrottleFactor = parseFloat( opt.throttleCpu );
		if ( isNaN( params.cpuThrottleFactor ) ) {
			throw new Error(
				`Supplied CPU throttle factor "${ opt.throttleCpu }" is not a number.`
			);
		}
	}

	if ( opt.networkConditions ) {
		if ( ! ( opt.networkConditions in PredefinedNetworkConditions ) ) {
			throw new Error(
				`Unrecognized predefined network condition: ${ opt.networkConditions }`
			);
		}
		params.networkConditions =
			PredefinedNetworkConditions[ opt.networkConditions ];
	}

	return params;
}

export async function handler( opt ) {
	const params = getParamsFromOptions( opt );
	const results = [];

	const browser = await puppeteer.launch( { headless: 'new' } );

	for await ( const url of getURLs( opt ) ) {
		const { completeRequests, metrics } = await benchmarkURL(
			browser,
			params
		);

		results.push( [ url, completeRequests, metrics ] );
	}

	await browser.close();

	if ( results.length === 0 ) {
		log( formats.error( 'No results returned.' ) );
	} else {
		outputResults( opt, results );
	}
}

/**
 * @param {Browser} browser
 * @param {Params}  params
 * @return {Promise<{completeRequests: number, metrics: {}}>} Results
 */
async function benchmarkURL( browser, params ) {
	/*
	 * For now this only includes load time metrics.
	 * In the future, additional Web Vitals like CLS, FID, and INP should be
	 * added, however they are slightly more complex to retrieve through an
	 * automated headless browser test.
	 * See https://github.com/GoogleChromeLabs/wpp-research/pull/41.
	 */
	const metricsDefinition = {
		FCP: {
			listen: 'onFCP',
			global: 'webVitalsFCP',
			results: [],
		},
		LCP: {
			listen: 'onLCP',
			global: 'webVitalsLCP',
			results: [],
		},
		TTFB: {
			listen: 'onTTFB',
			global: 'webVitalsTTFB',
			results: [],
		},
	};

	/*
	 * Aggregate metrics are metrics which are calculated for every request as
	 * a combination of other metrics.
	 */
	const aggregateMetricsDefinition = {
		'LCP-TTFB': {
			add: [ 'LCP' ],
			subtract: [ 'TTFB' ],
		},
	};

	let completeRequests = 0;

	let scriptTag = `import { ${ Object.values( metricsDefinition )
		.map( ( value ) => value.listen )
		.join( ', ' ) } } from "https://unpkg.com/web-vitals@3?module";`;
	Object.values( metricsDefinition ).forEach( ( value ) => {
		scriptTag += `${ value.listen }( ( { name, delta } ) => { window.${ value.global } = name === 'CLS' ? delta * 1000 : delta; } );`;
	} );

	for ( let requestNum = 0; requestNum < params.amount; requestNum++ ) {
		const page = await browser.newPage();
		await page.setBypassCSP( true ); // Bypass CSP so the web vitals script tag can be injected below.
		if ( params.cpuThrottleFactor ) {
			await page.emulateCPUThrottling( params.cpuThrottleFactor );
		}

		if ( params.networkConditions ) {
			await page.emulateNetworkConditions( params.networkConditions );
		}

		// Set viewport similar to @wordpress/e2e-test-utils 'large' configuration.
		await page.setViewport( { width: 960, height: 700 } );
		await page
			.mainFrame()
			.waitForFunction(
				'window.innerWidth === 960 && window.innerHeight === 700'
			);

		// Load the page.
		const url = new URL( params.url );
		url.searchParams.append( 'rnd', String( requestNum ) );

		// Make sure any username and password in the URL is passed along for authentication.
		if ( url.username && url.password ) {
			await page.authenticate( {
				username: url.username,
				password: url.password,
			} );
		}

		const response = await page.goto( url.toString(), {
			waitUntil: 'networkidle0',
		} );
		await page.addScriptTag( { content: scriptTag, type: 'module' } );

		if ( response.status() !== 200 ) {
			continue;
		}

		completeRequests++;

		await Promise.all(
			Object.values( metricsDefinition ).map( async ( value ) => {
				// Wait until global is populated.
				await page.waitForFunction(
					`window.${ value.global } !== undefined`
				);

				/*
				 * Do a random click, since only that triggers certain metrics
				 * like LCP, as only a user interaction stops reporting new LCP
				 * entries. See https://web.dev/lcp/.
				 *
				 * Click off screen to prevent clicking a link by accident and navigating away.
				 */
				await page.click( 'body', { offset: { x: -500, y: -500 } } );
				// Get the metric value from the global.
				/** @type {number} */
				const metric = await page.evaluate(
					( global ) => /** @type {number} */ window[ global ],
					value.global
				);
				value.results.push( metric );
			} )
		).catch( () => {
			/* Ignore errors. */
		} );
	}

	const metrics = {};
	Object.entries( metricsDefinition ).forEach( ( [ key, value ] ) => {
		if ( value.results.length ) {
			metrics[ key ] = value.results;
		}
	} );

	Object.entries( aggregateMetricsDefinition ).forEach(
		( [ key, value ] ) => {
			// Bail if any of the necessary partial metrics are not provided.
			const partialMetrics = [
				...( value.add || [] ),
				...( value.subtract || [] ),
			];
			if ( ! partialMetrics.length ) {
				return;
			}
			for ( const metricKey of partialMetrics ) {
				if ( ! metrics[ metricKey ] ) {
					return;
				}
			}

			// Initialize all values for the metric as 0.
			metrics[ key ] = [];
			const numResults = value.add
				? metrics[ value.add[ 0 ] ].length
				: metrics[ value.subtract[ 0 ] ].length;
			for ( let n = 0; n < numResults; n++ ) {
				metrics[ key ].push( 0.0 );
			}

			// Add and subtract all values.
			if ( value.add ) {
				value.add.forEach( ( metricKey ) => {
					metrics[ metricKey ].forEach(
						( metricValue, metricIndex ) => {
							metrics[ key ][ metricIndex ] += metricValue;
						}
					);
				} );
			}
			if ( value.subtract ) {
				value.subtract.forEach( ( metricKey ) => {
					metrics[ metricKey ].forEach(
						( metricValue, metricIndex ) => {
							metrics[ key ][ metricIndex ] -= metricValue;
						}
					);
				} );
			}
		}
	);

	return { completeRequests, metrics };
}

function outputResults( opt, results ) {
	const len = results.length;
	const allMetricNames = {};

	for ( let i = 0; i < len; i++ ) {
		for ( const metric of Object.keys( results[ i ][ 2 ] ) ) {
			allMetricNames[ metric ] = '';
		}
	}

	const percentiles = opt.showPercentiles
		? KEY_PERCENTILES
		: MEDIAN_PERCENTILES;

	const headings = [ 'URL', 'Success Rate' ];

	/*
	 * Alternatively to the if-else below, we could simply iterate through
	 * the percentiles unconditionally, however in case of median we should
	 * rather use the easier-to-understand "(median)" label.
	 */
	if ( opt.showPercentiles ) {
		Object.keys( allMetricNames ).forEach( ( metricName ) => {
			percentiles.forEach( ( percentile ) => {
				headings.push( `${ metricName } (p${ percentile })` );
			} );
		} );
	} else {
		Object.keys( allMetricNames ).forEach( ( metricName ) => {
			headings.push( `${ metricName } (median)` );
		} );
	}

	const tableData = [];

	for ( let i = 0; i < len; i++ ) {
		const [ url, completeRequests, metrics ] = results[ i ];
		const completionRate = round(
			( 100 * completeRequests ) / ( opt.number || 1 ),
			1
		);

		const tableRow = [ url, `${ completionRate }%` ];
		Object.keys( allMetricNames ).forEach( ( metricName ) => {
			percentiles.forEach( ( percentile ) => {
				if ( ! metrics[ metricName ] ) {
					tableRow.push( '' );
				} else {
					tableRow.push(
						round(
							calcPercentile( percentile, metrics[ metricName ] ),
							2
						)
					);
				}
			} );
		} );

		tableData.push( tableRow );
	}

	log( table( headings, tableData, opt.output, true ) );
}
