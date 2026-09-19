import type { Metadata } from 'next';
import { InventoryAnalyticsWorkspace } from '@/features/inventory/inventory-analytics-workspace';
import { translate } from '@/lib/i18n';
import { getServerLocale } from '@/lib/server-locale';

/**
 * Candidate Task 0038 (PROVISIONAL). Reuses the accepted (platform)
 * staff shell/layout -- no new application shell or layout.tsx was
 * created for this candidate.
 */
export async function generateMetadata(): Promise<Metadata> {
  const locale = await getServerLocale();
  return { title: translate(locale, 'meta.inventoryAnalytics.title') };
}

export default function InventoryAnalyticsPage() {
  return <InventoryAnalyticsWorkspace />;
}
