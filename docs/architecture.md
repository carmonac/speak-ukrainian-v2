# Architecture

## Overview

```
                       ┌──────────────────────────────┐
 visitor ── example.com│  apps/api  (NestJS)          │
                       │   /        public site        │──┐
 admin ─ admin.example ─▶  /api/*   REST API           │  │  service role
        (Angular SPA)  │                              │  ▼
 student ─ student.ex. ─▶                              │ ┌───────────────────┐
        (Angular SPA)  └──────────────────────────────┘ │ Supabase          │
              │   sign-in, Realtime (anon key + RLS)     │  Postgres · Auth  │
              └─────────────────────────────────────────▶│  Storage · Realtime│
                                                         └───────────────────┘
                       Stripe Checkout ◀── redirect / webhook ──▶ /api/payments
                       SendGrid        ◀── EmailService
```

Three deployables, one database:

- **`apps/api`** is the only component that reads or writes application data.
  It also serves the public website: every `GET` outside `/api` is looked up as
  a page and rendered server-side, which keeps the site indexable and avoids a
  third front-end.
- **`apps/admin`** (control panel) and **`apps/student`** (classroom) are
  static Angular applications. They talk to the API for everything, and to
  Supabase directly for exactly two things: signing in, and Realtime
  notifications for the chat.

## Access model

- The API connects to Postgres directly (`DATABASE_URL`) and uses the Supabase
  **service-role** key for Auth administration and bucket setup. Both bypass
  row level security, so authorization is decided in the API: every route
  requires a valid Supabase access token unless marked `@Public()`, and
  administrator routes carry `@Roles('admin')`.
- **Row level security is enabled on every table with no policy**, so the anon
  key shipped to browsers can read nothing. The single exception is
  `messages`: a `select` policy lets a student see their own thread and the
  administrator see all of them, which is what Realtime needs to deliver
  change notifications. Clients treat a notification as "something changed"
  and re-read the thread through the API.
- **Roles.** A user is a student unless `app_metadata.role` is `admin`.
  `app_metadata` can only be written with the service role. The single
  administrator is created by the API on first boot
  (`auth/admin-bootstrap.service.ts`).
- Access tokens are verified by asking Supabase Auth (`auth.getUser`), cached
  for 30 seconds per token. This works with any JWT signing configuration and
  means a deleted user is locked out within the cache window.

## Data model

Defined in `supabase/migrations/`. All ids are UUIDs.

| Table                                     | Purpose                                                                                                          |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `profiles`                                | One row per user (name, language, admin's private notes). Created by a trigger on sign-up.                       |
| `pages`                                   | Public pages: title, URL path, Handlebars `content`. Exactly one has `is_main`.                                  |
| `page_texts`, `page_text_translations`    | A page's named texts and their per-language values.                                                              |
| `page_views`                              | One row per visitor per day (`visitor_hash`), for the dashboard counter.                                         |
| `h5p_content`                             | Index of stored exercises. Files live in Storage under `h5p/content/<id>/`.                                      |
| `courses` → `course_sections` → `lessons` | Course structure. A lesson optionally points at one `h5p_content` row.                                           |
| `orders`                                  | One per checkout: amount, provider (`stripe`, `free`, `dev`), status.                                            |
| `enrollments`                             | Who owns which course. Created when an order is paid.                                                            |
| `lesson_progress`                         | Per student and lesson: completion time and best score.                                                          |
| `messages`                                | The chat: one thread per student (`student_id`), `sender` is `admin` or `student`, optional `lesson_id` context. |
| `email_log`                               | Every email sent.                                                                                                |

## Modules of the API

| Module           | Routes                                                                      | Notes                                                                                                                      |
| ---------------- | --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `pages` + `site` | `/api/admin/pages/*`, `GET /*`                                              | CRUD and preview; `SiteRenderer` compiles templates, `SiteService` serves them and counts visitors.                        |
| `courses`        | `/api/admin/courses/*`, `/api/admin/lessons/:id/exercise`, `/api/courses/*` | The whole course tree is saved in one transaction. The public routes expose only published courses and only their outline. |
| `h5p`            | `/api/h5p/*`                                                                | See [h5p.md](h5p.md).                                                                                                      |
| `payments`       | `/api/me/checkout`, `/api/payments/stripe/webhook`                          | Enrollment is created by the signed webhook, never by the browser returning from Stripe. Idempotent.                       |
| `me`             | `/api/me/*`                                                                 | The signed-in student: profile, owned courses, lesson results, chat.                                                       |
| `users`          | `/api/admin/users/*`, `/api/admin/conversations`                            | User list and detail, sending email, the admin side of the chat.                                                           |
| `messages`       | (service)                                                                   | Threads, read state, and the reminder job.                                                                                 |
| `email`          | (service)                                                                   | SendGrid, or the log when no key is configured.                                                                            |
| `dashboard`      | `/api/admin/dashboard`                                                      | Counters and the sales list.                                                                                               |

### Chat reminder

`MessagesService.sendReminders` runs every ten minutes. A student is emailed
when they have a message from the administrator that is older than
`CHAT_REMINDER_AFTER_HOURS` (24), still unread, and not followed by a reply.
The messages covered are stamped `reminder_sent_at` first, so each batch of
unread messages produces exactly one email.

### Visitor counting

`page_views` stores `sha256(day | secret | ip | user-agent)`. No IP address is
stored, the hash cannot be reversed, and it changes daily, so a visitor cannot
be followed across days. Requests from obvious bots are not counted. The
dashboard shows unique visitors over the last 30 days.

## Front-end conventions

Both Angular apps are zoneless, use standalone components and signals, and
load their environment at start-up from `/config.json` (written from the
container environment in production, so one image runs anywhere).

- `core/runtime-config.ts`, `core/supabase.ts`, `core/auth.service.ts`,
  `core/http.ts` (auth interceptor, `ApiService`, `errorMessage`) are the same
  shape in both apps.
- UI components come from [ng-zorro-antd](https://github.com/NG-ZORRO/ng-zorro-antd).
- Types and validation schemas come from `@speakukrainian/shared`; forms are
  validated with the same Zod schema the API applies.

## Security notes

- Page templates are written by the single trusted administrator and are
  rendered as-is; text values are HTML-escaped unless the template opts out
  with triple braces. The preview in the panel is shown in a sandboxed iframe.
- Exercises are paid content. The player model is served only to the
  administrator or to an enrolled student, and an exercise's files are served
  through URLs carrying a signed, expiring token bound to that exercise.
- Stripe webhooks are verified against the raw request body.
- Secrets (`SUPABASE_SERVICE_ROLE_KEY`, `STRIPE_SECRET_KEY`,
  `SENDGRID_API_KEY`, `H5P_URL_TOKEN_SECRET`) exist only in the API's
  environment.
