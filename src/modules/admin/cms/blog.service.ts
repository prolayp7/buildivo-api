import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common'; import { Prisma } from '@prisma/client'; import { PrismaService } from '../../../prisma/prisma.service'; import { buildPaginationMeta, paginationSkipTake } from '../../../common/pagination'; import { CreateAuthorDto, CreateBlogCategoryDto, CreateBlogPostDto, ListBlogPostsQueryDto, UpdateBlogPostDto } from './dto/blog.dto';
const include = { blogCategory: true, author: true };
@Injectable() export class BlogService {
  constructor(private readonly prisma: PrismaService) {}
  categories() { return this.prisma.blogCategory.findMany({ orderBy: { sortOrder: 'asc' } }); }
  async createCategory(dto: CreateBlogCategoryDto) { try { return await this.prisma.blogCategory.create({ data: dto }); } catch (e) { return this.map(e, dto.slug); } }
  authors() { return this.prisma.author.findMany({ orderBy: { name: 'asc' } }); }
  createAuthor(dto: CreateAuthorDto) { return this.prisma.author.create({ data: dto }); }
  async posts(query: ListBlogPostsQueryDto) { const page = query.page!; const perPage = query.perPage!; const where = { ...(query.status ? { status: query.status } : {}), ...(query.blogCategoryId ? { blogCategoryId: query.blogCategoryId } : {}) }; const [items, total] = await Promise.all([this.prisma.blogPost.findMany({ where, ...paginationSkipTake(page, perPage), include, orderBy: { createdAt: 'desc' } }), this.prisma.blogPost.count({ where })]); return { items, meta: buildPaginationMeta(page, perPage, total) }; }
  private data(dto: CreateBlogPostDto | UpdateBlogPostDto) {
    return {
      ...dto,
      tags: dto.tags as Prisma.InputJsonValue | undefined,
      steps: dto.steps as Prisma.InputJsonValue | undefined,
      materials: dto.materials as Prisma.InputJsonValue | undefined,
      contentBlocks: dto.contentBlocks as Prisma.InputJsonValue | undefined,
      publishedAt: dto.publishedAt ? new Date(dto.publishedAt) : undefined,
    };
  }
  async createPost(dto: CreateBlogPostDto) { if ((dto.status ?? 'DRAFT') === 'PUBLISHED' && !dto.publishedAt) dto.publishedAt = new Date().toISOString(); try { return await this.prisma.blogPost.create({ data: this.data(dto) as Prisma.BlogPostUncheckedCreateInput, include }); } catch (e) { return this.map(e, dto.slug); } }
  async post(id: number) { const post = await this.prisma.blogPost.findUnique({ where: { id }, include }); if (!post) throw new NotFoundException('Blog post not found'); return post; }
  async updatePost(id: number, dto: UpdateBlogPostDto) { const current = await this.post(id); if (dto.status === 'PUBLISHED' && !dto.publishedAt && !current.publishedAt) dto.publishedAt = new Date().toISOString(); try { return await this.prisma.blogPost.update({ where: { id }, data: this.data(dto), include }); } catch (e) { return this.map(e, dto.slug ?? current.slug); } }
  async removePost(id: number) { await this.post(id); await this.prisma.blogPost.delete({ where: { id } }); }
  private map(error: unknown, slug: string): never { if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictException(`Content slug "${slug}" is already in use`); if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') throw new BadRequestException('Blog category or author not found'); throw error; }
}
