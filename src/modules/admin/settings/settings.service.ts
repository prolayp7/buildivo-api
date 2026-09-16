import { BadRequestException, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { UpsertSettingDto } from './dto/upsert-setting.dto';
import { SaveIntegrationDto } from './dto/integration-settings.dto';

const scopes = ['payment.paypal', 'payment.2checkout', 'payment.stripe', 'payment.skrill', 'delivery.fedex', 'delivery.evri', 'email.smtp'] as const;
export type IntegrationScope = typeof scopes[number];
type StoredIntegration = { encrypted: string; iv: string; tag: string; mode: 'SANDBOX' | 'LIVE'; enabled?: boolean; updatedAt: string };

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService, private readonly jwt: JwtService, private readonly config: ConfigService) {}

  list() {
    return this.prisma.setting.findMany({ where: { NOT: { key: { startsWith: 'integration.' } } }, orderBy: { key: 'asc' } });
  }

  upsert(key: string, dto: UpsertSettingDto) {
    if (!key.trim()) throw new BadRequestException('Setting key is required');
    if (key.startsWith('integration.')) {
      throw new ForbiddenException('Protected integrations must be changed from their secured settings area');
    }
    const value = dto.value === null ? Prisma.JsonNull : (dto.value as Prisma.InputJsonValue);
    return this.prisma.setting.upsert({
      where: { key },
      create: { key, value },
      update: { value },
    });
  }

  private assertScope(value: string): asserts value is IntegrationScope {
    if (!scopes.includes(value as IntegrationScope)) throw new BadRequestException('Unknown integration');
  }

  private encryptionKey() {
    const secret = this.config.get<string>('SETTINGS_ENCRYPTION_KEY') || this.config.get<string>('JWT_ADMIN_SECRET');
    if (!secret) throw new Error('SETTINGS_ENCRYPTION_KEY or JWT_ADMIN_SECRET must be configured');
    return createHash('sha256').update(secret).digest();
  }

  private encrypt(settings: Record<string, unknown>) {
    const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', this.encryptionKey(), iv);
    const encrypted = Buffer.concat([cipher.update(JSON.stringify(settings), 'utf8'), cipher.final()]);
    return { encrypted: encrypted.toString('base64'), iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64') };
  }

  private decrypt(record: StoredIntegration): Record<string, unknown> {
    const decipher = createDecipheriv('aes-256-gcm', this.encryptionKey(), Buffer.from(record.iv, 'base64'));
    decipher.setAuthTag(Buffer.from(record.tag, 'base64'));
    return JSON.parse(Buffer.concat([decipher.update(Buffer.from(record.encrypted, 'base64')), decipher.final()]).toString('utf8')) as Record<string, unknown>;
  }

  private async assertUnlock(adminId: number, scope: string, token?: string) {
    this.assertScope(scope);
    if (!token) throw new UnauthorizedException('This settings area is locked');
    try {
      const payload = await this.jwt.verifyAsync<{ sub: number; purpose: string; scope: string }>(token);
      if (payload.sub !== adminId || payload.purpose !== 'settings-unlock' || payload.scope !== scope) throw new Error();
    } catch { throw new UnauthorizedException('Settings unlock has expired'); }
  }

  async unlock(adminId: number, scope: string, password: string) {
    this.assertScope(scope);
    const admin = await this.prisma.adminUser.findFirst({ where: { id: adminId, deletedAt: null }, include: { role: true } });
    if (!admin || admin.role.name.toLowerCase().replace(/\s+/g, '') !== 'superadmin') throw new ForbiddenException('Super Admin access is required');
    if (!(await bcrypt.compare(password, admin.passwordHash))) throw new UnauthorizedException('Super Admin password is incorrect');
    return { token: await this.jwt.signAsync({ sub: admin.id, purpose: 'settings-unlock', scope }, { expiresIn: '5m' }), expiresInSeconds: 300 };
  }

  async integrationSummaries() {
    const rows = await this.prisma.setting.findMany({ where: { key: { in: scopes.map((scope) => `integration.${scope}`) } } });
    const byKey = new Map(rows.map((row) => [row.key, row.value as unknown as StoredIntegration]));
    return scopes.map((scope) => { const value = byKey.get(`integration.${scope}`); return { scope, configured: Boolean(value?.encrypted), mode: value?.mode ?? 'SANDBOX', enabled: value?.enabled ?? true, updatedAt: value?.updatedAt ?? null }; });
  }

  async integration(adminId: number, scope: string, token?: string) {
    await this.assertUnlock(adminId, scope, token);
    const row = await this.prisma.setting.findUnique({ where: { key: `integration.${scope}` } });
    if (!row) return { scope, mode: 'SANDBOX', enabled: true, settings: {} };
    const record = row.value as unknown as StoredIntegration;
    return { scope, mode: record.mode, enabled: record.enabled ?? true, settings: this.decrypt(record) };
  }

  async saveIntegration(adminId: number, scope: string, token: string | undefined, dto: SaveIntegrationDto) {
    await this.assertUnlock(adminId, scope, token);
    const value: StoredIntegration = { ...this.encrypt(dto.settings), mode: dto.mode, enabled: dto.enabled, updatedAt: new Date().toISOString() };
    await this.prisma.setting.upsert({ where: { key: `integration.${scope}` }, create: { key: `integration.${scope}`, value: value as unknown as Prisma.InputJsonValue }, update: { value: value as unknown as Prisma.InputJsonValue } });
    return { scope, configured: true, mode: dto.mode, enabled: dto.enabled, updatedAt: value.updatedAt };
  }

  async internalIntegration(scope: IntegrationScope) {
    const row = await this.prisma.setting.findUnique({ where: { key: `integration.${scope}` } });
    if (!row) return null;
    const record = row.value as unknown as StoredIntegration;
    return { mode: record.mode, settings: this.decrypt(record) };
  }
}
