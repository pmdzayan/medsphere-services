import type { Metadata } from 'next';
import { DashboardWorkspace } from '@/features/dashboard/dashboard-workspace';
import { translate } from '@/lib/i18n';
import { getServerLocale } from '@/lib/server-locale';

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getServerLocale();
  return { title: translate(locale, 'meta.dashboard.title') };
}

export default function DashboardPage() {
  return <DashboardWorkspace />;
}
