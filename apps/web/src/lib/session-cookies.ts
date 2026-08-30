import type { NextResponse } from 'next/server';
import type { TokenResponse } from './auth-contract';
import {
  ACCESS_COOKIE,
  PROFILE_COOKIE,
  REFRESH_COOKIE,
  sealSessionProfile,
  type SessionProfile,
} from './session-profile';

export function setSessionCookies(
  response: NextResponse,
  credentials: TokenResponse,
  profile: SessionProfile,
): void {
  const secure = process.env.NODE_ENV === 'production';
  response.cookies.set(ACCESS_COOKIE, credentials.accessToken, {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/',
    maxAge: credentials.expiresIn,
  });
  response.cookies.set(REFRESH_COOKIE, credentials.refreshToken, {
    httpOnly: true,
    secure,
    sameSite: 'strict',
    path: '/',
  });
  setSessionProfileCookie(response, profile, credentials.refreshToken);
}

export function setSessionProfileCookie(
  response: NextResponse,
  profile: SessionProfile,
  integrityKey: string,
): void {
  response.cookies.set(PROFILE_COOKIE, sealSessionProfile(profile, integrityKey), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
  });
}

export function clearSessionProfileCookie(response: NextResponse): void {
  response.cookies.set(PROFILE_COOKIE, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
}

export function clearSessionCookies(response: NextResponse): void {
  for (const cookie of [ACCESS_COOKIE, REFRESH_COOKIE, PROFILE_COOKIE]) {
    response.cookies.set(cookie, '', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/',
      maxAge: 0,
    });
  }
}
