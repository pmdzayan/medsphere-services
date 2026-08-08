import { UnauthorizedException } from '@nestjs/common';

export type UserType = 'PLATFORM_USER' | 'TENANT_USER';

export interface BaseAuthenticatedIdentity {
  readonly userId: string;
  readonly email: string;
  readonly userType: UserType;
  readonly sessionVersion: number;
}

export interface AuthenticatedTenantIdentity extends BaseAuthenticatedIdentity {
  readonly userType: 'TENANT_USER';
  readonly tenantId: string;
  readonly membershipId: string;
}

export interface AuthenticatedPlatformIdentity extends BaseAuthenticatedIdentity {
  readonly userType: 'PLATFORM_USER';
  readonly tenantId?: undefined;
  readonly membershipId?: undefined;
}

export type AuthenticatedIdentity = AuthenticatedTenantIdentity | AuthenticatedPlatformIdentity;

export function isTenantIdentity(
  identity: AuthenticatedIdentity,
): identity is AuthenticatedTenantIdentity {
  return identity.userType === 'TENANT_USER';
}

export function requireTenantId(identity: AuthenticatedIdentity): string {
  if (!isTenantIdentity(identity) || !identity.tenantId) {
    throw new UnauthorizedException('Tenant context required');
  }
  return identity.tenantId;
}
