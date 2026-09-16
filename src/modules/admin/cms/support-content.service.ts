import { Injectable, NotFoundException } from '@nestjs/common'; import { PrismaService } from '../../../prisma/prisma.service'; import { buildPaginationMeta, paginationSkipTake } from '../../../common/pagination'; import { CreateFaqCategoryDto, CreateFaqDto, CreateTestimonialDto, ListEnquiriesQueryDto, UpdateEnquiryDto } from './dto/support-content.dto';
@Injectable() export class SupportContentService {
  constructor(private readonly prisma: PrismaService) {}
  faqCategories() { return this.prisma.faqCategory.findMany({ include: { faqs: { orderBy: { sortOrder: 'asc' } } }, orderBy: { sortOrder: 'asc' } }); }
  createFaqCategory(dto: CreateFaqCategoryDto) { return this.prisma.faqCategory.create({ data: dto, include: { faqs: true } }); }
  async addFaq(categoryId: number, dto: CreateFaqDto) { const category = await this.prisma.faqCategory.findUnique({ where: { id: categoryId } }); if (!category) throw new NotFoundException('FAQ category not found'); return this.prisma.faq.create({ data: { ...dto, faqCategoryId: categoryId } }); }
  testimonials() { return this.prisma.testimonial.findMany({ orderBy: { sortOrder: 'asc' } }); }
  createTestimonial(dto: CreateTestimonialDto) { return this.prisma.testimonial.create({ data: dto }); }
  async enquiries(query: ListEnquiriesQueryDto) { const page = query.page!; const perPage = query.perPage!; const where = { ...(query.status ? { status: query.status } : {}), ...(query.type ? { type: query.type } : {}) }; const [items, total] = await Promise.all([this.prisma.enquiry.findMany({ where, ...paginationSkipTake(page, perPage), orderBy: { createdAt: 'desc' } }), this.prisma.enquiry.count({ where })]); return { items, meta: buildPaginationMeta(page, perPage, total) }; }
  async updateEnquiry(id: number, dto: UpdateEnquiryDto) { const exists = await this.prisma.enquiry.findUnique({ where: { id } }); if (!exists) throw new NotFoundException('Enquiry not found'); return this.prisma.enquiry.update({ where: { id }, data: dto }); }
}
