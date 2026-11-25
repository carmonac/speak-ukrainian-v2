import { createHash } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NextFunction, Request, Response } from 'express';
import { RESERVED_PAGE_PATH_PREFIXES } from '@speakukrainian/shared';
import type { Env } from '../config/configuration.js';
import { DatabaseService } from '../infra/db/database.service.js';
import { FAVICON_ICO, FAVICON_SVG } from './favicon.js';
import { PageCache } from './page-cache.js';
import { preferredLocales } from './site.locale.js';
import { SiteRenderer } from './site.renderer.js';

/** The site's icon, at the two paths browsers look for one. */
const ICONS: Record<string, { type: string; body: Buffer | string }> = {
  '/favicon.ico': { type: 'image/x-icon', body: FAVICON_ICO },
  '/favicon.svg': { type: 'image/svg+xml', body: FAVICON_SVG },
};

const BOT_PATTERN = /bot|crawl|spider|slurp|preview|monitor|curl|wget|headless/i;

/**
 * Serves the public site: every GET outside `/api` is looked up as a page and
 * rendered for the visitor's browser language.
 */
@Injectable()
export class SiteService {
  private readonly logger = new Logger(SiteService.name);
  private readonly salt: string;

  constructor(
    private readonly pages: PageCache,
    private readonly renderer: SiteRenderer,
    private readonly db: DatabaseService,
    config: ConfigService<Env, true>,
  ) {
    this.salt = config.get('H5P_URL_TOKEN_SECRET', { infer: true });
  }

  /** Express middleware; mounted in `main.ts` ahead of the Nest router. */
  middleware = (req: Request, res: Response, next: NextFunction): void => {
    const icon = req.method === 'GET' || req.method === 'HEAD' ? ICONS[req.path] : undefined;
    if (icon) {
      // Every browser asks for /favicon.ico on its own, so the pages written
      // in the panel get the icon without having to link it.
      res.setHeader('Cache-Control', 'public, max-age=86400');
      res.type(icon.type).send(icon.body);
      return;
    }
    if (
      (req.method !== 'GET' && req.method !== 'HEAD') ||
      RESERVED_PAGE_PATH_PREFIXES.some((p) => req.path === p || req.path.startsWith(`${p}/`))
    ) {
      next();
      return;
    }
    this.serve(req, res).catch(next);
  };

  private async serve(req: Request, res: Response): Promise<void> {
    // `/about/` and `/About` are the same page as `/about`.
    const path = req.path.length > 1 ? req.path.replace(/\/+$/, '').toLowerCase() : '/';
    const override = typeof req.query['lang'] === 'string' ? req.query['lang'] : undefined;
    const locales = preferredLocales(req.headers['accept-language'], override);

    res.setHeader('Vary', 'Accept-Language');
    // Always revalidated by the browser and by Cloudflare, so an edit in the
    // panel is visible on the next load. What makes a visit cheap is the page
    // cache below, which the panel can empty; a copy held by a browser or the
    // CDN is one it could not.
    res.setHeader('Cache-Control', 'no-cache');

    const page = await this.pages.get(path);
    if (!page) {
      res.status(404).type('html').send(this.renderer.notFoundPage());
      return;
    }

    const result = this.renderer.renderSafely(page, locales);
    res.setHeader('Content-Language', locales[0] ?? 'en');
    res
      .status(result.ok ? 200 : 500)
      .type('html')
      .send(result.html);

    if (result.ok) {
      this.recordVisit(req, path);
    }
  }

  /**
   * Counts a unique visitor for today without storing anything that identifies
   * them: the row is a hash of day + secret + IP + user agent, so it cannot be
   * reversed to an address and does not match the same visitor tomorrow.
   */
  private recordVisit(req: Request, path: string): void {
    const userAgent = req.headers['user-agent'] ?? '';
    if (userAgent === '' || BOT_PATTERN.test(userAgent)) {
      return;
    }
    const day = new Date().toISOString().slice(0, 10);
    const hash = createHash('sha256')
      .update(`${day}|${this.salt}|${req.ip ?? ''}|${userAgent}`)
      .digest('hex');

    this.db
      .query(
        `insert into page_views (day, visitor_hash, first_path) values (?1, ?2, ?3)
         on conflict do nothing`,
        [day, hash, path],
      )
      .catch((error: unknown) => this.logger.warn(`Could not record a visit: ${String(error)}`));
  }
}
