#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = path.resolve(SCRIPT_DIR, '..');
const POLICY_PATH = 'docs/architecture/blue-green-environment-role-policy.json';
const EXAMPLE_STATE_PATH = 'docs/architecture/blue-green-environment-state.example.json';

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function readRequired(repositoryRoot, relativePath) {
  const absolute = path.join(repositoryRoot, relativePath);
  if (!fs.existsSync(absolute)) throw new Error(`Required UM14.1 file missing: ${relativePath}`);
  return fs.readFileSync(absolute, 'utf8');
}

function rejectUnknownKeys(value, allowed, label, failures) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return;
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) failures.push(`${label} contains unsupported field: ${key}`);
  }
}

function regex(pattern, label) {
  try {
    return new RegExp(pattern);
  } catch (error) {
    throw new Error(`UM14.1 invalid ${label} regex: ${error.message}`);
  }
}

export function validatePolicy(policy) {
  if (!policy || typeof policy !== 'object' || Array.isArray(policy)) {
    throw new Error('UM14.1 policy must be an object');
  }
  if (policy.schemaVersion !== 1 || policy.task !== 'UM14.1') {
    throw new Error('UM14.1 policy identity is invalid');
  }
  if (policy.principle !== 'roles-not-colors-single-write-authority') {
    throw new Error('UM14.1 policy principle changed');
  }
  if (
    !Array.isArray(policy.physicalEnvironments) ||
    policy.physicalEnvironments.length !== 2 ||
    new Set(policy.physicalEnvironments).size !== 2 ||
    !policy.physicalEnvironments.includes('BLUE') ||
    !policy.physicalEnvironments.includes('GREEN')
  ) {
    throw new Error('UM14.1 requires exactly the BLUE and GREEN physical environments');
  }
  const requiredRoles = ['ACTIVE', 'CANDIDATE', 'ROLLBACK'];
  if (
    !Array.isArray(policy.roles) ||
    requiredRoles.some((role) => !policy.roles.includes(role)) ||
    new Set(policy.roles).size !== requiredRoles.length
  ) {
    throw new Error('UM14.1 role catalogue must be ACTIVE/CANDIDATE/ROLLBACK only');
  }
  const constraints = policy.constraints ?? {};
  if (
    constraints.exactActiveCount !== 1 ||
    constraints.maxCandidateCount !== 1 ||
    constraints.maxRollbackCount !== 1 ||
    constraints.activeWriteAuthorityOnly !== true ||
    constraints.candidateRequiresActiveSyncEvidence !== true ||
    constraints.directRollbackToActiveForbidden !== true ||
    constraints.colorsArePermanentRoles !== false
  ) {
    throw new Error('UM14.1 fail-closed role constraints are incomplete');
  }
  regex(policy.identifiers?.releaseShaPattern, 'releaseShaPattern');
  regex(policy.identifiers?.databaseIdentityPattern, 'databaseIdentityPattern');
  regex(policy.identifiers?.evidenceRefPattern, 'evidenceRefPattern');
}

export function loadPolicy(repositoryRoot = DEFAULT_ROOT) {
  const policy = JSON.parse(readRequired(repositoryRoot, POLICY_PATH));
  validatePolicy(policy);
  return policy;
}

function validateIdentifier(value, pattern, label, failures) {
  if (typeof value !== 'string' || !regex(pattern, label).test(value)) {
    failures.push(`${label} is missing or invalid`);
  }
}

export function validateState(state, policy) {
  const failures = [];
  try {
    validatePolicy(policy);
  } catch (error) {
    return [error.message];
  }

  rejectUnknownKeys(
    state,
    ['schemaVersion', 'generation', 'writeAuthority', 'environments'],
    'state',
    failures,
  );
  if (state?.schemaVersion !== 1) failures.push('state schemaVersion must be 1');
  if (!Number.isInteger(state?.generation) || state.generation < 1) {
    failures.push('state generation must be a positive integer');
  }
  if (!Array.isArray(state?.environments) || state.environments.length !== 2) {
    failures.push('state must contain exactly two environments');
    return failures;
  }

  const allowedNames = new Set(policy.physicalEnvironments);
  const allowedRoles = new Set(policy.roles);
  const seenNames = new Set();
  const seenDatabaseIdentities = new Set();

  for (const environment of state.environments) {
    rejectUnknownKeys(
      environment,
      ['name', 'role', 'releaseSha', 'databaseIdentity', 'synchronizedFrom'],
      `environment:${environment?.name ?? '<unknown>'}`,
      failures,
    );
    if (!allowedNames.has(environment?.name)) {
      failures.push(`unsupported physical environment: ${environment?.name ?? '<missing>'}`);
    } else if (seenNames.has(environment.name)) {
      failures.push(`duplicate physical environment: ${environment.name}`);
    } else {
      seenNames.add(environment.name);
    }
    if (!allowedRoles.has(environment?.role)) {
      failures.push(`unsupported role for ${environment?.name ?? '<unknown>'}`);
    }
    validateIdentifier(
      environment?.releaseSha,
      policy.identifiers.releaseShaPattern,
      `${environment?.name ?? 'environment'}.releaseSha`,
      failures,
    );
    validateIdentifier(
      environment?.databaseIdentity,
      policy.identifiers.databaseIdentityPattern,
      `${environment?.name ?? 'environment'}.databaseIdentity`,
      failures,
    );
    if (environment?.databaseIdentity && seenDatabaseIdentities.has(environment.databaseIdentity)) {
      failures.push('BLUE and GREEN must not share the same databaseIdentity');
    }
    if (environment?.databaseIdentity) seenDatabaseIdentities.add(environment.databaseIdentity);
  }

  if (seenNames.size !== policy.physicalEnvironments.length) {
    failures.push('state must contain BLUE and GREEN exactly once');
  }

  const active = state.environments.filter((environment) => environment.role === 'ACTIVE');
  const candidate = state.environments.filter((environment) => environment.role === 'CANDIDATE');
  const rollback = state.environments.filter((environment) => environment.role === 'ROLLBACK');

  if (active.length !== policy.constraints.exactActiveCount) {
    failures.push('exactly one environment must be ACTIVE');
  }
  if (candidate.length > policy.constraints.maxCandidateCount) {
    failures.push('at most one environment may be CANDIDATE');
  }
  if (rollback.length > policy.constraints.maxRollbackCount) {
    failures.push('at most one environment may be ROLLBACK');
  }

  if (active.length === 1 && state.writeAuthority !== active[0].name) {
    failures.push('writeAuthority must belong only to the ACTIVE environment');
  }

  for (const environment of state.environments) {
    if (environment.role !== 'CANDIDATE' && environment.synchronizedFrom !== undefined) {
      failures.push(`${environment.name}.synchronizedFrom is allowed only for CANDIDATE`);
      continue;
    }
    if (environment.role !== 'CANDIDATE') continue;

    const sync = environment.synchronizedFrom;
    rejectUnknownKeys(sync, ['environment', 'releaseSha', 'evidenceRef'], `${environment.name}.synchronizedFrom`, failures);
    if (!sync || active.length !== 1) {
      failures.push(`${environment.name} CANDIDATE requires synchronizedFrom evidence`);
      continue;
    }
    if (sync.environment !== active[0].name || sync.releaseSha !== active[0].releaseSha) {
      failures.push(`${environment.name} CANDIDATE must be synchronized from the current ACTIVE release`);
    }
    validateIdentifier(
      sync.evidenceRef,
      policy.identifiers.evidenceRefPattern,
      `${environment.name}.synchronizedFrom.evidenceRef`,
      failures,
    );
  }

  return failures;
}

function byName(state, name) {
  return state.environments.find((environment) => environment.name === name);
}

export function validateTransition(previous, next, policy) {
  const failures = [
    ...validateState(previous, policy).map((failure) => `previous: ${failure}`),
    ...validateState(next, policy).map((failure) => `next: ${failure}`),
  ];
  if (failures.length > 0) return failures;

  if (next.generation !== previous.generation + 1) {
    failures.push('generation must increment by exactly one');
  }

  for (const name of policy.physicalEnvironments) {
    if (byName(previous, name).databaseIdentity !== byName(next, name).databaseIdentity) {
      failures.push(`${name} databaseIdentity cannot change during a role transition`);
    }
  }

  const previousActive = previous.environments.find((environment) => environment.role === 'ACTIVE');
  const nextActive = next.environments.find((environment) => environment.role === 'ACTIVE');

  if (previousActive.name === nextActive.name) {
    if (previousActive.releaseSha !== nextActive.releaseSha) {
      failures.push('ACTIVE release cannot change while preparing the inactive environment');
    }
    const inactiveName = policy.physicalEnvironments.find((name) => name !== previousActive.name);
    const previousInactive = byName(previous, inactiveName);
    const nextInactive = byName(next, inactiveName);
    if (previousInactive.role !== 'ROLLBACK' || nextInactive.role !== 'CANDIDATE') {
      failures.push('candidate preparation must transition the inactive environment from ROLLBACK to CANDIDATE');
    }
    if (
      nextInactive.synchronizedFrom?.environment !== previousActive.name ||
      nextInactive.synchronizedFrom?.releaseSha !== previousActive.releaseSha
    ) {
      failures.push('candidate preparation must prove synchronization from the current ACTIVE release');
    }
    return failures;
  }

  const promoted = byName(previous, nextActive.name);
  const formerActiveNext = byName(next, previousActive.name);
  if (promoted.role !== 'CANDIDATE') {
    failures.push('only a CANDIDATE may become ACTIVE');
  }
  if (nextActive.releaseSha !== promoted.releaseSha) {
    failures.push('promotion cannot change the candidate release identity');
  }
  if (formerActiveNext.role !== 'ROLLBACK') {
    failures.push('the previous ACTIVE environment must become ROLLBACK after promotion');
  }
  if (formerActiveNext.releaseSha !== previousActive.releaseSha) {
    failures.push('rollback environment must preserve the previous ACTIVE release identity');
  }
  if (next.writeAuthority !== nextActive.name) {
    failures.push('writeAuthority must move atomically with ACTIVE promotion');
  }
  return failures;
}

export function checkRepositoryBoundary(repositoryRoot = DEFAULT_ROOT) {
  const failures = [];
  const policy = loadPolicy(repositoryRoot);
  const requiredFiles = [
    POLICY_PATH,
    EXAMPLE_STATE_PATH,
    'scripts/blue-green-environment-role-model.mjs',
    'scripts/blue-green-environment-role-model.spec.mjs',
    'docs/adr/0033-blue-green-environment-role-model.md',
    'docs/operations/um14-1-blue-green-environment-role-model.md',
    'docs/sprints/UM14.1-blue-green-environment-role-model.md',
  ];
  for (const file of requiredFiles) readRequired(repositoryRoot, file);

  const packageJson = JSON.parse(readRequired(repositoryRoot, 'package.json'));
  if (
    !String(packageJson.scripts?.['test:blue-green-role-model'] ?? '').includes(
      'blue-green-environment-role-model',
    )
  ) {
    failures.push('package.json is missing the focused UM14.1 role-model test command');
  }
  const architecture = String(packageJson.scripts?.['test:architecture'] ?? '');
  if (
    !architecture.includes('blue-green-environment-role-model.spec.mjs') ||
    !architecture.includes('blue-green-environment-role-model.mjs boundary')
  ) {
    failures.push('UM14.1 is not included in the mandatory architecture quality gate');
  }

  const rules = readRequired(repositoryRoot, 'PROJECT_RULES.md');
  if (!rules.includes('## 15. Blue/green release environment governance')) {
    failures.push('PROJECT_RULES.md is missing the binding UM14.1 governance section');
  }
  const roadmap = readRequired(repositoryRoot, 'PRODUCT_ROADMAP.md');
  if (!roadmap.includes('UM14.1 Blue/Green Environment & Role Model')) {
    failures.push('PRODUCT_ROADMAP.md is missing the UM14.1 blue/green task');
  }

  const example = JSON.parse(readRequired(repositoryRoot, EXAMPLE_STATE_PATH));
  failures.push(...validateState(example, policy).map((failure) => `example state: ${failure}`));
  return failures;
}

function run(repositoryRoot = DEFAULT_ROOT, argv = process.argv.slice(2)) {
  const [mode = 'boundary', first, second] = argv;
  const policy = loadPolicy(repositoryRoot);
  let failures = [];

  if (mode === 'boundary') {
    failures = checkRepositoryBoundary(repositoryRoot);
  } else if (mode === 'state' && first) {
    failures = validateState(readJson(first), policy);
  } else if (mode === 'transition' && first && second) {
    failures = validateTransition(readJson(first), readJson(second), policy);
  } else {
    process.stderr.write('Usage: blue-green-environment-role-model.mjs boundary|state <file>|transition <before> <after>\n');
    return 2;
  }

  if (failures.length === 0) {
    process.stdout.write(`UM14.1 BLUE/GREEN ROLE MODEL: PASS (${mode})\n`);
    return 0;
  }
  for (const failure of failures) process.stderr.write(`${failure}\n`);
  process.stderr.write(`UM14.1 BLUE/GREEN ROLE MODEL: FAIL (${failures.length} violation(s))\n`);
  return 1;
}

const invoked = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (invoked === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = run();
  } catch (error) {
    process.stderr.write(`UM14.1 BLUE/GREEN ROLE MODEL: ERROR: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
