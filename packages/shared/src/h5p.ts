import { z } from 'zod';
import { paginationQuerySchema } from './common.js';

/** One stored H5P exercise. Its files live in object storage under `storagePath`. */
export const h5pContentSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  mainLibrary: z.string().min(1),
  storagePath: z.string().min(1),
  sizeBytes: z.number().int().nonnegative().default(0),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type H5pContent = z.infer<typeof h5pContentSchema>;

export const createH5pContentSchema = h5pContentSchema.omit({ createdAt: true, updatedAt: true });
export type CreateH5pContentInput = z.infer<typeof createH5pContentSchema>;

export const updateH5pContentSchema = h5pContentSchema.pick({
  title: true,
  mainLibrary: true,
  sizeBytes: true,
});
export type UpdateH5pContentInput = z.infer<typeof updateH5pContentSchema>;

export const listH5pContentQuerySchema = paginationQuerySchema;
export type ListH5pContentQuery = z.infer<typeof listH5pContentQuerySchema>;

export const h5pContentIdSchema = z.uuid();

export const MAX_H5P_UPLOAD_BYTES = 100 * 1024 * 1024;

export const H5P_PACKAGE_EXTENSION = '.h5p';

export function formatMaxH5pUploadSize(): string {
  return `${MAX_H5P_UPLOAD_BYTES / (1024 * 1024)} MB`;
}

export function h5pUploadTooLargeMessage(): string {
  return `H5P packages must be under ${formatMaxH5pUploadSize()}.`;
}

export function h5pEditorUploadTooLargeMessage(): string {
  return `Uploads must be under ${formatMaxH5pUploadSize()}.`;
}

export function notAnH5pPackageMessage(filename: string): string {
  return `${filename} is not an H5P package. Upload a file with the ${H5P_PACKAGE_EXTENSION} extension.`;
}

export function isH5pPackageFilename(filename: string): boolean {
  return filename.toLowerCase().endsWith(H5P_PACKAGE_EXTENSION);
}

/** What the H5P editor posts when the author saves. */
export const saveH5pContentSchema = z.object({
  library: z.string().min(1).max(255),
  params: z.object({
    params: z.record(z.string(), z.unknown()),
    metadata: z.looseObject({ title: z.string().min(1).max(255) }),
  }),
});
export type SaveH5pContentInput = z.infer<typeof saveH5pContentSchema>;

export const h5pSaveResultSchema = z.object({
  contentId: z.string().min(1),
  title: z.string(),
  mainLibrary: z.string(),
});
export type H5pSaveResult = z.infer<typeof h5pSaveResultSchema>;
