import { timingSafeEqual } from 'node:crypto';
import {
  Controller,
  ForbiddenException,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiExcludeController } from '@nestjs/swagger';
import { Public } from '../auth/public.decorator.js';
import type { Env } from '../config/configuration.js';
import { MessagesService } from './messages.service.js';

/** The header the gateway's Cron Trigger authenticates with. */
export const CRON_SECRET_HEADER = 'x-cron-secret';

/**
 * Entry point for scheduled work. Nothing in the API runs on a timer of its
 * own: the container sleeps when idle and may have more than one instance, so
 * the schedule lives in the gateway (a Cloudflare Cron Trigger), which calls
 * this once a day.
 *
 * The route is public as far as sessions go, and reachable from the internet
 * like every other route, so it is guarded by a secret only the gateway and
 * the API know. Without `CRON_SECRET` configured it is switched off.
 */
@ApiExcludeController()
@Controller('internal')
export class RemindersController {
  private readonly secret: string | undefined;

  constructor(
    private readonly messages: MessagesService,
    config: ConfigService<Env, true>,
  ) {
    this.secret = config.get('CRON_SECRET', { infer: true });
  }

  @Public()
  @Post('chat-reminders')
  @HttpCode(HttpStatus.OK)
  async chatReminders(
    @Headers(CRON_SECRET_HEADER) presented: string | undefined,
  ): Promise<{ sent: number }> {
    if (!this.secret) {
      throw new ServiceUnavailableException('Scheduled jobs are not configured.');
    }
    if (!matches(presented, this.secret)) {
      throw new ForbiddenException('Invalid cron secret.');
    }
    return { sent: await this.messages.sendReminders() };
  }
}

/** Compares in constant time, so the answer's timing says nothing about the secret. */
function matches(presented: string | undefined, secret: string): boolean {
  const a = Buffer.from(presented ?? '');
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}
