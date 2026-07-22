import type { PaginationParams, PaginationMeta, PaginatedResult, PaginationQuery } from './interfaces';
export declare function buildPaginationQuery(params: PaginationParams): PaginationQuery;
export declare function createPaginationMeta(total: number, params: PaginationParams): PaginationMeta;
export declare function paginate<T>(params: PaginationParams, findMany: (query: PaginationQuery) => Promise<T[]>, count: () => Promise<number>): Promise<PaginatedResult<T>>;
