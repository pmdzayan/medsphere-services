import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { TeamAccessWorkspace } from '@/features/authorization/team-access-workspace';
import { translate } from '@/lib/i18n';
import { getServerLocale } from '@/lib/server-locale';
import { PROFILE_COOKIE, REFRESH_COOKIE, readSessionProfile } from '@/lib/session-profile';

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getServerLocale();
  return { title: translate(locale, 'meta.team.title') };
}

export default async function TeamAccessPage() {
  const cookieStore = await cookies();
  const refreshToken = cookieStore.get(REFRESH_COOKIE)?.value;
  const session = readSessionProfile(cookieStore.get(PROFILE_COOKIE)?.value, refreshToken);

  return <TeamAccessWorkspace currentMembershipId={session?.context.membershipId} />;
}
