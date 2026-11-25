import { Inject, Injectable } from '@nestjs/common';
import type { PageDetail } from '@speakukrainian/shared';
import { CLOCK, type Clock } from '../infra/clock/clock.tokens.js';
import { PagesService } from '../pages/pages.service.js';

/** How long a page is served from memory before the database is asked again. */
export const PAGE_TTL_MS = 60_000;

/**
 * How long "there is no page at this path" is remembered. Shorter than a
 * page's: a path that does not exist yet is the one case where the next edit
 * is likely to be exactly about it.
 */
export const MISSING_PAGE_TTL_MS = 30_000;

/**
 * Upper bound on remembered paths, found or not. Paths come straight from
 * URLs, so without a bound anyone could grow the cache by requesting made-up
 * addresses.
 */
export const MAX_CACHED_PAGES = 500;

interface Entry {
  /** `null` remembers that no page lives at the path. */
  page: PageDetail | null;
  expiresAt: number;
}

/**
 * The public site's memory of its pages.
 *
 * A page changes only when the administrator saves or deletes one, while every
 * visit used to read it from the database (two queries through the gateway).
 * `SiteService` reads pages through here instead; the control panel does not,
 * so what the administrator sees is always what is stored.
 *
 * Two things keep it truthful:
 *   - `clear()` is called by `PagesController` after every create, update and
 *     delete. Everything is dropped rather than the edited page alone, because
 *     one edit can change what several paths answer: renaming a path frees the
 *     old one, and making a page the main one changes `/`.
 *   - Entries expire on their own after a short time. Today there is a single
 *     API instance; if there were several, `clear()` would only reach the one
 *     that handled the edit, and the expiry is what bounds how long the others
 *     could be wrong.
 */
@Injectable()
export class PageCache {
  private readonly entries = new Map<string, Entry>();
  /** Loads in progress, so simultaneous first visits to a path share one. */
  private readonly loading = new Map<string, Promise<PageDetail | null>>();
  /** Bumped by `clear()`: a load that began before it must not be stored. */
  private generation = 0;

  constructor(
    private readonly pages: PagesService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /** The page served at `path` (already normalised by the caller), or null. */
  async get(path: string): Promise<PageDetail | null> {
    const now = this.clock.now();
    const cached = this.entries.get(path);
    if (cached && cached.expiresAt > now) {
      return cached.page;
    }

    const inFlight = this.loading.get(path);
    if (inFlight) {
      return inFlight;
    }

    const generation = this.generation;
    const load = this.pages
      .findByPath(path)
      .then((page) => {
        if (generation === this.generation) {
          this.store(path, page);
        }
        return page;
      })
      .finally(() => {
        // Only if it is still ours: `clear()` may have replaced it meanwhile.
        if (this.loading.get(path) === load) {
          this.loading.delete(path);
        }
      });
    this.loading.set(path, load);
    return load;
  }

  /** Forgets everything. Called after any page is created, changed or deleted. */
  clear(): void {
    this.generation += 1;
    this.entries.clear();
    // Loads still running were started against the old data: new visits must
    // not join them.
    this.loading.clear();
  }

  /** Number of remembered paths; for tests and diagnostics. */
  get size(): number {
    return this.entries.size;
  }

  private store(path: string, page: PageDetail | null): void {
    // Re-inserting moves the path to the end, so the first key is always the
    // one stored longest ago.
    this.entries.delete(path);
    this.entries.set(path, {
      page,
      expiresAt: this.clock.now() + (page ? PAGE_TTL_MS : MISSING_PAGE_TTL_MS),
    });
    while (this.entries.size > MAX_CACHED_PAGES) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) {
        break;
      }
      this.entries.delete(oldest);
    }
  }
}
