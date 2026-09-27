import { BadRequestException, Injectable } from '@nestjs/common'; import { Prisma } from '@prisma/client'; import { PrismaService } from '../../../prisma/prisma.service'; import { DateRangeQueryDto, InventoryReportQueryDto, ProductsReportQueryDto, SalesReportQueryDto } from './dto/report-queries.dto';
@Injectable() export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}
  private range(from: string, to: string) { const dateFrom = new Date(from); const dateTo = new Date(to); if (dateFrom > dateTo) throw new BadRequestException('dateFrom cannot be after dateTo'); return { gte: dateFrom, lte: dateTo }; }
  private optionalRange(from?: string, to?: string) { if (from && to) return this.range(from, to); return { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(to) } : {}) }; }
  private period(date: Date, group: 'day' | 'week' | 'month') { const value = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())); if (group === 'week') value.setUTCDate(value.getUTCDate() - ((value.getUTCDay() + 6) % 7)); if (group === 'month') value.setUTCDate(1); return value.toISOString().slice(0, 10); }
  async sales(query: SalesReportQueryDto) {
    const range = this.range(query.dateFrom, query.dateTo);
    const orders = await this.prisma.order.findMany({
      where: { placedAt: range, paymentStatus: { in: ['PAID', 'PARTIALLY_REFUNDED', 'REFUNDED'] } },
      select: { placedAt: true, total: true, paymentRefunds: { where: { status: 'PROCESSED' }, select: { amount: true } } },
    });
    const values = new Map<string, { grossRevenue: number; refundTotal: number; orderCount: number }>();
    for (const order of orders) {
      const key = this.period(order.placedAt, query.groupBy);
      const point = values.get(key) ?? { grossRevenue: 0, refundTotal: 0, orderCount: 0 };
      point.grossRevenue += Number(order.total);
      point.refundTotal += order.paymentRefunds.reduce((sum, refund) => sum + Number(refund.amount), 0);
      point.orderCount++;
      values.set(key, point);
    }
    const points: { period: string; grossRevenue: number; refundTotal: number; revenue: number; orderCount: number }[] = [];
    const end = new Date(range.lte);
    const cursor = new Date(`${this.period(range.gte, query.groupBy)}T00:00:00.000Z`);
    while (cursor <= end) {
      const period = cursor.toISOString().slice(0, 10);
      const value = values.get(period) ?? { grossRevenue: 0, refundTotal: 0, orderCount: 0 };
      const grossRevenue = Number(value.grossRevenue.toFixed(2));
      const refundTotal = Number(value.refundTotal.toFixed(2));
      points.push({ period, grossRevenue, refundTotal, revenue: Number((grossRevenue - refundTotal).toFixed(2)), orderCount: value.orderCount });
      if (query.groupBy === 'day') cursor.setUTCDate(cursor.getUTCDate() + 1);
      else if (query.groupBy === 'week') cursor.setUTCDate(cursor.getUTCDate() + 7);
      else cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    }
    return { points };
  }
  async products(query: ProductsReportQueryDto) {
    const placedAt = this.optionalRange(query.dateFrom, query.dateTo);
    const sold = await this.prisma.orderItem.groupBy({
      by: ['productId'],
      where: {
        status: { notIn: ['CANCELLED', 'RETURNED', 'REFUNDED'] },
        order: { paymentStatus: { in: ['PAID', 'PARTIALLY_REFUNDED'] }, ...(Object.keys(placedAt).length ? { placedAt } : {}) },
      },
      _sum: { quantity: true, subtotal: true },
    });
    const products = await this.prisma.product.findMany({ where: { deletedAt: null }, select: { id: true, title: true, variants: { where: { deletedAt: null }, select: { stockQty: true } } } });
    const sales = new Map(sold.map(row => [row.productId, row]));
    const rows = products.map(product => ({ productId: product.id, title: product.title, unitsSold: sales.get(product.id)?._sum.quantity ?? 0, revenue: Number(sales.get(product.id)?._sum.subtotal ?? 0), stockQty: product.variants.reduce((sum, variant) => sum + variant.stockQty, 0) }));
    const sort = query.sort ?? 'best';
    rows.sort((a, b) => sort === 'stock' ? a.stockQty - b.stockQty : sort === 'worst' ? a.unitsSold - b.unitsSold : b.unitsSold - a.unitsSold);
    return { rows };
  }
  async customers(query: DateRangeQueryDto) {
    const range = this.range(query.dateFrom, query.dateTo);
    const settled: Prisma.OrderWhereInput['paymentStatus'] = { in: ['PAID', 'PARTIALLY_REFUNDED'] };
    const during = await this.prisma.order.findMany({ where: { placedAt: range, userId: { not: null }, paymentStatus: settled }, distinct: ['userId'], select: { userId: true } });
    const ids = during.map(row => row.userId!).filter(Boolean);
    const prior = ids.length ? await this.prisma.order.findMany({ where: { userId: { in: ids }, placedAt: { lt: range.gte }, paymentStatus: settled }, distinct: ['userId'], select: { userId: true } }) : [];
    const newCustomers = ids.length - prior.length;
    const spendOrders = await this.prisma.order.findMany({
      where: { placedAt: range, userId: { not: null }, paymentStatus: settled },
      select: { userId: true, total: true, paymentRefunds: { where: { status: 'PROCESSED' }, select: { amount: true } } },
    });
    const spendByCustomer = new Map<number, { totalSpent: number; orderCount: number }>();
    for (const order of spendOrders) {
      if (!order.userId) continue;
      const current = spendByCustomer.get(order.userId) ?? { totalSpent: 0, orderCount: 0 };
      current.totalSpent += Number(order.total) - order.paymentRefunds.reduce((sum, refund) => sum + Number(refund.amount), 0);
      current.orderCount++;
      spendByCustomer.set(order.userId, current);
    }
    const topSpenders = [...spendByCustomer].sort(([, a], [, b]) => b.totalSpent - a.totalSpent).slice(0, 10);
    const users = await this.prisma.user.findMany({ where: { id: { in: topSpenders.map(([id]) => id) } }, select: { id: true, email: true, firstName: true, lastName: true } });
    const byId = new Map(users.map(user => [user.id, user]));
    return { newCustomers, returningCustomers: prior.length, topSpenders: topSpenders.map(([id, spend]) => ({ user: byId.get(id), ...spend })) };
  }
  async inventory(query: InventoryReportQueryDto) { const variants = await this.prisma.productVariant.findMany({ where: { deletedAt: null, product: { deletedAt: null } }, include: { product: true }, orderBy: { stockQty: 'asc' } }); return variants.filter(variant => variant.stockQty <= (query.threshold ?? variant.lowStockThreshold)); }
  async orders(query: DateRangeQueryDto) { const range = this.range(query.dateFrom, query.dateTo); const [statuses, payments] = await Promise.all([this.prisma.order.groupBy({ by: ['status'], where: { placedAt: range }, _count: { id: true } }), this.prisma.order.groupBy({ by: ['paymentStatus'], where: { placedAt: range }, _count: { id: true } })]); return { byStatus: Object.fromEntries(statuses.map(row => [row.status, row._count.id])), byPaymentStatus: Object.fromEntries(payments.map(row => [row.paymentStatus, row._count.id])) }; }
  async categoryBrandSales(query: DateRangeQueryDto) {
    const range = this.range(query.dateFrom, query.dateTo);
    const items = await this.prisma.orderItem.findMany({
      where: { status: { notIn: ['CANCELLED', 'RETURNED', 'REFUNDED'] }, order: { placedAt: range, paymentStatus: { in: ['PAID', 'PARTIALLY_REFUNDED'] } } },
      select: { subtotal: true, quantity: true, product: { select: { categoryId: true, brandId: true } } },
    });
    const byCategory = new Map<number, { revenue: number; unitsSold: number }>();
    const byBrand = new Map<number, { revenue: number; unitsSold: number }>();
    for (const item of items) {
      const catPoint = byCategory.get(item.product.categoryId) ?? { revenue: 0, unitsSold: 0 };
      catPoint.revenue += Number(item.subtotal); catPoint.unitsSold += item.quantity;
      byCategory.set(item.product.categoryId, catPoint);
      if (item.product.brandId) {
        const brandPoint = byBrand.get(item.product.brandId) ?? { revenue: 0, unitsSold: 0 };
        brandPoint.revenue += Number(item.subtotal); brandPoint.unitsSold += item.quantity;
        byBrand.set(item.product.brandId, brandPoint);
      }
    }
    const [categories, brands] = await Promise.all([
      this.prisma.category.findMany({ where: { id: { in: [...byCategory.keys()] } }, select: { id: true, title: true } }),
      this.prisma.brand.findMany({ where: { id: { in: [...byBrand.keys()] } }, select: { id: true, title: true } }),
    ]);
    const categoryTitles = new Map(categories.map(c => [c.id, c.title]));
    const brandTitles = new Map(brands.map(b => [b.id, b.title]));
    return {
      byCategory: [...byCategory].map(([id, v]) => ({ categoryId: id, title: categoryTitles.get(id) ?? 'Unknown', revenue: Number(v.revenue.toFixed(2)), unitsSold: v.unitsSold })).sort((a, b) => b.revenue - a.revenue),
      byBrand: [...byBrand].map(([id, v]) => ({ brandId: id, title: brandTitles.get(id) ?? 'Unknown', revenue: Number(v.revenue.toFixed(2)), unitsSold: v.unitsSold })).sort((a, b) => b.revenue - a.revenue),
    };
  }
  async coupons(query: DateRangeQueryDto) {
    const range = this.range(query.dateFrom, query.dateTo);
    const lines = await this.prisma.orderCouponLine.findMany({
      where: { order: { placedAt: range, paymentStatus: { in: ['PAID', 'PARTIALLY_REFUNDED'] } } },
      select: { couponId: true, couponCode: true, discountAmount: true, order: { select: { total: true, paymentRefunds: { where: { status: 'PROCESSED' }, select: { amount: true } } } } },
    });
    const byCoupon = new Map<number, { code: string; ordersCount: number; totalDiscount: number; revenue: number }>();
    for (const line of lines) {
      const point = byCoupon.get(line.couponId) ?? { code: line.couponCode, ordersCount: 0, totalDiscount: 0, revenue: 0 };
      point.ordersCount += 1; point.totalDiscount += Number(line.discountAmount); point.revenue += Number(line.order.total) - line.order.paymentRefunds.reduce((sum, refund) => sum + Number(refund.amount), 0);
      byCoupon.set(line.couponId, point);
    }
    return { rows: [...byCoupon].map(([couponId, v]) => ({ couponId, code: v.code, ordersCount: v.ordersCount, totalDiscount: Number(v.totalDiscount.toFixed(2)), revenue: Number(v.revenue.toFixed(2)) })).sort((a, b) => b.ordersCount - a.ordersCount) };
  }
  private postcodeArea(postcode: string): string {
    const match = postcode.trim().toUpperCase().match(/^([A-Z]{1,2})\d/);
    return match ? match[1] : 'UNKNOWN';
  }
  async geography(query: DateRangeQueryDto) {
    const range = this.range(query.dateFrom, query.dateTo);
    const orders = await this.prisma.order.findMany({
      where: { placedAt: range, paymentStatus: { in: ['PAID', 'PARTIALLY_REFUNDED'] } },
      select: { shippingPostcode: true, total: true, paymentRefunds: { where: { status: 'PROCESSED' }, select: { amount: true } } },
    });
    const byArea = new Map<string, { revenue: number; orderCount: number }>();
    for (const order of orders) {
      const area = this.postcodeArea(order.shippingPostcode);
      const point = byArea.get(area) ?? { revenue: 0, orderCount: 0 };
      point.revenue += Number(order.total) - order.paymentRefunds.reduce((sum, refund) => sum + Number(refund.amount), 0); point.orderCount += 1;
      byArea.set(area, point);
    }
    return { rows: [...byArea].map(([postcodeArea, v]) => ({ postcodeArea, orderCount: v.orderCount, revenue: Number(v.revenue.toFixed(2)) })).sort((a, b) => b.revenue - a.revenue) };
  }
}
