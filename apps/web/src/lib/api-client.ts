import type { AuthenticatedSession, LoginRequest } from './auth-contract';

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
