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
import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';

/* eslint-disable jsdoc/no-undefined-types */

/* eslint-disable jsdoc/valid-types */
/** @typedef {import("web-vitals").Metric} Metric */
/** @typedef {import("puppeteer").HTTPResponse} HTTPResponse */
/** @typedef {import("puppeteer").Page} Page */
/** @typedef {import("puppeteer").Browser} Browser */
/** @typedef {import("web-vitals").LCPMetric} LCPMetric */

/* eslint-enable jsdoc/valid-types */
// TODO: deviceScaleFactor, isMobile, isLandscape, hasTouch.
/** @typedef {{width: number, height: number}} ViewportDimensions */

/**
 * Internal dependencies
 */
import { log } from '../lib/cli/logger.mjs';

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
		default: false,
	},
];

const mobileDevice = {
	// See <https://github.com/GoogleChrome/lighthouse/blob/36cac182a6c637b1671c57326d7c0241633d0076/core/config/constants.js#L42C7-L42C23>.
	userAgent:
		'Mozilla/5.0 (Linux; Android 11; moto g power (2022)) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Mobile Safari/537.36',
	// See <https://github.com/GoogleChrome/lighthouse/blob/36cac182a6c637b1671c57326d7c0241633d0076/core/config/constants.js#L11-L22>.
	viewport: {
		isMobile: true,
		width: 412,
		height: 823,
		isLandscape: false,
		deviceScaleFactor: 1.75,
		hasTouch: true,
	},
};

const desktopDevice = {
	// See <https://github.com/GoogleChrome/lighthouse/blob/36cac182a6c637b1671c57326d7c0241633d0076/core/config/constants.js#L43>.
	userAgent:
		'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
	// See <https://github.com/GoogleChrome/lighthouse/blob/36cac182a6c637b1671c57326d7c0241633d0076/core/config/constants.js#L24-L34>.
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
 * @param {Object}  opt
 * @param {string}  opt.url
 * @param {string}  opt.outputDir
 * @param {boolean} opt.force
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

	let caughtError = null;
	try {
		let deviceIterationIndex = 0;
		for ( const isMobile of [ true, false ] ) {
			const deviceDir = path.join(
				opt.outputDir,
				isMobile ? 'mobile' : 'desktop'
			);
			fs.mkdirSync( deviceDir, { recursive: true } );

			const getOriginalResult = async () => {
				const originalDir = path.join( deviceDir, 'original' );
				fs.mkdirSync( originalDir, { recursive: true } );
				return await analyze(
					originalDir,
					opt.url,
					browser,
					isMobile,
					false
				);
			};

			const getOptimizedResult = async () => {
				const optimizedDir = path.join( deviceDir, 'optimized' );
				fs.mkdirSync( optimizedDir, { recursive: true } );
				return await analyze(
					optimizedDir,
					opt.url,
					browser,
					isMobile,
					true
				);
			};

			// Always lead with checking the optimized version so we can fast-fail if there is a detection problem on the site.
			// But then for the next device (desktop), start with the original version so we don't always start with one or the other.
			const resultGetterFunctions = [
				getOptimizedResult,
				getOriginalResult,
			];
			if ( deviceIterationIndex !== 0 ) {
				resultGetterFunctions.reverse();
			}
			for ( const getResults of resultGetterFunctions ) {
				browser = await puppeteer.launch( {
					headless: true,
					args: [ '--disable-cache' ],
				} );
				await getResults();
				await browser.close();
			}

			deviceIterationIndex++;
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
 * @param {string}  outputDir
 * @param {string}  url
 * @param {Browser} browser
 * @param {boolean} isMobile
 * @param {boolean} optimizationDetectiveEnabled
 * @return {Promise<{
 *     device: Object,
 *     metrics: {
 *         TTFB: {
 *             value: number
 *         },
 *         LCP: {
 *             value: number|null,
 *             url: string|null,
 *             element: object|null,
 *             initiatorType: string|null,
 *             preloadedByOD: boolean,
 *         },
 *         'LCP-TTFB': number|null,
 *     }
 * }>} Results
 */
async function analyze(
	outputDir,
	url,
	browser,
	isMobile,
	optimizationDetectiveEnabled
) {
	const urlObj = new URL( url );
	urlObj.searchParams.set(
		optimizationDetectiveEnabled
			? 'optimization_detective_enabled' // Note: This doesn't do anything, but it ensures we're playing fair with possible cache busting.
			: 'optimization_detective_disabled',
		'1'
	);

	const globalVariablePrefix = '__wppResearchWebVitals';
	const scriptTag = /** lang=JS */ `
		import { onLCP, onTTFB } from "https://unpkg.com/web-vitals@4/dist/web-vitals.js";
		onLCP( ( metric ) => { window.${ globalVariablePrefix }LCP = metric; } );
		onTTFB( ( metric ) => { window.${ globalVariablePrefix }TTFB = metric; } );
	`;

	const page = await browser.newPage();
	await page.setBypassCSP( true ); // Bypass CSP so the web vitals script tag can be injected below.
	const emulateDevice = isMobile ? mobileDevice : desktopDevice;
	await page.emulate( emulateDevice );
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
	await page.addScriptTag( { content: scriptTag, type: 'module' } );

	const data = {
		device: emulateDevice,
		metrics: {
			TTFB: {
				value: -1,
			},
			LCP: {
				value: null,
				url: null,
				element: null,
				initiatorType: null,
				preloadedByOD: false,
			},
			'LCP-TTFB': null,
		},
	};

	data.pluginVersions = await page.evaluate( () => {
		const pluginVersions = {};
		const pluginSlugs = [ 'optimization-detective', 'image-prioritizer' ];
		for ( const pluginSlug of pluginSlugs ) {
			const meta = document.querySelector(
				`meta[name="generator"][content^="${ pluginSlug } "]`
			);
			if ( meta ) {
				pluginVersions[ pluginSlug ] = meta.getAttribute( 'content' );
			}
		}
		return pluginVersions;
	} );
	if ( ! ( 'optimization-detective' in data.pluginVersions ) ) {
		throw new Error(
			`Meta generator tag for optimization-detective is absent for ${
				isMobile ? 'mobile' : 'desktop'
			}`
		);
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
	if ( ! ( 'image-prioritizer' in data.pluginVersions ) ) {
		throw new Error(
			`Meta generator tag for image-prioritizer is absent for ${
				isMobile ? 'mobile' : 'desktop'
			}`
		);
	}

	/*
	 * This detects the following scenario where a plugin like WP Rocket is blocking the loading of the detection script
	 * with delayed loading:
	 *
	 * <script type="rocketlazyloadscript" data-rocket-type="module">
	 * import detect from "https:\/\/example.com\/wp-content\/plugins\/optimization-detective\/detect.js?ver=0.4.1"; detect( {"serveTime":1742358407046.32,"detectionTimeWindow":5000,"isDebug":false,"restApiEndpoint":"https:\/\/example.com\/wp-json\/optimization-detective\/v1\/url-metrics:store","restApiNonce":"170f4e7f67","currentUrl":"https:\/\/example.com\/article\/photographer-greg-girard-unveils-kowloon-walled-citys-hidden-past","urlMetricsSlug":"f087b88472f15a472c3b99c50a992bd9","urlMetricsNonce":"10e711535e","urlMetricsGroupStatuses":[{"minimumViewportWidth":0,"complete":false},{"minimumViewportWidth":481,"complete":false},{"minimumViewportWidth":601,"complete":false},{"minimumViewportWidth":783,"complete":false}],"storageLockTTL":60,"webVitalsLibrarySrc":"https:\/\/example.com\/wp-content\/plugins\/optimization-detective\/build\/web-vitals.js?ver=4.2.1"} );
	 * </script>
	 *
	 * When WP Rocket delay-loads the script, it then looks like this:
	 *
	 * <script type="module" src="data:text/javascript;base64,CmltcG9ydCBkZXRlY3QgZnJvbSAiaHR0cHM6XC9cL2V4YW1wbGUuY29tXC93cC1jb250ZW50XC9wbHVnaW5zXC9vcHRpbWl6YXRpb24tZGV0ZWN0aXZlXC9kZXRlY3QuanM/dmVyPTAuNC4xIjsgZGV0ZWN0KCB7InNlcnZlVGltZSI6MTc0MjQ5ODA2NzEyNC4yODYsImRldGVjdGlvblRpbWVXaW5kb3ciOjUwMDAsImlzRGVidWciOmZhbHNlLCJyZXN0QXBpRW5kcG9pbnQiOiJodHRwczpcL1wvcmFkaWkuY29cL3dwLWpzb25cL29wdGltaXphdGlvbi1kZXRlY3RpdmVcL3YxXC91cmwtbWV0cmljczpzdG9yZSIsInJlc3RBcGlOb25jZSI6Ijc1MjU3NmFmOGEiLCJjdXJyZW50VXJsIjoiaHR0cHM6XC9cL3JhZGlpLmNvXC9hcnRpY2xlXC9waG90b2dyYXBoZXItZ3JlZy1naXJhcmQtdW52ZWlscy1rb3dsb29uLXdhbGxlZC1jaXR5cy1oaWRkZW4tcGFzdCIsInVybE1ldHJpY3NTbHVnIjoiZjA4N2I4ODQ3MmYxNWE0NzJjM2I5OWM1MGE5OTJiZDkiLCJ1cmxNZXRyaWNzTm9uY2UiOiIxY2Q2OGQyMmI2IiwidXJsTWV0cmljc0dyb3VwU3RhdHVzZXMiOlt7Im1pbmltdW1WaWV3cG9ydFdpZHRoIjowLCJjb21wbGV0ZSI6ZmFsc2V9LHsibWluaW11bVZpZXdwb3J0V2lkdGgiOjQ4MSwiY29tcGxldGUiOmZhbHNlfSx7Im1pbmltdW1WaWV3cG9ydFdpZHRoIjo2MDEsImNvbXBsZXRlIjpmYWxzZX0seyJtaW5pbXVtVmlld3BvcnRXaWR0aCI6NzgzLCJjb21wbGV0ZSI6ZmFsc2V9XSwic3RvcmFnZUxvY2tUVEwiOjYwLCJ3ZWJWaXRhbHNMaWJyYXJ5U3JjIjoiaHR0cHM6XC9cL3JhZGlpLmNvXC93cC1jb250ZW50XC9wbHVnaW5zXC9vcHRpbWl6YXRpb24tZGV0ZWN0aXZlXC9idWlsZFwvd2ViLXZpdGFscy5qcz92ZXI9NC4yLjEifSApOwo=" data-rocket-status="executed">
	 * import detect from "https:\/\/example.com\/wp-content\/plugins\/optimization-detective\/detect.js?ver=0.4.1"; detect( {"serveTime":1742498067124.286,"detectionTimeWindow":5000,"isDebug":false,"restApiEndpoint":"https:\/\/example.com\/wp-json\/optimization-detective\/v1\/url-metrics:store","restApiNonce":"752576af8a","currentUrl":"https:\/\/example.com\/article\/photographer-greg-girard-unveils-kowloon-walled-citys-hidden-past","urlMetricsSlug":"f087b88472f15a472c3b99c50a992bd9","urlMetricsNonce":"1cd68d22b6","urlMetricsGroupStatuses":[{"minimumViewportWidth":0,"complete":false},{"minimumViewportWidth":481,"complete":false},{"minimumViewportWidth":601,"complete":false},{"minimumViewportWidth":783,"complete":false}],"storageLockTTL":60,"webVitalsLibrarySrc":"https:\/\/example.com\/wp-content\/plugins\/optimization-detective\/build\/web-vitals.js?ver=4.2.1"} );
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
								attributes: {},
								metaAttributes: {},
							};
							const metaAttrPrefix = 'data-od-';
							for ( const attribute of lcpEntry.element
								.attributes ) {
								if (
									attribute.name.startsWith( metaAttrPrefix )
								) {
									metricData.element.metaAttributes[
										attribute.name.substring(
											metaAttrPrefix.length
										)
									] = attribute.value;
								} else {
									metricData.element.attributes[
										attribute.name
									] = attribute.value;
								}
							}
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

	data.odPreloadLinks = await page.evaluate( () => {
		const preloadLinks = [];
		for ( const link of document.querySelectorAll(
			'link[ data-od-added-tag ]'
		) ) {
			const linkAttributes = {};
			for ( const attribute of link.attributes ) {
				linkAttributes[ attribute.name ] = attribute.value;
			}
			preloadLinks.push( linkAttributes );
		}
		return preloadLinks;
	} );

	data.odTagsWithXpathAttrs = await page.evaluate( () => {
		return document.querySelectorAll( '[ data-od-xpath ]' ).length;
	} );

	data.images = await page.evaluate( async () => {
		const imgElements = document.body.querySelectorAll( 'img' );

		const imageData = {
			imgCount: document.querySelectorAll( 'img' ).length,
			lazyImgCount: imgElements.length,
			lazyImgInsideViewportCount: 0,
			jsLazyLoadedImgCount: document.querySelectorAll(
				'img.lazyload, img.lazyloaded, img[data-src], img[data-srcset]'
			).length,
			fetchpriorityHighAttrImages: {
				insideViewportCount: 0,
				outsideViewportCount: 0,
			},
		};

		if ( imgElements.length > 0 ) {
			await new Promise( ( resolve ) => {
				// eslint-disable-next-line no-undef
				const observer = new IntersectionObserver( ( entries ) => {
					for ( const entry of entries ) {
						const element =
							/** @type {HTMLImageElement} */ entry.target;
						if ( entry.isIntersecting ) {
							if ( element.loading === 'lazy' ) {
								imageData.lazyImgInsideViewportCount++;
							}
							if ( element.fetchPriority === 'high' ) {
								imageData.fetchpriorityHighAttrImages
									.insideViewportCount++;
							}
						} else if ( element.fetchPriority === 'high' ) {
							imageData.fetchpriorityHighAttrImages
								.outsideViewportCount++;
						}
					}
					resolve();
				} );
				for ( const img of imgElements ) {
					observer.observe( img );
				}
			} );
		}

		return imageData;
	} );

	fs.writeFileSync(
		path.join( outputDir, 'results.json' ),
		JSON.stringify( data, null, 2 )
	);

	return data;
}
