import { z } from 'zod';
import { paginationQuerySchema } from './common.js';

export interface UserSummary {
  id: string;
  email: string;
  fullName: string;
  createdAt: string;
  lastSignInAt: string | null;
  courseCount: number;
  unreadMessages: number;
}

export interface UserDetail extends UserSummary {
  locale: string;
  notes: string;
  courses: Array<{ id: string; title: string; enrolledAt: string; progressPercent: number }>;
}

export const updateUserSchema = z.object({
  fullName: z.string().trim().max(200),
  locale: z.string().max(10).default('en'),
  /** Private notes only the admin sees. */
  notes: z.string().max(10_000).default(''),
});
export type UpdateUserInput = z.infer<typeof updateUserSchema>;

export const listUsersQuerySchema = paginationQuerySchema.extend({
  search: z.string().trim().max(200).optional(),
});
export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>;

export const sendEmailSchema = z.object({
  subject: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(20_000),
});
export type SendEmailInput = z.infer<typeof sendEmailSchema>;

export interface MyProfile {
  id: string;
  email: string;
  fullName: string;
  locale: string;
}

export const updateMyProfileSchema = z.object({
  fullName: z.string().trim().max(200),
});
export type UpdateMyProfileInput = z.infer<typeof updateMyProfileSchema>;
