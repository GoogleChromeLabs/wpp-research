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

const version = 2;

/**
 * External dependencies
 */
import puppeteer, { PredefinedNetworkConditions } from 'puppeteer';
import fs from 'fs';
import path from 'path';
import { compare as versionCompare } from 'semver';

/* eslint-disable jsdoc/no-undefined-types */
/* eslint-disable jsdoc/check-line-alignment */
/* eslint-disable jsdoc/require-property-description */

/* eslint-disable jsdoc/valid-types */
/** @typedef {import("web-vitals").Metric} Metric */
/** @typedef {import("puppeteer").HTTPResponse} HTTPResponse */
/** @typedef {import("puppeteer").Page} Page */
/** @typedef {import("puppeteer").Device} Device */
/** @typedef {import("puppeteer").NetworkConditions} NetworkConditions */
/** @typedef {import("puppeteer").Browser} Browser */
/** @typedef {import("web-vitals").LCPMetric} LCPMetric */

/**
 * @typedef {{width: number, height: number, x: number, y: number, top: number, right: number, bottom: number, left: number}} DOMRect
 */

/**
 * @typedef {{isLCP: boolean, isLCPCandidate: boolean, breadcrumbs: string[], xpath: string, tagName: string, attributes: Object<string, string>, sources?: Array<Object<string, string>>, intersectionRatio: number, intersectionRect: DOMRect, boundingClientRect: DOMRect }} VisitedElement
 */

/* eslint-enable jsdoc/valid-types */
// TODO: deviceScaleFactor, isMobile, isLandscape, hasTouch.
/** @typedef {{width: number, height: number}} ViewportDimensions */
/**
 * @typedef {Object} AnalysisResult
 * @property {Device} device
 * @property {NetworkConditions} network
 * @property {{
 *         TTFB: {
 *             value: number
 *         },
 *         LCP: {
 *             value: number,
 *             url: string|null,
 *             element: object|null,
 *             initiatorType: string|null,
 *             preloadedByOD: boolean,
 *         },
 *         'LCP-TTFB': {
 *             value: number
 *         }
 *     }} metrics
 * @property {Object<string, string>} pluginVersions
 * @property {string[]} metaGenerators
 * @property {Array<Object<string, string>>} odLinks
 * @property {Array<VisitedElement>} elements
 */

/**
 * @typedef {Object} AnalyzeOptions
 * @property {string}      url
 * @property {string}      outputDir
 * @property {boolean}     force
 * @property {boolean}     requestOptimizedFirst
 * @property {boolean}     requestDesktopFirst
 * @property {boolean}     skipNetworkPriming
 * @property {string|null} pauseDuration
 * @property {boolean}     verbose
 * @property {string}      oldestOptimizationDetectiveVersion
 * @property {string}      oldestImagePrioritizerVersion
 */

/**
 * Internal dependencies
 */
import { log } from '../lib/cli/logger.mjs';

/**
 * Options.
 *
 * @type {Array<{argname: string, description: string, required?: boolean, defaults?: *}>}
 */
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
		description:
			'Force re-analyzing a URL which has already been analyzed.',
		required: false,
		defaults: false,
	},
	{
		argname: '--skip-network-priming',
		description:
			'Whether to skip making an initial network-priming request to the URL before the requests to collect metrics.',
	},
	{
		argname: '--request-optimized-first',
		description:
			'Whether to request the optimized version first before requesting the original (non-optimized) version.',
		required: false,
		defaults: false,
	},
	{
		argname: '--request-desktop-first',
		description:
			'Whether to request the desktop version first before requesting the mobile version.',
		required: false,
		defaults: false,
	},
	{
		argname: '-v, --verbose',
		description: 'Log out which requests are being made.',
		required: false,
		defaults: false,
	},
	{
		argname: '--pause-duration <milliseconds>',
		description: 'Time to wait between requests.',
		required: false,
	},
	{
		argname: '--oldest-optimization-detective-version <version>',
		description:
			'The oldest version of Optimization Detective that will be considered.',
		required: false,
		defaults: '1.0.0-beta3',
	},
	{
		argname: '--oldest-image-prioritizer-version <version>',
		description:
			'The oldest version of Image Prioritizer that will be considered.',
		required: false,
		defaults: '1.0.0-beta2',
	},
];

/**
 * @see https://github.com/GoogleChrome/lighthouse/blob/36cac182a6c637b1671c57326d7c0241633d0076/core/config/constants.js#L42C7-L42C23
 * @see https://github.com/GoogleChrome/lighthouse/blob/36cac182a6c637b1671c57326d7c0241633d0076/core/config/constants.js#L11-L22
 * @type {Device}
 */
const mobileDevice = {
	userAgent:
		'Mozilla/5.0 (Linux; Android 11; moto g power (2022)) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Mobile Safari/537.36',
	viewport: {
		isMobile: true,
		width: 412,
		height: 823,
		isLandscape: false,
		deviceScaleFactor: 1.75,
		hasTouch: true,
	},
};

/**
 * @see https://github.com/GoogleChrome/lighthouse/blob/36cac182a6c637b1671c57326d7c0241633d0076/core/config/constants.js#L43
 * @see https://github.com/GoogleChrome/lighthouse/blob/36cac182a6c637b1671c57326d7c0241633d0076/core/config/constants.js#L24-L34
 * @type {Device}
 */
const desktopDevice = {
	userAgent:
		'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
	viewport: {
		isMobile: false,
		width: 1350,
		height: 940,
		isLandscape: true,
		deviceScaleFactor: 1,
		hasTouch: false,
	},
};

/**
 * Network conditions used for mobile in Lighthouse/PSI.
 *
 * Note that "Slow 4G" is an alias for "Fast 3G".
 * ~1.6 Mbps down, ~0.75 Mbps up, 150ms RTT (with slowdown factors).
 *
 * @see https://github.com/puppeteer/puppeteer/blob/60c72280ad9eee447e6ddeeaf3d7c2606dfb4f10/packages/puppeteer-core/src/cdp/PredefinedNetworkConditions.ts#L62-L71
 * @type {NetworkConditions}
 */
const mobileNetworkConditions = PredefinedNetworkConditions[ 'Slow 4G' ];

/**
 * Network conditions used for desktop in Lighthouse/PSI.
 *
 * 10,240 kb/s throughput with 40 ms TCP RTT.
 *
 * @see https://github.com/paulirish/lighthouse/blob/f0855904aaffaecf3089169449646960782d7e92/core/config/constants.js#L40-L49
 * @see https://docs.google.com/document/d/1-p4HSp42REEA5-jCBVB6PqQcVhI1nQIblBCNKhPJUXg/edit?tab=t.0#heading=h.jsap7yf4phk6
 * @type {NetworkConditions}
 */
const desktopNetworkConditions = {
	download: ( 10240 * 1000 ) / 8,
	upload: ( 10240 * 1000 ) / 8,
	latency: 40,
};

/**
 * @param {AnalyzeOptions} opt
 * @return {Promise<void>}
 */
export async function handler( opt ) {
	if ( ! fs.existsSync( opt.outputDir ) ) {
		throw new Error(
			`Output directory ${ opt.outputDir } does not exist.`
		);
	}

	// TODO: Add an option like `--previously-errored-only` which will only proceed if there is an errors.txt file.
	// Abort if we've already obtained the results for this.
	const versionFile = path.join( opt.outputDir, 'version.txt' );
	if ( ! opt.force && fs.existsSync( versionFile ) ) {
		const previousVersion = parseInt(
			fs.readFileSync( versionFile, { encoding: 'utf-8' } )
		);
		if ( version === previousVersion ) {
			log(
				'Output was generated for the current version, so there is nothing to do. Aborting.'
			);
			return;
		}
	}

	let browser;

	let pauseDuration = 0;
	if ( opt.pauseDuration ) {
		pauseDuration = parseInt( opt.pauseDuration, 10 );
	}

	async function pauseIfRequested() {
		if ( pauseDuration > 0 ) {
			await new Promise( ( resolve ) => {
				if ( opt.verbose ) {
					log( `Pausing for ${ pauseDuration } ms.` );
				}
				setTimeout( resolve, pauseDuration );
			} );
		}
	}

	let caughtError = null;
	try {
		const isMobileValues = [ true, false ];
		if ( opt.requestDesktopFirst ) {
			isMobileValues.reverse();
		}
		for ( const isMobile of isMobileValues ) {
			const deviceDir = path.join(
				opt.outputDir,
				isMobile ? 'mobile' : 'desktop'
			);
			fs.mkdirSync( deviceDir, { recursive: true } );

			/**
			 * @type {AnalysisResult}
			 */
			let originalResult;

			/**
			 * @type {AnalysisResult}
			 */
			let optimizedResult;

			const getOriginalResult = async () => {
				const originalDir = path.join( deviceDir, 'original' );
				fs.mkdirSync( originalDir, { recursive: true } );
				originalResult = await analyze(
					originalDir,
					opt,
					browser,
					isMobile,
					false
				);
			};

			const getOptimizedResult = async () => {
				const optimizedDir = path.join( deviceDir, 'optimized' );
				fs.mkdirSync( optimizedDir, { recursive: true } );
				optimizedResult = await analyze(
					optimizedDir,
					opt,
					browser,
					isMobile,
					true
				);
			};

			// First hit the site as the device to prime the pipes.
			if ( ! opt.skipNetworkPriming ) {
				if ( opt.verbose ) {
					log(
						`Priming web server with initial request on ${
							isMobile ? 'mobile' : 'desktop'
						}... `
					);
				}
				const urlObj = new URL( opt.url );
				urlObj.searchParams.set(
					'optimization_detective_priming',
					Date.now().toString()
				);
				browser = await launchBrowser();
				const page = await browser.newPage();
				await page.emulate( isMobile ? mobileDevice : desktopDevice );
				const response = await page.goto( urlObj.toString() );
				await browser.close();
				if ( response.status() !== 200 ) {
					throw new Error(
						`Error: Bad response code ${ response.status() }.`
					);
				}
				await pauseIfRequested();
			}

			// Always lead with checking the optimized version so we can fast-fail if there is a detection problem on the site.
			// But then for the next device (desktop), start with the original version so we don't always start with one or the other.
			const resultGetterFunctions = [
				getOriginalResult,
				getOptimizedResult,
			];
			if ( opt.requestOptimizedFirst ) {
				resultGetterFunctions.reverse();
			}
			for ( const getResults of resultGetterFunctions ) {
				browser = await launchBrowser();
				await getResults();
				await browser.close();
				await pauseIfRequested();
			}

			if ( opt.verbose ) {
				const optimizedLcpTtfb =
					optimizedResult.metrics[ 'LCP-TTFB' ].value;
				const originalLcpTtfb =
					originalResult.metrics[ 'LCP-TTFB' ].value;

				const diffAbsMs = Math.abs(
					originalLcpTtfb - optimizedLcpTtfb
				);
				const diffAbsPercent =
					Math.abs(
						( originalLcpTtfb - optimizedLcpTtfb ) / originalLcpTtfb
					) * 100;
				const pass = optimizedLcpTtfb <= originalLcpTtfb;
				/**
				 * Formats number.
				 *
				 * @param {number} num - Number.
				 * @returns {string} Formatted number.
				 */
				const formatNumber = ( num ) => num.toFixed( 1 );
				log(
					`${ pass ? 'PASS' : 'FAIL' }: Optimized is ${ formatNumber(
						diffAbsMs
					) } ms (${ formatNumber( diffAbsPercent ) }%) ${
						pass ? 'faster' : 'slower'
					} than original for LCP-TTFB (${ formatNumber(
						optimizedLcpTtfb
					) } ms vs ${ formatNumber( originalLcpTtfb ) } ms) for ${ opt.url }.`
				);
			}
		}
	} catch ( err ) {
		log( `Error: ${ err.message } for ${ opt.url }` );
		caughtError = err;
	} finally {
		await browser.close();
	}

	const errorsFile = path.join( opt.outputDir, 'errors.txt' );
	if ( caughtError ) {
		fs.writeFileSync( errorsFile, caughtError.message + '\n', {
			flag: 'a',
			encoding: 'utf8',
		} );
	} else {
		fs.writeFileSync( versionFile, String( version ), {
			encoding: 'utf8',
		} );
		try {
			fs.unlinkSync( errorsFile );
		} catch ( err ) {}
	}

	process.exit( caughtError ? 1 : 0 );
}

/**
 * @return {Promise<Browser>} Browser.
 */
async function launchBrowser() {
	return await puppeteer.launch( {
		headless: true,
		args: [ '--disable-cache' ],
	} );
}

/**
 * @param {string}         outputDir
 * @param {AnalyzeOptions} opt
 * @param {Browser}        browser
 * @param {boolean}        isMobile
 * @param {boolean}        optimizationDetectiveEnabled
 * @return {Promise<AnalysisResult>} Results
 */
async function analyze(
	outputDir,
	opt,
	browser,
	isMobile,
	optimizationDetectiveEnabled
) {
	const urlObj = new URL( opt.url );
	urlObj.searchParams.set(
		optimizationDetectiveEnabled
			? 'optimization_detective_enabled' // Note: This doesn't do anything, but it ensures we're playing fair with possible cache busting.
			: 'optimization_detective_disabled',
		Date.now().toString()
	);

	if ( opt.verbose ) {
		log(
			`Requesting ${
				optimizationDetectiveEnabled ? 'optimized' : 'original'
			} version on ${ isMobile ? 'mobile' : 'desktop' }... `
		);
	}

	const globalVariablePrefix = '__wppResearchWebVitals';
	const scriptTag = /** lang=JS */ `
		window.${ globalVariablePrefix }LCPCandidates = [];
		import { onLCP, onTTFB } from "https://unpkg.com/web-vitals@4/dist/web-vitals.js";
		onLCP( ( metric ) => { window.${ globalVariablePrefix }LCP = metric; } );
		onTTFB( ( metric ) => { window.${ globalVariablePrefix }TTFB = metric; } );
		onLCP(
			( metric ) => {
				window.${ globalVariablePrefix }LCPCandidates.push( metric );
			},
			{ reportAllChanges: true }
		);
	`;

	const page = await browser.newPage();
	await page.setBypassCSP( true ); // Bypass CSP so the web vitals script tag can be injected below.
	const emulateDevice = isMobile ? mobileDevice : desktopDevice;
	const emulateNetwork = isMobile
		? mobileNetworkConditions
		: desktopNetworkConditions;
	await page.emulate( emulateDevice );
	await page.emulateNetworkConditions( emulateNetwork );
	const response = await page.goto( urlObj.toString(), {
		waitUntil: 'networkidle0',
	} );

	// Store the content for debugging.
	const content = await response.content();
	fs.writeFileSync( path.join( outputDir, 'content.html' ), content );
	const headers = [];
	for ( const [ key, value ] of Object.entries( response.headers() ) ) {
		headers.push( `${ key }: ${ value }` );
	}
	fs.writeFileSync(
		path.join( outputDir, 'headers.txt' ),
		headers.join( '\n' ) + '\n',
		'utf8'
	);

	if ( response.status() !== 200 ) {
		throw new Error( `Error: Bad response code ${ response.status() }.` );
	}

	const odDetected = await page.evaluate( () => {
		return !! document.querySelector(
			[
				'[data-od-removed-fetchpriority]',
				'[data-od-added-fetchpriority]',
				'[data-od-replaced-fetchpriority]',
				'[data-od-fetchpriority-already-added]',
				'[data-od-added-sizes]',
				'[data-od-replaced-sizes]',
				'[data-od-removed-loading]',
				'[data-od-added-loading]',
				'[data-od-replaced-loading]',
				'link[ data-od-added-tag ]',
				'img[ data-od-unknown-tag ]',
			].join( ',' )
		);
	} );
	if ( ! optimizationDetectiveEnabled && odDetected ) {
		throw new Error(
			'The ?optimization_detective_disabled=1 query parameter was ignored.'
		);
	}

	await page.addScriptTag( { content: scriptTag, type: 'module' } );

	/**
	 * @type {AnalysisResult}
	 */
	const data = {
		device: emulateDevice,
		network: emulateNetwork,
		metrics: {
			TTFB: {
				value: -1,
			},
			LCP: {
				value: -1,
				url: null,
				element: null,
				initiatorType: null,
				preloadedByOD: false,
			},
			'LCP-TTFB': {
				value: -1,
			},
		},
		pluginVersions: {},
		metaGenerators: [],
		odLinks: [],
		elements: [],
	};

	data.pluginVersions = await page.evaluate( () => {
		/**
		 * @type {Object<string, string>}
		 */
		const pluginVersions = {};
		const pluginSlugs = [ 'optimization-detective', 'image-prioritizer' ];
		for ( const pluginSlug of pluginSlugs ) {
			const meta = document.querySelector(
				`meta[name="generator"][content^="${ pluginSlug } "]`
			);
			if ( meta ) {
				pluginVersions[ pluginSlug ] = meta
					.getAttribute( 'content' )
					.split( /\s+/, 2 )[ 1 ]
					.replace( /;.*$/, '' );
			}
		}
		return pluginVersions;
	} );

	data.metaGenerators = await page.evaluate( () => {
		/**
		 * @type {string[]}
		 */
		const metaGenerators = [];
		for ( const meta of document.querySelectorAll(
			`meta[name="generator"][content]`
		) ) {
			metaGenerators.push( meta.getAttribute( 'content' ) );
		}
		return metaGenerators;
	} );

	const requiredPluginVersions = {
		'optimization-detective': opt.oldestOptimizationDetectiveVersion,
		'image-prioritizer': opt.oldestImagePrioritizerVersion,
	};
	for ( const [ slug, oldestVersionAllowed ] of Object.entries(
		requiredPluginVersions
	) ) {
		if ( ! ( slug in data.pluginVersions ) ) {
			throw new Error(
				`Meta generator tag for ${ slug } is absent for ${
					isMobile ? 'mobile' : 'desktop'
				}`
			);
		}
		if (
			versionCompare(
				data.pluginVersions[ slug ],
				oldestVersionAllowed
			) < 0
		) {
			throw new Error(
				`Meta generator version for ${ slug } is too old for ${
					isMobile ? 'mobile' : 'desktop'
				}`
			);
		}
	}

	if (
		data.pluginVersions[ 'optimization-detective' ].includes(
			'rest_api_unavailable'
		)
	) {
		throw new Error(
			`REST API for optimization-detective is not available for ${
				isMobile ? 'mobile' : 'desktop'
			}`
		);
	}

	/*
	 * This detects the following scenario where a plugin like WP Rocket is blocking the loading of the detection script
	 * with delayed loading:
	 *
	 * <script type="rocketlazyloadscript" data-rocket-type="module">
	 * import detect from "https:\/\/example.com\/wp-content\/plugins\/optimization-detective\/detect.js?ver=0.4.1"; detect( {"serveTime":1742358407046.32,"detectionTimeWindow":5000,"isDebug":false,"restApiEndpoint":"https:\/\/example.com\/wp-json\/optimization-detective\/v1\/url-metrics:store","restApiNonce":"170f4e7f67","currentUrl":"https:\/\/example.com\/article\/foo,"urlMetricsSlug":"f087b88472f15a472c3b99c50a992bd9","urlMetricsNonce":"10e711535e","urlMetricsGroupStatuses":[{"minimumViewportWidth":0,"complete":false},{"minimumViewportWidth":481,"complete":false},{"minimumViewportWidth":601,"complete":false},{"minimumViewportWidth":783,"complete":false}],"storageLockTTL":60,"webVitalsLibrarySrc":"https:\/\/example.com\/wp-content\/plugins\/optimization-detective\/build\/web-vitals.js?ver=4.2.1"} );
	 * </script>
	 *
	 * When WP Rocket delay-loads the script, it then looks like this:
	 *
	 * <script type="module" src="data:text/javascript;base64,..." data-rocket-status="executed">
	 * import detect from "https:\/\/example.com\/wp-content\/plugins\/optimization-detective\/detect.js?ver=0.4.1"; detect( {"serveTime":1742498067124.286,"detectionTimeWindow":5000,"isDebug":false,"restApiEndpoint":"https:\/\/example.com\/wp-json\/optimization-detective\/v1\/url-metrics:store","restApiNonce":"752576af8a","currentUrl":"https:\/\/example.com\/article\/foo,"urlMetricsSlug":"f087b88472f15a472c3b99c50a992bd9","urlMetricsNonce":"1cd68d22b6","urlMetricsGroupStatuses":[{"minimumViewportWidth":0,"complete":false},{"minimumViewportWidth":481,"complete":false},{"minimumViewportWidth":601,"complete":false},{"minimumViewportWidth":783,"complete":false}],"storageLockTTL":60,"webVitalsLibrarySrc":"https:\/\/example.com\/wp-content\/plugins\/optimization-detective\/build\/web-vitals.js?ver=4.2.1"} );
	 * </script>
	 *
	 * If no detection script is on the page in the first place, then it's likely they already have URL Metrics collected.
	 * Note that this WP Rocket functionality seems to only load the module once the page is scrolled or when the page is
	 * hidden, at which point the scroll position will not be at the top and the module will short-circuit.
	 * TODO: Optimization Detective should augment the meta generator tag with whether the URL Metrics are complete, partially populated, etc.
	 * TODO: This logic doesn't seem to always work. In a Puppeteer context, no script delaying seems to occur in WP Rocket.
	 */
	const isDetectionScriptBlocked = await page.evaluate( () => {
		for ( const script of document.querySelectorAll( 'script' ) ) {
			if (
				script.textContent.includes( 'import detect from' ) &&
				script.textContent.includes( 'optimization-detective' ) &&
				script.type !== 'module'
			) {
				return true;
			}
		}
		return false;
	} );
	if ( isDetectionScriptBlocked ) {
		throw new Error(
			`Detection script module was blocked from loading potentially due to some delayed script loading logic on ${
				isMobile ? 'mobile' : 'desktop'
			}`
		);
	}

	const imagePrioritizerNotWorking = await page.evaluate( () => {
		return (
			document.querySelectorAll( 'img[ data-od-unknown-tag ]' ).length >
				0 &&
			document.querySelectorAll(
				[
					'img[data-od-removed-fetchpriority]',
					'img[data-od-added-fetchpriority]',
					'img[data-od-replaced-fetchpriority]',
					'img[data-od-fetchpriority-already-added]',
					'img[data-od-added-sizes]',
					'img[data-od-replaced-sizes]',
					'img[data-od-removed-loading]',
					'img[data-od-added-loading]',
					'img[data-od-replaced-loading]',
					'link[data-od-added-tag]',
				].join( ',' )
			).length === 0
		);
	} );
	if ( imagePrioritizerNotWorking ) {
		throw new Error(
			`Image Prioritizer does not seem to be working due to detection issues according to presence of data-od-unknown-tag attributes on ${
				isMobile ? 'mobile' : 'desktop'
			}`
		);
	}

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
				( /** @type {string} */ global ) => {
					const metric = /** @type {Metric} */ window[ global ];

					if ( metric.entries.length !== 1 ) {
						throw new Error(
							`Unexpected number of entries ${ metric.entries.length } for metric ${ metric.name }`
						);
					}

					const [ entry ] = metric.entries;

					const metricData = entry.toJSON();
					metricData.value = metric.value;
					if ( 'TTFB' === metric.name ) {
						const ttfbEntry = /** @type {PerformanceEntry} */ entry;

						// For some reason the PerformanceServerTiming objects aren't included when doing toJSON().
						if (
							'serverTiming' in ttfbEntry &&
							ttfbEntry.serverTiming.length > 0
						) {
							metricData.serverTiming =
								ttfbEntry.serverTiming.map(
									(
										/** @type {PerformanceServerTiming} */ serverTiming
									) => {
										return {
											name: serverTiming.name,
											description:
												serverTiming.description,
											duration: serverTiming.duration,
										};
									}
								);
						}
					} else if ( 'LCP' === metric.name ) {
						const lcpEntry =
							/** @type {LargestContentfulPaint} */ entry;

						if ( lcpEntry.url ) {
							// TODO: This needn't be computed here.
							for ( /** @type {HTMLLinkElement} */ const odPreloadLink of document.querySelectorAll(
								'link[data-od-added-tag][rel="preload"]'
							) ) {
								if (
									odPreloadLink.href === lcpEntry.url ||
									( odPreloadLink.imageSrcset &&
										odPreloadLink.imageSrcset.includes(
											lcpEntry.url + ' '
										) )
								) {
									metricData.preloadedByOD = true;
									break;
								}
							}
						}

						if ( lcpEntry.element ) {
							metricData.element = {
								tagName: lcpEntry.element.tagName,
								attributes: Object.fromEntries( Array.from( lcpEntry.element.attributes ).map( ( attribute ) => [ attribute.name, attribute.value ] ) ),
							};
						} else {
							metricData.element = null;
						}
					}

					return metricData;
				},
				globalVariablePrefix + metricName
			);

			Object.assign( data.metrics[ metricName ], amendedData );

			data.metrics[ 'LCP-TTFB' ] = {
				value: data.metrics.LCP.value - data.metrics.TTFB.value,
			};
		} )
	);

	if ( data.metrics.LCP.url ) {
		data.metrics.LCP.initiatorType = await page.evaluate(
			( /** @type {string} */ _url ) => {
				const entries =
					/** @type {PerformanceResourceTiming[]} */ performance.getEntriesByType(
						'resource'
					);
				for ( const entry of entries ) {
					if ( entry.name === _url ) {
						return entry.initiatorType;
					}
				}
				return null;
			},
			data.metrics.LCP.url
		);
	}

	data.odLinks = await page.evaluate( () => {
		/**
		 * @type {Array<Object<string, string>>}
		 */
		const odLinks = [];
		for ( const link of document.querySelectorAll(
			'link[ data-od-added-tag ]'
		) ) {
			/**
			 * @type {Object<string, string>}
			 */
			const linkAttributes = {};
			for ( const attribute of link.attributes ) {
				linkAttributes[ attribute.name ] = attribute.value;
			}
			odLinks.push( linkAttributes );
		}
		return odLinks;
	} );

	data.elements = await page.evaluate( async ( globalVariablePrefix ) => {
		/** @type {VisitedElement[]} */
		const elements = [];

		/**
		 * @type {LCPMetric[]}
		 */
		const lcpMetricCandidates = window[ globalVariablePrefix + 'LCPCandidates' ];

		const getAttributesFromElement = ( /** @type {Element} */ element ) => Object.fromEntries( Array.from( element.attributes ).map( ( attribute ) => [ attribute.name, /** @type {string} */ attribute.value ] ) );

		/**
		 * @type {Map<Element, IntersectionObserverEntry>}
		 */
		const elementIntersections = new Map();

		// Query for all elements which are visited by Image Prioritizer as well as anything else being tracked by the site.
		const visitedElements = document.querySelectorAll( 'img, *[style*="background"][style*="url("], picture, video, *[data-od-xpath]' );
		await new Promise( ( resolve ) => {
			const intersectionObserver = new IntersectionObserver( ( entries ) => {
					for ( const entry of entries ) {
						elementIntersections.set( entry.target, entry );
					}
					resolve();
				},
				{
					root: null, // To watch for intersection relative to the device's viewport.
					threshold: 0.0, // As soon as even one pixel is visible.
				} );
			for ( const visitedElement of visitedElements ) {
				intersectionObserver.observe( visitedElement );
			}
		} );

		for ( const [ visitedElement, intersectionObserverEntry ] of elementIntersections.entries() ) {
			const ancestors = [];
			let currentElement = visitedElement;
			while ( currentElement ) {
				ancestors.unshift( currentElement );
				currentElement = currentElement.parentElement;
			}
			let xpath = '';
			for ( let i = 0; i < ancestors.length; i++ ) {
				/** @type {Element} */
				const ancestorElement = ancestors[i];
				if ( i < 2 ) {
					xpath += '/' + ancestorElement.tagName;
				} else if ( 2 === i && '/HTML/BODY' === xpath ) {
					xpath += '/' + ancestorElement.tagName;
					for ( const attrName of [ 'id', 'role', 'class' ] ) {
						if ( ancestorElement.hasAttribute( attrName ) ) {
							const attrValue = ancestorElement.getAttribute( attrName );
							if ( /^[a-zA-Z0-9_.\s:-]*$/.test( attrValue ) ) {
								xpath += `[@${ attrName }='${ attrValue }']`;
								break;
							}
						}
					}
				} else {
					const siblingIndex = Array.from( ancestorElement.parentElement.children ).indexOf( ancestorElement );
					xpath += `/*[${ siblingIndex + 1 }][self::${ ancestorElement.tagName }]`;
				}
			}

			/** @type {Array<Object<string, string>>|null} */
			let sources = null;
			if ( 'VIDEO' === visitedElement.tagName || 'PICTURE' === visitedElement.tagName ) {
				sources = Array.from(
					visitedElement.querySelectorAll( 'source, img' )
				).map( ( sourceElement ) => getAttributesFromElement( sourceElement ) );
			}

			elements.push( {
				tagName: visitedElement.tagName,
				breadcrumbs: ancestors.map( ( element ) => element.tagName ),
				sources,
				xpath, // Note: This may vary not be exactly the same as the data-od-xpath attribute since this is computed after JS may have mutated the DOM tree.
				attributes: getAttributesFromElement( visitedElement ),
				isLCP: visitedElement === lcpMetricCandidates.at( -1 ).entries[ 0 ]?.element,
				isLCPCandidate: !! lcpMetricCandidates.find(
					( lcpMetricCandidate ) => {
						return lcpMetricCandidate.entries[ 0 ]?.element === visitedElement;
					}
				),
				intersectionRatio: intersectionObserverEntry.intersectionRatio,
				boundingClientRect: intersectionObserverEntry.boundingClientRect.toJSON(),
				intersectionRect: intersectionObserverEntry.intersectionRect.toJSON(),
			} );
		}
		return elements;
	}, globalVariablePrefix );

	fs.writeFileSync(
		path.join( outputDir, 'results.json' ),
		JSON.stringify( data, null, 2 )
	);

	return data;
}
