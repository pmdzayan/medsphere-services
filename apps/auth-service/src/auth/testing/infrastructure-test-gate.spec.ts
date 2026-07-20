import { isInfrastructureTestEnabled, requireEnv } from './infrastructure-test-gate';

const FLAG = 'RUN_AUTH_INFRASTRUCTURE_TESTS';

describe('isInfrastructureTestEnabled', () => {
  const originalEnv: NodeJS.ProcessEnv = {};

  beforeAll(() => {
    Object.assign(originalEnv, process.env);
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

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
  const originalEnv: NodeJS.ProcessEnv = {};

  beforeAll(() => {
    Object.assign(originalEnv, process.env);
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('returns the variable value when present', () => {
    process.env['TEST_VAR'] = 'hello';
    expect(requireEnv('TEST_VAR')).toBe('hello');
  });

  it('throws when the variable is missing', () => {
    delete process.env['MISSING_VAR'];
    expect(() => requireEnv('MISSING_VAR')).toThrow(
      'Missing required environment variable: MISSING_VAR',
    );
  });

  it('throws when the variable is empty', () => {
    process.env['EMPTY_VAR'] = '';
    expect(() => requireEnv('EMPTY_VAR')).toThrow(
      'Missing required environment variable: EMPTY_VAR',
    );
  });

  it('throws when the variable is whitespace only', () => {
    process.env['WS_VAR'] = '   ';
    expect(() => requireEnv('WS_VAR')).toThrow('Missing required environment variable: WS_VAR');
  });

  it('restores environment after test', () => {
    expect(process.env['TEST_VAR']).toBeUndefined();
  });
});
