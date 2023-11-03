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
import round from 'lodash-es/round.js';

/* eslint-disable jsdoc/valid-types */
/** @typedef {import("web-vitals").LCPMetricWithAttribution} LCPMetricWithAttribution */
/* eslint-enable jsdoc/valid-types */

/**
 * Internal dependencies
 */
import {
	isValidTableFormat,
	output,
	table,
	OUTPUT_FORMAT_TABLE,
} from '../lib/cli/logger.mjs';

/**
 * @typedef {Object} Device
 * @property {string}  userAgent User-Agent.
 * @property {number}  width     Width.
 * @property {number}  height    Height.
 * @property {boolean} isMobile  Is mobile.
 */

/**
 * @type {Object<string, Device>}
 */
const devices = {
	mobile: {
		width: 360,
		height: 800,
		userAgent:
			'Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/117.0.5938.140 Mobile Safari/537.36',
		isMobile: true,
	},
	desktop: {
		width: 1920,
		height: 1080,
		userAgent:
			'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/117.0.0.0 Safari/537.36',
		isMobile: false,
	},
};

/**
 * Command-line arguments.
 *
 * @type {Object}
 */
export const options = [
	{
		argname: '-u, --url <url>',
		description: 'A URL to check',
	},
	{
		argname: '-o, --output <output>',
		description: 'Output format: csv, csv-oneline, table, or json', // TODO: Add ability to output CSV as single row for sake of putting in spreadsheet.
		defaults: OUTPUT_FORMAT_TABLE,
	},
];

/**
 * @typedef  {Object} Params
 * @property {string} url    - See above.
 * @property {string} output - See above.
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

	if (
		! isValidTableFormat( params.output ) &&
		! [ 'csv-oneline', 'json' ].includes( params.output )
	) {
		throw new Error(
			`Invalid output ${ opt.output }. The output format provided via the --output (-o) argument must be either "table", "csv", "csv-oneline", or "json".`
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
 * @param {Object} opt
 */
export async function handler( opt ) {
	const params = getParamsFromOptions( opt );
	const browser = await puppeteer.launch( {
		headless: 'new',
		// TODO: Command is not working when opening in non-headless mode. The LCP never fires.
		// headless: false, devtools: true
	} );

	const urlReport = {
		url: params.url,
		deviceAnalyses: {},
	};

	for await ( const [ deviceName, device ] of Object.entries( devices ) ) {
		urlReport.deviceAnalyses[ deviceName ] = await analyze(
			browser,
			params.url,
			device
		);
	}

	await browser.close();

	outputResults( params, urlReport );
}

/**
 * Formats value for CSV or table output.
 *
 * @param {Array|number|boolean|string} value
 * @return {string} Formatted value.
 */
function formatValue( value ) {
	if ( Array.isArray( value ) ) {
		return String( value.length ); // This is the errors array.
	} else if ( typeof value === 'number' ) {
		return String( round( value, 1 ) );
	} else if ( typeof value === 'boolean' ) {
		return value ? 'true' : 'false';
	}
	return value;
}

/**
 * Output results.
 *
 * @param {Params}    params
 * @param {URLReport} urlReport
 */
function outputResults( params, urlReport ) {
	if ( params.output === 'json' ) {
		output( JSON.stringify( urlReport, null, 4 ) );
		return;
	}

	const deviceNames = Object.keys( devices );
	const fieldNames = Object.keys(
		urlReport.deviceAnalyses[ deviceNames[ 0 ] ]
	);

	if ( params.output === 'csv-oneline' ) {
		const headings = [ 'url' ];
		const values = [ params.url ];

		for ( const deviceName of deviceNames ) {
			for ( const fieldName of fieldNames ) {
				headings.push( `${ deviceName }:${ fieldName }` );
				values.push(
					formatValue(
						urlReport.deviceAnalyses[ deviceName ][ fieldName ]
					)
				);
			}
		}

		output( headings.join( ',' ) );
		output( values.join( ',' ) );
		return;
	}

	const headings = [ 'field', ...deviceNames ];
	const tableData = [];

	for ( const fieldName of fieldNames ) {
		const tableRow = [ fieldName ];
		for ( const deviceName of deviceNames ) {
			tableRow.push(
				formatValue(
					urlReport.deviceAnalyses[ deviceName ][ fieldName ]
				)
			);
		}
		tableData.push( tableRow );
	}

	output( table( headings, tableData, params.output ) );
}

/**
 * @typedef {Object} DeviceAnalysis
 * @property {number}   lcpMetric                    LCP metric.
 * @property {string}   lcpElement                   LCP element.
 * @property {boolean}  lcpElementIsLazyLoaded       Whether the LCP element is lazy-loaded.
 * @property {boolean}  lcpImageMissingFetchPriority The element with fetchpriority=high is the LCP element.
 * @property {number}   fetchPriorityCount           Number of images with fetchpriority=high.
 * @property {number}   fetchPriorityInsideViewport  Count of images with fetchpriority=high inside the viewport.
 * @property {number}   fetchPriorityOutsideViewport Count of images with fetchpriority=high outside the viewport.
 * @property {number}   lazyLoadableCount            Count of elements that can be lazy-loaded.
 * @property {number}   lazyLoadedInsideViewport     Count of lazy-loaded images inside the viewport.
 * @property {number}   lazyLoadedOutsideViewport    Count of lazy-loaded images outside the viewport.
 * @property {number}   eagerLoadedInsideViewport    Count of eager-loaded images inside the viewport.
 * @property {number}   eagerLoadedOutsideViewport   Count of eager-loaded images outside the viewport.
 * @property {string[]} errors                       Error codes.
 */

/**
 * @typedef {Object} URLReport
 * @property {string}                         url            URL.
 * @property {Object<string, DeviceAnalysis>} deviceAnalyses Device analyses.
 */

/**
 * Analyze a given URL for loading optimization issues.
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
	await page.mainFrame().waitForFunction(
		// language=JS
		`window.innerWidth === ${ width } && window.innerHeight === ${ height }`
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
		throw new Error(
			`Analysis of ${ url } failed with ${ response.status() }`
		);
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

	/** @type {DeviceAnalysis} */
	const finalAnalysis = await page.evaluate( ( webVitalsLcpGlobal ) => {
		/* eslint-env browser */

		/**
		 * Checks whether an element is in the viewport.
		 *
		 * @todo This should return a percentage of how much the element is in the viewport.
		 * @todo We should also factor in how much an element is outside the viewport. If there is an eager loaded image that is just outside the viewport, this should be OK.
		 *
		 * @param {Element} element
		 * @return {boolean} Whether element is in the viewport.
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

		/**
		 * Checks whether an image has a data: URL.
		 *
		 * @param {HTMLImageElement} image
		 * @return {boolean} Whether the image has a data: URL.
		 */
		function imageHasDataUrl( image ) {
			return image.src.startsWith( 'data:' );
		}

		/**
		 * Determines whether to consider an image.
		 *
		 * @param {HTMLImageElement} image
		 * @return {boolean} Whether to consider image.
		 */
		function shouldConsiderImage( image ) {
			return ! (
				// Skip consideration of tracking pixels.
				(
					( image.width === 1 && image.height === 1 ) ||
					// Skip consideration of data: URLs.
					imageHasDataUrl( image )
				)
			);
		}

		const webVitalsLCP =
			/** @type {LCPMetricWithAttribution} */ window[
				webVitalsLcpGlobal
			];

		const lcpElement = webVitalsLCP.attribution.lcpEntry.element;

		/** @type {DeviceAnalysis} */
		const analysis = {
			lcpMetric: 0,
			lcpElement: '',
			lcpElementIsLazyLoaded: false,
			lcpImageMissingFetchPriority: false,
			fetchPriorityCount: 0,
			fetchPriorityInsideViewport: 0,
			fetchPriorityOutsideViewport: 0,
			lazyLoadableCount: 0,
			lazyLoadedInsideViewport: 0,
			lazyLoadedOutsideViewport: 0,
			eagerLoadedInsideViewport: 0,
			eagerLoadedOutsideViewport: 0,
			errors: [],
		};

		// Obtain lcpMetric.
		analysis.lcpMetric = webVitalsLCP.delta;

		// Obtain lcpElement.
		analysis.lcpElement = lcpElement.tagName;

		// Obtain lcpElementIsLazyLoaded.
		if ( lcpElement.getAttribute( 'loading' ) === 'lazy' ) {
			// TODO: Use lcpElement.loading instead.
			analysis.lcpElementIsLazyLoaded = true;
		}

		// Obtain lcpImageMissingFetchPriority.
		if (
			lcpElement instanceof HTMLImageElement &&
			lcpElement.getAttribute( 'fetchpriority' ) !== 'high' &&
			! imageHasDataUrl( lcpElement ) // Nothing to fetch for a data: URL.
		) {
			analysis.lcpImageMissingFetchPriority = true;
		}

		// Obtain fetchPriorityCount, lcpImageMissingFetchPriority, fetchPriorityInsideViewport, and fetchPriorityOutsideViewport.
		const fetchpriorityHighImages = document.body.querySelectorAll(
			'img[fetchpriority="high"]'
		);
		for ( const img of fetchpriorityHighImages ) {
			analysis.fetchPriorityCount++;

			if ( isElementInViewport( img ) ) {
				analysis.fetchPriorityInsideViewport++;
			} else {
				analysis.fetchPriorityOutsideViewport++;
			}
		}

		const elements = document.body.querySelectorAll( 'img, iframe' );
		for ( const element of elements ) {
			if (
				element instanceof HTMLImageElement &&
				! shouldConsiderImage( element ) // TODO: Should data: URL images still get loading=lazy? Is there a performance benefit?
			) {
				continue;
			}

			analysis.lazyLoadableCount++;

			const isInsideViewport = isElementInViewport( element );
			const isLazyLoaded = element.getAttribute( 'loading' ) === 'lazy'; // TODO: Use element.loading instead.

			if ( isLazyLoaded ) {
				if ( isInsideViewport ) {
					analysis.lazyLoadedInsideViewport++;
				} else {
					analysis.lazyLoadedOutsideViewport++;
				}
			} else if ( isInsideViewport ) {
				analysis.eagerLoadedInsideViewport++;
			} else {
				analysis.eagerLoadedOutsideViewport++;
			}
		}

		return analysis;
	}, 'webVitalsLCP' );

	finalAnalysis.errors = determineErrors( finalAnalysis );

	return finalAnalysis;
}

const ERROR_LCP_IMAGE_MISSING_FETCHPRIORITY = 'LCP_IMAGE_MISSING_FETCHPRIORITY';
const ERROR_LCP_ELEMENT_IS_LAZY_LOADED = 'LCP_ELEMENT_IS_LAZY_LOADED';
const ERROR_LAZY_LOADED_ELEMENT_IN_INITIAL_VIEWPORT =
	'LAZY_LOADED_ELEMENT_IN_INITIAL_VIEWPORT';
const ERROR_FETCHPRIORITY_OUTSIDE_VIEWPORT = 'FETCHPRIORITY_OUTSIDE_VIEWPORT';
const ERROR_EAGER_LOADED_ELEMENT_OUTSIDE_INITIAL_VIEWPORT =
	'EAGER_LOADED_ELEMENT_OUTSIDE_INITIAL_VIEWPORT';

/**
 * Determines errors for a device analysis.
 *
 * @param {DeviceAnalysis} analysis
 * @return {string[]} Errors.
 */
function determineErrors( analysis ) {
	/** @type {string[]} */
	const errors = [];

	// If the lcpElement is IMG, and it doesn't have fetchpriority=high, then this is bad.
	if (
		analysis.lcpElement === 'IMG' &&
		analysis.lcpImageMissingFetchPriority
	) {
		errors.push( ERROR_LCP_IMAGE_MISSING_FETCHPRIORITY );
	}

	// If the lcpElement has loading=lazy, then this is bad.
	if ( analysis.lcpElementIsLazyLoaded ) {
		errors.push( ERROR_LCP_ELEMENT_IS_LAZY_LOADED );
	}

	// If there are lazy-loaded images/iframes in the initial viewport, this is bad.
	if ( analysis.lazyLoadedInsideViewport > 0 ) {
		errors.push(
			...Array( analysis.lazyLoadedInsideViewport ).fill(
				ERROR_LAZY_LOADED_ELEMENT_IN_INITIAL_VIEWPORT
			)
		);
	}

	// If there is a fetchpriority=high image outside the viewport, this is very bad.
	if ( analysis.fetchPriorityOutsideViewport > 0 ) {
		errors.push(
			...Array( analysis.fetchPriorityOutsideViewport ).fill(
				ERROR_FETCHPRIORITY_OUTSIDE_VIEWPORT
			)
		);
	}

	// If there are eager-loaded images/iframes outside the initial viewport, this is not great (but not _bad_).
	if ( analysis.eagerLoadedOutsideViewport > 0 ) {
		errors.push(
			...Array( analysis.eagerLoadedOutsideViewport ).fill(
				ERROR_EAGER_LOADED_ELEMENT_OUTSIDE_INITIAL_VIEWPORT
			)
		);
	}

	return errors;
}
