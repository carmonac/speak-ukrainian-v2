import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import sendgrid from '@sendgrid/mail';
import type { Env } from '../config/configuration.js';
import { DatabaseService } from '../infra/db/database.service.js';

export interface OutgoingEmail {
  to: string;
  /** The recipient's account, when there is one, for the email log. */
  userId?: string;
  subject: string;
  /** Plain text; line breaks are kept in the HTML version. */
  text: string;
  /** What triggered it: `admin-message`, `chat-reminder`, … */
  kind: string;
}

/**
 * Sends email through SendGrid. Without `SENDGRID_API_KEY` the message is
 * written to the log instead, so every flow works in local development.
 */
@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly from: string;
  private readonly enabled: boolean;

  constructor(
    config: ConfigService<Env, true>,
    private readonly db: DatabaseService,
  ) {
    this.from = config.get('EMAIL_FROM', { infer: true });
    const apiKey = config.get('SENDGRID_API_KEY', { infer: true });
    this.enabled = Boolean(apiKey);
    if (apiKey) {
      sendgrid.setApiKey(apiKey);
    } else {
      this.logger.warn('SENDGRID_API_KEY is not set: emails are logged, not sent.');
    }
  }

  async send(email: OutgoingEmail): Promise<void> {
    if (this.enabled) {
      await sendgrid.send({
        to: email.to,
        from: this.from,
        subject: email.subject,
        text: email.text,
        html: toHtml(email.text),
      });
    } else {
      this.logger.log(
        `[email not sent — no SendGrid key] to=${email.to} subject="${email.subject}"\n${email.text}`,
      );
    }

    await this.db.query(
      `insert into public.email_log (to_user, to_email, subject, kind) values ($1, $2, $3, $4)`,
      [email.userId ?? null, email.to, email.subject, email.kind],
    );
  }
}

function toHtml(text: string): string {
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
  return `<div style="font-family:system-ui,sans-serif;font-size:15px;line-height:1.5">${escaped.replace(/\r?\n/g, '<br />')}</div>`;
}
