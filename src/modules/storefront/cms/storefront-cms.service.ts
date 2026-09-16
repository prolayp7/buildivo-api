import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { buildPaginationMeta, paginationSkipTake } from '../../../common/pagination';
import { ListBlogPostsQueryDto } from './dto/list-blog-posts-query.dto';

@Injectable()
export class StorefrontCmsService {
  constructor(private readonly prisma: PrismaService) {}

  async page(slug: string) {
    const page = await this.prisma.page.findFirst({ where: { slug, status: 'PUBLISHED' } });
    if (!page) throw new NotFoundException('Page not found');
    return page;
  }

  async blogCategories() {
    return this.prisma.blogCategory.findMany({ where: { status: 'ACTIVE' }, orderBy: { sortOrder: 'asc' } });
  }

  async blogPosts(query: ListBlogPostsQueryDto) {
    const page = query.page!;
    const perPage = query.perPage!;
    const where: Prisma.BlogPostWhereInput = {
      status: 'PUBLISHED',
      ...(query.category ? { blogCategory: { slug: query.category } } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.blogPost.findMany({
        where,
        ...paginationSkipTake(page, perPage),
        orderBy: { publishedAt: 'desc' },
        include: { blogCategory: { select: { id: true, title: true, slug: true } }, author: { select: { id: true, name: true, role: true } } },
      }),
      this.prisma.blogPost.count({ where }),
    ]);
    return { items, meta: buildPaginationMeta(page, perPage, total) };
  }

  async blogPost(slug: string) {
    const post = await this.prisma.blogPost.findFirst({
      where: { slug, status: 'PUBLISHED' },
      include: { blogCategory: { select: { id: true, title: true, slug: true } }, author: { select: { id: true, name: true, role: true, bio: true } } },
    });
    if (!post) throw new NotFoundException('Blog post not found');
    return post;
  }

  async faqs() {
    return this.prisma.faqCategory.findMany({
      where: { status: 'ACTIVE' },
      orderBy: { sortOrder: 'asc' },
      include: { faqs: { where: { status: 'ACTIVE' }, orderBy: { sortOrder: 'asc' } } },
    });
  }

  async testimonials() {
    return this.prisma.testimonial.findMany({ where: { status: 'ACTIVE' }, orderBy: { sortOrder: 'asc' } });
  }
}
