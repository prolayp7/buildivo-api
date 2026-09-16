export interface PaginationMeta {
  page: number;
  perPage: number;
  total: number;
  totalPages: number;
}

export function buildPaginationMeta(page: number, perPage: number, total: number): PaginationMeta {
  return { page, perPage, total, totalPages: Math.ceil(total / perPage) || 0 };
}

export function paginationSkipTake(page: number, perPage: number): { skip: number; take: number } {
  return { skip: (page - 1) * perPage, take: perPage };
}
