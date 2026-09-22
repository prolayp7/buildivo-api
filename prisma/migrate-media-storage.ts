// One-time migration: moves existing uploaded files out of the old flat
// uploads/ directory into the new bucketed storage/ layout, and rewrites
// each Media row's url to match. Safe to re-run - already-migrated rows
// (url already containing a subfolder) are skipped.
import 'dotenv/config';
import { PrismaClient, MediaOwnerType } from '@prisma/client';
import { existsSync, promises as fs } from 'fs';
import { join, resolve } from 'path';
import { mediaBuckets, mediaUploadDirectory } from '../src/bootstrap';

const prisma = new PrismaClient();
const legacyDir = resolve(process.cwd(), 'uploads');

function resolveBucket(ownerType: MediaOwnerType, collection: string): string {
  if (ownerType === 'PRODUCT' && collection === 'products') return mediaBuckets.productOriginals;
  if (ownerType === 'CATEGORY' || (ownerType === 'LIBRARY' && collection.startsWith('category-'))) return mediaBuckets.categories;
  if (ownerType === 'BRAND' || (ownerType === 'LIBRARY' && collection.startsWith('brand-'))) return mediaBuckets.brands;
  if (ownerType === 'LIBRARY' && collection.startsWith('general-')) return mediaBuckets.logos;
  return mediaBuckets.misc;
}

async function main() {
  const rows = await prisma.media.findMany({ where: { url: { startsWith: '/uploads/' } } });
  for (const row of rows) {
    const filename = row.url.slice('/uploads/'.length);
    if (filename.includes('/')) { console.log(`skip (already migrated) media ${row.id}: ${row.url}`); continue; }
    const source = join(legacyDir, filename);
    if (!existsSync(source)) { console.warn(`skip (file missing on disk) media ${row.id}: ${source}`); continue; }
    const bucket = resolveBucket(row.ownerType, row.collection);
    const destDir = join(mediaUploadDirectory, bucket);
    await fs.mkdir(destDir, { recursive: true });
    const dest = join(destDir, filename);
    await fs.copyFile(source, dest);
    const [srcStat, destStat] = await Promise.all([fs.stat(source), fs.stat(dest)]);
    if (srcStat.size !== destStat.size) throw new Error(`size mismatch after copy for media ${row.id}: ${source} -> ${dest}`);
    await fs.unlink(source);
    const newUrl = `/uploads/${bucket}/${filename}`;
    await prisma.media.update({ where: { id: row.id }, data: { url: newUrl } });
    console.log(`moved media ${row.id}: ${row.url} -> ${newUrl}`);
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
