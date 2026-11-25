/**
 * The icon of the public site: a circle with the Ukrainian flag.
 *
 * Kept in the source rather than as files so the API image needs no asset
 * copying. The same two files are in `apps/admin/public` and
 * `apps/student/public`; regenerate all of them together if the icon changes.
 */

/** Vector version, served at `/favicon.svg`. */
export const FAVICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <title>SpeakUkrainian</title>
  <clipPath id="circle"><circle cx="32" cy="32" r="32" /></clipPath>
  <g clip-path="url(#circle)">
    <rect width="64" height="32" fill="#0057b7" />
    <rect y="32" width="64" height="32" fill="#ffd700" />
  </g>
</svg>
`;

/** `/favicon.ico`: 16, 32 and 48 pixel renderings of the same drawing, base64. */
const FAVICON_ICO_BASE64 = [
  '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',
  'AABJRU5ErkJggg==',
].join('');

export const FAVICON_ICO = Buffer.from(FAVICON_ICO_BASE64, 'base64');
