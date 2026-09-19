import PDFDocument = require('pdfkit');
import { resolve } from 'path';
import { formatMoney as formatIn } from '../../../common/currency';

const FONTS = resolve(process.cwd(), 'assets/fonts');
const C = { ink: '#101827', body: '#4b5565', faint: '#8a94a3', line: '#e2e6ec', soft: '#f4f6f9', band: '#fafbfc', dark: '#0b0f14', accent: '#ff7900', green: '#00875a', greenSoft: '#e6f7f0' };
const PAGE = { w: 595.28, h: 841.89, m: 36 };
const W = PAGE.w - PAGE.m * 2;

interface Line { title: string; variant: string; sku: string | null; qty: number; unit: number; discount: number; net: number; netUnit: number; rate: number; vat: number; gross: number }
export interface InvoiceData {
  currency: string; invoiceNumber: string; orderNumber: string; placedAt: Date; issuedAt: Date; email: string; status: string; paymentStatus: string;
  billing: { name: string; company: string | null; address: string };
  shipping: { name: string; address: string; carrier: string | null };
  shippingMethod: string | null;
  lines: Line[];
  subtotal: number; discount: number; couponCode: string | null; delivery: number; vatTotal: number; total: number;
  company: { name: string; legalName: string; address: string; vatNumber: string; email: string; phone: string; copyright: string };
  logo: Buffer | null;
}

/** Renders the statutory VAT tax invoice as a real (vector, selectable-text) A4 PDF. */
export function buildInvoicePdf(d: InvoiceData): Promise<Buffer> {
  const doc = new PDFDocument({ size: 'A4', margin: 0, info: { Title: `Invoice ${d.invoiceNumber}`, Author: d.company.legalName } });
  doc.registerFont('R', `${FONTS}/NotoSans-Regular.ttf`);
  doc.registerFont('B', `${FONTS}/NotoSans-Bold.ttf`);
  const chunks: Buffer[] = [];
  doc.on('data', (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<Buffer>((res) => doc.on('end', () => res(Buffer.concat(chunks))));

  const text = (s: string, x: number, y: number, o: { font?: 'R' | 'B'; size?: number; color?: string; width?: number; align?: 'left' | 'right' | 'center'; spacing?: number } = {}) => {
    doc.font(o.font ?? 'R').fontSize(o.size ?? 8.5).fillColor(o.color ?? C.body).text(s, x, y, { width: o.width ?? W, align: o.align ?? 'left', characterSpacing: o.spacing ?? 0, lineBreak: o.width !== undefined });
  };
  const height = (s: string, width: number, font: 'R' | 'B', size: number) => doc.font(font).fontSize(size).heightOfString(s, { width });
  const rect = (x: number, y: number, w: number, h: number, fill?: string, stroke?: string, r = 0) => {
    doc.roundedRect(x, y, w, h, r);
    if (fill && stroke) doc.fillAndStroke(fill, stroke); else if (fill) doc.fill(fill); else if (stroke) doc.lineWidth(0.6).stroke(stroke);
  };
  const hline = (y: number, x1 = PAGE.m, x2 = PAGE.m + W, color = C.line) => doc.moveTo(x1, y).lineTo(x2, y).lineWidth(0.6).stroke(color);

  const formatMoney = (n: number) => formatIn(n, d.currency);
  const date = d.issuedAt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  const settled = d.paymentStatus === 'REFUNDED' ? 'Refunded' : d.paymentStatus === 'PARTIALLY_REFUNDED' ? 'Partially refunded' : 'Paid in full';

  // ---- header ----
  let y = 34;
  let brandX = PAGE.m;
  if (d.logo) {
    try { doc.image(d.logo, PAGE.m, y, { fit: [70, 40] }); brandX = PAGE.m + 78; } catch { /* unreadable logo - text brand only */ }
  }
  text(d.company.name.toUpperCase(), brandX, y + 12, { font: 'B', size: 14, color: C.ink, width: 260, spacing: 0.6 });
  text(d.company.legalName, PAGE.m, y + 52, { font: 'B', size: 8.5, color: C.ink, width: 280 });
  text(d.company.address, PAGE.m, y + 63, { size: 7.5, width: 280 });
  text([d.company.vatNumber ? `VAT reg. no. ${d.company.vatNumber}` : '', d.company.email].filter(Boolean).join(' · '), PAGE.m, y + 73, { size: 7.5, width: 280 });
  rect(PAGE.m + W - 138, y, 138, 18, '#e6e9ee', undefined, 3);
  text('STATUTORY VAT TAX INVOICE', PAGE.m + W - 138, y + 5.5, { font: 'B', size: 6.6, color: C.body, width: 138, align: 'center', spacing: 0.9 });
  text(d.invoiceNumber, PAGE.m + W - 260, y + 30, { font: 'B', size: 20, color: C.ink, width: 260, align: 'right' });

  // ---- meta grid ----
  y = 128;
  const cells: [string, string][] = [['TAX POINT / DATE', date], ['ORDER REFERENCE', d.orderNumber], ['PAYMENT STATUS', settled], ['DELIVERY METHOD', d.shippingMethod ?? '—'], ['CURRENCY', d.currency], ['CUSTOMER ACCOUNT', d.email]];
  const cw = W / 3, ch = 34;
  rect(PAGE.m, y, W, ch * 2, undefined, C.line, 4);
  hline(y + ch); doc.moveTo(PAGE.m + cw, y).lineTo(PAGE.m + cw, y + ch * 2).stroke(C.line); doc.moveTo(PAGE.m + cw * 2, y).lineTo(PAGE.m + cw * 2, y + ch * 2).stroke(C.line);
  cells.forEach(([label, value], i) => {
    const x = PAGE.m + (i % 3) * cw + 10, cy = y + Math.floor(i / 3) * ch + 7;
    text(label, x, cy, { font: 'B', size: 5.8, color: C.faint, width: cw - 16, spacing: 0.7 });
    text(value, x, cy + 11, { font: 'B', size: 8.5, color: C.ink, width: cw - 16 });
  });

  // ---- parties ----
  y = 212;
  const partyH = 76;
  rect(0, y, PAGE.w, partyH, C.band); hline(y, 0, PAGE.w); hline(y + partyH, 0, PAGE.w);
  doc.moveTo(PAGE.w / 2, y).lineTo(PAGE.w / 2, y + partyH).lineWidth(0.6).stroke(C.line);
  const col = (x: number, label: string, name: string, body: string) => {
    text(label, x, y + 12, { font: 'B', size: 6, color: C.body, width: 230, spacing: 0.8 });
    text(name, x, y + 26, { font: 'B', size: 11, color: C.ink, width: 240 });
    text(body, x, y + 42, { size: 8, width: 240 });
  };
  col(PAGE.m, 'INVOICE ADDRESSEE (BILL TO)', d.billing.company || d.billing.name, `${d.billing.company ? d.billing.name + '\n' : ''}${d.billing.address}\n${d.email}`);
  col(PAGE.w / 2 + 20, 'DELIVERY ADDRESS (SHIP TO)', d.shipping.name, `${d.shipping.address}${d.shipping.carrier ? '\n' + d.shipping.carrier : ''}`);
  if (d.status === 'DELIVERED') {
    rect(PAGE.w - PAGE.m - 46, y + 8, 46, 14, C.greenSoft, '#b7e3cf', 7);
    text('Delivered', PAGE.w - PAGE.m - 46, y + 12, { font: 'B', size: 6.6, color: C.green, width: 46, align: 'center' });
  }

  // ---- items ----
  y = 306;
  const columns = [
    { label: '#', w: 22, a: 'left' }, { label: 'DESCRIPTION / SPECIFICATION', w: 176, a: 'left' }, { label: 'QTY', w: 28, a: 'right' },
    { label: 'UNIT PRICE\n(INC. VAT)', w: 62, a: 'right' }, { label: 'DISCOUNT', w: 52, a: 'right' }, { label: 'NET PRICE', w: 58, a: 'right' },
    { label: 'VAT %', w: 40, a: 'right' }, { label: 'LINE TOTAL\n(NET)', w: 85, a: 'right' },
  ] as const;
  text('Itemised supply schedule', PAGE.m, y, { font: 'B', size: 11, color: C.ink, width: 300 });
  text(`(${d.lines.length} recorded ${d.lines.length === 1 ? 'transaction' : 'transactions'})`, PAGE.m + doc.font('B').fontSize(11).widthOfString('Itemised supply schedule') + 6, y + 2.5, { size: 8, width: 200 });
  text(`All values stated in ${d.currency}`, PAGE.m + W - 200, y + 3, { size: 7, color: C.faint, width: 200, align: 'right' });
  y += 20;
  const header = () => {
    rect(PAGE.m, y, W, 24, C.ink);
    let x = PAGE.m;
    for (const c of columns) { text(c.label, x + 6, y + (c.label.includes('\n') ? 5 : 9), { font: 'B', size: 5.8, color: '#fff', width: c.w - 12, align: c.a, spacing: 0.5 }); x += c.w; }
    y += 24;
  };
  header();
  d.lines.forEach((l, index) => {
    const descW = columns[1].w - 12;
    const sub = [l.variant, l.sku].filter(Boolean).join(' · ');
    const rowH = Math.max(34, 12 + height(l.title, descW, 'B', 8.5) + height(sub || ' ', descW, 'R', 7) + 6);
    if (y + rowH > 600) { doc.addPage(); y = 40; header(); }
    const vals = [String(index + 1).padStart(2, '0'), '', String(l.qty), formatMoney(l.unit), l.discount > 0 ? formatMoney(l.discount) : '—', formatMoney(l.netUnit), `${l.rate.toFixed(1)}%`, formatMoney(l.net)];
    let x = PAGE.m;
    columns.forEach((c, i) => {
      if (i === 1) { text(l.title, x + 6, y + 9, { font: 'B', size: 8.5, color: C.ink, width: descW }); text(sub, x + 6, y + 11 + height(l.title, descW, 'B', 8.5), { size: 7, color: C.faint, width: descW }); }
      else text(vals[i], x + 6, y + 9, { font: i === 2 || i === 7 ? 'B' : 'R', size: 8.5, color: i === 0 ? C.faint : i === 4 && l.discount > 0 ? C.accent : C.ink, width: c.w - 12, align: c.a });
      x += c.w;
    });
    y += rowH; hline(y);
  });

  // ---- lower section ----
  y += 22;
  if (y + 190 > PAGE.h - 60) { doc.addPage(); y = 40; }
  const leftW = 296, rightX = PAGE.m + leftW + 18, rightW = W - leftW - 18;
  const byRate = new Map<number, { net: number; vat: number; gross: number }>();
  for (const l of d.lines) { const r = byRate.get(l.rate) ?? { net: 0, vat: 0, gross: 0 }; byRate.set(l.rate, { net: r.net + l.net, vat: r.vat + l.vat, gross: r.gross + l.gross }); }
  const rows = [...byRate.entries()];
  const totals = rows.reduce((s, [, r]) => ({ net: s.net + r.net, vat: s.vat + r.vat, gross: s.gross + r.gross }), { net: 0, vat: 0, gross: 0 });
  const vatH = 44 + (rows.length + 1) * 20;
  rect(PAGE.m, y, leftW, vatH, undefined, C.line, 4);
  rect(PAGE.m, y, leftW, 22, C.soft, C.line, 4);
  text('STATUTORY VAT RATE ANALYSIS', PAGE.m + 10, y + 8, { font: 'B', size: 6, color: C.body, width: leftW, spacing: 0.8 });
  const vcols = [{ l: 'VAT CATEGORY & RATE', w: 108, a: 'left' }, { l: 'GOODS NET', w: 62, a: 'right' }, { l: 'VAT PAYABLE', w: 60, a: 'right' }, { l: 'GROSS TOTAL', w: 66, a: 'right' }] as const;
  let vx = PAGE.m;
  for (const c of vcols) { text(c.l, vx + 8, y + 27, { font: 'B', size: 5.4, color: C.faint, width: c.w - 12, align: c.a }); vx += c.w; }
  let vy = y + 40;
  const vline = (label: string, r: { net: number; vat: number; gross: number }, bold: boolean) => {
    hline(vy - 4, PAGE.m, PAGE.m + leftW);
    const v = [label, formatMoney(r.net), formatMoney(r.vat), formatMoney(r.gross)];
    let x = PAGE.m;
    vcols.forEach((c, i) => { text(v[i], x + 8, vy + 2, { font: bold ? 'B' : 'R', size: 8, color: C.ink, width: c.w - 12, align: c.a }); x += c.w; });
    vy += 20;
  };
  rows.forEach(([rate, r]) => vline(rate === 0 ? 'Zero rated (0%)' : `Standard rate (${rate}%)`, r, false));
  vline('Totals subject to VAT', totals, true);
  text(`Statutory tax point: ${date}. Item prices above include VAT at the rate shown.`, PAGE.m, y + vatH + 8, { size: 6.8, color: C.faint, width: leftW });

  const ledger: [string, string, string?][] = [['Goods subtotal (inc. VAT)', formatMoney(d.subtotal)]];
  if (d.discount > 0) ledger.push([`Discount${d.couponCode ? ` (${d.couponCode})` : ''}`, `−${formatMoney(d.discount)}`, C.accent]);
  ledger.push([`Delivery${d.shippingMethod ? ` — ${d.shippingMethod}` : ''}`, d.delivery === 0 ? 'Free' : formatMoney(d.delivery)]);
  ledger.push(['Total (ex. VAT)', formatMoney(d.total - d.vatTotal)], ['VAT included', formatMoney(d.vatTotal)]);
  const ledH = 34 + ledger.length * 17;
  rect(rightX, y, rightW, ledH, undefined, C.line, 4);
  rect(rightX, y, rightW, 22, C.soft, C.line, 4);
  text('FINANCIAL SETTLEMENT LEDGER', rightX + 10, y + 8, { font: 'B', size: 6, color: C.body, width: rightW, spacing: 0.8 });
  let ly = y + 32;
  ledger.forEach(([label, value, color], i) => {
    if (label === 'Total (ex. VAT)') hline(ly - 3, rightX + 10, rightX + rightW - 10);
    const bold = label === 'Total (ex. VAT)';
    text(label, rightX + 10, ly + 2, { font: bold ? 'B' : 'R', size: 7.8, color: bold ? C.ink : C.body, width: rightW - 84 });
    text(value, rightX + rightW - 80, ly + 2, { font: bold ? 'B' : 'R', size: 7.8, color: color ?? (bold ? C.ink : C.body), width: 70, align: 'right' });
    ly += 17; void i;
  });
  const boxY = y + ledH + 10;
  rect(rightX, boxY, rightW, 58, C.dark, undefined, 4);
  text('TOTAL INVOICE VALUE (INC. VAT)', rightX + 12, boxY + 10, { font: 'B', size: 5.8, color: '#aab3c0', width: rightW - 24, spacing: 0.8 });
  text(formatMoney(d.total), rightX + 12, boxY + 21, { font: 'B', size: 20, color: '#fff', width: rightW - 24 });
  text(settled, rightX + 12, boxY + 46, { font: 'B', size: 7.5, color: C.accent, width: rightW - 24 });

  // ---- footer bar (bottom of the last page) ----
  rect(0, PAGE.h - 44, PAGE.w, 44, C.dark);
  text(`${d.company.copyright}${d.company.vatNumber ? ` · VAT reg. no. ${d.company.vatNumber}` : ''}`, PAGE.m, PAGE.h - 26, { size: 7, color: '#aab3c0', width: 320 });
  text([d.company.phone, d.company.email].filter(Boolean).join(' · '), PAGE.m + W - 220, PAGE.h - 26, { font: 'B', size: 7, color: '#fff', width: 220, align: 'right' });

  doc.end();
  return done;
}
