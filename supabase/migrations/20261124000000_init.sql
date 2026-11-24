-- SpeakUkrainian initial schema.
--
-- Access model: the NestJS API is the only writer and reads with the service
-- role, which bypasses RLS. RLS is enabled on every table with no policy
-- (deny by default) so the anon/authenticated keys shipped to browsers can read
-- nothing — except `messages`, which both SPAs subscribe to through Realtime.

create extension if not exists pgcrypto;

create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

create or replace function public.is_admin() returns boolean
language sql stable as $$
  select coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'admin'
$$;

-- Profiles ---------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default '',
  locale text not null default 'en',
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', ''))
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Public site pages ------------------------------------------------------

create table public.pages (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  path text not null unique,
  is_main boolean not null default false,
  content text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index pages_single_main on public.pages (is_main) where is_main;
create trigger pages_touch before update on public.pages
  for each row execute function public.touch_updated_at();

create table public.page_texts (
  id uuid primary key default gen_random_uuid(),
  page_id uuid not null references public.pages (id) on delete cascade,
  key text not null,
  position int not null default 0,
  unique (page_id, key)
);

create table public.page_text_translations (
  text_id uuid not null references public.page_texts (id) on delete cascade,
  locale text not null,
  value text not null default '',
  position int not null default 0,
  primary key (text_id, locale)
);

-- One row per visitor per day. `visitor_hash` is a salted hash that changes
-- daily, so no IP address is stored and visitors cannot be followed across days.
create table public.page_views (
  day date not null,
  visitor_hash text not null,
  first_path text not null default '/',
  primary key (day, visitor_hash)
);

-- H5P --------------------------------------------------------------------

create table public.h5p_content (
  id uuid primary key,
  title text not null,
  main_library text not null,
  storage_path text not null,
  size_bytes bigint not null default 0,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger h5p_content_touch before update on public.h5p_content
  for each row execute function public.touch_updated_at();

-- Courses ----------------------------------------------------------------

create table public.courses (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  slug text not null unique,
  summary text not null default '',
  description text not null default '',
  price_cents int not null default 0 check (price_cents >= 0),
  currency text not null default 'eur',
  status text not null default 'draft' check (status in ('draft', 'published')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger courses_touch before update on public.courses
  for each row execute function public.touch_updated_at();

create table public.course_sections (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses (id) on delete cascade,
  title text not null,
  position int not null default 0
);
create index course_sections_course on public.course_sections (course_id, position);

create table public.lessons (
  id uuid primary key default gen_random_uuid(),
  section_id uuid not null references public.course_sections (id) on delete cascade,
  title text not null,
  intro_text text not null default '',
  h5p_content_id uuid references public.h5p_content (id) on delete set null,
  position int not null default 0
);
create index lessons_section on public.lessons (section_id, position);
create index lessons_h5p on public.lessons (h5p_content_id);

-- Sales ------------------------------------------------------------------

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  course_id uuid not null references public.courses (id) on delete restrict,
  amount_cents int not null,
  currency text not null,
  provider text not null default 'stripe',
  stripe_session_id text unique,
  status text not null default 'pending' check (status in ('pending', 'paid', 'cancelled')),
  created_at timestamptz not null default now(),
  paid_at timestamptz
);
create index orders_paid on public.orders (paid_at desc) where status = 'paid';

create table public.enrollments (
  user_id uuid not null references auth.users (id) on delete cascade,
  course_id uuid not null references public.courses (id) on delete restrict,
  order_id uuid references public.orders (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (user_id, course_id)
);

create table public.lesson_progress (
  user_id uuid not null references auth.users (id) on delete cascade,
  lesson_id uuid not null references public.lessons (id) on delete cascade,
  completed_at timestamptz,
  score numeric,
  max_score numeric,
  updated_at timestamptz not null default now(),
  primary key (user_id, lesson_id)
);

-- Chat -------------------------------------------------------------------

-- One thread per student, between that student and the admin.
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references auth.users (id) on delete cascade,
  sender text not null check (sender in ('admin', 'student')),
  body text not null,
  lesson_id uuid references public.lessons (id) on delete set null,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  reminder_sent_at timestamptz
);
create index messages_thread on public.messages (student_id, created_at);
create index messages_unread on public.messages (sender, created_at) where read_at is null;

create table public.email_log (
  id uuid primary key default gen_random_uuid(),
  to_user uuid references auth.users (id) on delete set null,
  to_email text not null,
  subject text not null,
  kind text not null,
  sent_at timestamptz not null default now()
);

-- Row level security -----------------------------------------------------

alter table public.profiles enable row level security;
alter table public.pages enable row level security;
alter table public.page_texts enable row level security;
alter table public.page_text_translations enable row level security;
alter table public.page_views enable row level security;
alter table public.h5p_content enable row level security;
alter table public.courses enable row level security;
alter table public.course_sections enable row level security;
alter table public.lessons enable row level security;
alter table public.orders enable row level security;
alter table public.enrollments enable row level security;
alter table public.lesson_progress enable row level security;
alter table public.messages enable row level security;
alter table public.email_log enable row level security;

-- Realtime delivers a change only to subscribers allowed to SELECT the row.
create policy messages_select_own on public.messages
  for select to authenticated
  using (student_id = (select auth.uid()) or public.is_admin());

alter publication supabase_realtime add table public.messages;

-- Seed: the main page always exists ----------------------------------------

with main as (
  insert into public.pages (title, path, is_main, content)
  values (
    'SpeakUkrainian',
    '/',
    true,
    E'<!doctype html>\n<html lang="{{ locale }}">\n  <head>\n    <meta charset="utf-8" />\n    <meta name="viewport" content="width=device-width, initial-scale=1" />\n    <title>{{ title }}</title>\n  </head>\n  <body>\n    <h1>{{ header }}</h1>\n    <p>{{ intro }}</p>\n    <p><a href="{{ studentUrl }}">{{ classroom_link }}</a></p>\n  </body>\n</html>\n'
  )
  returning id
), texts as (
  insert into public.page_texts (page_id, key, position)
  select main.id, t.key, t.position
  from main, (values ('header', 0), ('intro', 1), ('classroom_link', 2)) as t (key, position)
  returning id, key
)
insert into public.page_text_translations (text_id, locale, value, position)
select texts.id, v.locale, v.value, v.position
from texts
join (values
  ('header', 'en', 'Learn Ukrainian', 0),
  ('header', 'es', 'Aprende ucraniano', 1),
  ('intro', 'en', 'Courses designed for the language you already speak.', 0),
  ('intro', 'es', 'Cursos diseñados para el idioma que ya hablas.', 1),
  ('classroom_link', 'en', 'Go to the student classroom', 0),
  ('classroom_link', 'es', 'Ir al aula del estudiante', 1)
) as v (key, locale, value, position) on v.key = texts.key;
