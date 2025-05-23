/**
 * CLI command to benchmark several URLs for TTFB and Server-Timing metrics.
 *
 * WPP Research, Copyright 2022 Google LLC
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
import autocannon from 'autocannon';
import round from 'lodash-es/round.js';

/**
 * Internal dependencies
 */
import {
	collectUrlArgs,
	getURLs,
	shouldLogURLProgress,
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
		description:
			'URL to run benchmark tests for, where multiple URLs can be supplied by repeating the argument',
		defaults: [],
		parseArg: collectUrlArgs,
	},
	{
		argname: '-c, --concurrency <concurrency>',
		description: 'Number of multiple requests to make at a time',
		defaults: 1,
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
		description: 'Output format: "csv", "table", "md"',
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
];

export async function handler( opt ) {
	if ( ! isValidTableFormat( opt.output ) ) {
		log(
			formats.error(
				`Invalid output ${ opt.output }. The output format provided via the --output (-o) argument must be either "table", "csv", or "md".`
			)
		);
		return;
	}

	const { concurrency: connections, number: amount } = opt;
	const results = [];

	// Log progress only under certain conditions (multiple URLs to benchmark).
	const logURLProgress = shouldLogURLProgress( opt );

	for await ( const url of getURLs( opt ) ) {
		if ( logURLProgress ) {
			logPartial( `Benchmarking URL ${ url } ... ` );
		}

		try {
			const { completeRequests, responseTimes, metrics } =
				await benchmarkURL( {
					url,
					connections,
					amount,
				} );
			results.push( [ url, completeRequests, responseTimes, metrics ] );
			if ( logURLProgress ) {
				log( formats.success( 'Success.' ) );
			}
		} catch ( err ) {
			log( formats.error( `Error: ${ err.message }.` ) );
		}
	}

	if ( results.length === 0 ) {
		log(
			formats.error(
				'You need to provide a URL to benchmark via one or more --url (-u) arguments, or a file with one or more URLs via the --file (-f) argument.'
			)
		);
	} else {
		outputResults( opt, results );
	}
}

function benchmarkURL( params ) {
	const metrics = {};
	const responseTimes = [];
	let completeRequests = 0;

	const onHeaders = ( { headers } ) => {
		const responseMetrics = getServerTimingMetricsFromHeaders( headers );
		Object.entries( responseMetrics ).forEach( ( [ key, value ] ) => {
			metrics[ key ] = metrics[ key ] || [];
			metrics[ key ].push( +value );
		} );
	};

	const onResponse = ( statusCode, resBytes, responseTime ) => {
		if ( statusCode === 200 ) {
			completeRequests++;
		}

		responseTimes.push( responseTime );
	};

	const instance = autocannon( {
		requests: [
			{
				setupRequest( req ) {
					const url = new URL( req.path, 'http://localhost' ); // The base doesn't matter since we're only manipulating the path.
					url.searchParams.set( 'rnd', String( Math.random() ) );
					return {
						...req,
						path: url.pathname + url.search,
					};
				},
			},
		],
		...params,
		setupClient( client ) {
			client.on( 'headers', onHeaders );
			client.on( 'response', onResponse );
		},
	} );

	const onStop = instance.stop.bind( instance );
	process.once( 'SIGINT', onStop );

	return new Promise( ( resolve ) => {
		instance.on( 'done', () => {
			process.off( 'SIGINT', onStop );
			resolve( { responseTimes, completeRequests, metrics } );
		} );
	} );
}

/**
 * Reads the Server-Timing metrics from the response headers.
 *
 * @param {Array.<string>} headers Array of response headers information where each even element is a header name and an odd element is the header value.
 * @return {Object} An object where keys are metric names and values are metric values.
 */
function getServerTimingMetricsFromHeaders( headers ) {
	for ( let i = 0, len = headers.length; i < len; i += 2 ) {
		if ( headers[ i ].toLowerCase() !== 'server-timing' ) {
			continue;
		}

		return headers[ i + 1 ]
			.split( ',' )
			.map( ( timing ) => timing.trim().split( ';dur=' ) )
			.reduce(
				( obj, [ key, value ] ) => ( { ...obj, [ key ]: value } ),
				{}
			);
	}

	return {};
}

function outputResults( opt, results ) {
	const len = results.length;
	const allMetricNames = {};

	for ( let i = 0; i < len; i++ ) {
		for ( const metric of Object.keys( results[ i ][ 3 ] ) ) {
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
		percentiles.forEach( ( percentile ) => {
			headings.push( `Response Time (p${ percentile })` );
		} );

		if ( opt.showVariance ) {
			headings.push( 'Response Time (SD)' );
			headings.push( 'Response Time (MAD)' );
			headings.push( 'Response Time (IQR)' );
		}

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
		headings.push( 'Response Time (median)' );
		if ( opt.showVariance ) {
			headings.push( 'Response Time (SD)' );
			headings.push( 'Response Time (MAD)' );
			headings.push( 'Response Time (IQR)' );
		}

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
		const [ url, completeRequests, responseTimes, metrics ] = results[ i ];
		const completionRate = round(
			( 100 * completeRequests ) / ( opt.number || 1 ),
			1
		);

		const tableRow = [
			url,
			`${ completionRate }%`,
			...percentiles.map( ( percentile ) =>
				round( calcPercentile( percentile, responseTimes ), 2 )
			),
		];

		if ( opt.showVariance ) {
			tableRow.push(
				round( calcStandardDeviation( responseTimes, 1 ), 2 )
			);
			tableRow.push(
				round( calcMedianAbsoluteDeviation( responseTimes ), 2 )
			);
			tableRow.push(
				round(
					calcPercentile( 75, responseTimes ) -
						calcPercentile( 25, responseTimes ),
					2
				)
			);
		}

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
									1
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
