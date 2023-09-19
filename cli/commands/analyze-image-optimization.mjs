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
import puppeteer, { Browser, PredefinedNetworkConditions } from 'puppeteer';
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
import {
	KEY_PERCENTILES,
	MEDIAN_PERCENTILES,
} from '../lib/util/percentiles.mjs';

export const options = [
	{
		argname: '-u, --url <url>',
		description: 'A URL to check',
	},
	{
		argname: '-f, --file <file>',
		description: 'File with URLs to check',
	},
	{
		argname: '-o, --output <output>',
		description: 'Output format: csv or table',
		defaults: OUTPUT_FORMAT_TABLE,
	},
];

const viewports = {
	mobile: {
		width: 360,
		height: 800,
	},
	desktop: {
		width: 1920,
		height: 1080,
	}
};

/**
 * @typedef {Object} Params
 * @property {?string}            url               - See above.
 * @property {?string}            file              - See above.
 * @property {string}             output            - See above.
 */

/**
 * @param {Object}                opt
 * @param {?string}               opt.url
 * @param {?string}               opt.file
 * @param {string}                opt.output
 * @return {Params} Parameters.
 */
function getParamsFromOptions( opt ) {
	const params = {
		url: opt.url,
		file: opt.file,
		output: opt.output,
	};

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

	return params;
}

export async function handler( opt ) {
	const params = getParamsFromOptions( opt );
	const results = [];

	const browser = await puppeteer.launch( {
		headless: 'new'
		// TODO: Command is not working when opening in non-headless mode. The LCP never fires.
		// headless: false, devtools: true
	} );

	for await (const url of getURLs(opt)) {
		for await ( const [ viewportName, viewportDimensions ] of Object.entries( viewports ) ) {
			const result = await analyze(
				browser,
				url,
				viewportDimensions
			);

			// TODO: Better table needed.
			// TODO: Combine results in some way, in particular compare mobile vs desktop for fetchPriorityIsLcp and fetchPriorityInViewport.
			console.log(
				{
					url,
					viewportName,
					...result
				}
			);
		}
	}

	await browser.close();
}

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
 * @param {object}  dimensions
 * @param {number}  dimensions.width
 * @param {number}  dimensions.height
 * @return {Promise<{}>} Results
 */
async function analyze( browser, url, { width, height } ) {
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
	await page.setBypassCSP( true ); // Bypass CSP so the web vitals script tag can be injected below.
	await page.setViewport( { width, height } );
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
		`window.webVitalsFCP !== undefined`
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
		`window.webVitalsLCP !== undefined`
	);

	/** @type {object} */
	const report = await page.evaluate(
		( global ) => /** @type {object} */ window[ global ],
		'webVitalsLCP'
	);

	const fetchPriorityElements = await page.$$( 'img[fetchpriority="high"]' );

	const result = {
		lcpMetric: report.delta,
		fetchPriorityCount: fetchPriorityElements.length,
		fetchPriorityIsLcp: false,
		fetchPriorityInViewport: 0,
		lazyLoadedInViewport: 0,
	};

	result.fetchPriorityIsLcp = await page.evaluate(
		( global ) => {
			for ( const img of document.querySelectorAll( 'img[fetchpriority="high"]' ) ) {
				if ( img === window[ global ].attribution.lcpEntry.element ) {
					return true;
				}
			}
			return false;
		},
		'webVitalsLCP'
	);

	result.fetchPriorityInViewport = await page.evaluate(
		() => {
			let count = 0;
			for ( const img of document.querySelectorAll( 'img[fetchpriority="high"]') ) {
				const rect = img.getBoundingClientRect();
				if (
					rect.top >= 0 &&
					rect.bottom <= window.innerHeight &&
					rect.left >= 0 &&
					rect.right <= window.innerWidth &&
					rect.width > 0 &&
					rect.height > 0
				) {
					count++;
				}
			}
			return count;
		}
	);

	result.lazyLoadedInViewport = await page.evaluate(
		() => {
			let count = 0;
			for ( const img of document.querySelectorAll( 'img[loading="lazy"]') ) {
				const rect = img.getBoundingClientRect();
				if (
					rect.top >= 0 &&
					rect.bottom <= window.innerHeight &&
					rect.left >= 0 &&
					rect.right <= window.innerWidth &&
					rect.width > 0 &&
					rect.height > 0
				) {
					count++;
				}
			}
			return count;
		}
	);

	return result;
}
