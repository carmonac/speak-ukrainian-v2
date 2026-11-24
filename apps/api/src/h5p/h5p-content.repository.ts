import { Injectable } from '@nestjs/common';
import type {
  CreateH5pContentInput,
  H5pContent,
  ListH5pContentQuery,
  Page,
  UpdateH5pContentInput,
} from '@speakukrainian/shared';
import { DatabaseService } from '../infra/db/database.service.js';

interface H5pContentRow {
  id: string;
  title: string;
  main_library: string;
  storage_path: string;
  size_bytes: number;
  created_at: string;
  updated_at: string;
}

const COLUMNS = 'id, title, main_library, storage_path, size_bytes, created_at, updated_at';

function toContent(row: H5pContentRow): H5pContent {
  return {
    id: row.id,
    title: row.title,
    mainLibrary: row.main_library,
    storagePath: row.storage_path,
    sizeBytes: row.size_bytes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * The index of stored H5P exercises (the `h5p_content` table). The files
 * themselves live in object storage; a lesson points at a row here through
 * `lessons.h5p_content_id`.
 */
@Injectable()
export class H5pContentRepository {
  constructor(private readonly db: DatabaseService) {}

  async create(input: CreateH5pContentInput, actorId: string): Promise<H5pContent> {
    const row = await this.db.one<H5pContentRow>(
      `insert into h5p_content (id, title, main_library, storage_path, size_bytes, created_by)
       values (?1, ?2, ?3, ?4, ?5, ?6)
       returning ${COLUMNS}`,
      [input.id, input.title, input.mainLibrary, input.storagePath, input.sizeBytes, actorId],
    );
    return toContent(row!);
  }

  async update(
    id: string,
    input: UpdateH5pContentInput,
    _actorId: string,
  ): Promise<H5pContent | null> {
    const row = await this.db.one<H5pContentRow>(
      `update h5p_content set title = ?2, main_library = ?3, size_bytes = ?4
       where id = ?1
       returning ${COLUMNS}`,
      [id, input.title, input.mainLibrary, input.sizeBytes],
    );
    return row ? toContent(row) : null;
  }

  async findById(id: string): Promise<H5pContent | null> {
    if (!isUuid(id)) {
      return null;
    }
    const row = await this.db.one<H5pContentRow>(
      `select ${COLUMNS} from h5p_content where id = ?1`,
      [id],
    );
    return row ? toContent(row) : null;
  }

  async exists(id: string): Promise<boolean> {
    if (!isUuid(id)) {
      return false;
    }
    return (await this.db.one('select 1 from h5p_content where id = ?1', [id])) !== null;
  }

  async delete(id: string): Promise<void> {
    await this.db.query('delete from h5p_content where id = ?1', [id]);
  }

  async list(query: ListH5pContentQuery): Promise<Page<H5pContent>> {
    const [rows, total] = await Promise.all([
      this.db.rows<H5pContentRow>(
        `select ${COLUMNS} from h5p_content order by created_at desc limit ?1 offset ?2`,
        [query.limit, query.offset],
      ),
      this.db.one<{ count: number }>('select count(*) as count from h5p_content'),
    ]);
    return { items: rows.map(toContent), total: total?.count ?? 0 };
  }

  /**
   * Whether `userId` may play `contentId`: it is attached to a lesson of a
   * course that user is enrolled in.
   */
  async isPlayableBy(contentId: string, userId: string): Promise<boolean> {
    if (!isUuid(contentId)) {
      return false;
    }
    const row = await this.db.one(
      `select 1
       from lessons l
       join course_sections s on s.id = l.section_id
       join enrollments e on e.course_id = s.course_id
       where l.h5p_content_id = ?1 and e.user_id = ?2
       limit 1`,
      [contentId, userId],
    );
    return row !== null;
  }
}

/** Ids are UUIDs; anything else cannot match a row, so the query is skipped. */
function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}
