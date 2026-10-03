// Admin-editable content of the storefront /deals page (Setting key `deals.page`).
// Stored JSON is untrusted input for the public storefront, so it is normalised here:
// wrong shapes fall back to the defaults and text is length-limited.

export type DealsProductRef = { id: number; title: string };

export interface DealsPageConfig {
  hero: { badge: string; headline: string; highlight: string; headlineSuffix: string; description: string };
  countdown: { enabled: boolean; label: string; endsAt: string; cutoff: string };
  spotlight: DealsProductRef | null;
  bulk: { enabled: boolean; kicker: string; heading: string; description: string; products: DealsProductRef[] };
  clearance: { enabled: boolean; kicker: string; heading: string; items: { title: string; description: string }[] };
}

// Mirrors the copy the deals page had hardcoded before it became admin-managed.
export const DEFAULT_DEALS_PAGE: DealsPageConfig = {
  hero: {
    badge: 'LIMITED TRADE ALLOCATION EVENT',
    headline: 'Flash Deals & Pro Clearance Event —',
    highlight: 'Save up to {discount}% Off',
    headlineSuffix: 'Industrial Overstock',
    description: 'Direct trade contractor access to tier-1 factory overstocks, discontinued platform lines, and bulk site consumables. 100% factory inspected and backed by full OEM warranties.',
  },
  countdown: { enabled: true, label: 'TODAY’S DEALS REFRESH IN:', endsAt: '', cutoff: 'Next-day pallet batch cut-off: 17:00' },
  spotlight: null,
  bulk: {
    enabled: true,
    kicker: 'SITE-DIRECT PALLET LOGISTICS',
    heading: 'Contractor Bulk Pallets & Job-Pack Overstocks',
    description: 'Commercial-grade jobsite quantities discounted directly from Tier-1 trade suppliers. Invoiced on verified Trade Net-30 credit terms.',
    products: [],
  },
  clearance: {
    enabled: true,
    kicker: 'BUILDIVO PRO PROTECTION STANDARDS',
    heading: 'Trade Peace of Mind on All Clearance Stock',
    items: [
      { title: 'Manufacturer warranty details', description: 'Coverage and exclusions vary by product. Check the product details for applicable manufacturer terms.' },
      { title: 'Item-specific return eligibility', description: 'Eligible delivered items show their return window in your account. Conditions vary by item.' },
      { title: 'Delivery options at checkout', description: 'Available delivery methods and charges are shown before payment. Tracking appears when carrier details are available.' },
    ],
  },
};

const MAX_PRODUCTS = 6;
const MAX_CLEARANCE_ITEMS = 6;
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const text = (value: unknown, max: number, fallback: string): string => (typeof value === 'string' ? value.trim().slice(0, max) : fallback);
const flag = (value: unknown, fallback: boolean): boolean => (typeof value === 'boolean' ? value : fallback);

function productRef(value: unknown): DealsProductRef | null {
  if (!isRecord(value) || !Number.isInteger(value.id) || (value.id as number) < 1) return null;
  return { id: value.id as number, title: text(value.title, 200, '') };
}

export function normaliseDealsPage(raw: unknown): DealsPageConfig {
  const source = isRecord(raw) ? raw : {};
  const d = DEFAULT_DEALS_PAGE;
  const hero = isRecord(source.hero) ? source.hero : {};
  const countdown = isRecord(source.countdown) ? source.countdown : {};
  const bulk = isRecord(source.bulk) ? source.bulk : {};
  const clearance = isRecord(source.clearance) ? source.clearance : {};

  // An unparseable end date means "reset nightly", never a broken countdown.
  const endsAt = typeof countdown.endsAt === 'string' && !Number.isNaN(Date.parse(countdown.endsAt)) ? new Date(countdown.endsAt).toISOString() : '';

  const seen = new Set<number>();
  const products = (Array.isArray(bulk.products) ? bulk.products : []).flatMap((entry): DealsProductRef[] => {
    const ref = productRef(entry);
    if (!ref || seen.has(ref.id)) return [];
    seen.add(ref.id);
    return [ref];
  }).slice(0, MAX_PRODUCTS);

  // Absent -> the default cards; present -> exactly what the admin saved (an empty list is respected).
  const items = !Array.isArray(clearance.items)
    ? d.clearance.items
    : clearance.items.slice(0, MAX_CLEARANCE_ITEMS).flatMap((entry) => {
        const item = isRecord(entry) ? entry : {};
        const title = text(item.title, 80, '');
        return title ? [{ title, description: text(item.description, 200, '') }] : [];
      });

  return {
    hero: {
      badge: text(hero.badge, 60, d.hero.badge),
      headline: text(hero.headline, 120, d.hero.headline),
      highlight: text(hero.highlight, 60, d.hero.highlight),
      headlineSuffix: text(hero.headlineSuffix, 80, d.hero.headlineSuffix),
      description: text(hero.description, 400, d.hero.description),
    },
    countdown: {
      enabled: flag(countdown.enabled, d.countdown.enabled),
      label: text(countdown.label, 60, d.countdown.label),
      endsAt,
      cutoff: text(countdown.cutoff, 80, d.countdown.cutoff),
    },
    spotlight: productRef(source.spotlight),
    bulk: {
      enabled: flag(bulk.enabled, d.bulk.enabled),
      kicker: text(bulk.kicker, 60, d.bulk.kicker),
      heading: text(bulk.heading, 100, d.bulk.heading),
      description: text(bulk.description, 300, d.bulk.description),
      products,
    },
    clearance: {
      enabled: flag(clearance.enabled, d.clearance.enabled),
      kicker: text(clearance.kicker, 60, d.clearance.kicker),
      heading: text(clearance.heading, 100, d.clearance.heading),
      items,
    },
  };
}
