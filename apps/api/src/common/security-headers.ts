import helmet from 'helmet';

/**
 * Baseline security headers.
 *
 * - No Content-Security-Policy: the public site is HTML the administrator
 *   writes by hand, with its own inline styles, scripts and external assets,
 *   which any fixed policy would break.
 * - No Cross-Origin-Embedder-Policy: H5P content embeds third-party media
 *   (YouTube, external images) that does not opt in to it.
 */
export function securityHeaders(): ReturnType<typeof helmet> {
  return helmet({ crossOriginEmbedderPolicy: false, contentSecurityPolicy: false });
}
