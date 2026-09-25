import { createHash } from 'crypto';
import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { withLease } from '../../../common/lease';
import { PrismaService } from '../../../prisma/prisma.service';
import { CapabilitiesService } from '../../capabilities/capabilities.service';
import { AiConfigService } from './ai-config.service';

// text-embedding-3-* models can be asked for exactly this size; ada-002 is natively this size.
const DIMENSIONS = 1536;
const BATCH_SIZE = 64;
const SYNC_MS = 10 * 60 * 1000;
const LEASE_KEY = 727302;

export type SyncResult = { state: 'done' | 'no-key' | 'no-extension' | 'busy' | 'error'; indexed: number; message: string };

type ProductForEmbedding = {
  title: string; shortDescription: string | null; description: string | null; toolPlatform: string | null;
  specsSummary: Prisma.JsonValue; brand: { title: string } | null; category: { title: string };
};

// What the embedding "sees" for a product. Only descriptive fields - never price or stock - so a
// price change does not trigger a re-embed (and cost) while a real content change does.
export function embeddingText(p: ProductForEmbedding): string {
  const specs = p.specsSummary && typeof p.specsSummary === 'object' && !Array.isArray(p.specsSummary)
    ? Object.entries(p.specsSummary).map(([key, value]) => `${key}: ${String(value)}`).join('; ')
    : '';
  return [p.title, p.brand?.title && `Brand: ${p.brand.title}`, `Category: ${p.category.title}`, p.toolPlatform && `Platform: ${p.toolPlatform}`, p.shortDescription, specs, p.description?.slice(0, 1000)]
    .filter(Boolean).join('\n').slice(0, 6000);
}

export const vectorLiteral = (values: number[]) => `[${values.join(',')}]`;

// Keeps one OpenAI embedding per active product in `product_embeddings` (pgvector), so
// "similar products" is a single database query at request time - no OpenAI call per page view.
// Requests to OpenAI happen only here, only for products that are new or whose text changed.
// The table is created at runtime (not by a Prisma migration) so it exists only where pgvector does.
@Injectable()
export class EmbeddingsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EmbeddingsService.name);
  private timer?: NodeJS.Timeout;
  private running = false;
  private schemaReady = false;
  lastRun: (SyncResult & { at: string }) | null = null;

  constructor(private readonly prisma: PrismaService, private readonly capabilities: CapabilitiesService, private readonly config: AiConfigService) {}

  onModuleInit() {
    if (process.env.NODE_ENV === 'test') return;
    this.timer = setInterval(() => void this.sync().catch((e) => this.logger.error(e)), SYNC_MS);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  // Creates the extension (if the server has it but this database does not yet) and the table.
  private async ensureSchema(): Promise<boolean> {
    if (this.schemaReady) return true;
    if ((await this.capabilities.extensions()).vector === 'unavailable') return false;
    try {
      await this.prisma.$executeRawUnsafe('CREATE EXTENSION IF NOT EXISTS vector');
      await this.prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS product_embeddings (
        product_id   integer PRIMARY KEY REFERENCES products(id) ON DELETE CASCADE,
        embedding    vector(${DIMENSIONS}) NOT NULL,
        content_hash text NOT NULL,
        model        text NOT NULL,
        updated_at   timestamptz NOT NULL DEFAULT now())`);
      await this.prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS product_embeddings_hnsw ON product_embeddings USING hnsw (embedding vector_cosine_ops)');
    } catch (error) {
      this.logger.warn(`pgvector could not be set up: ${error instanceof Error ? error.message : error}`);
      return false;
    } finally {
      this.capabilities.invalidate();
    }
    return (this.schemaReady = true);
  }

  async stats(): Promise<{ indexed: number; total: number; running: boolean; lastRun: EmbeddingsService['lastRun'] }> {
    const total = await this.prisma.product.count({ where: { status: 'ACTIVE', deletedAt: null } });
    let indexed = 0;
    if (await this.capabilities.isEnabled('vector')) {
      try {
        const [row] = await this.prisma.$queryRaw<{ n: bigint }[]>`SELECT count(*) AS n FROM product_embeddings e JOIN products p ON p.id = e.product_id WHERE p.status = 'ACTIVE' AND p.deleted_at IS NULL`;
        indexed = Number(row.n);
      } catch { /* table not created yet - nothing indexed */ }
    }
    return { indexed, total, running: this.running, lastRun: this.lastRun };
  }

  async sync(): Promise<SyncResult> {
    if (this.running) return this.record({ state: 'busy', indexed: 0, message: 'Indexing is already running.' });
    this.running = true;
    try {
      const openai = await this.config.openai();
      if (!openai.ready) return this.record({ state: 'no-key', indexed: 0, message: 'Save and enable an OpenAI key first.' });
      if (!(await this.ensureSchema())) return this.record({ state: 'no-extension', indexed: 0, message: 'The pgvector extension is not available in this database.' });
      const result = await withLease(this.prisma, LEASE_KEY, () => this.indexStale(openai.apiKey!, openai.embeddingModel));
      return this.record(result ?? { state: 'busy', indexed: 0, message: 'Another server is already indexing.' });
    } catch (error) {
      this.logger.error(error);
      return this.record({ state: 'error', indexed: 0, message: 'Indexing failed unexpectedly. Check the server log.' });
    } finally {
      this.running = false;
    }
  }

  private record(result: SyncResult): SyncResult {
    this.lastRun = { ...result, at: new Date().toISOString() };
    return result;
  }

  private async indexStale(apiKey: string, model: string): Promise<SyncResult> {
    const products = await this.prisma.product.findMany({
      where: { status: 'ACTIVE', deletedAt: null },
      select: { id: true, title: true, shortDescription: true, description: true, toolPlatform: true, specsSummary: true, brand: { select: { title: true } }, category: { select: { title: true } } },
    });
    const existing = await this.prisma.$queryRaw<{ product_id: number; content_hash: string; model: string }[]>`SELECT product_id, content_hash, model FROM product_embeddings`;
    const known = new Map(existing.map((row) => [row.product_id, row]));
    const stale = products
      .map((p) => { const text = embeddingText(p); return { id: p.id, text, hash: createHash('sha256').update(text).digest('hex') }; })
      .filter((p) => { const row = known.get(p.id); return !row || row.content_hash !== p.hash || row.model !== model; });

    let indexed = 0;
    for (let i = 0; i < stale.length; i += BATCH_SIZE) {
      const batch = stale.slice(i, i + BATCH_SIZE);
      const vectors = await this.embed(apiKey, model, batch.map((p) => p.text));
      if (typeof vectors === 'string') return { state: 'error', indexed, message: vectors };
      for (const [index, item] of batch.entries()) {
        await this.prisma.$executeRaw`INSERT INTO product_embeddings (product_id, embedding, content_hash, model, updated_at)
          VALUES (${item.id}, ${vectorLiteral(vectors[index])}::vector, ${item.hash}, ${model}, now())
          ON CONFLICT (product_id) DO UPDATE SET embedding = EXCLUDED.embedding, content_hash = EXCLUDED.content_hash, model = EXCLUDED.model, updated_at = now()`;
        indexed += 1;
      }
    }
    if (indexed) this.logger.log(`Embedded ${indexed} product(s)`);
    return { state: 'done', indexed, message: indexed ? `Indexed ${indexed} product(s).` : 'Everything is already up to date.' };
  }

  // Returns the vectors in input order, or a human-readable error string (never throws for API errors).
  private async embed(apiKey: string, model: string, inputs: string[]): Promise<number[][] | string> {
    try {
      const response = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, input: inputs, ...(model.startsWith('text-embedding-3') ? { dimensions: DIMENSIONS } : {}) }),
        signal: AbortSignal.timeout(60_000),
      });
      if (response.status === 401) return 'OpenAI rejected the API key.';
      if (response.status === 429) return 'OpenAI quota or rate limit reached - indexing will resume on the next run.';
      if (!response.ok) return `OpenAI returned an error (${response.status}).`;
      const body = (await response.json()) as { data: { index: number; embedding: number[] }[] };
      const sorted = [...body.data].sort((a, b) => a.index - b.index).map((item) => item.embedding);
      if (sorted.length !== inputs.length || sorted.some((v) => v.length !== DIMENSIONS)) return `The embedding model "${model}" did not return ${DIMENSIONS}-dimension vectors.`;
      return sorted;
    } catch {
      return 'Could not reach OpenAI.';
    }
  }

  // Nearest products by meaning to an already-indexed product; [] whenever the feature is off.
  async similarIds(productId: number, limit: number): Promise<number[]> {
    if (!(await this.capabilities.isEnabled('vector'))) return [];
    try {
      const rows = await this.prisma.$queryRaw<{ product_id: number }[]>`
        SELECT e.product_id FROM product_embeddings e
        JOIN products p ON p.id = e.product_id
        WHERE e.product_id <> ${productId} AND p.status = 'ACTIVE' AND p.deleted_at IS NULL
          AND EXISTS (SELECT 1 FROM product_embeddings s WHERE s.product_id = ${productId})
        ORDER BY e.embedding <=> (SELECT embedding FROM product_embeddings WHERE product_id = ${productId})
        LIMIT ${limit}`;
      return rows.map((row) => row.product_id);
    } catch (error) {
      this.logger.debug(`Semantic lookup skipped: ${error instanceof Error ? error.message : error}`);
      return [];
    }
  }
}
