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
/** @typedef {keyof typeof PredefinedNetworkConditions} NetworkConditionName */
/* eslint-enable jsdoc/valid-types */
/** @typedef {{width: number, height: number}} ViewportDimensions */

/**
 * Internal dependencies
 */
import {
	getURLs,
	shouldLogURLProgress,
	shouldLogIterationsProgress,
} from '../lib/cli/args.mjs';
import {
	log,
	logPartial,
	output,
	formats,
	table,
	isValidTableFormat,
	OUTPUT_FORMAT_TABLE,
} from '../lib/cli/logger.mjs';
import {
	calcPercentile,
	calcStandardDeviation,
	calcMedianAbsoluteDeviation,
} from '../lib/util/math.mjs';
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
		argname: '-m, --metrics <metrics...>',
		description:
			'Which metrics to include; by default these are "FCP", "LCP", "TTFB" and "LCP-TTFB".',
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
		argname: '-v, --show-variance',
		description: 'Whether to show standard deviation and IQR',
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
	{
		argname: '-w, --window-viewport <dimensions>',
		description:
			'Open page with the supplied viewport dimensions such as "mobile" (an alias for "412x823") or "desktop" (an alias for "1350x940"), defaults to "960x700"',
	},
];

/**
 * @typedef {Object} Params
 * @property {?string}             url               - See above.
 * @property {number}              amount            - See above.
 * @property {?string}             file              - See above.
 * @property {?string[]}           metrics           - See above.
 * @property {string}              output            - See above.
 * @property {boolean}             showPercentiles   - See above.
 * @property {boolean}             showVariance      - See above.
 * @property {?number}             cpuThrottleFactor - See above.
 * @property {?NetworkConditions}  networkConditions - See above.
 * @property {?ViewportDimensions} windowViewport    - See above.
 */

/**
 * @typedef {Object} MetricsDefinitionEntry
 * @property {string}    type     Either 'webVitals', 'serverTiming', or 'aggregate'.
 * @property {?string}   listen   Which event to listen to (only relevant for type 'webVitals').
 * @property {?string}   global   Which JS global to find the metric in (only relevant for type 'webVitals').
 * @property {?string[]} add      Which other metrics to add (only relevant for type 'aggregate').
 * @property {?string[]} subtract Which other metrics to subtract (only relevant for type 'aggregate').
 * @property {?string}   name     Name of the Server-Timing metric (only relevant for type 'serverTiming').
 */

/**
 * @param {Object}                opt
 * @param {?string}               opt.url
 * @param {string|number}         opt.number
 * @param {?string}               opt.file
 * @param {?string[]}             opt.metrics
 * @param {string}                opt.output
 * @param {boolean}               opt.showPercentiles
 * @param {boolean}               opt.showVariance
 * @param {?string}               opt.throttleCpu
 * @param {?NetworkConditionName} opt.networkConditions
 * @param {?string}               opt.windowViewport
 * @return {Params} Parameters.
 */
function getParamsFromOptions( opt ) {
	/** @type {Params} */
	const params = {
		url: opt.url,
		amount:
			typeof opt.number === 'number'
				? opt.number
				: parseInt( opt.number, 10 ),
		file: opt.file,
		metrics:
			opt.metrics && opt.metrics.length
				? opt.metrics
				: [ 'FCP', 'LCP', 'TTFB', 'LCP-TTFB' ],
		output: opt.output,
		showPercentiles: Boolean( opt.showPercentiles ),
		showVariance: Boolean( opt.showVariance ),
		cpuThrottleFactor: null,
		networkConditions: null,
		windowViewport: { width: 960, height: 700 }, // Viewport similar to @wordpress/e2e-test-utils 'large' configuration.
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

	if ( opt.windowViewport ) {
		if ( 'mobile' === opt.windowViewport ) {
			// This corresponds to the mobile viewport tested in Lighthouse: <https://github.com/GoogleChrome/lighthouse/blob/b64b3534542c9dcaabb33d40b84ed7c93eefbd7d/core/config/constants.js#L14-L22>.
			// TODO: Consider deviceScaleFactor.
			params.windowViewport = {
				width: 412,
				height: 823,
			};
		} else if ( 'desktop' === opt.windowViewport ) {
			// This corresponds to the mobile viewport tested in Lighthouse: <https://github.com/GoogleChrome/lighthouse/blob/b64b3534542c9dcaabb33d40b84ed7c93eefbd7d/core/config/constants.js#L28-L34>.
			params.windowViewport = {
				width: 1350,
				height: 940,
			};
		} else {
			const matches = opt.windowViewport.match( /^(\d+)x(\d+)$/ );
			if ( ! matches ) {
				throw new Error(
					`Invalid window viewport dimensions: ${ opt.windowViewport }. Must be 'mobile', 'desktop', or WIDTHxHEIGHT (e.g. '1024x768')`
				);
			}
			params.windowViewport = {
				width: parseInt( matches[ 1 ] ),
				height: parseInt( matches[ 2 ] ),
			};
		}
	}

	return params;
}

/**
 * @param {string[]} metrics
 * @return {Object<string, MetricsDefinitionEntry>} Metrics definition, keyed by metric identifier.
 */
function getMetricsDefinition( metrics ) {
	/*
	 * For now this only includes load time metrics.
	 * In the future, additional Web Vitals like CLS, FID, and INP should be
	 * added, however they are slightly more complex to retrieve through an
	 * automated headless browser test.
	 * See https://github.com/GoogleChromeLabs/wpp-research/pull/41.
	 */
	const availableMetricsDefinition = {
		FCP: {
			type: 'webVitals',
			listen: 'onFCP',
			global: 'webVitalsFCP',
		},
		LCP: {
			type: 'webVitals',
			listen: 'onLCP',
			global: 'webVitalsLCP',
		},
		TTFB: {
			type: 'webVitals',
			listen: 'onTTFB',
			global: 'webVitalsTTFB',
		},
		'LCP-TTFB': {
			type: 'aggregate',
			add: [ 'LCP' ],
			subtract: [ 'TTFB' ],
		},
	};

	/**
	 * Server-Timing metrics can have any name, so for those a generic definition creator is used.
	 * These metrics must be prefixed with "ST:", see below.
	 *
	 * @param {string} metric
	 * @return {MetricsDefinitionEntry} Server-Timing metrics definition entry.
	 */
	const getServerTimingDefinition = ( metric ) => {
		return {
			type: 'serverTiming',
			name: metric,
			listen: null,
			global: null,
			add: null,
			subtract: null,
		};
	};

	// Set up object with the requested metrics, and store aggregate metrics in a list.
	/** @type {Object<string, MetricsDefinitionEntry>} */
	const metricsDefinition = {};
	const aggregates = [];
	for ( const metric of metrics ) {
		if ( availableMetricsDefinition[ metric ] ) {
			metricsDefinition[ metric ] = {
				...availableMetricsDefinition[ metric ],
			};
			if ( metricsDefinition[ metric ].type === 'aggregate' ) {
				aggregates.push( metric );
			}
			continue;
		}
		if ( metric.startsWith( 'ST:' ) ) {
			metricsDefinition[ metric ] = getServerTimingDefinition(
				metric.substring( 3 ).trim()
			);
			continue;
		}
		throw new Error( `Supplied metric "${ metric }" is not supported.` );
	}

	// Add any dependency metrics for aggregate metrics to the object if they aren't already part of it.
	for ( const metric of aggregates ) {
		if ( availableMetricsDefinition[ metric ].add ) {
			for ( const dependencyMetric of availableMetricsDefinition[ metric ]
				.add ) {
				if ( ! metricsDefinition[ dependencyMetric ] ) {
					metricsDefinition[ dependencyMetric ] = {
						...availableMetricsDefinition[ dependencyMetric ],
					};
				}
			}
		}
		if ( availableMetricsDefinition[ metric ].subtract ) {
			for ( const dependencyMetric of availableMetricsDefinition[ metric ]
				.subtract ) {
				if ( ! metricsDefinition[ dependencyMetric ] ) {
					metricsDefinition[ dependencyMetric ] = {
						...availableMetricsDefinition[ dependencyMetric ],
					};
				}
			}
		}
	}

	return metricsDefinition;
}

export async function handler( opt ) {
	const params = getParamsFromOptions( opt );
	const results = [];

	const browser = await puppeteer.launch( { headless: true } );

	const metricsDefinition = getMetricsDefinition( params.metrics );

	// Log progress only under certain conditions (multiple URLs to benchmark).
	const logURLProgress = shouldLogURLProgress( opt );
	const logIterationsProgress = shouldLogIterationsProgress( opt );

	for await ( const url of getURLs( opt ) ) {
		if ( logURLProgress ) {
			// If also logging individual iterations, put those on a new line.
			if ( logIterationsProgress ) {
				log( `Benchmarking URL ${ url }...` );
			} else {
				logPartial( `Benchmarking URL ${ url }...` );
			}
		}

		// Catch Puppeteer errors to prevent the process from getting stuck.
		try {
			const { completeRequests, metrics } = await benchmarkURL(
				url,
				browser,
				metricsDefinition,
				params,
				logIterationsProgress
			);
			results.push( [ url, completeRequests, metrics ] );
			if ( logURLProgress ) {
				// If also logging individual iterations, provide more context on benchmarking which URL was completed.
				if ( logIterationsProgress ) {
					log(
						formats.success(
							`Completed benchmarking URL ${ url }.`
						)
					);
				} else {
					log( formats.success( 'Success.' ) );
				}
			}
		} catch ( err ) {
			log( formats.error( `Error: ${ err.message }.` ) );
		}
	}

	await browser.close();

	if ( results.length === 0 ) {
		log( formats.error( 'No results returned.' ) );
	} else {
		outputResults( opt, results );
	}
}

/**
 * @param {string}                                 url
 * @param {Browser}                                browser
 * @param {Object<string, MetricsDefinitionEntry>} metricsDefinition
 * @param {Params}                                 params
 * @param {boolean}                                logProgress
 * @return {Promise<{completeRequests: number, metrics: {}}>} Results
 */
async function benchmarkURL(
	url,
	browser,
	metricsDefinition,
	params,
	logProgress
) {
	// Group the required metrics by type.
	const groupedMetrics = {};
	Object.keys( metricsDefinition ).forEach( ( metric ) => {
		const metricType = metricsDefinition[ metric ].type;
		if ( ! groupedMetrics[ metricType ] ) {
			groupedMetrics[ metricType ] = {};
		}
		groupedMetrics[ metricType ][ metric ] = {
			...metricsDefinition[ metric ],
			results: [],
		};
	} );

	let completeRequests = 0;

	let scriptTag;

	if ( groupedMetrics.webVitals ) {
		scriptTag = `import { ${ Object.values( groupedMetrics.webVitals )
			.map( ( value ) => value.listen )
			.join( ', ' ) } } from "https://unpkg.com/web-vitals@3?module";`;
		Object.values( groupedMetrics.webVitals ).forEach( ( value ) => {
			scriptTag += `${ value.listen }( ( { name, delta } ) => { window.${ value.global } = name === 'CLS' ? delta * 1000 : delta; } );`;
		} );
	}

	for ( let requestNum = 0; requestNum < params.amount; requestNum++ ) {
		if ( logProgress ) {
			logPartial(
				`Benchmarking ${ requestNum + 1 } / ${ params.amount }...`
			);
		}
		const page = await browser.newPage();
		await page.setBypassCSP( true ); // Bypass CSP so the web vitals script tag can be injected below.
		if ( params.cpuThrottleFactor ) {
			await page.emulateCPUThrottling( params.cpuThrottleFactor );
		}

		if ( params.networkConditions ) {
			await page.emulateNetworkConditions( params.networkConditions );
		}

		await page.setViewport( params.windowViewport );
		await page
			.mainFrame()
			.waitForFunction(
				`window.innerWidth === ${ params.windowViewport.width } && window.innerHeight === ${ params.windowViewport.height }`
			);

		// Load the page.
		const urlObj = new URL( url );
		urlObj.searchParams.append( 'rnd', String( Math.random() ) );

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
		if ( scriptTag ) {
			await page.addScriptTag( { content: scriptTag, type: 'module' } );
		}

		if ( response.status() !== 200 ) {
			if ( logProgress ) {
				log(
					formats.error(
						`Error: Bad response code ${ response.status() }.`
					)
				);
			}
			continue;
		}

		completeRequests++;

		if ( groupedMetrics.webVitals ) {
			await Promise.all(
				Object.values( groupedMetrics.webVitals ).map(
					async ( value ) => {
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
						await page.click( 'body', {
							offset: { x: -500, y: -500 },
						} );
						// Get the metric value from the global.
						const metric =
							/** @type {number} */ await page.evaluate(
								( global ) => window[ global ],
								value.global
							);
						value.results.push( metric );
					}
				)
			).catch( () => {
				/* Ignore errors. */
			} );
		}

		if ( groupedMetrics.serverTiming ) {
			const serverTimingMetrics = await page.evaluate( () => {
				const entry = performance.getEntries().find(
					( ent ) => ent instanceof PerformanceNavigationTiming // eslint-disable-line no-undef
				);
				// eslint-disable-next-line no-undef
				if ( entry instanceof PerformanceNavigationTiming ) {
					return entry.serverTiming.reduce( ( acc, value ) => {
						acc[ value.name ] = value.duration;
						return acc;
					}, {} );
				}
				return {};
			} );
			Object.values( groupedMetrics.serverTiming ).forEach( ( value ) => {
				if ( serverTimingMetrics[ value.name ] ) {
					value.results.push( serverTimingMetrics[ value.name ] );
				}
			} );
		}

		if ( logProgress ) {
			log( formats.success( 'Success.' ) );
		}
	}

	// Retrieve all base metric values.
	const metricResults = {};
	if ( groupedMetrics.webVitals || groupedMetrics.serverTiming ) {
		const baseMetrics = {
			...( groupedMetrics.webVitals || {} ),
			...( groupedMetrics.serverTiming || {} ),
		};
		Object.entries( baseMetrics ).forEach( ( [ key, value ] ) => {
			if ( value.results.length ) {
				metricResults[ key ] = value.results;
			}
		} );
	}

	// Calculate all aggregate metric values.
	if ( groupedMetrics.aggregate ) {
		Object.entries( groupedMetrics.aggregate ).forEach(
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
					if ( ! metricResults[ metricKey ] ) {
						return;
					}
				}

				// Initialize all values for the metric as 0.
				metricResults[ key ] = [];
				const numResults = value.add
					? metricResults[ value.add[ 0 ] ].length
					: metricResults[ value.subtract[ 0 ] ].length;
				for ( let n = 0; n < numResults; n++ ) {
					metricResults[ key ].push( 0.0 );
				}

				// Add and subtract all values.
				if ( value.add ) {
					value.add.forEach( ( metricKey ) => {
						metricResults[ metricKey ].forEach(
							( metricValue, metricIndex ) => {
								metricResults[ key ][ metricIndex ] +=
									metricValue;
							}
						);
					} );
				}
				if ( value.subtract ) {
					value.subtract.forEach( ( metricKey ) => {
						metricResults[ metricKey ].forEach(
							( metricValue, metricIndex ) => {
								metricResults[ key ][ metricIndex ] -=
									metricValue;
							}
						);
					} );
				}
			}
		);
	}

	/*
	 * Include only all the metrics which were requested by the command parameter.
	 * While the metrics definition is already limited by the parameter for efficiency,
	 * this logic here is needed because dependencies of aggregate metrics may have been calculated but still shouldn't
	 * be part of the final list.
	 */
	const metrics = {};
	for ( const metric of params.metrics ) {
		metrics[ metric ] = metricResults[ metric ];
	}

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
			if ( opt.showVariance ) {
				headings.push( `${ metricName } (SD)` );
				headings.push( `${ metricName } (MAD)` );
				headings.push( `${ metricName } (IQR)` );
			}
		} );
	} else {
		Object.keys( allMetricNames ).forEach( ( metricName ) => {
			headings.push( `${ metricName } (median)` );
			if ( opt.showVariance ) {
				headings.push( `${ metricName } (SD)` );
				headings.push( `${ metricName } (MAD)` );
				headings.push( `${ metricName } (IQR)` );
			}
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

			if ( opt.showVariance ) {
				tableRow.push(
					metrics[ metricName ]
						? round(
								calcStandardDeviation(
									metrics[ metricName ],
									true
								),
								2
						  )
						: ''
				);
				tableRow.push(
					metrics[ metricName ]
						? round(
								calcMedianAbsoluteDeviation(
									metrics[ metricName ]
								),
								2
						  )
						: ''
				);
				tableRow.push(
					metrics[ metricName ]
						? round(
								calcPercentile( 75, metrics[ metricName ] ) -
									calcPercentile( 25, metrics[ metricName ] ),
								2
						  )
						: ''
				);
			}
		} );

		tableData.push( tableRow );
	}

	output( table( headings, tableData, opt.output, true ) );
}
