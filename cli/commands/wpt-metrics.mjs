/**
 * CLI command to get performance metrics from a WebPageTest result.
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
import round from 'lodash-es/round.js';

/**
 * Internal dependencies
 */
import {
	log,
	output,
	formats,
	table,
	isValidTableFormat,
	OUTPUT_FORMAT_TABLE,
} from '../lib/cli/logger.mjs';
import { parseWptTestId } from '../lib/cli/args.mjs';
import {
	getResultJson,
	getResultMetrics,
	mergeResultMetrics,
} from '../lib/wpt/result.mjs';
import {
	KEY_PERCENTILES,
	MEDIAN_PERCENTILES,
} from '../lib/util/percentiles.mjs';

export const options = [
	{
		argname: '-t, --test <test...>',
		description:
			'WebPageTest test result ID or URL; optionally supports passing multiple test result IDs to merge their metrics',
		required: true,
	},
	{
		argname: '-m, --metrics <metrics...>',
		description: 'One or more WebPageTest metrics',
		required: true,
	},
	{
		argname: '-f, --format <format>',
		description: 'Output format: "csv", "table", "md"',
		defaults: OUTPUT_FORMAT_TABLE,
	},
	{
		argname: '-p, --show-percentiles',
		description:
			'Whether to show more granular percentiles instead of only the median',
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
	const {
		test,
		metrics,
		format,
		showPercentiles,
		includeRuns,
		rowsAsColumns,
	} = opt;

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
				`Invalid output ${ format }. The output format provided via the --output (-o) argument must be either "table", "csv", or "md".`
			)
		);
		return;
	}

	const percentiles = showPercentiles ? KEY_PERCENTILES : MEDIAN_PERCENTILES;

	// Usually only one test ID is passed, but multiple are supported. This can be useful to merge results from
	// multiple WebPageTest tests, typically with similar configuration, to get more than 9 test runs.
	let accTestRuns = 0;
	const accResultMetrics = {};
	await Promise.all(
		testIds.map( async ( testId ) => {
			const result = await getResultJson( testId );
			const resultMetrics = getResultMetrics(
				percentiles,
				result,
				...metrics
			);

			accTestRuns += result.testRuns;
			resultMetrics.forEach( ( metric ) => {
				if ( ! accResultMetrics[ metric.name ] ) {
					accResultMetrics[ metric.name ] = [];
				}
				accResultMetrics[ metric.name ].push( metric );
			} );
		} )
	);
	const mergedResultMetrics = Object.values( accResultMetrics ).map(
		( resultMetrics ) => {
			return resultMetrics.length > 1
				? mergeResultMetrics( percentiles, ...resultMetrics )
				: resultMetrics.shift();
		}
	);

	let headings, parseTableData;
	if ( showPercentiles && includeRuns ) {
		headings = [
			'Metric',
			...percentiles.map( ( percentile ) => `p${ percentile }` ),
		];
		for ( let i = 0; i < accTestRuns; i++ ) {
			headings.push( `Run ${ i + 1 }` );
		}
		parseTableData = ( metric ) => {
			return [
				metric.name,
				...percentiles.map( ( percentile ) =>
					round( metric[ `p${ percentile }` ], 2 )
				),
				...metric.runs,
			];
		};
	} else if ( includeRuns ) {
		headings = [ 'Metric', 'Median' ];
		for ( let i = 0; i < accTestRuns; i++ ) {
			headings.push( `Run ${ i + 1 }` );
		}
		parseTableData = ( metric ) => {
			return [ metric.name, round( metric.p50, 2 ), ...metric.runs ];
		};
	} else if ( showPercentiles ) {
		headings = [
			'Metric',
			...percentiles.map( ( percentile ) => `p${ percentile }` ),
		];
		parseTableData = ( metric ) => {
			return [
				metric.name,
				...percentiles.map( ( percentile ) =>
					round( metric[ `p${ percentile }` ], 2 )
				),
			];
		};
	} else {
		headings = [ 'Metric', 'Median' ];
		parseTableData = ( metric ) => {
			return [ metric.name, round( metric.p50, 2 ) ];
		};
	}

	output(
		table(
			headings,
			mergedResultMetrics.map( parseTableData ),
			format,
			rowsAsColumns
		)
	);
}
