import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';

@Injectable()
export class StorefrontMenusService {
  constructor(private readonly prisma: PrismaService) {}

  async bySlug(slug: string) {
    const menu = await this.prisma.menu.findFirst({
      where: { slug, status: 'ACTIVE' },
      include: {
        items: {
          where: { parentId: null, status: 'ACTIVE' },
          orderBy: { sortOrder: 'asc' },
          select: {
            id: true,
            label: true,
            href: true,
            icon: true,
            sortOrder: true,
            category: { select: { id: true, title: true, slug: true, icon: true } },
            children: {
              where: { status: 'ACTIVE' },
              orderBy: { sortOrder: 'asc' },
              select: {
                id: true,
                label: true,
                href: true,
                icon: true,
                sortOrder: true,
                category: { select: { id: true, title: true, slug: true, icon: true } },
              },
            },
          },
        },
      },
    });
    if (!menu) throw new NotFoundException('Menu not found');
    return menu;
  }
}
