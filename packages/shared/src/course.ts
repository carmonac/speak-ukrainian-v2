import { z } from 'zod';
import { idSchema } from './common.js';
import { couponCodeSchema } from './coupon.js';

export const courseStatusSchema = z.enum(['draft', 'published']);
export type CourseStatus = z.infer<typeof courseStatusSchema>;

export const currencySchema = z.enum(['eur', 'usd', 'gbp', 'uah']);
export type Currency = z.infer<typeof currencySchema>;

export const slugSchema = z
  .string()
  .max(80)
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Use lowercase letters, digits and hyphens.');

export const saveLessonSchema = z.object({
  /** Present for a lesson that already exists; absent for a new one. */
  id: idSchema.optional(),
  title: z.string().trim().min(1).max(200),
  introText: z.string().max(10_000).default(''),
  h5pContentId: z.uuid().nullable().default(null),
});
export type SaveLessonInput = z.infer<typeof saveLessonSchema>;

export const saveSectionSchema = z.object({
  id: idSchema.optional(),
  title: z.string().trim().min(1).max(200),
  lessons: z.array(saveLessonSchema).max(200).default([]),
});
export type SaveSectionInput = z.infer<typeof saveSectionSchema>;

/** Longest summary accepted, in characters of HTML. */
export const MAX_COURSE_SUMMARY_LENGTH = 50_000;

/** Longest description accepted, in characters of HTML. */
export const MAX_COURSE_DESCRIPTION_LENGTH = 50_000;

/** The whole course is saved at once; array order is the display order. */
export const saveCourseSchema = z.object({
  title: z.string().trim().min(1).max(200),
  slug: slugSchema,
  /**
   * Rich text as HTML, written in the editor of the control panel. The API
   * sanitizes it before storing it; see `apps/api/src/courses/rich-text.ts`.
   */
  summary: z.string().max(MAX_COURSE_SUMMARY_LENGTH).default(''),
  /** Rich text as HTML, sanitized by the API exactly like `summary`. */
  description: z.string().max(MAX_COURSE_DESCRIPTION_LENGTH).default(''),
  /** Price in minor units (cents). 0 means free. */
  priceCents: z.number().int().min(0).max(100_000_00),
  currency: currencySchema.default('eur'),
  status: courseStatusSchema.default('draft'),
  sections: z.array(saveSectionSchema).max(100).default([]),
});
export type SaveCourseInput = z.infer<typeof saveCourseSchema>;

export interface CourseSummary {
  id: string;
  title: string;
  slug: string;
  /** Sanitized HTML. Render it as markup (images, videos, formatting). */
  summary: string;
  /** The summary's text alone, shortened: for cards, meta tags and anything that is not HTML. */
  summaryText: string;
  priceCents: number;
  currency: Currency;
  status: CourseStatus;
  lessonCount: number;
}

export interface Lesson {
  id: string;
  title: string;
  introText: string;
  h5pContentId: string | null;
  /** Title of the attached exercise, for display in the editor. */
  h5pTitle: string | null;
}

export interface CourseSection {
  id: string;
  title: string;
  lessons: Lesson[];
}

export interface CourseDetail extends CourseSummary {
  /** Sanitized HTML, like `summary`. */
  description: string;
  sections: CourseSection[];
}

/** What a visitor sees before buying: the outline without the exercises. */
export interface CourseOutline extends CourseSummary {
  /** Sanitized HTML, like `summary`. */
  description: string;
  sections: Array<{ id: string; title: string; lessons: Array<{ id: string; title: string }> }>;
}

export interface LessonProgress {
  lessonId: string;
  completed: boolean;
  score: number | null;
  maxScore: number | null;
  completedAt: string | null;
}

export interface MyCourseSummary extends CourseSummary {
  completedLessons: number;
  progressPercent: number;
}

export interface MyCourseDetail extends CourseDetail {
  progress: LessonProgress[];
  progressPercent: number;
}

export const setLessonExerciseSchema = z.object({ h5pContentId: z.uuid().nullable() });
export type SetLessonExerciseInput = z.infer<typeof setLessonExerciseSchema>;

export const lessonResultSchema = z.object({
  completed: z.boolean().default(true),
  score: z.number().min(0).max(1_000_000).nullable().default(null),
  maxScore: z.number().min(0).max(1_000_000).nullable().default(null),
});
export type LessonResultInput = z.infer<typeof lessonResultSchema>;

export const checkoutSchema = z.object({
  courseId: idSchema,
  /** A discount coupon; the API checks it again and prices the order itself. */
  couponCode: couponCodeSchema.optional(),
});
export type CheckoutInput = z.infer<typeof checkoutSchema>;

export interface CheckoutResult {
  /** Where to send the browser: Stripe Checkout, or back to the course when it was free. */
  url: string;
  /** True when the student was enrolled immediately (free course or dev payments). */
  enrolled: boolean;
}

export function formatPrice(priceCents: number, currency: string, locale = 'en'): string {
  if (priceCents === 0) return 'Free';
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: currency.toUpperCase(),
  }).format(priceCents / 100);
}
