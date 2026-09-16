import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common'; import { Prisma } from '@prisma/client'; import { PrismaService } from '../../../prisma/prisma.service'; import { CreatePageDto, UpdatePageDto } from './dto/page.dto';
@Injectable() export class PagesService {
  constructor(private readonly prisma: PrismaService) {} list() { return this.prisma.page.findMany({ orderBy: { title: 'asc' } }); }
  private data(dto: CreatePageDto | UpdatePageDto) { return { ...dto, contentBlocks: dto.contentBlocks as Prisma.InputJsonValue | undefined }; }
  async create(dto: CreatePageDto) { try { return await this.prisma.page.create({ data: this.data(dto) as Prisma.PageCreateInput }); } catch (e) { return this.map(e, dto.slug); } }
  async findOne(id: number) { const page = await this.prisma.page.findUnique({ where: { id } }); if (!page) throw new NotFoundException('Page not found'); return page; }
  async update(id: number, dto: UpdatePageDto) { const page = await this.findOne(id); try { return await this.prisma.page.update({ where: { id }, data: this.data(dto) }); } catch (e) { return this.map(e, dto.slug ?? page.slug); } }
  async remove(id: number) { const page = await this.findOne(id); if (page.isSystemPage) throw new BadRequestException('System pages cannot be deleted'); await this.prisma.page.delete({ where: { id } }); }
  private map(error: unknown, slug: string): never { if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictException(`Page slug "${slug}" is already in use`); throw error; }
}
