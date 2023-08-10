#!/usr/bin/env node

import { existsSync } from 'node:fs';
import csv from 'csvtojson';
import tablemark from 'tablemark';

const args = process.argv.slice( 2 );

const title = args[ 0 ];
const beforeFile = args[ 1 ];
const afterFile = args[ 2 ];

if ( ! existsSync( beforeFile ) ) {
	console.error( `File not found: ${ beforeFile }` );
	process.exit( 1 );
}

if ( ! existsSync( afterFile ) ) {
	console.error( `File not found: ${ afterFile }` );
	process.exit( 1 );
}

/**
 * Format test results as a Markdown table.
 *
 * @param {Array<Record<string,string|number|boolean>>} results Test results.
 *
 * @return {string} Markdown content.
 */
function formatAsMarkdownTable( results ) {
	if ( ! results?.length ) {
		return '';
	}

	return tablemark( results, {
		caseHeaders: false,
		columns: [
			{ align: 'center' },
			{ align: 'center' },
			{ align: 'center' },
			{ align: 'center' },
		],
	} );
}

/**
 * @type {Array<{file: string, title: string, results: Record<string,string|number|boolean>[]}>}
 */
let beforeStats = [];

/**
 * @type {Array<{file: string, title: string, results: Record<string,string|number|boolean>[]}>}
 */
let afterStats;

try {
	beforeStats = await csv( {
		noheader: true,
		headers: [ 'key', 'value' ],
	} ).fromFile( beforeFile );
} catch {
	console.error( `Could not read file: ${ beforeFile }` );
	process.exit( 1 );
}

try {
	afterStats = await csv( {
		noheader: true,
		headers: [ 'key', 'value' ],
	} ).fromFile( afterFile );
} catch {
	console.error( `Could not read file: ${ afterFile }` );
	process.exit( 1 );
}

const comparison = [];

for ( const i in beforeStats ) {
	const before = beforeStats[ i ];
	const after = afterStats[ i ];

	const { key, value } = before;

	const valueBefore = Number( value );
	const valueAfter = Number( after.value );

	if ( ! Number.isFinite( Number( value ) ) ) {
		continue;
	}

	comparison.push( {
		Metric: key,
		Before: `${ valueBefore } ms`,
		After: `${ valueAfter } ms`,
		'Diff %': `${ ( ( valueAfter / valueBefore - 1 ) * 100 ).toFixed(
			2
		) }%`,
		'Diff abs.': `${ ( valueAfter - valueBefore ).toFixed( 2 ) } ms`,
	} );
}

console.log( `**${ title }**\n` );
console.log( formatAsMarkdownTable( comparison ) );
console.log();
