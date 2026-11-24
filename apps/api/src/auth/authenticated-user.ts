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

/** The role lives in `app_metadata`, which only the service role can write. */
export function roleFromAppMetadata(appMetadata: unknown): UserRole {
  const role = (appMetadata as { role?: unknown } | null | undefined)?.role;
  return role === 'admin' ? 'admin' : 'student';
}
