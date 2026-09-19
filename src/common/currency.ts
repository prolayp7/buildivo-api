/** The currency payments are taken in (and prices displayed in). Sandbox
 * accounts that can't charge the store's real currency set this to one they
 * can, e.g. INR; production sets EUR. */
export function paymentCurrency(): string {
  return (process.env.PAYMENT_CURRENCY || 'GBP').toUpperCase();
}

export function formatMoney(n: number, currency: string = paymentCurrency()): string {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency }).format(n);
}
