import { PrismaService } from '../../src/prisma/prisma.service';

describe('Notifications & Settings', () => {
  const prisma = new PrismaService();
  let notificationId: string;

  afterAll(async () => {
    if (notificationId) await prisma.notification.delete({ where: { id: notificationId } });
    await prisma.setting.delete({ where: { key: 'test_default_vat_rate' } }).catch(() => undefined);
    await prisma.$disconnect();
  });

  it('creates a notification with a string UUID id, and a setting keyed by name', async () => {
    const notification = await prisma.notification.create({
      data: { type: 'order', title: 'Order shipped', message: 'Your order has shipped.' },
    });
    notificationId = notification.id;
    expect(typeof notification.id).toBe('string');
    expect(notification.isRead).toBe(false);

    const setting = await prisma.setting.create({
      data: { key: 'test_default_vat_rate', value: { percent: 20 } },
    });
    expect(setting.value).toEqual({ percent: 20 });
  });
});
