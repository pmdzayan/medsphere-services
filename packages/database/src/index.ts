import { PrismaClient } from '@prisma/client';

/**
 * Single shared Prisma client per process. Services import this instead of
 * instantiating their own client, so connection pooling and query logging
 * stay consistent across the codebase.
 */
let prisma: PrismaClient | undefined;

export function getPrismaClient(): PrismaClient {
  if (!prisma) {
    prisma = new PrismaClient({
      log: process.env.NODE_ENV === 'production' ? ['error', 'warn'] : ['query', 'error', 'warn'],
    });
  }
  return prisma;
}
