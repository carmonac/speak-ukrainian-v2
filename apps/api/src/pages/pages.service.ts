import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { PageDetail, PageSummary, PageText, SavePageInput } from '@speakukrainian/shared';
import {
  DatabaseService,
  isUniqueViolation,
  type Queryable,
} from '../infra/db/database.service.js';

interface PageRow {
  id: string;
  title: string;
  path: string;
  is_main: boolean;
  content: string;
  updated_at: Date;
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
    isMain: row.is_main,
    updatedAt: row.updated_at.toISOString(),
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
      `select ${PAGE_COLUMNS} from public.pages order by is_main desc, title asc`,
    );
    return rows.map(toSummary);
  }

  async count(): Promise<number> {
    const row = await this.db.one<{ count: string }>('select count(*) from public.pages');
    return Number(row?.count ?? 0);
  }

  async findById(id: string): Promise<PageDetail> {
    const row = await this.db.one<PageRow>(
      `select ${PAGE_COLUMNS} from public.pages where id = $1`,
      [id],
    );
    if (!row) {
      throw new NotFoundException('That page does not exist.');
    }
    return this.withTexts(row);
  }

  async findMain(): Promise<PageDetail> {
    const row = await this.db.one<PageRow>(
      `select ${PAGE_COLUMNS} from public.pages where is_main limit 1`,
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
        ? await this.db.one<PageRow>(
            `select ${PAGE_COLUMNS} from public.pages where is_main limit 1`,
          )
        : await this.db.one<PageRow>(`select ${PAGE_COLUMNS} from public.pages where path = $1`, [
            path,
          ]);
    return row ? this.withTexts(row) : null;
  }

  async create(input: SavePageInput): Promise<PageDetail> {
    const id = await this.guardPath(() =>
      this.db.transaction(async (tx) => {
        const created = await tx.query<{ id: string }>(
          `insert into public.pages (title, path, content) values ($1, $2, $3) returning id`,
          [input.title, input.path, input.content],
        );
        const pageId = created.rows[0]!.id;
        await this.writeTexts(tx, pageId, input.texts);
        return pageId;
      }),
    );
    return this.findById(id);
  }

  async update(id: string, input: SavePageInput): Promise<PageDetail> {
    await this.guardPath(() =>
      this.db.transaction(async (tx) => {
        const updated = await tx.query(
          `update public.pages set title = $2, path = $3, content = $4 where id = $1`,
          [id, input.title, input.path, input.content],
        );
        if (updated.rowCount === 0) {
          throw new NotFoundException('That page does not exist.');
        }
        // Texts are replaced wholesale: the form always sends the full list.
        await tx.query('delete from public.page_texts where page_id = $1', [id]);
        await this.writeTexts(tx, id, input.texts);
      }),
    );
    return this.findById(id);
  }

  async remove(id: string): Promise<void> {
    const page = await this.db.one<{ is_main: boolean }>(
      'select is_main from public.pages where id = $1',
      [id],
    );
    if (!page) {
      throw new NotFoundException('That page does not exist.');
    }
    if (page.is_main) {
      throw new ConflictException('The main page cannot be deleted.');
    }
    await this.db.query('delete from public.pages where id = $1', [id]);
  }

  private async writeTexts(tx: Queryable, pageId: string, texts: PageText[]): Promise<void> {
    for (const [position, text] of texts.entries()) {
      const inserted = await tx.query<{ id: string }>(
        `insert into public.page_texts (page_id, key, position) values ($1, $2, $3) returning id`,
        [pageId, text.key, position],
      );
      const textId = inserted.rows[0]!.id;
      for (const [order, translation] of text.translations.entries()) {
        await tx.query(
          `insert into public.page_text_translations (text_id, locale, value, position)
           values ($1, $2, $3, $4)`,
          [textId, translation.locale, translation.value, order],
        );
      }
    }
  }

  private async withTexts(row: PageRow): Promise<PageDetail> {
    const rows = await this.db.rows<TextRow>(
      `select t.key, tr.locale, tr.value
       from public.page_texts t
       left join public.page_text_translations tr on tr.text_id = t.id
       where t.page_id = $1
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
