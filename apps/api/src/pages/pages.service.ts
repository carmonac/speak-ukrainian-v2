import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { PageDetail, PageSummary, PageText, SavePageInput } from '@speakukrainian/shared';
import {
  DatabaseService,
  isUniqueViolation,
  newId,
  type SqlStatement,
} from '../infra/db/database.service.js';

interface PageRow {
  id: string;
  title: string;
  path: string;
  /** 0 or 1. */
  is_main: number;
  content: string;
  updated_at: string;
}

interface TextRow {
  key: string;
  locale: string | null;
  value: string | null;
}

function toSummary(row: PageRow): PageSummary {
  return {
    id: row.id,
    title: row.title,
    path: row.path,
    isMain: row.is_main === 1,
    updatedAt: row.updated_at,
  };
}

const PAGE_COLUMNS = 'id, title, path, is_main, content, updated_at';

/** Pages of the public site: a Handlebars template plus its translatable texts. */
@Injectable()
export class PagesService {
  constructor(private readonly db: DatabaseService) {}

  /** Custom pages, newest first. The main page is listed separately by the panel. */
  async list(): Promise<PageSummary[]> {
    const rows = await this.db.rows<PageRow>(
      `select ${PAGE_COLUMNS} from pages order by is_main desc, title asc`,
    );
    return rows.map(toSummary);
  }

  async count(): Promise<number> {
    const row = await this.db.one<{ count: number }>('select count(*) as count from pages');
    return row?.count ?? 0;
  }

  async findById(id: string): Promise<PageDetail> {
    const row = await this.db.one<PageRow>(`select ${PAGE_COLUMNS} from pages where id = ?1`, [id]);
    if (!row) {
      throw new NotFoundException('That page does not exist.');
    }
    return this.withTexts(row);
  }

  async findMain(): Promise<PageDetail> {
    const row = await this.db.one<PageRow>(
      `select ${PAGE_COLUMNS} from pages where is_main = 1 limit 1`,
    );
    if (!row) {
      throw new NotFoundException('The main page is missing.');
    }
    return this.withTexts(row);
  }

  /** The page served at `path`, or null. `/` is always the main page. */
  async findByPath(path: string): Promise<PageDetail | null> {
    const row =
      path === '/'
        ? await this.db.one<PageRow>(`select ${PAGE_COLUMNS} from pages where is_main = 1 limit 1`)
        : await this.db.one<PageRow>(`select ${PAGE_COLUMNS} from pages where path = ?1`, [path]);
    return row ? this.withTexts(row) : null;
  }

  async create(input: SavePageInput): Promise<PageDetail> {
    const id = newId();
    await this.guardPath(async () => {
      await this.db.batch([
        {
          sql: 'insert into pages (id, title, path, content) values (?1, ?2, ?3, ?4)',
          params: [id, input.title, input.path, input.content],
        },
        ...textStatements(id, input.texts),
      ]);
    });
    return this.findById(id);
  }

  async update(id: string, input: SavePageInput): Promise<PageDetail> {
    const exists = await this.db.one('select 1 from pages where id = ?1', [id]);
    if (!exists) {
      throw new NotFoundException('That page does not exist.');
    }
    await this.guardPath(async () => {
      await this.db.batch([
        {
          sql: 'update pages set title = ?2, path = ?3, content = ?4 where id = ?1',
          params: [id, input.title, input.path, input.content],
        },
        // Texts are replaced wholesale: the form always sends the full list.
        { sql: 'delete from page_texts where page_id = ?1', params: [id] },
        ...textStatements(id, input.texts),
      ]);
    });
    return this.findById(id);
  }

  async remove(id: string): Promise<void> {
    const page = await this.db.one<{ is_main: number }>('select is_main from pages where id = ?1', [
      id,
    ]);
    if (!page) {
      throw new NotFoundException('That page does not exist.');
    }
    if (page.is_main === 1) {
      throw new ConflictException('The main page cannot be deleted.');
    }
    await this.db.query('delete from pages where id = ?1', [id]);
  }

  private async withTexts(row: PageRow): Promise<PageDetail> {
    const rows = await this.db.rows<TextRow>(
      `select t.key, tr.locale, tr.value
       from page_texts t
       left join page_text_translations tr on tr.text_id = t.id
       where t.page_id = ?1
       order by t.position, tr.position`,
      [row.id],
    );

    const texts = new Map<string, PageText>();
    for (const r of rows) {
      const text = texts.get(r.key) ?? { key: r.key, translations: [] };
      if (r.locale !== null) {
        text.translations.push({ locale: r.locale, value: r.value ?? '' });
      }
      texts.set(r.key, text);
    }

    return { ...toSummary(row), content: row.content, texts: [...texts.values()] };
  }

  private async guardPath<T>(work: () => Promise<T>): Promise<T> {
    try {
      return await work();
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException('Another page already uses that URL path.');
      }
      throw error;
    }
  }
}

/**
 * Inserts for a page's texts and their translations, to run in the same batch
 * as the write to the page. Ids are generated here: a batch cannot read one
 * back to use in the next statement.
 */
function textStatements(pageId: string, texts: PageText[]): SqlStatement[] {
  const statements: SqlStatement[] = [];
  for (const [position, text] of texts.entries()) {
    const textId = newId();
    statements.push({
      sql: 'insert into page_texts (id, page_id, key, position) values (?1, ?2, ?3, ?4)',
      params: [textId, pageId, text.key, position],
    });
    for (const [order, translation] of text.translations.entries()) {
      statements.push({
        sql: `insert into page_text_translations (text_id, locale, value, position)
              values (?1, ?2, ?3, ?4)`,
        params: [textId, translation.locale, translation.value, order],
      });
    }
  }
  return statements;
}
