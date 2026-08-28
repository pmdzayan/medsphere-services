import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { SettingsWorkspace } from '@/features/settings/settings-workspace';
import { PROFILE_COOKIE, REFRESH_COOKIE, readSessionProfile } from '@/lib/session-profile';

export const metadata: Metadata = {
  title: 'Settings | MedSphere',
  description: 'Personal privacy and language settings.',
};

export default async function SettingsPage() {
  const cookieStore = await cookies();
  const refreshToken = cookieStore.get(REFRESH_COOKIE)?.value;
  const session = readSessionProfile(cookieStore.get(PROFILE_COOKIE)?.value, refreshToken);
  if (!session) redirect('/login?reason=session');

  return (
    <SettingsWorkspace
      identity={{
        name: `${session.user.firstName} ${session.user.lastName}`,
        email: session.user.email,
        tenantName: session.context.tenantName,
        tenantId: session.context.tenantId,
        membershipId: session.context.membershipId,
      }}
    />
  );
}
