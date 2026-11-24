import { z } from 'zod';

/** Row ids are Postgres UUIDs. */
export const idSchema = z.uuid();

/** BCP 47-ish language code as used for page text translations: `en`, `es`, `pt-BR`. */
export const localeCodeSchema = z
  .string()
  .regex(/^[a-z]{2,3}(-[A-Za-z]{2,4})?$/, 'Use a language code such as "en" or "pt-BR".');
export type LocaleCode = z.infer<typeof localeCodeSchema>;

/** Every text falls back to this language when the visitor's is missing. */
export const FALLBACK_LOCALE = 'en';

/** Languages offered in the translation dropdown. Any valid code is accepted by the API. */
export const COMMON_LOCALES: ReadonlyArray<{ code: string; name: string }> = [
  { code: 'en', name: 'English' },
  { code: 'es', name: 'Spanish' },
  { code: 'uk', name: 'Ukrainian' },
  { code: 'de', name: 'German' },
  { code: 'fr', name: 'French' },
  { code: 'it', name: 'Italian' },
  { code: 'pt', name: 'Portuguese' },
  { code: 'pl', name: 'Polish' },
  { code: 'nl', name: 'Dutch' },
  { code: 'cs', name: 'Czech' },
  { code: 'ro', name: 'Romanian' },
  { code: 'tr', name: 'Turkish' },
  { code: 'ja', name: 'Japanese' },
  { code: 'zh', name: 'Chinese' },
];

export const paginationQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  offset: z.coerce.number().int().min(0).default(0),
});
export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

export interface Page<T> {
  items: T[];
  total: number;
}

export const STORAGE_PREFIXES = {
  h5pContent: 'h5p/content',
  h5pLibraries: 'h5p/libraries',
  h5pTemp: 'h5p/temp',
} as const;

export const userRoleSchema = z.enum(['student', 'admin']);
export type UserRole = z.infer<typeof userRoleSchema>;

const ROLE_HIERARCHY: Record<UserRole, number> = { student: 0, admin: 1 };

export function hasAtLeastRole(actual: UserRole, required: UserRole): boolean {
  return ROLE_HIERARCHY[actual] >= ROLE_HIERARCHY[required];
}
