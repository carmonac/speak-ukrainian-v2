import { Inject, Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/configuration.js';
import { AccountsService } from './accounts.service.js';
import { AUTH, type Auth } from './auth.js';

/**
 * The password of a freshly created administrator. It is public knowledge, so
 * it is only ever a starting point: the panel asks for it to be changed.
 */
export const DEFAULT_ADMIN_PASSWORD = 'admin123';

const BOOTSTRAP_ATTEMPTS = 10;
const BOOTSTRAP_RETRY_DELAY_MS = 3_000;

/**
 * Creates the single administrator the first time the API boots against a
 * database that has none. It never touches an existing administrator.
 */
@Injectable()
export class AdminBootstrapService implements OnApplicationBootstrap {
  private readonly logger = new Logger('AdminBootstrap');

  constructor(
    @Inject(AUTH) private readonly auth: Auth,
    private readonly accounts: AccountsService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  /**
   * Does not hold the start-up back, and does not give up at the first
   * failure: the database may not be reachable yet (in development the gateway
   * can still be applying migrations when the API starts; in production the
   * bridge comes up with the container).
   */
  onApplicationBootstrap(): void {
    void this.ensureAdminWithRetries();
  }

  /** Resolves once the administrator exists, or the attempts are used up. */
  async ensureAdminWithRetries(
    attempts = BOOTSTRAP_ATTEMPTS,
    delayMs = BOOTSTRAP_RETRY_DELAY_MS,
  ): Promise<boolean> {
    for (let attempt = 1; attempt <= attempts; attempt++) {
      try {
        await this.ensureAdmin();
        return true;
      } catch (error) {
        const last = attempt === attempts;
        // The API still serves the public site and students without an admin.
        this.logger[last ? 'error' : 'warn'](
          `Could not check or create the admin account (attempt ${attempt} of ${attempts}): ${String(error)}`,
        );
        if (!last) {
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
      }
    }
    return false;
  }

  async ensureAdmin(): Promise<void> {
    if (await this.accounts.adminExists()) {
      return;
    }

    const email = this.config.get('ADMIN_EMAIL', { infer: true });
    let created: { user: { id: string } };
    try {
      created = await this.auth.api.signUpEmail({
        body: { email, password: DEFAULT_ADMIN_PASSWORD, name: 'Administrator' },
      });
    } catch (error) {
      throw new Error(
        `creating ${email} failed (${String(error)}). If that address already belongs to a ` +
          'student account, delete it or choose another ADMIN_EMAIL.',
        { cause: error },
      );
    }
    await this.accounts.makeAdmin(created.user.id);

    this.logger.warn(
      `Administrator ${email} created with the default password. Change it in the panel.`,
    );
  }
}
