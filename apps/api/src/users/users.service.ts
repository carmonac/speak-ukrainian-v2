import { Injectable, NotFoundException } from '@nestjs/common';
import type {
  ListUsersQuery,
  Page,
  UpdateUserInput,
  UserDetail,
  UserSummary,
} from '@speakukrainian/shared';
import { DatabaseService } from '../infra/db/database.service.js';

interface UserRow {
  id: string;
  email: string;
  full_name: string;
  locale: string;
  notes: string;
  created_at: Date;
  last_sign_in_at: Date | null;
  course_count: string;
  unread_messages: string;
}

/** Students only: the administrator is not a row in the panel's user list. */
const USER_SELECT = `
  select u.id, u.email, u.created_at, u.last_sign_in_at,
         coalesce(p.full_name, '') as full_name,
         coalesce(p.locale, 'en') as locale,
         coalesce(p.notes, '') as notes,
         (select count(*) from public.enrollments e where e.user_id = u.id) as course_count,
         (select count(*) from public.messages m
           where m.student_id = u.id and m.sender = 'student' and m.read_at is null) as unread_messages
  from auth.users u
  left join public.profiles p on p.id = u.id
  where coalesce(u.raw_app_meta_data ->> 'role', '') <> 'admin'`;

function toSummary(row: UserRow): UserSummary {
  return {
    id: row.id,
    email: row.email,
    fullName: row.full_name,
    createdAt: row.created_at.toISOString(),
    lastSignInAt: row.last_sign_in_at ? row.last_sign_in_at.toISOString() : null,
    courseCount: Number(row.course_count),
    unreadMessages: Number(row.unread_messages),
  };
}

@Injectable()
export class UsersService {
  constructor(private readonly db: DatabaseService) {}

  async list(query: ListUsersQuery): Promise<Page<UserSummary>> {
    const search = query.search ? `%${query.search.replace(/[%_\\]/g, '\\$&')}%` : null;
    const filter = search ? `and (u.email ilike $1 or p.full_name ilike $1)` : '';
    const params = search ? [search] : [];

    const [rows, total] = await Promise.all([
      this.db.rows<UserRow>(
        `${USER_SELECT} ${filter} order by u.created_at desc
         limit $${params.length + 1} offset $${params.length + 2}`,
        [...params, query.limit, query.offset],
      ),
      this.db.one<{ count: string }>(
        `select count(*) from auth.users u left join public.profiles p on p.id = u.id
         where coalesce(u.raw_app_meta_data ->> 'role', '') <> 'admin' ${filter}`,
        params,
      ),
    ]);
    return { items: rows.map(toSummary), total: Number(total?.count ?? 0) };
  }

  async countStudents(): Promise<number> {
    const row = await this.db.one<{ count: string }>(
      `select count(*) from auth.users u where coalesce(u.raw_app_meta_data ->> 'role', '') <> 'admin'`,
    );
    return Number(row?.count ?? 0);
  }

  async findById(id: string): Promise<UserDetail> {
    const row = await this.db.one<UserRow>(`${USER_SELECT} and u.id = $1`, [id]);
    if (!row) {
      throw new NotFoundException('That user does not exist.');
    }

    const courses = await this.db.rows<{
      id: string;
      title: string;
      created_at: Date;
      lessons: string;
      completed: string;
    }>(
      `select c.id, c.title, e.created_at,
              (select count(*) from public.lessons l
                 join public.course_sections s on s.id = l.section_id
                where s.course_id = c.id) as lessons,
              (select count(*) from public.lesson_progress lp
                 join public.lessons l on l.id = lp.lesson_id
                 join public.course_sections s on s.id = l.section_id
                where s.course_id = c.id and lp.user_id = e.user_id and lp.completed_at is not null) as completed
       from public.enrollments e
       join public.courses c on c.id = e.course_id
       where e.user_id = $1
       order by e.created_at desc`,
      [id],
    );

    return {
      ...toSummary(row),
      locale: row.locale,
      notes: row.notes,
      courses: courses.map((c) => ({
        id: c.id,
        title: c.title,
        enrolledAt: c.created_at.toISOString(),
        progressPercent: percent(Number(c.completed), Number(c.lessons)),
      })),
    };
  }

  async update(id: string, input: UpdateUserInput): Promise<UserDetail> {
    await this.findById(id);
    await this.db.query(
      `insert into public.profiles (id, full_name, locale, notes) values ($1, $2, $3, $4)
       on conflict (id) do update
         set full_name = excluded.full_name, locale = excluded.locale, notes = excluded.notes`,
      [id, input.fullName, input.locale, input.notes],
    );
    return this.findById(id);
  }
}

export function percent(done: number, total: number): number {
  return total === 0 ? 0 : Math.round((done / total) * 100);
}
