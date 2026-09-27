import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
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
    const settledStatuses = ['PAID', 'PARTIALLY_REFUNDED', 'REFUNDED'] as const;
    if (query.dateFrom && query.dateTo && new Date(query.dateFrom) > new Date(query.dateTo)) {
      throw new BadRequestException('dateFrom cannot be after dateTo');
    }
    const segmentGroups = query.segment && query.segment !== 'POTENTIAL'
      ? await this.prisma.order.groupBy({
          by: ['userId'],
          where: { userId: { not: null }, paymentStatus: { in: [...settledStatuses] } },
          _count: { _all: true },
        })
      : [];
    const segmentUserIds = query.segment === 'RETURNING'
      ? segmentGroups.filter((group) => group._count._all >= 2).map((group) => group.userId!).filter(Boolean)
      : query.segment === 'FIRST_TIME'
        ? segmentGroups.filter((group) => group._count._all === 1).map((group) => group.userId!).filter(Boolean)
        : [];
    const where: Prisma.UserWhereInput = {
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
      ...(query.segment === 'POTENTIAL' ? { orders: { none: { paymentStatus: { in: [...settledStatuses] } } } } : {}),
      ...(query.segment === 'FIRST_TIME' || query.segment === 'RETURNING' ? { id: { in: segmentUserIds } } : {}),
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
      where: { userId: { in: customerIds }, paymentStatus: { in: [...settledStatuses] } },
      _sum: { total: true },
      _count: { _all: true },
    }) : [];
    const salesByCustomer = new Map(sales.map((row) => [row.userId, { totalSpend: Number(row._sum.total ?? 0), settledOrderCount: row._count._all }]));
    return {
      items: items.map(({ orders, ...item }) => {
        const purchase = salesByCustomer.get(item.id);
        const settledOrderCount = purchase?.settledOrderCount ?? 0;
        return {
          ...item,
          totalSpend: purchase?.totalSpend ?? 0,
          settledOrderCount,
          customerSegment: settledOrderCount >= 2 ? 'RETURNING' : settledOrderCount === 1 ? 'FIRST_TIME' : 'POTENTIAL',
          lastOrderAt: orders[0]?.placedAt ?? null,
        };
      }),
      meta: buildPaginationMeta(page, perPage, total),
    };
  }

  async summary() {
    const [totalCustomers, activeCustomers, customersWithOrders, registeredLast30Days, orders, returningCustomerRows] = await Promise.all([
      this.prisma.user.count({ where: { deletedAt: null } }),
      this.prisma.user.count({ where: { deletedAt: null, status: 'ACTIVE' } }),
      this.prisma.user.count({ where: { deletedAt: null, orders: { some: {} } } }),
      this.prisma.user.count({ where: { deletedAt: null, createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } } }),
      this.prisma.order.count({ where: { userId: { not: null } } }),
      this.prisma.$queryRaw<{ count: bigint }[]>`
        SELECT COUNT(*)::bigint AS count
        FROM (
          SELECT o.user_id
          FROM orders o
          INNER JOIN users u ON u.id = o.user_id
          WHERE u.deleted_at IS NULL
            AND o.payment_status IN ('PAID', 'PARTIALLY_REFUNDED', 'REFUNDED')
          GROUP BY o.user_id
          HAVING COUNT(o.id) >= 2
        ) returning_customers
      `,
    ]);
    return {
      totalCustomers,
      activeCustomers,
      customersWithOrders,
      returningCustomers: Number(returningCustomerRows[0]?.count ?? 0),
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

  async remove(id: number): Promise<void> {
    await this.detail(id);
    await this.prisma.user.update({ where: { id }, data: { deletedAt: new Date() } });
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
