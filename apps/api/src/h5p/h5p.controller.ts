import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UploadedFile,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  h5pContentIdSchema,
  h5pSaveResultSchema,
  listH5pContentQuerySchema,
  type H5pContent,
  type H5pSaveResult,
  type ListH5pContentQuery,
  type Page,
} from '@speakukrainian/shared';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/authenticated-user.js';
import { Roles } from '../auth/roles.decorator.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { H5pPackageUpload } from './h5p.upload.decorator.js';
import { H5pService } from './h5p.service.js';
import { requireCaller } from './h5p.user.js';

/**
 * The authoring half of H5P: installing an uploaded package, and reading or
 * removing what that produced.
 *
 * **Every route here is `@Roles('admin')`, and that is a file boundary rather
 * than a decorator habit** — the mirror of `h5p-public.controller.ts`, where
 * every route is `@Public()`. `GET content` in particular **may never be
 * relaxed to `@Public()`**: ADR-007 makes the absence of any public enumeration
 * the thing that lets the play and content-file routes be public, so serving
 * this index anonymously would unprotect every unpublished exercise in the
 * bucket without a single test going red. The guards are pinned per route by
 * the metadata block at the bottom of `h5p.controller.spec.ts`.
 *
 * The global guards run before the interceptors `H5pPackageUpload` installs, so
 * an unauthenticated or under-privileged caller is refused before a byte of the
 * package is read.
 *
 * `attach` and `detach` are inside that boundary too, and they are the **only**
 * writers of `h5pContent.pageId`: the save route merges over the stored row and
 * carries no `pageId` at all, which is what stops a save detaching an exercise.
 *
 * `h5pContentIdSchema` on `:id` is what keeps a `/` or a `..` out of
 * `collection.doc()`, for the same reason `PagesController` validates its own.
 */
@ApiTags('h5p')
@ApiBearerAuth()
@Controller('h5p')
export class H5pController {
  constructor(private readonly h5p: H5pService) {}

  @Post('content')
  @Roles('admin')
  @H5pPackageUpload()
  async upload(
    @UploadedFile() file?: Express.Multer.File,
    @CurrentUser() caller?: AuthenticatedUser,
  ): Promise<H5pSaveResult> {
    if (!file) {
      throw new BadRequestException('A file is required in the "file" field.');
    }

    return h5pSaveResultSchema.parse(await this.h5p.importPackage(file, requireCaller(caller).uid));
  }

  @Get('content')
  @Roles('admin')
  list(
    @Query(new ZodValidationPipe(listH5pContentQuerySchema)) query: ListH5pContentQuery,
  ): Promise<Page<H5pContent>> {
    return this.h5p.list(query);
  }

  @Get('content/:id')
  @Roles('admin')
  findOne(@Param('id', new ZodValidationPipe(h5pContentIdSchema)) id: string): Promise<H5pContent> {
    return this.h5p.findById(id);
  }

  @Delete('content/:id')
  @Roles('admin')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', new ZodValidationPipe(h5pContentIdSchema)) id: string): Promise<void> {
    return this.h5p.remove(id);
  }
}
