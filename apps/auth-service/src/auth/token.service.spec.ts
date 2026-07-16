import { JwtService } from '@nestjs/jwt';
import { UnauthorizedException } from '@nestjs/common';
import { TokenService } from './token.service';

describe('TokenService', () => {
  let service: TokenService;
  let jwtService: jest.Mocked<JwtService>;

  beforeEach(() => {
    jest.clearAllMocks();
    jwtService = {
      sign: jest.fn(),
      verify: jest.fn(),
      decode: jest.fn(),
    } as unknown as jest.Mocked<JwtService>;

    service = new TokenService(jwtService);
  });

  describe('generateAccessToken', () => {
    it('should generate an access token', () => {
      const payload = { sub: 'user-id', email: 'test@example.com' };
      const token = 'access-token';

      jwtService.sign.mockReturnValue(token);

      const result = service.generateAccessToken(payload);

      expect(result).toBe(token);
      expect(jwtService.sign).toHaveBeenCalledWith(payload, {
        expiresIn: '15m',
      });
    });
  });

  describe('generateRefreshToken', () => {
    it('should generate a refresh token', () => {
      const payload = { sub: 'user-id', email: 'test@example.com' };
      const token = 'refresh-token';

      jwtService.sign.mockReturnValue(token);

      const result = service.generateRefreshToken(payload);

      expect(result).toBe(token);
      expect(jwtService.sign).toHaveBeenCalledWith(payload, {
        expiresIn: '7d',
      });
    });
  });

  describe('verifyAccessToken', () => {
    it('should return decoded payload for a valid token', () => {
      const token = 'valid-token';
      const decoded = { sub: 'user-id', email: 'test@example.com' };

      jwtService.verify.mockReturnValue(decoded);

      const result = service.verifyAccessToken(token);

      expect(result).toEqual(decoded);
      expect(jwtService.verify).toHaveBeenCalledWith(token);
    });

    it('should throw UnauthorizedException for an invalid token', () => {
      const token = 'invalid-token';

      jwtService.verify.mockImplementation(() => {
        throw new Error('Invalid token');
      });

      expect(() => service.verifyAccessToken(token)).toThrow(UnauthorizedException);
    });
  });

  describe('verifyRefreshToken', () => {
    it('should return decoded payload for a valid refresh token', () => {
      const token = 'valid-refresh-token';
      const decoded = { sub: 'user-id', email: 'test@example.com' };

      jwtService.verify.mockReturnValue(decoded);

      const result = service.verifyRefreshToken(token);

      expect(result).toEqual(decoded);
      expect(jwtService.verify).toHaveBeenCalledWith(token);
    });

    it('should throw UnauthorizedException for an invalid refresh token', () => {
      const token = 'invalid-refresh-token';

      jwtService.verify.mockImplementation(() => {
        throw new Error('Invalid token');
      });

      expect(() => service.verifyRefreshToken(token)).toThrow(UnauthorizedException);
    });
  });

  describe('decode', () => {
    it('should decode a token without verification', () => {
      const token = 'some-token';
      const decoded = { sub: 'user-id' };

      jwtService.decode.mockReturnValue(decoded);

      const result = service.decode(token);

      expect(result).toEqual(decoded);
      expect(jwtService.decode).toHaveBeenCalledWith(token);
    });
  });
});
