import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { ReorderHomepageSectionsDto } from './dto/reorder-homepage-sections.dto';
import { UpdateHomepageSectionDto } from './dto/update-homepage-section.dto';

@Injectable()
export class HomepageSectionsService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.homepageSection.findMany({ orderBy: { sortOrder: 'asc' } });
  }

  async update(id: number, dto: UpdateHomepageSectionDto) {
    const existing = await this.prisma.homepageSection.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Homepage section not found');
    return this.prisma.homepageSection.update({
      where: { id },
      data: {
        ...(dto.label !== undefined ? { label: dto.label } : {}),
        ...(dto.isVisible !== undefined ? { isVisible: dto.isVisible } : {}),
        ...(dto.config !== undefined ? { config: dto.config as Prisma.InputJsonValue } : {}),
      },
    });
  }

  async reorder(dto: ReorderHomepageSectionsDto) {
    const existing = await this.prisma.homepageSection.findMany({ select: { id: true } });
    const existingIds = new Set(existing.map((row) => row.id));
    if (dto.order.length !== existingIds.size || dto.order.some((id) => !existingIds.has(id))) {
      throw new BadRequestException('order must contain exactly the current set of homepage section ids');
    }
    await this.prisma.$transaction(dto.order.map((id, sortOrder) => this.prisma.homepageSection.update({ where: { id }, data: { sortOrder } })));
    return this.list();
  }
}
