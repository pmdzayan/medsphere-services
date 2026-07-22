"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPrismaClient = getPrismaClient;
const client_1 = require("@prisma/client");
const prisma = global.prisma ??
    new client_1.PrismaClient({
        log: process.env.NODE_ENV === 'production' ? ['warn', 'error'] : ['query', 'warn', 'error'],
    });
if (process.env.NODE_ENV !== 'production') {
    global.prisma = prisma;
}
function getPrismaClient() {
    return prisma;
}
//# sourceMappingURL=client.js.map