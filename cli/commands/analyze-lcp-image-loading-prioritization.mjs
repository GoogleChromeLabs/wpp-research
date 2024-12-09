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

export const options = [
	{
		argname: '-u, --url <url>',
		description: 'A URL to run benchmark tests for',
	},
];

const mobileDevice = {
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

const desktopDevice = {
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

/**
 * @typedef {Object} Params
 * @property {string} url - See above.
 */

/**
 * @param {Object}  opt
 * @param {string}  opt.url
 * @return {Params} Parameters.
 */
function getParamsFromOptions( opt ) {
	/** @type {Params} */
	const params = {
		url: opt.url,
	};

	if ( ! params.url ) {
		throw new Error(
			'You need to provide a URL to benchmark via the --url (-u) argument.'
		);
	}

	return params;
}

export async function handler( opt ) {
	const params = getParamsFromOptions( opt );

	const browser = await puppeteer.launch( {
		headless: true
	} );

	const odEnabledUrl = params.url;

	const odDisabledUrlObj = new URL( params.url );
	odDisabledUrlObj.searchParams.set( 'optimization_detective_disabled', '1' );
	const odDisabledUrl = odDisabledUrlObj.href;

	let didError = false;
	try {
		const data = {
			url: params.url,
			results: {
				mobile: {
					disabled: await analyze( odDisabledUrl, browser, mobileDevice ),
					enabled: await analyze( odEnabledUrl, browser, mobileDevice ),
				},
				desktop: {
					disabled: await analyze( odDisabledUrl, browser, desktopDevice ),
					enabled: await analyze( odEnabledUrl, browser, desktopDevice ),
				}
			}
		};
		output( JSON.stringify( data, null, 2 ) );
	} catch ( err ) {
		console.error( params.url, err );
		didError = true;
	} finally {
		await browser.close();
	}
	process.exit( didError ? 1 : 0 );
}

/**
 * @param {string}  url
 * @param {Browser} browser
 * @param {Device}  emulateDevice
 * @return {Promise<Object>} Results
 */
async function analyze(
	url,
	browser,
	emulateDevice,
) {
	const globalVariablePrefix = '__wppResearchWebVitals';

	const scriptTag = /** lang=JS */`
		import { onLCP, onTTFB } from "https://unpkg.com/web-vitals@4.2.4/dist/web-vitals.js?module";
		onLCP( ( metric ) => { window.${ globalVariablePrefix }LCP = metric; } );
		onTTFB( ( metric ) => { window.${ globalVariablePrefix }TTFB = metric; } );
	`;

	const page = await browser.newPage();
	await page.setBypassCSP( true ); // Bypass CSP so the web vitals script tag can be injected below.
	await page.emulate( emulateDevice );

	// Load the page.
	const urlObj = new URL( url );

	// Make sure any username and password in the URL is passed along for authentication.
	if ( urlObj.username && urlObj.password ) {
		await page.authenticate( {
			username: urlObj.username,
			password: urlObj.password,
		} );
	}

	log( `Loading ${ url } as ${ emulateDevice.userAgent }` );

	const response = await page.goto( urlObj.toString(), {
		waitUntil: 'networkidle0',
	} );
	if ( response.status() !== 200 ) {
		throw new Error( `Error: Bad response code ${ response.status() }.` );
	}
	await page.addScriptTag( { content: scriptTag, type: 'module' } );

	const data = {
		device: emulateDevice,
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
			'LCP-TTFB': null,
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
				( /** @type string */ global ) => {
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
						if ( entry.element ) {
							amendedData.element = {
								tagName: entry.element.tagName,
							};
							if ( entry.element instanceof HTMLImageElement ) {
								amendedData.element.fetchPriority = entry.element.getAttribute( 'fetchpriority' );
								amendedData.element.loading = entry.element.getAttribute( 'loading' );
							}
							amendedData.element.odMeta = {};
							for ( const attribute of entry.element.attributes ) {
								const attrPrefix = 'data-od-';
								if ( attribute.name.startsWith( attrPrefix ) ) {
									amendedData.element.odMeta[ attribute.name.substring( attrPrefix.length ) ] = attribute.value;
								}
							}
						} else {
							amendedData.element = null;
						}
					}

					return amendedData;
				},
				globalVariablePrefix + metricName
			);

			Object.assign( data.metrics[ metricName ], amendedData );

			data.metrics['LCP-TTFB'] = {
				value: data.metrics.LCP.value - data.metrics.TTFB.value,
			};
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

	data.odPreloadLinkCount = await page.evaluate(
		() => {
			// TODO: Capture the media attribute too. And assert fetchpriority?
			return document.querySelectorAll( 'head > link[ data-od-added-tag ]' ).length
		}
	);

	data.pluginVersions = await page.evaluate(
		() => {
			const pluginVersions = {};
			const pluginSlugs = [ 'optimization-detective', 'image-prioritizer' ];
			for ( const pluginSlug of pluginSlugs ) {
				const meta = document.querySelector( `head > meta[name="generator"][content^="${ pluginSlug } "]` );
				if ( meta ) {
					pluginVersions[ pluginSlug ] = meta.getAttribute( 'content' ).split( ' ' )[1];
				}
			}
			return pluginVersions;
		}
	);

	return data;
}
