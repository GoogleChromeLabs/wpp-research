/**
 * CLI command to analyze several URLs for initial-viewport image optimization issues.
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
import puppeteer, { Browser } from 'puppeteer';

/* eslint-disable jsdoc/valid-types */
/** @typedef {import("web-vitals").LCPMetricWithAttribution} LCPMetricWithAttribution */
/* eslint-enable jsdoc/valid-types */

/**
 * Internal dependencies
 */
import { getURLs } from '../lib/cli/args.mjs';
import {
	formats,
	isValidTableFormat,
	log,
	table,
	OUTPUT_FORMAT_TABLE,
} from '../lib/cli/logger.mjs';

/**
 * Extension to TypeScript's HTMLIFrameElement with the addition of the missing loading attribute.
 *
 * @typedef {object} HTMLIFrameElementWithLoadingAttribute
 * @extends HTMLIFrameElement
 * @property {'eager'|'lazy'} loading
 */

/**
 * @typedef {object} Device
 * @property {string} userAgent
 * @property {number} width
 * @property {number} height
 * @property {boolean} isMobile
 */

/**
 * @type {Object<string, Device>}
 */
const devices = {
	mobile: {
		width: 360,
		height: 800,
		userAgent: 'Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/117.0.5938.140 Mobile Safari/537.36',
		isMobile: true,
	},
	desktop: {
		width: 1920,
		height: 1080,
		userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/117.0.0.0 Safari/537.36',
		isMobile: false,
	}
};

/**
 * Command-line arguments.
 *
 * @type {object}
 */
export const options = [
	{
		argname: '-u, --url <url>',
		description: 'A URL to check',
	},
	{
		argname: '-o, --output <output>',
		description: 'Output format: csv, table, or json',
		defaults: OUTPUT_FORMAT_TABLE,
	},
];

/**
 * @typedef {Object} Params
 * @property {string} url               - See above.
 * @property {string} output            - See above.
 */

/**
 * @param {Object} opt
 * @param {string} opt.url
 * @param {string} opt.output
 * @return {Params} Parameters.
 */
function getParamsFromOptions( opt ) {
	const params = {
		url: opt.url,
		output: opt.output,
	};

	if ( ! isValidTableFormat( params.output ) && 'json' !== params.output ) {
		throw new Error(
			`Invalid output ${ opt.output }. The output format provided via the --output (-o) argument must be either "table", "csv", or "json".`
		);
	}

	if ( ! params.url ) {
		throw new Error(
			'You need to provide a URL to analyze via the --url (-u) argument.'
		);
	}

	return params;
}

/**
 * Compute average from numbers.
 *
 * @param {Number[]} numbers
 * @return {Number|null} Average or null if no numbers were passed.
 */
function average( numbers ) {
	if ( numbers.length === 0 ) {
		return null;
	}
	return numbers.reduce( ( a, b ) => a + b ) / numbers.length
}

/**
 *
 * @param {Object} opt
 * @returns {Promise<void>}
 */
export async function handler( opt ) {
	const params   = getParamsFromOptions( opt );

	const browser = await puppeteer.launch( {
		headless: 'new'
		// TODO: Command is not working when opening in non-headless mode. The LCP never fires.
		// headless: false, devtools: true
	} );

	const urlReport = {
		url: params.url,
		deviceAnalyses: {},
	};

	// TODO: Add typedef.
	// const aggregation = {
	// 	lcpMetric: [],
	// 	fetchPriorityCount: [],
	// 	fetchPriorityIsLcp: [],
	// 	fetchPriorityOutsideViewport: [],
	// 	lazyLoadedInsideViewport: [],
	// };

	for await ( const [ deviceName, device ] of Object.entries( devices ) ) {
		urlReport.deviceAnalyses[ deviceName ] = await analyze(
			browser,
			params.url,
			device
		);

		// for ( const [ key, value ] of Object.entries( analysis ) ) {
		//
		// }

		// aggregation.lcpMetric.push( result.lcpMetric );
		//
		// // If the LCP element is an image, aggregate whether an image with fetchpriority=high is the LCP element.
		// // TODO: If not, should we just aggregate a 1?
		// if ( result.lcpElement === 'IMG' ) {
		// 	aggregation.fetchPriorityIsLcp.push( result.fetchPriorityIsLcp );
		// }
		// aggregation.fetchPriorityOutsideViewport.push( result.fetchPriorityOutsideViewport );
		//
		// aggregation.lazyLoadedInsideViewport.push( result.lazyLoadedInsideViewport );
	}

	// // TODO: Add typedef. Avoid string indexes.
	// analysis['average:lcpMetric'] = average( aggregation.lcpMetric );
	// analysis['average:fetchPriorityIsLcp'] = average( aggregation.fetchPriorityIsLcp );
	// analysis['average:fetchPriorityOutsideViewport'] = average( aggregation.fetchPriorityOutsideViewport );
	// analysis['average:lazyLoadedInsideViewport'] = average( aggregation.lazyLoadedInsideViewport );

	// analysis.score = 100;
	//
	// // If there was an LCP image, this is the most important factor in the score. If all devices had an LCP image,
	// // and this image had fetchpriority=high, then this should retain a 100 score. If desktop had fetchpriority=high
	// // on the LCP image, but mobile did not, then the score should go down to 50.
	// if ( analysis['average:fetchPriorityIsLcp'] !== null ) {
	// 	analysis.score *= analysis['average:fetchPriorityIsLcp'];
	// }
	//
	// // If there are fetchpriority=high images outside the viewport, this must negatively impact the score, but not
	// // as severely as if fetchpriority=high was not set on the LCP image (above). The best score is if there were
	// // no such images outside the viewport.
	// if ( analysis['average:fetchPriorityOutsideViewport'] > 0 ) {
	// 	analysis.score *= 0.75; // Deduct 25% from the score for fetchpriority being outside the viewport.
	// }

	// If there are lazy-loaded images inside the viewport, this must negatively impact the score. If all the
	// images in the initial viewport were lazy-loaded, then reduce the score by 25%. But if only half of the images
	// were lazy-loaded, only reduce by half that much.
	// if ( analysis['average:lazyLoadableElementsInsideViewport'] > 0 ) {
	// 	const lazyLoadSuccessRate = analysis['average:lazyLoadedInsideViewport'] / analysis['average:lazyLoadableElementsInsideViewport'];
	//
	// 	analysis.lazyLoadSuccessRate = lazyLoadSuccessRate;
	//
	// 	/*
	// 	 * If success rate was 100% then multiply by 1.
	// 	 * If success rate was 50% then multiply by 0.875
	// 	 * If success rate was 0% then multiply by 0.75.
	// 	 */
	// 	analysis.score *= 0.75 + 0.25 * ( 1.0 - lazyLoadSuccessRate );
	// }

	await browser.close();

	outputResults( params, urlReport );
}

/**
 * Output results.
 *
 * @param {Params} params
 * @param {URLReport} urlReport
 */
function outputResults( params, urlReport ) {
	if ( params.output === 'json' ) {
		log( urlReport );
		return;
	}

	const deviceNames = Object.keys( devices );
	const fieldNames = Object.keys( urlReport.deviceAnalyses[ deviceNames[0] ] );
	const headings = [ 'field', ...deviceNames ];
	const tableData = [];

	for ( const fieldName of fieldNames ) {
		const tableRow = [ fieldName ];
		for ( const deviceName of deviceNames ) {
			tableRow.push( urlReport.deviceAnalyses[ deviceName ][ fieldName ] );
		}
		tableData.push( tableRow );
	}

	log( table( headings, tableData, params.output ) );
}

/**
 * @typedef {Object} DeviceAnalysis
 * @property {number}  lcpMetric
 * @property {string}  lcpElement
 * @property {boolean} fetchPriorityIsLcp
 * @property {number}  fetchPriorityCount
 * @property {number}  fetchPriorityInsideViewport
 * @property {number}  fetchPriorityOutsideViewport
 * @property {number}  lazyLoadableCount
 * @property {number}  lazyLoadedInsideViewport
 * @property {number}  lazyLoadedOutsideViewport
 * @property {number}  eagerLoadedInsideViewport
 * @property {number}  eagerLoadedOutsideViewport
 */

/**
 * @typedef {Object} URLReport
 * @property {string} url
 * @property {Object<string, DeviceAnalysis>} deviceAnalyses
 */

/**
 * Analyze a given URL for LCP image issues.
 *
 * Issues to check:
 *
 * - The fetchpriority attribute is present on an image in the HTML source.
 * - The fetchpriority image is in the viewport on mobile and desktop.
 * - The LCP image on desktop and mobile has the fetchpriority attribute.
 * - No images in the viewport are lazy-loaded.
 *
 * @param {Browser} browser
 * @param {string}  url
 * @param {Device}  device
 * @return {Promise<DeviceAnalysis>} Results
 */
async function analyze( browser, url, { width, height, userAgent, isMobile } ) {
	const scriptTag = /* language=JS */ `
		import { onLCP, onFCP } from "https://unpkg.com/web-vitals@3/dist/web-vitals.attribution.js?module";
		onFCP( ( report ) => {
			// TODO: This doesn't seem like it should be necessary. But without it, LCP is not firing.
			window.webVitalsFCP = report;
		} );
		onLCP( ( report ) => {
			window.webVitalsLCP = report;
		} );
	`;

	const page = await browser.newPage();
	await page.setUserAgent( userAgent );
	await page.setBypassCSP( true ); // Bypass CSP so the web vitals script tag can be injected below.
	await page.setViewport( { width, height } );
	await page.setExtraHTTPHeaders( {
		'Sec-CH-UA-Mobile': isMobile ? '?1' : '?0',
	} );
	await page
		.mainFrame()
		.waitForFunction(
			// language=JS
			`window.innerWidth === ${width} && window.innerHeight === ${height}`
		);

	// Load the page.
	const fetchedUrl = new URL( url );
	fetchedUrl.searchParams.append( 'rnd', String( Math.random() ) ); // Cache bust.

	// Make sure any username and password in the URL is passed along for authentication.
	if ( fetchedUrl.username && fetchedUrl.password ) {
		await page.authenticate( {
			username: fetchedUrl.username,
			password: fetchedUrl.password,
		} );
	}

	const response = await page.goto( fetchedUrl.toString(), {
		waitUntil: 'networkidle0',
	} );
	await page.addScriptTag( { content: scriptTag, type: 'module' } );

	if ( response.status() !== 200 ) {
		throw new Error( `Analysis of ${url} failed with ${response.status()}` );
	}

	// Wait until FCP has been calculated.
	// TODO: If this is not done, then onLCP never fires for some reason.
	await page.waitForFunction(
		// language=JS
		`window['webVitalsFCP'] !== undefined`
	);

	/*
	 * Do a random click, since only that triggers certain metrics
	 * like LCP, as only a user interaction stops reporting new LCP
	 * entries. See https://web.dev/lcp/.
	 *
	 * Click off screen to prevent clicking a link by accident and navigating away.
	 */
	await page.click( 'body', { offset: { x: -500, y: -500 } } );

	// Wait until global is populated.
	await page.waitForFunction(
		// language=JS
		`window['webVitalsLCP'] !== undefined`
	);

	return await page.evaluate(
		() => {

			/**
			 * Checks whether an element is in the viewport.
			 *
			 * @todo This should return a percentage of how much the element is in the viewport.
			 *
			 * @param {HTMLElement|HTMLIFrameElementWithLoadingAttribute} element
			 * @returns {boolean}
			 */
			function isElementInViewport( element ) {
				const rect = element.getBoundingClientRect();
				return (
					rect.top >= 0 &&
					rect.bottom <= window.innerHeight &&
					rect.left >= 0 &&
					rect.right <= window.innerWidth &&
					rect.width > 0 &&
					rect.height > 0
				);
			}

			const webVitalsLCP = /** @type {LCPMetricWithAttribution} */ window['webVitalsLCP'];

			/** @type {DeviceAnalysis} */
			const analysis = {
				lcpMetric: 0,
				lcpElement: '',
				fetchPriorityIsLcp: false,
				fetchPriorityCount: 0,
				fetchPriorityInsideViewport: 0,
				fetchPriorityOutsideViewport: 0,
				lazyLoadableCount: 0,
				lazyLoadedInsideViewport: 0,
				lazyLoadedOutsideViewport: 0,
				eagerLoadedInsideViewport: 0,
				eagerLoadedOutsideViewport: 0,
			};

			// Obtain lcpMetric.
			analysis.lcpMetric = webVitalsLCP.delta;

			// Obtain lcpElement.
			analysis.lcpElement = webVitalsLCP.attribution.lcpEntry.element.tagName;

			// Obtain fetchPriorityCount, fetchPriorityIsLcp, fetchPriorityInsideViewport, and fetchPriorityOutsideViewport.
			/** @type NodeListOf<HTMLImageElement> */
			const fetchpriorityHighImages = document.body.querySelectorAll(  'img[fetchpriority="high"]' );
			for ( const img of fetchpriorityHighImages ) {
				analysis.fetchPriorityCount++;

				if ( img === webVitalsLCP.attribution.lcpEntry.element ) {
					analysis.fetchPriorityIsLcp = true;
				}

				if ( isElementInViewport( img ) ) {
					analysis.fetchPriorityInsideViewport++;
				} else {
					analysis.fetchPriorityOutsideViewport++;
				}
			}

			/** @type NodeListOf<HTMLImageElement|HTMLIFrameElementWithLoadingAttribute> */
			const elements = document.body.querySelectorAll( 'img, iframe' );
			for ( const element of elements ) {

				// Skip consideration of tracking pixels.
				if ( element instanceof HTMLImageElement && element.width === 1 && element.height === 1 ) {
					continue;
				}

				analysis.lazyLoadableCount++;

				const isInsideViewport = isElementInViewport( element );
				const isLazyLoaded = element.loading === 'lazy';

				if ( isLazyLoaded ) {
					if ( isInsideViewport ) {
						analysis.lazyLoadedInsideViewport++;
					} else {
						analysis.lazyLoadedOutsideViewport++;
					}
				} else {
					if ( isInsideViewport ) {
						analysis.eagerLoadedInsideViewport++;
					} else {
						analysis.eagerLoadedOutsideViewport++;
					}
				}
			}

			return analysis;
		}
	);
}
