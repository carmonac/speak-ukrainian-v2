import { Module } from '@nestjs/common';
import { PageCache } from '../site/page-cache.js';
import { SiteRenderer } from '../site/site.renderer.js';
import { SiteService } from '../site/site.service.js';
import { PagesController } from './pages.controller.js';
import { PagesService } from './pages.service.js';

@Module({
  controllers: [PagesController],
  providers: [PagesService, PageCache, SiteRenderer, SiteService],
  exports: [PagesService, SiteService],
})
export class PagesModule {}
