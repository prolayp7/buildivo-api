import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';

const GENERAL_SETTINGS_KEY = 'general.site';

@Injectable()
export class StorefrontSettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async general(): Promise<Record<string, unknown>> {
    const row = await this.prisma.setting.findUnique({ where: { key: GENERAL_SETTINGS_KEY } });
    return (row?.value as Record<string, unknown>) ?? {};
  }
}
