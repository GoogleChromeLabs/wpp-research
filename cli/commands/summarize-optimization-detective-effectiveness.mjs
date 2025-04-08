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
import { log } from '../lib/cli/logger.mjs';

/** @typedef {import("./analyze-optimization-detective-effectiveness.mjs").VisitedElement} VisitedElement */

export const options = [
	{
		argname: '-o, --output-dir <output_dir>',
		description:
			'Base output directory for the results. Each subdirectory contains the results for a single URL, where the directory name is a hash of the URL. Defaults to "output/survey-optimization-detective-effectiveness".',
		defaults: 'output/survey-optimization-detective-effectiveness',
	},
	{
		argname: '-l, --limit <count>',
		description: 'Limits summarizing to the provided count of URLs.',
		defaults: null,
	},
];

/** @type {{totalUrlCount: number, totalErroredUrlCount: number, errorUrlMap: Object<string, string[]>}} */
const errorManifest = {
	totalUrlCount: 0,
	totalErroredUrlCount: 0,
	errorUrlMap: {},
};

/**
 * @typedef {{diffTime: {mobile: number[], desktop: number[]}, diffPercent: {mobile: number[], desktop: number[]}}} AggregateMetric
 */

/**
 *
 * @type {AggregateMetric}
 */
const defaultAggregateDiffValue = {
	diffTime: {
		mobile: [],
		desktop: [],
	},
	diffPercent: {
		mobile: [],
		desktop: [],
	},
};

/**
 * @typedef {{LCP: AggregateMetric, TTFB: AggregateMetric, "LCP-TTFB": AggregateMetric}} AggregateMetrics
 */

/**
 * @type {AggregateMetrics}
 */
const aggregateDiffsTemplate = {
	LCP: structuredClone( defaultAggregateDiffValue ),
	TTFB: structuredClone( defaultAggregateDiffValue ),
	'LCP-TTFB': structuredClone( defaultAggregateDiffValue ),
};

const facetedAggregateDiffs = {
	all: {
		label: 'All',
		aggregateDiffs: structuredClone( aggregateDiffsTemplate ),
	},
	hasLcpImage: {
		label: 'LCP element has image',
		aggregateDiffs: structuredClone( aggregateDiffsTemplate ),
	},
	hasLcpImageWithODPrioritization: {
		label: 'LCP element has image prioritized by Optimization Detective',
		aggregateDiffs: structuredClone( aggregateDiffsTemplate ),
	},
};

const defaultMobileDesktopPassFailValue = {
	mobile: {
		pass: 0,
		fail: 0,
	},
	desktop: {
		pass: 0,
		fail: 0,
	},
};

const optimizationAccuracy = {
	original: {
		lcpImagePrioritized: structuredClone(
			defaultMobileDesktopPassFailValue
		),
		lazyLoadedImgNotInViewport: structuredClone(
			defaultMobileDesktopPassFailValue
		),
		imgWithFetchpriorityHighAttrInViewport: structuredClone(
			defaultMobileDesktopPassFailValue
		),
		odPreloadedImageInsideViewport: structuredClone(
			defaultMobileDesktopPassFailValue
		),
	},
	optimized: {
		lcpImagePrioritized: structuredClone(
			defaultMobileDesktopPassFailValue
		),
		lazyLoadedImgNotInViewport: structuredClone(
			defaultMobileDesktopPassFailValue
		),
		imgWithFetchpriorityHighAttrInViewport: structuredClone(
			defaultMobileDesktopPassFailValue
		),
		odPreloadedImageInsideViewport: structuredClone(
			defaultMobileDesktopPassFailValue
		),
	},
};

/** @type {Array<{device: string, url: string}>} */
const urlsWithODImagePrioritizationFailures = [];

/**
 * @param {string} dirPath
 * @param {string} url
 */
function handleErrorCase( dirPath, url ) {
	errorManifest.totalErroredUrlCount++;

	const errors = fs
		.readFileSync( path.join( dirPath, 'errors.txt' ), 'utf8' )
		.trim()
		.split( '\n' );

	errors.forEach( ( error ) => {
		// Trim the error message to remove leading/trailing whitespace
		let trimmedError = error.trim();
		if ( trimmedError ) {
			// Apply some normalization.
			trimmedError = trimmedError.replace(
				/ (for|on) (mobile|desktop)/,
				''
			);
			trimmedError = trimmedError.replace( / at http.+/, '' );

			// Only process non-empty errors
			if ( ! errorManifest.errorUrlMap[ trimmedError ] ) {
				errorManifest.errorUrlMap[ trimmedError ] = [];
			}
			errorManifest.errorUrlMap[ trimmedError ].push( url );
		}
	} );
}

/**
 * @param {VisitedElement[]} visitedElements - Visited elements.
 */
function countImages( visitedElements ) {
	let count = 0;
	for ( const visitedElement of visitedElements ) {
		if ( 'IMG' === visitedElement.tagName ) {
			count++;
		}
	}
	return count;
}

/**
 * @param {VisitedElement[]} visitedElements - Visited elements.
 */
function countImagesWithFetchPriorityHigh( visitedElements ) {
	let count = 0;
	for ( const visitedElement of visitedElements ) {
		if (
			'IMG' === visitedElement.tagName &&
			visitedElement.attributes?.fetchpriority === 'high'
		) {
			count++;
		}
	}
	return count;
}

/**
 * @param {VisitedElement[]} visitedElements - Visited elements.
 */
function countImagesWithFetchPriorityHighOutsideViewport( visitedElements ) {
	let count = 0;
	for ( const visitedElement of visitedElements ) {
		if (
			'IMG' === visitedElement.tagName &&
			visitedElement.attributes?.fetchpriority === 'high' &&
			! ( visitedElement.intersectionRatio > Number.EPSILON )
		) {
			count++;
		}
	}
	return count;
}

/**
 * @param {VisitedElement[]} visitedElements - Visited elements.
 */
function countLazyImgInsideViewport( visitedElements ) {
	let count = 0;
	for ( const visitedElement of visitedElements ) {
		if (
			'IMG' === visitedElement.tagName &&
			visitedElement.intersectionRatio > Number.EPSILON &&
			visitedElement.attributes?.loading === 'lazy'
		) {
			count++;
		}
	}
	return count;
}

/**
 * @param {Array<Object<string, string>>} odPreloadLinks  - Preload links.
 * @param {VisitedElement[]}              visitedElements - Visited elements.
 */
function isPreloadedImageInsideViewport( odPreloadLinks, visitedElements ) {
	for ( const odPreloadLink of odPreloadLinks ) {
		for ( const visitedElement of visitedElements ) {
			let intersectedElement = visitedElement;
			if ( 'PICTURE' === visitedElement.tagName ) {
				// The PICTURE itself is not intersected, but only the child IMG tag.
				for ( const otherVisitedElement of visitedElements ) {
					if (
						otherVisitedElement.tagName === 'IMG' &&
						otherVisitedElement.xpath.startsWith(
							visitedElement.xpath + '/'
						)
					) {
						intersectedElement = otherVisitedElement;
						break;
					}
				}
			}
			if ( intersectedElement.intersectionRatio < Number.EPSILON ) {
				continue;
			}
			if ( 'IMG' === visitedElement.tagName ) {
				if (
					visitedElement.attributes.src === odPreloadLink.href ||
					visitedElement.attributes.srcset ===
						odPreloadLink.imagesrcset
				) {
					return true;
				}
			} else if (
				'PICTURE' === visitedElement.tagName &&
				visitedElement.sources
			) {
				for ( const source of visitedElement.sources ) {
					// TODO: The media isn't being accounted for, but really only the first SOURCE should be considered since it's the one we preload.
					if ( source.srcset === odPreloadLink.imagesrcset ) {
						return true;
					}
				}
			} else if (
				visitedElement.attributes.style &&
				visitedElement.attributes.style.includes( 'url(' ) &&
				visitedElement.attributes.style.includes( odPreloadLink.href )
			) {
				return true;
			} else if ( 'VIDEO' === visitedElement.tagName ) {
				if ( visitedElement.attributes.poster === odPreloadLink.href ) {
					return true;
				}
			}
		}
	}
	return false;
}

/**
 * @param {string} dirPath
 * @param {string} url
 */
function handleSuccessCase( dirPath, url ) {
	const data = {
		mobile: {
			optimized: {},
			original: {},
		},
		desktop: {
			optimized: {},
			original: {},
		},
	};

	for ( const device of [ 'mobile', 'desktop' ] ) {
		for ( const status of [ 'original', 'optimized' ] ) {
			data[ device ][ status ] = JSON.parse(
				fs.readFileSync(
					path.join( dirPath, device, status, 'results.json' ),
					'utf8'
				)
			);
		}
	}

	for ( const device of [ 'mobile', 'desktop' ] ) {
		let odPrioritizedImage = null;
		// TODO: let corePrioritizedImage = null;

		for ( const status of [ 'original', 'optimized' ] ) {
			// Check for accuracy of lazy-loading.
			if ( countImages( data[ device ][ status ].elements ) > 0 ) {
				if (
					countLazyImgInsideViewport(
						data[ device ][ status ].elements
					) === 0
				) {
					optimizationAccuracy[ status ].lazyLoadedImgNotInViewport[
						device
					].pass++;
				} else {
					optimizationAccuracy[ status ].lazyLoadedImgNotInViewport[
						device
					].fail++;
				}
			}

			// Check for accuracy of having fetchpriority=high only in the viewport.
			if (
				countImagesWithFetchPriorityHigh(
					data[ device ][ status ].elements
				) > 0
			) {
				if (
					countImagesWithFetchPriorityHighOutsideViewport(
						data[ device ][ status ].elements
					) === 0
				) {
					optimizationAccuracy[ status ]
						.imgWithFetchpriorityHighAttrInViewport[ device ]
						.pass++;
				} else {
					optimizationAccuracy[ status ]
						.imgWithFetchpriorityHighAttrInViewport[ device ]
						.fail++;
				}
			}

			// Check for accuracy in prioritizing the image.
			const lcpData = data[ device ][ status ]?.metrics?.LCP;
			if ( lcpData && lcpData.url ) {
				let passed;
				if ( status === 'original' ) {
					// If there is an LCP image: passing means it is an IMG element which has fetchpriority=high (where if the LCP element is non-IMG then this is a fail).
					passed =
						lcpData.element?.tagName === 'IMG' &&
						lcpData.element?.attributes?.fetchpriority === 'high';

					// TODO: corePrioritizedImage = passed;
				} else {
					// If there is an LCP image: passing means it was preloaded by Optimization Detective (whether an IMG tag or a background image).
					passed = lcpData.preloadedByOD === true;

					if ( ! passed ) {
						urlsWithODImagePrioritizationFailures.push( {
							device,
							url,
						} );
					}

					odPrioritizedImage = passed;
				}
				if ( passed ) {
					optimizationAccuracy[ status ].lcpImagePrioritized[ device ]
						.pass++;
				} else {
					optimizationAccuracy[ status ].lcpImagePrioritized[ device ]
						.fail++;
				}
			}
		}

		// If there are preload links in the page added by OD for this device's width, check success rate for the URL actually being for something inside the viewport.
		const odPreloadLinks = data[ device ].optimized.odLinks.filter(
			( /** @type {Object} */ odLink ) => {
				if ( odLink.rel !== 'preload' ) {
					return false;
				}
				if ( ! odLink.media ) {
					return true;
				}
				const deviceWidth =
					data[ device ].optimized.device.viewport.width;
				let matches = odLink.media.match( /width <= (\d+)px/ );
				if ( matches ) {
					const maxWidthInclusive = parseInt( matches[ 1 ] );
					if ( deviceWidth > maxWidthInclusive ) {
						return false;
					}
				}
				matches = odLink.media.match( /(\d+)px < width/ );
				if ( matches ) {
					const minWidthExclusive = parseInt( matches[ 1 ] );
					if ( deviceWidth <= minWidthExclusive ) {
						return false;
					}
				}
				return true;
			}
		);
		if ( odPreloadLinks.length > 0 ) {
			if (
				isPreloadedImageInsideViewport(
					odPreloadLinks,
					data[ device ].optimized.elements
				)
			) {
				optimizationAccuracy.optimized.odPreloadedImageInsideViewport[
					device
				].pass++;
			} else {
				optimizationAccuracy.optimized.odPreloadedImageInsideViewport[
					device
				].fail++;
			}
		}

		/**
		 *
		 * @param {AggregateMetrics} aggregateMetrics
		 */
		const pushDiffs = ( aggregateMetrics ) => {
			for ( const key of [ 'TTFB', 'LCP', 'LCP-TTFB' ] ) {
				const diffTime =
					data[ device ].optimized.metrics[ key ].value -
					data[ device ].original.metrics[ key ].value;
				const diffPercent =
					( diffTime /
						data[ device ].original.metrics[ key ].value ) *
					100;
				aggregateMetrics[ key ].diffTime[ device ].push( diffTime );
				aggregateMetrics[ key ].diffPercent[ device ].push(
					diffPercent
				);
			}
		};

		// Obtain metrics.
		pushDiffs( facetedAggregateDiffs.all.aggregateDiffs );

		const hasLcpImage =
			data[ device ].original?.metrics?.LCP?.url &&
			data[ device ].optimized?.metrics?.LCP?.url;
		if ( hasLcpImage ) {
			pushDiffs( facetedAggregateDiffs.hasLcpImage.aggregateDiffs );

			if ( odPrioritizedImage === true ) {
				pushDiffs(
					facetedAggregateDiffs.hasLcpImageWithODPrioritization
						.aggregateDiffs
				);
				// TODO: && corePrioritizedImage === false??
			}
		}
	}
}

/**
 *
 * @param {Object}      opt
 * @param {string}      opt.outputDir
 * @param {string|null} opt.limit
 * @return {Promise<void>}
 */
export async function handler( opt ) {
	const outputDir = getAbsoluteOutputDir( opt.outputDir );
	if ( ! fs.existsSync( outputDir ) ) {
		throw new Error( `Directory does not exist: ${ outputDir }` );
	}

	// TODO: Use the coerce functionality of commander to handle this.
	let limit = null;
	if ( opt.limit ) {
		limit = parseInt( opt.limit, 10 );
	}

	let i = 0;

	/**
	 * Recursively traverses the directory, processes "errors.txt" and "url.txt" files,
	 * and populates the errorUrlMap.
	 *
	 * @param {string} dirPath The path to the directory to traverse.
	 */
	function walkSync( dirPath ) {
		// Skip the latest alias.
		if ( 'latest' === path.basename( dirPath ) ) {
			return;
		}

		const files = fs.readdirSync( dirPath );

		if (
			files.includes( 'url.txt' ) &&
			( files.includes( 'errors.txt' ) ||
				files.includes( 'version.txt' ) )
		) {
			const url = fs
				.readFileSync( path.join( dirPath, 'url.txt' ), 'utf8' )
				.trim();

			errorManifest.totalUrlCount++;

			if ( files.includes( 'errors.txt' ) ) {
				handleErrorCase( dirPath, url );
			} else if ( files.includes( 'version.txt' ) ) {
				handleSuccessCase( dirPath, url );

				// Stop when we reached the limit.
				if ( limit !== null && ++i === limit ) {
					throw new Error( 'limit_reached' );
				}
			}
		} else {
			// Check for subdirectories
			for ( const file of files ) {
				const filePath = path.join( dirPath, file );
				const stats = fs.statSync( filePath );
				if ( stats.isDirectory() ) {
					walkSync( filePath ); // Recurse into subdirectories
				}
			}
		}
	}

	try {
		walkSync( outputDir );
	} catch ( err ) {
		if ( err.message !== 'limit_reached' ) {
			throw err;
		}
	}

	log( '# Error Info' );

	const successCount =
		errorManifest.totalUrlCount - errorManifest.totalErroredUrlCount;
	log(
		`Success rate for being able to analyze a URL: ${ (
			( successCount / errorManifest.totalUrlCount ) *
			100
		).toFixed( 1 ) }% (${ successCount } of ${
			errorManifest.totalUrlCount
		}).`
	);
	log( '' );

	log( 'Error Message | URL Count' );
	log( '-- | --:' );

	const errorCounts = Object.entries( errorManifest.errorUrlMap )
		.map( ( [ errorMessage, urls ] ) => {
			return [ errorMessage, urls.length ];
		} )
		.sort( ( a, b ) => {
			// @ts-ignore
			return b[ 1 ] - a[ 1 ];
		} );
	for ( const [ errorMessage, errorCount ] of errorCounts ) {
		log( `${ errorMessage } | ${ errorCount }` );
	}
	log( '' );

	log( '--------------------------------------' );
	log( '' );

	log( `## Web Vitals Metrics` );
	for ( const facetedAggregateDiff of Object.values(
		facetedAggregateDiffs
	) ) {
		log( `### ${ facetedAggregateDiff.label }` );
		log(
			`URL count: ${ facetedAggregateDiff.aggregateDiffs.LCP.diffTime.mobile.length.toLocaleString() }`
		);
		for ( const [ key, aggregateDiffs ] of Object.entries(
			facetedAggregateDiff.aggregateDiffs
		) ) {
			log( `#### ${ key }` );

			for ( const device of [ 'mobile', 'desktop' ] ) {
				log(
					`* Average diff time for ${ device }: ${ formatNumber(
						computeAverage( aggregateDiffs.diffTime[ device ] )
					) }ms (${ formatNumber(
						computeAverage( aggregateDiffs.diffPercent[ device ] )
					) }%)`
				);
				log(
					`* ${
						key === 'LCP-TTFB' ? '**' : ''
					}Median diff time for ${ device }: ${ formatNumber(
						computeMedian( aggregateDiffs.diffTime[ device ] )
					) }ms (${ formatNumber(
						computeMedian( aggregateDiffs.diffPercent[ device ] )
					) }%)${ key === 'LCP-TTFB' ? '**' : '' }`
				);
			}
		}
		log( '' );
	}

	log( '## Optimization Accuracy Stats' );

	log(
		`Optimization | Original Mobile | Optimized Mobile | Original Desktop | Optimized Desktop`
	);
	log( `-- | --: | --: | --: | --:` );
	log(
		[
			'LCP image prioritized',
			computePassRate(
				optimizationAccuracy.original.lcpImagePrioritized.mobile
			),
			computePassRate(
				optimizationAccuracy.optimized.lcpImagePrioritized.mobile
			),
			computePassRate(
				optimizationAccuracy.original.lcpImagePrioritized.desktop
			),
			computePassRate(
				optimizationAccuracy.optimized.lcpImagePrioritized.desktop
			),
		].join( ' | ' )
	);
	log(
		[
			'Lazy loaded `IMG` not in viewport',
			computePassRate(
				optimizationAccuracy.original.lazyLoadedImgNotInViewport.mobile
			),
			computePassRate(
				optimizationAccuracy.optimized.lazyLoadedImgNotInViewport.mobile
			),
			computePassRate(
				optimizationAccuracy.original.lazyLoadedImgNotInViewport.desktop
			),
			computePassRate(
				optimizationAccuracy.optimized.lazyLoadedImgNotInViewport
					.desktop
			),
		].join( ' | ' )
	);
	log(
		[
			'`IMG` with `fetchpriority=high` only in viewport',
			computePassRate(
				optimizationAccuracy.original
					.imgWithFetchpriorityHighAttrInViewport.mobile
			),
			computePassRate(
				optimizationAccuracy.optimized
					.imgWithFetchpriorityHighAttrInViewport.mobile
			),
			computePassRate(
				optimizationAccuracy.original
					.imgWithFetchpriorityHighAttrInViewport.desktop
			),
			computePassRate(
				optimizationAccuracy.optimized
					.imgWithFetchpriorityHighAttrInViewport.desktop
			),
		].join( ' | ' )
	);
	log(
		[
			'OD prioritized image in viewport',
			computePassRate(
				optimizationAccuracy.original.odPreloadedImageInsideViewport
					.mobile
			),
			computePassRate(
				optimizationAccuracy.optimized.odPreloadedImageInsideViewport
					.mobile
			),
			computePassRate(
				optimizationAccuracy.original.odPreloadedImageInsideViewport
					.desktop
			),
			computePassRate(
				optimizationAccuracy.optimized.odPreloadedImageInsideViewport
					.desktop
			),
		].join( ' | ' )
	);
}

/**
 *
 * @param {number} num
 * @return {string} Formatted number.
 */
function formatNumber( num ) {
	return ( num > 0 ? '+' : '' ) + num.toFixed( 1 );
}

/**
 * @param {number[]} numbers
 * @return {number|null} Average.
 */
function computeAverage( numbers ) {
	if ( ! Array.isArray( numbers ) || numbers.length === 0 ) {
		return null;
	}

	const sum = numbers.reduce(
		( accumulator, currentValue ) => accumulator + currentValue,
		0
	);
	return sum / numbers.length;
}

/**
 * @param {number[]} numbers
 * @return {number|null} Median.
 */
function computeMedian( numbers ) {
	if ( ! Array.isArray( numbers ) || numbers.length === 0 ) {
		return null;
	}

	// 1. Sort the array in ascending order.
	const sortedNumbers = numbers.slice().sort( ( a, b ) => a - b );
	const middleIndex = Math.floor( sortedNumbers.length / 2 );

	// 2. Handle even and odd length arrays.
	if ( sortedNumbers.length % 2 === 0 ) {
		// Even number of elements: median is the average of the two middle elements.
		return (
			( sortedNumbers[ middleIndex - 1 ] +
				sortedNumbers[ middleIndex ] ) /
			2
		);
	}
	// Odd number of elements: median is the middle element.
	return sortedNumbers[ middleIndex ];
}

/**
 * @param {Object} args
 * @param {number} args.pass
 * @param {number} args.fail
 * @return {string} Pass rate.
 */
function computePassRate( { pass, fail } ) {
	const totalCount = pass + fail;
	if ( totalCount === 0 ) {
		return 'n/a';
	}
	const passRate = pass / totalCount;
	return ( passRate * 100 ).toFixed( 1 ) + '%';
}

/**
 * Gets the absolute output directory.
 *
 * @param {string} outputDir
 * @return {string} Absolute dir.
 */
function getAbsoluteOutputDir( outputDir ) {
	if ( outputDir.startsWith( '/' ) ) {
		return outputDir;
	}
	return path.join( process.cwd(), outputDir );
}
