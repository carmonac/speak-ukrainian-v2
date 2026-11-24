import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import type { ConversationSummary, Message, MessageSender } from '@speakukrainian/shared';
import type { Env } from '../config/configuration.js';
import { EmailService } from '../email/email.service.js';
import { DatabaseService } from '../infra/db/database.service.js';

interface MessageRow {
  id: string;
  student_id: string;
  sender: MessageSender;
  body: string;
  lesson_id: string | null;
  lesson_title: string | null;
  course_title: string | null;
  created_at: Date;
  read_at: Date | null;
}

const MESSAGE_SELECT = `
  select m.id, m.student_id, m.sender, m.body, m.lesson_id, m.created_at, m.read_at,
         l.title as lesson_title, c.title as course_title
  from public.messages m
  left join public.lessons l on l.id = m.lesson_id
  left join public.course_sections s on s.id = l.section_id
  left join public.courses c on c.id = s.course_id`;

function toMessage(row: MessageRow): Message {
  return {
    id: row.id,
    studentId: row.student_id,
    sender: row.sender,
    body: row.body,
    lessonId: row.lesson_id,
    lessonTitle: row.lesson_title,
    courseTitle: row.course_title,
    createdAt: row.created_at.toISOString(),
    readAt: row.read_at ? row.read_at.toISOString() : null,
  };
}

/** The chat between each student and the administrator: one thread per student. */
@Injectable()
export class MessagesService {
  private readonly logger = new Logger(MessagesService.name);
  private readonly reminderAfterHours: number;
  private readonly studentUrl: string;

  constructor(
    private readonly db: DatabaseService,
    private readonly email: EmailService,
    config: ConfigService<Env, true>,
  ) {
    this.reminderAfterHours = config.get('CHAT_REMINDER_AFTER_HOURS', { infer: true });
    this.studentUrl = config.get('STUDENT_APP_URL', { infer: true }).replace(/\/$/, '');
  }

  async thread(studentId: string): Promise<Message[]> {
    const rows = await this.db.rows<MessageRow>(
      `${MESSAGE_SELECT} where m.student_id = $1 order by m.created_at asc limit 1000`,
      [studentId],
    );
    return rows.map(toMessage);
  }

  async send(
    studentId: string,
    sender: MessageSender,
    body: string,
    lessonId: string | null = null,
  ): Promise<Message> {
    if (sender === 'admin') {
      const exists = await this.db.one('select 1 from auth.users where id = $1', [studentId]);
      if (!exists) {
        throw new NotFoundException('That user does not exist.');
      }
    }

    const inserted = await this.db.one<{ id: string }>(
      `insert into public.messages (student_id, sender, body, lesson_id)
       values ($1, $2, $3, (select id from public.lessons where id = $4))
       returning id`,
      [studentId, sender, body, lessonId],
    );
    const row = await this.db.one<MessageRow>(`${MESSAGE_SELECT} where m.id = $1`, [inserted!.id]);
    return toMessage(row!);
  }

  /** Marks everything the *other* party wrote in this thread as read. */
  async markRead(studentId: string, reader: MessageSender): Promise<void> {
    await this.db.query(
      `update public.messages set read_at = now()
       where student_id = $1 and sender <> $2 and read_at is null`,
      [studentId, reader],
    );
  }

  async unreadCount(studentId: string, reader: MessageSender): Promise<number> {
    const row = await this.db.one<{ count: string }>(
      `select count(*) from public.messages
       where student_id = $1 and sender <> $2 and read_at is null`,
      [studentId, reader],
    );
    return Number(row?.count ?? 0);
  }

  /** Every thread, most recent activity first, for the admin's inbox. */
  async conversations(): Promise<ConversationSummary[]> {
    const rows = await this.db.rows<{
      student_id: string;
      email: string;
      full_name: string;
      body: string;
      created_at: Date;
      sender: MessageSender;
      unread: string;
    }>(
      `select distinct on (m.student_id)
              m.student_id, u.email, coalesce(p.full_name, '') as full_name,
              m.body, m.created_at, m.sender,
              (select count(*) from public.messages x
                where x.student_id = m.student_id and x.sender = 'student' and x.read_at is null) as unread
       from public.messages m
       join auth.users u on u.id = m.student_id
       left join public.profiles p on p.id = m.student_id
       order by m.student_id, m.created_at desc`,
    );
    return rows
      .map((row) => ({
        studentId: row.student_id,
        email: row.email,
        fullName: row.full_name,
        lastMessage: row.body.length > 140 ? `${row.body.slice(0, 140)}…` : row.body,
        lastMessageAt: row.created_at.toISOString(),
        lastSender: row.sender,
        unread: Number(row.unread),
      }))
      .sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt));
  }

  async totalUnreadFromStudents(): Promise<number> {
    const row = await this.db.one<{ count: string }>(
      `select count(*) from public.messages where sender = 'student' and read_at is null`,
    );
    return Number(row?.count ?? 0);
  }

  /**
   * Emails students who have had an unread message from the administrator for
   * longer than the configured delay (24 hours) and have not replied since.
   *
   * One email per student per batch of unread messages: every message covered
   * is stamped `reminder_sent_at`, so the next run skips it.
   */
  @Cron(CronExpression.EVERY_10_MINUTES)
  async sendReminders(): Promise<number> {
    let sent = 0;
    try {
      const due = await this.db.rows<{ student_id: string; email: string; pending: string }>(
        `select m.student_id, u.email, count(*) as pending
         from public.messages m
         join auth.users u on u.id = m.student_id
         where m.sender = 'admin'
           and m.read_at is null
           and m.reminder_sent_at is null
           and not exists (
             select 1 from public.messages r
             where r.student_id = m.student_id and r.sender = 'student' and r.created_at > m.created_at
           )
         group by m.student_id, u.email
         having min(m.created_at) < now() - make_interval(secs => $1)`,
        [this.reminderAfterHours * 3600],
      );

      for (const student of due) {
        // Stamp first: a crash between the two steps then costs one reminder
        // instead of sending the same one every ten minutes.
        const stamped = await this.db.query(
          `update public.messages set reminder_sent_at = now()
           where student_id = $1 and sender = 'admin' and read_at is null and reminder_sent_at is null`,
          [student.student_id],
        );
        if (stamped.rowCount === 0) {
          continue;
        }
        const count = Number(student.pending);
        await this.email.send({
          to: student.email,
          userId: student.student_id,
          kind: 'chat-reminder',
          subject: 'You have new messages from your teacher',
          text:
            `Hello,\n\nYou have ${count === 1 ? 'a new message' : `${count} new messages`} ` +
            `waiting for you in SpeakUkrainian.\n\nRead and reply here: ${this.studentUrl}/messages\n`,
        });
        sent += 1;
      }
    } catch (error) {
      this.logger.error(`Chat reminder run failed: ${String(error)}`);
    }
    return sent;
  }
}
