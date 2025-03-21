/**
 * CLI command to summarize a previous survey of a set of URLs for pages using Optimization Detective to measure its effectiveness at improving performance.
 *
 * This runs on a directory previously created by `survey-optimization-detective-effectiveness`.
 *
 * WPP Research, Copyright 2025 Google LLC
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
import path from 'path';
import { log, formats } from '../lib/cli/logger.mjs';

export const options = [
	{
		argname: '-o, --output-dir <output_dir>',
		description: 'Base output directory for the results. Each subdirectory contains the results for a single URL, where the directory name is a hash of the URL. Defaults to "output/survey-optimization-detective-effectiveness".',
		defaults: 'output/survey-optimization-detective-effectiveness',
	}
];

/**
 * Gets the absolute output directory.
 *
 * @param {string} outputDir
 * @returns {string}
 */
function getAbsoluteOutputDir( outputDir ) {
	if ( outputDir.startsWith( '/' ) ) {
		return outputDir;
	} else {
		return path.join(process.cwd(), outputDir);
	}
}

/**
 *
 * @param {object} opt
 * @param {string} opt.urlsFile
 * @param {string} opt.outputDir
 * @param {number} opt.parallel
 * @param {boolean} opt.force
 * @returns {Promise<void>}
 */
export async function handler( opt ) {
	const outputDir = getAbsoluteOutputDir( opt.outputDir );
	if ( ! fs.existsSync( outputDir ) ) {
		throw new Error( `Directory does not exist: ${ outputDir }` );
	}

	//const summaryDir = path.join( outputDir, 'summary' );
	//log( `Outputting summary to ${ summaryDir }` );

	const errorManifest = obtainErrorManifest( outputDir );
	delete errorManifest.errorUrlMap;

	const successCount = errorManifest.urlCount - errorManifest.errorUrlCount;
	log( `Success rate for being able to analyze a URL: ${ ( ( successCount / errorManifest.urlCount ) * 100 ).toFixed( 1 ) }% (${ successCount } of ${ errorManifest.urlCount }).` );

	const aggregateDiffs = obtainAverageDiffMetrics( outputDir );
	console.log(aggregateDiffs);

	const report = obtainLcpElementPrioritizationReport( outputDir );
	console.log( report );
}

function obtainAverageDiffMetrics( resultDir ) {
	const aggregateDiffs = {
		'LCP': {
			diffTime: [],
			diffPercent: []
		},
		'TTFB': {
			diffTime: [],
			diffPercent: []
		},
		'LCP-TTFB': {
			diffTime: [],
			diffPercent: []
		}
	};

	/**
	 * Recursively traverses a directory and its subdirectories,
	 * processing files that match the specified criteria.
	 *
	 * @param {string} dirPath The path to the directory to traverse.
	 */
	function walkSync(dirPath) {
		const files = fs.readdirSync(dirPath);

		if ( files.includes( 'original' ) && files.includes( 'optimized' ) ) {
			// Abort if the analysis was not completed yet (where version.txt is written after the analysis of a URL is complete) or if there was an error.
			if ( ! fs.existsSync( path.join( dirPath, '..', 'version.txt' ) ) || fs.existsSync( path.join( dirPath, '..', 'errors.txt' ) ) ) {
				return;
			}

			const originalResults = JSON.parse(fs.readFileSync(path.join( dirPath, 'original', 'results.json' ), 'utf8'));
			const optimizedResults = JSON.parse(fs.readFileSync(path.join( dirPath, 'optimized', 'results.json' ), 'utf8'));

			for ( const key of [ 'TTFB', 'LCP', 'LCP-TTFB' ] ) {
				const diffTime = optimizedResults.metrics[ key ].value - originalResults.metrics[ key ].value;
				aggregateDiffs[ key ].diffTime.push( diffTime );
				aggregateDiffs[ key ].diffPercent.push( ( diffTime / originalResults.metrics[ key ].value ) * 100 );
			}
		} else {
			for (const file of files) {
				const filePath = path.join(dirPath, file);
				const stats = fs.statSync(filePath);
				if (stats.isDirectory()) {
					walkSync(filePath);
				}
			}
		}
	}

	walkSync(resultDir);

	/**
	 *
	 * @param {number} num
	 * @returns {string}
	 */
	const formatNumber = ( num ) => {
		return ( num > 0 ? '+' : '' ) + num.toFixed( 1 );
	};

	for ( const key of Object.keys( aggregateDiffs ) ) {
		console.log( '#', key );
		console.log( `average diff time: ${ formatNumber( computeAverage( aggregateDiffs[ key ].diffTime ) ) }ms` );
		console.log( `median diff time: ${ formatNumber( computeMedian( aggregateDiffs[ key ].diffTime ) ) }ms` );
		console.log( `average diff percent: ${ formatNumber( computeAverage( aggregateDiffs[ key ].diffPercent ) ) }%` );
		console.log( `median diff percent: ${ formatNumber( computeMedian( aggregateDiffs[ key ].diffPercent ) ) }%` );
		console.log();
	}


	return {  };
}

function computeAverage(numbers) {
	if (!Array.isArray(numbers) || numbers.length === 0) {
		return null;
	}

	const sum = numbers.reduce((accumulator, currentValue) => accumulator + currentValue, 0);
	return sum / numbers.length;
}

function computeMedian(numbers) {
	if (!Array.isArray(numbers) || numbers.length === 0) {
		return null;
	}

	// 1. Sort the array in ascending order.
	const sortedNumbers = numbers.slice().sort((a, b) => a - b);
	const middleIndex = Math.floor(sortedNumbers.length / 2);

	// 2. Handle even and odd length arrays.
	if (sortedNumbers.length % 2 === 0) {
		// Even number of elements: median is the average of the two middle elements.
		return (sortedNumbers[middleIndex - 1] + sortedNumbers[middleIndex]) / 2;
	} else {
		// Odd number of elements: median is the middle element.
		return sortedNumbers[middleIndex];
	}
}

function obtainErrorManifest( outputDir ) {
	// Initialize the data structure to store errors and URLs
	const errorUrlMap = {};

	let urlCount = 0;
	let errorUrlCount = 0;

	/**
	 * Recursively traverses the directory, processes "errors.txt" and "url.txt" files,
	 * and populates the errorUrlMap.
	 *
	 * @param {string} dirPath The path to the directory to traverse.
	 */
	function walkSync(dirPath) {
		const files = fs.readdirSync(dirPath);

		// The analyze-optimization-detective-effectiveness script outputs version.txt when successfully complete, or else it outputs errors.txt when there was an error.
		if ( files.includes('url.txt') && (files.includes('errors.txt') || files.includes('version.txt')) ) {
			urlCount++;
			if (files.includes('errors.txt')) {
				errorUrlCount++;
			} else {
				// If there's no errors.txt, then there's nothing to do.
				return;
			}

			const errorsFilePath = path.join(dirPath, 'errors.txt');
			const urlFilePath = path.join(dirPath, 'url.txt');

			// Read the URL from url.txt
			const url = fs.readFileSync(urlFilePath, 'utf8').trim();

			// Read the errors from errors.txt, splitting by line
			const errors = fs.readFileSync(errorsFilePath, 'utf8').trim().split('\n');

			// Process each error message
			errors.forEach(error => {
				// Trim the error message to remove leading/trailing whitespace
				const trimmedError = error.trim();
				if (trimmedError) { // Only process non-empty errors
					if (!errorUrlMap[trimmedError]) {
						errorUrlMap[trimmedError] = [];
					}
					errorUrlMap[trimmedError].push(url);
				}
			});
		} else {
			// Check for subdirectories
			for (const file of files) {
				const filePath = path.join(dirPath, file);
				const stats = fs.statSync(filePath);
				if (stats.isDirectory()) {
					walkSync(filePath); // Recurse into subdirectories
				}
			}
		}
	}

	// Start the directory traversal
	walkSync(outputDir);

	return {urlCount, errorUrlCount, errorUrlMap};
}

function obtainLcpElementPrioritizationReport( outputDir ) {
	const defaultReportValues = {
		lcpImagePrioritized: {
			pass: 0,
			fail: 0,
		},
		lazyLoadedImgNotInViewport: {
			pass: 0,
			fail: 0,
		},
		imgWithFetchpriorityHighAttrInViewport: {
			pass: 0,
			fail: 0,
		},
	};

	const report = {
		original: structuredClone( defaultReportValues ),
		optimized: structuredClone( defaultReportValues ),
	};

	/**
	 * @param {{pass: number, fail: number}} passFailCounts
	 * @param {object} results
	 */
	function checkLazyLoadedImagesInsideViewport( passFailCounts, results ) {
		if ( results.images.imgCount > 0 ) {
			if ( results.images.lazyImgInsideViewportCount === 0 ) {
				passFailCounts.pass++;
			} else {
				passFailCounts.fail++;
			}
		}
	}

	/**
	 * @param {{pass: number, fail: number}} passFailCounts
	 * @param {object} results
	 */
	function checkImgWithFetchpriorityHighAttrOutsideViewport( passFailCounts, results ) {
		if (
			// There is at least one IMG with fetchpriority=high.
			results.images.fetchpriorityHighAttrImages.outsideViewportCount > 0 ||
			results.images.fetchpriorityHighAttrImages.insideViewportCount > 0
		) {
			if ( results.images.fetchpriorityHighAttrImages.outsideViewportCount === 0 ) {
				passFailCounts.pass++;
			} else {
				passFailCounts.fail++;
			}
		}
	}

	/**
	 * Recursively traverses the directory, processes "url.txt" and "results.json" files,
	 * and counts preloadedByOD values in "optimized" directories.  It also counts
	 * the number of times fetchpriority is "high" or not "high" in "original" directories.
	 *
	 * @param {string} dirPath The path to the directory to traverse.
	 */
	function walkSync(dirPath) {
		const files = fs.readdirSync(dirPath);

		// Check original.
		if (path.basename(dirPath) === 'original' && files.includes('results.json')) {
			const resultsFilePath = path.join(dirPath, 'results.json');
			const resultsData = JSON.parse(fs.readFileSync(resultsFilePath, 'utf8'));

			// If there is an LCP image: passing means it is an IMG element which has fetchpriority=high (where if the LCP element is non-IMG then this is a fail).
			const lcpData = resultsData?.metrics?.LCP;
			if (lcpData && lcpData.url) {
				if ( lcpData.element?.tagName === 'IMG' && lcpData.element?.attributes?.fetchpriority === 'high' ) {
					report.original.lcpImagePrioritized.pass++;
				} else {
					report.original.lcpImagePrioritized.fail++;
				}
			}

			checkLazyLoadedImagesInsideViewport( report.original.lazyLoadedImgNotInViewport, resultsData );
			checkImgWithFetchpriorityHighAttrOutsideViewport( report.original.imgWithFetchpriorityHighAttrInViewport, resultsData );
		}

		// Check optimized.
		if (path.basename(dirPath) === 'optimized' && files.includes('results.json')) {
			const resultsFilePath = path.join(dirPath, 'results.json');
			const resultsData = JSON.parse(fs.readFileSync(resultsFilePath, 'utf8'));

			// If there is an LCP image: passing means it was preloaded by Optimization Detective (whether an IMG tag or a background image).
			// TODO: What if there are odPreload links which caused a preload but which isn't the LCP?
			const lcpData = resultsData?.metrics?.LCP;
			if (lcpData && lcpData.url) {
				if (lcpData.preloadedByOD === true) {
					report.optimized.lcpImagePrioritized.pass++;
				} else {
					report.optimized.lcpImagePrioritized.fail++;
				}
			}

			checkLazyLoadedImagesInsideViewport( report.optimized.lazyLoadedImgNotInViewport, resultsData );
			checkImgWithFetchpriorityHighAttrOutsideViewport( report.optimized.imgWithFetchpriorityHighAttrInViewport, resultsData );
		}

		// Check for subdirectories
		for (const file of files) {
			const filePath = path.join(dirPath, file);
			const stats = fs.statSync(filePath);
			if (stats.isDirectory()) {
				walkSync(filePath); // Recurse into subdirectories
			}
		}
	}

	walkSync(outputDir);

	// Compute pass rate.
	for ( const reportPart of Object.values( report )  ) {
		for ( const passFailCounts of Object.values( reportPart ) ) {
			passFailCounts.passRate = passFailCounts.pass / ( passFailCounts.pass + passFailCounts.fail );
		}
	}

	return report;
}
