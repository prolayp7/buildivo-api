import { Module } from '@nestjs/common';
import { SettingsModule } from '../settings/settings.module';
import { AiConfigService } from './ai-config.service';
import { AiController } from './ai.controller';
import { EmbeddingsService } from './embeddings.service';
import { AiService } from './ai.service';

@Module({
  imports: [SettingsModule],
  controllers: [AiController],
  providers: [AiConfigService, EmbeddingsService, AiService],
  exports: [AiConfigService, EmbeddingsService],
})
export class AdminAiModule {}
