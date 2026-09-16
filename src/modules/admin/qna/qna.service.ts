import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { buildPaginationMeta, paginationSkipTake } from '../../../common/pagination';
import { ListProductQuestionsQueryDto } from './dto/list-product-questions-query.dto';
import { AnswerProductQuestionDto } from './dto/answer-product-question.dto';

@Injectable()
export class AdminQnaService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: ListProductQuestionsQueryDto) {
    const page = query.page!; const perPage = query.perPage!;
    const where: Prisma.ProductQuestionWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.productId ? { productId: query.productId } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.productQuestion.findMany({
        where, ...paginationSkipTake(page, perPage), orderBy: { createdAt: 'desc' },
        include: { product: { select: { id: true, title: true, slug: true } }, answers: true },
      }),
      this.prisma.productQuestion.count({ where }),
    ]);
    return { items, meta: buildPaginationMeta(page, perPage, total) };
  }

  private async find(id: number) {
    const item = await this.prisma.productQuestion.findUnique({ where: { id } });
    if (!item) throw new NotFoundException('Question not found');
    return item;
  }

  async answer(id: number, adminUserId: number, dto: AnswerProductQuestionDto) {
    await this.find(id);
    return this.prisma.$transaction(async (tx) => {
      await tx.productAnswer.create({ data: { productQuestionId: id, adminUserId, answer: dto.answer } });
      return tx.productQuestion.update({ where: { id }, data: { status: 'PUBLISHED' }, include: { answers: true } });
    });
  }

  async reject(id: number) {
    await this.find(id);
    return this.prisma.productQuestion.update({ where: { id }, data: { status: 'REJECTED' } });
  }

  async remove(id: number) {
    await this.find(id);
    await this.prisma.productQuestion.delete({ where: { id } });
  }
}
