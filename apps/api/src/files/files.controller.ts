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
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  MAX_SITE_FILE_BYTES,
  paginationQuerySchema,
  siteFileIdSchema,
  siteFileTooLargeMessage,
  type Page,
  type PaginationQuery,
  type SiteFile,
} from '@speakukrainian/shared';
import { memoryStorage } from 'multer';
import { Roles } from '../auth/roles.decorator.js';
import { UploadLimitInterceptor } from '../common/upload-limit.interceptor.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { FilesService } from './files.service.js';
import { decodeUploadName } from './site-files.js';

/** The administrator's side of site files: upload, list, delete. */
@ApiTags('files')
@ApiBearerAuth()
@Roles('admin')
@Controller('admin/files')
export class FilesController {
  constructor(private readonly files: FilesService) {}

  /**
   * One file per request, in the `file` field. Held in memory for the length
   * of the request (the limit keeps that small) and stored in one piece.
   */
  @Post()
  @UseInterceptors(
    // First, so it can reword the 413 that the file interceptor raises.
    new UploadLimitInterceptor(siteFileTooLargeMessage()),
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_SITE_FILE_BYTES, files: 1 },
    }),
  )
  upload(@UploadedFile() file?: Express.Multer.File): Promise<SiteFile> {
    if (!file) {
      throw new BadRequestException('A file is required in the "file" field.');
    }
    return this.files.upload(decodeUploadName(file.originalname), file.buffer);
  }

  @Get()
  list(
    @Query(new ZodValidationPipe(paginationQuerySchema)) query: PaginationQuery,
  ): Promise<Page<SiteFile>> {
    return this.files.list(query);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', new ZodValidationPipe(siteFileIdSchema)) id: string): Promise<void> {
    return this.files.remove(id);
  }
}
