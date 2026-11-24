import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { UserRole } from '@speakukrainian/shared';
import { AccountsService } from '../auth/accounts.service.js';
import type { RequestWithUser } from '../auth/authenticated-user.js';
import { H5pUrlTokenService } from './h5p-url-token.service.js';
import { H5P_URL_TOKEN_KEY } from './h5p.url-token.decorator.js';
import {
  H5P_URL_TOKEN_EXPIRED_MESSAGE,
  H5P_URL_TOKEN_INVALID_MESSAGE,
  H5P_URL_TOKEN_PARAM,
  H5P_URL_TOKEN_QUERY,
  H5P_URL_TOKEN_UNKNOWN_USER_MESSAGE,
} from './h5p.url-token.js';

/**
 * Identifies the caller of the three routes Joubel's editor client drives
 * itself, from a token in the URL rather than from a bearer header.
 *
 * **It is inert everywhere else.** Without `@H5pUrlToken()` on the handler or
 * its class it returns immediately, which is every route in this API but three.
 *
 * **It runs first among the global guards, and that order is load-bearing:**
 * `SessionAuthGuard` would otherwise have already refused a request with no
 * `Authorization` header, and a route guard cannot rescue one.
 *
 * **Composition.** An *absent* token is not an error — it means the request is
 * using the other credential, so the bearer path takes over. A token that is
 * *present and bad* is refused here and never falls through, because falling
 * through would answer an expired editing session with a sentence about a
 * header the caller was never going to send. A token that is *present and
 * valid* wins over an `Authorization` header on the same request, and that
 * header is never verified: the caller demonstrably holds a credential naming
 * the token's user, so honouring the header instead would reach nothing a
 * token-only request could not already reach, and this way a tokenised URL
 * means the same thing wherever it is loaded from rather than depending on
 * whatever credential the surrounding page happens to attach to it.
 *
 * **What it costs, and why that is paid.** One database read per
 * token-authenticated request, to resolve the caller's *current* role. That is
 * what keeps the token from being a role grant: it carries no role, so a
 * demotion takes effect immediately rather than at the end of the token's
 * lifetime. The alternative — a role in the payload — would remove the read and
 * introduce a staleness window of the whole lifetime. An Auth outage therefore
 * breaks the editor's previews; that is the accepted side of the trade, and it
 * is now *answered as an outage* — a logged 503 — rather than reported to the
 * author as an account that can no longer sign in.
 */
@Injectable()
export class H5pUrlTokenGuard implements CanActivate {
  private readonly logger = new Logger(H5pUrlTokenGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: H5pUrlTokenService,
    private readonly accounts: AccountsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const accepted = this.reflector.getAllAndOverride<boolean>(H5P_URL_TOKEN_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!accepted) {
      return true;
    }

    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const token = tokenIn(request);
    if (token === undefined) {
      return true;
    }

    const result = this.tokens.verify(token);
    if (!result.ok) {
      throw new UnauthorizedException(
        result.reason === 'expired' ? H5P_URL_TOKEN_EXPIRED_MESSAGE : H5P_URL_TOKEN_INVALID_MESSAGE,
      );
    }

    const record = await this.recordOf(result.uid);
    request.user = {
      uid: result.uid,
      email: record.email,
      role: record.role,
    };
    return true;
  }

  /**
   * The account as it is now, not as it was when the token was minted: a
   * deleted or banned account, or one that lost the admin role, is refused
   * immediately rather than when the token expires.
   */
  private async recordOf(uid: string): Promise<{ email: string | undefined; role: UserRole }> {
    let account: Awaited<ReturnType<AccountsService['findById']>>;
    try {
      account = await this.accounts.findById(uid);
    } catch (error) {
      this.logger.error(`An account could not be read for an H5P URL token: ${String(error)}`);
      throw new ServiceUnavailableException('Sign-in is temporarily unavailable.');
    }
    if (!account || account.banned) {
      throw new UnauthorizedException(H5P_URL_TOKEN_UNKNOWN_USER_MESSAGE);
    }
    return { email: account.email, role: account.role };
  }
}

/**
 * The token a request carries, from the query parameter the ajax URLs use or
 * the path segment the preview URL uses.
 *
 * One rule for both routes rather than an argument on the decorator, and a
 * value that is not a string is treated as **absent** rather than coerced:
 * Express parses `?token=a&token=b` into an array, and `String(value)` on that
 * would hand `"a,b"` to the verifier.
 */
function tokenIn(request: RequestWithUser): string | undefined {
  const queried: unknown = request.query[H5P_URL_TOKEN_QUERY];
  if (typeof queried === 'string' && queried !== '') {
    return queried;
  }

  const named: unknown = (request.params as Record<string, unknown>)[H5P_URL_TOKEN_PARAM];
  return typeof named === 'string' && named !== '' ? named : undefined;
}
