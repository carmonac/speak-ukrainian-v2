import { z } from 'zod';

/**
 * A file the administrator uploaded for use in the site's pages: an image, a
 * PDF, a font… It is public: anyone with the URL can load it.
 */
export interface SiteFile {
  /** Identifies the upload. Two uploads of the same file name get different ids. */
  id: string;
  name: string;
  /** Absolute public URL, ready to paste into a page template. */
  url: string;
  sizeBytes: number;
  /** ISO 8601. */
  uploadedAt: string;
}

/** Where site files are served on the public site: `/files/<id>/<name>`. */
export const SITE_FILES_PATH = '/files';

export const siteFileIdSchema = z.uuid();

/** Largest site file accepted. Media heavier than this belongs on a video host. */
export const MAX_SITE_FILE_BYTES = 25 * 1024 * 1024;

export function formatMaxSiteFileSize(): string {
  return `${MAX_SITE_FILE_BYTES / (1024 * 1024)} MB`;
}

export function siteFileTooLargeMessage(): string {
  return `That file is too large. The limit is ${formatMaxSiteFileSize()} per file.`;
}

/** Longest file name kept; longer ones are shortened, keeping the extension. */
export const MAX_SITE_FILE_NAME_LENGTH = 100;
