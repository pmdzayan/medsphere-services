import type { Metadata } from 'next';

import { InventoryImportWorkspace } from '@/features/inventory/inventory-import-workspace';
import { translate } from '@/lib/i18n';
import { getServerLocale } from '@/lib/server-locale';

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getServerLocale();
  return {
    title: translate(locale, 'inventory.import.title'),
    description: translate(locale, 'inventory.import.description'),
  };
}

export default function InventoryImportPage() {
  return <InventoryImportWorkspace />;
}
