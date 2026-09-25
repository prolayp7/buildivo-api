import { PrismaClient, Prisma, OrderStatus, OrderItemStatus, PaymentStatus, PaymentProvider, PaymentAttemptStatus, ShipmentStatus, DeliveryCarrier, DiscountType, GiftCardStatus, QuoteStatus, ProductQuestionStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { randomBytes, randomInt, randomUUID } from 'crypto';

// Populates transactional/activity data (customers, orders, payments, reviews,
// Q&A, coupons, gift cards, subscribers, enquiries, wishlists, abandoned
// carts, quotes) so the admin dashboard, reports and every listing page have
// realistic volume to render - the catalog itself (products/categories/
// brands) is already seeded by seed-products.ts. Idempotent: skips if it
// looks like this has already run (checks the demo customer domain).
const DEMO_EMAIL_DOMAIN = 'buildivo-demo.test';
const DEMO_PASSWORD = 'DemoCustomer123!';

const FIRST_NAMES = ['Olivia', 'George', 'Amelia', 'Noah', 'Isla', 'Arthur', 'Freya', 'Leo', 'Ivy', 'Oscar', 'Grace', 'Jack', 'Poppy', 'Harry', 'Ella', 'Charlie', 'Mia', 'Alfie', 'Ruby', 'Jacob', 'Lily', 'Thomas', 'Sophie', 'Henry', 'Chloe', 'Joshua', 'Evie', 'Daniel', 'Millie', 'Samuel', 'Daisy', 'James', 'Florence', 'William', 'Alice', 'Benjamin', 'Rosie', 'Michael', 'Emily', 'Ethan', 'Jessica', 'Lucas', 'Hannah', 'Mason', 'Holly', 'Logan', 'Erin', 'Finley', 'Maya', 'Reuben'];
const LAST_NAMES = ['Smith', 'Jones', 'Taylor', 'Williams', 'Brown', 'Davies', 'Evans', 'Wilson', 'Thomas', 'Roberts', 'Johnson', 'Lewis', 'Walker', 'Robinson', 'Wood', 'Thompson', 'White', 'Watson', 'Jackson', 'Wright', 'Green', 'Harris', 'Cooper', 'King', 'Baker', 'Clarke', 'Morgan', 'James', 'Edwards', 'Hall', 'Turner', 'Parker', 'Collins', 'Bell', 'Ward', 'Murphy', 'Kelly', 'Hughes', 'Bailey', 'Foster'];
const STREETS = ['Jobsite Way', 'Workshop Lane', 'Timberyard Road', 'Mill Close', 'Forge Street', 'Foundry Road', 'Depot Avenue', 'Station Road', 'High Street', 'Church Lane', 'Victoria Road', 'Kings Road', 'Mill Lane', 'Queens Road', 'Park Avenue', 'Brookside', 'Elm Grove', 'Orchard Close'];
const CITIES: [string, string][] = [['London', 'E1'], ['Manchester', 'M1'], ['Birmingham', 'B1'], ['Leeds', 'LS1'], ['Bristol', 'BS1'], ['Sheffield', 'S1'], ['Liverpool', 'L1'], ['Newcastle', 'NE1'], ['Nottingham', 'NG1'], ['Cardiff', 'CF10'], ['Glasgow', 'G1'], ['Edinburgh', 'EH1'], ['Leicester', 'LE1'], ['Coventry', 'CV1'], ['Reading', 'RG1'], ['Southampton', 'SO14']];
const COMPANY_SUFFIXES = ['Building Services', 'Joinery', 'Plumbing & Heating', 'Electrical Contractors', 'Property Maintenance', 'Renovations Ltd', 'Trade Supplies'];
const REVIEW_TITLES_POSITIVE = ['Does exactly what it says', 'Great value for money', 'Solid, well-made tool', 'Would buy again', 'Arrived fast, works perfectly', 'Better than expected', 'Reliable for daily jobsite use', 'Good quality for the price'];
const REVIEW_TITLES_MIXED = ['Does the job but nothing special', 'Decent but a bit pricey', 'Works, minor gripes', 'Average - gets the job done'];
const REVIEW_TITLES_NEGATIVE = ['Disappointed with the build quality', 'Not as described', 'Stopped working after a week', 'Would not recommend'];
const REVIEW_BODIES_POSITIVE = ["Used it on three jobs so far and it's held up well. Would recommend to anyone in the trade.", 'Exactly what I needed for the extension we\'re working on. Delivery was quick too.', 'Solid build quality, feels durable. No complaints.', 'Great addition to the van kit. Does what it should without fuss.'];
const REVIEW_BODIES_MIXED = ['Does the job but the packaging could be better. Product itself is fine.', 'A bit more expensive than I expected but the quality justifies it I suppose.'];
const REVIEW_BODIES_NEGATIVE = ['Had to return it after it stopped charging properly. Disappointing.', 'Not quite the spec I was expecting from the listing.'];
const QUESTIONS = ['Is this compatible with the 18V battery range?', 'What are the dimensions when folded down?', 'Does this come with a warranty?', 'Is next-day delivery available for this item?', 'Can this be used outdoors in wet conditions?', 'What is the maximum load capacity?', 'Does it include a carry case?', 'Is this suitable for professional/trade use?', 'What is the cable length?', 'Are replacement parts available separately?'];
const ANSWERS = ['Yes, this is compatible with the full range. Thanks for asking!', 'The folded dimensions are listed in the specifications tab above.', 'This comes with our standard 3-year manufacturer warranty.', 'Yes, next-day delivery is available at checkout for orders placed before 2pm.', 'It is rated for outdoor use, but we recommend storing it under cover when not in use.', 'Please check the product specification table for exact load ratings.', 'A carry case is included with this model.', 'Yes, this is widely used by trade professionals.', 'Thanks for your question - our team will confirm this shortly.'];
const ENQUIRY_TYPES = ['general', 'trade-account', 'bulk-order', 'returns', 'product-question'];

function pick<T>(arr: T[]): T {
  return arr[randomInt(0, arr.length)];
}
function maybe(probability: number): boolean {
  return Math.random() < probability;
}
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
// Skews toward recent dates (more activity lately than a year ago), like a real store.
function pastDate(maxDays: number): Date {
  const daysAgo = Math.floor(Math.pow(Math.random(), 1.6) * maxDays);
  const ms = daysAgo * 86_400_000 + randomInt(0, 86_400_000);
  return new Date(Date.now() - ms);
}
function laterThan(start: Date, maxHoursLater: number): Date {
  return new Date(start.getTime() + randomInt(1, maxHoursLater) * 3_600_000);
}
function orderNumber(i: number): string {
  return `UK${Date.now().toString(36).toUpperCase()}${i.toString(36).padStart(3, '0').toUpperCase()}${randomBytes(2).toString('hex').toUpperCase()}`;
}
function postcode(prefix: string): string {
  return `${prefix} ${randomInt(1, 9)}${pick(['AA', 'AB', 'BA', 'CD', 'EF', 'GH'])}`;
}
function orderItemStatusFor(orderStatus: OrderStatus): OrderItemStatus {
  if (orderStatus === 'DELIVERED') return 'DELIVERED';
  if (orderStatus === 'SHIPPED') return 'SHIPPED';
  if (orderStatus === 'CANCELLED') return 'CANCELLED';
  return 'PENDING';
}

export async function seedActivity(prisma: PrismaClient) {
  const already = await prisma.user.count({ where: { email: { endsWith: `@${DEMO_EMAIL_DOMAIN}` } } });
  if (already >= 100) {
    console.log(`  Activity data already seeded (${already} demo customers found) - skipping.`);
    return;
  }

  console.log('  Seeding customers...');
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
  const CUSTOMER_COUNT = 120;
  const customerIds: number[] = [];
  const emailByUserId = new Map<number, string>();
  for (let i = 0; i < CUSTOMER_COUNT; i += 1) {
    const firstName = pick(FIRST_NAMES);
    const lastName = pick(LAST_NAMES);
    const createdAt = pastDate(420);
    const email = `${firstName.toLowerCase()}.${lastName.toLowerCase()}${i}@${DEMO_EMAIL_DOMAIN}`;
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        firstName,
        lastName,
        phone: maybe(0.6) ? `07${randomInt(100000000, 999999999)}` : undefined,
        status: maybe(0.05) ? 'SUSPENDED' : 'ACTIVE',
        emailVerifiedAt: maybe(0.85) ? createdAt : undefined,
        createdAt,
        updatedAt: createdAt,
      },
      select: { id: true },
    });
    customerIds.push(user.id);
    emailByUserId.set(user.id, email);
  }

  console.log('  Seeding addresses...');
  const addressRows: Prisma.AddressCreateManyInput[] = [];
  for (const userId of customerIds) {
    const addressCount = maybe(0.3) ? 2 : 1;
    for (let a = 0; a < addressCount; a += 1) {
      const [city, prefix] = pick(CITIES);
      const isTrade = maybe(0.25);
      addressRows.push({
        userId,
        label: a === 0 ? 'Home' : 'Jobsite',
        fullName: `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`,
        companyName: isTrade ? `${pick(LAST_NAMES)} ${pick(COMPANY_SUFFIXES)}` : undefined,
        line1: `${randomInt(1, 240)} ${pick(STREETS)}`,
        city,
        postcode: postcode(prefix),
        country: 'GB',
        addressType: 'BOTH',
        isDefault: a === 0,
      });
    }
  }
  await prisma.address.createMany({ data: addressRows });

  console.log('  Seeding coupons & discounts...');
  const couponCodes = ['WELCOME10', 'TRADE15', 'SPRING20', 'BULK5', 'SAVE10NOW', 'FIRSTORDER', 'JOBSITE20', 'DIY15', 'FLASH25', 'LOYALTY10', 'WEEKEND10', 'CLEARANCE30', 'NEWCUST15', 'TOOLKIT20', 'RESTOCK10'];
  const coupons: { id: number; code: string; discountType: DiscountType; discountAmount: number }[] = [];
  for (const code of couponCodes) {
    const discountType: DiscountType = maybe(0.5) ? 'PERCENT' : 'FIXED';
    const discountAmount = discountType === 'PERCENT' ? pick([5, 10, 15, 20, 25, 30]) : pick([5, 10, 15, 20]);
    const coupon = await prisma.coupon.create({
      data: {
        code,
        name: `${code} promotional code`,
        discountType,
        discountAmount,
        minOrderTotal: maybe(0.4) ? 50 : undefined,
        status: maybe(0.15) ? 'INACTIVE' : 'ACTIVE',
        startsAt: pastDate(200),
        endsAt: maybe(0.3) ? pastDate(5) : undefined,
        usageCount: 0,
      },
      select: { id: true, code: true, discountType: true, discountAmount: true },
    });
    coupons.push({ id: coupon.id, code: coupon.code, discountType: coupon.discountType, discountAmount: Number(coupon.discountAmount) });
  }
  for (let i = 0; i < 8; i += 1) {
    const discountType: DiscountType = pick(['PERCENT', 'FIXED', 'FREE_SHIPPING']);
    await prisma.automaticDiscount.create({
      data: {
        name: `Automatic ${discountType === 'FREE_SHIPPING' ? 'free shipping' : `${discountType.toLowerCase()} discount`} ${i + 1}`,
        discountType,
        discountAmount: discountType === 'PERCENT' ? pick([5, 10, 15]) : discountType === 'FIXED' ? pick([5, 10]) : 0,
        targetType: 'ALL',
        status: maybe(0.2) ? 'INACTIVE' : 'ACTIVE',
      },
    });
  }

  console.log('  Loading catalog for orders...');
  const variants = await prisma.productVariant.findMany({
    where: { status: 'ACTIVE', deletedAt: null, stockQty: { gt: 0 } },
    select: { id: true, productId: true, title: true, barcode: true, price: true, salePrice: true },
  });
  const products = await prisma.product.findMany({ where: { status: 'ACTIVE', deletedAt: null }, select: { id: true } });
  const productIds = products.map((p) => p.id);

  console.log('  Seeding orders, payments, shipments...');
  const ORDER_COUNT = 140;
  const statusWeights: [OrderStatus, number][] = [
    ['DELIVERED', 0.45], ['SHIPPED', 0.12], ['PROCESSING', 0.08], ['PACKED', 0.08],
    ['PENDING', 0.08], ['AWAITING_PAYMENT', 0.05], ['CANCELLED', 0.09], ['FAILED', 0.05],
  ];
  function pickStatus(): OrderStatus {
    const r = Math.random();
    let acc = 0;
    for (const [status, weight] of statusWeights) {
      acc += weight;
      if (r <= acc) return status;
    }
    return 'DELIVERED';
  }

  let reviewCount = 0;
  for (let i = 0; i < ORDER_COUNT; i += 1) {
    const placedAt = pastDate(365);
    const isGuest = maybe(0.2);
    const userId = isGuest ? null : pick(customerIds);
    const status = pickStatus();
    const [city, prefix] = pick(CITIES);
    const fullName = `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`;
    const email = isGuest ? `guest.${randomUUID().slice(0, 8)}@${DEMO_EMAIL_DOMAIN}` : emailByUserId.get(userId!)!;

    const itemCount = randomInt(1, 4);
    const chosenVariants = Array.from({ length: itemCount }, () => pick(variants));
    let subtotal = 0;
    let vatTotal = 0;
    const itemsData = chosenVariants.map((variant) => {
      const qty = randomInt(1, 3);
      const unitPrice = Number(variant.salePrice ?? variant.price);
      const lineTotal = round2(unitPrice * qty);
      const exVat = lineTotal / 1.2;
      const vatAmount = round2(lineTotal - exVat);
      subtotal += lineTotal;
      vatTotal += vatAmount;
      return {
        productId: variant.productId,
        productVariantId: variant.id,
        titleSnapshot: variant.title,
        variantTitleSnapshot: variant.title,
        skuSnapshot: variant.barcode ?? undefined,
        quantity: qty,
        unitPrice,
        vatRatePercent: 20,
        vatAmount,
        subtotal: lineTotal,
        status: orderItemStatusFor(status),
      };
    });
    subtotal = round2(subtotal);
    vatTotal = round2(vatTotal);

    const applyCoupon = maybe(0.15) ? pick(coupons) : null;
    const discountTotal = applyCoupon ? round2(applyCoupon.discountType === 'PERCENT' ? (subtotal * applyCoupon.discountAmount) / 100 : Math.min(applyCoupon.discountAmount, subtotal)) : 0;
    const useDhl = maybe(0.5);
    const shippingCharge = useDhl ? 9.99 : subtotal - discountTotal >= 75 ? 0 : 4.99;
    const total = round2(subtotal - discountTotal + shippingCharge);
    const paid = status === 'DELIVERED' || status === 'SHIPPED' || status === 'PROCESSING' || status === 'PACKED';
    const wasRefunded = (status === 'CANCELLED' || status === 'DELIVERED') && maybe(0.12);
    const paymentStatus: PaymentStatus = wasRefunded ? (maybe(0.5) ? 'REFUNDED' : 'PARTIALLY_REFUNDED') : paid ? 'PAID' : status === 'FAILED' ? 'FAILED' : 'PENDING';

    const order = await prisma.order.create({
      data: {
        orderNumber: orderNumber(i),
        userId: userId ?? undefined,
        email,
        status,
        paymentStatus,
        billingFullName: fullName,
        billingLine1: `${randomInt(1, 240)} ${pick(STREETS)}`,
        billingCity: city,
        billingPostcode: postcode(prefix),
        billingCountry: 'GB',
        shippingFullName: fullName,
        shippingLine1: `${randomInt(1, 240)} ${pick(STREETS)}`,
        shippingCity: city,
        shippingPostcode: postcode(prefix),
        shippingCountry: 'GB',
        shippingMethodId: useDhl ? 2 : 1,
        subtotal,
        discountTotal,
        shippingCharge,
        vatTotal,
        total,
        couponCode: applyCoupon?.code,
        placedAt,
        createdAt: placedAt,
        updatedAt: placedAt,
        items: { create: itemsData },
      },
      select: { id: true, items: { select: { id: true } } },
    });

    if (applyCoupon) {
      await prisma.orderCouponLine.create({ data: { orderId: order.id, couponId: applyCoupon.id, couponCode: applyCoupon.code, discountAmount: discountTotal } });
      await prisma.coupon.update({ where: { id: applyCoupon.id }, data: { usageCount: { increment: 1 } } });
    }

    // Status history: a plausible progression up to the current status.
    const progression: OrderStatus[] = ['PENDING'];
    if (status !== 'PENDING' && status !== 'AWAITING_PAYMENT' && status !== 'FAILED') progression.push('PROCESSING');
    if (['PACKED', 'SHIPPED', 'DELIVERED'].includes(status)) progression.push('PACKED');
    if (['SHIPPED', 'DELIVERED'].includes(status)) progression.push('SHIPPED');
    if (status === 'DELIVERED') progression.push('DELIVERED');
    if (status === 'CANCELLED') progression.push('CANCELLED');
    if (status === 'AWAITING_PAYMENT') progression.push('AWAITING_PAYMENT');
    if (status === 'FAILED') progression.push('FAILED');
    let historyTime = placedAt;
    const historyRows = progression.map((toStatus, idx) => {
      historyTime = idx === 0 ? placedAt : laterThan(historyTime, 48);
      return { orderId: order.id, fromStatus: idx === 0 ? undefined : progression[idx - 1], toStatus, createdAt: historyTime };
    });
    await prisma.orderStatusHistory.createMany({ data: historyRows });

    // Payment attempt + transaction.
    const provider: PaymentProvider = maybe(0.6) ? 'STRIPE' : 'PAYPAL';
    const attemptStatus: PaymentAttemptStatus = paid || wasRefunded ? 'CAPTURED' : status === 'FAILED' ? 'DECLINED' : status === 'CANCELLED' ? 'CANCELLED' : 'REQUIRES_CUSTOMER_ACTION';
    const attempt = await prisma.paymentAttempt.create({
      data: {
        orderId: order.id,
        provider,
        providerObjectId: attemptStatus === 'CAPTURED' || attemptStatus === 'DECLINED' ? `${provider === 'STRIPE' ? 'pi_' : 'PAYID-'}${randomUUID().replace(/-/g, '').slice(0, 20)}` : undefined,
        idempotencyKey: randomUUID(),
        status: attemptStatus,
        amount: total,
        failureCategory: attemptStatus === 'DECLINED' ? 'card_declined' : undefined,
        failureMessage: attemptStatus === 'DECLINED' ? 'The card was declined by the issuing bank.' : undefined,
        createdAt: placedAt,
        updatedAt: historyTime,
      },
      select: { id: true },
    });
    await prisma.paymentStateHistory.createMany({
      data: [
        { paymentAttemptId: attempt.id, toStatus: 'CREATED', source: 'seed', createdAt: placedAt },
        { paymentAttemptId: attempt.id, fromStatus: 'CREATED', toStatus: attemptStatus, source: 'seed', createdAt: laterThan(placedAt, 2) },
      ],
    });

    let transactionId: number | null = null;
    if (attemptStatus === 'CAPTURED') {
      const txn = await prisma.paymentTransaction.create({
        data: {
          orderId: order.id,
          paymentAttemptId: attempt.id,
          userId: userId ?? undefined,
          provider,
          providerTransactionId: `${provider === 'STRIPE' ? 'ch_' : 'TXN-'}${randomUUID().replace(/-/g, '').slice(0, 20)}`,
          amount: total,
          status: 'CAPTURED',
          createdAt: laterThan(placedAt, 2),
        },
        select: { id: true },
      });
      transactionId = txn.id;
    }

    if (wasRefunded && transactionId) {
      const refundAmount = paymentStatus === 'REFUNDED' ? total : round2(total * pick([0.3, 0.5, 0.7]));
      await prisma.paymentRefund.create({
        data: {
          transactionId,
          orderId: order.id,
          amount: refundAmount,
          status: 'PROCESSED',
          reason: pick(['Customer requested cancellation', 'Item damaged in transit', 'Wrong item ordered', 'Changed their mind']),
          createdAt: laterThan(historyTime, 24),
        },
      });
    }

    // Shipment for anything that progressed to PACKED or beyond.
    if (['PACKED', 'SHIPPED', 'DELIVERED'].includes(status)) {
      const carrier: DeliveryCarrier = pick(['FEDEX', 'EVRI']);
      const shipStatus: ShipmentStatus = status === 'DELIVERED' ? 'DELIVERED' : status === 'SHIPPED' ? pick(['IN_TRANSIT', 'OUT_FOR_DELIVERY']) : 'LABEL_READY';
      const shipment = await prisma.shipment.create({
        data: {
          orderId: order.id,
          carrier,
          idempotencyKey: randomUUID(),
          carrierShipmentId: `${carrier}-${randomInt(100000, 999999)}`,
          trackingNumber: `${carrier === 'FEDEX' ? 'FX' : 'EV'}${randomInt(1000000000, 2147483647)}GB`,
          serviceCode: 'STANDARD',
          status: shipStatus,
          weightKg: round2(randomInt(1, 15) + Math.random()),
          declaredValue: total,
          deliveredAt: shipStatus === 'DELIVERED' ? laterThan(historyTime, 48) : undefined,
          createdAt: laterThan(placedAt, 24),
        },
        select: { id: true },
      });
      const events: { status: ShipmentStatus; description: string }[] = [{ status: 'LABEL_READY', description: 'Shipping label created' }];
      if (shipStatus !== 'LABEL_READY') events.push({ status: 'IN_TRANSIT', description: 'Parcel collected and in transit' });
      if (shipStatus === 'OUT_FOR_DELIVERY' || shipStatus === 'DELIVERED') events.push({ status: 'OUT_FOR_DELIVERY', description: 'Out for delivery' });
      if (shipStatus === 'DELIVERED') events.push({ status: 'DELIVERED', description: 'Delivered - signed for' });
      let eventTime = laterThan(placedAt, 24);
      await prisma.shipmentEvent.createMany({
        data: events.map((event) => {
          eventTime = laterThan(eventTime, 20);
          return { shipmentId: shipment.id, status: event.status, description: event.description, location: pick(CITIES)[0], occurredAt: eventTime };
        }),
      });
    }

    // A handful of returns on delivered orders.
    if (status === 'DELIVERED' && userId && maybe(0.08)) {
      const targetItem = pick(order.items);
      await prisma.orderItemReturn.create({
        data: {
          orderItemId: targetItem.id,
          userId,
          reason: pick(['Item not as described', 'No longer needed', 'Faulty on arrival', 'Ordered wrong size']),
          returnStatus: pick(['REQUESTED', 'APPROVED', 'RECEIVED', 'REFUNDED']),
          createdAt: laterThan(historyTime, 72),
        },
      });
    }

    // Reviews on ~40% of delivered orders' items.
    if (status === 'DELIVERED' && maybe(0.4)) {
      const rating = pick([5, 5, 5, 4, 4, 3, 2, 1]);
      const title = rating >= 4 ? pick(REVIEW_TITLES_POSITIVE) : rating === 3 ? pick(REVIEW_TITLES_MIXED) : pick(REVIEW_TITLES_NEGATIVE);
      const body = rating >= 4 ? pick(REVIEW_BODIES_POSITIVE) : rating === 3 ? pick(REVIEW_BODIES_MIXED) : pick(REVIEW_BODIES_NEGATIVE);
      await prisma.review.create({
        data: {
          productId: pick(chosenVariants).productId,
          orderId: order.id,
          userId: userId ?? undefined,
          reviewerName: userId ? undefined : fullName,
          rating,
          title,
          comment: body,
          status: maybe(0.85) ? 'APPROVED' : maybe(0.6) ? 'PENDING' : 'REJECTED',
          createdAt: laterThan(historyTime, 240),
        },
      });
      reviewCount += 1;
    }
  }
  console.log(`  Created ${ORDER_COUNT} orders (${reviewCount} with a review).`);

  // Extra standalone reviews so the total comfortably clears 100 even if the
  // order-linked ratio above runs low.
  console.log('  Seeding additional standalone reviews...');
  const extraReviews = Math.max(0, 150 - reviewCount);
  for (let i = 0; i < extraReviews; i += 1) {
    const rating = pick([5, 5, 5, 4, 4, 3, 2, 1]);
    const title = rating >= 4 ? pick(REVIEW_TITLES_POSITIVE) : rating === 3 ? pick(REVIEW_TITLES_MIXED) : pick(REVIEW_TITLES_NEGATIVE);
    const body = rating >= 4 ? pick(REVIEW_BODIES_POSITIVE) : rating === 3 ? pick(REVIEW_BODIES_MIXED) : pick(REVIEW_BODIES_NEGATIVE);
    const asGuest = maybe(0.3);
    await prisma.review.create({
      data: {
        productId: pick(productIds),
        userId: asGuest ? undefined : pick(customerIds),
        reviewerName: asGuest ? `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)[0]}.` : undefined,
        rating,
        title,
        comment: body,
        status: maybe(0.8) ? 'APPROVED' : maybe(0.5) ? 'PENDING' : 'REJECTED',
        createdAt: pastDate(365),
      },
    });
  }

  console.log('  Seeding product Q&A...');
  const superAdmin = await prisma.adminUser.findFirst({ select: { id: true } });
  for (let i = 0; i < 110; i += 1) {
    const status: ProductQuestionStatus = maybe(0.9) ? 'PUBLISHED' : maybe(0.5) ? 'PENDING' : 'REJECTED';
    const createdAt = pastDate(300);
    const question = await prisma.productQuestion.create({
      data: {
        productId: pick(productIds),
        userId: maybe(0.7) ? pick(customerIds) : undefined,
        name: `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)[0]}.`,
        question: pick(QUESTIONS),
        status,
        createdAt,
      },
      select: { id: true },
    });
    if (status === 'PUBLISHED' && maybe(0.75)) {
      await prisma.productAnswer.create({
        data: { productQuestionId: question.id, adminUserId: superAdmin?.id, answer: pick(ANSWERS), createdAt: laterThan(createdAt, 72) },
      });
    }
  }

  console.log('  Seeding gift cards...');
  for (let i = 0; i < 110; i += 1) {
    const initialBalance = pick([25, 50, 75, 100, 150, 200]);
    const status: GiftCardStatus = maybe(0.7) ? 'ACTIVE' : maybe(0.5) ? 'REDEEMED' : maybe(0.5) ? 'EXPIRED' : 'DISABLED';
    const redeemed = status !== 'ACTIVE' && maybe(0.6);
    const currentBalance = status === 'REDEEMED' ? 0 : redeemed ? round2(initialBalance * pick([0.2, 0.4, 0.6])) : initialBalance;
    const createdAt = pastDate(300);
    const giftCard = await prisma.giftCard.create({
      data: {
        code: `GC-${randomBytes(3).toString('hex').toUpperCase()}-${randomBytes(2).toString('hex').toUpperCase()}`,
        initialBalance,
        currentBalance,
        purchasedByUserId: maybe(0.8) ? pick(customerIds) : undefined,
        issuedToEmail: maybe(0.5) ? `${pick(FIRST_NAMES).toLowerCase()}@${DEMO_EMAIL_DOMAIN}` : undefined,
        status,
        expiresAt: maybe(0.5) ? pastDate(-200) : undefined,
        createdAt,
      },
      select: { id: true },
    });
    await prisma.giftCardTransaction.create({ data: { giftCardId: giftCard.id, amount: initialBalance, type: 'ISSUE', createdAt } });
    if (currentBalance < initialBalance) {
      await prisma.giftCardTransaction.create({ data: { giftCardId: giftCard.id, amount: -(initialBalance - currentBalance), type: 'REDEEM', createdAt: laterThan(createdAt, 200) } });
    }
  }

  console.log('  Seeding newsletter subscribers...');
  const subscriberRows = Array.from({ length: 160 }, (_, i) => ({
    email: `subscriber${i}.${randomBytes(3).toString('hex')}@${DEMO_EMAIL_DOMAIN}`,
    createdAt: pastDate(400),
  }));
  await prisma.newsletterSubscriber.createMany({ data: subscriberRows, skipDuplicates: true });

  console.log('  Seeding enquiries...');
  for (let i = 0; i < 70; i += 1) {
    await prisma.enquiry.create({
      data: {
        type: pick(ENQUIRY_TYPES),
        name: `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`,
        email: `enquiry${i}@${DEMO_EMAIL_DOMAIN}`,
        phone: maybe(0.5) ? `07${randomInt(100000000, 999999999)}` : undefined,
        subject: pick(['Trade account application', 'Bulk order pricing', 'Delivery query', 'Product availability', 'Return request']),
        message: 'This is a demo enquiry generated for seed data - no action required.',
        status: pick(['NEW', 'IN_PROGRESS', 'RESOLVED']),
        createdAt: pastDate(200),
      },
    });
  }

  console.log('  Seeding wishlists...');
  for (const userId of customerIds) {
    if (!maybe(0.55)) continue;
    const wishlist = await prisma.wishlist.create({ data: { userId, title: 'My Wishlist', slug: 'my-wishlist' }, select: { id: true } });
    const itemCount = randomInt(1, 5);
    const picked = new Set<number>();
    while (picked.size < itemCount) picked.add(pick(variants).id);
    await prisma.wishlistItem.createMany({ data: [...picked].map((productVariantId) => ({ wishlistId: wishlist.id, productVariantId })) });
  }

  console.log('  Seeding abandoned carts...');
  for (let i = 0; i < 90; i += 1) {
    const asGuest = maybe(0.4);
    const cart = await prisma.cart.create({
      data: {
        userId: asGuest ? undefined : pick(customerIds),
        guestToken: asGuest ? randomUUID() : undefined,
        createdAt: pastDate(60),
      },
      select: { id: true },
    });
    const itemCount = randomInt(1, 3);
    const picked = new Set<number>();
    while (picked.size < itemCount) picked.add(pick(variants).id);
    await prisma.cartItem.createMany({ data: [...picked].map((productVariantId) => ({ cartId: cart.id, productVariantId, quantity: randomInt(1, 2) })) });
  }

  console.log('  Seeding additional quote requests...');
  for (let i = 0; i < 30; i += 1) {
    const status: QuoteStatus = pick(['NEW', 'REVIEWING', 'QUOTED', 'ACCEPTED', 'DECLINED', 'EXPIRED']);
    const createdAt = pastDate(180);
    const quote = await prisma.quoteRequest.create({
      data: {
        userId: maybe(0.6) ? pick(customerIds) : undefined,
        companyName: maybe(0.7) ? `${pick(LAST_NAMES)} ${pick(COMPANY_SUFFIXES)}` : undefined,
        contactName: `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`,
        email: `quote${i}@${DEMO_EMAIL_DOMAIN}`,
        phone: `07${randomInt(100000000, 999999999)}`,
        message: 'Requesting a trade quote for a bulk order - demo seed data.',
        status,
        quotedTotal: ['QUOTED', 'ACCEPTED', 'DECLINED'].includes(status) ? round2(randomInt(200, 5000)) : undefined,
        respondedAt: ['QUOTED', 'ACCEPTED', 'DECLINED'].includes(status) ? laterThan(createdAt, 96) : undefined,
        createdAt,
      },
      select: { id: true },
    });
    const itemCount = randomInt(2, 6);
    const picked = new Set<number>();
    while (picked.size < itemCount) picked.add(pick(variants).id);
    await prisma.quoteRequestItem.createMany({
      data: [...picked].map((productVariantId) => ({ quoteRequestId: quote.id, productVariantId, quantity: randomInt(5, 50) })),
    });
  }

  console.log('  Activity seed complete.');
}
