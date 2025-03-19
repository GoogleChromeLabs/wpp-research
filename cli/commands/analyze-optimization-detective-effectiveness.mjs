/**
 * CLI command to analyze the URL for a page using Optimization Detective to measure its effectiveness at improving performance.
 *
 * WPP Research, Copyright 2025 Google LLC
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

const version = 1;

/**
 * External dependencies
 */
import puppeteer, { Browser, PredefinedNetworkConditions, KnownDevices } from 'puppeteer';
import fs from 'fs';
import path from 'path';

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
	output,
} from '../lib/cli/logger.mjs';

export const options = [
	{
		argname: '-u, --url <url>',
		description: 'URL for a page using Optimization Detective.',
		required: true,
	},
	{
		argname: '-o, --output-dir <output_dir>',
		description: 'Output directory for the results. Must exist.',
		required: true,
	},
	{
		argname: '--force',
		description: 'Force re-analyzing a URL which has already been analyzed.',
		required: false,
		default: false,
	}
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
 * @param {object} opt
 * @param {string} opt.url
 * @param {string} opt.outputDir
 * @param {boolean} opt.force
 * @returns {Promise<void>}
 */
export async function handler( opt ) {
	if ( ! fs.existsSync( opt.outputDir ) ) {
		throw new Error( `Output directory ${ opt.outputDir } does not exist.` );
	}

	// TODO: Instead of version.txt it should be something like results.json

	// Abort if we've already obtained the results for this.
	const versionFile = path.join( opt.outputDir, 'version.txt' );
	if ( ! opt.force && fs.existsSync( versionFile ) ) {
		const previousVersion = parseInt( fs.readFileSync( versionFile, { encoding: 'utf-8' } ) );
		if ( version === previousVersion ) {
			log( 'Output was generated for the current version, so there is nothing to do. Aborting.' );
			return;
		}
	}

	const browser = await puppeteer.launch( {
		headless: true
	} );

	let didError = false;
	try {
		const data = {
			url: opt.url,
			results: {
				mobile: {
					disabled: await analyze( opt.url, browser, mobileDevice, false ),
					enabled: await analyze( opt.url, browser, mobileDevice, true ),
				},
				desktop: {
					disabled: await analyze( opt.url, browser, desktopDevice, false ),
					enabled: await analyze( opt.url, browser, desktopDevice, true ),
				}
			}
		};

		fs.writeFileSync(
			path.join( opt.outputDir, 'results.json' ),
			JSON.stringify( data, null, 2 )
		);
	} catch ( err ) {
		console.error( opt.url, err );
		didError = true;
	} finally {
		await browser.close();
	}

	if ( ! didError ) {
		fs.writeFileSync( versionFile, String( version ) );
	}

	process.exit( didError ? 1 : 0 );
}

/**
 * @param {string}  url
 * @param {Browser} browser
 * @param {Device}  emulateDevice
 * @param {boolean} optimizationDetectiveEnabled
 * @return {Promise<Object>} Results
 */
async function analyze(
	url,
	browser,
	emulateDevice,
	optimizationDetectiveEnabled
) {
	const globalVariablePrefix = '__wppResearchWebVitals';

	const urlObj = new URL( url );
	urlObj.searchParams.set(
		optimizationDetectiveEnabled
			? 'optimization_detective_enabled' // Note: This doesn't do anything, but it ensures we're playing fair with possible cache busting.
			: 'optimization_detective_disabled',
		'1'
	);

	const scriptTag = /** lang=JS */`
		import { onLCP, onTTFB } from "https://unpkg.com/web-vitals@4.2.4/dist/web-vitals.js?module";
		onLCP( ( metric ) => { window.${ globalVariablePrefix }LCP = metric; } );
		onTTFB( ( metric ) => { window.${ globalVariablePrefix }TTFB = metric; } );
	`;

	const page = await browser.newPage();
	await page.setBypassCSP( true ); // Bypass CSP so the web vitals script tag can be injected below.
	await page.emulate( emulateDevice );

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

	data.odPreloadLinks = await page.evaluate(
		() => {
			const preloadLinks = [];
			for ( const link of document.querySelectorAll( 'link[ data-od-added-tag ]' ) ) {
				const linkAttributes = {};
				for ( const attribute of link.attributes ) {
					linkAttributes[ attribute.name ] = attribute.value;
				}
				preloadLinks.push( linkAttributes );
			}
			return preloadLinks;
		}
	);

	data.pluginVersions = await page.evaluate(
		() => {
			const pluginVersions = {};
			const pluginSlugs = [ 'optimization-detective', 'image-prioritizer' ];
			for ( const pluginSlug of pluginSlugs ) {
				const meta = document.querySelector( `meta[name="generator"][content^="${ pluginSlug } "]` );
				if ( meta ) {
					pluginVersions[ pluginSlug ] = meta.getAttribute( 'content' ).split( ' ' )[1];
				}
			}
			return pluginVersions;
		}
	);

	return data;
}
