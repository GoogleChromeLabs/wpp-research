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
import fs from 'fs';
import readline from 'readline';
import autocannon from 'autocannon';
import round from 'lodash-es/round.js';

/**
 * Internal dependencies
 */
import {
   log,
   formats,
   table,
   isValidTableFormat,
   OUTPUT_FORMAT_TABLE,
} from '../lib/cli/logger.mjs';
import { calcMedian } from '../lib/util/math.mjs';

export const options = [
	{
		argname: '-u, --url <url>',
		description: 'An URL to run benchmark tests for',
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
		description: 'Output format: csv or table',
		defaults: OUTPUT_FORMAT_TABLE,
	},
];

export async function handler( opt ) {
	if ( ! isValidTableFormat( opt.output ) ) {
		log(
			formats.error(
				'The output format provided via the --output (-o) argument must be either "table" or "csv".'
			)
		);
		return;
	}

	const { concurrency: connections, number: amount } = opt;
	const results = [];

	for await ( const url of getURLs( opt ) ) {
		const { completeRequests, responseTimes, metrics } = await benchmarkURL(
			{
				url,
				connections,
				amount,
			}
		);

		results.push( [ url, completeRequests, responseTimes, metrics ] );
	}

	if ( results.length === 0 ) {
		log(
			formats.error(
				'You need to provide a URL to benchmark via the --url (-u) argument, or a file with multiple URLs via the --file (-f) argument.'
			)
		);
	} else {
		outputResults( opt, results );
	}
};

/**
 * Generates URLs to benchmark based on command arguments. If both "<url>" and "<file>" arguments
 * are passed to the command, then both will be used to generate URLs.
 *
 * @param {BenchmarkCommandOptions} opt Command options.
 */
async function* getURLs( opt ) {
	if ( !! opt.url ) {
		yield opt.url;
	}

	if ( !! opt.file ) {
		const rl = readline.createInterface( {
			input: fs.createReadStream( opt.file ),
			crlfDelay: Infinity,
		} );

		for await ( const url of rl ) {
			if ( url.length > 0 ) {
				yield url;
			}
		}
	}
}

/**
 * Benchmarks an URL and returns response time and server-timing metrics for every request.
 *
 * @param {BenchmarkOptions} params Benchmark parameters.
 * @return {BenchmarkResults} Response times and metrics arrays.
 */
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
		method: 'POST', // The post method is needed to bypass CDN or full page cache.
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

/**
 * Ouptuts results of benchmarking.
 *
 * @param {BenchmarkCommandOptions} opt     Command options.
 * @param {Array.<Array>}           results A collection of benchmark results for each URL.
 */
function outputResults( opt, results ) {
	const len = results.length;
	const allMetricNames = {};

	for ( let i = 0; i < len; i++ ) {
		for ( const metric of Object.keys( results[ i ][ 3 ] ) ) {
			allMetricNames[ metric ] = '';
		}
	}

	const newRow = ( title ) => {
		const line = new Array( len + 1 ).fill( '' );
		line[ 0 ] = title;
		return line;
	};

	const headings = [
		'',
		'Success Rate',
		'Response Time',
	];

	Object.keys( allMetricNames ).forEach( ( name ) => {
		headings.push( name );
	} );

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
			round( calcMedian( responseTimes ), 2 ),
		];

		for ( const metric of Object.keys( metrics ) ) {
			const metricAvgMs = round( calcMedian( metrics[ metric ] ), 2 );
			tableRow.push( metricAvgMs );
		}

		tableData.push( tableRow );
	}

	log(
		table(
			headings,
			tableData,
			opt.output,
			true
		)
	);
}
