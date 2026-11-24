import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Handlebars from 'handlebars';
import { FALLBACK_LOCALE, resolveTranslation, type PageText } from '@speakukrainian/shared';
import type { Env } from '../config/configuration.js';

export interface RenderablePage {
  title: string;
  path: string;
  content: string;
  texts: PageText[];
}

export interface RenderResult {
  html: string;
  /** False when the template failed and the error page was produced instead. */
  ok: boolean;
}

/** Names the renderer provides itself; a page text with the same name is ignored. */
export const BUILT_IN_TEMPLATE_VARIABLES = [
  'title',
  'locale',
  'path',
  'studentUrl',
  'siteUrl',
  'year',
] as const;

const MAX_CACHED_TEMPLATES = 200;

/**
 * Turns a page (Handlebars template + translatable texts) into HTML for one
 * visitor language.
 *
 * Every text is available in the template under its name — `{{ header }}` —
 * resolved to the visitor's language with English as the fallback. Values are
 * HTML-escaped by `{{ }}`; the administrator can opt out per use with
 * `{{{ }}}` when a text deliberately contains markup.
 */
@Injectable()
export class SiteRenderer {
  private readonly logger = new Logger(SiteRenderer.name);
  private readonly handlebars = Handlebars.create();
  private readonly compiled = new Map<string, Handlebars.TemplateDelegate>();
  private readonly studentUrl: string;
  private readonly siteUrl: string;

  constructor(config: ConfigService<Env, true>) {
    this.studentUrl = config.get('STUDENT_APP_URL', { infer: true }).replace(/\/$/, '');
    this.siteUrl = config.get('PUBLIC_SITE_URL', { infer: true }).replace(/\/$/, '');
  }

  /** Drops compiled templates; called whenever a page is saved or deleted. */
  invalidate(): void {
    this.compiled.clear();
  }

  /** Throws if the template is invalid. */
  render(page: RenderablePage, locales: ReadonlyArray<string>): string {
    const template = this.templateFor(page.content);
    const locale = locales[0] ?? FALLBACK_LOCALE;

    const texts: Record<string, string> = {};
    for (const text of page.texts) {
      texts[text.key] = resolveTranslation(text.translations, locales, FALLBACK_LOCALE);
    }

    return template(
      {
        ...texts,
        // Built-ins last so a text cannot shadow them.
        title: page.title,
        locale,
        path: page.path,
        studentUrl: this.studentUrl,
        siteUrl: this.siteUrl,
        year: new Date().getFullYear(),
      },
      // Templates only ever see plain data; nothing reaches object prototypes.
      { allowProtoPropertiesByDefault: false, allowProtoMethodsByDefault: false },
    );
  }

  /** Like `render`, but a broken template yields a plain error page instead of throwing. */
  renderSafely(page: RenderablePage, locales: ReadonlyArray<string>): RenderResult {
    try {
      return { html: this.render(page, locales), ok: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Template of "${page.path}" failed to render: ${message}`);
      return { html: errorPage('This page could not be displayed', message), ok: false };
    }
  }

  notFoundPage(): string {
    return errorPage('Page not found', 'The page you are looking for does not exist.');
  }

  private templateFor(source: string): Handlebars.TemplateDelegate {
    const cached = this.compiled.get(source);
    if (cached) {
      return cached;
    }
    const template = this.handlebars.compile(source);
    if (this.compiled.size >= MAX_CACHED_TEMPLATES) {
      this.compiled.clear();
    }
    this.compiled.set(source, template);
    return template;
  }
}

function errorPage(heading: string, detail: string): string {
  const escape = Handlebars.escapeExpression;
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="robots" content="noindex" />
    <title>${escape(heading)}</title>
    <style>
      body { font-family: system-ui, sans-serif; margin: 15vh auto; max-width: 36rem; padding: 0 1.5rem; color: #1f2933; }
      pre { white-space: pre-wrap; background: #f4f5f7; padding: 1rem; border-radius: 6px; }
    </style>
  </head>
  <body>
    <h1>${escape(heading)}</h1>
    <pre>${escape(detail)}</pre>
    <p><a href="/">Back to the home page</a></p>
  </body>
</html>
`;
}
