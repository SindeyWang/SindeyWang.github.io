/* Load before consent.js. No provider IDs have been configured or verified.
 * To activate: supply the real published GTM container ID and set enabled: true
 * ONLY after verifying its consent gates and privacy-safe event mapping.
 * GA4 and LinkedIn belong inside that container, not in standalone loaders.
 * Leave disabled until the container has been tested externally: no automatic
 * page views, enhanced measurement, unrestricted URL/referrer variables or PII;
 * GA4 requires analytics_storage; LinkedIn requires all marketing consent types.
 */
window.KW_ANALYTICS = Object.freeze({
  enabled: false,
  gtmId: '',
  ga4MeasurementId: '', // Documentation only: consent.js never loads GA4 directly.
  linkedinPartnerId: '' // Documentation only: no direct LinkedIn script/pixel.
});
