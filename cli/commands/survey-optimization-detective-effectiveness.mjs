/**
 * CLI command to survey a set of URLs for pages using Optimization Detective to measure its effectiveness at improving performance.
 *
 * This is a batch runner for `analyze-optimization-detective-effectiveness` which allows for parallelization of the analysis.
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
import puppeteer, { Browser, PredefinedNetworkConditions, KnownDevices } from 'puppeteer';
import round from 'lodash-es/round.js';
import fs from 'fs';
import path from 'path';
import { log } from '../lib/cli/logger.mjs';
import crypto from 'crypto';
import { spawn } from 'child_process';

export const options = [
	{
		argname: '-f, --urls-file <urls_file>',
		description: 'The file containing the URLs to survey, one per line.',
		required: true,
	},
	{
		argname: '-o, --output-dir <output_dir>',
		description: 'Base output directory for the results. Each subdirectory contains the results for a single URL, where the directory name is a hash of the URL. Defaults to "output/survey-optimization-detective-effectiveness".',
		defaults: 'output/survey-optimization-detective-effectiveness',
	},
	{
		argname: '-p, --parallel <processes>',
		description: 'Number of concurrent processes to survet the URLs.',
		defaults: 4,
	},
	{
		argname: '--force',
		description: 'Force re-analyzing URLs that have already been analyzed.',
		defaults: false,
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
		fs.mkdirSync( outputDir, { recursive: true } );
	}

	const urlsContent = fs.readFileSync( opt.urlsFile, { encoding: 'utf-8' } );
	const urls = urlsContent.split('\n').filter(Boolean);

	log( `Number of URLs being surveyed: ${ urls.length }` );
	const activeProcesses = new Set();
	let urlIndex = 0;
	const timeStarted = Date.now();

	const isoString = ( new Date() ).toISOString();
	const sanitizedIsoString = isoString.replace(/[:.-]/g, '').replace(/\./g, '-');
	const resultManifestFile = path.join( outputDir, `result-manifest-${ sanitizedIsoString }.tsv` );
	log( `A manifest of the results will be written to ${ resultManifestFile }` );
	fs.writeFileSync( resultManifestFile, [ 'url', 'exitCode', 'outputDir' ].join( "\t" ) + "\n", { flag: 'a' } );

	/**
	 * @param {string} url
	 * @param {number} i
	 * @returns {Promise<void>}
	 */
	async function spawnProcess(url, i) {
		const md5Hash = crypto.createHash('md5').update(url).digest('hex');
		const processOutputDir = path.join(outputDir, md5Hash.substring(0, 2), md5Hash.substring(2, 4), md5Hash);

		fs.mkdirSync(processOutputDir, { recursive: true });
		fs.writeFileSync(path.join(processOutputDir, 'url.txt'), url);

		// Create a symlink to the latest.
		const symlinkPath = path.join( outputDir, 'latest' );
		try {
			fs.unlinkSync( symlinkPath );
		} catch ( err ) {}
		fs.symlinkSync( processOutputDir, path.join( outputDir, 'latest' ) );

		const args = [
			'--silent',
			'run',
			'research',
			'--',
			'analyze-optimization-detective-effectiveness',
			'--url',
			url,
			'--output-dir',
			processOutputDir,
		];
		if ( opt.force ) {
			args.push( '--force' );
		}

		const childProcess = spawn(
			'npm',
			args,
			{ stdio: 'inherit' }
		);

		activeProcesses.add(childProcess);

		childProcess.on('close', (code) => {
			activeProcesses.delete(childProcess);

			fs.writeFileSync( resultManifestFile, [ url, code, processOutputDir ].join( "\t" ) + "\n", { flag: 'a' } );

			const now = Date.now();
			const timeTranspired = now - timeStarted;
			const timePerUrl = timeTranspired / (i + 1);
			const remainingUrlsCount = urls.length - ( i + 1 );

			log(`Process for ${url} (${i + 1} of ${urls.length}) finished with code ${code}. Avg time per URL: ${Math.round( timePerUrl / 1000 )}s. Estimated time remaining: ${ remainingUrlsCount * Math.round( timePerUrl / 1000 ) }s`);
			if (urlIndex < urls.length) {
				spawnProcess(urls[urlIndex], urlIndex);
				urlIndex++;
			}
		});
	}

	// Start initial processes
	for ( let i = 0; i < Math.min(opt.parallel, urls.length); i++) {
		await spawnProcess( urls[urlIndex], urlIndex );
		urlIndex++;
	}

	// Wait for all processes to finish
	await new Promise((resolve) => {
		const checkProcesses = () => {
			if (activeProcesses.size === 0 && urlIndex >= urls.length) {
				resolve();
			} else {
				setTimeout(checkProcesses, 100);
			}
		};
		checkProcesses();
	});

	log( `See result manifest in ${ resultManifestFile }` );
}
