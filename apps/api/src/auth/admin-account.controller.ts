import { Controller, Get, UnauthorizedException } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { AdminAccount } from '@speakukrainian/shared';
import { AccountsService } from './accounts.service.js';
import { DEFAULT_ADMIN_PASSWORD } from './admin-bootstrap.service.js';
import type { AuthenticatedUser } from './authenticated-user.js';
import { CurrentUser } from './current-user.decorator.js';
import { Roles } from './roles.decorator.js';

/**
 * The administrator's own account. Changing the password itself is
 * better-auth's `POST /api/auth/change-password`.
 */
@ApiTags('account')
@ApiBearerAuth()
@Roles('admin')
@Controller('admin/account')
export class AdminAccountController {
  constructor(private readonly accounts: AccountsService) {}

  @Get()
  async account(@CurrentUser() user: AuthenticatedUser | undefined): Promise<AdminAccount> {
    if (!user) {
      throw new UnauthorizedException();
    }
    return {
      email: user.email ?? '',
      usesDefaultPassword: await this.accounts.hasPassword(user.uid, DEFAULT_ADMIN_PASSWORD),
    };
  }
}
