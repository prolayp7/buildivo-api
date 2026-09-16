import { Controller, Get, Header } from '@nestjs/common';
import { SitemapService } from './sitemap.service';

@Controller()
export class SitemapController {
  constructor(private readonly service: SitemapService) {}

  @Get('sitemap.xml') @Header('Content-Type', 'application/xml')
  sitemap() { return this.service.buildSitemap(); }

  @Get('robots.txt') @Header('Content-Type', 'text/plain')
  robots() { return this.service.buildRobots(); }
}
