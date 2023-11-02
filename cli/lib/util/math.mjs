/**
 * Mathematical utility functions.
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

export function calcPercentile( percentile, values ) {
	const notNullValues = values.filter( ( value ) => value !== null );

	const len = notNullValues.length;
	if ( len === 0 ) {
		return 0;
	}

	// Sort values with the lowest first.
	const list = [ ...notNullValues ];
	list.sort( ( a, b ) => a - b );

	if ( percentile <= 0 ) {
		return list[ 0 ];
	}
	if ( percentile >= 100 ) {
		return list[ len - 1 ];
	}

	// Get the index of the highest value in the percentile.
	const index = ( percentile / 100 ) * ( len - 1 );

	// If index is a whole number, return that value directly.
	if ( index % 1 === 0 ) {
		return list[ index ];
	}

	// Otherwise use the weighted value from between the two surrounding indexes.
	const lowerIndex = Math.floor( index );
	const upperIndex = lowerIndex + 1;
	const weight = index % 1;
	return list[ lowerIndex ] * ( 1 - weight ) + list[ upperIndex ] * weight;
}

export function calcMedian( values ) {
	return calcPercentile( 50, values );
}

export function calcStandardDeviation( arr, usePopulation = false ) {
	const mean = arr.reduce( ( acc, val ) => acc + val, 0 ) / arr.length;
	return Math.sqrt(
		arr
			.reduce( ( acc, val ) => acc.concat( ( val - mean ) ** 2 ), [] )
			.reduce( ( acc, val ) => acc + val, 0 ) /
			( arr.length - ( usePopulation ? 0 : 1 ) )
	);
}

export function calcMedianAbsoluteDeviation( values ) {
	const median = calcMedian( values );

	return calcMedian( values.map( value => Math.abs( value - median ) ) );
}
