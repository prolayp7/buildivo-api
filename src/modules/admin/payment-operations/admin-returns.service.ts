import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, ReturnRequestStatus } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { buildPaginationMeta, paginationSkipTake } from '../../../common/pagination';
import { dateRange } from '../../../common/date-range';
import { AuditService } from '../../../common/audit/audit.service';
import { EmailService } from '../../email/email.service';
import { notificationEmail } from '../../email/email-templates';
import { ReturnImageStorage } from '../../returns/return-image.storage';
import { heldQuantity, itemRefund, round2, unitsRefund } from '../../returns/return-rules';
import { ReturnActor, ReturnsCoreService } from '../../returns/returns-core.service';
import { RETURN_REASON_LABELS } from '../../storefront/returns/returns.service';
import { PaymentOperationsService } from './payment-operations.service';
import { ListReturnsQueryDto } from './dto/list-returns-query.dto';
import { ApproveReturnDto, InspectItemDto, ReceiveReturnDto, RejectReturnDto, SchedulePickupDto } from './dto/return-workflow.dto';

const MAX_INSPECTION_IMAGES_PER_ITEM = 10;

const detailInclude = {
  user: { select: { id: true, email: true, firstName: true, lastName: true, phone: true } },
  order: {
    include: {
      items: { select: { id: true, quantity: true, subtotal: true, discount: true, returnItems: { select: { id: true, quantity: true, approvedQuantity: true, receivedQuantity: true, acceptedQuantity: true, inspectionResult: true, returnRequestId: true, returnRequest: { select: { status: true, shippingRefund: true } } } } } },
      paymentTransactions: { where: { status: 'CAPTURED' as const }, orderBy: { createdAt: 'desc' as const }, take: 1, select: { id: true, provider: true, providerTransactionId: true, amount: true, currency: true } },
    },
  },
  items: {
    orderBy: { id: 'asc' as const },
    include: {
      orderItem: { select: { id: true, titleSnapshot: true, variantTitleSnapshot: true, skuSnapshot: true, productId: true, quantity: true, unitPrice: true, subtotal: true, discount: true, returnDeadline: true, returnEligible: true } },
      images: { orderBy: { id: 'asc' as const }, select: { id: true, type: true, createdAt: true } },
    },
  },
  events: { orderBy: { createdAt: 'asc' as const } },
  refunds: { orderBy: { createdAt: 'desc' as const }, include: { transaction: { select: { provider: true, providerTransactionId: true } } } },
};
type ReturnDetail = Prisma.ReturnRequestGetPayload<{ include: typeof detailInclude }>;

@Injectable()
export class AdminReturnsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly core: ReturnsCoreService,
    private readonly images: ReturnImageStorage,
    private readonly payments: PaymentOperationsService,
    private readonly audit: AuditService,
    private readonly emailService: EmailService,
  ) {}

  async list(query: ListReturnsQueryDto) {
    const page = query.page!; const perPage = query.perPage!;
    const q = query.q?.trim();
    const [first, ...rest] = q ? q.split(/\s+/) : [];
    const where: Prisma.ReturnRequestWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...dateRange(query.dateFrom, query.dateTo),
      ...(q ? { OR: [
        { returnNumber: { contains: q, mode: 'insensitive' } },
        { order: { orderNumber: { contains: q, mode: 'insensitive' } } },
        { items: { some: { orderItem: { titleSnapshot: { contains: q, mode: 'insensitive' } } } } },
        { user: { email: { contains: q, mode: 'insensitive' } } },
        rest.length
          ? { user: { firstName: { contains: first, mode: 'insensitive' }, lastName: { contains: rest.join(' '), mode: 'insensitive' } } }
          : { user: { OR: [{ firstName: { contains: q, mode: 'insensitive' } }, { lastName: { contains: q, mode: 'insensitive' } }] } },
      ] } : {}),
    };
    const [requests, total, counts] = await Promise.all([
      this.prisma.returnRequest.findMany({
        where, ...paginationSkipTake(page, perPage), orderBy: { createdAt: 'desc' },
        include: {
          user: { select: { id: true, email: true, firstName: true, lastName: true } },
          order: { select: { id: true, orderNumber: true, subtotal: true, discountTotal: true, shippingCharge: true } },
          items: { include: { orderItem: { select: { quantity: true, subtotal: true, discount: true } } } },
        },
      }),
      this.prisma.returnRequest.count({ where }),
      this.prisma.returnRequest.groupBy({ by: ['status'], _count: { _all: true } }),
    ]);
    const items = requests.map((request) => {
      const money = { subtotal: Number(request.order.subtotal), discountTotal: Number(request.order.discountTotal), shippingCharge: Number(request.order.shippingCharge) };
      const refundAmount = round2(request.items.reduce((sum, item) => {
        if (item.refundAmount !== null) return sum + Number(item.refundAmount);
        const units = heldQuantity(item, 'RETURN_REQUESTED');
        return sum + unitsRefund({ quantity: item.orderItem.quantity, subtotal: Number(item.orderItem.subtotal), discount: Number(item.orderItem.discount) }, money, units);
      }, 0) + Number(request.shippingRefund));
      return {
        id: request.id, returnNumber: request.returnNumber, status: request.status, createdAt: request.createdAt,
        order: { id: request.order.id, orderNumber: request.order.orderNumber }, user: request.user,
        itemCount: request.items.length, unitCount: request.items.reduce((sum, item) => sum + item.quantity, 0), refundAmount,
      };
    });
    const summary = Object.fromEntries(counts.map((row) => [row.status, row._count._all]));
    return { items, meta: { ...buildPaginationMeta(page, perPage, total), summary } };
  }

  private async load(id: number): Promise<ReturnDetail> {
    const request = await this.prisma.returnRequest.findUnique({ where: { id }, include: detailInclude });
    if (!request) throw new NotFoundException('Return not found');
    return request;
  }

  private require(request: { status: ReturnRequestStatus }, allowed: ReturnRequestStatus[], action: string) {
    if (!allowed.includes(request.status)) throw new ConflictException(`Cannot ${action} a return that is ${request.status.replace(/_/g, ' ').toLowerCase()}`);
  }

  private notify(request: { order: { email: string; orderNumber: string }; returnNumber: string }, title: string, message: string) {
    const email = notificationEmail({ title, message: `${message}\n\nReturn ${request.returnNumber} · Order ${request.order.orderNumber}` });
    void this.emailService.send(request.order.email, email.subject, email.html);
  }

  /** Refund per item (backend-calculated) plus the delivery charge when this return completes the order. */
  private calculation(request: ReturnDetail) {
    const money = { subtotal: Number(request.order.subtotal), discountTotal: Number(request.order.discountTotal), shippingCharge: Number(request.order.shippingCharge) };
    const lines = request.items.map((item) => {
      const line = { quantity: item.orderItem.quantity, subtotal: Number(item.orderItem.subtotal), discount: Number(item.orderItem.discount) };
      const inspected = item.inspectionResult !== null;
      const units = inspected ? item.acceptedQuantity ?? 0 : item.receivedQuantity ?? item.approvedQuantity ?? item.quantity;
      const beforeDeduction = unitsRefund(line, money, units);
      const deduction = Number(item.deductionAmount);
      return {
        returnItemId: item.id, title: item.orderItem.titleSnapshot, units, unitPrice: unitsRefund(line, money, 1), beforeDeduction,
        deduction, deductionReason: item.deductionReason, refund: inspected ? itemRefund(line, money, units, deduction) : beforeDeduction, final: inspected,
      };
    });
    // Delivery is refunded only when, after this return, every unit of the order is returned and no
    // earlier return has already refunded it (UK Consumer Contracts Regulations minimum).
    const acceptedHere = new Map(request.items.map((item) => [item.orderItemId, item.inspectionResult ? item.acceptedQuantity ?? 0 : item.receivedQuantity ?? item.approvedQuantity ?? item.quantity]));
    const shippingAlreadyRefunded = request.order.items.some((orderItem) => orderItem.returnItems.some((ri) => ri.returnRequestId !== request.id && ri.returnRequest.status === 'COMPLETED' && Number(ri.returnRequest.shippingRefund) > 0));
    const everythingReturned = request.order.items.every((orderItem) => {
      const elsewhere = orderItem.returnItems.filter((ri) => ri.returnRequestId !== request.id && ri.returnRequest.status === 'COMPLETED').reduce((sum, ri) => sum + (ri.acceptedQuantity ?? 0), 0);
      return elsewhere + (acceptedHere.get(orderItem.id) ?? 0) >= orderItem.quantity;
    });
    const shipping = !shippingAlreadyRefunded && everythingReturned ? money.shippingCharge : 0;
    const itemsTotal = round2(lines.reduce((sum, line) => sum + line.refund, 0));
    const transaction = request.order.paymentTransactions[0];
    return { lines, itemsTotal, shipping, total: round2(itemsTotal + shipping), method: transaction?.provider ?? null, capturedAmount: transaction ? Number(transaction.amount) : 0 };
  }

  async detail(id: number) {
    const request = await this.load(id);
    const state = new Map((await this.core.orderReturnState(request.orderId)).map((line) => [line.orderItemId, line]));
    const transaction = request.order.paymentTransactions[0] ?? null;
    return {
      id: request.id, returnNumber: request.returnNumber, status: request.status, createdAt: request.createdAt, updatedAt: request.updatedAt,
      rejectionReason: request.rejectionReason, shippingRefund: Number(request.shippingRefund),
      customer: request.user,
      order: {
        id: request.order.id, orderNumber: request.order.orderNumber, status: request.order.status, paymentStatus: request.order.paymentStatus,
        total: Number(request.order.total), shippingCharge: Number(request.order.shippingCharge), placedAt: request.order.placedAt,
        deliveryAddress: { fullName: request.order.shippingFullName, line1: request.order.shippingLine1, line2: request.order.shippingLine2, city: request.order.shippingCity, county: request.order.shippingCounty, postcode: request.order.shippingPostcode, phone: request.order.shippingPhone },
        payment: transaction ? { provider: transaction.provider, transactionId: transaction.providerTransactionId, amount: Number(transaction.amount), currency: transaction.currency } : null,
      },
      pickupAddress: { fullName: request.pickupFullName, line1: request.pickupLine1, line2: request.pickupLine2, city: request.pickupCity, county: request.pickupCounty, postcode: request.pickupPostcode, phone: request.pickupPhone },
      pickup: { courier: request.courier, date: request.pickupDate, window: request.pickupWindow, trackingNumber: request.trackingNumber, notes: request.pickupNotes },
      items: request.items.map((item) => {
        const line = state.get(item.orderItemId);
        return {
          id: item.id, orderItemId: item.orderItemId, title: item.orderItem.titleSnapshot, variant: item.orderItem.variantTitleSnapshot, sku: item.orderItem.skuSnapshot, productId: item.orderItem.productId,
          orderedQuantity: item.orderItem.quantity,
          // Units held by this customer's other returns of the same order line.
          previouslyReturned: Math.max(0, (line?.previouslyReturned ?? 0) - heldQuantity(item, request.status)),
          quantity: item.quantity, approvedQuantity: item.approvedQuantity, receivedQuantity: item.receivedQuantity, acceptedQuantity: item.acceptedQuantity,
          reason: item.reason, reasonLabel: RETURN_REASON_LABELS[item.reason], reasonOther: item.reasonOther, description: item.description,
          returnDeadline: item.orderItem.returnDeadline, returnEligible: item.orderItem.returnEligible,
          condition: item.condition, accessoriesPresent: item.accessoriesPresent, inspectionNotes: item.inspectionNotes, inspectionResult: item.inspectionResult, inspectionRejectionReason: item.inspectionRejectionReason,
          refundAmount: item.refundAmount === null ? null : Number(item.refundAmount), deductionAmount: Number(item.deductionAmount), deductionReason: item.deductionReason,
          customerImages: item.images.filter((image) => image.type === 'CUSTOMER_EVIDENCE').map((image) => image.id),
          inspectionImages: item.images.filter((image) => image.type === 'ADMIN_INSPECTION').map((image) => image.id),
        };
      }),
      calculation: this.calculation(request),
      refunds: request.refunds.map((refund) => ({ id: refund.id, amount: Number(refund.amount), status: refund.status, attempt: refund.attempt, providerRefundId: refund.providerRefundId, failureReason: refund.failureReason, processedAt: refund.processedAt, createdAt: refund.createdAt, provider: refund.transaction.provider, transactionId: refund.transaction.providerTransactionId })),
      events: request.events,
    };
  }

  async approve(id: number, dto: ApproveReturnDto, adminId: number) {
    const request = await this.load(id);
    this.require(request, ['RETURN_REQUESTED'], 'approve');
    const quantities = new Map(dto.items.map((item) => [item.returnItemId, item.quantity]));
    if (request.items.some((item) => !quantities.has(item.id)) || quantities.size !== request.items.length) throw new BadRequestException('Give an approved quantity for every item in the return');
    for (const item of request.items) if (quantities.get(item.id)! > item.quantity) throw new BadRequestException(`${item.orderItem.titleSnapshot}: approved quantity cannot exceed the ${item.quantity} requested`);
    if (![...quantities.values()].some((quantity) => quantity > 0)) throw new BadRequestException('Approve at least one unit, or reject the return instead');
    const actor: ReturnActor = { type: 'ADMIN', id: adminId };
    await this.prisma.$transaction(async (tx) => {
      for (const item of request.items) await tx.returnItem.update({ where: { id: item.id }, data: { approvedQuantity: quantities.get(item.id)! } });
      await this.core.setStatus(tx, id, 'RETURN_APPROVED', { action: 'return.approved', note: dto.note?.trim() || null, actor });
    });
    await this.audit.log({ action: 'return.approved', entity: 'ReturnRequest', entityId: id, actor: { type: 'ADMIN', id: adminId }, meta: { quantities: Object.fromEntries(quantities) } });
    this.notify(request, 'Your return has been approved', 'Your return request has been approved. Pickup will be scheduled shortly, and we will email you the collection details.');
    return this.detail(id);
  }

  async reject(id: number, dto: RejectReturnDto, adminId: number) {
    const request = await this.load(id);
    this.require(request, ['RETURN_REQUESTED', 'RETURN_APPROVED', 'PICKUP_SCHEDULED'], 'reject');
    const reason = dto.reason.trim();
    await this.core.setStatus(this.prisma, id, 'RETURN_REJECTED', { action: 'return.rejected', note: reason, actor: { type: 'ADMIN', id: adminId }, data: { rejectionReason: reason } });
    await this.audit.log({ action: 'return.rejected', entity: 'ReturnRequest', entityId: id, actor: { type: 'ADMIN', id: adminId }, meta: { reason } });
    this.notify(request, 'Your return request was not approved', `We could not accept your return request.\n\nReason: ${reason}\n\nIf you have questions, just reply to this email.`);
    return this.detail(id);
  }

  async schedulePickup(id: number, dto: SchedulePickupDto, adminId: number) {
    const request = await this.load(id);
    this.require(request, ['RETURN_APPROVED', 'PICKUP_SCHEDULED'], 'schedule a pickup for');
    const pickupDate = new Date(dto.pickupDate);
    const data = { courier: dto.courier.trim(), pickupDate, pickupWindow: dto.pickupWindow?.trim() || null, trackingNumber: dto.trackingNumber?.trim() || null, pickupNotes: dto.notes?.trim() || null };
    const when = `${pickupDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })}${data.pickupWindow ? `, ${data.pickupWindow}` : ''}`;
    await this.core.setStatus(this.prisma, id, 'PICKUP_SCHEDULED', { action: request.status === 'PICKUP_SCHEDULED' ? 'pickup.rescheduled' : 'pickup.scheduled', note: `${data.courier} · ${when}${data.trackingNumber ? ` · Tracking ${data.trackingNumber}` : ''}`, actor: { type: 'ADMIN', id: adminId }, data });
    this.notify(request, 'Your return collection is booked', `Courier: ${data.courier}\nCollection: ${when}${data.trackingNumber ? `\nTracking number: ${data.trackingNumber}` : ''}\n\nPlease have the items packed and ready.`);
    return this.detail(id);
  }

  async markPickedUp(id: number, adminId: number) {
    const request = await this.load(id);
    this.require(request, ['PICKUP_SCHEDULED'], 'mark as picked up');
    await this.core.setStatus(this.prisma, id, 'PICKED_UP', { action: 'pickup.completed', actor: { type: 'ADMIN', id: adminId } });
    this.notify(request, 'Your return has been collected', 'Your returned items have been picked up by the courier and are on their way to us.');
    return this.detail(id);
  }

  async receive(id: number, dto: ReceiveReturnDto, adminId: number) {
    const request = await this.load(id);
    this.require(request, ['PICKUP_SCHEDULED', 'PICKED_UP'], 'mark as received');
    const quantities = new Map(dto.items.map((item) => [item.returnItemId, item.quantity]));
    for (const item of request.items) {
      const received = quantities.get(item.id);
      if (received === undefined) throw new BadRequestException('Give a received quantity for every item in the return');
      if (received > (item.approvedQuantity ?? 0)) throw new BadRequestException(`${item.orderItem.titleSnapshot}: received quantity cannot exceed the ${item.approvedQuantity ?? 0} approved`);
    }
    const note = request.items.map((item) => `${item.orderItem.titleSnapshot}: expected ${item.approvedQuantity ?? 0}, received ${quantities.get(item.id)}`).join('; ');
    await this.prisma.$transaction(async (tx) => {
      for (const item of request.items) await tx.returnItem.update({ where: { id: item.id }, data: { receivedQuantity: quantities.get(item.id)! } });
      await this.core.setStatus(tx, id, 'RETURN_RECEIVED', { action: 'return.received', note, actor: { type: 'ADMIN', id: adminId } });
    });
    this.notify(request, 'We have received your return', 'We have received your returned items. They are now being inspected, and we will let you know the outcome.');
    return this.detail(id);
  }

  async startInspection(id: number, adminId: number) {
    const request = await this.load(id);
    this.require(request, ['RETURN_RECEIVED'], 'start inspecting');
    await this.core.setStatus(this.prisma, id, 'INSPECTION', { action: 'inspection.started', actor: { type: 'ADMIN', id: adminId } });
    return this.detail(id);
  }

  async inspectItem(id: number, returnItemId: number, dto: InspectItemDto, adminId: number) {
    const request = await this.load(id);
    this.require(request, ['INSPECTION'], 'record an inspection on');
    const item = request.items.find((candidate) => candidate.id === returnItemId);
    if (!item) throw new NotFoundException('Return item not found');
    const received = item.receivedQuantity ?? 0;
    const accepted = dto.result === 'ACCEPTED' ? received : dto.result === 'REJECTED' ? 0 : dto.acceptedQuantity;
    if (dto.result === 'PARTIALLY_ACCEPTED' && (accepted === undefined || accepted < 1 || accepted >= received)) throw new BadRequestException(`A partial acceptance must accept between 1 and ${Math.max(1, received - 1)} of the ${received} received`);
    if (dto.result === 'REJECTED' && !dto.rejectionReason?.trim()) throw new BadRequestException('Give the reason this item is rejected');
    const deduction = dto.result === 'REJECTED' ? 0 : dto.deductionAmount ?? 0;
    if (deduction > 0 && !dto.deductionReason?.trim()) throw new BadRequestException('Every deduction needs a reason');

    const money = { subtotal: Number(request.order.subtotal), discountTotal: Number(request.order.discountTotal), shippingCharge: Number(request.order.shippingCharge) };
    const line = { quantity: item.orderItem.quantity, subtotal: Number(item.orderItem.subtotal), discount: Number(item.orderItem.discount) };
    if (deduction > unitsRefund(line, money, accepted!)) throw new BadRequestException('The deduction cannot exceed the item refund');
    const refundAmount = itemRefund(line, money, accepted!, deduction);

    await this.prisma.$transaction(async (tx) => {
      await tx.returnItem.update({
        where: { id: returnItemId },
        data: {
          condition: dto.condition, accessoriesPresent: dto.accessoriesPresent, inspectionNotes: dto.notes?.trim() || null,
          inspectionResult: dto.result, acceptedQuantity: accepted!, inspectionRejectionReason: dto.result === 'REJECTED' ? dto.rejectionReason!.trim() : null,
          deductionAmount: deduction, deductionReason: deduction > 0 ? dto.deductionReason!.trim() : null, refundAmount,
        },
      });
      await this.core.addEvent(tx, id, { action: 'inspection.item', note: `${item.orderItem.titleSnapshot}: ${dto.result.replace(/_/g, ' ').toLowerCase()} (${accepted} of ${received})${deduction ? ` · deduction ${deduction.toFixed(2)}: ${dto.deductionReason!.trim()}` : ''}`, actor: { type: 'ADMIN', id: adminId } });
    });
    await this.audit.log({ action: 'return.inspected', entity: 'ReturnItem', entityId: returnItemId, actor: { type: 'ADMIN', id: adminId }, meta: { result: dto.result, accepted, deduction, deductionReason: dto.deductionReason ?? null, refundAmount } });
    return this.detail(id);
  }

  async addInspectionImages(id: number, returnItemId: number, files: { buffer: Buffer; size: number }[], adminId: number) {
    const request = await this.load(id);
    this.require(request, ['RETURN_RECEIVED', 'INSPECTION'], 'add inspection photos to');
    const item = request.items.find((candidate) => candidate.id === returnItemId);
    if (!item) throw new NotFoundException('Return item not found');
    if (!files.length) throw new BadRequestException('Choose at least one photo');
    const existing = item.images.filter((image) => image.type === 'ADMIN_INSPECTION').length;
    if (existing + files.length > MAX_INSPECTION_IMAGES_PER_ITEM) throw new BadRequestException(`Up to ${MAX_INSPECTION_IMAGES_PER_ITEM} inspection photos per item`);
    const saved: { storageKey: string; mimeType: string; sizeBytes: number }[] = [];
    try {
      for (const file of files) saved.push(await this.images.save(file));
      await this.prisma.returnItemImage.createMany({ data: saved.map((image) => ({ ...image, returnItemId, type: 'ADMIN_INSPECTION' as const, uploadedByAdminId: adminId })) });
    } catch (error) {
      await Promise.all(saved.map((image) => this.images.remove(image.storageKey)));
      throw error;
    }
    return this.detail(id);
  }

  async image(id: number, imageId: number) {
    const image = await this.prisma.returnItemImage.findFirst({ where: { id: imageId, returnItem: { returnRequestId: id } } });
    if (!image) throw new NotFoundException('Image not found');
    return { buffer: await this.images.read(image.storageKey), mimeType: image.mimeType };
  }

  /** After every received item is inspected: approve the backend-calculated refund and send it. */
  async approveRefund(id: number, adminId: number) {
    const request = await this.load(id);
    this.require(request, ['INSPECTION'], 'approve the refund for');
    const pending = request.items.filter((item) => (item.receivedQuantity ?? 0) > 0 && !item.inspectionResult);
    if (pending.length) throw new BadRequestException(`Inspect every received item first: ${pending.map((item) => item.orderItem.titleSnapshot).join(', ')}`);
    const calculation = this.calculation(request);
    const actor: ReturnActor = { type: 'ADMIN', id: adminId };

    await this.prisma.$transaction(async (tx) => {
      // Items never received (or not approved) are closed as rejected so quantities stay consistent.
      for (const item of request.items.filter((candidate) => !candidate.inspectionResult)) {
        await tx.returnItem.update({ where: { id: item.id }, data: { inspectionResult: 'REJECTED', acceptedQuantity: 0, refundAmount: 0, inspectionRejectionReason: (item.approvedQuantity ?? 0) === 0 ? 'Not approved for return' : 'Not received' } });
      }
      await this.core.setStatus(tx, id, 'REFUND_APPROVED', { action: 'refund.approved', note: `Refund of ${calculation.total.toFixed(2)} approved (items ${calculation.itemsTotal.toFixed(2)}${calculation.shipping ? `, delivery ${calculation.shipping.toFixed(2)}` : ''})`, actor, data: { shippingRefund: calculation.shipping } });
    });
    await this.audit.log({ action: 'return.refund_approved', entity: 'ReturnRequest', entityId: id, actor: { type: 'ADMIN', id: adminId }, meta: calculation });

    if (calculation.total <= 0) {
      // Nothing to pay back (everything rejected at inspection): the return closes without a refund.
      await this.prisma.$transaction(async (tx) => {
        await this.core.setStatus(tx, id, 'COMPLETED', { action: 'return.completed', note: 'No refund due after inspection', actor });
        await this.core.settleOrderStatus(tx, request.orderId, actor);
      });
      this.notify(request, 'Your return has been inspected', 'We have inspected your returned items. Unfortunately no refund is due - see your return in My Account for the details of each item.');
      return this.detail(id);
    }
    return this.sendRefund(id, calculation.total, adminId, 1);
  }

  /** A failed refund goes back to REFUND_APPROVED; retry sends whatever is still outstanding. */
  async retryRefund(id: number, adminId: number) {
    const request = await this.load(id);
    this.require(request, ['REFUND_APPROVED'], 'retry the refund for');
    const calculation = this.calculation(request);
    const committed = request.refunds.filter((refund) => refund.status !== 'FAILED' && refund.status !== 'CANCELLED').reduce((sum, refund) => sum + Number(refund.amount), 0);
    const outstanding = round2(calculation.total - committed);
    if (outstanding <= 0) throw new ConflictException('Nothing is left to refund for this return');
    const attempts = request.refunds.length;
    return this.sendRefund(id, outstanding, adminId, attempts + 1);
  }

  private async sendRefund(id: number, amount: number, adminId: number, attempt: number) {
    const request = await this.load(id);
    await this.core.setStatus(this.prisma, id, 'REFUND_PROCESSING', { action: 'refund.processing', note: `Refund of ${amount.toFixed(2)} sent to the payment provider${attempt > 1 ? ` (attempt ${attempt})` : ''}`, actor: { type: 'ADMIN', id: adminId } });
    // Settlement (now for an instant confirmation, or later via webhook) completes the return, or
    // puts it back to REFUND_APPROVED with the failure reason so it can be retried.
    try {
      await this.payments.issueRefund({ orderId: request.orderId, amount, reason: `Return ${request.returnNumber}`, adminId, returnRequestId: id, attempt });
    } catch (error) {
      // Refused before reaching the provider (e.g. no captured payment): back to approved, retryable.
      await this.core.setStatus(this.prisma, id, 'REFUND_APPROVED', { action: 'refund.failed', note: error instanceof Error ? error.message : String(error), actor: { type: 'ADMIN', id: adminId } });
      throw error;
    }
    return this.detail(id);
  }
}
