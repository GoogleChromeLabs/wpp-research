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
import puppeteer from 'puppeteer';
import round from 'lodash-es/round.js';

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
import { KEY_PERCENTILES, MEDIAN_PERCENTILES } from '../lib/util/percentiles.mjs';

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
		description: 'Whether to show more granular percentiles instead of only the median',
	},
];

export async function handler( opt ) {
	if ( ! isValidTableFormat( opt.output ) ) {
		log(
			formats.error(
				'The output format provided via the --output (-o) argument must be either "table" or "csv".'
			)
		);
		return;
	}

	const { number: amount } = opt;
	const results = [];

	const browser = await puppeteer.launch();

	for await ( const url of getURLs( opt ) ) {
		const { completeRequests, metrics } = await benchmarkURL(
			browser,
			{
				url,
				amount,
			}
		);

		results.push( [ url, completeRequests, metrics ] );
	}

	await browser.close();

	if ( results.length === 0 ) {
		log(
			formats.error(
				'You need to provide a URL to benchmark via the --url (-u) argument, or a file with multiple URLs via the --file (-f) argument.'
			)
		);
	} else {
		outputResults( opt, results );
	}
}

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
			get: () => window.webVitalsFCP,
			results: [],
		},
		LCP: {
			listen: 'onLCP',
			global: 'webVitalsLCP',
			get: () => window.webVitalsLCP,
			results: [],
		},
		TTFB: {
			listen: 'onTTFB',
			global: 'webVitalsTTFB',
			get: () => window.webVitalsTTFB,
			results: [],
		},
	};

	let completeRequests = 0;
	let requestNum = 0;

	let scriptTag = `import { ${ Object.values( metricsDefinition ).map( ( value ) => value.listen ).join( ', ' ) } } from "https://unpkg.com/web-vitals@3?module";`;
	Object.values( metricsDefinition ).forEach( ( value ) => {
		scriptTag += `${ value.listen }( ( { name, delta } ) => { window.${ value.global } = name === 'CLS' ? delta * 1000 : delta; } );`;
	} )

	for ( requestNum = 0; requestNum < params.amount; requestNum++ ) {
		const page = await browser.newPage();

		// Set viewport similar to @wordpress/e2e-test-utils 'large' configuration.
		await page.setViewport( { width: 960, height: 700 } );
		await page.mainFrame().waitForFunction( 'window.innerWidth === 960 && window.innerHeight === 700' );

		// Load the page.
		const response = await page.goto( `${ params.url }?rnd=${ requestNum }`, { waitUntil: 'networkidle0' } );
		await page.addScriptTag( { content: scriptTag, type: 'module' } );

		if ( response.status() !== 200 ) {
			continue;
		}

		completeRequests++;

		await Promise.all(
			Object.values( metricsDefinition ).map( async ( value ) => {
				// Wait until global is populated.
				await page.waitForFunction( `window.${ value.global } !== undefined` );

				/*
				 * Do a random click, since only that triggers certain metrics
				 * like LCP, as only a user interaction stops reporting new LCP
				 * entries. See https://web.dev/lcp/.
				 */
				await page.click( 'body' );

				// Get the metric value from the global.
				const metric = await page.evaluate( value.get );
				value.results.push( metric );
			} )
		).catch( ( err ) => { /* Ignore errors. */ } );
	}

	const metrics = {};
	Object.entries( metricsDefinition ).forEach( ( [ key, value ] ) => {
		if ( value.results.length ) {
			metrics[ key ] = value.results;
		}
	} );

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

	const percentiles = opt.showPercentiles ? KEY_PERCENTILES : MEDIAN_PERCENTILES;

	const headings = [
		'URL',
		'Success Rate',
	];

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

		const tableRow = [
			url,
			`${ completionRate }%`,
		];
		Object.keys( allMetricNames ).forEach( ( metricName ) => {
			percentiles.forEach( ( percentile ) => {
				if ( ! metrics[ metricName ] ) {
					tableRow.push( '' );
				} else {
					tableRow.push( round( calcPercentile( percentile, metrics[ metricName ] ), 2 ) );
				}
			} );
		} );

		tableData.push( tableRow );
	}

	log( table( headings, tableData, opt.output, true ) );
}
