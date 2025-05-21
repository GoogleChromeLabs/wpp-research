/**
 * CLI logging functions.
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
import chalk from 'chalk';
import { table as formatTable } from 'table';
import { stringify as formatCsv } from 'csv-stringify/sync'; // eslint-disable-line import/no-unresolved
import { markdownTable } from 'markdown-table';

// Responsible for the actual command output.
export const output = ( text ) => {
	process.stdout.write( `${ text }\n` );
};

// Responsible for (debug) logging.
export const log = ( text ) => {
	process.stderr.write( `${ text }\n` );
};

// Responsible for (debug) logging without "terminating" the line.
export const logPartial = ( text ) => {
	process.stderr.write( text );
};

export const formats = {
	title: chalk.bold,
	error: chalk.bold.red,
	warning: chalk.bold.hex( '#FFA500' ),
	success: chalk.bold.green,
};

export const OUTPUT_FORMAT_TABLE = 'table';
export const OUTPUT_FORMAT_CSV = 'csv';
export const OUTPUT_FORMAT_MD = 'md';

export function isValidTableFormat( format ) {
	return (
		format === OUTPUT_FORMAT_TABLE ||
		format === OUTPUT_FORMAT_CSV ||
		format === OUTPUT_FORMAT_MD
	);
}

export function table( headings, data, format, rowsAsColumns ) {
	const tableData = [];

	if ( rowsAsColumns ) {
		headings.forEach( ( heading ) => {
			tableData.push( [ heading ] );
		} );
		data.forEach( ( row ) => {
			if ( row.length !== headings.length ) {
				throw new Error( 'Invalid table data.' );
			}
			row.forEach( ( value, index ) => {
				tableData[ index ].push( value );
			} );
		} );
	} else {
		tableData.push( headings );
		data.forEach( ( row ) => {
			if ( row.length !== headings.length ) {
				throw new Error( 'Invalid table data.' );
			}
			tableData.push( row );
		} );
	}

	if ( format === OUTPUT_FORMAT_CSV ) {
		return formatCsv( tableData );
	} else if ( format === OUTPUT_FORMAT_MD ) {
		// Align the first column to the left, but align all remaining columns to the right since they are numeric.
		const align = [ 'l', ...Array( headings.length - 1 ).fill( 'r' ) ];
		return markdownTable( tableData, { align } );
	}

	return formatTable( tableData );
}
