export const ACCESS_TOKEN_TYPE = 'at+jwt';
export const ACCESS_TOKEN_USE = 'access';

export interface AccessTokenIdentity {
  readonly userId: string;
  readonly membershipId: string;
  readonly tenantId: string;
  readonly sessionId: string;
}

export interface AccessTokenClaims {
  readonly sub: string;
  readonly mid: string;
  readonly tid: string;
  readonly sid: string;
  readonly jti: string;
  readonly tokenUse: typeof ACCESS_TOKEN_USE;
  readonly iss?: string;
  readonly aud?: string | string[];
  readonly iat?: number;
  readonly exp?: number;
}

export interface AuthenticatedIdentity extends AccessTokenIdentity {
  readonly tokenId: string;
}

export interface RefreshCredentialParts {
  readonly sessionId: string;
  readonly verifier: string;
}

export interface IssuedRefreshCredential {
  readonly value: string;
  readonly hash: string;
  readonly sessionId: string;
}

export interface IssuedAccessToken {
  readonly value: string;
  readonly expiresIn: number;
  readonly tokenId: string;
}

export interface RequestMetadata {
  readonly ipAddress?: string;
  readonly userAgent?: string;
  readonly deviceName?: string;
  readonly requestId?: string;
}

export interface LoginIdentity {
  readonly user: {
    readonly id: string;
    readonly email: string;
    readonly passwordHash: string | null;
    readonly firstName: string;
    readonly lastName: string;
    readonly preferredLanguage: string;
  };
  readonly membershipId: string;
  readonly tenantId: string;
  readonly tenant: {
    readonly name: string;
    readonly organizationType: string;
  };
}
