import type { AuthenticatedSession, LoginRequest } from './auth-contract';
import type { AuthorizationCatalogue, CreateRoleRequest, Role } from './authorization-contract';

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function login(request: LoginRequest): Promise<AuthenticatedSession> {
  const response = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(request),
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new ApiError(
      response.status === 401
        ? 'The organization, email, or password is incorrect.'
        : 'Sign-in failed. Try again.',
      response.status,
    );
  }

  return (await response.json()) as AuthenticatedSession;
}

export async function getAuthorizationCatalogue(): Promise<AuthorizationCatalogue> {
  return requestJson<AuthorizationCatalogue>('/api/authorization/catalogue');
}

export async function createRole(request: CreateRoleRequest): Promise<Role> {
  return requestJson<Role>('/api/authorization/roles', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(request),
  });
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  let response = await fetch(url, { ...init, cache: 'no-store' });
  if (response.status === 401) {
    const refreshed = await fetch('/api/auth/refresh', {
      method: 'POST',
      cache: 'no-store',
    });
    if (refreshed.ok) {
      response = await fetch(url, { ...init, cache: 'no-store' });
    }
  }
  if (!response.ok) {
    let message = 'Request failed. Try again.';
    try {
      const payload: unknown = await response.json();
      if (payload && typeof payload === 'object') {
        const candidate = payload as { message?: unknown };
        if (typeof candidate.message === 'string' && candidate.message.length > 0) {
          message = candidate.message.slice(0, 240);
        }
      }
    } catch {
      // Preserve the bounded public fallback.
    }
    throw new ApiError(message, response.status);
  }
  return (await response.json()) as T;
}
