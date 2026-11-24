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
  created_at: string;
  last_sign_in_at: string | null;
  course_count: number;
  unread_messages: number;
}

/**
 * Students only: the administrator is not a row in the panel's user list.
 */
const USER_SELECT = `
  select u.id, u.email, u."createdAt" as created_at, u."lastSignInAt" as last_sign_in_at,
         coalesce(p.full_name, '') as full_name,
         coalesce(p.locale, 'en') as locale,
         coalesce(p.notes, '') as notes,
         (select count(*) from enrollments e where e.user_id = u.id) as course_count,
         (select count(*) from messages m
           where m.student_id = u.id and m.sender = 'student' and m.read_at is null) as unread_messages
  from "user" u
  left join profiles p on p.id = u.id
  where u.role <> 'admin'`;

function toSummary(row: UserRow): UserSummary {
  return {
    id: row.id,
    email: row.email,
    fullName: row.full_name,
    createdAt: row.created_at,
    lastSignInAt: row.last_sign_in_at,
    courseCount: row.course_count,
    unreadMessages: row.unread_messages,
  };
}

@Injectable()
export class UsersService {
  constructor(private readonly db: DatabaseService) {}

  async list(query: ListUsersQuery): Promise<Page<UserSummary>> {
    // `like` ignores case for ASCII only: a search for a Cyrillic or accented
    // name has to match its case. E-mail addresses are unaffected.
    const search = query.search ? `%${query.search.replace(/[%_\\]/g, '\\$&')}%` : null;
    const filter = search
      ? `and (u.email like ?1 escape '\\' or p.full_name like ?1 escape '\\')`
      : '';
    const params = search ? [search] : [];

    const [rows, total] = await Promise.all([
      this.db.rows<UserRow>(
        `${USER_SELECT} ${filter} order by u."createdAt" desc
         limit ?${params.length + 1} offset ?${params.length + 2}`,
        [...params, query.limit, query.offset],
      ),
      this.db.one<{ count: number }>(
        `select count(*) as count from "user" u left join profiles p on p.id = u.id
         where u.role <> 'admin' ${filter}`,
        params,
      ),
    ]);
    return { items: rows.map(toSummary), total: total?.count ?? 0 };
  }

  async countStudents(): Promise<number> {
    const row = await this.db.one<{ count: number }>(
      `select count(*) as count from "user" u where u.role <> 'admin'`,
    );
    return row?.count ?? 0;
  }

  async findById(id: string): Promise<UserDetail> {
    const row = await this.db.one<UserRow>(`${USER_SELECT} and u.id = ?1`, [id]);
    if (!row) {
      throw new NotFoundException('That user does not exist.');
    }

    const courses = await this.db.rows<{
      id: string;
      title: string;
      created_at: string;
      lessons: number;
      completed: number;
    }>(
      `select c.id, c.title, e.created_at,
              (select count(*) from lessons l
                 join course_sections s on s.id = l.section_id
                where s.course_id = c.id) as lessons,
              (select count(*) from lesson_progress lp
                 join lessons l on l.id = lp.lesson_id
                 join course_sections s on s.id = l.section_id
                where s.course_id = c.id and lp.user_id = e.user_id and lp.completed_at is not null) as completed
       from enrollments e
       join courses c on c.id = e.course_id
       where e.user_id = ?1
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
        enrolledAt: c.created_at,
        progressPercent: percent(c.completed, c.lessons),
      })),
    };
  }

  async update(id: string, input: UpdateUserInput): Promise<UserDetail> {
    await this.findById(id);
    await this.db.query(
      `insert into profiles (id, full_name, locale, notes) values (?1, ?2, ?3, ?4)
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
