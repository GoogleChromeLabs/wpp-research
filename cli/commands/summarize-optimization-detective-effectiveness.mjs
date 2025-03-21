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
import crypto from 'crypto';
import { spawn } from 'child_process';

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

	const summaryDir = path.join( outputDir, 'summary' );
	log( `Outputting summary to ${ summaryDir }` );

	const aggregateDiffs = obtainAverageDiffMetrics( outputDir );
	console.log(aggregateDiffs);

	const errorManifest = obtainErrorManifest( outputDir );
	//console.log(errorManifest);

	const successCount = errorManifest.urlCount - errorManifest.errorUrlCount;
	console.log( `Success rate for being able to analyze a URL: ${ ( ( successCount / errorManifest.urlCount ) * 100 ).toFixed( 1 ) }% ( ${ successCount } of ${ errorManifest.urlCount } ).` );

	const report = obtainLcpElementPrioritizationReport( outputDir );
	console.log( report );
}

function obtainAverageDiffMetrics( resultDir ) {
	const aggregateDiffs = {
		'LCP': {
			'diff_time': [],
			'diff_percent': []
		},
		'TTFB': {
			'diff_time': [],
			'diff_percent': []
		},
		'LCP-TTFB': {
			'diff_time': [],
			'diff_percent': []
		}
	};

	let urlCount = 0;

	/**
	 * Recursively traverses a directory and its subdirectories,
	 * processing files that match the specified criteria.
	 *
	 * @param {string} dirPath The path to the directory to traverse.
	 */
	function walkSync(dirPath) {
		try {
			const files = fs.readdirSync(dirPath);

			for (const file of files) {
				const filePath = path.join(dirPath, file);
				const stats = fs.statSync(filePath);

				if (stats.isDirectory()) {
					walkSync(filePath); // Recursively call for subdirectories
				} else if (stats.isFile() && file === 'results-diff.json') {
					try {
						const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

						for (const metric in data) {
							if (aggregateDiffs[metric]) { // Check if the metric exists in aggregateDiffs
								for (const key of ['diff_percent', 'diff_time']) {
									if(data[metric] && data[metric][key]){
										aggregateDiffs[metric][key].push(data[metric][key]);
										urlCount++;
									}
								}
							}
						}
					} catch (parseError) {
						console.error(`Error parsing JSON file: ${filePath}`, parseError);
					}
				}
			}
		} catch (readDirError) {
			console.error(`Error reading directory: ${dirPath}`, readDirError);
		}
	}

	walkSync(resultDir);

	for (const metric in aggregateDiffs) {
		for (const key in aggregateDiffs[metric]) {
			const values = aggregateDiffs[metric][key];
			const sum = values.reduce((acc, val) => acc + val, 0);
			aggregateDiffs[metric][key] = values.length > 0 ? sum / values.length : 0;
		}
	}

	return { aggregateDiffs, urlCount };
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
		try {
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

				try {
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
				} catch (fileError) {
					console.error(`Error reading or processing files in: ${dirPath}`, fileError);
				}
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
		} catch (readDirError) {
			console.error(`Error reading directory: ${dirPath}`, readDirError);
		}
	}

	// Start the directory traversal
	walkSync(outputDir);

	return {urlCount, errorUrlCount, errorUrlMap};
}

function obtainLcpElementPrioritizationReport( outputDir ) {
	const defaultReportValues = {
		// If there is an LCP image: passing means it is an IMG element which has fetchpriority=high (where if the LCP element is non-IMG then this is a fail).
		lcpImagePrioritized: {
			pass: 0,
			fail: 0,
		},
		lazyLoadedImagesInViewport: {
			pass: 0,
			fail: 0,
		},
		imgWithFetchpriorityHighAttrInViewport: {
			pass: 0,
			fail: 0,
		},
	};

	const report = {
		original: Object.assign( {}, defaultReportValues ),
		optimized: Object.assign( {}, defaultReportValues ),
	};

	/**
	 * @param {{pass: number, fail: number}} passFailCounts
	 * @param {object} results
	 */
	function checkLazyLoadedImagesInsideViewport( passFailCounts, results ) {
		if ( results.images && results.images.imgCount > 0 ) {
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
		if ( results.images && results.images.imgCount > 0 && results.images.fetchpriorityHighAttrImages ) {
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

			checkLazyLoadedImagesInsideViewport( report.original.lazyLoadedImagesInViewport, resultsData );
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

			checkLazyLoadedImagesInsideViewport( report.optimized.lazyLoadedImagesInViewport, resultsData );
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

	report.optimized.imgWithFetchpriorityHighAttrInViewport.pass += 1;

	walkSync(outputDir);

	return report;
}
