import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { PROFILE_COOKIE, REFRESH_COOKIE, readSessionProfile } from '@/lib/session-profile';

/**
 * Candidate Task 0032 (pre-0031): a deliberately minimal patient-facing
 * layout -- reuses the same session-cookie verification as the
 * existing (platform) layout, but does NOT render AppShell (the
 * organization-operations chrome: inventory/team/audit navigation).
 * This is the "not an enterprise/admin appearance" requirement.
 *
 * Known integration point: this duplicates the (platform) layout's
 * session-check lines rather than sharing a common helper. Left
 * exactly this way, and flagged here, so the eventual shared
 * "requireAuthenticatedSession()" extraction (if one doesn't already
 * exist by the time 0019-0031 land) is an intentional, visible
 * decision rather than something a reconciler has to rediscover.
 */
export default async function PatientLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const cookieStore = await cookies();
  const refreshToken = cookieStore.get(REFRESH_COOKIE)?.value;
  const profile = readSessionProfile(cookieStore.get(PROFILE_COOKIE)?.value, refreshToken);
  if (!profile || !refreshToken) {
    redirect('/login?reason=session');
  }

  return <div className="min-h-screen bg-[#f7f6f0]">{children}</div>;
}
