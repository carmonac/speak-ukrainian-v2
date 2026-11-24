import type { Request } from 'express';
import type { UserRole } from '@speakukrainian/shared';

export interface AuthenticatedUser {
  uid: string;
  email: string | undefined;
  role: UserRole;
}

export interface RequestWithUser extends Request {
  user?: AuthenticatedUser;
}

/** Anything that is not exactly `admin` is a student. */
export function toRole(role: unknown): UserRole {
  return role === 'admin' ? 'admin' : 'student';
}
