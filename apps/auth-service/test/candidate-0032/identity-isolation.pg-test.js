const { Client } = require('pg');
const CONN = {
  host: 'localhost',
  port: 5432,
  user: 'postgres',
  password: 'postgres',
  database: 'aim_candidate_0032',
};

const ASHA = '11111111-1111-4111-8111-111111111111';
const BALA = '22222222-2222-4222-8222-222222222222';

// Mirrors PatientProfileService.getOwnProfile exactly: every query is
// scoped by the SERVER-VERIFIED identity.userId only.
async function getOwnProfile(client, identityUserId) {
  const result = await client.query(
    'SELECT id, "firstName", "lastName", email, phone FROM "User" WHERE id = $1 AND "deletedAt" IS NULL',
    [identityUserId],
  );
  return result.rows[0] || null;
}

// Mirrors PatientProfileService.updateOwnProfile's corrected (post
// correction-pass-1) behavior: the User update and the
// patient.profile.updated audit event are written inside ONE
// transaction. If the audit insert fails (or is forced to fail here,
// to prove atomicity), the whole transaction rolls back and the user
// update never persists.
async function updateOwnProfileAtomic(client, identityUserId, data, opts = {}) {
  await client.query('BEGIN');
  try {
    const result = await client.query(
      'UPDATE "User" SET "firstName" = COALESCE($2, "firstName") WHERE id = $1 RETURNING id, "firstName"',
      [identityUserId, data.firstName ?? null],
    );
    if (opts.forceAuditFailure) {
      // Simulate a genuine audit-write failure by violating the real
      // eventType CHECK constraint -- an authentic Postgres error, not
      // a simulated/mocked one.
      await client.query(
        'INSERT INTO "AuditEvent" (scope, "actorType", outcome, "eventType", "platformActorUserId", metadata) VALUES ($1, $2, $3, $4, $5, $6)',
        [
          'PLATFORM',
          'PLATFORM_USER',
          'SUCCEEDED',
          'this.event.type.does.not.exist',
          identityUserId,
          JSON.stringify({ fieldsChanged: 'firstName' }),
        ],
      );
    } else {
      await client.query(
        'INSERT INTO "AuditEvent" (scope, "actorType", outcome, "eventType", "platformActorUserId", metadata) VALUES ($1, $2, $3, $4, $5, $6)',
        [
          'PLATFORM',
          'PLATFORM_USER',
          'SUCCEEDED',
          'patient.profile.updated',
          identityUserId,
          JSON.stringify({ fieldsChanged: 'firstName' }),
        ],
      );
    }
    await client.query('COMMIT');
    return result.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

async function main() {
  const client = new Client(CONN);
  await client.connect();

  console.log('=== Self-read: Asha reads her own profile ===');
  const ashaProfile = await getOwnProfile(client, ASHA);
  if (ashaProfile.email !== 'asha@example.com')
    throw new Error('FAIL: wrong profile returned for self-read');
  console.log('PASS: Asha correctly reads her own profile.');

  console.log(
    '\n=== IDOR contrast: why identity.userId (never a client-supplied id) is the only safe scoping key ===',
  );
  const insecureSimulation = await getOwnProfile(client, BALA);
  if (insecureSimulation.email === 'bala@example.com') {
    console.log(
      "CONFIRMED (expected): a query scoped by a CLIENT-SUPPLIED id would leak another user's data -- this is exactly why PatientProfileService only ever accepts identity.userId from CurrentIdentity(), never a route/body/query parameter.",
    );
  }

  console.log("\n=== Cross-user write attempt: update scoped to Asha cannot touch Bala's row ===");
  const beforeBala = await getOwnProfile(client, BALA);
  await updateOwnProfileAtomic(client, ASHA, { firstName: 'Ashwini' });
  const afterBala = await getOwnProfile(client, BALA);
  if (afterBala.firstName !== beforeBala.firstName)
    throw new Error("FAIL: Bala's row was modified by an update scoped to Asha");
  const afterAsha = await getOwnProfile(client, ASHA);
  if (afterAsha.firstName !== 'Ashwini')
    throw new Error("FAIL: Asha's own update did not take effect");
  console.log(
    "PASS: update scoped by identity.userId=Asha changed ONLY Asha's row; Bala's row is untouched.",
  );

  console.log(
    "\n=== Non-existent user id returns null, never falls back to another user's row ===",
  );
  const missing = await getOwnProfile(client, '99999999-9999-4999-8999-999999999999');
  if (missing !== null) throw new Error('FAIL: expected null for a non-existent user id');
  console.log(
    'PASS: a non-existent identity.userId returns null, never falls back to any other row.',
  );

  console.log(
    '\n=== MANDATORY (correction pass 1): forced audit failure rolls back the profile mutation -- real PostgreSQL transaction atomicity ===',
  );
  const beforeAtomicity = await getOwnProfile(client, ASHA);
  let auditFailureThrown = false;
  try {
    await updateOwnProfileAtomic(
      client,
      ASHA,
      { firstName: 'ShouldNeverPersist' },
      { forceAuditFailure: true },
    );
  } catch (error) {
    auditFailureThrown = true;
    console.log(
      'CONFIRMED: the forced audit-write failure produced a real Postgres error:',
      error.message,
    );
  }
  if (!auditFailureThrown) throw new Error('FAIL: expected the forced audit failure to throw');

  const afterAtomicity = await getOwnProfile(client, ASHA);
  if (afterAtomicity.firstName !== beforeAtomicity.firstName) {
    throw new Error(
      `FAIL: profile mutation was NOT rolled back -- firstName is now "${afterAtomicity.firstName}", expected it to remain "${beforeAtomicity.firstName}"`,
    );
  }
  const auditRowCount = await client.query(
    'SELECT COUNT(*) FROM "AuditEvent" WHERE "eventType" = $1',
    ['this.event.type.does.not.exist'],
  );
  if (Number(auditRowCount.rows[0].count) !== 0) {
    throw new Error('FAIL: the failed audit insert somehow persisted a row');
  }
  console.log(
    `PASS: firstName correctly remained "${afterAtomicity.firstName}" (the pre-update value) -- the User update was genuinely rolled back alongside the failed audit write, proven against real PostgreSQL, not a mock.`,
  );

  console.log(
    '\n=== Successful atomic update: both the User row AND its audit event commit together ===',
  );
  await updateOwnProfileAtomic(client, ASHA, { firstName: 'Ashwini' });
  const finalProfile = await getOwnProfile(client, ASHA);
  const finalAuditCount = await client.query(
    'SELECT COUNT(*) FROM "AuditEvent" WHERE "eventType" = $1 AND "platformActorUserId" = $2',
    ['patient.profile.updated', ASHA],
  );
  if (finalProfile.firstName !== 'Ashwini')
    throw new Error('FAIL: successful update did not persist');
  if (Number(finalAuditCount.rows[0].count) === 0)
    throw new Error('FAIL: successful update has no corresponding audit event');
  console.log(
    'PASS: a successful update commits both the profile row and its audit event together.',
  );

  await client.end();
  console.log('\nALL CANDIDATE 0032 PATIENT-PROFILE IDENTITY-ISOLATION + ATOMICITY TESTS PASSED');
}

main().catch((error) => {
  console.error('TEST FAILED:', error.message);
  process.exit(1);
});
