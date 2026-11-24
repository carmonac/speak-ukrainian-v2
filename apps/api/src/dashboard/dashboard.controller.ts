import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { DashboardStats, Sale } from '@speakukrainian/shared';
import { Roles } from '../auth/roles.decorator.js';
import { DatabaseService } from '../infra/db/database.service.js';

@ApiTags('dashboard')
@ApiBearerAuth()
@Roles('admin')
@Controller('admin/dashboard')
export class DashboardController {
  constructor(private readonly db: DatabaseService) {}

  @Get()
  async stats(): Promise<DashboardStats & { unreadMessages: number }> {
    // Days are `YYYY-MM-DD` text, which compares chronologically.
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
    const [counts, sales] = await Promise.all([
      this.db.one<{
        pages: number;
        visitors: number;
        students: number;
        courses: number;
        unread: number;
      }>(
        `select
           (select count(*) from pages) as pages,
           (select count(*) from page_views where day > ?1) as visitors,
           (select count(*) from "user" where role <> 'admin') as students,
           (select count(*) from courses) as courses,
           (select count(*) from messages
             where sender = 'student' and read_at is null) as unread`,
        [thirtyDaysAgo],
      ),
      this.db.rows<{
        id: string;
        paid_at: string;
        user_id: string;
        email: string;
        full_name: string;
        course_id: string;
        title: string;
        amount_cents: number;
        currency: string;
      }>(
        `select o.id, o.paid_at, o.user_id, u.email, coalesce(p.full_name, '') as full_name,
                o.course_id, c.title, o.amount_cents, o.currency
         from orders o
         join "user" u on u.id = o.user_id
         left join profiles p on p.id = o.user_id
         join courses c on c.id = o.course_id
         where o.status = 'paid'
         order by o.paid_at desc
         limit 100`,
      ),
    ]);

    return {
      pages: counts?.pages ?? 0,
      visitors: counts?.visitors ?? 0,
      students: counts?.students ?? 0,
      courses: counts?.courses ?? 0,
      unreadMessages: counts?.unread ?? 0,
      sales: sales.map((row): Sale => ({
        id: row.id,
        paidAt: row.paid_at,
        studentId: row.user_id,
        studentEmail: row.email,
        studentName: row.full_name,
        courseId: row.course_id,
        courseTitle: row.title,
        amountCents: row.amount_cents,
        currency: row.currency,
      })),
    };
  }
}
