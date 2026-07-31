import type { Metadata } from 'next';

import { InventoryWorkspace } from '@/features/inventory/inventory-workspace';

export const metadata: Metadata = {
  title: 'Inventory | MedSphere',
  description: 'Medicine inventory operations workspace.',
};

export default function InventoryPage() {
  return <InventoryWorkspace />;
}
