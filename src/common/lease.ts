import { PrismaService } from '../prisma/prisma.service';

/** Runs `job` only if no other app instance is running the same job: an advisory lock
 * held by an open transaction (released automatically when it ends or the process dies).
 * Returns null when another instance holds the lease. */
export async function withLease<T>(prisma: PrismaService, key: number, job: () => Promise<T>): Promise<T | null> {
  return prisma.$transaction(
    async (tx) => {
      const [{ locked }] = await tx.$queryRaw<{ locked: boolean }[]>`SELECT pg_try_advisory_xact_lock(${key}) AS locked`;
      return locked ? job() : null;
    },
    { maxWait: 5_000, timeout: 10 * 60_000 },
  );
}
