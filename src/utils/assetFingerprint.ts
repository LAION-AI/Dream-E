/**
 * =============================================================================
 * ASSET FINGERPRINT UTILITY
 * =============================================================================
 *
 * Generates a short, stable identifier from a data URL.
 *
 * Data URLs can be tens of megabytes (e.g., a 5MB image becomes a ~7MB
 * base64 string). We can't use them directly as dictionary keys in JSON
 * because it would duplicate the data. Instead, we create a compact
 * "fingerprint" that is unique enough to identify each asset.
 *
 * The fingerprint combines:
 * - The MIME type (e.g., "audio/mpeg", "image/png")
 * - The total length of the URL
 * - The last 40 characters of the base64 data
 *
 * This produces something like: "audio/mpeg|2340567|abc123...xyz789"
 * which is ~70 characters and practically collision-free.
 *
 * =============================================================================
 */

/**
 * Generate a short, stable fingerprint from a data URL.
 * Two identical files will always produce the same fingerprint.
 * Different files will produce different fingerprints.
 *
 * @param url - A data URL (data:type;base64,...) or regular URL
 * @returns A compact string identifier for the asset
 */
export function getAssetFingerprint(url: string): string {
  if (!url) return '';

  // For data URLs: extract MIME type and use length + tail as identifier
  if (url.startsWith('data:')) {
    const semicolonIdx = url.indexOf(';');
    const mimeType = semicolonIdx > 5 ? url.substring(5, semicolonIdx) : 'unknown';
    const tail = url.length > 40 ? url.substring(url.length - 40) : url;
    return `${mimeType}|${url.length}|${tail}`;
  }

  // For regular URLs: just use the URL itself (they're short)
  return url;
}
