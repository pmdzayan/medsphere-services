import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { AppShell } from '@/components/platform/app-shell';
import { PlatformLanguageDock } from '@/components/platform/language-dock';
import { PROFILE_COOKIE, REFRESH_COOKIE, readSessionProfile } from '@/lib/session-profile';

export default async function PlatformLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const cookieStore = await cookies();
  const refreshToken = cookieStore.get(REFRESH_COOKIE)?.value;
  const profile = readSessionProfile(cookieStore.get(PROFILE_COOKIE)?.value, refreshToken);
  if (!profile) {
    redirect('/login?reason=session');
  }
  return (
    <>
      <AppShell session={profile}>{children}</AppShell>
      <PlatformLanguageDock />
    </>
  );
}
