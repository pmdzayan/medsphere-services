import type {
  PaginationParams,
  PaginationMeta,
  PaginatedResult,
  PaginationQuery,
} from './interfaces';

export function buildPaginationQuery(params: PaginationParams): PaginationQuery {
  const { page, limit, sortBy, sortOrder } = params;

  const skip = (page - 1) * limit;
  const take = limit;

  const query: PaginationQuery = { skip, take };

  if (sortBy) {
    query.orderBy = { [sortBy]: sortOrder ?? 'asc' };
  }

  return query;
}

export function createPaginationMeta(total: number, params: PaginationParams): PaginationMeta {
  const { page, limit } = params;

  const totalPages = Math.ceil(total / limit);
  const hasNextPage = page < totalPages;
  const hasPreviousPage = page > 1;

  return {
    total,
    page,
    limit,
    totalPages,
    hasNextPage,
    hasPreviousPage,
  };
}

export async function paginate<T>(
  params: PaginationParams,
  findMany: (query: PaginationQuery) => Promise<T[]>,
  count: () => Promise<number>,
): Promise<PaginatedResult<T>> {
  const paginationQuery = buildPaginationQuery(params);

  const [data, total] = await Promise.all([findMany(paginationQuery), count()]);

  const meta = createPaginationMeta(total, params);

  return { data, meta };
}
