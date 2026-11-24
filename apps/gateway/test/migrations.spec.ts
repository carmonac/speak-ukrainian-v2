/**
 * Loads the D1 migrations into an in-memory SQLite database and checks what
 * the API relies on. D1 is SQLite, so this catches schema mistakes without
 * wrangler or the network.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { beforeEach, describe, expect, it } from 'vitest';

const MIGRATIONS_DIR = new URL('../migrations/', import.meta.url);

const APPLICATION_TABLES = [
  'course_sections',
  'courses',
  'email_log',
  'enrollments',
  'h5p_content',
  'lesson_progress',
  'lessons',
  'messages',
  'orders',
  'page_text_translations',
  'page_texts',
  'page_views',
  'pages',
  'profiles',
];

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

let db: DatabaseSync;

function all<T = Record<string, unknown>>(sql: string, ...params: (string | number | null)[]): T[] {
  return db.prepare(sql).all(...params) as T[];
}

function one<T = Record<string, unknown>>(sql: string, ...params: (string | number | null)[]): T {
  const row = db.prepare(sql).get(...params);
  if (!row) throw new Error(`No row for: ${sql}`);
  return row as T;
}

function addUser(id: string): void {
  db.prepare('insert into "user" (id, email) values (?, ?)').run(id, `${id}@example.com`);
}

beforeEach(() => {
  db = new DatabaseSync(':memory:');
  // D1 enforces foreign keys; plain SQLite needs to be told.
  db.exec('pragma foreign_keys = on');
  for (const file of readdirSync(MIGRATIONS_DIR).sort()) {
    if (file.endsWith('.sql')) db.exec(readFileSync(new URL(file, MIGRATIONS_DIR), 'utf8'));
  }
});

describe('schema', () => {
  it('creates the user table and the 14 application tables', () => {
    const names = all<{ name: string }>(
      "select name from sqlite_master where type = 'table' and name not like 'sqlite_%' order by name",
    ).map((r) => r.name);
    expect(names).toEqual([...APPLICATION_TABLES, 'user'].sort());
  });

  it('makes every application table strict', () => {
    const strict = all<{ name: string; strict: number }>('pragma table_list')
      .filter((t) => APPLICATION_TABLES.includes(t.name))
      .map((t) => [t.name, t.strict]);
    expect(strict).toHaveLength(APPLICATION_TABLES.length);
    expect(strict.every(([, isStrict]) => isStrict === 1)).toBe(true);
  });

  it('rejects a value of the wrong type', () => {
    expect(() =>
      db.exec("insert into courses (title, slug, price_cents) values ('A', 'a', 'free')"),
    ).toThrow(/cannot store TEXT value in INTEGER column/);
  });

  it('defaults ids to UUIDs and timestamps to ISO 8601 UTC', () => {
    db.exec("insert into courses (title, slug) values ('A', 'a')");
    const course = one<{ id: string; created_at: string; updated_at: string }>(
      'select id, created_at, updated_at from courses',
    );
    expect(course.id).toMatch(UUID_V4);
    expect(course.created_at).toMatch(ISO);
    expect(new Date(course.created_at).toISOString()).toBe(course.created_at);
  });

  it('generates a different id for every row', () => {
    db.exec("insert into courses (title, slug) values ('A', 'a'), ('B', 'b'), ('C', 'c')");
    const ids = all<{ id: string }>('select id from courses').map((r) => r.id);
    expect(new Set(ids).size).toBe(3);
  });
});

describe('constraints', () => {
  it('allows only one main page', () => {
    expect(() =>
      db.exec("insert into pages (title, path, is_main) values ('Other', '/other', 1)"),
    ).toThrow(/UNIQUE constraint failed: pages.is_main/);
    // Any number of non-main pages is fine.
    db.exec("insert into pages (title, path) values ('A', '/a'), ('B', '/b')");
  });

  it('keeps page paths and course slugs unique', () => {
    expect(() => db.exec("insert into pages (title, path) values ('Dup', '/')")).toThrow(
      /UNIQUE constraint failed: pages.path/,
    );
    db.exec("insert into courses (title, slug) values ('A', 'a')");
    expect(() => db.exec("insert into courses (title, slug) values ('B', 'a')")).toThrow(
      /UNIQUE constraint failed: courses.slug/,
    );
  });

  it('enforces the status, sender, price and boolean checks', () => {
    expect(() =>
      db.exec("insert into courses (title, slug, status) values ('A', 'a', 'archived')"),
    ).toThrow(/CHECK constraint failed/);
    expect(() =>
      db.exec("insert into courses (title, slug, price_cents) values ('A', 'a', -1)"),
    ).toThrow(/CHECK constraint failed/);
    expect(() => db.exec("insert into pages (title, path, is_main) values ('A', '/a', 2)")).toThrow(
      /CHECK constraint failed/,
    );
    addUser('u1');
    expect(() =>
      db.exec("insert into messages (student_id, sender, body) values ('u1', 'bot', 'hi')"),
    ).toThrow(/CHECK constraint failed/);
  });

  it('requires an existing user for per-user rows', () => {
    expect(() => db.exec("insert into profiles (id) values ('ghost')")).toThrow(
      /FOREIGN KEY constraint failed/,
    );
  });

  it('cascades or clears rows when a user is deleted', () => {
    addUser('u1');
    db.exec(`
      insert into profiles (id, full_name) values ('u1', 'Ana');
      insert into messages (student_id, sender, body) values ('u1', 'student', 'hi');
      insert into email_log (to_user, to_email, subject, kind) values ('u1', 'a@b.c', 's', 'k');
      insert into h5p_content (id, title, main_library, storage_path, created_by)
        values ('h1', 'T', 'H5P.X 1.0', 'h5p/content/h1', 'u1');
    `);
    db.exec(`delete from "user" where id = 'u1'`);
    expect(one<{ n: number }>('select count(*) as n from profiles').n).toBe(0);
    expect(one<{ n: number }>('select count(*) as n from messages').n).toBe(0);
    expect(one('select to_user from email_log')).toEqual({ to_user: null });
    expect(one('select created_by from h5p_content')).toEqual({ created_by: null });
  });

  it('refuses to delete a course that has orders, and cascades its sections and lessons', () => {
    addUser('u1');
    db.exec(`
      insert into courses (id, title, slug) values ('c1', 'A', 'a'), ('c2', 'B', 'b');
      insert into course_sections (id, course_id, title) values ('s1', 'c2', 'S');
      insert into lessons (id, section_id, title) values ('l1', 's1', 'L');
      insert into orders (user_id, course_id, amount_cents, currency) values ('u1', 'c1', 100, 'eur');
    `);
    expect(() => db.exec("delete from courses where id = 'c1'")).toThrow(
      /FOREIGN KEY constraint failed/,
    );
    db.exec("delete from courses where id = 'c2'");
    expect(one<{ n: number }>('select count(*) as n from lessons').n).toBe(0);
  });

  it('has the partial indexes', () => {
    const partial = all<{ name: string; sql: string }>(
      "select name, sql from sqlite_master where type = 'index' and sql like '% where %' order by name",
    ).map((r) => r.name);
    expect(partial).toEqual(['messages_unread', 'orders_paid', 'pages_single_main']);
  });
});

describe('updated_at', () => {
  const OLD = '2020-01-01T00:00:00.000Z';

  it.each([
    ['pages', "insert into pages (id, title, path) values ('x', 'T', '/t')", 'title'],
    ['courses', "insert into courses (id, title, slug) values ('x', 'T', 't')", 'title'],
    [
      'h5p_content',
      "insert into h5p_content (id, title, main_library, storage_path) values ('x', 'T', 'L', 'p')",
      'title',
    ],
    ['profiles', "insert into profiles (id) values ('x')", 'full_name'],
  ])('is refreshed when a %s row is updated', (table, insert, column) => {
    addUser('x');
    db.exec(insert);
    db.prepare(`update ${table} set updated_at = ? where id = 'x'`).run(OLD);
    expect(one(`select updated_at from ${table} where id = 'x'`)).toEqual({ updated_at: OLD });

    db.exec(`update ${table} set ${column} = 'changed' where id = 'x'`);
    const { updated_at } = one<{ updated_at: string }>(
      `select updated_at from ${table} where id = 'x'`,
    );
    expect(updated_at).toMatch(ISO);
    expect(updated_at > OLD).toBe(true);
  });

  it('keeps a value the statement sets explicitly', () => {
    db.exec("insert into courses (id, title, slug) values ('x', 'T', 't')");
    db.prepare("update courses set title = 'n', updated_at = ? where id = 'x'").run(OLD);
    expect(one("select updated_at from courses where id = 'x'")).toEqual({ updated_at: OLD });
  });
});

describe('seed', () => {
  it('creates the main page with its template', () => {
    const pages = all<{
      id: string;
      title: string;
      path: string;
      is_main: number;
      content: string;
    }>('select id, title, path, is_main, content from pages');
    expect(pages).toHaveLength(1);
    const [page] = pages;
    expect(page).toMatchObject({ title: 'SpeakUkrainian', path: '/', is_main: 1 });
    expect(page?.id).toMatch(UUID_V4);
    expect(page?.content).toBe(
      [
        '<!doctype html>',
        '<html lang="{{ locale }}">',
        '  <head>',
        '    <meta charset="utf-8" />',
        '    <meta name="viewport" content="width=device-width, initial-scale=1" />',
        '    <title>{{ title }}</title>',
        '  </head>',
        '  <body>',
        '    <h1>{{ header }}</h1>',
        '    <p>{{ intro }}</p>',
        '    <p><a href="{{ studentUrl }}">{{ classroom_link }}</a></p>',
        '  </body>',
        '</html>',
        '',
      ].join('\n'),
    );
  });

  it('creates its texts and translations', () => {
    const rows = all(
      `select pt.key, pt.position as text_position, t.locale, t.value, t.position
       from page_texts pt
       join page_text_translations t on t.text_id = pt.id
       order by pt.position, t.position`,
    );
    expect(rows).toEqual([
      { key: 'header', text_position: 0, locale: 'en', value: 'Learn Ukrainian', position: 0 },
      { key: 'header', text_position: 0, locale: 'es', value: 'Aprende ucraniano', position: 1 },
      {
        key: 'intro',
        text_position: 1,
        locale: 'en',
        value: 'Courses designed for the language you already speak.',
        position: 0,
      },
      {
        key: 'intro',
        text_position: 1,
        locale: 'es',
        value: 'Cursos diseñados para el idioma que ya hablas.',
        position: 1,
      },
      {
        key: 'classroom_link',
        text_position: 2,
        locale: 'en',
        value: 'Go to the student classroom',
        position: 0,
      },
      {
        key: 'classroom_link',
        text_position: 2,
        locale: 'es',
        value: 'Ir al aula del estudiante',
        position: 1,
      },
    ]);
  });
});

describe('what was left behind', () => {
  it('has no trace of Postgres or Supabase constructs', () => {
    const sql = readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith('.sql'))
      .map((f) => readFileSync(new URL(f, MIGRATIONS_DIR), 'utf8'))
      .join('\n')
      // Comments may mention where the schema came from.
      .replace(/--.*$/gm, '');
    expect(sql).not.toMatch(
      /auth\.|row level security|create policy|publication|plpgsql|public\./i,
    );
  });
});
