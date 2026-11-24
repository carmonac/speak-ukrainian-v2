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
    const [counts, sales] = await Promise.all([
      this.db.one<{
        pages: string;
        visitors: string;
        students: string;
        courses: string;
        unread: string;
      }>(
        `select
           (select count(*) from public.pages) as pages,
           (select count(*) from public.page_views where day > current_date - 30) as visitors,
           (select count(*) from auth.users
             where coalesce(raw_app_meta_data ->> 'role', '') <> 'admin') as students,
           (select count(*) from public.courses) as courses,
           (select count(*) from public.messages
             where sender = 'student' and read_at is null) as unread`,
      ),
      this.db.rows<{
        id: string;
        paid_at: Date;
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
         from public.orders o
         join auth.users u on u.id = o.user_id
         left join public.profiles p on p.id = o.user_id
         join public.courses c on c.id = o.course_id
         where o.status = 'paid'
         order by o.paid_at desc
         limit 100`,
      ),
    ]);

    return {
      pages: Number(counts?.pages ?? 0),
      visitors: Number(counts?.visitors ?? 0),
      students: Number(counts?.students ?? 0),
      courses: Number(counts?.courses ?? 0),
      unreadMessages: Number(counts?.unread ?? 0),
      sales: sales.map((row): Sale => ({
        id: row.id,
        paidAt: row.paid_at.toISOString(),
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
