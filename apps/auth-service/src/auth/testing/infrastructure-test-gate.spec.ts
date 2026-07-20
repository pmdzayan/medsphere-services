import { isInfrastructureTestEnabled, requireEnv } from './infrastructure-test-gate';

const FLAG = 'RUN_AUTH_INFRASTRUCTURE_TESTS';
const PRESENT_VARIABLE = 'MEDSPHERE_INFRA_GATE_PRESENT_TEST';
const MISSING_VARIABLE = 'MEDSPHERE_INFRA_GATE_MISSING_TEST';
const EMPTY_VARIABLE = 'MEDSPHERE_INFRA_GATE_EMPTY_TEST';
const WHITESPACE_VARIABLE = 'MEDSPHERE_INFRA_GATE_WHITESPACE_TEST';
const TOUCHED_VARIABLES = [
  FLAG,
  PRESENT_VARIABLE,
  MISSING_VARIABLE,
  EMPTY_VARIABLE,
  WHITESPACE_VARIABLE,
] as const;
const originalValues = new Map<string, string | undefined>();

beforeAll(() => {
  for (const key of TOUCHED_VARIABLES) {
    originalValues.set(key, process.env[key]);
  }
});

afterEach(() => {
  for (const [key, value] of originalValues) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
});

describe('isInfrastructureTestEnabled', () => {
  it('returns true when flag is exactly "true"', () => {
    process.env[FLAG] = 'true';
    expect(isInfrastructureTestEnabled()).toBe(true);
  });

  it('returns false when flag is missing', () => {
    delete process.env[FLAG];
    expect(isInfrastructureTestEnabled()).toBe(false);
  });

  it('returns false when flag is empty', () => {
    process.env[FLAG] = '';
    expect(isInfrastructureTestEnabled()).toBe(false);
  });

  it('returns false when flag is "false"', () => {
    process.env[FLAG] = 'false';
    expect(isInfrastructureTestEnabled()).toBe(false);
  });

  it('returns false when flag is "TRUE" (wrong case)', () => {
    process.env[FLAG] = 'TRUE';
    expect(isInfrastructureTestEnabled()).toBe(false);
  });

  it('returns false when flag is "1"', () => {
    process.env[FLAG] = '1';
    expect(isInfrastructureTestEnabled()).toBe(false);
  });
});

describe('requireEnv', () => {
  it('returns the variable value when present', () => {
    process.env[PRESENT_VARIABLE] = 'hello';
    expect(requireEnv(PRESENT_VARIABLE)).toBe('hello');
  });

  it('throws when the variable is missing', () => {
    delete process.env[MISSING_VARIABLE];
    expect(() => requireEnv(MISSING_VARIABLE)).toThrow(
      `Missing required environment variable: ${MISSING_VARIABLE}`,
    );
  });

  it('throws when the variable is empty', () => {
    process.env[EMPTY_VARIABLE] = '';
    expect(() => requireEnv(EMPTY_VARIABLE)).toThrow(
      `Missing required environment variable: ${EMPTY_VARIABLE}`,
    );
  });

  it('throws when the variable is whitespace only', () => {
    process.env[WHITESPACE_VARIABLE] = '   ';
    expect(() => requireEnv(WHITESPACE_VARIABLE)).toThrow(
      `Missing required environment variable: ${WHITESPACE_VARIABLE}`,
    );
  });
});
