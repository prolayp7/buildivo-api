import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ReturnReason } from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { PrismaService } from '../../../prisma/prisma.service';
import { EmailService } from '../../email/email.service';
import { returnRequestedEmail } from '../../email/email-templates';
import { ReturnImageStorage } from '../../returns/return-image.storage';
import { MAX_EVIDENCE_IMAGES_PER_ITEM, round2 } from '../../returns/return-rules';
import { ReturnsCoreService } from '../../returns/returns-core.service';
import { CreateReturnRequestDto } from './dto/create-return-request.dto';

export const RETURN_REASON_LABELS: Record<ReturnReason, string> = {
  DAMAGED: 'Damaged',
  DEFECTIVE: 'Defective / not working',
  WRONG_ITEM: 'Wrong product received',
  MISSING_PARTS: 'Missing parts / accessories',
  NOT_AS_DESCRIBED: "Product doesn't match description",
  POOR_CONDITION: 'Product received in poor condition',
  CHANGED_MIND: 'No longer needed / changed my mind',
  OTHER: 'Other',
};

export type UploadedEvidence = { fieldname: string; buffer: Buffer; size: number };

// What the customer sees of a return: never admin inspection photos, notes or internal ids.
const customerReturnInclude = {
  order: { select: { uuid: true, orderNumber: true } },
  items: {
    orderBy: { id: 'asc' as const },
    include: {
      orderItem: { select: { id: true, titleSnapshot: true, variantTitleSnapshot: true, skuSnapshot: true, productId: true, quantity: true } },
      images: { where: { type: 'CUSTOMER_EVIDENCE' as const }, select: { id: true } },
    },
  },
  events: { orderBy: { createdAt: 'asc' as const }, select: { status: true, action: true, note: true, createdAt: true } },
  refunds: { orderBy: { createdAt: 'desc' as const }, select: { amount: true, status: true, providerRefundId: true, processedAt: true, createdAt: true, transaction: { select: { provider: true } } } },
};

@Injectable()
export class StorefrontReturnsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly core: ReturnsCoreService,
    private readonly images: ReturnImageStorage,
    private readonly emailService: EmailService,
  ) {}

  private async ownedOrder(customerId: number, orderUuid: string) {
    const order = await this.prisma.order.findUnique({ where: { uuid: orderUuid } });
    if (!order || order.userId !== customerId) throw new NotFoundException('Order not found');
    return order;
  }

  /** Every item of one of the customer's orders, with what can still be returned and why not. */
  async returnable(customerId: number, orderUuid: string) {
    const order = await this.ownedOrder(customerId, orderUuid);
    const [items, addresses] = await Promise.all([
      this.core.orderReturnState(order.id),
      this.prisma.address.findMany({ where: { userId: customerId, country: 'GB' }, orderBy: [{ isDefault: 'desc' }, { id: 'asc' }] }),
    ]);
    return {
      order: { uuid: order.uuid, orderNumber: order.orderNumber, status: order.status },
      deliveryAddress: { fullName: order.shippingFullName, line1: order.shippingLine1, line2: order.shippingLine2, city: order.shippingCity, county: order.shippingCounty, postcode: order.shippingPostcode, phone: order.shippingPhone },
      savedAddresses: addresses.map((a) => ({ id: a.id, label: a.label, fullName: a.fullName, line1: a.line1, line2: a.line2, city: a.city, county: a.county, postcode: a.postcode, phone: a.phone })),
      reasons: Object.entries(RETURN_REASON_LABELS).map(([value, label]) => ({ value, label })),
      items,
    };
  }

  /** Validates everything server-side (ownership, eligibility, quantities, photos) and creates one
   * return request with one return item per product. Refund figures are estimates from the order. */
  async create(customerId: number, rawData: string | undefined, files: UploadedEvidence[]) {
    let parsed: unknown;
    try { parsed = JSON.parse(rawData ?? ''); } catch { throw new BadRequestException('Return details are missing'); }
    const dto = plainToInstance(CreateReturnRequestDto, parsed);
    const errors = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });
    if (errors.length) throw new BadRequestException('Return details are invalid: ' + errors.map((error) => Object.values(error.constraints ?? {}).join(', ') || `${error.property} is invalid`).join('; '));

    const order = await this.ownedOrder(customerId, dto.orderUuid);
    const orderItemIds = dto.items.map((item) => item.orderItemId);
    if (new Set(orderItemIds).size !== orderItemIds.length) throw new BadRequestException('Each product can only appear once in a return');

    // Photos: evidence_<index>, at most 5 per item, only for items in this request.
    const photosByItem = new Map<number, UploadedEvidence[]>();
    for (const file of files) {
      const match = /^evidence_(\d+)$/.exec(file.fieldname);
      const index = match ? Number(match[1]) : -1;
      if (index < 0 || index >= dto.items.length) throw new BadRequestException('A photo does not belong to any product in this return');
      photosByItem.set(index, [...(photosByItem.get(index) ?? []), file]);
    }
    for (const photos of photosByItem.values()) if (photos.length > MAX_EVIDENCE_IMAGES_PER_ITEM) throw new BadRequestException(`Up to ${MAX_EVIDENCE_IMAGES_PER_ITEM} photos per product`);

    let address = { fullName: order.shippingFullName, line1: order.shippingLine1, line2: order.shippingLine2, city: order.shippingCity, county: order.shippingCounty, postcode: order.shippingPostcode, phone: order.shippingPhone };
    if (dto.addressId) {
      const saved = await this.prisma.address.findFirst({ where: { id: dto.addressId, userId: customerId, country: 'GB' } });
      if (!saved) throw new BadRequestException('Choose one of your saved UK addresses for collection');
      address = { fullName: saved.fullName, line1: saved.line1, line2: saved.line2, city: saved.city, county: saved.county, postcode: saved.postcode, phone: saved.phone };
    }

    // Re-encode photos before the transaction; clean them up if anything below fails.
    const stored = new Map<number, { storageKey: string; mimeType: string; sizeBytes: number }[]>();
    try {
      for (const [index, photos] of photosByItem) stored.set(index, await Promise.all(photos.map((photo) => this.images.save(photo))));
    } catch (error) {
      await Promise.all([...stored.values()].flat().map((image) => this.images.remove(image.storageKey)));
      throw error;
    }

    try {
      const created = await this.prisma.$transaction(async (tx) => {
        // Eligibility is re-checked inside the transaction so two submissions can't over-return.
        await tx.$executeRaw`SELECT id FROM orders WHERE id = ${order.id} FOR UPDATE`;
        const state = new Map((await this.core.orderReturnState(order.id, tx)).map((item) => [item.orderItemId, item]));
        for (const item of dto.items) {
          const line = state.get(item.orderItemId);
          if (!line) throw new BadRequestException('A product is not part of this order');
          if (!line.eligible) throw new BadRequestException(`${line.title}: ${line.reason}`);
          if (item.quantity > line.returnable) throw new BadRequestException(`${line.title}: you can return up to ${line.returnable}`);
        }
        const request = await this.core.createNumbered(tx, {
          orderId: order.id, userId: customerId,
          pickupFullName: address.fullName, pickupLine1: address.line1, pickupLine2: address.line2, pickupCity: address.city, pickupCounty: address.county, pickupPostcode: address.postcode, pickupPhone: address.phone,
        });
        for (const [index, item] of dto.items.entries()) {
          await tx.returnItem.create({
            data: {
              returnRequestId: request.id, orderItemId: item.orderItemId, quantity: item.quantity, reason: item.reason,
              reasonOther: item.reason === 'OTHER' ? item.reasonOther?.trim() || null : null, description: item.description?.trim() || null,
              images: { create: (stored.get(index) ?? []).map((image) => ({ ...image, type: 'CUSTOMER_EVIDENCE' as const })) },
            },
          });
        }
        await this.core.addEvent(tx, request.id, { status: 'RETURN_REQUESTED', action: 'return.requested', actor: { type: 'CUSTOMER', id: customerId } });
        const estimated = round2(dto.items.reduce((sum, item) => sum + state.get(item.orderItemId)!.unitRefund * item.quantity, 0));
        return { request, estimated, titles: dto.items.map((item) => `${state.get(item.orderItemId)!.title} × ${item.quantity}`) };
      });

      const email = returnRequestedEmail({ orderNumber: order.orderNumber, itemTitle: created.titles.join(', '), reason: dto.items.map((item) => RETURN_REASON_LABELS[item.reason]).join(', ') });
      void this.emailService.send(order.email, email.subject, email.html);
      return { ...(await this.detail(customerId, created.request.returnNumber)), estimatedRefund: created.estimated };
    } catch (error) {
      await Promise.all([...stored.values()].flat().map((image) => this.images.remove(image.storageKey)));
      throw error;
    }
  }

  async list(customerId: number) {
    const requests = await this.prisma.returnRequest.findMany({ where: { userId: customerId }, orderBy: { createdAt: 'desc' }, include: customerReturnInclude });
    return Promise.all(requests.map((request) => this.present(request)));
  }

  async detail(customerId: number, returnNumber: string) {
    const request = await this.prisma.returnRequest.findUnique({ where: { returnNumber }, include: customerReturnInclude });
    if (!request || request.userId !== customerId) throw new NotFoundException('Return not found');
    return this.present(request);
  }

  /** Customers can withdraw a return until it has been reviewed. */
  async cancel(customerId: number, returnNumber: string) {
    const request = await this.prisma.returnRequest.findUnique({ where: { returnNumber } });
    if (!request || request.userId !== customerId) throw new NotFoundException('Return not found');
    if (request.status !== 'RETURN_REQUESTED') throw new ConflictException('This return is already being processed and can no longer be cancelled');
    await this.core.setStatus(this.prisma, request.id, 'CANCELLED', { action: 'return.cancelled', note: 'Cancelled by the customer', actor: { type: 'CUSTOMER', id: customerId } });
    return this.detail(customerId, returnNumber);
  }

  async image(customerId: number, returnNumber: string, imageId: number) {
    const image = await this.prisma.returnItemImage.findFirst({ where: { id: imageId, type: 'CUSTOMER_EVIDENCE', returnItem: { returnRequest: { returnNumber, userId: customerId } } } });
    if (!image) throw new NotFoundException('Image not found');
    return { buffer: await this.images.read(image.storageKey), mimeType: image.mimeType };
  }

  /** Estimated refund per item from the original order (the final amount is set at inspection). */
  private async present(request: Awaited<ReturnType<typeof this.prisma.returnRequest.findFirstOrThrow<{ include: typeof customerReturnInclude }>>>) {
    const state = new Map((await this.core.orderReturnState(request.orderId)).map((item) => [item.orderItemId, item]));
    const items = request.items.map((item) => {
      const units = item.inspectionResult ? item.acceptedQuantity ?? 0 : item.approvedQuantity ?? item.quantity;
      return {
        id: item.id,
        orderItemId: item.orderItemId,
        title: item.orderItem.titleSnapshot,
        variant: item.orderItem.variantTitleSnapshot,
        sku: item.orderItem.skuSnapshot,
        productId: item.orderItem.productId,
        orderedQuantity: item.orderItem.quantity,
        quantity: item.quantity,
        approvedQuantity: item.approvedQuantity,
        receivedQuantity: item.receivedQuantity,
        acceptedQuantity: item.acceptedQuantity,
        reason: item.reason,
        reasonLabel: RETURN_REASON_LABELS[item.reason],
        reasonOther: item.reasonOther,
        description: item.description,
        inspectionResult: item.inspectionResult,
        inspectionRejectionReason: item.inspectionRejectionReason,
        deductionAmount: Number(item.deductionAmount),
        deductionReason: item.deductionReason,
        refundAmount: item.refundAmount === null ? round2((state.get(item.orderItemId)?.unitRefund ?? 0) * units) : Number(item.refundAmount),
        refundIsFinal: item.refundAmount !== null,
        imageIds: item.images.map((image) => image.id),
      };
    });
    return {
      returnNumber: request.returnNumber,
      status: request.status,
      order: request.order,
      createdAt: request.createdAt,
      pickupAddress: { fullName: request.pickupFullName, line1: request.pickupLine1, line2: request.pickupLine2, city: request.pickupCity, county: request.pickupCounty, postcode: request.pickupPostcode, phone: request.pickupPhone },
      pickup: request.courier || request.pickupDate ? { courier: request.courier, date: request.pickupDate, window: request.pickupWindow, trackingNumber: request.trackingNumber } : null,
      rejectionReason: request.rejectionReason,
      items,
      shippingRefund: Number(request.shippingRefund),
      refundTotal: round2(items.reduce((sum, item) => sum + item.refundAmount, 0) + Number(request.shippingRefund)),
      refunds: request.refunds.map((refund) => ({ amount: Number(refund.amount), status: refund.status, providerRefundId: refund.providerRefundId, method: refund.transaction.provider, processedAt: refund.processedAt, createdAt: refund.createdAt })),
      events: request.events,
    };
  }
}
