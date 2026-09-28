// Inclusive calendar-day range on createdAt; `dateTo` covers the whole of that day.
export function dateRange(from?: string, to?: string) {
  if (!from && !to) return {};
  const end = to ? new Date(to) : undefined;
  if (end) end.setUTCHours(23, 59, 59, 999);
  return { createdAt: { ...(from ? { gte: new Date(from) } : {}), ...(end ? { lte: end } : {}) } };
}
