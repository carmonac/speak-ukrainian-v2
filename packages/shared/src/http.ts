/**
 * The largest JSON (or form-encoded) request body the API will parse.
 *
 * Derived from two anchors that agree on ~1 MiB rather than picked. Measured
 * against the real schemas — media is uploaded separately and referenced by
 * URL, so no body carries base64 — a typical three-locale rich text page is
 * 48 KB, a ten-locale one 152 KB, and the heaviest page worth calling realistic
 * (40 paragraphs, 30 audio nodes, 12 images, ten locales) is 539 KB. And every
 * JSON route here writes rows whose text columns the database caps at about
 * 2 MB each (a D1 limit), and the largest of them, a page template, is itself
 * limited to 1,000,000 characters by its schema. So a body over this limit is
 * not something a legitimate client produces.
 *
 * This bounds the *request body*. Multipart uploads are bounded separately and
 * far more generously by `MEDIA_UPLOAD_RULES` and `MAX_H5P_UPLOAD_BYTES`, which
 * is why the two 413 messages deliberately say different things.
 *
 * A route that one day needs a bigger JSON body gets its own parser, its own
 * constant and its own message — not a raise of this one. The body is buffered
 * in middleware, ahead of authentication, so every byte of this limit is
 * reachable by an unauthenticated caller.
 */
export const MAX_JSON_BODY_BYTES = 1024 * 1024;

/** "1 MB". The limit is a whole number of megabytes. */
export function formatMaxJsonBodySize(): string {
  return `${MAX_JSON_BODY_BYTES / (1024 * 1024)} MB`;
}

/**
 * Stated once so a future client-side pre-check cannot describe a different
 * rule — the same reason `uploadTooLargeMessage` and `h5pUploadTooLargeMessage`
 * live here rather than in the API.
 */
export function jsonBodyTooLargeMessage(): string {
  return `Request bodies must be under ${formatMaxJsonBodySize()}.`;
}
