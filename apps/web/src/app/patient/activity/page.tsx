import type { Metadata } from 'next';
import { ActivityCenterWorkspace } from '@/features/activity-center/activity-center-workspace';
import { translate } from '@/lib/i18n';
import { getServerLocale } from '@/lib/server-locale';

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getServerLocale();
  return { title: translate(locale, 'activityCenter.title') };
}

export default function ActivityCenterPage() {
  return <ActivityCenterWorkspace />;
}
