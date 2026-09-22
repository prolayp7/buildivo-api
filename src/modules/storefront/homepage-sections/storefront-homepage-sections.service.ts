import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';

@Injectable()
export class StorefrontHomepageSectionsService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.homepageSection.findMany({
      where: { isVisible: true },
      orderBy: { sortOrder: 'asc' },
      select: { type: true, config: true },
    });
  }
}
