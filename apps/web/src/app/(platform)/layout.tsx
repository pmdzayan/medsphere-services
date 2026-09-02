import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { AppShell } from '@/components/platform/app-shell';
import { PlatformLanguageDock } from '@/components/platform/language-dock';
import { PROFILE_COOKIE, REFRESH_COOKIE, readSessionProfile } from '@/lib/session-profile';
import { readServerWorkstationSessionState } from '@/lib/server-workstation-session';

export default async function PlatformLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const cookieStore = await cookies();
  const refreshToken = cookieStore.get(REFRESH_COOKIE)?.value;
  const profile = readSessionProfile(cookieStore.get(PROFILE_COOKIE)?.value, refreshToken);
  if (!profile || !refreshToken) {
    redirect('/login?reason=session');
  }

  const workstationState = await readServerWorkstationSessionState(refreshToken);
  if (!workstationState) {
    redirect('/login?reason=session');
  }

  return (
    <>
      <AppShell session={profile} initialWorkstationState={workstationState}>
        {children}
      </AppShell>
      <PlatformLanguageDock />
    </>
  );
}
