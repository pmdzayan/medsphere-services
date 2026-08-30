import type { Metadata } from 'next';

import { InventoryWorkspace } from '@/features/inventory/inventory-workspace';
import { translate } from '@/lib/i18n';
import { getServerLocale } from '@/lib/server-locale';

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getServerLocale();
  return {
    title: translate(locale, 'meta.inventory.title'),
    description: translate(locale, 'meta.inventory.description'),
  };
}

export default function InventoryPage() {
  return <InventoryWorkspace />;
}
