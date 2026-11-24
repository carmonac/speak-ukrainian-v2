import {
  type CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { fromNodeHeaders } from 'better-auth/node';
import { isBanned } from './accounts.service.js';
import { AUTH, type Auth } from './auth.js';
import { toRole, type AuthenticatedUser, type RequestWithUser } from './authenticated-user.js';
import { IS_OPTIONAL_AUTH_KEY } from './optional-auth.decorator.js';
import { IS_PUBLIC_KEY } from './public.decorator.js';

/**
 * Authenticates every request with a session token (`Authorization: Bearer`)
 * unless the route is `@Public()`.
 *
 * The session is looked up on every request, with no cache in between: a
 * signed-out, expired, deleted or banned account is refused on its very next
 * request rather than some seconds later.
 */
@Injectable()
export class SessionAuthGuard implements CanActivate {
  private readonly logger = new Logger(SessionAuthGuard.name);

  constructor(
    @Inject(AUTH) private readonly auth: Auth,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets)) {
      return true;
    }
    const optional = this.reflector.getAllAndOverride<boolean>(IS_OPTIONAL_AUTH_KEY, targets);

    const request = context.switchToHttp().getRequest<RequestWithUser>();
    // Already identified by an earlier guard (the H5P URL token).
    if (request.user) {
      return true;
    }

    if (!request.headers.authorization?.startsWith('Bearer ')) {
      if (optional) {
        return true;
      }
      throw new UnauthorizedException('Missing bearer token');
    }

    const user = await this.verify(request);
    if (user) {
      request.user = user;
      return true;
    }
    if (optional) {
      return true;
    }
    throw new UnauthorizedException('Invalid or expired token');
  }

  private async verify(request: RequestWithUser): Promise<AuthenticatedUser | null> {
    let found: Awaited<ReturnType<Auth['api']['getSession']>>;
    try {
      found = await this.auth.api.getSession({ headers: fromNodeHeaders(request.headers) });
    } catch (error) {
      // The lookup itself failed (the database could not be reached): that is
      // our outage, not a bad credential.
      this.logger.error(`A session could not be verified: ${String(error)}`);
      throw new ServiceUnavailableException('Sign-in is temporarily unavailable.');
    }
    if (!found) {
      return null;
    }

    const { user } = found;
    if (isBanned(user.banned, user.banExpires)) {
      return null;
    }
    return { uid: user.id, email: user.email, role: toRole(user.role) };
  }
}
