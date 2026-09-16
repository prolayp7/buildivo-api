import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ReturnStatus } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { EmailService } from '../../email/email.service';
import { returnRequestedEmail } from '../../email/email-templates';
import { CreateReturnRequestDto } from './dto/create-return-request.dto';

const ACTIVE_RETURN_STATUSES: ReturnStatus[] = ['REQUESTED', 'APPROVED', 'RECEIVED'];

@Injectable()
export class StorefrontReturnsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
  ) {}

  async create(customerId: number, dto: CreateReturnRequestDto) {
    const orderItem = await this.prisma.orderItem.findUnique({
      where: { id: dto.orderItemId },
      include: { order: true, returns: { where: { returnStatus: { in: ACTIVE_RETURN_STATUSES } } } },
    });
    if (!orderItem || orderItem.order.userId !== customerId) throw new NotFoundException('Order item not found');
    if (orderItem.order.status !== 'DELIVERED') throw new BadRequestException('Only delivered orders can be returned');
    if (!orderItem.returnEligible) throw new BadRequestException('This item is not eligible for return');
    if (orderItem.returnDeadline && orderItem.returnDeadline < new Date()) throw new BadRequestException('The return window for this item has passed');
    if (orderItem.returns.length) throw new BadRequestException('A return has already been requested for this item');

    const created = await this.prisma.orderItemReturn.create({
      data: { orderItemId: dto.orderItemId, userId: customerId, reason: dto.reason, comment: dto.comment },
    });

    const email = returnRequestedEmail({ orderNumber: orderItem.order.orderNumber, itemTitle: orderItem.titleSnapshot, reason: dto.reason });
    void this.emailService.send(orderItem.order.email, email.subject, email.html);

    return created;
  }
}
