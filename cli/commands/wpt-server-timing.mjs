/**
 * CLI command to get Server-Timing metrics from a WebPageTest result.
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
 * Internal dependencies
 */
import {
	log,
	formats,
	table,
	isValidTableFormat,
	OUTPUT_FORMAT_TABLE,
} from '../lib/cli/logger.mjs';
import { parseWptTestId } from '../lib/cli/args.mjs';
import {
	getResultJson,
	getResultServerTiming,
	mergeResultMetrics,
} from '../lib/wpt/result.mjs';

export const options = [
	{
		argname: '-t, --test <test...>',
		description: 'WebPageTest test result ID or URL; optionally supports passing multiple test result IDs to merge their metrics',
		required: true,
	},
	{
		argname: '-f, --format <format>',
		description: 'Output format: Either "table" or "csv"',
		defaults: OUTPUT_FORMAT_TABLE,
	},
	{
		argname: '-i, --include-runs',
		description: 'Whether to also show the full results for all runs',
	},
	{
		argname: '-r, --rows-as-columns',
		description: 'Whether to inverse rows and columns',
	},
];

export async function handler( opt ) {
	const { test, format, includeRuns, rowsAsColumns } = opt;

	let testIds;
	try {
		testIds = test.map( parseWptTestId );
	} catch ( error ) {
		log( formats.error( error ) );
		return;
	}

	if ( ! isValidTableFormat( format ) ) {
		log(
			formats.error(
				'The output format provided via the --format (-f) argument must be either "table" or "csv".'
			)
		);
		return;
	}

	// Usually only one test ID is passed, but multiple are supported. This can be useful to merge results from
	// multiple WebPageTest tests, typically with similar configuration, to get more than 9 test runs.
	let accTestRuns = 0;
	const accMedianMetrics = {};
	await Promise.all( testIds.map( async ( testId ) => {
		const result = await getResultJson( testId );
		const medianMetrics = getResultServerTiming( result );

		accTestRuns += result.testRuns;
		medianMetrics.forEach( ( metric ) => {
			if ( ! accMedianMetrics[ metric.name ] ) {
				accMedianMetrics[ metric.name ] = [];
			}
			accMedianMetrics[ metric.name ].push( metric );
		} );
	} ) );
	const mergedMedianMetrics = Object.values( accMedianMetrics ).map( ( medianMetrics ) => {
		return medianMetrics.length > 1 ? mergeResultMetrics( ...medianMetrics ) : medianMetrics.shift();
	} );

	let headings, parseTableData;
	if ( includeRuns ) {
		headings = [ 'Metric', 'Median' ];
		for ( let i = 0; i < accTestRuns; i++ ) {
			headings.push( `Run ${ i + 1 }` );
		}
		parseTableData = ( metric ) => {
			return [ metric.name, metric.median, ...metric.runs ];
		};
	} else {
		headings = [ 'Metric', 'Median' ];
		parseTableData = ( metric ) => {
			return [ metric.name, metric.median ];
		};
	}

	log(
		table(
			headings,
			mergedMedianMetrics.map( parseTableData ),
			format,
			rowsAsColumns,
		)
	);
}
