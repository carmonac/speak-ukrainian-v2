# Architecture

Everything runs on Cloudflare, in one account, under one domain.

## Overview

```
 visitor ──▶ speakukrainian.org ─────────┐
                                         ▼
                          ┌──────────────────────────────┐
                          │ apps/gateway  (Worker)       │
                          │  · forwards every request ───┼──▶ ┌──────────────────────────┐
                          │  · daily Cron Trigger        │    │ apps/api  (container)    │
                          │  · the bridge  ◀─────────────┼─── │  NestJS                  │
                          └───────┬──────────────────────┘    │   /       public site    │
                                  │ bindings                  │   /api/*  REST API       │
              ┌───────────────────┼─────────────────┐         │   /api/auth/*  accounts  │
              ▼                   ▼                 ▼         └──────────────────────────┘
          D1 (SQLite)        R2 (files)      Email Sending
          all the data       H5P content     no-reply@…

 admin ───▶ admin.speakukrainian.org     apps/admin    static Angular app (Worker assets)
 student ─▶ student.speakukrainian.org   apps/student  static Angular app (Worker assets)
                 both call https://speakukrainian.org/api

 Stripe Checkout ◀── redirect / webhook ──▶ /api/payments
```

Four deployables:

- **`apps/gateway`** — a Cloudflare Worker, the public entry point for
  `speakukrainian.org`. It does three things: forwards requests to the API
  container, runs the daily schedule, and gives the API access to the
  database, the file bucket and e-mail (the _bridge_, below).
- **`apps/api`** — the NestJS application, running in a Cloudflare Container.
  It is the only component that reads or writes application data. It also
  serves the public website: every `GET` outside `/api` is looked up as a page
  and rendered server-side, which keeps the site indexable and avoids a third
  front-end.
- **`apps/admin`** (control panel) and **`apps/student`** (classroom) — static
  Angular applications served by Workers static assets. They talk to the API
  for everything, including signing in.

## How a request flows

1. A browser asks for `https://speakukrainian.org/api/courses`.
2. The gateway Worker receives it, overwrites `X-Forwarded-For`, `-Proto` and
   `-Host` with what Cloudflare observed, and hands it to the one
   `ApiContainer` Durable Object (`src/api-container.ts`).
3. That object owns the container. If it is asleep it starts it, passing the
   Worker's variables and secrets as the container's environment, and waits
   for `/api/health`. Then it proxies the request, streaming bodies in both
   directions.
4. Inside the container the API handles the request. When it needs data it
   makes an HTTP request to `http://gateway.internal/…`. That host does not
   exist in DNS: the container's outbound traffic to it is intercepted and
   answered by the gateway (`Bridge` in `src/index.ts`), which runs the query
   against D1, R2 or Email Sending with its bindings.
5. The response travels back the same way.

The container sleeps after 30 minutes without requests and has an ephemeral
disk. The first request after that pays a cold start of a few seconds.
Nothing durable is kept in the container: uploads in progress use its disk
for the length of one request, everything else is in D1 or R2.

### The bridge

Cloudflare bindings (D1, R2, Email Sending) only exist inside a Worker, and
the API runs in a container, so the gateway exposes them over HTTP
(`apps/gateway/src/bridge.ts`):

| Route                                | Does                                            |
| ------------------------------------ | ----------------------------------------------- |
| `POST /d1/query`, `POST /d1/batch`   | One SQL statement, or several atomically        |
| `PUT/GET /r2/object`, `GET /r2/stat` | Store, read (with `Range`) and inspect one file |
| `GET /r2/list`, `POST /r2/delete`    | List a prefix, delete up to 1000 files          |
| `/r2/multipart…`                     | Upload a large file in parts                    |
| `POST /email/send`                   | Send one e-mail                                 |

In production the bridge is reachable **only from the container** (it is not
bound to any route). In local development the gateway serves the same routes
under `/__bridge`, guarded by a shared secret (`BRIDGE_SECRET`), for the API
running as a Node process.

On the API side `infra/bridge/bridge.client.ts` is the one HTTP client;
`infra/db` and `infra/storage` build on it.

## Data

Cloudflare **D1**, which is SQLite. The schema is in
`apps/gateway/migrations/` and is applied with `pnpm db:migrate` (local) and
`pnpm db:migrate:remote`.

What is different from a classic SQL connection, and shapes the API's code
(`infra/db/database.service.ts`):

- **No interactive transactions.** Writes that must happen together go
  through `batch()`, which is atomic. A batch cannot read a result and decide
  what to do next, so ids are generated in the API and anything conditional is
  expressed in SQL or checked beforehand.
- **At most 100 parameters per statement.** A list of any size is passed as
  one JSON parameter and unpacked with `json_each`.
- Timestamps are ISO 8601 text, booleans are 0/1, ids are UUID text.
  Application tables are `STRICT`.

| Table                                        | Purpose                                                                                                          |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `user`, `session`, `account`, `verification` | Accounts and sessions, owned by better-auth (see below).                                                         |
| `profiles`                                   | One row per user (name, language, admin's private notes). Created by the API when the account is created.        |
| `pages`                                      | Public pages: title, URL path, Handlebars `content`. Exactly one has `is_main`.                                  |
| `page_texts`, `page_text_translations`       | A page's named texts and their per-language values.                                                              |
| `page_views`                                 | One row per visitor per day (`visitor_hash`), for the dashboard counter.                                         |
| `h5p_content`                                | Index of stored exercises. Files live in R2 under `h5p/content/<id>/`.                                           |
| `courses` → `course_sections` → `lessons`    | Course structure. A lesson optionally points at one `h5p_content` row.                                           |
| `orders`                                     | One per checkout: amount, provider (`stripe`, `free`, `dev`), status.                                            |
| `enrollments`                                | Who owns which course. Created when an order is paid.                                                            |
| `lesson_progress`                            | Per student and lesson: completion time and best score.                                                          |
| `messages`                                   | The chat: one thread per student (`student_id`), `sender` is `admin` or `student`, optional `lesson_id` context. |
| `email_log`                                  | Every attempt to send an e-mail, with its outcome (`sent`, `failed`, `logged`).                                  |

**Files** are in one private **R2** bucket, reached through the bridge by
`infra/storage/storage.service.ts`. No access keys exist for it and nothing in
it is public: every byte a browser receives is streamed through the API,
which decides who may read it. Streams are uploaded in 8 MiB parts. Exercises
are under `h5p/` (see [h5p.md](h5p.md) for the layout); the files uploaded for
the site's pages are under `site/files/`, and those the API serves to anyone
at `/files/<id>/<name>`. The pictures and videos added to a course summary in
the panel's editor are ordinary site files too, so they show up in **Storage**.

## Accounts and access

Authentication is [better-auth](https://www.better-auth.com), running inside
the API (`apps/api/src/auth/auth.ts`) and stored in D1. Its routes are under
`/api/auth`: sign-up, sign-in, sign-out, password reset and change.

- **E-mail and password** only, for now. Google and Apple sign-in are prepared
  but switched off; see [deployment.md](deployment.md#enabling-google-and-apple-sign-in).
- **Sessions are bearer tokens.** A sign-in answers with the token in the
  `set-auth-token` header; each app keeps its own in `localStorage` and sends
  it as `Authorization: Bearer`. Cookies are not used, so the administrator
  and a student can be signed in side by side in one browser.
- **Every route requires a session** unless marked `@Public()`
  (`auth/session-auth.guard.ts`). The session is looked up on every request,
  with no cache, so a sign-out, an expiry or a ban takes effect on the next
  request.
- **Roles.** A user is a `student` unless `user.role` is `admin`.
  Administrator routes carry `@Roles('admin')`. The role cannot be set through
  sign-up.
- **The administrator** is created by the API the first time it starts
  against a database with none (`auth/admin-bootstrap.service.ts`), for
  `ADMIN_EMAIL`, with the password `admin123`. The panel shows a warning on
  every page until it is changed (`GET /api/admin/account` reports it).
- **Bans.** A banned account cannot sign in, call the API, or load exercise
  files through URL tokens.

## Modules of the API

| Module           | Routes                                                                      | Notes                                                                                                                |
| ---------------- | --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `auth`           | `/api/auth/*`, `/api/admin/account`                                         | better-auth, the guards, the first-run administrator.                                                                |
| `pages` + `site` | `/api/admin/pages/*`, `/api/preview/:token`, `GET /*`                       | CRUD and preview; `SiteRenderer` compiles templates, `SiteService` serves them and counts visitors.                  |
| `files`          | `/api/admin/files`, `GET /files/:id/:name`                                  | Files for the pages: upload, list and delete for the administrator; `SiteService` serves them to everyone.           |
| `courses`        | `/api/admin/courses/*`, `/api/admin/lessons/:id/exercise`, `/api/courses/*` | The whole course tree is saved in one batch. The public routes expose only published courses and only their outline. |
| `h5p`            | `/api/h5p/*`                                                                | See [h5p.md](h5p.md).                                                                                                |
| `payments`       | `/api/me/checkout`, `/api/payments/stripe/webhook`                          | Enrollment is created by the signed webhook, never by the browser returning from Stripe. Idempotent.                 |
| `me`             | `/api/me/*`                                                                 | The signed-in student: profile, owned courses, lesson results, chat.                                                 |
| `users`          | `/api/admin/users/*`, `/api/admin/conversations`                            | User list and detail, sending e-mail, the admin side of the chat.                                                    |
| `messages`       | `/api/internal/chat-reminders`                                              | Threads, read state, and the reminder job.                                                                           |
| `email`          | (service)                                                                   | Cloudflare Email Sending through the bridge, or the log when delivery is off.                                        |
| `dashboard`      | `/api/admin/dashboard`                                                      | Counters and the sales list.                                                                                         |

### E-mail

`EmailService` sends through the bridge, from `no-reply@speakukrainian.org`,
when `EMAIL_DELIVERY=send` (set by the gateway in production). With `log`, the
default, messages are written to the API log instead, so every flow works
locally with no configuration. Three kinds exist: a message the administrator
writes to a student, the chat reminder, and password resets.

### Chat

One thread per student. There is no push channel: an open conversation asks
the API again every 5 seconds and the student's unread badge every 20, only
while the tab is visible.

### Chat reminder and the schedule

The API has no timers of its own, because its container sleeps. The gateway
has a Cron Trigger, once a day at 08:00 UTC, which calls
`POST /api/internal/chat-reminders` with the shared secret `CRON_SECRET`.

A student is e-mailed when they have a message from the administrator that is
older than `CHAT_REMINDER_AFTER_HOURS` (24), still unread, and not followed by
a reply. The messages covered are stamped `reminder_sent_at` first, so each
batch of unread messages produces exactly one e-mail. With a daily run, the
reminder arrives between 24 and 48 hours after the message.

### Payments

Stripe Checkout. Without `STRIPE_SECRET_KEY`, outside production a purchase
completes instantly so the classroom can be exercised locally; in production
a paid course cannot be bought and free courses still can.

### Public pages are served from memory

A page changes only when the administrator saves or deletes one, so the public
site does not read it from D1 on every visit. `site/page-cache.ts` remembers
each path's page (or that there is none) for up to a minute, at most 500
paths. `PagesController` empties it after every create, update and delete, so
an edit shows on the next load; the one-minute expiry only matters if there
were ever several API instances, since only the one that handled the edit is
told. The control panel always reads the database.

### Visitor counting

`page_views` stores `sha256(day | secret | ip | user-agent)`. No IP address is
stored, the hash cannot be reversed, and it changes daily, so a visitor cannot
be followed across days. Requests from obvious bots are not counted. The
dashboard shows unique visitors over the last 30 days.

## Front-end conventions

Both Angular apps are zoneless, use standalone components and signals, and
load their environment at start-up from `/config.json`. That file is chosen by
the build configuration: `ng serve` copies `config/development/config.json`
(localhost), `ng build` copies `config/production/config.json`.

- `core/runtime-config.ts`, `core/auth.service.ts` and `core/http.ts` (auth
  interceptor, `ApiService`, `errorMessage`) are the same shape in both apps.
- UI components come from [ng-zorro-antd](https://github.com/NG-ZORRO/ng-zorro-antd).
- Types and validation schemas come from `@speakukrainian/shared`; forms are
  validated with the same Zod schema the API applies.
- Response headers for the deployed apps are in `public/_headers`: security
  headers on everything, `config.json` never cached, hashed build files cached
  for a year.

## Security notes

- Page templates are written by the single trusted administrator and are
  rendered as-is; text values are HTML-escaped unless the template opts out
  with triple braces.
- The page preview is unsaved, unreviewed markup, so it never runs on the
  panel's origin. The panel asks for a link (`POST /api/admin/pages/preview-link`),
  the API keeps the rendered HTML in memory under a random token for 15
  minutes, and the new tab loads it from the public site with
  `Content-Security-Policy: sandbox allow-scripts …` and no `allow-same-origin`:
  its scripts run on an origin of their own, without storage, cookies or a way
  back to the window that opened it.
- The course summary is rich text written in the panel (a Tiptap editor,
  `apps/admin/src/app/core/rich-text-editor.ts`) and shown to everyone: in the
  student app with `[innerHTML]`, on the public site through `{{ summary }}`.
  So it is stored as HTML that `apps/api/src/courses/rich-text.ts` has
  sanitized against an allowlist (paragraphs, two heading levels, bold,
  italic, underline, strike, lists, quotes, links, `img`, `video`; `http`/
  `https` addresses, plus `mailto` for links; no styles, classes or event
  handlers) before it reaches the database. Anything that cannot show HTML —
  course cards, Stripe Checkout, meta tags — uses `summaryText`, the plain
  text the API derives from it.
- Site files share the private bucket with the exercises but live under their
  own prefix, `site/files/<id>/<name>`. The public route accepts exactly that
  shape (a UUID and one file name) and the administrator's list and delete
  routes work only inside that prefix, so neither can reach H5P content.
- Exercises are paid content. The player model is served only to the
  administrator or to an enrolled student, and an exercise's files are served
  through URLs carrying a signed, expiring token bound to that exercise.
- Stripe webhooks are verified against the raw request body.
- CORS allows exactly the admin and student origins.
- Secrets exist only as Worker secrets of the gateway, which passes them to
  the container: `AUTH_SECRET`, `H5P_URL_TOKEN_SECRET`, `CRON_SECRET`, and the
  Stripe keys. There are no credentials for the database or the bucket.
