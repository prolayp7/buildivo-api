import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { correlationId } from './correlation';

export interface AuditEntry {
  action: string;
  entity: string;
  entityId: string | number;
  actor?: { type: 'ADMIN' | 'CUSTOMER'; id: number };
  meta?: Prisma.InputJsonValue;
}

/** Append-only record of who did what. Never throws - an audit failure must not undo the action. */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);
  constructor(private readonly prisma: PrismaService) {}

  async log(entry: AuditEntry): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          actorType: entry.actor?.type ?? 'SYSTEM',
          actorId: entry.actor?.id,
          action: entry.action,
          entity: entry.entity,
          entityId: String(entry.entityId),
          meta: entry.meta,
          correlationId: correlationId(),
        },
      });
    } catch (error) {
      this.logger.error(`Audit write failed for ${entry.action}: ${error instanceof Error ? error.message : error}`);
    }
  }
}
