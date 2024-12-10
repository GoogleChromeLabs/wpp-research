<?php
# This hacked-together script parses the output of:
# $ ./fetch-lcp-image-loading-prioritization-data.sh image-prioritizer-analysis/urls.txt image-prioritizer-analysis/out/
# Where image-prioritizer-analysis/urls.txt is a list of all URLs in HTTP Archive which use Image Prioritizer.
# The URLs are obtained with a query such as the following: <https://gist.github.com/westonruter/c96cde34119957ecd06fa5283bd81934>.

$lcp_minus_ttfb_values                 = [];
$lcp_img_is_prioritized                = [];
$lcp_img_is_prioritized_by_form_factor = [];
$lcp_img_unknown                       = [];
$has_od_preload_links                     = [];
$initiator_types                       = [];
$urls_with_unknown_img                 = [];

$preload_failure_urls       = [];
$preload_success_urls       = [];
$urls_without_od_preload_links = [];

$analyzed_count = 0;

foreach ( glob( __DIR__ . '/image-prioritizer-analysis/out/*.json' ) as $json_file ) {
	if ( filesize( $json_file ) === 0 ) {
		continue;
	}

	$data = json_decode( file_get_contents( $json_file ), true );
	foreach ( [ 'mobile', 'desktop' ] as $form_factor ) {
		// Skip sites that don't have the plugin active anymore.
		if ( ! isset( $data['results'][ $form_factor ]['disabled']['pluginVersions']['image-prioritizer'], $data['results'][ $form_factor ]['disabled']['pluginVersions']['optimization-detective'] ) ) {
			continue;
		}

		// Only consider sites using the latest version of the plugins.
		if (
			$data['results'][ $form_factor ]['disabled']['pluginVersions']['image-prioritizer'] !== '0.2.0' ||
			$data['results'][ $form_factor ]['disabled']['pluginVersions']['optimization-detective'] !== '0.8.0'
		) {
			continue;
		}

		// TODO: Rarely element is LCPMetric has a url but lacks an element. Perhaps it was removed from the DOM when reported?
		if ( ! isset( $data['results'][ $form_factor ]['enabled']['metrics']['LCP']['element'] ) ) {
			continue;
		}

		// Skip over any page which doesn't have an IMG as the LCP element.
		if ( ! (
			$data['results'][ $form_factor ]['enabled']['metrics']['LCP']['url']
			&&
			'IMG' === $data['results'][ $form_factor ]['enabled']['metrics']['LCP']['element']['tagName']
			&&
			isset( $data['results'][ $form_factor ]['enabled']['metrics']['LCP']['initiatorType'] )  // Null when there was no image for LCP.
		) ) {
			continue;
		}

		// Skip looking at cases where the LCP element does not exist in any URL Metrics, perhaps due to a data collection problem.
		$is_unknown        = isset( $data['results'][ $form_factor ]['enabled']['metrics']['LCP']['element']['odMeta']['unknown-tag'] );
		$lcp_img_unknown[] = (int) $is_unknown;
		if ( $is_unknown ) {
			$urls_with_unknown_img[] = $data['url'];
			continue;
		}

		$analyzed_count++;

		// Out of curiosity, capture the improvement on the LCP-TTFB for when OD is enabled versus disabled.
		$disabled                = $data['results'][ $form_factor ]['disabled']['metrics']['LCP-TTFB']['value'];
		$enabled                 = $data['results'][ $form_factor ]['enabled']['metrics']['LCP-TTFB']['value'];
		$lcp_minus_ttfb_values[] = ( $disabled - $enabled ) / $disabled;

		// Determine whether the LCP element's image was preloaded.
		$did_od_preload = false;
		foreach ( $data['results'][ $form_factor ]['enabled']['odPreloadLinks'] as $link_attributes ) {
			foreach ( [ 'href', 'imagesrcset' ] as $attribute_name ) {
				if (
					isset( $link_attributes[ $attribute_name ] )
					&&
					str_contains( $link_attributes[ $attribute_name ], $data['results'][ $form_factor ]['enabled']['metrics']['LCP']['url'] )
				) {
					$did_od_preload = true;
					break;
				}
			}
		}
		$od_preload_link_count = count( $data['results'][ $form_factor ]['enabled']['odPreloadLinks'] );

		$was_preloaded = ( 'link' === $data['results'][ $form_factor ]['enabled']['metrics']['LCP']['initiatorType'] ? 1 : 0 );

		$did_od_successfully_preload = ( $was_preloaded && $did_od_preload );

		$lcp_img_is_prioritized[]                                = $did_od_successfully_preload;
		$lcp_img_is_prioritized_by_form_factor[ $form_factor ][] = $did_od_successfully_preload;
		if ( $did_od_successfully_preload ) {
			$preload_success_urls[ $form_factor ][] = $data['url'];
		} else {
			$preload_failure_urls[ $form_factor ][] = $data['url'];
		}

		$has_od_preload_links[] = $od_preload_link_count > 0 ? 1 : 0;
		if ( $od_preload_link_count === 0 ) {
			$urls_without_od_preload_links[] = $data['url'];
		}
	}
}

function median( array $numbers ): float {
	if ( empty( $numbers ) ) {
		return 0;
	}

	sort( $numbers );
	$count       = count( $numbers );
	$middleIndex = floor( $count / 2 );

	if ( $count % 2 == 0 ) {
		return ( $numbers[ $middleIndex - 1 ] + $numbers[ $middleIndex ] ) / 2;
	} else {
		return $numbers[ $middleIndex ];
	}
}

function average( $values ): ?float {
	if ( count( $values ) === 0 ) {
		return null;
	}

	return ( array_sum( $values ) / count( $values ) );
}

function format_percent( $decimal ): string {
	return round( $decimal * 100, 2 ) . '%';
}

echo "The following results are only for URLs which have the latest version of Optimization Detective and Image Prioritizer active.\n";
echo "Additionally, only URLs which have an LCP element reported as an IMG are considered.\n";
echo "Rate at which LCP IMG element is unknown in URL Metrics: " . format_percent( average( $lcp_img_unknown ) ) . ' (count: ' . count( $lcp_img_unknown ) . ')' . PHP_EOL;
echo "\n";
echo "The following only consider cases when the LCP IMG element is tracked in URL Metrics.\n";

echo "Number of URLs examined on mobile and/or desktop: $analyzed_count\n";
echo "Average LCP-TTFB improvement: " . format_percent( average( $lcp_minus_ttfb_values ) ) . PHP_EOL;
echo "Median LCP-TTFB improvement: " . format_percent( median( $lcp_minus_ttfb_values ) ) . PHP_EOL;

echo "Rate having OD preload links: " . format_percent( average( $has_od_preload_links ) ) . ' (count: ' . count( $has_od_preload_links ) . ')' . PHP_EOL;
// echo "Pages either with LCP IMG element untracked or OD preload links added: " . format_percent( average( $lcp_img_unknown ) + average( $has_od_preload_links ) ) . ' (count: ' . ( count( $lcp_img_unknown ) + count( $has_od_preload_links ) ) . ')' . PHP_EOL;

echo "Average successful OD preload rate: " . format_percent( average( $lcp_img_is_prioritized ) ) . ' (count: ' . count( $lcp_img_is_prioritized ) . ')' . PHP_EOL;
foreach ( $lcp_img_is_prioritized_by_form_factor as $form_factor => $prioritized ) {
	echo "Average successful OD preload rate for $form_factor: " . format_percent( average( $prioritized ) ) . ' (count: ' . count( $prioritized ) . ')' . PHP_EOL;
}

foreach ( $preload_failure_urls as $form_factor => $urls ) {
	sort( $urls );
	file_put_contents( "image-prioritizer-analysis/urls-with-missing-od-preload-on-{$form_factor}.txt", join( "\n", $urls ) . "\n" );
}
$urls_with_successful_preloads_on_mobile_and_desktop = array_unique( array_intersect( $preload_success_urls['mobile'], $preload_success_urls['desktop'] ) );
sort( $urls_with_successful_preloads_on_mobile_and_desktop );
file_put_contents( "image-prioritizer-analysis/urls-with-successful-od-preload-links-on-desktop-and-mobile.txt", join( "\n", $urls_with_successful_preloads_on_mobile_and_desktop ) . "\n" );

$urls_without_od_preload_links = array_unique( $urls_without_od_preload_links );
sort( $urls_without_od_preload_links );
file_put_contents( "image-prioritizer-analysis/urls-without-od-preload-links.txt", join( "\n", $urls_without_od_preload_links ) . "\n" );
sort( $urls_with_unknown_img );
file_put_contents( 'image-prioritizer-analysis/urls-with-untracked-lcp-img-elements.txt', join( "\n", array_unique( $urls_with_unknown_img ) ) . "\n" );
