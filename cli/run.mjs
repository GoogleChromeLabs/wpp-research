#!/usr/bin/env node
/**
 * Research CLI command runner.
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
import { Command } from 'commander';

/**
 * Internal dependencies
 */
import {
	handler as analyzeLoadingOptimizationHandler,
	options as analyzeLoadingOptimizationOptions,
} from './commands/analyze-loading-optimization.mjs';
import {
	handler as benchmarkServerTimingHandler,
	options as benchmarkServerTimingOptions,
} from './commands/benchmark-server-timing.mjs';
import {
	handler as benchmarkWebVitalsHandler,
	options as benchmarkWebVitalsOptions,
} from './commands/benchmark-web-vitals.mjs';
import {
	handler as wptMetricsHandler,
	options as wptMetricsOptions,
} from './commands/wpt-metrics.mjs';
import {
	handler as wptServerTimingHandler,
	options as wptServerTimingOptions,
} from './commands/wpt-server-timing.mjs';

const program = new Command();

const withOptions = ( command, options ) => {
	options.forEach(
		( { description, argname, defaults, parseArg, required } ) => {
			if ( required ) {
				command = command.requiredOption(
					argname,
					description,
					parseArg,
					defaults
				);
			} else if ( parseArg ) {
				command = command.option(
					argname,
					description,
					parseArg,
					defaults
				);
			} else {
				command = command.option( argname, description, defaults );
			}
		}
	);
	return command;
};

const catchException = ( handler ) => {
	return async ( ...args ) => {
		try {
			await handler( ...args );
		} catch ( error ) {
			console.error( error ); // eslint-disable-line no-console
			process.exit( 1 );
		}
	};
};

withOptions(
	program.command( 'analyze-loading-optimization' ),
	analyzeLoadingOptimizationOptions
)
	.description( 'Analyzes issues with loading optimization' )
	.action( catchException( analyzeLoadingOptimizationHandler ) );
withOptions(
	program.command( 'benchmark-server-timing' ),
	benchmarkServerTimingOptions
)
	.description( 'Runs Server Timing benchmarks for an URL' )
	.action( catchException( benchmarkServerTimingHandler ) );
withOptions(
	program.command( 'benchmark-web-vitals' ),
	benchmarkWebVitalsOptions
)
	.description( 'Runs Web Vitals benchmarks for an URL' )
	.action( catchException( benchmarkWebVitalsHandler ) );
withOptions( program.command( 'wpt-metrics' ), wptMetricsOptions )
	.description( 'Gets performance metrics for a WebPageTest result' )
	.action( catchException( wptMetricsHandler ) );
withOptions( program.command( 'wpt-server-timing' ), wptServerTimingOptions )
	.description( 'Gets Server-Timing metrics for a WebPageTest result' )
	.action( catchException( wptServerTimingHandler ) );

program.parse( process.argv );
