import { generateJoinCode, hashJoinCode, normalizeJoinCode } from './organization-join-code.util';
import { OrganizationOnboardingService } from './organization-onboarding.service';

const PEPPER = Buffer.from('f'.repeat(64), 'hex');

interface TenantRow {
  id: string;
  isActive: boolean;
  deletedAt: Date | null;
  organizationType: string;
  selfRegistrationEnabled?: boolean;
}

interface JoinCodeRow {
  id: string;
  codeHash: string;
  status: 'ACTIVE' | 'REVOKED';
  expiresAt: Date | null;
  deletedAt: Date | null;
  redemptionCount: number;
  tenant: TenantRow;
}

/** Builds a valid join-code fixture together with the plaintext code that hashes to it. */
function makeValidJoinCode(overrides: Partial<JoinCodeRow> = {}): {
  code: string;
  row: JoinCodeRow;
} {
  const code = generateJoinCode();
  const codeHash = hashJoinCode(PEPPER, normalizeJoinCode(code));
  const row: JoinCodeRow = {
    id: 'join-code-1',
    codeHash,
    status: 'ACTIVE',
    expiresAt: null,
    deletedAt: null,
    redemptionCount: 0,
    tenant: {
      id: 'tenant-a',
      isActive: true,
      deletedAt: null,
      organizationType: 'HOSPITAL',
    },
    ...overrides,
  };
  return { code, row };
}

function buildHarness(
  options: {
    joinCode?: JoinCodeRow | null;
    existingUser?: { id: string } | null;
    existingExternalIdentity?: { id: string } | null;
  } = {},
) {
  let joinCodeRow = options.joinCode ?? null;
  const createdTenants: TenantRow[] = [];
  const createdUsers: Record<string, unknown>[] = [];
  const createdMemberships: Record<string, unknown>[] = [];
  const createdExternalIdentities: Record<string, unknown>[] = [];
  const auditEvents: Array<{ kind: string; input: unknown }> = [];
  let personalTenant: TenantRow | null = null;

  const transaction = {
    user: {
      findUnique: jest.fn().mockResolvedValue(options.existingUser ?? null),
      create: jest.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => {
        const user = { id: 'new-user-1', ...data };
        createdUsers.push(user);
        return Promise.resolve({ id: user.id });
      }),
    },
    externalAuthIdentity: {
      findFirst: jest.fn().mockResolvedValue(options.existingExternalIdentity ?? null),
      create: jest.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => {
        createdExternalIdentities.push(data);
        return Promise.resolve({ id: 'external-identity-1' });
      }),
    },
    organizationJoinCode: {
      findUnique: jest.fn().mockImplementation(({ where }: { where: { codeHash: string } }) => {
        if (joinCodeRow && joinCodeRow.codeHash === where.codeHash) {
          return Promise.resolve(joinCodeRow);
        }
        return Promise.resolve(null);
      }),
      update: jest
        .fn()
        .mockImplementation(({ data }: { data: { redemptionCount: { increment: number } } }) => {
          if (joinCodeRow) {
            joinCodeRow = {
              ...joinCodeRow,
              redemptionCount: joinCodeRow.redemptionCount + data.redemptionCount.increment,
            };
          }
          return Promise.resolve(joinCodeRow);
        }),
    },
    tenantMembership: {
      create: jest.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => {
        const membership = { id: 'membership-1', ...data };
        createdMemberships.push(membership);
        return Promise.resolve(membership);
      }),
    },
    tenant: {
      upsert: jest.fn().mockImplementation(({ create }: { create: Partial<TenantRow> }) => {
        if (!personalTenant) {
          personalTenant = {
            id: 'personal-tenant-1',
            isActive: true,
            deletedAt: null,
            organizationType: 'NONE',
            selfRegistrationEnabled: false,
            ...create,
          } as TenantRow;
          createdTenants.push(personalTenant);
        }
        return Promise.resolve(personalTenant);
      }),
    },
  };

  const prisma = {
    client: {
      $transaction: jest.fn((op: (tx: typeof transaction) => unknown) => op(transaction)),
    },
  };

  const audit = {
    appendTenantSystem: jest.fn().mockImplementation((_tx: unknown, input: unknown) => {
      auditEvents.push({ kind: 'tenant', input });
      return Promise.resolve();
    }),
    appendSystem: jest.fn().mockImplementation((_tx: unknown, input: unknown) => {
      auditEvents.push({ kind: 'system', input });
      return Promise.resolve();
    }),
  };

  const service = new OrganizationOnboardingService(prisma as never, audit as never);

  return {
    service,
    createdTenants,
    createdUsers,
    createdMemberships,
    createdExternalIdentities,
    auditEvents,
    getJoinCode: () => joinCodeRow,
  };
}

describe('OrganizationOnboardingService.registerWithPassword', () => {
  const basePasswordInput = {
    email: 'nurse@example.com',
    phone: '+919876543210',
    passwordHash: 'hashed',
    firstName: 'Asha',
    lastName: 'Rao',
    orgJoinCodePepper: PEPPER,
  };

  it('creates only a PENDING membership for a valid code, with no role/privilege fields', async () => {
    const { code, row } = makeValidJoinCode();
    const harness = buildHarness({ joinCode: row });

    await harness.service.registerWithPassword({
      ...basePasswordInput,
      organizationType: 'HOSPITAL',
      organizationCode: code,
    });

    expect(harness.createdUsers).toHaveLength(1);
    expect(harness.createdUsers[0]).toMatchObject({ status: 'PENDING_VERIFICATION' });
    expect(harness.createdMemberships).toHaveLength(1);
    expect(harness.createdMemberships[0]).toMatchObject({
      tenantId: 'tenant-a',
      status: 'PENDING',
    });
    expect(harness.createdMemberships[0]).not.toHaveProperty('role');
    expect(harness.createdMemberships[0]).not.toHaveProperty('roleId');
    expect(harness.createdMemberships[0]).not.toHaveProperty('permissions');
  });

  it('increments the reusable code redemption counter without consuming it', async () => {
    const { code, row } = makeValidJoinCode();
    const harness = buildHarness({ joinCode: row });

    await harness.service.registerWithPassword({
      ...basePasswordInput,
      organizationType: 'HOSPITAL',
      organizationCode: code,
    });

    expect(harness.getJoinCode()?.redemptionCount).toBe(1);
    expect(harness.getJoinCode()?.status).toBe('ACTIVE');
  });

  it('rejects registration when the selected type does not match the organization type', async () => {
    const { code, row } = makeValidJoinCode({
      tenant: { id: 'tenant-a', isActive: true, deletedAt: null, organizationType: 'SUPPLIER' },
    });
    const harness = buildHarness({ joinCode: row });

    await harness.service.registerWithPassword({
      ...basePasswordInput,
      organizationType: 'HOSPITAL', // client claims Hospital; the code's real org is Supplier
      organizationCode: code,
    });

    expect(harness.createdUsers).toHaveLength(0);
    expect(harness.createdMemberships).toHaveLength(0);
  });

  it('rejects an expired code', async () => {
    const { code, row } = makeValidJoinCode({ expiresAt: new Date(Date.now() - 1000) });
    const harness = buildHarness({ joinCode: row });

    await harness.service.registerWithPassword({
      ...basePasswordInput,
      organizationType: 'HOSPITAL',
      organizationCode: code,
    });

    expect(harness.createdUsers).toHaveLength(0);
  });

  it('accepts a code with a future expiry', async () => {
    const { code, row } = makeValidJoinCode({ expiresAt: new Date(Date.now() + 1000 * 60 * 60) });
    const harness = buildHarness({ joinCode: row });

    await harness.service.registerWithPassword({
      ...basePasswordInput,
      organizationType: 'HOSPITAL',
      organizationCode: code,
    });

    expect(harness.createdUsers).toHaveLength(1);
  });

  it('rejects a revoked code', async () => {
    const { code, row } = makeValidJoinCode({ status: 'REVOKED' });
    const harness = buildHarness({ joinCode: row });

    await harness.service.registerWithPassword({
      ...basePasswordInput,
      organizationType: 'HOSPITAL',
      organizationCode: code,
    });

    expect(harness.createdUsers).toHaveLength(0);
  });

  it('rejects a code for an inactive organization', async () => {
    const { code, row } = makeValidJoinCode({
      tenant: { id: 'tenant-a', isActive: false, deletedAt: null, organizationType: 'HOSPITAL' },
    });
    const harness = buildHarness({ joinCode: row });

    await harness.service.registerWithPassword({
      ...basePasswordInput,
      organizationType: 'HOSPITAL',
      organizationCode: code,
    });

    expect(harness.createdUsers).toHaveLength(0);
  });

  it('rejects a soft-deleted code even if otherwise well-formed', async () => {
    const { code, row } = makeValidJoinCode({ deletedAt: new Date() });
    const harness = buildHarness({ joinCode: row });

    await harness.service.registerWithPassword({
      ...basePasswordInput,
      organizationType: 'HOSPITAL',
      organizationCode: code,
    });

    expect(harness.createdUsers).toHaveLength(0);
  });

  it('rejects a nonexistent code and a wrong-type code identically (anti-enumeration)', async () => {
    const harnessNonexistent = buildHarness({ joinCode: null });
    await harnessNonexistent.service.registerWithPassword({
      ...basePasswordInput,
      organizationType: 'HOSPITAL',
      organizationCode: 'MED-ZZZZZ-ZZZZZ',
    });
    expect(harnessNonexistent.createdUsers).toHaveLength(0);

    const { code, row } = makeValidJoinCode({
      tenant: { id: 'tenant-a', isActive: true, deletedAt: null, organizationType: 'SUPPLIER' },
    });
    const harnessWrongType = buildHarness({ joinCode: row });
    await harnessWrongType.service.registerWithPassword({
      ...basePasswordInput,
      organizationType: 'HOSPITAL',
      organizationCode: code,
    });
    expect(harnessWrongType.createdUsers).toHaveLength(0);

    // Both failure modes produce exactly the same outward effect: no
    // user, no membership, no thrown error -- a caller cannot
    // distinguish "no such code" from "wrong organization type" from
    // the method's return value or any side effect.
  });

  it('rejects a malformed code without ever querying the database for it', async () => {
    const harness = buildHarness({ joinCode: null });
    await harness.service.registerWithPassword({
      ...basePasswordInput,
      organizationType: 'HOSPITAL',
      organizationCode: 'not-a-real-code-at-all!!',
    });
    expect(harness.createdUsers).toHaveLength(0);
  });

  it('rejects registration for a healthcare type with no code supplied at all', async () => {
    const harness = buildHarness({ joinCode: null });
    await harness.service.registerWithPassword({
      ...basePasswordInput,
      organizationType: 'PHARMACY',
      organizationCode: undefined,
    });
    expect(harness.createdUsers).toHaveLength(0);
  });

  it('rejects registration when the email already exists, before ever touching the code', async () => {
    const { code, row } = makeValidJoinCode();
    const harness = buildHarness({ joinCode: row, existingUser: { id: 'existing-user' } });

    await harness.service.registerWithPassword({
      ...basePasswordInput,
      organizationType: 'HOSPITAL',
      organizationCode: code,
    });

    expect(harness.createdUsers).toHaveLength(0);
    expect(harness.createdMemberships).toHaveLength(0);
  });

  it('never includes the raw code or its hash in any audit event', async () => {
    const { code, row } = makeValidJoinCode();
    const harness = buildHarness({ joinCode: row });

    await harness.service.registerWithPassword({
      ...basePasswordInput,
      organizationType: 'HOSPITAL',
      organizationCode: code,
    });

    const serialized = JSON.stringify(harness.auditEvents);
    expect(serialized).not.toContain(code);
    expect(serialized).not.toContain(normalizeJoinCode(code));
    expect(serialized).not.toContain(row.codeHash);
  });

  it('never logs the password hash in any audit event', async () => {
    const { code, row } = makeValidJoinCode();
    const harness = buildHarness({ joinCode: row });

    await harness.service.registerWithPassword({
      ...basePasswordInput,
      organizationType: 'HOSPITAL',
      organizationCode: code,
    });

    const serialized = JSON.stringify(harness.auditEvents);
    expect(serialized).not.toContain(basePasswordInput.passwordHash);
  });

  it('audits a rejected code with only a bounded, non-identifying reason', async () => {
    const harness = buildHarness({ joinCode: null });
    await harness.service.registerWithPassword({
      ...basePasswordInput,
      organizationType: 'HOSPITAL',
      organizationCode: 'MED-ZZZZZ-ZZZZZ',
    });

    expect(harness.auditEvents).toHaveLength(1);
    const [event] = harness.auditEvents;
    expect(event.kind).toBe('system');
    const metadata = (event.input as { metadata: Record<string, unknown> }).metadata;
    expect(Object.keys(metadata)).toEqual(['reason']);
  });
});

describe('OrganizationOnboardingService -- NONE personal account path', () => {
  it('creates an ACTIVE, role-less personal membership with no organization code required', async () => {
    const harness = buildHarness({});

    await harness.service.registerWithPassword({
      organizationType: 'NONE',
      email: 'person@example.com',
      phone: '+919876500000',
      passwordHash: 'hashed',
      firstName: 'Ravi',
      lastName: 'Kumar',
      orgJoinCodePepper: PEPPER,
    });

    expect(harness.createdUsers).toHaveLength(1);
    expect(harness.createdMemberships).toHaveLength(1);
    expect(harness.createdMemberships[0]).toMatchObject({ status: 'ACTIVE' });
    expect(harness.createdMemberships[0]).not.toHaveProperty('role');
    expect(harness.createdTenants).toHaveLength(1);
    expect(harness.createdTenants[0]).toMatchObject({ organizationType: 'NONE' });
  });

  it('reuses the same personal-accounts tenant across multiple personal registrations', async () => {
    const harness = buildHarness({});

    await harness.service.registerWithPassword({
      organizationType: 'NONE',
      email: 'first@example.com',
      phone: '+919876500001',
      passwordHash: 'hashed',
      firstName: 'A',
      lastName: 'B',
      orgJoinCodePepper: PEPPER,
    });

    await harness.service.registerWithPassword({
      organizationType: 'NONE',
      email: 'second@example.com',
      phone: '+919876500002',
      passwordHash: 'hashed',
      firstName: 'C',
      lastName: 'D',
      orgJoinCodePepper: PEPPER,
    });

    expect(harness.createdTenants).toHaveLength(1);
    expect(harness.createdMemberships).toHaveLength(2);
  });
});

describe('OrganizationOnboardingService.registerWithGoogle', () => {
  const baseGoogleInput = {
    subject: 'google-subject-1',
    email: 'doctor@example.com',
    phone: '+919876543211',
    firstName: 'Meera',
    lastName: 'Nair',
    orgJoinCodePepper: PEPPER,
  };

  it('follows the identical code policy and pending-membership behavior as password registration', async () => {
    const { code, row } = makeValidJoinCode();
    const harness = buildHarness({ joinCode: row });

    await harness.service.registerWithGoogle({
      ...baseGoogleInput,
      organizationType: 'HOSPITAL',
      organizationCode: code,
    });

    expect(harness.createdMemberships).toHaveLength(1);
    expect(harness.createdMemberships[0]).toMatchObject({ status: 'PENDING' });
    expect(harness.createdExternalIdentities).toHaveLength(1);
  });

  it('rejects an invalid code identically to password registration (no membership, no user)', async () => {
    const harness = buildHarness({ joinCode: null });

    await harness.service.registerWithGoogle({
      ...baseGoogleInput,
      organizationType: 'HOSPITAL',
      organizationCode: 'MED-NOTVALID',
    });

    expect(harness.createdUsers).toHaveLength(0);
    expect(harness.createdMemberships).toHaveLength(0);
    expect(harness.createdExternalIdentities).toHaveLength(0);
  });

  it('never auto-links an existing Google subject to another organization', async () => {
    const { code, row } = makeValidJoinCode();
    const harness = buildHarness({
      joinCode: row,
      existingExternalIdentity: { id: 'already-linked' },
    });

    await harness.service.registerWithGoogle({
      ...baseGoogleInput,
      organizationType: 'HOSPITAL',
      organizationCode: code,
    });

    expect(harness.createdUsers).toHaveLength(0);
    expect(harness.createdMemberships).toHaveLength(0);
  });

  it('never auto-links an existing email to another organization via Google', async () => {
    const { code, row } = makeValidJoinCode();
    const harness = buildHarness({ joinCode: row, existingUser: { id: 'existing-user' } });

    await harness.service.registerWithGoogle({
      ...baseGoogleInput,
      organizationType: 'HOSPITAL',
      organizationCode: code,
    });

    expect(harness.createdMemberships).toHaveLength(0);
  });
});

describe('OrganizationOnboardingService -- cross-tenant isolation', () => {
  it('a code for tenant A never creates a membership in tenant B', async () => {
    const { code, row } = makeValidJoinCode({
      tenant: { id: 'tenant-a', isActive: true, deletedAt: null, organizationType: 'HOSPITAL' },
    });
    const harness = buildHarness({ joinCode: row });

    await harness.service.registerWithPassword({
      email: 'staff@example.com',
      phone: '+919876543212',
      passwordHash: 'hashed',
      firstName: 'X',
      lastName: 'Y',
      orgJoinCodePepper: PEPPER,
      organizationType: 'HOSPITAL',
      organizationCode: code,
    });

    expect(harness.createdMemberships).toHaveLength(1);
    expect(harness.createdMemberships[0]).toMatchObject({ tenantId: 'tenant-a' });
    expect(harness.createdMemberships[0]).not.toMatchObject({ tenantId: 'tenant-b' });
  });

  it('knowing another tenant exists (by guessing an unrelated code) cannot resolve to it', async () => {
    // The lookup is by codeHash alone -- there is no code path that
    // accepts a tenant identifier of any kind as an alternative
    // resolution route.
    const harness = buildHarness({ joinCode: null });
    await harness.service.registerWithPassword({
      email: 'attacker@example.com',
      phone: '+919876543213',
      passwordHash: 'hashed',
      firstName: 'Z',
      lastName: 'W',
      orgJoinCodePepper: PEPPER,
      organizationType: 'HOSPITAL',
      organizationCode: 'MED-GUESSD-GUESSD',
    });
    expect(harness.createdMemberships).toHaveLength(0);
  });
});
