import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { OrderStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { buildPaginationMeta, paginationSkipTake } from '../../../common/pagination';
import { ListOrdersQueryDto } from './dto/list-orders-query.dto';
import { ListAbandonedCartsQueryDto } from './dto/list-abandoned-carts-query.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { UpdateTrackingDto } from './dto/update-tracking.dto';
import { UpdateOrderItemStatusDto } from './dto/update-order-item-status.dto';
import { EmailService } from '../../email/email.service';
import { orderDeliveredEmail, orderShippedEmail } from '../../email/email-templates';

const detailInclude = {
  user: { select: { id: true, email: true, firstName: true, lastName: true } },
  shippingMethod: true,
  items: { include: { product: { include: { category: { select: { id: true, title: true } } } }, productVariant: true } },
  statusHistory: { include: { changedByAdmin: { select: { id: true, name: true, email: true } } }, orderBy: { createdAt: 'asc' as const } },
  paymentTransactions: { orderBy: { createdAt: 'desc' as const } },
  paymentRefunds: { orderBy: { createdAt: 'desc' as const } },
};

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
  ) {}

  async summary() {
    const revenueStatuses: OrderStatus[] = ['PROCESSING', 'PACKED', 'SHIPPED', 'DELIVERED'];
    const [totalOrders, awaitingPayment, failedPayments, revenue, average, processing, shipped, delivered, cancelled, failed, returnsCount] = await Promise.all([
      this.prisma.order.count(),
      this.prisma.order.count({ where: { status: 'AWAITING_PAYMENT' } }),
      this.prisma.order.count({ where: { paymentStatus: 'FAILED' } }),
      this.prisma.order.aggregate({
        where: { status: { in: revenueStatuses } },
        _sum: { total: true },
      }),
      this.prisma.order.aggregate({ _avg: { total: true } }),
      this.prisma.order.count({ where: { status: 'PROCESSING' } }),
      this.prisma.order.count({ where: { status: 'SHIPPED' } }),
      this.prisma.order.count({ where: { status: 'DELIVERED' } }),
      this.prisma.order.count({ where: { status: 'CANCELLED' } }),
      this.prisma.order.count({ where: { status: 'FAILED' } }),
      this.prisma.orderItemReturn.count(),
    ]);
    return {
      totalOrders,
      awaitingPayment,
      failedPayments,
      revenue: Number(revenue._sum.total ?? 0),
      averageOrderValue: Number(average._avg.total ?? 0),
      processing,
      shipped,
      delivered,
      cancelled,
      failed,
      returnsCount,
    };
  }

  async list(query: ListOrdersQueryDto) {
    const page = query.page!;
    const perPage = query.perPage!;
    if (query.dateFrom && query.dateTo && new Date(query.dateFrom) > new Date(query.dateTo)) {
      throw new BadRequestException('dateFrom cannot be after dateTo');
    }
    const where: Prisma.OrderWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.paymentStatus ? { paymentStatus: query.paymentStatus } : {}),
      ...(query.q ? { OR: [
        { orderNumber: { contains: query.q, mode: 'insensitive' } },
        { email: { contains: query.q, mode: 'insensitive' } },
      ] } : {}),
      ...((query.dateFrom || query.dateTo) ? { placedAt: {
        ...(query.dateFrom ? { gte: new Date(query.dateFrom) } : {}),
        ...(query.dateTo ? { lte: new Date(query.dateTo) } : {}),
      } } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.order.findMany({ where, ...paginationSkipTake(page, perPage), include: { user: { select: { id: true, firstName: true, lastName: true } }, _count: { select: { items: true } } }, orderBy: { placedAt: 'desc' } }),
      this.prisma.order.count({ where }),
    ]);
    return { items, meta: buildPaginationMeta(page, perPage, total) };
  }

  async abandonedCarts(query: ListAbandonedCartsQueryDto) {
    const cutoff = new Date(Date.now() - query.inactivityHours * 60 * 60 * 1000);
    const where: Prisma.CartWhereInput = {
      updatedAt: { lte: cutoff },
      items: { some: { savedForLater: false } },
      ...(query.customerType === 'REGISTERED' ? { userId: { not: null } } : {}),
      ...(query.customerType === 'GUEST' ? { userId: null } : {}),
      ...(query.q ? { user: { is: { OR: [
        { email: { contains: query.q, mode: 'insensitive' } },
        { firstName: { contains: query.q, mode: 'insensitive' } },
        { lastName: { contains: query.q, mode: 'insensitive' } },
      ] } } } : {}),
    };
    const carts = await this.prisma.cart.findMany({
      where,
      include: {
        user: { select: { id: true, email: true, firstName: true, lastName: true } },
        items: {
          where: { savedForLater: false },
          include: { productVariant: { include: { product: { select: { id: true, title: true, slug: true } } } } },
          orderBy: { updatedAt: 'desc' },
        },
      },
    });
    const rows = carts.map((cart) => {
      const quantity = cart.items.reduce((sum, item) => sum + item.quantity, 0);
      const value = cart.items.reduce((sum, item) => sum + Number(item.productVariant.salePrice ?? item.productVariant.price) * item.quantity, 0);
      return {
        id: cart.id,
        customerType: cart.user ? 'REGISTERED' : 'GUEST',
        customer: cart.user,
        itemCount: cart.items.length,
        quantity,
        value: Math.round(value * 100) / 100,
        lastActiveAt: cart.updatedAt,
        createdAt: cart.createdAt,
        items: cart.items.map((item) => ({
          id: item.id,
          quantity: item.quantity,
          unitPrice: Number(item.productVariant.salePrice ?? item.productVariant.price),
          variantId: item.productVariant.id,
          variantTitle: item.productVariant.title,
          product: item.productVariant.product,
        })),
      };
    });
    const direction = query.sortOrder === 'asc' ? 1 : -1;
    rows.sort((a, b) => {
      if (query.sortBy === 'value') return (a.value - b.value) * direction;
      if (query.sortBy === 'items') return (a.quantity - b.quantity) * direction;
      if (query.sortBy === 'customer') return (a.customer?.email ?? 'Guest').localeCompare(b.customer?.email ?? 'Guest') * direction;
      return (a.lastActiveAt.getTime() - b.lastActiveAt.getTime()) * direction;
    });
    const total = rows.length;
    const start = (query.page! - 1) * query.perPage!;
    return {
      items: rows.slice(start, start + query.perPage!),
      meta: buildPaginationMeta(query.page!, query.perPage!, total),
      summary: {
        total,
        registered: rows.filter((cart) => cart.customerType === 'REGISTERED').length,
        guests: rows.filter((cart) => cart.customerType === 'GUEST').length,
        recoverableValue: Math.round(rows.reduce((sum, cart) => sum + cart.value, 0) * 100) / 100,
      },
      inactivityHours: query.inactivityHours,
    };
  }

  async detail(id: number) {
    const order = await this.prisma.order.findUnique({ where: { id }, include: detailInclude });
    if (!order) throw new NotFoundException('Order not found');
    return order;
  }

  async updateStatus(id: number, adminId: number, dto: UpdateOrderStatusDto) {
    const order = await this.detail(id);
    if (order.status === dto.toStatus) throw new BadRequestException('Order already has that status');
    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.order.update({ where: { id }, data: { status: dto.toStatus } });
      await tx.orderStatusHistory.create({ data: {
        orderId: id, fromStatus: order.status, toStatus: dto.toStatus,
        note: dto.note, changedByAdminId: adminId,
      } });
      return tx.order.findUniqueOrThrow({ where: { id }, include: detailInclude });
    });

    if (dto.toStatus === 'SHIPPED') {
      const email = orderShippedEmail({
        orderNumber: updated.orderNumber,
        orderUuid: updated.uuid,
        items: updated.items.map((item) => ({ name: item.titleSnapshot, meta: `${item.variantTitleSnapshot} · Qty ${item.quantity}`, price: Number(item.subtotal) })),
        trackingCarrier: updated.trackingCarrier,
        trackingNumber: updated.trackingNumber,
        trackingUrl: updated.trackingUrl,
      });
      void this.emailService.send(updated.email, email.subject, email.html);
    } else if (dto.toStatus === 'DELIVERED') {
      const email = orderDeliveredEmail({ orderNumber: updated.orderNumber, orderUuid: updated.uuid });
      void this.emailService.send(updated.email, email.subject, email.html);
    }

    return updated;
  }

  async updateTracking(id: number, dto: UpdateTrackingDto) {
    await this.detail(id);
    return this.prisma.order.update({ where: { id }, data: dto });
  }

  async updateItemStatus(id: number, itemId: number, dto: UpdateOrderItemStatusDto) {
    await this.detail(id);
    const item = await this.prisma.orderItem.findFirst({ where: { id: itemId, orderId: id } });
    if (!item) throw new NotFoundException('Order item not found');
    return this.prisma.orderItem.update({ where: { id: itemId }, data: { status: dto.status } });
  }

  async updateNote(id: number, adminNote: string) {
    await this.detail(id);
    return this.prisma.order.update({ where: { id }, data: { adminNote } });
  }
}
