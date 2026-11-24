-- SpeakUkrainian initial schema (Cloudflare D1, i.e. SQLite).
--
-- Apply with `pnpm db:migrate` (local) or `pnpm db:migrate:remote`.
--
-- Access model: the NestJS API is the only reader and writer, through the
-- gateway's D1 bridge. Browsers never reach the database.
--
-- Conventions, chosen so the values look the same to the API as they did
-- coming out of Postgres:
--   * ids are UUID strings (text). Tables whose rows the database may create
--     default the id to a random v4-shaped value.
--   * timestamps are text, ISO 8601 UTC with milliseconds
--     (`2026-11-24T21:33:01.947Z`): the shape of JS `toISOString()`, and one
--     that sorts chronologically as text.
--   * days are text, `YYYY-MM-DD`.
--   * booleans are integers 0/1.
--   * application tables are STRICT: a value of the wrong type is rejected
--     instead of stored.
--
-- Foreign keys are enforced by D1.

-- Users ------------------------------------------------------------------

-- The account table, owned by better-auth and named and shaped the way it
-- expects by default (camelCase columns, singular name). It is created here,
-- ahead of the rest of the auth tables, because every per-user table below
-- references it. Not STRICT: the auth library decides how it encodes values.
create table "user" (
  id text primary key,
  name text not null default '',
  email text not null unique,
  "emailVerified" integer not null default 0,
  image text,
  "createdAt" text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  "updatedAt" text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  -- 'admin' or 'student'. Anything that is not 'admin' is a student.
  role text not null default 'student',
  banned integer not null default 0,
  "banReason" text,
  "banExpires" text
);

-- Profiles ---------------------------------------------------------------

-- One row per user, created by the API when the account is created.
create table profiles (
  id text primary key references "user" (id) on delete cascade,
  full_name text not null default '',
  locale text not null default 'en',
  notes text not null default '',
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) strict;

-- `updated_at` follows every update that does not set it itself. The `when`
-- clause is also what keeps the trigger from firing on its own update.
create trigger profiles_touch after update on profiles
for each row when new.updated_at = old.updated_at
begin
  update profiles set updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') where id = new.id;
end;

-- Public site pages ------------------------------------------------------

create table pages (
  id text primary key default (lower(printf('%s-%s-4%s-%s%s-%s', hex(randomblob(4)), hex(randomblob(2)), substr(hex(randomblob(2)), 2), substr('89ab', 1 + (abs(random()) % 4), 1), substr(hex(randomblob(2)), 2), hex(randomblob(6))))),
  title text not null,
  path text not null unique,
  is_main integer not null default 0 check (is_main in (0, 1)),
  content text not null default '',
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) strict;
-- At most one main page.
create unique index pages_single_main on pages (is_main) where is_main = 1;

create trigger pages_touch after update on pages
for each row when new.updated_at = old.updated_at
begin
  update pages set updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') where id = new.id;
end;

create table page_texts (
  id text primary key default (lower(printf('%s-%s-4%s-%s%s-%s', hex(randomblob(4)), hex(randomblob(2)), substr(hex(randomblob(2)), 2), substr('89ab', 1 + (abs(random()) % 4), 1), substr(hex(randomblob(2)), 2), hex(randomblob(6))))),
  page_id text not null references pages (id) on delete cascade,
  key text not null,
  position integer not null default 0,
  unique (page_id, key)
) strict;

create table page_text_translations (
  text_id text not null references page_texts (id) on delete cascade,
  locale text not null,
  value text not null default '',
  position integer not null default 0,
  primary key (text_id, locale)
) strict;

-- One row per visitor per day. `visitor_hash` is a salted hash that changes
-- daily, so no IP address is stored and visitors cannot be followed across days.
create table page_views (
  day text not null,
  visitor_hash text not null,
  first_path text not null default '/',
  primary key (day, visitor_hash)
) strict;

-- H5P --------------------------------------------------------------------

-- The id is chosen by the API (it is also the storage prefix): no default.
create table h5p_content (
  id text primary key,
  title text not null,
  main_library text not null,
  storage_path text not null,
  size_bytes integer not null default 0,
  created_by text references "user" (id) on delete set null,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) strict;

create trigger h5p_content_touch after update on h5p_content
for each row when new.updated_at = old.updated_at
begin
  update h5p_content set updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') where id = new.id;
end;

-- Courses ----------------------------------------------------------------

create table courses (
  id text primary key default (lower(printf('%s-%s-4%s-%s%s-%s', hex(randomblob(4)), hex(randomblob(2)), substr(hex(randomblob(2)), 2), substr('89ab', 1 + (abs(random()) % 4), 1), substr(hex(randomblob(2)), 2), hex(randomblob(6))))),
  title text not null,
  slug text not null unique,
  summary text not null default '',
  description text not null default '',
  price_cents integer not null default 0 check (price_cents >= 0),
  currency text not null default 'eur',
  status text not null default 'draft' check (status in ('draft', 'published')),
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) strict;

create trigger courses_touch after update on courses
for each row when new.updated_at = old.updated_at
begin
  update courses set updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') where id = new.id;
end;

create table course_sections (
  id text primary key default (lower(printf('%s-%s-4%s-%s%s-%s', hex(randomblob(4)), hex(randomblob(2)), substr(hex(randomblob(2)), 2), substr('89ab', 1 + (abs(random()) % 4), 1), substr(hex(randomblob(2)), 2), hex(randomblob(6))))),
  course_id text not null references courses (id) on delete cascade,
  title text not null,
  position integer not null default 0
) strict;
create index course_sections_course on course_sections (course_id, position);

create table lessons (
  id text primary key default (lower(printf('%s-%s-4%s-%s%s-%s', hex(randomblob(4)), hex(randomblob(2)), substr(hex(randomblob(2)), 2), substr('89ab', 1 + (abs(random()) % 4), 1), substr(hex(randomblob(2)), 2), hex(randomblob(6))))),
  section_id text not null references course_sections (id) on delete cascade,
  title text not null,
  intro_text text not null default '',
  h5p_content_id text references h5p_content (id) on delete set null,
  position integer not null default 0
) strict;
create index lessons_section on lessons (section_id, position);
create index lessons_h5p on lessons (h5p_content_id);

-- Sales ------------------------------------------------------------------

create table orders (
  id text primary key default (lower(printf('%s-%s-4%s-%s%s-%s', hex(randomblob(4)), hex(randomblob(2)), substr(hex(randomblob(2)), 2), substr('89ab', 1 + (abs(random()) % 4), 1), substr(hex(randomblob(2)), 2), hex(randomblob(6))))),
  user_id text not null references "user" (id) on delete cascade,
  course_id text not null references courses (id) on delete restrict,
  amount_cents integer not null,
  currency text not null,
  provider text not null default 'stripe',
  stripe_session_id text unique,
  status text not null default 'pending' check (status in ('pending', 'paid', 'cancelled')),
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  paid_at text
) strict;
create index orders_paid on orders (paid_at desc) where status = 'paid';

create table enrollments (
  user_id text not null references "user" (id) on delete cascade,
  course_id text not null references courses (id) on delete restrict,
  order_id text references orders (id) on delete set null,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  primary key (user_id, course_id)
) strict;

create table lesson_progress (
  user_id text not null references "user" (id) on delete cascade,
  lesson_id text not null references lessons (id) on delete cascade,
  completed_at text,
  score real,
  max_score real,
  updated_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  primary key (user_id, lesson_id)
) strict;

-- Chat -------------------------------------------------------------------

-- One thread per student, between that student and the admin.
create table messages (
  id text primary key default (lower(printf('%s-%s-4%s-%s%s-%s', hex(randomblob(4)), hex(randomblob(2)), substr(hex(randomblob(2)), 2), substr('89ab', 1 + (abs(random()) % 4), 1), substr(hex(randomblob(2)), 2), hex(randomblob(6))))),
  student_id text not null references "user" (id) on delete cascade,
  sender text not null check (sender in ('admin', 'student')),
  body text not null,
  lesson_id text references lessons (id) on delete set null,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  read_at text,
  reminder_sent_at text
) strict;
create index messages_thread on messages (student_id, created_at);
create index messages_unread on messages (sender, created_at) where read_at is null;

create table email_log (
  id text primary key default (lower(printf('%s-%s-4%s-%s%s-%s', hex(randomblob(4)), hex(randomblob(2)), substr(hex(randomblob(2)), 2), substr('89ab', 1 + (abs(random()) % 4), 1), substr(hex(randomblob(2)), 2), hex(randomblob(6))))),
  to_user text references "user" (id) on delete set null,
  to_email text not null,
  subject text not null,
  kind text not null,
  sent_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) strict;

-- Seed: the main page always exists ----------------------------------------

insert into pages (title, path, is_main, content)
values (
  'SpeakUkrainian',
  '/',
  1,
  replace(
    '<!doctype html>\n<html lang="{{ locale }}">\n  <head>\n    <meta charset="utf-8" />\n    <meta name="viewport" content="width=device-width, initial-scale=1" />\n    <title>{{ title }}</title>\n  </head>\n  <body>\n    <h1>{{ header }}</h1>\n    <p>{{ intro }}</p>\n    <p><a href="{{ studentUrl }}">{{ classroom_link }}</a></p>\n  </body>\n</html>\n',
    '\n',
    char(10)
  )
);

insert into page_texts (page_id, key, position)
select p.id, t.column1, t.column2
from pages p, (values ('header', 0), ('intro', 1), ('classroom_link', 2)) as t
where p.is_main = 1;

insert into page_text_translations (text_id, locale, value, position)
select pt.id, v.column2, v.column3, v.column4
from page_texts pt
join pages p on p.id = pt.page_id and p.is_main = 1
join (values
  ('header', 'en', 'Learn Ukrainian', 0),
  ('header', 'es', 'Aprende ucraniano', 1),
  ('intro', 'en', 'Courses designed for the language you already speak.', 0),
  ('intro', 'es', 'Cursos diseñados para el idioma que ya hablas.', 1),
  ('classroom_link', 'en', 'Go to the student classroom', 0),
  ('classroom_link', 'es', 'Ir al aula del estudiante', 1)
) as v on v.column1 = pt.key;
