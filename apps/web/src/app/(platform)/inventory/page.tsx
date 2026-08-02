import type { Metadata } from 'next';

import { InventoryWorkspace } from '@/features/inventory/inventory-workspace';
import { previewInventoryDataset } from '@/features/inventory/inventory-data';

export const metadata: Metadata = {
  title: 'Inventory | MedSphere',
  description: 'Medicine inventory operations workspace.',
};

export default function InventoryPage() {
  return <InventoryWorkspace dataset={previewInventoryDataset} />;
}
