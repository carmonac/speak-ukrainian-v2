import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/configuration.js';
import { BridgeClient } from '../infra/bridge/bridge.client.js';
import { DatabaseService, now } from '../infra/db/database.service.js';

export interface OutgoingEmail {
  to: string;
  /** The recipient's account, when there is one, for the email log. */
  userId?: string;
  subject: string;
  /** Plain text; line breaks are kept in the HTML version. */
  text: string;
  /** What triggered it: `admin-message`, `chat-reminder`, `password-reset`… */
  kind: string;
}

type Outcome = 'sent' | 'failed' | 'logged';

/**
 * Sends email with Cloudflare Email Sending, through the gateway bridge.
 *
 * With `EMAIL_DELIVERY=log` (the default, and what local development uses)
 * nothing leaves the machine: the message is written to the log instead, so
 * every flow still works without any configuration.
 *
 * Every attempt is recorded in `email_log`, whatever its outcome.
 */
@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly from: { name: string; email: string } | string;
  private readonly deliver: boolean;

  constructor(
    config: ConfigService<Env, true>,
    private readonly db: DatabaseService,
    private readonly bridge: BridgeClient,
  ) {
    this.from = parseSender(config.get('EMAIL_FROM', { infer: true }));
    this.deliver = config.get('EMAIL_DELIVERY', { infer: true }) === 'send';
    if (!this.deliver) {
      this.logger.warn('EMAIL_DELIVERY is not "send": emails are logged, not sent.');
    }
  }

  /** Sends one message. Rejects if it could not be handed over; the attempt is logged either way. */
  async send(email: OutgoingEmail): Promise<void> {
    if (!this.deliver) {
      this.logger.log(
        `[email not sent — delivery is off] to=${email.to} subject="${email.subject}"\n${email.text}`,
      );
      await this.record(email, 'logged');
      return;
    }

    try {
      await this.handOver(email);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.error(`Email to ${email.to} ("${email.subject}") was not sent: ${reason}`);
      await this.record(email, 'failed', reason);
      throw error;
    }
    await this.record(email, 'sent');
  }

  private async handOver(email: OutgoingEmail): Promise<void> {
    const response = await this.bridge.send({
      method: 'POST',
      path: '/email/send',
      body: JSON.stringify({
        from: this.from,
        to: email.to,
        subject: email.subject,
        text: email.text,
        html: toHtml(email.text),
      }),
    });
    if (!response.ok) {
      const failure = await this.bridge.failureOf(response);
      throw new Error(`The email could not be sent (${response.status}): ${failure.message}`);
    }
    await response.body?.cancel();
  }

  /** Never lets a logging problem hide the outcome of the send itself. */
  private async record(email: OutgoingEmail, status: Outcome, error?: string): Promise<void> {
    await this.db
      .query(
        `insert into email_log (to_user, to_email, subject, kind, sent_at, status, error)
         values (?1, ?2, ?3, ?4, ?5, ?6, ?7)`,
        [
          email.userId ?? null,
          email.to,
          email.subject,
          email.kind,
          now(),
          status,
          error?.slice(0, 1000) ?? null,
        ],
      )
      .catch((problem: unknown) =>
        this.logger.error(`Could not record an email in email_log: ${String(problem)}`),
      );
  }
}

/** `Name <address>` becomes its two parts; a bare address is kept as it is. */
export function parseSender(value: string): { name: string; email: string } | string {
  const match = /^\s*"?([^"<]*?)"?\s*<\s*([^<>\s]+@[^<>\s]+)\s*>\s*$/.exec(value);
  if (!match) {
    return value.trim();
  }
  const [, name = '', email = ''] = match;
  return name.trim() === '' ? email : { name: name.trim(), email };
}

function toHtml(text: string): string {
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
  return `<div style="font-family:system-ui,sans-serif;font-size:15px;line-height:1.5">${escaped.replace(/\r?\n/g, '<br />')}</div>`;
}
