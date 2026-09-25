import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { PrismaService } from '../../src/prisma/prisma.service';
import { loginAsSuperAdmin } from './helpers/admin-auth';
import { createTestApp } from './setup';

const KEY = 'footer.site';
const PAYPAL_KEY = 'integration.payment.paypal';

describe('Storefront footer settings (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let admin: string;
  let originalFooter: unknown;
  let originalPaypal: unknown;

  const footer = async () => (await request(app.getHttpServer()).get('/api/v1/settings/footer').expect(200)).body.data;
  const save = (value: unknown) => request(app.getHttpServer()).put(`/api/v1/admin/settings/${KEY}`).set('Authorization', `Bearer ${admin}`).send({ value }).expect(200);

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    admin = await loginAsSuperAdmin(app);
    originalFooter = (await prisma.setting.findUnique({ where: { key: KEY } }))?.value;
    originalPaypal = (await prisma.setting.findUnique({ where: { key: PAYPAL_KEY } }))?.value;
  });

  afterAll(async () => {
    await prisma.setting.deleteMany({ where: { key: { in: [KEY, PAYPAL_KEY] } } });
    if (originalFooter !== undefined) await prisma.setting.create({ data: { key: KEY, value: originalFooter as object } });
    if (originalPaypal !== undefined) await prisma.setting.create({ data: { key: PAYPAL_KEY, value: originalPaypal as object } });
    await app.close();
  });

  it('serves the built-in defaults until an admin saves anything', async () => {
    await prisma.setting.deleteMany({ where: { key: KEY } });
    const data = await footer();
    expect(data.trustBadges).toHaveLength(5);
    expect(data.aboutHeading).toBe('About Buildivo');
    expect(data.legalLinks.map((l: { label: string }) => l.label)).toContain('Privacy Policy');
    expect(data.paymentMethods.some((m: { label: string; highlight: boolean }) => m.label === 'Trade Net 30' && m.highlight)).toBe(true);
    expect(data.copyright).toContain('{year}');
    expect(data.social).toEqual({ facebook: '', instagram: '', linkedin: '', youtube: '', x: '' });
  });

  it('requires an admin to change the footer', async () => {
    await request(app.getHttpServer()).put(`/api/v1/admin/settings/${KEY}`).send({ value: {} }).expect(401);
  });

  it('serves what an admin saves, keeping fields that were left out at their defaults', async () => {
    await save({
      aboutHeading: 'About us',
      trustBadges: [{ icon: 'lock', title: 'Secure checkout', caption: 'Encrypted' }],
      legalLinks: [{ label: 'Privacy', href: '/privacy' }],
      social: { facebook: 'https://facebook.com/buildivo' },
    });
    const data = await footer();
    expect(data.aboutHeading).toBe('About us');
    expect(data.trustBadges).toEqual([{ icon: 'lock', title: 'Secure checkout', caption: 'Encrypted' }]);
    expect(data.legalLinks).toEqual([{ label: 'Privacy', href: '/privacy' }]);
    expect(data.social.facebook).toBe('https://facebook.com/buildivo');
    expect(data.aboutText).toContain('Built for tradespeople');
    expect(data.paymentMethods).toHaveLength(5);
  });

  it('respects an intentionally empty list', async () => {
    await save({ trustBadges: [], legalLinks: [], certifications: [] });
    const data = await footer();
    expect(data.trustBadges).toEqual([]);
    expect(data.legalLinks).toEqual([]);
    expect(data.certifications).toEqual([]);
  });

  it('drops unsafe links and malformed entries', async () => {
    await save({
      legalLinks: [
        { label: 'Bad script', href: 'javascript:alert(1)' },
        { label: 'Bad data', href: 'data:text/html,<script>1</script>' },
        { label: 'Protocol relative', href: '//evil.example.com' },
        { label: 'Has space', href: '/a b' },
        { label: '', href: '/no-label' },
        { label: 'Fine', href: 'https://example.com/terms' },
        { label: 'Mail', href: 'mailto:help@example.com' },
      ],
      social: { facebook: 'javascript:alert(1)', x: 'https://x.com/buildivo', youtube: 'ftp://nope' },
      trustBadges: [{ icon: 'Bad Icon!', title: 'Kept with fallback icon', caption: 'x' }, { icon: 'lock', title: '   ' }, 'not-an-object'],
      certifications: [{ label: 'Tone check', tone: 'purple' }],
    });
    const data = await footer();
    expect(data.legalLinks.map((l: { label: string }) => l.label)).toEqual(['Fine', 'Mail']);
    expect(data.social.facebook).toBe('');
    expect(data.social.youtube).toBe('');
    expect(data.social.x).toBe('https://x.com/buildivo');
    expect(data.trustBadges).toEqual([{ icon: 'verified', title: 'Kept with fallback icon', caption: 'x' }]);
    expect(data.certifications).toEqual([{ label: 'Tone check', tone: 'neutral' }]);
  });

  it('lists the payment gateways an admin has enabled under Integrations', async () => {
    await prisma.setting.deleteMany({ where: { key: PAYPAL_KEY } });
    expect((await footer()).gateways).not.toContain('PayPal');

    await prisma.setting.create({ data: { key: PAYPAL_KEY, value: { enabled: true, mode: 'SANDBOX' } } });
    expect((await footer()).gateways).toContain('PayPal');

    await prisma.setting.update({ where: { key: PAYPAL_KEY }, data: { value: { enabled: false, mode: 'SANDBOX' } } });
    expect((await footer()).gateways).not.toContain('PayPal');
  });
});
