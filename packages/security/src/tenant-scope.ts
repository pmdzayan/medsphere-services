import type { Prisma } from '@medsphere/database';
import { NotFoundException, ForbiddenException } from '@nestjs/common';
import type { TrustedTenantActor } from './trusted-actor';

/**
 * Task 0020 — Reusable tenant-scope enforcement for future vertical services.
 *
 * Every future provider/hospital/clinic/lab/supplier/patient vertical MUST
 * resolve a resource through a tenant-qualified lookup, never through
 * `findUnique({ id })` alone. A UUID belonging to tenant A must be invisible
 * to an authenticated member of tenant B.
 *
 * The accepted repository pattern in this codebase
 * (`authorization.repository.ts`) reads tenant-owned rows with
 * `findFirst({ where: { id, tenantId } })`. These helpers wrap that compound
 * lookup and add a uniform NotFound boundary so callers can never accidentally
 * trust a bare UUID that exists in another tenant.
 */

/** Narrow contract for a tenant-scoped `findFirst` read. */
export interface TenantScopedFirstLookup {
  findFirst(params: {
    where: Record<string, unknown>;
    select?: Record<string, true>;
  }): Promise<unknown>;
}

/** Tenant-qualified compound key fragment for a tenant-owned resource. */
export interface TenantUniqueKey {
  readonly id: string;
  readonly tenantId: string;
}

/** Assert that a tenant-qualified key pairs the id with the trusted tenant. */
export function tenantUniqueKey(tenantId: string, id: string): TenantUniqueKey {
  if (typeof id !== 'string' || id.length === 0) {
    throw new Error('Resource id must be a non-empty string');
  }
  return { id, tenantId };
}

/**
 * Load a tenant-owned row by id, proving both `id` and `tenantId` belong
 * together, or throw NotFound. Never returns a row from a different tenant,
 * even when a valid object UUID from tenant B is supplied while authenticated
 * in tenant A (IDOR/BOLA protection, Task 0020 §6).
 */
export async function findTenantScoped<TResult>(
  database: TenantScopedFirstLookup,
  tenantId: string,
  id: string,
  label = 'Resource',
): Promise<TResult> {
  const row = await database.findFirst({
    where: { id, tenantId },
  });
  if (!row) {
    throw new NotFoundException(`${label} not found`);
  }
  return row as TResult;
}

/**
 * Load a tenant-owned row by a free-form tenant-scoped `where`, or throw
 * NotFound. The caller must include the trusted tenantId in `where`; this
 * helper guarantees the NotFound boundary.
 */
export async function findTenantScopedFirst<TResult>(
  database: TenantScopedFirstLookup,
  where: Record<string, unknown>,
  label = 'Resource',
): Promise<TResult> {
  const row = await database.findFirst({ where });
  if (!row) {
    throw new NotFoundException(`${label} not found`);
  }
  return row as TResult;
}

/**
 * Verify the actor is an active member of the tenant before any tenant-scoped
 * operation. Fail-closed on: unknown membership, mismatched membership/user,
 * suspended/revoked/pending membership, or inactive/deleted tenant.
 *
 * This is the common "membership must belong to the authenticated user"
 * boundary required for every future vertical (Task 0020 §3).
 */
export async function assertActiveTenantMembership(
  transaction: Pick<Prisma.TransactionClient, 'tenantMembership'>,
  actor: TrustedTenantActor,
): Promise<void> {
  const membership = await transaction.tenantMembership.findFirst({
    where: {
      id: actor.membershipId,
      tenantId: actor.tenantId,
      userId: actor.userId,
      status: 'ACTIVE',
      deletedAt: null,
      tenant: { isActive: true, deletedAt: null },
    },
    select: { id: true },
  });
  if (!membership) {
    throw new ForbiddenException('Active tenant membership required');
  }
}
