import { Controller, Get, Res } from '@nestjs/common';
import type { Response } from 'express';
import { SitemapService } from './sitemap.service';

// Crawlers need the raw document, not the JSON `{ data }` envelope the global interceptor adds,
// so these send the response themselves (which the interceptor leaves alone).
@Controller()
export class SitemapController {
  constructor(private readonly service: SitemapService) {}

  @Get('sitemap.xml')
  async sitemap(@Res() res: Response) { res.type('application/xml').send(await this.service.buildSitemap()); }

  @Get('robots.txt')
  robots(@Res() res: Response) { res.type('text/plain').send(this.service.buildRobots()); }
}
