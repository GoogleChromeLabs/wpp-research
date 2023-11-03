/**
 * CLI argument functions.
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

/**
 * Internal dependencies
 */
import { isTestId, getTestIdFromResultUrl } from '../wpt/result.mjs';

export function parseWptTestId( testIdOrUrl ) {
	let testId;
	try {
		testId = getTestIdFromResultUrl( testIdOrUrl );
	} catch ( error ) {
		testId = testIdOrUrl;
		if ( ! isTestId( testId ) ) {
			throw new Error(
				`The value ${ testId } is not a valid WebPageTest test result ID or URL.`
			);
		}
	}
	return testId;
}

export async function* getURLs( opt ) {
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

export function shouldLogURLProgress( opt ) {
	return ! opt.url && !! opt.file;
}

export function shouldLogIterationsProgress( opt ) {
	return opt.number && opt.number > 1;
}
