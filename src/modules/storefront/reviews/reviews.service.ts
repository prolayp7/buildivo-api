import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { buildPaginationMeta, paginationSkipTake } from '../../../common/pagination';
import { CreateReviewDto } from './dto/create-review.dto';
import { ListReviewsQueryDto } from './dto/list-reviews-query.dto';

@Injectable()
export class StorefrontReviewsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: ListReviewsQueryDto) {
    const page = query.page!;
    const perPage = query.perPage!;
    const where: Prisma.ReviewWhereInput = { productId: query.productId, status: 'APPROVED' };
    const [items, total] = await Promise.all([
      this.prisma.review.findMany({
        where,
        ...paginationSkipTake(page, perPage),
        orderBy: { createdAt: 'desc' },
        select: { id: true, uuid: true, rating: true, title: true, comment: true, reviewerName: true, createdAt: true, orderItemId: true },
      }),
      this.prisma.review.count({ where }),
    ]);
    return { items, meta: buildPaginationMeta(page, perPage, total) };
  }

  async create(userId: number, reviewerName: string, dto: CreateReviewDto) {
    const product = await this.prisma.product.findFirst({ where: { id: dto.productId, deletedAt: null } });
    if (!product) throw new NotFoundException('Product not found');

    let orderId: number | undefined;
    if (dto.orderItemId !== undefined) {
      const orderItem = await this.prisma.orderItem.findFirst({
        where: { id: dto.orderItemId, productId: dto.productId, order: { userId } },
      });
      if (!orderItem) throw new BadRequestException('That order item does not belong to you or does not match this product');
      orderId = orderItem.orderId;
    }

    try {
      return await this.prisma.review.create({
        data: {
          productId: dto.productId,
          orderItemId: dto.orderItemId,
          orderId,
          userId,
          reviewerName,
          rating: dto.rating,
          title: dto.title,
          comment: dto.comment,
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('You have already reviewed this order item');
      }
      throw error;
    }
  }
}
