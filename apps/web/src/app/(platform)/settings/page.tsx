import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { SettingsWorkspace } from '@/features/settings/settings-workspace';
import { translate } from '@/lib/i18n';
import { getServerLocale } from '@/lib/server-locale';
import { PROFILE_COOKIE, REFRESH_COOKIE, readSessionProfile } from '@/lib/session-profile';

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getServerLocale();
  return {
    title: translate(locale, 'meta.settings.title'),
    description: translate(locale, 'meta.settings.description'),
  };
}

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
