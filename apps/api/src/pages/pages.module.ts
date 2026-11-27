import { Module } from '@nestjs/common';
import { CoursesModule } from '../courses/courses.module.js';
import { FilesModule } from '../files/files.module.js';
import { PageCache } from '../site/page-cache.js';
import { PreviewController } from '../site/preview.controller.js';
import { PreviewStore } from '../site/preview.js';
import { SiteRenderer } from '../site/site.renderer.js';
import { SiteService } from '../site/site.service.js';
import { PagesController } from './pages.controller.js';
import { PagesService } from './pages.service.js';

@Module({
  // The site serves the files the administrator uploads for its pages, and
  // its templates can list the published courses.
  imports: [FilesModule, CoursesModule],
  controllers: [PagesController, PreviewController],
  providers: [PagesService, PageCache, PreviewStore, SiteRenderer, SiteService],
  exports: [PagesService, SiteService],
})
export class PagesModule {}
