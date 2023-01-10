/**
 * Functions related to WebPageTest results.
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
 * Internal dependencies
 */
import { fetchJson } from '../util/fetch.mjs';
import { calcMedian } from '../util/math.mjs';

let getServerTimingHeader;

export function isTestId( testId ) {
	return !! testId.match( /^[0-9]{6}_[A-Za-z0-9_]+$/ );
}

export function getTestIdFromResultUrl( resultUrl ) {
	const match = resultUrl.match( /^https:\/\/www.webpagetest.org\/result\/([A-Za-z0-9_]+)/ );
	if ( ! match || ! match[ 1 ] ) {
		throw new Error( 'Invalid WebPageTest result URL.' );
	}
	return match[ 1 ];
}

export function getResultUrlForTestId( testId ) {
	return `https://www.webpagetest.org/result/${ testId }/`;
}

export function getJsonResultUrlForTestId( testId, pretty ) {
	return `https://www.webpagetest.org/jsonResult.php?test=${ testId }${ pretty ? '&pretty=1' : '' }`;
}

export async function getResultJson( testId ) {
	const result = await fetchJson( getJsonResultUrlForTestId( testId ) );
	if ( ! result || ! result.statusCode || ! result.statusText ) {
		throw new Error( 'Invalid result response' );
	}
	if ( result.statusCode !== 200 ) {
		const errorPrefix = result.statusCode === 100 ? 'Test not completed yet: ' : '';
		throw new Error( `${ errorPrefix }${ result.statusText }` );
	}
	return result.data;
}

function getResultRuns_( result ) {
	return Object.values( result.runs );
}

function createGetSingleMetricValue_( metric ) {
	// The metrics listed here are those highlighted in the
	// https://www.webpagetest.org/graph_page_data.php view.
	switch ( metric ) {
		case 'FCP':
		case 'fcp':
		case 'First Contentful Paint':
			return ( run ) => run.firstView.firstContentfulPaint;
		case 'LCP':
		case 'lcp':
		case 'Largest Contentful Paint':
			return ( run ) => run.firstView['chromeUserTiming.LargestContentfulPaint'];
		case 'CLS':
		case 'cls':
		case 'Cumulative Layout Shift':
			return ( run ) => run.firstView['chromeUserTiming.CumulativeLayoutShift'];
		case 'TBT':
		case 'tbt':
		case 'Total Blocking Time':
			return ( run ) => run.firstView.TotalBlockingTime;
		case 'Load Time (onload)':
			return ( run ) => run.firstView.docTime;
		case 'Load Time (Navigation Timing)':
			return ( run ) => run.firstView.loadEventStart;
		case 'DOM Content Loaded (Navigation Timing)':
			return ( run ) => run.firstView.domContentLoadedEventStart;
		case 'SI':
		case 'si':
		case 'Speed Index':
			return ( run ) => run.firstView.SpeedIndex;
		case 'TTFB':
		case 'ttfb':
		case 'Time to First Byte':
			return ( run ) => run.firstView.TTFB;
		case 'Base Page SSL Time':
			return ( run ) => run.firstView.basePageSSLTime;
		case 'TTSR':
		case 'ttsr':
		case 'Time to Start Render':
			return ( run ) => run.firstView.render;
		case 'TTI':
		case 'tti':
		case 'Time to Interactive':
			return ( run ) => run.firstView.LastInteractive;
		case 'TTVC':
		case 'ttvc':
		case 'Time to Visually Complete':
			return ( run ) => run.firstView.visualComplete;
		case 'LVC':
		case 'lvc':
		case 'Last Visual Change':
			return ( run ) => run.firstView.lastVisualChange;
		case 'TTT':
		case 'ttt':
		case 'Time to Title':
			return ( run ) => run.firstView.titleTime;
		case 'Fully Loaded':
			return ( run ) => run.firstView.fullyLoaded;
		case 'Estimated RTT to Server':
			return ( run ) => run.firstView.server_rtt;
		case 'DOM Elements':
			return ( run ) => run.firstView.domElements;
		case 'Connections':
			return ( run ) => run.firstView.connections;
		case 'Requests (onload)':
			return ( run ) => run.firstView.requestsDoc;
		case 'Requests (Fully Loaded)':
			return ( run ) => run.firstView.requests;
		case 'Bytes In (onload)':
			return ( run ) => run.firstView.bytesInDoc;
		case 'Bytes In (Fully Loaded)':
			return ( run ) => run.firstView.bytesIn;
	}

	if ( metric.startsWith( 'Server-Timing:' ) ) {
		const stMetric = metric.substring( 'Server-Timing:'.length );
		if ( ! getServerTimingHeader ) {
			getServerTimingHeader = createGetResponseHeader_( 'Server-Timing' );
		}
		return ( run ) => {
			const stHeader = getServerTimingHeader( run );
			const stIndex = stHeader.indexOf( `${ stMetric };dur=` );
			if ( stIndex < 0 ) {
				throw new Error( `Server-Timing metric ${ stMetric } not present in run` );
			}
			let stValue = stHeader.substring( stIndex + `${ stMetric };dur=`.length );
			const nextIndex = stValue.indexOf( ',' );
			if ( nextIndex >= 0 ) {
				stValue = stValue.substring( 0, nextIndex );
			}
			return parseFloat( stValue.trim() );
		};
	}

	throw new Error( `Unsupported metric ${ metric }` );
}

function createGetMetricValue_( metric ) {
	const toSubtract = [];
	const toAdd = metric.split( ' + ' ).map( ( m ) => {
		const parts = m.split( ' - ' );
		const first = parts.shift();
		parts.forEach( ( part ) => {
			toSubtract.push( part.trim() );
		} );
		return first.trim();
	} );

	const toAddCallbacks = toAdd.map( ( metric ) => {
		return createGetSingleMetricValue_( metric );
	} );
	const toSubtractCallbacks = toSubtract.map( ( metric ) => {
		return createGetSingleMetricValue_( metric );
	} );

	// Simple scenario of just one metric.
	if ( toAddCallbacks.length === 1 && toSubtractCallbacks.length === 0 ) {
		return toAddCallbacks.shift();
	}

	return ( run ) => {
		const toAddValues = toAddCallbacks.map( ( getValue ) => getValue( run ) );
		const toSubtractValues = toSubtractCallbacks.map( ( getValue ) => getValue( run ) );
		if ( toAddValues.includes( undefined ) || toSubtractValues.includes( undefined ) ) {
			return undefined;
		}
		let total = 0;
		toAddValues.forEach( ( value ) => {
			total += value;
		} );
		toSubtractValues.forEach( ( value ) => {
			total -= value;
		} );
		return total;
	};
}

function createGetResponseHeader_( headerName ) {
	return ( run ) => {
		if ( ! run.firstView.requests.length || ! run.firstView.requests[ 0 ].headers.response.length ) {
			throw new Error( 'No response headers found' );
		}
		const st = run.firstView.requests[ 0 ].headers.response.find( ( header ) => {
			return header.startsWith( `${ headerName }: ` ) || header.startsWith( `${ headerName.toLowerCase() }: ` );
		} );
		if ( ! st ) {
			throw new Error( `No response header ${ headerName } found` );
		}
		return st.substring( headerName.length + 2 );
	};
}

export function mergeResultMetrics( ...resultMetrics ) {
	const merged = resultMetrics.reduce(
		( acc, metric ) => {
			if ( metric.name !== acc.name ) {
				throw new Error( `Cannot merge metric ${ metric.name } into metric ${ acc.name }` );
			}

			acc.runs = [ ...acc.runs, ...metric.runs ];
			return acc;
		},
		{
			name: resultMetrics[ 0 ].name,
			median: 0,
			runs: [],
		}
	);

	merged.median = calcMedian( merged.runs );
	return merged;
}

export function getResultMetrics( result, ...metrics ) {
	if ( ! metrics || ! metrics.length ) {
		return [];
	}

	const runs = getResultRuns_( result );

	return metrics.map( ( metric ) => {
		const values = [];
		const getMetricValue = createGetMetricValue_( metric );

		runs.forEach( ( run ) => {
			let value;
			try {
				value = getMetricValue( run );
			} catch ( e ) {
				// Only re-throw error if it's about an invalid Server-Timing metric.
				if ( e.message.includes( 'Server-Timing metric' ) ) {
					throw e;
				}
				value = null;
			}
			if ( value === undefined ) {
				value = null;
			}
			values.push( value );
		} );

		return {
			name: metric,
			median: calcMedian( values ),
			runs: values,
		};
	} );
}

export function getResultServerTiming( result ) {
	const runs = getResultRuns_( result );
	if ( ! getServerTimingHeader ) {
		getServerTimingHeader = createGetResponseHeader_( 'Server-Timing' );
	}

	const stHeaders = runs.map( getServerTimingHeader );

	// Get available metrics from first run header.
	const metrics = {};
	stHeaders[ 0 ].split( ',' ).forEach( ( stValue ) => {
		stValue = stValue.trim();
		const sepIndex = stValue.indexOf( ';' );
		if ( sepIndex < 0 ) {
			throw new Error( `Invalid Server-Timing header ${ stHeaders[ 0 ] }` );
		}
		const name = stValue.substring( 0, sepIndex );
		metrics[ name ] = {
			name,
			median: 0,
			runs: [],
		};
	} );

	stHeaders.forEach( ( stHeader ) => {
		const stValues = stHeader.split( ',' );
		stValues.forEach( ( stValue ) => {
			const parts = stValue.split( ';' );
			if ( parts.length !== 2 ) {
				throw new Error( `Invalid Server-Timing header ${ stHeader }` );
			}
			const name = parts[ 0 ].trim();
			const value = parts[ 1 ].replace( 'dur=', '' ).trim();
			if ( ! metrics[ name ] ) {
				throw new Error( `Invalid Server-Timing header: Metric ${ name } not present in every run` );
			}
			metrics[ name ].runs.push( parseFloat( value ) );
		} );
	} );

	return Object.values( metrics ).map( ( metric ) => {
		if ( metric.runs.length !== result.testRuns ) {
			throw new Error( `Invalid Server-Timing header: Metric ${ metric.name } not present in every run` );
		}

		return {
			...metric,
			median: calcMedian( metric.runs ),
		};
	} );
}
