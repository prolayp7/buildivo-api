import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';
import { buildPaginationMeta, paginationSkipTake } from '../../../../common/pagination';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

// The homepage "Shop by category" section only ever renders top-level
// categories, laid out as a fixed 9-tile grid.
export const HOMEPAGE_CATEGORY_LIMIT = 9;

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  private async assertSlugAvailable(slug: string, excludeId?: number): Promise<void> {
    const existing = await this.prisma.category.findFirst({
      where: { slug, deletedAt: null, ...(excludeId ? { id: { not: excludeId } } : {}) },
    });
    if (existing) {
      throw new ConflictException(`Category slug "${slug}" is already in use`);
    }
  }

  private async assertHomepageSlotAvailable(parentId: number | null, excludeId?: number): Promise<void> {
    if (parentId !== null) return; // the limit only governs top-level categories, the only ones shown on the homepage
    const count = await this.prisma.category.count({
      where: { parentId: null, showOnHomepage: true, deletedAt: null, ...(excludeId ? { id: { not: excludeId } } : {}) },
    });
    if (count >= HOMEPAGE_CATEGORY_LIMIT) {
      throw new ConflictException(`Only ${HOMEPAGE_CATEGORY_LIMIT} categories can be shown on the homepage at once`);
    }
  }

  // FAQs are edited as a whole list in the admin form (no per-item id to
  // target), so each save replaces the full set rather than diffing it.
  private faqsWriteInput(faqs: CreateCategoryDto['faqs']) {
    if (!faqs) return undefined;
    return { createMany: { data: faqs.map((faq, index) => ({ question: faq.question, answer: faq.answer, sortOrder: index })) } };
  }

  async list(page: number, perPage: number, parentId?: number, includeDeleted = false) {
    const where = { ...(includeDeleted ? {} : { deletedAt: null }), ...(parentId !== undefined ? { parentId } : {}) };
    const [items, total] = await Promise.all([
      this.prisma.category.findMany({
        where,
        ...paginationSkipTake(page, perPage),
        include: {
          parent: { select: { id: true, title: true } },
          _count: { select: { products: true, secondaryProducts: true, children: true } },
        },
        orderBy: [{ sortOrder: 'asc' }, { title: 'asc' }],
      }),
      this.prisma.category.count({ where }),
    ]);
    return { items, meta: buildPaginationMeta(page, perPage, total) };
  }

  async detail(id: number) {
    const category = await this.prisma.category.findFirst({
      where: { id, deletedAt: null },
      include: { faqs: { orderBy: { sortOrder: 'asc' } } },
    });
    if (!category) throw new NotFoundException('Category not found');
    return category;
  }

  async create(dto: CreateCategoryDto) {
    await this.assertSlugAvailable(dto.slug);
    if (dto.showOnHomepage ?? true) {
      await this.assertHomepageSlotAvailable(dto.parentId ?? null);
    }
    const { faqs, ...rest } = dto;
    return this.prisma.category.create({
      data: { ...rest, faqs: this.faqsWriteInput(faqs) },
      include: { faqs: { orderBy: { sortOrder: 'asc' } } },
    });
  }

  async update(id: number, dto: UpdateCategoryDto) {
    const existing = await this.detail(id);
    if (dto.slug) {
      await this.assertSlugAvailable(dto.slug, id);
    }
    if (dto.showOnHomepage) {
      await this.assertHomepageSlotAvailable(dto.parentId !== undefined ? dto.parentId : existing.parentId, id);
    }
    const { faqs, ...rest } = dto;
    return this.prisma.category.update({
      where: { id },
      data: { ...rest, ...(faqs !== undefined ? { faqs: { deleteMany: {}, ...this.faqsWriteInput(faqs) } } : {}) },
      include: { faqs: { orderBy: { sortOrder: 'asc' } } },
    });
  }

  async remove(id: number): Promise<void> {
    await this.detail(id);
    await this.prisma.category.update({ where: { id }, data: { deletedAt: new Date() } });
  }
}
