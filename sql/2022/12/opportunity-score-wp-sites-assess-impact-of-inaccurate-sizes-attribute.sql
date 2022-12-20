#standardSQL
# measure the impact of innacurate sizes attributes per <img> for WordPress sites.

CREATE TEMPORARY FUNCTION getSrcsetSizesAccuracy(payload STRING)
RETURNS ARRAY<STRUCT<sizesAbsoluteError INT64, sizesRelativeError FLOAT64, wDescriptorAbsoluteError INT64, wDescriptorRelativeError FLOAT64, actualSizesEstimatedWastedLoadedPixels INT64, actualSizesEstimatedWastedLoadedBytes FLOAT64, wastedLoadedPercent FLOAT64>>
LANGUAGE js AS '''
try {
  var $ = JSON.parse(payload);
  var responsiveImages = JSON.parse($._responsive_images);
  responsiveImages = responsiveImages['responsive-images'];
  return responsiveImages.map(({
    sizesAbsoluteError,
    sizesRelativeError,
    wDescriptorAbsoluteError,
    wDescriptorRelativeError,
    idealSizesSelectedResourceEstimatedPixels,
    actualSizesEstimatedWastedLoadedPixels,
    actualSizesEstimatedWastedLoadedBytes
  }) => {
    let wastedLoadedPercent;
    if ( idealSizesSelectedResourceEstimatedPixels > 0 ) {
      wastedLoadedPercent = actualSizesEstimatedWastedLoadedPixels / idealSizesSelectedResourceEstimatedPixels;
    } else {
      wastedLoadedPercent = null;
    }
    return {
      sizesAbsoluteError,
      sizesRelativeError,
      wDescriptorAbsoluteError,
      wDescriptorRelativeError,
      actualSizesEstimatedWastedLoadedPixels,
      actualSizesEstimatedWastedLoadedBytes,
      wastedLoadedPercent
    };
  }
);
} catch (e) {
  return [];
}
''';


SELECT
	percentile,
	client,
	APPROX_QUANTILES(image.sizesAbsoluteError, 1000)[OFFSET(percentile * 10)] AS sizesAbsoluteError,
	APPROX_QUANTILES(image.sizesRelativeError, 1000)[OFFSET(percentile * 10)] AS sizesRelativeError,
	APPROX_QUANTILES(image.wDescriptorAbsoluteError, 1000)[OFFSET(percentile * 10)] AS wDescriptorAbsoluteError,
	APPROX_QUANTILES(image.wDescriptorRelativeError, 1000)[OFFSET(percentile * 10)] AS wDescriptorRelativeError,
	APPROX_QUANTILES(image.actualSizesEstimatedWastedLoadedPixels, 1000)[OFFSET(percentile * 10)] AS actualSizesEstimatedWastedLoadedPixels,
	APPROX_QUANTILES(image.actualSizesEstimatedWastedLoadedBytes, 1000)[OFFSET(percentile * 10)] AS actualSizesEstimatedWastedLoadedBytes,
	APPROX_QUANTILES(image.wastedLoadedPercent, 1000)[OFFSET(percentile * 10)] AS wastedLoadedPercent
FROM (
		SELECT
			tpages._TABLE_SUFFIX AS client,
			image
		FROM
			`httparchive.pages.2022_10_01_*` AS tpages,
			UNNEST(getSrcsetSizesAccuracy(payload)) AS image
				JOIN
			`httparchive.technologies.2022_10_01_*` AS tech
			ON
				tech.url = tpages.url
		WHERE
			tpages._TABLE_SUFFIX = tech._TABLE_SUFFIX
		AND
			app = 'WordPress'
		AND
			category = 'CMS'
	 ),
	 UNNEST([10, 25, 50, 75, 90]) AS percentile
GROUP BY
	percentile,
	client
ORDER BY
	percentile,
	client

