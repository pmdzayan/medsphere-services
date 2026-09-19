const { Client } = require('pg');

const DATABASE_URL = process.env.AIM_CANDIDATE_0039_DATABASE_URL;
if (!DATABASE_URL) {
  console.error('AIM_CANDIDATE_0039_DATABASE_URL is required. Refusing to run without it.');
  process.exit(1);
}

const TENANT_A = '11111111-1111-4111-8111-111111111111';
const PROVIDER_A = '33333333-3333-4333-8333-333333333333';

async function reset(client) {
  await client.query(`DELETE FROM "ProviderVerification" WHERE "tenantId" = $1`, [TENANT_A]);
  await client.query(`UPDATE "Provider" SET "isVerified" = false WHERE id = $1`, [PROVIDER_A]);
}

async function insertRow(client, { status, isCurrent, licenseDays = 365, licenseNumber }) {
  const r = await client.query(
    `INSERT INTO "ProviderVerification" ("tenantId","providerId","providerType",status,"licenseNumber","licenseExpiryDate","businessRegistrationNumber","governmentIdReference","isCurrent")
     VALUES ($1,$2,'PHARMACY',$3,$4, now() + ($5 || ' days')::interval,'REG-X','GOV-X', $6) RETURNING id, version`,
    [TENANT_A, PROVIDER_A, status, licenseNumber, licenseDays, isCurrent],
  );
  return r.rows[0];
}

// Mirrors the service's exact pattern: acquire the provider advisory
// lock FIRST, then re-read authoritative state, then decide.
async function lockedApprove(client, verificationId, expectedVersion) {
  await client.query('BEGIN');
  await client.query('SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))', [
    TENANT_A,
    PROVIDER_A,
  ]);
  const submission = await client.query(
    `SELECT status, "isCurrent", "licenseExpiryDate", "providerType", "providerId" FROM "ProviderVerification" WHERE id = $1`,
    [verificationId],
  );
  if (
    submission.rows.length === 0 ||
    !['PENDING', 'UNDER_REVIEW'].includes(submission.rows[0].status)
  ) {
    await client.query('ROLLBACK');
    return { ok: false, reason: 'NOT_IN_ALLOWED_STATE' };
  }
  if (new Date(submission.rows[0].licenseExpiryDate).getTime() <= Date.now()) {
    await client.query('ROLLBACK');
    return { ok: false, reason: 'EXPIRED' };
  }
  // Mirrors the real service's item-H check: the linked Provider must
  // still exist, be PHARMACY, and its actual current type must match
  // the verification's own recorded providerType.
  const provider = await client.query(
    `SELECT "providerType" FROM "Provider" WHERE id = $1 AND "tenantId" = $2 AND "deletedAt" IS NULL AND "providerType" = 'PHARMACY'`,
    [submission.rows[0].providerId, TENANT_A],
  );
  if (
    provider.rows.length === 0 ||
    provider.rows[0].providerType !== submission.rows[0].providerType
  ) {
    await client.query('ROLLBACK');
    return { ok: false, reason: 'PROVIDER_TYPE_MISMATCH' };
  }
  if (!submission.rows[0].isCurrent) {
    await client.query(
      `UPDATE "ProviderVerification" SET "isCurrent" = false WHERE "providerId" = $1 AND "isCurrent" = true`,
      [PROVIDER_A],
    );
  }
  const updated = await client.query(
    `UPDATE "ProviderVerification" SET status = 'APPROVED', version = version + 1, "isCurrent" = true
     WHERE id = $1 AND version = $2 AND status = $3`,
    [verificationId, expectedVersion, submission.rows[0].status],
  );
  if (updated.rowCount !== 1) {
    await client.query('ROLLBACK');
    return { ok: false, reason: 'STALE_VERSION' };
  }
  await client.query(`UPDATE "Provider" SET "isVerified" = true WHERE id = $1`, [PROVIDER_A]);
  await client.query('COMMIT');
  return { ok: true };
}

async function lockedSuspend(client, verificationId, expectedVersion) {
  await client.query('BEGIN');
  await client.query('SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))', [
    TENANT_A,
    PROVIDER_A,
  ]);
  const current = await client.query(
    `SELECT status, "isCurrent" FROM "ProviderVerification" WHERE id = $1`,
    [verificationId],
  );
  if (
    current.rows.length === 0 ||
    !current.rows[0].isCurrent ||
    current.rows[0].status !== 'APPROVED'
  ) {
    await client.query('ROLLBACK');
    return { ok: false, reason: 'NOT_IN_ALLOWED_STATE_OR_STALE' };
  }
  const updated = await client.query(
    `UPDATE "ProviderVerification" SET status = 'SUSPENDED', version = version + 1
     WHERE id = $1 AND version = $2 AND status = 'APPROVED' AND "isCurrent" = true`,
    [verificationId, expectedVersion],
  );
  if (updated.rowCount !== 1) {
    await client.query('ROLLBACK');
    return { ok: false, reason: 'STALE_VERSION' };
  }
  await client.query(`UPDATE "Provider" SET "isVerified" = false WHERE id = $1`, [PROVIDER_A]);
  await client.query('COMMIT');
  return { ok: true };
}

async function lockedReject(client, verificationId, expectedVersion) {
  await client.query('BEGIN');
  await client.query('SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))', [
    TENANT_A,
    PROVIDER_A,
  ]);
  const submission = await client.query(
    `SELECT status, "isCurrent" FROM "ProviderVerification" WHERE id = $1`,
    [verificationId],
  );
  if (
    submission.rows.length === 0 ||
    !['PENDING', 'UNDER_REVIEW'].includes(submission.rows[0].status)
  ) {
    await client.query('ROLLBACK');
    return { ok: false, reason: 'NOT_IN_ALLOWED_STATE' };
  }
  const updated = await client.query(
    `UPDATE "ProviderVerification" SET status = 'REJECTED', version = version + 1
     WHERE id = $1 AND version = $2 AND status = $3`,
    [verificationId, expectedVersion, submission.rows[0].status],
  );
  if (updated.rowCount !== 1) {
    await client.query('ROLLBACK');
    return { ok: false, reason: 'STALE_VERSION' };
  }
  if (submission.rows[0].isCurrent) {
    await client.query(`UPDATE "Provider" SET "isVerified" = false WHERE id = $1`, [PROVIDER_A]);
  }
  await client.query('COMMIT');
  return { ok: true };
}

async function testRenewalApprovalVsSuspension(mainClient) {
  console.log(
    '--- 1. Renewal approval vs suspension: exactly one coherent outcome, never two current rows, never zero ---',
  );
  await reset(mainClient);
  const oldApproval = await insertRow(mainClient, {
    status: 'APPROVED',
    isCurrent: true,
    licenseNumber: 'old-approval',
  });
  const renewal = await insertRow(mainClient, {
    status: 'UNDER_REVIEW',
    isCurrent: false,
    licenseNumber: 'renewal',
  });

  const clientA = new Client(DATABASE_URL);
  const clientB = new Client(DATABASE_URL);
  await clientA.connect();
  await clientB.connect();
  try {
    const [approveResult, suspendResult] = await Promise.all([
      lockedApprove(clientA, renewal.id, renewal.version),
      lockedSuspend(clientB, oldApproval.id, oldApproval.version),
    ]);

    const finalRows = await mainClient.query(
      `SELECT id, status, "isCurrent", "licenseNumber" FROM "ProviderVerification" WHERE "providerId" = $1`,
      [PROVIDER_A],
    );
    const currentRows = finalRows.rows.filter((r) => r.isCurrent);
    if (currentRows.length !== 1) {
      throw new Error(
        `FAIL: expected exactly 1 current row after the race, got ${currentRows.length}`,
      );
    }
    const providerState = await mainClient.query(
      `SELECT "isVerified" FROM "Provider" WHERE id = $1`,
      [PROVIDER_A],
    );
    const currentRow = currentRows[0];
    // Whichever transaction committed second determines the coherent
    // final state; the KEY invariant is that isVerified matches the
    // CURRENT row's actual status, never a stale mix of the two.
    const expectedVerified = currentRow.status === 'APPROVED';
    if (providerState.rows[0].isVerified !== expectedVerified) {
      throw new Error(
        `FAIL: Provider.isVerified (${providerState.rows[0].isVerified}) disagrees with the current row's status (${currentRow.status})`,
      );
    }
    console.log(
      `  PASS: exactly 1 current row (${currentRow.licenseNumber}, ${currentRow.status}); Provider.isVerified (${providerState.rows[0].isVerified}) is coherent with it. [approve ok=${approveResult.ok}, suspend ok=${suspendResult.ok}]\n`,
    );
  } finally {
    await clientA.end();
    await clientB.end();
  }
}

async function testTwoConcurrentRenewalApprovals(mainClient) {
  console.log('--- 2. Two concurrent renewal approval attempts: exactly one wins ---');
  await reset(mainClient);
  const oldApproval = await insertRow(mainClient, {
    status: 'APPROVED',
    isCurrent: true,
    licenseNumber: 'old',
  });
  const renewal = await insertRow(mainClient, {
    status: 'UNDER_REVIEW',
    isCurrent: false,
    licenseNumber: 'renewal',
  });

  const clientA = new Client(DATABASE_URL);
  const clientB = new Client(DATABASE_URL);
  await clientA.connect();
  await clientB.connect();
  try {
    const [resultA, resultB] = await Promise.all([
      lockedApprove(clientA, renewal.id, renewal.version),
      lockedApprove(clientB, renewal.id, renewal.version),
    ]);
    const winners = [resultA, resultB].filter((r) => r.ok).length;
    if (winners !== 1) throw new Error(`FAIL: expected exactly 1 winner, got ${winners}`);
    const finalRow = await mainClient.query(
      `SELECT version, status FROM "ProviderVerification" WHERE id = $1`,
      [renewal.id],
    );
    if (finalRow.rows[0].version !== renewal.version + 1) {
      throw new Error(
        'FAIL: expected exactly one version increment despite two concurrent attempts',
      );
    }
    console.log(
      '  PASS: exactly one of two concurrent approval attempts won; version incremented exactly once.\n',
    );
  } finally {
    await clientA.end();
    await clientB.end();
  }
}

async function testRenewalRejectionWhileApprovalValid(mainClient) {
  console.log('--- 3. Renewal rejection while old approval remains valid: approval untouched ---');
  await reset(mainClient);
  const oldApproval = await insertRow(mainClient, {
    status: 'APPROVED',
    isCurrent: true,
    licenseNumber: 'old',
  });
  const renewal = await insertRow(mainClient, {
    status: 'UNDER_REVIEW',
    isCurrent: false,
    licenseNumber: 'renewal',
  });
  await mainClient.query(`UPDATE "Provider" SET "isVerified" = true WHERE id = $1`, [PROVIDER_A]);

  const result = await lockedReject(mainClient, renewal.id, renewal.version);
  if (!result.ok) throw new Error('FAIL: expected the rejection to succeed');
  const old = await mainClient.query(
    `SELECT status, "isCurrent" FROM "ProviderVerification" WHERE id = $1`,
    [oldApproval.id],
  );
  if (old.rows[0].status !== 'APPROVED' || !old.rows[0].isCurrent) {
    throw new Error('FAIL: expected the old approval to remain untouched');
  }
  const providerState = await mainClient.query(
    `SELECT "isVerified" FROM "Provider" WHERE id = $1`,
    [PROVIDER_A],
  );
  if (!providerState.rows[0].isVerified) {
    throw new Error('FAIL: expected Provider.isVerified to remain true');
  }
  console.log('  PASS: renewal rejected; old approval and Provider.isVerified both untouched.\n');
}

async function testDuplicateApprovalRetry(mainClient) {
  console.log('--- 4. Duplicate approval retry: deterministic, no double-approve ---');
  await reset(mainClient);
  const submission = await insertRow(mainClient, {
    status: 'UNDER_REVIEW',
    isCurrent: true,
    licenseNumber: 'sub',
  });
  const first = await lockedApprove(mainClient, submission.id, submission.version);
  const retry = await lockedApprove(mainClient, submission.id, submission.version);
  if (!first.ok) throw new Error('FAIL: expected the first approval to succeed');
  if (retry.ok) throw new Error('FAIL: expected the retry (stale version) to fail');
  console.log('  PASS: duplicate approval retry deterministically fails.\n');
}

async function testDuplicateRejectionRetry(mainClient) {
  console.log('--- 5. Duplicate rejection retry: deterministic, no double-reject ---');
  await reset(mainClient);
  const submission = await insertRow(mainClient, {
    status: 'PENDING',
    isCurrent: true,
    licenseNumber: 'sub',
  });
  const first = await lockedReject(mainClient, submission.id, submission.version);
  const retry = await lockedReject(mainClient, submission.id, submission.version);
  if (!first.ok) throw new Error('FAIL: expected the first rejection to succeed');
  if (retry.ok) throw new Error('FAIL: expected the retry (stale version) to fail');
  console.log('  PASS: duplicate rejection retry deterministically fails.\n');
}

async function testStaleExpectedVersion(mainClient) {
  console.log('--- 6. Stale expectedVersion fails closed ---');
  await reset(mainClient);
  const submission = await insertRow(mainClient, {
    status: 'UNDER_REVIEW',
    isCurrent: true,
    licenseNumber: 'sub',
  });
  const result = await lockedApprove(mainClient, submission.id, submission.version + 99);
  if (result.ok) throw new Error('FAIL: expected a stale expectedVersion to fail');
  console.log('  PASS: stale expectedVersion correctly fails closed.\n');
}

async function testApprovalVsLicenseExpiryBoundary(mainClient) {
  console.log(
    '--- 7. Approval vs license-expiry boundary: an already-expired submission cannot be approved ---',
  );
  await reset(mainClient);
  const submission = await insertRow(mainClient, {
    status: 'UNDER_REVIEW',
    isCurrent: true,
    licenseDays: -1,
    licenseNumber: 'expired-sub',
  });
  const result = await lockedApprove(mainClient, submission.id, submission.version);
  if (result.ok) throw new Error('FAIL: expected an already-expired submission to fail approval');
  console.log('  PASS: an already-expired submission is correctly refused approval.\n');
}

async function testRenewalSubmissionVsSuspension(mainClient) {
  console.log(
    '--- 8. Renewal submission vs suspension: a suspension mid-submission still leaves a coherent final state ---',
  );
  await reset(mainClient);
  const approval = await insertRow(mainClient, {
    status: 'APPROVED',
    isCurrent: true,
    licenseNumber: 'approval',
  });
  await mainClient.query(`UPDATE "Provider" SET "isVerified" = true WHERE id = $1`, [PROVIDER_A]);

  // Simulates the service's own submitVerification: lock, re-read
  // current, if SUSPENDED (or becomes SUSPENDED before this tx's lock)
  // block; otherwise proceed as a renewal.
  async function lockedSubmitRenewal(client) {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))', [
      TENANT_A,
      PROVIDER_A,
    ]);
    const current = await client.query(
      `SELECT status FROM "ProviderVerification" WHERE "providerId" = $1 AND "isCurrent" = true`,
      [PROVIDER_A],
    );
    if (current.rows[0]?.status === 'SUSPENDED') {
      await client.query('ROLLBACK');
      return { ok: false, reason: 'CURRENT_VERIFICATION_SUSPENDED' };
    }
    await client.query(
      `INSERT INTO "ProviderVerification" ("tenantId","providerId","providerType",status,"licenseNumber","licenseExpiryDate","businessRegistrationNumber","governmentIdReference","isCurrent")
       VALUES ($1,$2,'PHARMACY','PENDING','renewal-race', now() + interval '400 days','REG-X','GOV-X', false)`,
      [TENANT_A, PROVIDER_A],
    );
    await client.query('COMMIT');
    return { ok: true };
  }

  const clientA = new Client(DATABASE_URL);
  const clientB = new Client(DATABASE_URL);
  await clientA.connect();
  await clientB.connect();
  try {
    const [submitResult, suspendResult] = await Promise.all([
      lockedSubmitRenewal(clientA),
      lockedSuspend(clientB, approval.id, approval.version),
    ]);
    // Whichever order the lock serializes them in, the final state
    // must be coherent: either the renewal exists (submitted before
    // suspension took effect) or it was correctly blocked (suspension
    // took effect first).
    const rows = await mainClient.query(
      `SELECT status, "isCurrent" FROM "ProviderVerification" WHERE "providerId" = $1`,
      [PROVIDER_A],
    );
    const currentCount = rows.rows.filter((r) => r.isCurrent).length;
    if (currentCount !== 1)
      throw new Error(`FAIL: expected exactly 1 current row, got ${currentCount}`);
    console.log(
      `  PASS: coherent final state (submit ok=${submitResult.ok}, suspend ok=${suspendResult.ok}); exactly 1 current row.\n`,
    );
  } finally {
    await clientA.end();
    await clientB.end();
  }
}

async function testProviderTypeChangingBeforeApproval(mainClient) {
  console.log(
    '--- 9. Provider type changing before approval: [REAL POSTGRESQL SQL-PATTERN PROOF] the actual approval transition path is attempted and genuinely refused ---',
  );
  await reset(mainClient);
  const submission = await insertRow(mainClient, {
    status: 'UNDER_REVIEW',
    isCurrent: true,
    licenseNumber: 'sub',
  });
  await mainClient.query(`UPDATE "Provider" SET "providerType" = 'HOSPITAL' WHERE id = $1`, [
    PROVIDER_A,
  ]);

  // Attempt the SAME approval transition path used elsewhere in this
  // script (mirrors the real service's item-H check) -- do not restore
  // PHARMACY until after every assertion below.
  const result = await lockedApprove(mainClient, submission.id, submission.version);
  if (result.ok) {
    throw new Error('FAIL: expected approval to be refused when Provider.providerType is HOSPITAL');
  }
  if (result.reason !== 'PROVIDER_TYPE_MISMATCH') {
    throw new Error(`FAIL: expected PROVIDER_TYPE_MISMATCH, got ${result.reason}`);
  }
  const row = await mainClient.query(
    `SELECT status, "isCurrent" FROM "ProviderVerification" WHERE id = $1`,
    [submission.id],
  );
  if (!['PENDING', 'UNDER_REVIEW'].includes(row.rows[0].status)) {
    throw new Error(
      `FAIL: expected the verification to remain PENDING/UNDER_REVIEW, got ${row.rows[0].status}`,
    );
  }
  const providerState = await mainClient.query(
    `SELECT "isVerified" FROM "Provider" WHERE id = $1`,
    [PROVIDER_A],
  );
  if (providerState.rows[0].isVerified) {
    throw new Error('FAIL: expected Provider.isVerified to remain false');
  }

  await mainClient.query(`UPDATE "Provider" SET "providerType" = 'PHARMACY' WHERE id = $1`, [
    PROVIDER_A,
  ]);
  console.log(
    '  PASS: the actual approval transition path was attempted with Provider.providerType=HOSPITAL and genuinely refused; verification stayed PENDING/UNDER_REVIEW; no authoritative promotion occurred; Provider.isVerified remained false.\n' +
      '  NOTE: this is a REAL POSTGRESQL SQL-PATTERN PROOF (the exact SQL the service issues, run directly), not a service-harness integration test.\n',
  );
}

async function testRenewalRejectionVsSuspension(mainClient) {
  console.log('--- 10. Renewal rejection vs suspension: exactly one coherent outcome ---');
  await reset(mainClient);
  const oldApproval = await insertRow(mainClient, {
    status: 'APPROVED',
    isCurrent: true,
    licenseNumber: 'old',
  });
  const renewal = await insertRow(mainClient, {
    status: 'UNDER_REVIEW',
    isCurrent: false,
    licenseNumber: 'renewal',
  });
  await mainClient.query(`UPDATE "Provider" SET "isVerified" = true WHERE id = $1`, [PROVIDER_A]);

  const clientA = new Client(DATABASE_URL);
  const clientB = new Client(DATABASE_URL);
  await clientA.connect();
  await clientB.connect();
  try {
    const [rejectResult, suspendResult] = await Promise.all([
      lockedReject(clientA, renewal.id, renewal.version),
      lockedSuspend(clientB, oldApproval.id, oldApproval.version),
    ]);
    const rows = await mainClient.query(
      `SELECT status, "isCurrent" FROM "ProviderVerification" WHERE "providerId" = $1`,
      [PROVIDER_A],
    );
    const currentRows = rows.rows.filter((r) => r.isCurrent);
    if (currentRows.length !== 1) {
      throw new Error(`FAIL: expected exactly 1 current row, got ${currentRows.length}`);
    }
    const providerState = await mainClient.query(
      `SELECT "isVerified" FROM "Provider" WHERE id = $1`,
      [PROVIDER_A],
    );
    const expectedVerified = currentRows[0].status === 'APPROVED';
    if (providerState.rows[0].isVerified !== expectedVerified) {
      throw new Error('FAIL: Provider.isVerified disagrees with the current row status');
    }
    console.log(
      `  PASS: exactly 1 current row (${currentRows[0].status}); Provider.isVerified coherent with it. [reject ok=${rejectResult.ok}, suspend ok=${suspendResult.ok}]\n`,
    );
  } finally {
    await clientA.end();
    await clientB.end();
  }
}

async function testStaleSuspensionAfterRenewalPromotion(mainClient) {
  console.log(
    '--- 11. Stale suspension after renewal promotion (dedicated regression for the exact bug the CTO review previously identified) ---',
  );
  await reset(mainClient);
  const oldApproval = await insertRow(mainClient, {
    status: 'APPROVED',
    isCurrent: true,
    licenseNumber: 'old',
  });
  const renewal = await insertRow(mainClient, {
    status: 'UNDER_REVIEW',
    isCurrent: false,
    licenseNumber: 'renewal',
  });
  await mainClient.query(`UPDATE "Provider" SET "isVerified" = true WHERE id = $1`, [PROVIDER_A]);

  // Sequentially (not concurrently) force the exact bug scenario: the
  // renewal is approved and promoted FIRST (demoting the old row to
  // isCurrent=false), and only THEN does a suspend attempt targeting
  // the now-historical old row arrive.
  const approveResult = await lockedApprove(mainClient, renewal.id, renewal.version);
  if (!approveResult.ok) throw new Error('FAIL: expected the renewal approval to succeed');

  const staleSuspendResult = await lockedSuspend(mainClient, oldApproval.id, oldApproval.version);
  if (staleSuspendResult.ok) {
    throw new Error(
      'FAIL: expected the stale suspend attempt (targeting a no-longer-current row) to fail',
    );
  }

  const old = await mainClient.query(
    `SELECT status, "isCurrent" FROM "ProviderVerification" WHERE id = $1`,
    [oldApproval.id],
  );
  if (old.rows[0].status !== 'APPROVED') {
    throw new Error(
      `FAIL: the historical approval must remain APPROVED (its own historical fact), got ${old.rows[0].status}`,
    );
  }
  if (old.rows[0].isCurrent) {
    throw new Error(
      'FAIL: the historical approval must remain isCurrent=false (already demoted by the renewal)',
    );
  }
  const renewalRow = await mainClient.query(
    `SELECT status, "isCurrent" FROM "ProviderVerification" WHERE id = $1`,
    [renewal.id],
  );
  if (renewalRow.rows[0].status !== 'APPROVED' || !renewalRow.rows[0].isCurrent) {
    throw new Error('FAIL: the renewal must remain the sole current APPROVED row');
  }
  const providerState = await mainClient.query(
    `SELECT "isVerified" FROM "Provider" WHERE id = $1`,
    [PROVIDER_A],
  );
  if (!providerState.rows[0].isVerified) {
    throw new Error(
      'FAIL: Provider.isVerified must remain true -- the stale suspend must never have flipped it false',
    );
  }
  console.log(
    '  PASS: the stale suspend attempt (targeting the now-historical row) was correctly refused; the historical approval was NOT altered; Provider.isVerified remained true throughout.\n',
  );
}

async function main() {
  console.log(
    `Connecting to ${new URL(DATABASE_URL).host}${new URL(DATABASE_URL).pathname} (credentials not printed)`,
  );
  const client = new Client(DATABASE_URL);
  await client.connect();
  try {
    await testRenewalApprovalVsSuspension(client);
    await testTwoConcurrentRenewalApprovals(client);
    await testRenewalRejectionWhileApprovalValid(client);
    await testDuplicateApprovalRetry(client);
    await testDuplicateRejectionRetry(client);
    await testStaleExpectedVersion(client);
    await testApprovalVsLicenseExpiryBoundary(client);
    await testRenewalSubmissionVsSuspension(client);
    await testProviderTypeChangingBeforeApproval(client);
    await testRenewalRejectionVsSuspension(client);
    await testStaleSuspensionAfterRenewalPromotion(client);
    console.log('ALL CANDIDATE 0039 POST-0028 RENEWAL/CONCURRENCY RACE TESTS PASSED.');
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error('TEST FAILED:', error.message);
  process.exit(1);
});
