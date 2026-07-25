import { PrismaClient } from '@prisma/client';

declare global {
  // Prevent multiple PrismaClient instances during development
  // eslint-disable-next-line no-var -- Required for `declare global` ambient variable declaration
  var prisma: PrismaClient | undefined;
}

const queryLoggingEnabled =
  process.env.NODE_ENV !== 'production' && process.env.ENABLE_PRISMA_QUERY_LOGGING === 'true';

const prisma =
  global.prisma ??
  new PrismaClient({
    log: queryLoggingEnabled ? ['query', 'warn', 'error'] : ['warn', 'error'],
  });

if (process.env.NODE_ENV !== 'production') {
  global.prisma = prisma;
}

export function getPrismaClient(): PrismaClient {
  return prisma;
}
