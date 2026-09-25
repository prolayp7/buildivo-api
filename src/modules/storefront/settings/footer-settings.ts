// Admin-editable storefront footer (Setting key `footer.site`). The stored JSON is untrusted
// input as far as the public storefront is concerned, so it is normalised here: bad shapes fall
// back to defaults, and only safe link targets survive.

export type FooterBadge = { icon: string; title: string; caption: string };
export type FooterChip = { label: string; tone: 'success' | 'info' | 'neutral' };
export type FooterMethod = { label: string; highlight: boolean };
export type FooterLink = { label: string; href: string };
export const SOCIAL_PLATFORMS = ['facebook', 'instagram', 'linkedin', 'youtube', 'x'] as const;
export type SocialPlatform = (typeof SOCIAL_PLATFORMS)[number];

export interface FooterConfig {
  trustBadges: FooterBadge[];
  aboutHeading: string;
  aboutText: string;
  certifications: FooterChip[];
  showGateways: boolean;
  paymentMethods: FooterMethod[];
  legalLinks: FooterLink[];
  social: Record<SocialPlatform, string>;
  copyright: string;
  complianceBadge: string;
}

// Mirrors the copy the storefront footer had hardcoded before it became admin-managed.
// `{year}` in the copyright is replaced by the storefront with the current year.
export const DEFAULT_FOOTER: FooterConfig = {
  trustBadges: [
    { icon: 'lock', title: '256-Bit Encryption', caption: 'Military-grade SSL security' },
    { icon: 'verified_user', title: 'Norton Secured', caption: 'Identity theft protection' },
    { icon: 'workspace_premium', title: 'ISO 9001 Certified', caption: 'Quality management' },
    { icon: 'handshake', title: 'Buildivo Trade Approved', caption: 'Official contractor portal' },
    { icon: 'cached', title: '30-Day Guarantee', caption: 'Hassle-free return policy' },
  ],
  aboutHeading: 'About Buildivo',
  aboutText: 'Built for tradespeople, contractors and industrial creators. High-performance tools with guaranteed provenance and fast site dispatch.',
  certifications: [{ label: 'ISO 9001:2015', tone: 'success' }, { label: 'FSC Certified', tone: 'info' }],
  showGateways: true,
  paymentMethods: [
    { label: 'VISA', highlight: false }, { label: 'Mastercard', highlight: false }, { label: 'AMEX', highlight: false },
    { label: 'Apple Pay', highlight: false }, { label: 'Trade Net 30', highlight: true },
  ],
  legalLinks: [
    { label: 'Privacy Policy', href: '/help' }, { label: 'Terms of Trading', href: '/help' },
    { label: 'Returns & Restocking', href: '/help' }, { label: 'Modern Slavery Statement', href: '/help' },
  ],
  social: { facebook: '', instagram: '', linkedin: '', youtube: '', x: '' },
  copyright: '© {year} Buildivo Industrial Supply Ltd. Registered in England & Wales #05492019.',
  complianceBadge: 'PCI-DSS Level 1 Merchant Certified',
};

const LIMITS = { trustBadges: 8, certifications: 6, paymentMethods: 12, legalLinks: 8 };

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const text = (value: unknown, max: number): string => (typeof value === 'string' ? value.trim().slice(0, max) : '');
const list = (value: unknown, max: number): unknown[] => (Array.isArray(value) ? value.slice(0, max) : []);

// Relative paths, http(s), mailto and tel only - never javascript:, data: or protocol-relative URLs.
export function safeHref(value: unknown): string {
  const href = text(value, 500);
  return /^(\/(?!\/)|https?:\/\/|mailto:|tel:|#)/i.test(href) && !/\s/.test(href) ? href : '';
}
function safeSocialUrl(value: unknown): string {
  const url = text(value, 500);
  return /^https?:\/\/\S+$/i.test(url) ? url : '';
}

export function normaliseFooter(raw: unknown): FooterConfig {
  const source = isRecord(raw) ? raw : {};
  const pick = <T>(key: keyof FooterConfig, build: (value: unknown) => T): T => (source[key] === undefined ? (DEFAULT_FOOTER[key] as unknown as T) : build(source[key]));

  return {
    trustBadges: pick('trustBadges', (value) => list(value, LIMITS.trustBadges).flatMap((entry): FooterBadge[] => {
      const item = isRecord(entry) ? entry : {};
      const title = text(item.title, 80);
      const icon = text(item.icon, 40);
      return title ? [{ icon: /^[a-z0-9_]+$/.test(icon) ? icon : 'verified', title, caption: text(item.caption, 120) }] : [];
    })),
    aboutHeading: pick('aboutHeading', (value) => text(value, 80)),
    aboutText: pick('aboutText', (value) => text(value, 600)),
    certifications: pick('certifications', (value) => list(value, LIMITS.certifications).flatMap((entry): FooterChip[] => {
      const item = isRecord(entry) ? entry : {};
      const label = text(item.label, 40);
      return label ? [{ label, tone: item.tone === 'success' || item.tone === 'info' ? item.tone : 'neutral' }] : [];
    })),
    showGateways: pick('showGateways', (value) => value !== false),
    paymentMethods: pick('paymentMethods', (value) => list(value, LIMITS.paymentMethods).flatMap((entry): FooterMethod[] => {
      const item = isRecord(entry) ? entry : {};
      const label = text(item.label, 40);
      return label ? [{ label, highlight: item.highlight === true }] : [];
    })),
    legalLinks: pick('legalLinks', (value) => list(value, LIMITS.legalLinks).flatMap((entry): FooterLink[] => {
      const item = isRecord(entry) ? entry : {};
      const label = text(item.label, 60);
      const href = safeHref(item.href);
      return label && href ? [{ label, href }] : [];
    })),
    social: pick('social', (value) => {
      const links = isRecord(value) ? value : {};
      return Object.fromEntries(SOCIAL_PLATFORMS.map((platform) => [platform, safeSocialUrl(links[platform])])) as Record<SocialPlatform, string>;
    }),
    copyright: pick('copyright', (value) => text(value, 200)),
    complianceBadge: pick('complianceBadge', (value) => text(value, 80)),
  };
}
