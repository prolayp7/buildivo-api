// Table-based, inline-CSS HTML for Gmail/Outlook/Apple Mail compatibility -
// no templating engine, matching this module's original convention (see
// git history), just outgrown to real per-email layouts as the template
// count grew past "a handful of one-liners". Brand assets/palette match
// the design system built in ukshop-store/public/emails.

export const STOREFRONT_URL = process.env.STOREFRONT_URL ?? 'http://localhost:3002';
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

// Swapped for the store's real logo URL by EmailService.send() right before
// dispatch - it's the one place that knows the admin-configured logo and can
// resolve it to a publicly reachable URL, so templates don't each need DB access.
export const LOGO_SRC_PLACEHOLDER = '{{EMAIL_LOGO_SRC}}';

const C = {
  black: '#000000', ink: '#101827', body: '#4b5565', faint: '#8a94a3', line: '#e2e6ec', bg: '#f4f6f9', card: '#ffffff',
  red: '#e0201f', blueSoft: '#e8f1fd', blueDark: '#0950ad',
  amberSoft: '#fff3e6', amberDark: '#8a4600',
  greenSoft: '#e6f7f0', green: '#00875a',
  footInk: '#c7cedb', footFaint: '#7c8aa0',
};

function money(n: number): string {
  return `&pound;${n.toFixed(2)}`;
}
function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function shell(title: string, preheader: string, bodyRows: string, footerVariant: 'transactional' | 'marketing' = 'transactional'): string {
  const unsub = footerVariant === 'marketing'
    ? `<a href="${STOREFRONT_URL}/account?tab=details" style="color:${C.footInk};text-decoration:underline;">Unsubscribe</a>`
    : `<a href="${STOREFRONT_URL}/account?tab=details" style="color:${C.footInk};text-decoration:underline;">Manage email preferences</a>`;

  return `<!doctype html>
<html lang="en" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${esc(title)}</title>
<!--[if mso]>
<noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript>
<style>table {border-collapse:collapse;} .fallback-font {font-family:Arial,sans-serif;}</style>
<![endif]-->
<style>
  body,table,td,a{-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;}
  table,td{mso-table-lspace:0pt;mso-table-rspace:0pt;}
  img{-ms-interpolation-mode:bicubic;border:0;height:auto;line-height:100%;outline:none;text-decoration:none;}
  table{border-collapse:collapse !important;}
  body{margin:0;padding:0;width:100% !important;background:${C.bg};}
  a{color:${C.red};}
  @media screen and (max-width:600px){
    .container{width:100% !important;}
    .px{padding-left:24px !important;padding-right:24px !important;}
  }
</style>
</head>
<body style="margin:0;padding:0;background:${C.bg};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;font-size:1px;line-height:1px;color:${C.bg};">
  ${esc(preheader)}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;
</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.bg};">
<tr><td align="center" style="padding:40px 16px;">
<table role="presentation" class="container" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:600px;border:1px solid ${C.line};border-radius:12px;overflow:hidden;">
  <tr><td style="background:${C.black};padding:26px 40px;" align="center">
    <img src="${LOGO_SRC_PLACEHOLDER}" width="120" alt="RigForge" style="display:block;border-radius:6px;">
  </td></tr>
${bodyRows}
  <tr><td style="background:${C.black};padding:28px 40px;" class="px" align="center">
    <p style="margin:0 0 10px;font:13px/1.6 ${FONT};color:${C.footInk};">
      UK Shop Ltd &middot; 14 Foundry Row, Manchester, M1 4AN, United Kingdom
    </p>
    <p style="margin:0;font:12px/1.8 ${FONT};color:${C.footFaint};">
      ${unsub} &nbsp;&middot;&nbsp;
      <a href="${STOREFRONT_URL}/pages/about-us" style="color:${C.footInk};text-decoration:underline;">Contact support</a>
    </p>
    <p style="margin:14px 0 0;font:11px/1.6 ${FONT};color:#4c5a70;">&copy; ${new Date().getFullYear()} UK Shop Ltd. All rights reserved.</p>
  </td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

function contentOpen(pad = '40px'): string {
  return `  <tr><td style="background:${C.card};padding:${pad} 40px;" class="px">\n`;
}
function contentClose(): string {
  return '  </td></tr>\n';
}
// badgeRaw skips escaping - only for callers passing static text that
// already contains an intentional HTML entity (e.g. &rsquo;), never
// user-controlled input.
function badgeRaw(text: string, bg: string, fg: string): string {
  return `    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 22px;"><tr>
      <td style="background:${bg};color:${fg};font:700 11px/1 ${FONT};letter-spacing:.06em;text-transform:uppercase;padding:9px 16px;border-radius:99px;">${text}</td>
    </tr></table>\n`;
}
function badge(text: string, bg: string, fg: string): string {
  return badgeRaw(esc(text), bg, fg);
}
function h1(text: string): string {
  return `    <h1 style="margin:0 0 12px;font:700 24px/1.3 ${FONT};color:${C.ink};letter-spacing:-.01em;">${text}</h1>\n`;
}
function p(html: string, opts: { color?: string; size?: number; margin?: string } = {}): string {
  return `    <p style="margin:${opts.margin ?? '0 0 16px'};font:${opts.size ?? 15}px/1.65 ${FONT};color:${opts.color ?? C.body};">${html}</p>\n`;
}
function button(text: string, href: string, opts: { bg?: string; fg?: string; margin?: string } = {}): string {
  return `    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:${opts.margin ?? '26px 0 6px'};"><tr>
      <td style="background:${opts.bg ?? C.red};border-radius:10px;">
        <a href="${href}" style="display:inline-block;padding:14px 30px;font:700 14px/1 ${FONT};color:${opts.fg ?? '#ffffff'};text-decoration:none;border-radius:10px;">${esc(text)}</a>
      </td>
    </tr></table>\n`;
}
function divider(margin = '28px 0'): string {
  return `    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:${margin};"><tr><td style="border-top:1px solid ${C.line};font-size:1px;line-height:1px;">&nbsp;</td></tr></table>\n`;
}
function factRow(facts: [string, string][]): string {
  const cells = facts.map(([label, value]) => `      <td style="padding:18px 20px;" width="50%">
        <p style="margin:0 0 4px;font:700 10.5px/1 ${FONT};color:${C.faint};letter-spacing:.06em;text-transform:uppercase;">${esc(label)}</p>
        <p style="margin:0;font:600 15px/1.4 ${FONT};color:${C.ink};">${value}</p>
      </td>`);
  const rows: string[] = [];
  for (let i = 0; i < cells.length; i += 2) rows.push(`    <tr>\n${cells.slice(i, i + 2).join('\n')}\n    </tr>`);
  return `    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border:1px solid ${C.line};border-radius:10px;margin:4px 0 28px;">
${rows.join('\n')}
    </table>\n`;
}
function itemRow(name: string, meta: string, price: string, last = false): string {
  const border = last ? '' : `border-bottom:1px solid ${C.line};`;
  return `    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="${border}"><tr>
      <td style="padding:16px 0;vertical-align:top;">
        <p style="margin:0 0 3px;font:600 14px/1.4 ${FONT};color:${C.ink};">${esc(name)}</p>
        <p style="margin:0;font:13px/1.4 ${FONT};color:${C.faint};">${esc(meta)}</p>
      </td>
      <td align="right" style="padding:16px 0;vertical-align:top;white-space:nowrap;">
        <p style="margin:0;font:700 14px/1.4 ${FONT};color:${C.ink};">${price}</p>
      </td>
    </tr></table>\n`;
}
function totals(rows: [string, string][], totalLabel: string, totalValue: string, note?: string): string {
  const lines = rows.map(([label, value]) => `    <tr>
      <td style="padding:5px 0;font:13.5px/1.6 ${FONT};color:${C.body};">${esc(label)}</td>
      <td align="right" style="padding:5px 0;font:13.5px/1.6 ${FONT};color:${C.body};">${value}</td>
    </tr>`).join('\n');
  const noteHtml = note ? `<p style="margin:6px 0 0;font:12px/1.5 ${FONT};color:${C.faint};">${note}</p>` : '';
  return `    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:6px 0 0;">
${lines}
    <tr>
      <td style="padding:12px 0 0;border-top:1px solid ${C.line};font:700 16px/1.6 ${FONT};color:${C.ink};">${esc(totalLabel)}</td>
      <td align="right" style="padding:12px 0 0;border-top:1px solid ${C.line};font:700 16px/1.6 ${FONT};color:${C.ink};">${totalValue}</td>
    </tr>
    </table>
    ${noteHtml}\n`;
}
function otpBlock(code: string): string {
  return `    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border:1px solid ${C.line};border-radius:10px;margin:4px 0 24px;"><tr>
      <td align="center" style="padding:22px;">
        <p style="margin:0;font:700 30px/1 ${FONT};color:${C.ink};letter-spacing:.18em;">${code.split('').join(' ')}</p>
      </td>
    </tr></table>\n`;
}

export interface EmailItem {
  name: string;
  meta: string;
  price: number;
}
function itemsBlock(items: EmailItem[]): string {
  return items.map((item, i) => itemRow(item.name, item.meta, money(item.price), i === items.length - 1)).join('');
}

/* ------------------------------------------------------------------------ */
/* Order lifecycle                                                          */
/* ------------------------------------------------------------------------ */

export function orderConfirmationEmail(params: {
  orderNumber: string;
  orderUuid: string;
  customerFirstName: string;
  placedAt: Date;
  items: EmailItem[];
  subtotal: number;
  shipping: number;
  vat: number;
  total: number;
  address: { fullName: string; line1: string; line2?: string | null; city: string; postcode: string };
}) {
  let body = contentOpen();
  body += badge('Order confirmed', C.greenSoft, C.green);
  body += h1(`Thanks for your order, ${esc(params.customerFirstName)}`);
  body += p(`We&rsquo;ve got order <b>${esc(params.orderNumber)}</b> and we&rsquo;re getting it ready. You&rsquo;ll get another email the moment it ships.`);
  body += factRow([['Order number', esc(params.orderNumber)], ['Order date', params.placedAt.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })]]);
  body += itemsBlock(params.items);
  body += totals([['Subtotal', money(params.subtotal)], ['Delivery', money(params.shipping)]], 'Total', money(params.total), `Includes VAT of ${money(params.vat)}`);
  body += button('View your order', `${STOREFRONT_URL}/account/orders/${params.orderUuid}`, { margin: '26px 0 30px' });
  body += divider('0 0 24px');
  body += `    <p style="margin:0 0 14px;font:700 13px/1 ${FONT};color:${C.ink};letter-spacing:.02em;">DELIVERING TO</p>\n`;
  body += p([params.address.fullName, params.address.line1, params.address.line2, `${params.address.city}, ${params.address.postcode}`].filter(Boolean).map(esc).join('<br>'), { size: 14, margin: '0' });
  body += contentClose();
  return { subject: `Order confirmed - ${params.orderNumber}`, html: shell(`Order confirmed - ${params.orderNumber}`, `Order ${params.orderNumber} is confirmed and being prepared.`, body) };
}

export function orderShippedEmail(params: {
  orderNumber: string;
  orderUuid: string;
  items: EmailItem[];
  trackingCarrier?: string | null;
  trackingNumber?: string | null;
  trackingUrl?: string | null;
}) {
  let body = contentOpen();
  body += badge('On its way', C.blueSoft, C.blueDark);
  body += h1('Your order has shipped');
  body += p(`Order <b>${esc(params.orderNumber)}</b> is on its way.`);
  const facts: [string, string][] = [['Order number', esc(params.orderNumber)]];
  if (params.trackingCarrier) facts.unshift(['Carrier', esc(params.trackingCarrier)]);
  if (params.trackingNumber) facts.splice(1, 0, ['Tracking number', esc(params.trackingNumber)]);
  body += factRow(facts);
  body += button(params.trackingUrl ? 'Track your parcel' : 'View your order', params.trackingUrl || `${STOREFRONT_URL}/account/orders/${params.orderUuid}`);
  body += divider();
  body += `    <p style="margin:0 0 14px;font:700 13px/1 ${FONT};color:${C.ink};letter-spacing:.02em;">WHAT&rsquo;S IN THIS PARCEL</p>\n`;
  body += itemsBlock(params.items);
  body += contentClose();
  return { subject: `Your order has shipped - ${params.orderNumber}`, html: shell(`Your order has shipped - ${params.orderNumber}`, `Order ${params.orderNumber} has shipped${params.trackingCarrier ? ` with ${params.trackingCarrier}` : ''}.`, body) };
}

export function orderDeliveredEmail(params: { orderNumber: string; orderUuid: string }) {
  let body = contentOpen();
  body += badge('Delivered', C.greenSoft, C.green);
  body += h1('Your order has arrived');
  body += p(`Order <b>${esc(params.orderNumber)}</b> was delivered. We hope you love it &mdash; let us know what you think.`);
  body += button('Leave a review', `${STOREFRONT_URL}/account/orders/${params.orderUuid}`);
  body += button('View order details', `${STOREFRONT_URL}/account/orders/${params.orderUuid}`, { bg: '#ffffff', fg: C.red, margin: '0' });
  body += contentClose();
  return { subject: `Order delivered - ${params.orderNumber}`, html: shell(`Order delivered - ${params.orderNumber}`, `Order ${params.orderNumber} has been delivered.`, body) };
}

export function orderCancelledEmail(params: { orderNumber: string }) {
  let body = contentOpen();
  body += badge('Order cancelled', '#eef1f5', C.body);
  body += h1('Your order has been cancelled');
  body += p(`Order <b>${esc(params.orderNumber)}</b> has been cancelled. Nothing further will be charged.`);
  body += p('If you already paid for this order, the refund will be returned to your original payment method within 3&ndash;5 business days.', { size: 13.5 });
  body += button('Browse the catalogue', STOREFRONT_URL);
  body += contentClose();
  return { subject: `Order cancelled - ${params.orderNumber}`, html: shell(`Order cancelled - ${params.orderNumber}`, `Order ${params.orderNumber} has been cancelled.`, body) };
}

export function returnRequestedEmail(params: { orderNumber: string; itemTitle: string; reason: string }) {
  let body = contentOpen();
  body += badge('Return requested', C.amberSoft, C.amberDark);
  body += h1('We&rsquo;ve got your return request');
  body += p(`We&rsquo;re reviewing your request to return an item from order <b>${esc(params.orderNumber)}</b>.`);
  body += itemRow(params.itemTitle, `Reason: ${params.reason}`, '', true);
  body += divider();
  body += p('We&rsquo;ll email you again once it&rsquo;s approved, and once more when your refund is issued.', { size: 13.5, margin: '0' });
  body += contentClose();
  return { subject: `Return requested - ${params.orderNumber}`, html: shell(`Return request received - ${params.orderNumber}`, `We're reviewing your return request for order ${params.orderNumber}.`, body) };
}

export function orderRefundedEmail(params: { orderNumber: string; refundAmount: string }) {
  let body = contentOpen();
  body += badge('Refund processed', C.greenSoft, C.green);
  body += h1('Your refund is on its way');
  body += p(`We&rsquo;ve processed a refund for order <b>${esc(params.orderNumber)}</b>. It can take 3&ndash;5 business days to reach your original payment method.`);
  body += factRow([['Refund amount', money(Number(params.refundAmount))], ['Order number', esc(params.orderNumber)]]);
  body += contentClose();
  return { subject: `Refund processed - ${params.orderNumber}`, html: shell(`Refund processed - ${params.orderNumber}`, `A refund has been processed for order ${params.orderNumber}.`, body) };
}

/* ------------------------------------------------------------------------ */
/* Account                                                                  */
/* ------------------------------------------------------------------------ */

export function welcomeEmail(params: { firstName: string }) {
  let body = contentOpen();
  body += h1(`Welcome to UK Shop, ${esc(params.firstName)}`);
  body += p('Your account is ready. Here&rsquo;s what you get every time you shop with us.');
  body += p('<b>Fast UK delivery</b> &mdash; next-day options on thousands of in-stock lines.', { size: 14, margin: '0 0 10px' });
  body += p('<b>Expert support</b> &mdash; real advice from people who build and repair PCs.', { size: 14, margin: '0 0 10px' });
  body += p('<b>Easy returns</b> &mdash; 30-day returns on almost everything, no fuss.', { size: 14, margin: '0 0 10px' });
  body += button('Start shopping', STOREFRONT_URL);
  body += contentClose();
  return { subject: 'Welcome to UK Shop', html: shell('Welcome to UK Shop', "Your account is ready — here's what you get.", body) };
}

export function emailVerificationEmail(params: { code: string }) {
  let body = contentOpen();
  body += h1('Confirm your email address');
  body += p('Enter this code to verify your email and finish setting up your account.');
  body += otpBlock(params.code);
  body += p('This code expires in 10 minutes.', { size: 13, color: C.faint, margin: '0 0 24px' });
  body += divider();
  body += p('Didn&rsquo;t sign up for UK Shop? You can ignore this email.', { size: 13, color: C.faint, margin: '0' });
  body += contentClose();
  return { subject: 'Confirm your email address', html: shell('Confirm your email address', 'Use this code to verify your email address.', body) };
}

export function passwordResetEmail(params: { code: string }) {
  let body = contentOpen();
  body += h1('Reset your password');
  body += p('We received a request to reset your password. Use the code below within the next 10 minutes.');
  body += otpBlock(params.code);
  body += button('Reset password', `${STOREFRONT_URL}/forgot-password`);
  body += divider();
  body += p('If you didn&rsquo;t request this, you can safely ignore this email &mdash; your password won&rsquo;t be changed.', { size: 13, color: C.faint, margin: '0' });
  body += contentClose();
  return { subject: 'Reset your password', html: shell('Reset your password', 'Use this code to reset your UK Shop password.', body) };
}

/* ------------------------------------------------------------------------ */
/* Newsletter & notifications                                              */
/* ------------------------------------------------------------------------ */

export function newsletterSubscribedEmail() {
  let body = contentOpen();
  body += badgeRaw('You&rsquo;re on the list', C.greenSoft, C.green);
  body += h1('Thanks for subscribing');
  body += p('You&rsquo;ll hear from us about once a week &mdash; mostly restock alerts and genuine price drops on PC hardware, laptops and peripherals. No spam, unsubscribe any time.');
  body += button('Start shopping', STOREFRONT_URL);
  body += contentClose();
  return { subject: "You're on the list", html: shell("You're on the list", 'Thanks for subscribing to deals & restock alerts.', body, 'marketing') };
}

export function notificationEmail(params: { title: string; message: string }) {
  let body = contentOpen();
  body += h1(esc(params.title));
  body += p(esc(params.message));
  body += contentClose();
  return { subject: params.title, html: shell(params.title, params.message, body) };
}
