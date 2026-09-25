import { Injectable } from '@nestjs/common';
import { CapabilitiesService, type ExtensionState } from '../../capabilities/capabilities.service';
import { AiConfigService } from './ai-config.service';
import { EmbeddingsService } from './embeddings.service';

type Prerequisite = { label: string; met: boolean; detail?: string };
type Tier = { id: string; label: string; description: string; status: 'active' | 'waiting' | 'planned'; prerequisites: Prerequisite[] };

const extensionDetail: Record<ExtensionState, string> = {
  enabled: 'Enabled in this database',
  installable: 'Installed on the server - run CREATE EXTENSION in this database',
  unavailable: 'Not installed on the database server',
};

@Injectable()
export class AiService {
  constructor(private readonly capabilities: CapabilitiesService, private readonly config: AiConfigService, private readonly embeddings: EmbeddingsService) {}

  // What is switched on, and what each remaining feature is waiting for. Recomputed on every call
  // (extension detection is cached for 30s), so this reflects reality without any restart.
  async status() {
    const [extensions, openai, indexing] = await Promise.all([this.capabilities.extensions(), this.config.openai(), this.embeddings.stats()]);
    const usage = this.config.usage();
    const keyPrerequisite: Prerequisite = { label: 'OpenAI key saved and enabled', met: openai.ready, detail: openai.ready ? 'Ready' : openai.configured ? 'Saved but switched off' : 'No key saved' };
    const tiers: Tier[] = [
      { id: 'rules', label: 'Smart rules', description: 'Curated related products, bought-together, same platform, same category and best sellers. Always on, no key needed.', status: 'active', prerequisites: [] },
      { id: 'semantic', label: 'Semantic similar products', description: 'Finds look-alike products by meaning using embeddings. Shoppers never trigger an OpenAI call - the catalogue is indexed once and re-indexed only when a product\'s text changes.', status: extensions.vector === 'enabled' && indexing.indexed > 0 ? 'active' : 'waiting', prerequisites: [{ label: 'pgvector extension', met: extensions.vector === 'enabled', detail: extensionDetail[extensions.vector] }, keyPrerequisite, { label: 'Catalogue indexed', met: indexing.total > 0 && indexing.indexed >= indexing.total, detail: `${indexing.indexed} of ${indexing.total} products` }] },
      { id: 'assistant', label: 'Guided product assistant', description: 'Answers free-text questions on the search page, such as "which drill for concrete?", using only products in your catalogue. Simple searches never use it, and repeated questions are answered from a cache.', status: openai.ready ? 'active' : 'waiting', prerequisites: [keyPrerequisite, { label: 'Daily call limit', met: usage.callsToday < usage.dailyLimit, detail: `${usage.callsToday} of ${usage.dailyLimit} used today` }] },
    ];
    return {
      extensions: [
        { name: 'pg_trgm', state: extensions.pg_trgm, feature: 'Typo-tolerant product search', detail: extensionDetail[extensions.pg_trgm] },
        { name: 'vector', state: extensions.vector, feature: 'Semantic similar products', detail: extensionDetail[extensions.vector] },
      ],
      indexing,
      usage,
      openai: { configured: openai.configured, enabled: openai.enabled, chatModel: openai.chatModel, embeddingModel: openai.embeddingModel },
      tiers,
    };
  }

  reindex() { return this.embeddings.sync(); }

  // Verifies the saved key by asking OpenAI for the embedding model's metadata (free, no tokens used).
  async testConnection(): Promise<{ ok: boolean; message: string }> {
    const openai = await this.config.openai();
    if (!openai.configured) return { ok: false, message: 'Save an OpenAI API key first.' };
    if (!openai.enabled) return { ok: false, message: 'The OpenAI integration is switched off.' };
    try {
      const response = await fetch(`https://api.openai.com/v1/models/${encodeURIComponent(openai.embeddingModel)}`, {
        headers: { Authorization: `Bearer ${openai.apiKey}` },
        signal: AbortSignal.timeout(10_000),
      });
      if (response.ok) return { ok: true, message: `Connected. Model ${openai.embeddingModel} is available.` };
      if (response.status === 401) return { ok: false, message: 'OpenAI rejected this key. Check it was copied in full.' };
      if (response.status === 403) return { ok: false, message: 'This key is not allowed to use that model.' };
      if (response.status === 404) return { ok: false, message: `The model "${openai.embeddingModel}" was not found for this key.` };
      if (response.status === 429) return { ok: false, message: 'OpenAI reports the quota or rate limit is exhausted.' };
      return { ok: false, message: `OpenAI returned an unexpected error (${response.status}).` };
    } catch {
      return { ok: false, message: 'Could not reach OpenAI. Check the server can access the internet.' };
    }
  }
}
