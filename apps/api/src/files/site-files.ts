import {
  MAX_SITE_FILE_NAME_LENGTH,
  SITE_FILES_PATH,
  STORAGE_PREFIXES,
  siteFileIdSchema,
} from '@speakukrainian/shared';

/** The bucket prefix every site file lives under, with its trailing slash. */
export const SITE_FILES_PREFIX = `${STORAGE_PREFIXES.siteFiles}/`;

/** `site/files/<id>/` — one upload. */
export function siteFilePrefix(id: string): string {
  return `${SITE_FILES_PREFIX}${id}/`;
}

/** `site/files/<id>/<name>`. Both parts must already be validated. */
export function siteFileKey(id: string, name: string): string {
  return `${siteFilePrefix(id)}${name}`;
}

/** The public path of a file: `/files/<id>/<name>`, with the name URL-encoded. */
export function siteFilePath(id: string, name: string): string {
  return `${SITE_FILES_PATH}/${id}/${encodeURIComponent(name)}`;
}

/** The id and name in a storage key, or null if the key is not a site file's. */
export function parseSiteFileKey(key: string): { id: string; name: string } | null {
  if (!key.startsWith(SITE_FILES_PREFIX)) {
    return null;
  }
  const [id, name, ...rest] = key.slice(SITE_FILES_PREFIX.length).split('/');
  if (!id || !name || rest.length > 0 || !isSiteFileId(id) || !isSafeName(name)) {
    return null;
  }
  return { id, name };
}

/**
 * The id and name a public request path asks for, or null when the path is
 * not exactly `/files/<uuid>/<name>`.
 *
 * This is the whole of what keeps the public route inside its prefix: the key
 * it reads is always `site/files/` + a UUID + one name without separators, so
 * no request can be turned into a path under `h5p/` or anywhere else.
 */
export function parseSiteFilePath(path: string): { id: string; name: string } | null {
  const prefix = `${SITE_FILES_PATH}/`;
  if (!path.startsWith(prefix)) {
    return null;
  }
  const segments = path.slice(prefix.length).split('/');
  if (segments.length !== 2) {
    return null;
  }
  const [id = '', encodedName = ''] = segments;
  let name: string;
  try {
    name = decodeURIComponent(encodedName);
  } catch {
    return null;
  }
  return isSiteFileId(id) && isSafeName(name) ? { id: id.toLowerCase(), name } : null;
}

export function isSiteFileId(value: string): boolean {
  return siteFileIdSchema.safeParse(value).success;
}

function isSafeName(name: string): boolean {
  return (
    name !== '' &&
    name !== '.' &&
    name !== '..' &&
    name.length <= MAX_SITE_FILE_NAME_LENGTH &&
    // No separators of any platform and no control characters.
    // eslint-disable-next-line no-control-regex
    !/[/\\\u0000-\u001f\u007f]/.test(name)
  );
}

/**
 * Turns the name a browser sent into one that is safe as a path segment and
 * pleasant in a URL: the last path component, without control characters,
 * spaces as hyphens, at most `MAX_SITE_FILE_NAME_LENGTH` characters with the
 * extension kept. Letters of any alphabet survive.
 */
export function sanitizeFileName(original: string): string {
  const base = original.normalize('NFC').split(/[/\\]/).pop() ?? '';
  let name = base
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/[^\p{L}\p{N}._()-]+/gu, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '');
  if (name === '') {
    name = 'file';
  }

  const dot = name.lastIndexOf('.');
  const extension = dot > 0 ? name.slice(dot).toLowerCase() : '';
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const room = MAX_SITE_FILE_NAME_LENGTH - extension.length;
  return room > 0 ? `${stem.slice(0, room)}${extension}` : name.slice(0, MAX_SITE_FILE_NAME_LENGTH);
}

/**
 * Multer reads a multipart file name as Latin-1; browsers send UTF-8. A name
 * that is valid UTF-8 once its bytes are reinterpreted is taken as that.
 */
export function decodeUploadName(name: string): string {
  const reread = Buffer.from(name, 'latin1').toString('utf8');
  return reread.includes('�') ? name : reread;
}

const CONTENT_TYPES: Record<string, string> = {
  '.avif': 'image/avif',
  '.css': 'text/css; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.gif': 'image/gif',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.m4a': 'audio/mp4',
  '.mp3': 'audio/mpeg',
  '.mp4': 'video/mp4',
  '.ogg': 'audio/ogg',
  '.otf': 'font/otf',
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.svg': 'image/svg+xml',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
  '.wav': 'audio/wav',
  '.webm': 'video/webm',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.xml': 'application/xml',
  '.zip': 'application/zip',
};

/** Decided by the extension alone; anything unknown is a plain download. */
export function contentTypeOf(name: string): string {
  const dot = name.lastIndexOf('.');
  const extension = dot >= 0 ? name.slice(dot).toLowerCase() : '';
  return CONTENT_TYPES[extension] ?? 'application/octet-stream';
}
