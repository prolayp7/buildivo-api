import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { PrismaService } from '../../src/prisma/prisma.service';
import { loginAsSuperAdmin } from './helpers/admin-auth';
import { AiConfigService } from '../../src/modules/admin/ai/ai-config.service';
import { EmbeddingsService, embeddingText, vectorLiteral } from '../../src/modules/admin/ai/embeddings.service';
import { CapabilitiesService } from '../../src/modules/capabilities/capabilities.service';
import { createTestApp } from './setup';

const api = (app: INestApplication) => request(app.getHttpServer());
const AI_KEY = 'integration.ai.openai';

describe('Recommendations and AI status (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let admin: string;
  let originalAi: unknown;
  let products: { id: number; slug: string }[];
  let vectorOn = false;

  const recs = async (slug: string, limit = 4) => (await api(app).get(`/api/v1/products/${slug}/recommendations?limit=${limit}`).expect(200)).body.data as { id: number; recommendationSource: string }[];

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    admin = await loginAsSuperAdmin(app);
    originalAi = (await prisma.setting.findUnique({ where: { key: AI_KEY } }))?.value;
    vectorOn = (await app.get(CapabilitiesService).extensions()).vector === 'enabled';
    products = await prisma.product.findMany({ where: { status: 'ACTIVE', deletedAt: null }, select: { id: true, slug: true }, orderBy: { id: 'asc' }, take: 4 });
    expect(products.length).toBeGreaterThanOrEqual(4);
    await prisma.productRelated.deleteMany({ where: { productId: products[0].id } });
  });

  afterAll(async () => {
    await prisma.productRelated.deleteMany({ where: { productId: products[0].id } });
    await prisma.setting.deleteMany({ where: { key: AI_KEY } });
    if (originalAi !== undefined) await prisma.setting.create({ data: { key: AI_KEY, value: originalAi as object } });
    await app.close();
  });

  it('works with no AI key: fills up to the limit, never includes the product itself, no duplicates', async () => {
    const items = await recs(products[0].slug, 6);
    expect(items.length).toBeGreaterThan(0);
    expect(items.length).toBeLessThanOrEqual(6);
    expect(items.map((i) => i.id)).not.toContain(products[0].id);
    expect(new Set(items.map((i) => i.id)).size).toBe(items.length);
    for (const item of items) expect(['curated', 'bought-together', 'same-platform', 'similar', 'same-category', 'best-seller']).toContain(item.recommendationSource);
  });

  it('puts admin-curated related products first', async () => {
    await prisma.productRelated.create({ data: { productId: products[0].id, relatedProductId: products[3].id } });
    const items = await recs(products[0].slug);
    expect(items[0]).toMatchObject({ id: products[3].id, recommendationSource: 'curated' });
  });

  it('honours the limit and 404s for an unknown product', async () => {
    expect(await recs(products[0].slug, 1)).toHaveLength(1);
    await api(app).get('/api/v1/products/no-such-product-xyz/recommendations').expect(404);
  });

  describe('admin AI status', () => {
    it('requires an admin', async () => {
      await api(app).get('/api/v1/admin/ai/status').expect(401);
      await api(app).post('/api/v1/admin/ai/test').expect(401);
    });

    it('reports smart rules active and AI tiers waiting when no key is saved', async () => {
      await prisma.setting.deleteMany({ where: { key: AI_KEY } });
      const { data } = (await api(app).get('/api/v1/admin/ai/status').set('Authorization', `Bearer ${admin}`).expect(200)).body;
      expect(data.openai.configured).toBe(false);
      const tiers = Object.fromEntries(data.tiers.map((t: { id: string }) => [t.id, t]));
      expect(tiers.rules.status).toBe('active');
      expect(tiers.assistant.prerequisites[0].met).toBe(false);
      expect(data.extensions.map((e: { name: string }) => e.name)).toEqual(['pg_trgm', 'vector']);
    });

    it('tests the connection without calling OpenAI when there is no key, and never exposes the key', async () => {
      const result = (await api(app).post('/api/v1/admin/ai/test').set('Authorization', `Bearer ${admin}`).expect(200)).body.data;
      expect(result).toEqual({ ok: false, message: 'Save an OpenAI API key first.' });
      const status = await api(app).get('/api/v1/admin/ai/status').set('Authorization', `Bearer ${admin}`).expect(200);
      expect(JSON.stringify(status.body)).not.toContain('apiKey');
    });
  });
  describe('semantic tier (pgvector)', () => {
    it('builds embedding text from descriptive fields only', () => {
      const text = embeddingText({ title: 'Cordless Drill', shortDescription: 'Compact', description: 'Long text', toolPlatform: 'DeWalt 18V XR', specsSummary: { Voltage: '18V', Chuck: 13 }, brand: { title: 'DeWalt' }, category: { title: 'Drills' } });
      expect(text).toContain('Cordless Drill');
      expect(text).toContain('Brand: DeWalt');
      expect(text).toContain('Platform: DeWalt 18V XR');
      expect(text).toContain('Voltage: 18V; Chuck: 13');
      expect(vectorLiteral([1, 0.5, -2])).toBe('[1,0.5,-2]');
    });

    it('requires an admin to reindex', async () => {
      await api(app).post('/api/v1/admin/ai/reindex').expect(401);
    });

    it('does nothing and reports why when there is no key', async () => {
      await prisma.setting.deleteMany({ where: { key: AI_KEY } });
      const result = (await api(app).post('/api/v1/admin/ai/reindex').set('Authorization', `Bearer ${admin}`).expect(200)).body.data;
      expect(result).toMatchObject({ state: 'no-key', indexed: 0 });
    });

    it('reports no-extension (and makes no OpenAI call) when a key exists but pgvector does not', async () => {
      if (vectorOn) return;
      const fetchSpy = jest.spyOn(global, 'fetch');
      const config = jest.spyOn(app.get(AiConfigService), 'openai').mockResolvedValue({ configured: true, enabled: true, ready: true, apiKey: 'sk-test', chatModel: 'x', embeddingModel: 'text-embedding-3-small' });
      try {
        expect(await app.get(EmbeddingsService).sync()).toMatchObject({ state: 'no-extension', indexed: 0 });
        expect(fetchSpy).not.toHaveBeenCalled();
      } finally {
        fetchSpy.mockRestore();
        config.mockRestore();
      }
    });

    it('reports the semantic tier as waiting and returns no semantic picks while it is not indexed', async () => {
      const { data } = (await api(app).get('/api/v1/admin/ai/status').set('Authorization', `Bearer ${admin}`).expect(200)).body;
      const semantic = data.tiers.find((t: { id: string }) => t.id === 'semantic');
      if (!vectorOn) expect(semantic.status).toBe('waiting');
      expect(data.indexing.total).toBeGreaterThan(0);
      if (!vectorOn) expect(await app.get(EmbeddingsService).similarIds(products[0].id, 4)).toEqual([]);
    });

    it('indexes the catalogue with a mocked OpenAI and serves similar products (needs pgvector installed)', async () => {
      if (!vectorOn) {
        console.warn('pgvector is not installed in the test database - semantic indexing test not exercised');
        return;
      }
      const fetchSpy = jest.spyOn(global, 'fetch').mockImplementation((async (_url: unknown, init?: { body?: string }) => {
        const inputs = JSON.parse(init?.body ?? '{}').input as string[];
        // deterministic pseudo-embeddings: same text -> same vector, near-identical text -> near vector
        const data = inputs.map((text, index) => ({ index, embedding: Array.from({ length: 1536 }, (_, i) => Math.sin((text.length % 97) + i)) }));
        return new Response(JSON.stringify({ data }), { status: 200 });
      }) as typeof fetch);
      const config = jest.spyOn(app.get(AiConfigService), 'openai').mockResolvedValue({ configured: true, enabled: true, ready: true, apiKey: 'sk-test', chatModel: 'x', embeddingModel: 'text-embedding-3-small' });
      try {
        const first = await app.get(EmbeddingsService).sync();
        expect(first.state).toBe('done');
        expect(first.indexed).toBeGreaterThan(0);
        const second = await app.get(EmbeddingsService).sync();
        expect(second).toMatchObject({ state: 'done', indexed: 0 }); // nothing changed - no repeat cost
        const ids = await app.get(EmbeddingsService).similarIds(products[0].id, 4);
        expect(ids.length).toBeGreaterThan(0);
        expect(ids).not.toContain(products[0].id);
        const items = await recs(products[0].slug, 8);
        expect(items.some((i) => i.recommendationSource === 'similar' || i.recommendationSource === 'curated')).toBe(true);
      } finally {
        fetchSpy.mockRestore();
        config.mockRestore();
      }
    });
  });
  describe('free-text assistant', () => {
    const advise = async (q: string) => (await api(app).get('/api/v1/products/assistant').query({ q }).expect(200)).body.data as { mode: string; answer: string | null; products: { id: number }[] };
    let title: string;
    let fetchSpy: jest.SpyInstance;
    let config: jest.SpyInstance;
    let chatCalls: number;
    let chatReply: () => Response;

    beforeAll(async () => {
      title = (await prisma.product.findUniqueOrThrow({ where: { id: products[0].id } })).title;
    });
    beforeEach(() => {
      chatCalls = 0;
      chatReply = () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ answer: 'This one fits.', productIds: [products[0].id, 999999999] }) } }] }), { status: 200 });
      fetchSpy = jest.spyOn(global, 'fetch').mockImplementation((async (url: unknown) => {
        if (String(url).includes('/chat/completions')) { chatCalls += 1; return chatReply(); }
        throw new Error(`unexpected fetch ${String(url)}`);
      }) as typeof fetch);
      config = jest.spyOn(app.get(AiConfigService), 'openai').mockResolvedValue({ configured: true, enabled: true, ready: true, apiKey: 'sk-test', chatModel: 'gpt-test', embeddingModel: 'x' });
    });
    afterEach(() => {
      fetchSpy.mockRestore();
      config.mockRestore();
      delete process.env.AI_ASSISTANT_DAILY_LIMIT;
    });

    it('stays out of the way without a key', async () => {
      config.mockResolvedValue({ configured: false, enabled: true, ready: false, apiKey: null, chatModel: 'x', embeddingModel: 'x' });
      expect(await advise(`I need something like ${title} please?`)).toMatchObject({ mode: 'none', products: [] });
      expect(chatCalls).toBe(0);
    });

    it('never calls OpenAI for a short keyword search', async () => {
      expect((await advise('drill')).mode).toBe('none');
      expect((await advise('cordless drill')).mode).toBe('none');
      expect(chatCalls).toBe(0);
    });

    it('answers a free-text question using only shortlisted catalogue products, and caches it', async () => {
      const question = `Which product is similar to ${title} for my garage? ${Date.now()}`;
      const first = await advise(question);
      expect(first).toMatchObject({ mode: 'assistant', answer: 'This one fits.' });
      expect(first.products.map((p) => p.id)).toEqual([products[0].id]); // 999999999 was not on the shortlist
      const second = await advise(question);
      expect(second.products.map((p) => p.id)).toEqual([products[0].id]);
      expect(chatCalls).toBe(1);
    });

    it('does not call OpenAI when nothing in the catalogue matches', async () => {
      expect((await advise('zzqxv wwkjh ppqrz yyxxw?')).mode).toBe('none');
      expect(chatCalls).toBe(0);
    });

    it('falls back quietly when OpenAI errors or returns junk', async () => {
      chatReply = () => new Response('nope', { status: 500 });
      expect((await advise(`Which product is similar to ${title} for a shed? a${Date.now()}`)).mode).toBe('none');
      chatReply = () => new Response(JSON.stringify({ choices: [{ message: { content: 'not json' } }] }), { status: 200 });
      expect((await advise(`Which product is similar to ${title} for a loft? b${Date.now()}`)).mode).toBe('none');
    });

    it('stops calling OpenAI once the daily limit is used', async () => {
      process.env.AI_ASSISTANT_DAILY_LIMIT = String(app.get(AiConfigService).usage().callsToday);
      expect((await advise(`Which product is similar to ${title} for a barn? c${Date.now()}`)).mode).toBe('none');
      expect(chatCalls).toBe(0);
    });

    it('shows usage in the admin status', async () => {
      const { data } = (await api(app).get('/api/v1/admin/ai/status').set('Authorization', `Bearer ${admin}`).expect(200)).body;
      expect(data.usage).toEqual({ callsToday: expect.any(Number), dailyLimit: expect.any(Number) });
    });
  });
});
