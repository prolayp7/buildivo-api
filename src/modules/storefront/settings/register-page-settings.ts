// Admin-editable content of the storefront "Create your account" page (Setting key `register.page`).
// Three independently switchable sections: the incentive/intro block, the "trending" sidebar card, and
// the trust list under it. Stored JSON is untrusted input for the public storefront, so it is
// normalised here: wrong shapes fall back to the defaults and text is length-limited.

export type RegisterTrustItem = { icon: string; kind: 'text' | 'freeDelivery'; text: string };

export interface RegisterPageConfig {
  incentive: {
    enabled: boolean;
    badge: string;
    headingLine1: string;
    highlight: string;
    headingRest: string;
    intro: string;
    noticeTitle: string;
    noticeText: string;
    offerEnabled: boolean;
    offerCode: string;
    offerText: string;
    offerAmount: string;
  };
  spotlight: { enabled: boolean; title: string; description: string; status: string };
  trust: { enabled: boolean; items: RegisterTrustItem[] };
}

// Mirrors the copy the registration page had hardcoded before it became admin-managed.
export const DEFAULT_REGISTER_PAGE: RegisterPageConfig = {
  incentive: {
    enabled: true,
    badge: 'NEW ACCOUNT INCENTIVE',
    headingLine1: 'Power Your Jobsite & Home.',
    highlight: 'Claim 15% Off',
    headingRest: 'First Order.',
    intro: 'Join the contractors, mechanical teams, and master builders who shop with us. Get commercial net-30 terms, direct trade discounts, and live delivery dispatch tracking.',
    noticeTitle: 'Create your account today.',
    noticeText: 'Save your favourite tools and keep your details ready for your next order.',
    offerEnabled: true,
    offerCode: 'BLV-WELCOME15',
    offerText: 'Welcome offer subject to eligibility and checkout validation.',
    offerAmount: '−15%',
  },
  spotlight: {
    enabled: true,
    title: 'Trending Jobsite Essentials',
    description: 'Explore popular tools and jobsite essentials for your first order',
    status: 'Live Dispatch: Ready',
  },
  trust: {
    enabled: true,
    items: [
      { icon: 'verified', kind: 'text', text: '100% Genuine OEM Warranties' },
      { icon: 'local_shipping', kind: 'freeDelivery', text: '' },
      { icon: 'undo', kind: 'text', text: '30-Day Hassle-Free Returns' },
      { icon: 'build', kind: 'text', text: 'Dedicated trade support' },
    ],
  },
};

const MAX_TRUST_ITEMS = 8;
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const text = (value: unknown, max: number, fallback: string): string => (typeof value === 'string' ? value.trim().slice(0, max) : fallback);
const flag = (value: unknown, fallback: boolean): boolean => (typeof value === 'boolean' ? value : fallback);

export function normaliseRegisterPage(raw: unknown): RegisterPageConfig {
  const source = isRecord(raw) ? raw : {};
  const d = DEFAULT_REGISTER_PAGE;
  const incentive = isRecord(source.incentive) ? source.incentive : {};
  const spotlight = isRecord(source.spotlight) ? source.spotlight : {};
  const trust = isRecord(source.trust) ? source.trust : {};

  // Absent -> the default list; present -> exactly what the admin saved (an empty list is respected).
  const items: RegisterTrustItem[] = !Array.isArray(trust.items)
    ? d.trust.items
    : trust.items.slice(0, MAX_TRUST_ITEMS).flatMap((entry): RegisterTrustItem[] => {
        const item = isRecord(entry) ? entry : {};
        const icon = text(item.icon, 40, '');
        const kind = item.kind === 'freeDelivery' ? 'freeDelivery' : 'text';
        const label = text(item.text, 120, '');
        if (kind === 'text' && !label) return [];
        return [{ icon: /^[a-z0-9_]+$/.test(icon) ? icon : 'verified', kind, text: kind === 'freeDelivery' ? '' : label }];
      });

  return {
    incentive: {
      enabled: flag(incentive.enabled, d.incentive.enabled),
      badge: text(incentive.badge, 60, d.incentive.badge),
      headingLine1: text(incentive.headingLine1, 100, d.incentive.headingLine1),
      highlight: text(incentive.highlight, 60, d.incentive.highlight),
      headingRest: text(incentive.headingRest, 100, d.incentive.headingRest),
      intro: text(incentive.intro, 400, d.incentive.intro),
      noticeTitle: text(incentive.noticeTitle, 80, d.incentive.noticeTitle),
      noticeText: text(incentive.noticeText, 200, d.incentive.noticeText),
      offerEnabled: flag(incentive.offerEnabled, d.incentive.offerEnabled),
      offerCode: text(incentive.offerCode, 40, d.incentive.offerCode),
      offerText: text(incentive.offerText, 160, d.incentive.offerText),
      offerAmount: text(incentive.offerAmount, 20, d.incentive.offerAmount),
    },
    spotlight: {
      enabled: flag(spotlight.enabled, d.spotlight.enabled),
      title: text(spotlight.title, 80, d.spotlight.title),
      description: text(spotlight.description, 200, d.spotlight.description),
      status: text(spotlight.status, 60, d.spotlight.status),
    },
    trust: { enabled: flag(trust.enabled, d.trust.enabled), items },
  };
}
