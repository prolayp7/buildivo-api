import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { CreateProductQuestionDto } from './dto/create-product-question.dto';

@Injectable()
export class StorefrontQnaService {
  constructor(private readonly prisma: PrismaService) {}

  private async activeProductId(slug: string): Promise<number> {
    const product = await this.prisma.product.findFirst({ where: { slug, status: 'ACTIVE', deletedAt: null }, select: { id: true } });
    if (!product) throw new NotFoundException('Product not found');
    return product.id;
  }

  async listForProduct(slug: string) {
    const productId = await this.activeProductId(slug);
    return this.prisma.productQuestion.findMany({
      where: { productId, status: 'PUBLISHED' },
      orderBy: { createdAt: 'desc' },
      include: { answers: { orderBy: { createdAt: 'asc' } } },
    });
  }

  async ask(slug: string, customerId: number | undefined, dto: CreateProductQuestionDto) {
    const productId = await this.activeProductId(slug);
    return this.prisma.productQuestion.create({
      data: { productId, userId: customerId, name: dto.name, question: dto.question },
    });
  }
}
