import { z } from 'zod';
import { idSchema } from './common.js';

export type MessageSender = 'admin' | 'student';

export interface Message {
  id: string;
  studentId: string;
  sender: MessageSender;
  body: string;
  /** The lesson a student's question was asked from, if any. */
  lessonId: string | null;
  lessonTitle: string | null;
  courseTitle: string | null;
  createdAt: string;
  readAt: string | null;
}

export const sendMessageSchema = z.object({
  body: z.string().trim().min(1).max(5_000),
  lessonId: idSchema.nullable().optional(),
});
export type SendMessageInput = z.infer<typeof sendMessageSchema>;

export interface ConversationSummary {
  studentId: string;
  email: string;
  fullName: string;
  lastMessage: string;
  lastMessageAt: string;
  lastSender: MessageSender;
  unread: number;
}
