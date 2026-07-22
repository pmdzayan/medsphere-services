"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildPaginationQuery = buildPaginationQuery;
exports.createPaginationMeta = createPaginationMeta;
exports.paginate = paginate;
function buildPaginationQuery(params) {
    const { page, limit, sortBy, sortOrder } = params;
    const skip = (page - 1) * limit;
    const take = limit;
    const query = { skip, take };
    if (sortBy) {
        query.orderBy = { [sortBy]: sortOrder ?? 'asc' };
    }
    return query;
}
function createPaginationMeta(total, params) {
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
async function paginate(params, findMany, count) {
    const paginationQuery = buildPaginationQuery(params);
    const [data, total] = await Promise.all([findMany(paginationQuery), count()]);
    const meta = createPaginationMeta(total, params);
    return { data, meta };
}
//# sourceMappingURL=pagination.js.map