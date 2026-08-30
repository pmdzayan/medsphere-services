import type { Metadata } from 'next';
import { TeamAccessWorkspace } from '@/features/authorization/team-access-workspace';
import { translate } from '@/lib/i18n';
import { getServerLocale } from '@/lib/server-locale';

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getServerLocale();
  return { title: translate(locale, 'meta.team.title') };
}

export default function TeamAccessPage() {
  return <TeamAccessWorkspace />;
}
