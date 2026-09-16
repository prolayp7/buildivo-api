import { PrismaService } from '../../prisma/prisma.service';

// Best-effort "who gets internal ops emails" lookup, shared by anything that
// needs to notify staff (low-stock alerts, new RFQ submissions, ...).
export async function resolveAdminEmail(prisma: PrismaService): Promise<string | null> {
  const row = await prisma.setting.findUnique({ where: { key: 'general.site' } });
  const value = row?.value as Record<string, unknown> | undefined;
  const configured = (value?.supportEmail ?? value?.email) as string | undefined;
  return configured || process.env.SEED_ADMIN_EMAIL || null;
}
