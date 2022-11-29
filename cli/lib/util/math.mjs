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

export function calcMedian( values ) {
	const len = values.length;
	if ( len === 0 ) {
		return 0;
	}

	const list = [ ...values ];
	list.sort( ( a, b ) => b - a );

	return len % 2 === 0
		? ( list[ len / 2 ] + list[ ( len / 2 ) - 1 ] ) / 2
		: list[ Math.floor( len / 2 ) ];
}
