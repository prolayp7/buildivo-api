import { Injectable, Logger } from '@nestjs/common';
import { SettingsService } from '../settings/settings.service';

export interface OpenAiConfig {
  /** A key has been saved. */
  configured: boolean;
  /** The admin has not switched the integration off. */
  enabled: boolean;
  /** configured && enabled - the only state in which anything may call OpenAI. */
  ready: boolean;
  apiKey: string | null;
  chatModel: string;
  embeddingModel: string;
}

const DEFAULT_CHAT_MODEL = 'gpt-4o-mini';
const DEFAULT_EMBEDDING_MODEL = 'text-embedding-3-small';
const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

// Single place that reads the OpenAI credentials (stored encrypted under Settings > Integrations).
// Every AI feature asks this whether it may run; with no key, nothing ever calls OpenAI.
@Injectable()
export class AiConfigService {
  private readonly logger = new Logger(AiConfigService.name);

  private usageDay = '';
  private usageCalls = 0;

  constructor(private readonly settings: SettingsService) {}

  private dailyLimit() {
    const limit = Number(process.env.AI_ASSISTANT_DAILY_LIMIT);
    return Number.isFinite(limit) && limit >= 0 ? limit : 300;
  }

  private rollDay() {
    const today = new Date().toISOString().slice(0, 10);
    if (today !== this.usageDay) { this.usageDay = today; this.usageCalls = 0; }
  }

  usage() {
    this.rollDay();
    return { callsToday: this.usageCalls, dailyLimit: this.dailyLimit() };
  }

  // Spend guard for the chat assistant: false once today's cap is used up (UTC day).
  // ponytail: counted per server instance, so N instances allow N x the cap; move to the DB if that matters.
  reserveAssistantCall(): boolean {
    this.rollDay();
    if (this.usageCalls >= this.dailyLimit()) return false;
    this.usageCalls += 1;
    return true;
  }

  async openai(): Promise<OpenAiConfig> {
    let integration: Awaited<ReturnType<SettingsService['internalIntegration']>> = null;
    try {
      integration = await this.settings.internalIntegration('ai.openai');
    } catch (error) {
      this.logger.warn(`OpenAI settings could not be read, AI disabled: ${error instanceof Error ? error.message : error}`);
    }
    const values = (integration?.settings ?? {}) as Record<string, unknown>;
    const apiKey = text(values.apiKey) || null;
    const enabled = integration?.enabled ?? true;
    return {
      configured: Boolean(apiKey),
      enabled,
      ready: Boolean(apiKey) && enabled,
      apiKey,
      chatModel: text(values.chatModel) || DEFAULT_CHAT_MODEL,
      embeddingModel: text(values.embeddingModel) || DEFAULT_EMBEDDING_MODEL,
    };
  }
}
