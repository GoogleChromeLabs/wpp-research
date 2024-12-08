/**
 * CLI command to analyze sites using Image Prioritizer for  benchmark several URLs for Core Web Vitals and other key metrics.
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
import puppeteer, { Browser, PredefinedNetworkConditions, KnownDevices } from 'puppeteer';
import round from 'lodash-es/round.js';

/* eslint-disable jsdoc/valid-types */
/** @typedef {import("puppeteer").NetworkConditions} NetworkConditions */
/** @typedef {keyof typeof PredefinedNetworkConditions} NetworkConditionName */
/** @typedef {import("puppeteer").Device} Device */
/** @typedef {keyof typeof KnownDevices} KnownDeviceName */
/** @typedef {import("web-vitals").Metric} Metric */
/** @typedef {import("web-vitals").LCPMetric} LCPMetric */

/* eslint-enable jsdoc/valid-types */
// TODO: deviceScaleFactor, isMobile, isLandscape, hasTouch.
/** @typedef {{width: number, height: number}} ViewportDimensions */

/**
 * Internal dependencies
 */
import {
	log,
	logPartial,
	output,
	formats,
	table,
	isValidTableFormat,
	OUTPUT_FORMAT_TABLE,
} from '../lib/cli/logger.mjs';
import * as async_hooks from "node:async_hooks";

export const options = [
	{
		argname: '-u, --url <url>',
		description: 'A URL to run benchmark tests for',
	},
	{
		argname: '-o, --output <output>',
		description: 'Output format: csv or table',
		defaults: OUTPUT_FORMAT_TABLE,
	},
	{
		argname: '-e, --emulate-device <device>',
		description: 'Enable a specific device by name, for example "Moto G4" or "iPad". Values "mobile" and "desktop" correspond to Lighthouse. Defaults to "mobile".',
	},
];

/**
 * @typedef {Object} Params
 * @property {string} url               - See above.
 * @property {string} output            - See above.
 * @property {Device} emulateDevice     - See above.
 */

/**
 * @param {Object}  opt
 * @param {string}  opt.url
 * @param {string}  opt.output
 * @param {?string} opt.emulateDevice
 * @return {Params} Parameters.
 */
function getParamsFromOptions( opt ) {
	/** @type {Params} */
	const params = {
		url: opt.url,
		output: opt.output,
		emulateDevice: null,
	};

	if ( ! isValidTableFormat( params.output ) ) {
		throw new Error(
			`Invalid output ${ opt.output }. The output format provided via the --output (-o) argument must be either "table" or "csv".`
		);
	}

	if ( ! params.url ) {
		throw new Error(
			'You need to provide a URL to benchmark via the --url (-u) argument.'
		);
	}

	if ( ! opt.emulateDevice || opt.emulateDevice === 'mobile' ) {
		params.emulateDevice = {
			// See <https://github.com/GoogleChrome/lighthouse/blob/36cac182a6c637b1671c57326d7c0241633d0076/core/config/constants.js#L42C7-L42C23>.
			userAgent: 'Mozilla/5.0 (Linux; Android 11; moto g power (2022)) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Mobile Safari/537.36',
			// See <https://github.com/GoogleChrome/lighthouse/blob/36cac182a6c637b1671c57326d7c0241633d0076/core/config/constants.js#L11-L22>.
			viewport: {
				isMobile: true,
				width: 412,
				height: 823,
				isLandscape: false,
				deviceScaleFactor: 1.75,
				hasTouch: true,
			}
		};
	} else if ( opt.emulateDevice === 'desktop' ) {
		params.emulateDevice = {
			// See <https://github.com/GoogleChrome/lighthouse/blob/36cac182a6c637b1671c57326d7c0241633d0076/core/config/constants.js#L43>.
			userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
			// See <https://github.com/GoogleChrome/lighthouse/blob/36cac182a6c637b1671c57326d7c0241633d0076/core/config/constants.js#L24-L34>.
			viewport: {
				isMobile: false,
				width: 1350,
				height: 940,
				isLandscape: true,
				deviceScaleFactor: 1,
				hasTouch: false,
			}
		};
	} else if ( opt.emulateDevice in KnownDevices ) {
		params.emulateDevice = KnownDevices[ opt.emulateDevice ];
	} else {
		throw new Error(
			`Unrecognized device to emulate: ${opt.emulateDevice}`
		);
	}

	return params;
}

export async function handler( opt ) {
	const params = getParamsFromOptions( opt );

	const browser = await puppeteer.launch( {
		headless: true
	} );

	// Catch Puppeteer errors to prevent the process from getting stuck.
	const metrics = await analyze(
		params.url,
		browser,
		params
	);

	await browser.close();

	console.log( metrics );
}

/**
 * @param {string}  url
 * @param {Browser} browser
 * @param {Params}  params
 * @return {Promise<Object>} Results
 */
async function analyze(
	url,
	browser,
	params,
) {
	const globalVariablePrefix = '__wppResearchWebVitals';

	const scriptTag = /** lang=JS */`
		import { onLCP, onTTFB } from "https://unpkg.com/web-vitals@4.2.4/dist/web-vitals.js?module";
		onLCP( ( metric ) => { window.${ globalVariablePrefix }LCP = metric; } );
		onTTFB( ( metric ) => { window.${ globalVariablePrefix }TTFB = metric; } );
	`;

	const page = await browser.newPage();
	await page.setBypassCSP( true ); // Bypass CSP so the web vitals script tag can be injected below.
	await page.emulate( params.emulateDevice );

	// Load the page.
	const urlObj = new URL( url );

	// Make sure any username and password in the URL is passed along for authentication.
	if ( urlObj.username && urlObj.password ) {
		await page.authenticate( {
			username: urlObj.username,
			password: urlObj.password,
		} );
	}

	const response = await page.goto( urlObj.toString(), {
		waitUntil: 'networkidle0',
	} );
	if ( response.status() !== 200 ) {
		throw new Error( `Error: Bad response code ${ response.status() }.` );
	}
	await page.addScriptTag( { content: scriptTag, type: 'module' } );

	const data = {
		url,
		device: params.emulateDevice,
		metrics: {
			TTFB: {
				value: null,
			},
			LCP: {
				value: null,
				url: null,
				element: null,
				initiatorType: null,
			},
		}
	};

	await Promise.all(
		[ 'LCP', 'TTFB' ].map( async ( metricName ) => {
			await page.waitForFunction(
				`window.${ globalVariablePrefix }${ metricName } !== undefined`
			);

			/*
			 * Do a random click, since only that triggers certain metrics
			 * like LCP, as only a user interaction stops reporting new LCP
			 * entries. See https://web.dev/lcp/.
			 *
			 * Click off-screen to prevent clicking a link by accident and navigating away.
			 */
			await page.click( 'body', {
				offset: { x: -500, y: -500 },
			} );

			const amendedData = await page.evaluate(
				( global ) => {
					const metric = /** @type Metric */ window[ global ];

					if ( metric.entries.length !== 1 ) {
						throw new Error( `Unexpected number of entries ${ metric.entries.length } for metric ${ metric.name }` );
					}

					const amendedData = {
						value: metric.value,
					};
					if ( 'LCP' === metric.name ) {
						const entry = /** @type LargestContentfulPaint */ metric.entries[0];
						amendedData.url = entry.url;
						amendedData.element = entry?.element?.tagName;
					}

					return amendedData;
				},
				globalVariablePrefix + metricName
			);

			Object.assign( data.metrics[ metricName ], amendedData );
		} )
	);

	if ( data.metrics.LCP.url ) {
		data.metrics.LCP.initiatorType = await page.evaluate(
			( /** @type string */ url ) => {
				const entries =
					/** @type PerformanceResourceTiming[] */ performance.getEntriesByType(
					'resource'
				);
				for ( const entry of entries ) {
					if ( entry.name === url ) {
						return entry.initiatorType;
					}
				}
				return null;
			},
			data.metrics.LCP.url
		);
	}

	return data;
}
