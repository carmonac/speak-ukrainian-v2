import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  idSchema,
  previewPageSchema,
  savePageSchema,
  type PageDetail,
  type PageSummary,
  type PreviewPageInput,
  type SavePageInput,
} from '@speakukrainian/shared';
import { Roles } from '../auth/roles.decorator.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import type { Env } from '../config/configuration.js';
import { PageCache } from '../site/page-cache.js';
import { PREVIEW_ROUTE } from '../site/preview.controller.js';
import { PreviewStore, withPreviewBanner } from '../site/preview.js';
import { SiteRenderer } from '../site/site.renderer.js';
import { PagesService } from './pages.service.js';

@ApiTags('pages')
@ApiBearerAuth()
@Roles('admin')
@Controller('admin/pages')
export class PagesController {
  private readonly siteUrl: string;

  constructor(
    private readonly pages: PagesService,
    private readonly renderer: SiteRenderer,
    private readonly cache: PageCache,
    private readonly previews: PreviewStore,
    config: ConfigService<Env, true>,
  ) {
    this.siteUrl = config.get('PUBLIC_SITE_URL', { infer: true }).replace(/\/$/, '');
  }

  @Get()
  list(): Promise<PageSummary[]> {
    return this.pages.list();
  }

  @Get('main')
  main(): Promise<PageDetail> {
    return this.pages.findMain();
  }

  /**
   * Renders unsaved content and returns a link that shows it, with a banner,
   * in a tab of its own. Nothing is stored in the database; the link works for
   * a few minutes. It is on the public site's origin, not the panel's, and is
   * served sandboxed: see `PreviewController`.
   */
  @Post('preview-link')
  @HttpCode(HttpStatus.OK)
  previewLink(@Body(new ZodValidationPipe(previewPageSchema)) body: PreviewPageInput): {
    url: string;
  } {
    const { html } = this.renderer.renderSafely(
      { title: body.title, path: '/preview', content: body.content, texts: body.texts },
      [body.locale],
    );
    const token = this.previews.add(withPreviewBanner(html));
    return { url: `${this.siteUrl}/api/${PREVIEW_ROUTE}/${token}` };
  }

  @Get(':id')
  findOne(@Param('id', new ZodValidationPipe(idSchema)) id: string): Promise<PageDetail> {
    return this.pages.findById(id);
  }

  @Post()
  async create(
    @Body(new ZodValidationPipe(savePageSchema)) body: SavePageInput,
  ): Promise<PageDetail> {
    const page = await this.pages.create(body);
    this.publish();
    return page;
  }

  @Put(':id')
  async update(
    @Param('id', new ZodValidationPipe(idSchema)) id: string,
    @Body(new ZodValidationPipe(savePageSchema)) body: SavePageInput,
  ): Promise<PageDetail> {
    const page = await this.pages.update(id, body);
    this.publish();
    return page;
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id', new ZodValidationPipe(idSchema)) id: string): Promise<void> {
    await this.pages.remove(id);
    this.publish();
  }

  /**
   * Makes a change to the pages visible on the public site at once: the site
   * serves pages from memory (`PageCache`) and keeps compiled templates.
   */
  private publish(): void {
    this.renderer.invalidate();
    this.cache.clear();
  }
}
