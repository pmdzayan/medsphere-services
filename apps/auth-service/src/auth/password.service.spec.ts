import * as argon2 from 'argon2';
import { AuthConfigService } from './auth-config.service';
import { PasswordService } from './password.service';

jest.mock('argon2');

describe('PasswordService', () => {
  const service = new PasswordService({
    value: {
      argon2MemoryKiB: 19456,
      argon2TimeCost: 2,
      argon2Parallelism: 1,
    },
  } as unknown as AuthConfigService);

  beforeEach(() => jest.clearAllMocks());

  it('hashes with explicit Argon2id parameters', async () => {
    (argon2.hash as jest.Mock).mockResolvedValue('hash');

    await expect(service.hash('a secure passphrase')).resolves.toBe('hash');
    expect(argon2.hash).toHaveBeenCalledWith(
      'a secure passphrase',
      expect.objectContaining({
        type: argon2.argon2id,
        memoryCost: 19456,
        timeCost: 2,
        parallelism: 1,
      }),
    );
  });

  it('verifies passwords without transforming them', async () => {
    (argon2.verify as jest.Mock).mockResolvedValue(true);
    await expect(service.verify('hash', ' Unicode passphrase ')).resolves.toBe(true);
    expect(argon2.verify).toHaveBeenCalledWith('hash', ' Unicode passphrase ');
  });

  it('reports when a stored hash needs parameter migration', () => {
    (argon2.needsRehash as jest.Mock).mockReturnValue(true);
    expect(service.needsRehash('old-hash')).toBe(true);
    expect(argon2.needsRehash).toHaveBeenCalledWith('old-hash', expect.any(Object));
  });

  it('performs a dummy verification after module initialization', async () => {
    (argon2.hash as jest.Mock).mockResolvedValue('dummy-hash');
    (argon2.verify as jest.Mock).mockResolvedValue(false);
    await service.onModuleInit();

    await expect(service.verifyAgainstDummy('unknown password')).resolves.toBeUndefined();
    expect(argon2.verify).toHaveBeenCalledWith('dummy-hash', 'unknown password');
  });
});
