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
import { SUPABASE_ADMIN, type SupabaseAdmin } from '../infra/supabase/supabase.module.js';
import {
  roleFromAppMetadata,
  type AuthenticatedUser,
  type RequestWithUser,
} from './authenticated-user.js';
import { IS_OPTIONAL_AUTH_KEY } from './optional-auth.decorator.js';
import { IS_PUBLIC_KEY } from './public.decorator.js';
import { UserMirrorService } from './user-mirror.service.js';

/** How long a verified token is trusted before Supabase Auth is asked again. */
const CACHE_TTL_MS = 30_000;
const CACHE_MAX_ENTRIES = 2_000;

/**
 * Authenticates every request with a Supabase access token unless the route is
 * `@Public()`.
 *
 * Tokens are verified by Supabase Auth itself (`auth.getUser`) rather than by
 * checking the JWT signature locally: that works with every signing-key setup,
 * and a signed-out or deleted user is refused within the cache window instead
 * of when the token expires.
 */
@Injectable()
export class SupabaseAuthGuard implements CanActivate {
  private readonly logger = new Logger(SupabaseAuthGuard.name);
  private readonly cache = new Map<string, { user: AuthenticatedUser; expires: number }>();

  constructor(
    @Inject(SUPABASE_ADMIN) private readonly supabase: SupabaseAdmin,
    private readonly reflector: Reflector,
    private readonly mirror: UserMirrorService,
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

    const header = request.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      if (optional) {
        return true;
      }
      throw new UnauthorizedException('Missing bearer token');
    }

    try {
      request.user = await this.verify(header.slice('Bearer '.length));
    } catch (error) {
      if (optional && error instanceof UnauthorizedException) {
        return true;
      }
      throw error;
    }
    return true;
  }

  private async verify(token: string): Promise<AuthenticatedUser> {
    const now = Date.now();
    const cached = this.cache.get(token);
    if (cached && cached.expires > now) {
      return cached.user;
    }

    const { data, error } = await this.supabase.auth.getUser(token);
    if (error || !data.user) {
      // A status means Supabase answered and refused the token; no status means
      // it could not be reached, which is our outage and not the caller's fault.
      if (error && (error.status === undefined || error.status >= 500)) {
        this.logger.error(`Supabase Auth could not verify a token: ${error.message}`);
        throw new ServiceUnavailableException('Sign-in is temporarily unavailable.');
      }
      throw new UnauthorizedException('Invalid or expired token');
    }

    const user: AuthenticatedUser = {
      uid: data.user.id,
      email: data.user.email,
      role: roleFromAppMetadata(data.user.app_metadata),
    };

    // TEMPORARY (TASK-43): once per cache window, not once per request.
    const fullName = (data.user.user_metadata as { full_name?: unknown } | null)?.full_name;
    await this.mirror.sync(user, typeof fullName === 'string' ? fullName : '');

    if (this.cache.size >= CACHE_MAX_ENTRIES) {
      this.cache.clear();
    }
    this.cache.set(token, { user, expires: now + CACHE_TTL_MS });
    return user;
  }
}
