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
import { SiteRenderer } from '../site/site.renderer.js';
import { PagesService } from './pages.service.js';

@ApiTags('pages')
@ApiBearerAuth()
@Roles('admin')
@Controller('admin/pages')
export class PagesController {
  constructor(
    private readonly pages: PagesService,
    private readonly renderer: SiteRenderer,
  ) {}

  @Get()
  list(): Promise<PageSummary[]> {
    return this.pages.list();
  }

  @Get('main')
  main(): Promise<PageDetail> {
    return this.pages.findMain();
  }

  /** Renders unsaved content the way the public site would, for the editor's preview. */
  @Post('preview')
  @HttpCode(HttpStatus.OK)
  preview(@Body(new ZodValidationPipe(previewPageSchema)) body: PreviewPageInput): {
    html: string;
  } {
    return {
      html: this.renderer.renderSafely(
        { title: body.title, path: '/preview', content: body.content, texts: body.texts },
        [body.locale],
      ).html,
    };
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
    this.renderer.invalidate();
    return page;
  }

  @Put(':id')
  async update(
    @Param('id', new ZodValidationPipe(idSchema)) id: string,
    @Body(new ZodValidationPipe(savePageSchema)) body: SavePageInput,
  ): Promise<PageDetail> {
    const page = await this.pages.update(id, body);
    this.renderer.invalidate();
    return page;
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id', new ZodValidationPipe(idSchema)) id: string): Promise<void> {
    await this.pages.remove(id);
    this.renderer.invalidate();
  }
}
