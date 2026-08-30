import { cookies } from 'next/headers';
import { isLocale, isLocaleComplete, LOCALE_COOKIE, type Locale } from '@/lib/i18n';
import { PROFILE_COOKIE, REFRESH_COOKIE, readSessionProfile } from '@/lib/session-profile';

/** Resolve an authenticated profile locale first, then the signed-out locale cookie. */
export async function getServerLocalePreference(): Promise<Locale | null> {
  const cookieStore = await cookies();
  const refreshToken = cookieStore.get(REFRESH_COOKIE)?.value;
  const session = readSessionProfile(cookieStore.get(PROFILE_COOKIE)?.value, refreshToken);
  const candidate = session?.user.preferredLanguage ?? cookieStore.get(LOCALE_COOKIE)?.value;
  if (candidate && isLocale(candidate) && isLocaleComplete(candidate)) return candidate;

  // A known-but-incomplete authenticated preference must fail closed to
  // English rather than allowing a stale browser value to override the
  // verified profile. With no preference at all, null lets the client use
  // local storage or the browser language on a true first visit.
  if (session?.user.preferredLanguage) return 'en';
  return null;
}

/** Locale for server-rendered copy, whose final fallback is always English. */
export async function getServerLocale(): Promise<Locale> {
  return (await getServerLocalePreference()) ?? 'en';
}
