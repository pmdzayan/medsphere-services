import * as argon2 from 'argon2';
import { PasswordService } from './password.service';

jest.mock('argon2');

describe('PasswordService', () => {
  let service: PasswordService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new PasswordService();
  });

  describe('hash', () => {
    it('should hash a password', async () => {
      const password = 'test-password';
      const hashedPassword = 'hashed-value';

      (argon2.hash as jest.Mock).mockResolvedValue(hashedPassword);

      const result = await service.hash(password);

      expect(result).toBe(hashedPassword);
      expect(argon2.hash).toHaveBeenCalledWith(password);
    });
  });

  describe('verify', () => {
    it('should return true for a valid password', async () => {
      const hash = 'hashed-value';
      const password = 'test-password';

      (argon2.verify as jest.Mock).mockResolvedValue(true);

      const result = await service.verify(hash, password);

      expect(result).toBe(true);
      expect(argon2.verify).toHaveBeenCalledWith(hash, password);
    });

    it('should return false for an invalid password', async () => {
      const hash = 'hashed-value';
      const password = 'wrong-password';

      (argon2.verify as jest.Mock).mockResolvedValue(false);

      const result = await service.verify(hash, password);

      expect(result).toBe(false);
      expect(argon2.verify).toHaveBeenCalledWith(hash, password);
    });
  });
});
