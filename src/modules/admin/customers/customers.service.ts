import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { buildPaginationMeta, paginationSkipTake } from '../../../common/pagination';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { ListCustomersQueryDto } from './dto/list-customers-query.dto';

@Injectable()
export class CustomersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: ListCustomersQueryDto) {
    const page = query.page!;
    const perPage = query.perPage!;
    if (query.dateFrom && query.dateTo && new Date(query.dateFrom) > new Date(query.dateTo)) {
      throw new BadRequestException('dateFrom cannot be after dateTo');
    }
    const where = {
      deletedAt: null,
      ...(query.status ? { status: query.status } : {}),
      ...((query.dateFrom || query.dateTo) ? { createdAt: {
        ...(query.dateFrom ? { gte: new Date(query.dateFrom) } : {}),
        ...(query.dateTo ? { lte: new Date(query.dateTo) } : {}),
      } } : {}),
      ...(query.q ? { OR: [
        { email: { contains: query.q, mode: 'insensitive' as const } },
        { firstName: { contains: query.q, mode: 'insensitive' as const } },
        { lastName: { contains: query.q, mode: 'insensitive' as const } },
        { phone: { contains: query.q, mode: 'insensitive' as const } },
      ] } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        ...paginationSkipTake(page, perPage),
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          uuid: true,
          email: true,
          firstName: true,
          lastName: true,
          phone: true,
          emailVerifiedAt: true,
          status: true,
          createdAt: true,
          _count: { select: { orders: true } },
          orders: { select: { placedAt: true }, orderBy: { placedAt: 'desc' as const }, take: 1 },
        },
      }),
      this.prisma.user.count({ where }),
    ]);
    const customerIds = items.map((item) => item.id);
    const sales = customerIds.length ? await this.prisma.order.groupBy({
      by: ['userId'],
      where: { userId: { in: customerIds }, paymentStatus: { in: ['PAID', 'PARTIALLY_REFUNDED', 'REFUNDED'] } },
      _sum: { total: true },
    }) : [];
    const salesByCustomer = new Map(sales.map((row) => [row.userId, Number(row._sum.total ?? 0)]));
    return {
      items: items.map(({ orders, ...item }) => ({ ...item, totalSpend: salesByCustomer.get(item.id) ?? 0, lastOrderAt: orders[0]?.placedAt ?? null })),
      meta: buildPaginationMeta(page, perPage, total),
    };
  }

  async summary() {
    const [totalCustomers, activeCustomers, customersWithOrders, registeredLast30Days, orders] = await Promise.all([
      this.prisma.user.count({ where: { deletedAt: null } }),
      this.prisma.user.count({ where: { deletedAt: null, status: 'ACTIVE' } }),
      this.prisma.user.count({ where: { deletedAt: null, orders: { some: {} } } }),
      this.prisma.user.count({ where: { deletedAt: null, createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } } }),
      this.prisma.order.count({ where: { userId: { not: null } } }),
    ]);
    return {
      totalCustomers,
      activeCustomers,
      customersWithOrders,
      registeredLast30Days,
      averageOrdersPerCustomer: totalCustomers ? Number((orders / totalCustomers).toFixed(1)) : 0,
    };
  }

  async detail(id: number) {
    const user = await this.prisma.user.findFirst({
      where: { id, deletedAt: null },
      include: { addresses: true, _count: { select: { orders: true, reviews: true } } },
    });
    if (!user) throw new NotFoundException('Customer not found');
    const { passwordHash: _passwordHash, ...safe } = user;
    return safe;
  }

  async update(id: number, dto: UpdateCustomerDto) {
    await this.detail(id);
    const updated = await this.prisma.user.update({ where: { id }, data: dto });
    const { passwordHash: _passwordHash, ...safe } = updated;
    return safe;
  }

  async orders(id: number, page: number, perPage: number) {
    await this.detail(id);
    const where = { userId: id };
    const [items, total] = await Promise.all([
      this.prisma.order.findMany({ where, ...paginationSkipTake(page, perPage), orderBy: { placedAt: 'desc' } }),
      this.prisma.order.count({ where }),
    ]);
    return { items, meta: buildPaginationMeta(page, perPage, total) };
  }
}
