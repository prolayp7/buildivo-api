import { HomepageSectionType, Prisma, PrismaClient } from '@prisma/client';

// The homepage copy and links the storefront still hardcodes, stored in each section's
// HomepageSection.config so they can become admin-editable (the other sections' content is seeded in
// seed.ts). Values reproduce what the homepage shows today, with one correction: each project kit's
// "View Material List" links to its own product bundle instead of the general /guides page.
//
// Config keys written (the contract for wiring the admin and storefront):
//   DEPARTMENTS        heading, linkLabel, linkHref
//   FEATURED_PRODUCTS  heading, linkLabel, linkHref
//   PROJECT_KITS       kits[].bundleSlug   (only on kits that already exist in the config)
//
// Idempotent: keys already present are never overwritten, so admin edits survive a reseed.
// Standalone: npx ts-node prisma/seed-homepage-content.ts

const SECTION_TEXT: Partial<Record<HomepageSectionType, Record<string, string>>> = {
  // "View all products" currently goes to Power Tools; there is no all-products page yet.
  DEPARTMENTS: { heading: 'Shop by Department', linkLabel: 'View all products', linkHref: '/c/power-tools' },
  FEATURED_PRODUCTS: { heading: 'Featured Pro Tools', linkLabel: 'Shop all Power Tools', linkHref: '/c/power-tools' },
};

// Kit name (as seeded / shown today) -> bundle seeded in seed.ts with the same job.
const KIT_BUNDLES: { kitName: string; bundleSlug: string }[] = [
  { kitName: 'Decking & Outdoor Framing', bundleSlug: 'decking-outdoor-framing-kit' },
  { kitName: 'Complete Bathroom Refit', bundleSlug: 'complete-bathroom-refit-kit' },
  { kitName: 'Jobsite Electrical Rough-In', bundleSlug: 'jobsite-electrical-rough-in-kit' },
  { kitName: 'Workshop Storage Build', bundleSlug: 'workshop-storage-build-kit' },
];

const asRecord = (value: unknown): Record<string, unknown> => (value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {});

export async function seedHomepageContent(prisma: PrismaClient): Promise<string[]> {
  const notes: string[] = [];

  for (const [type, values] of Object.entries(SECTION_TEXT) as [HomepageSectionType, Record<string, string>][]) {
    const section = await prisma.homepageSection.findFirst({ where: { type }, select: { id: true, config: true } });
    if (!section) { notes.push(`${type}: no homepage section row; content not seeded.`); continue; }
    const config = asRecord(section.config);
    const missing = Object.fromEntries(Object.entries(values).filter(([key]) => config[key] === undefined));
    if (!Object.keys(missing).length) continue;
    await prisma.homepageSection.update({ where: { id: section.id }, data: { config: { ...config, ...missing } as Prisma.InputJsonValue } });
    notes.push(`${type}: seeded ${Object.keys(missing).join(', ')}.`);
  }

  // Project kits: link each kit to its bundle, only where the bundle exists and is active.
  const kitsSection = await prisma.homepageSection.findFirst({ where: { type: 'PROJECT_KITS' }, select: { id: true, config: true } });
  const kitsConfig = asRecord(kitsSection?.config);
  if (!kitsSection) notes.push('PROJECT_KITS: no homepage section row; bundle links not seeded.');
  else if (!Array.isArray(kitsConfig.kits)) notes.push('PROJECT_KITS: no kits list saved yet (save the kits once in Admin > Project kits); bundle links not seeded.');
  else {
    const active = new Set((await prisma.productBundle.findMany({ where: { status: 'ACTIVE' }, select: { slug: true } })).map((bundle) => bundle.slug));
    let linked = 0;
    const kits = kitsConfig.kits.map((entry) => {
      const kit = asRecord(entry);
      if (kit.bundleSlug !== undefined || typeof kit.name !== 'string') return entry;
      // Admin-edited names may carry a suffix (e.g. "… 1"), so match on the start of the name.
      const match = KIT_BUNDLES.find((candidate) => (kit.name as string).startsWith(candidate.kitName));
      if (!match || !active.has(match.bundleSlug)) return entry;
      linked += 1;
      return { ...kit, bundleSlug: match.bundleSlug };
    });
    if (linked) {
      await prisma.homepageSection.update({ where: { id: kitsSection.id }, data: { config: { ...kitsConfig, kits } as Prisma.InputJsonValue } });
      notes.push(`PROJECT_KITS: linked ${linked} kit${linked === 1 ? '' : 's'} to their bundles.`);
    }
    const unlinked = kits.filter((entry) => asRecord(entry).bundleSlug === undefined).map((entry) => asRecord(entry).name);
    if (unlinked.length) notes.push(`PROJECT_KITS: no active bundle for ${unlinked.join(', ')}; it keeps the general guides link.`);
  }

  return notes.length ? notes : ['Homepage content already seeded; nothing changed.'];
}

if (require.main === module) {
  const prisma = new PrismaClient();
  seedHomepageContent(prisma)
    .then((notes) => notes.forEach((note) => console.log(note)))
    .catch((error) => { console.error(error); process.exitCode = 1; })
    .finally(() => prisma.$disconnect());
}
