import { z } from 'zod';
import { localeCodeSchema } from './common.js';

/**
 * Paths the public site can never serve, because another part of the system
 * owns them.
 */
export const RESERVED_PAGE_PATH_PREFIXES = [
  '/api',
  '/healthz',
  '/favicon.ico',
  '/favicon.svg',
  '/files',
  '/robots.txt',
];

/** URL path of a page: `/`, `/about`, `/courses/spanish`. Lowercase, no trailing slash. */
export const pagePathSchema = z
  .string()
  .max(200)
  .regex(
    /^\/$|^(\/[a-z0-9]+(-[a-z0-9]+)*)+$/,
    'Use a path such as "/about" or "/courses/spanish": lowercase letters, digits and hyphens.',
  )
  .refine(
    (path) => !RESERVED_PAGE_PATH_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`)),
    'That path is reserved.',
  );

/** Name a text is referenced by in the template: `{{ header }}`. */
export const pageTextKeySchema = z
  .string()
  .max(64)
  .regex(/^[A-Za-z_][A-Za-z0-9_]*$/, 'Use letters, digits and underscores, e.g. "header_title".');

export const pageTranslationSchema = z.object({
  locale: localeCodeSchema,
  value: z.string().max(20_000),
});
export type PageTranslation = z.infer<typeof pageTranslationSchema>;

export const pageTextSchema = z.object({
  key: pageTextKeySchema,
  translations: z
    .array(pageTranslationSchema)
    .max(100)
    .refine(
      (list) => new Set(list.map((t) => t.locale)).size === list.length,
      'Each language can only appear once per text.',
    ),
});
export type PageText = z.infer<typeof pageTextSchema>;

export const savePageSchema = z.object({
  title: z.string().trim().min(1).max(200),
  path: pagePathSchema,
  texts: z
    .array(pageTextSchema)
    .max(500)
    .refine(
      (list) => new Set(list.map((t) => t.key)).size === list.length,
      'Text names must be unique within a page.',
    ),
  /** Handlebars template producing the page's HTML. */
  content: z.string().max(1_000_000),
});
export type SavePageInput = z.infer<typeof savePageSchema>;

export interface PageSummary {
  id: string;
  title: string;
  path: string;
  isMain: boolean;
  updatedAt: string;
}

export interface PageDetail extends PageSummary {
  texts: PageText[];
  content: string;
}

export const previewPageSchema = savePageSchema.pick({ texts: true, content: true }).extend({
  title: z.string().max(200).default(''),
  locale: localeCodeSchema.default('en'),
});
export type PreviewPageInput = z.infer<typeof previewPageSchema>;

/**
 * Picks the value shown for one text: the visitor's language, then its base
 * language (`pt` for `pt-BR`), then English, then whatever exists.
 */
export function resolveTranslation(
  translations: ReadonlyArray<PageTranslation>,
  locales: ReadonlyArray<string>,
  fallback = 'en',
): string {
  const byLocale = new Map(translations.map((t) => [t.locale.toLowerCase(), t.value]));
  const wanted = [...locales, fallback];
  for (const locale of wanted) {
    const lower = locale.toLowerCase();
    const exact = byLocale.get(lower);
    if (exact !== undefined && exact !== '') return exact;
    const base = byLocale.get(lower.split('-')[0] ?? lower);
    if (base !== undefined && base !== '') return base;
    // A visitor asking for `pt` is served `pt-BR` before falling further back.
    for (const [code, value] of byLocale) {
      if (code.split('-')[0] === lower && value !== '') return value;
    }
  }
  return translations.find((t) => t.value !== '')?.value ?? '';
}
