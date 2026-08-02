export type InventoryStatus = 'healthy' | 'low' | 'expiring' | 'out';

export type InventoryItem = {
  id: string;
  product: string;
  genericName: string;
  category: string;
  sku: string;
  batch: string;
  location: string;
  expiry: string;
  onHand: number;
  held: number;
  available: number;
  reorderAt: number;
  unitPrice: number;
  status: InventoryStatus;
};

export type InventoryDataset = {
  source: 'preview';
  label: string;
  disclosure: string;
  items: readonly InventoryItem[];
};

export type InventorySummary = {
  inventoryValue: number;
  productCount: number;
  availableUnits: number;
  lowCount: number;
  expiringCount: number;
  outCount: number;
};

const previewItems: InventoryItem[] = [
  {
    id: 'inv-001',
    product: 'Metformin 500 mg',
    genericName: 'Metformin Hydrochloride',
    category: 'Diabetes',
    sku: 'MED-MTF-500',
    batch: 'MTF-24018',
    location: 'Rack A-04',
    expiry: '18 Aug 2026',
    onHand: 24,
    held: 6,
    available: 18,
    reorderAt: 80,
    unitPrice: 1.82,
    status: 'low',
  },
  {
    id: 'inv-002',
    product: 'Amoxicillin 250 mg',
    genericName: 'Amoxicillin Trihydrate',
    category: 'Antibiotics',
    sku: 'MED-AMX-250',
    batch: 'AMX-25041',
    location: 'Rack B-11',
    expiry: '03 Mar 2027',
    onHand: 48,
    held: 6,
    available: 42,
    reorderAt: 60,
    unitPrice: 4.25,
    status: 'low',
  },
  {
    id: 'inv-003',
    product: 'Insulin Glargine',
    genericName: 'Insulin Glargine',
    category: 'Diabetes',
    sku: 'MED-IGL-003',
    batch: 'IGL-25009',
    location: 'Cold C-02',
    expiry: '22 Sep 2026',
    onHand: 18,
    held: 6,
    available: 12,
    reorderAt: 15,
    unitPrice: 642,
    status: 'expiring',
  },
  {
    id: 'inv-004',
    product: 'Atorvastatin 20 mg',
    genericName: 'Atorvastatin Calcium',
    category: 'Cardiac',
    sku: 'MED-ATV-020',
    batch: 'ATV-24112',
    location: 'Rack D-07',
    expiry: '11 Dec 2027',
    onHand: 74,
    held: 13,
    available: 61,
    reorderAt: 50,
    unitPrice: 7.48,
    status: 'healthy',
  },
  {
    id: 'inv-005',
    product: 'Paracetamol 650 mg',
    genericName: 'Paracetamol',
    category: 'Analgesics',
    sku: 'MED-PCM-650',
    batch: 'PCM-25184',
    location: 'Rack A-01',
    expiry: '14 Feb 2028',
    onHand: 612,
    held: 38,
    available: 574,
    reorderAt: 140,
    unitPrice: 2.1,
    status: 'healthy',
  },
  {
    id: 'inv-006',
    product: 'Salbutamol Inhaler',
    genericName: 'Salbutamol Sulphate',
    category: 'Respiratory',
    sku: 'MED-SAL-100',
    batch: 'SAL-24071',
    location: 'Rack E-03',
    expiry: '09 Aug 2026',
    onHand: 9,
    held: 2,
    available: 7,
    reorderAt: 20,
    unitPrice: 168,
    status: 'expiring',
  },
  {
    id: 'inv-007',
    product: 'Azithromycin 500 mg',
    genericName: 'Azithromycin Dihydrate',
    category: 'Antibiotics',
    sku: 'MED-AZM-500',
    batch: 'AZM-25022',
    location: 'Rack B-08',
    expiry: '27 Nov 2027',
    onHand: 0,
    held: 0,
    available: 0,
    reorderAt: 30,
    unitPrice: 22.3,
    status: 'out',
  },
  {
    id: 'inv-008',
    product: 'Pantoprazole 40 mg',
    genericName: 'Pantoprazole Sodium',
    category: 'Gastrointestinal',
    sku: 'MED-PAN-040',
    batch: 'PAN-25107',
    location: 'Rack C-05',
    expiry: '19 Jun 2028',
    onHand: 226,
    held: 14,
    available: 212,
    reorderAt: 60,
    unitPrice: 5.6,
    status: 'healthy',
  },
];

export const previewInventoryDataset: InventoryDataset = createPreviewInventoryDataset({
  label: 'Sanitised preview',
  disclosure:
    'Interface-validation data only. It is not tenant stock and cannot be used for operational decisions.',
  items: previewItems,
});

export type InventoryFilters = {
  query: string;
  status: 'all' | InventoryStatus;
  category: string;
};

export function filterInventoryItems(items: readonly InventoryItem[], filters: InventoryFilters) {
  const query = filters.query.trim().toLocaleLowerCase();

  return items.filter((item) => {
    const matchesQuery =
      query.length === 0 ||
      [item.product, item.genericName, item.sku, item.batch].some((value) =>
        value.toLocaleLowerCase().includes(query),
      );
    const matchesStatus = filters.status === 'all' || item.status === filters.status;
    const matchesCategory = filters.category === 'all' || item.category === filters.category;

    return matchesQuery && matchesStatus && matchesCategory;
  });
}

export function summarizeInventory(items: readonly InventoryItem[]): InventorySummary {
  const summary = items.reduce<Omit<InventorySummary, 'productCount'>>(
    (summary, item) => ({
      inventoryValue: summary.inventoryValue + item.available * item.unitPrice,
      availableUnits: summary.availableUnits + item.available,
      lowCount: summary.lowCount + Number(item.status === 'low'),
      expiringCount: summary.expiringCount + Number(item.status === 'expiring'),
      outCount: summary.outCount + Number(item.status === 'out'),
    }),
    {
      inventoryValue: 0,
      availableUnits: 0,
      lowCount: 0,
      expiringCount: 0,
      outCount: 0,
    },
  );
  return {
    ...summary,
    productCount: new Set(items.map((item) => item.sku)).size,
  };
}

export function createPreviewInventoryDataset(
  dataset: Omit<InventoryDataset, 'source'>,
): InventoryDataset {
  if (!dataset.label.trim() || !dataset.disclosure.trim()) {
    throw new Error('Invalid inventory preview dataset.');
  }
  const ids = new Set<string>();
  const batches = new Set<string>();
  for (const item of dataset.items) {
    if (
      !item.id ||
      !item.sku ||
      !item.batch ||
      !Number.isSafeInteger(item.onHand) ||
      !Number.isSafeInteger(item.held) ||
      !Number.isSafeInteger(item.available) ||
      item.onHand < 0 ||
      item.held < 0 ||
      item.held > item.onHand ||
      item.available !== item.onHand - item.held ||
      !Number.isFinite(item.unitPrice) ||
      item.unitPrice < 0 ||
      ids.has(item.id) ||
      batches.has(`${item.sku}:${item.batch}`)
    ) {
      throw new Error('Invalid inventory preview dataset.');
    }
    ids.add(item.id);
    batches.add(`${item.sku}:${item.batch}`);
  }

  return {
    source: 'preview',
    label: dataset.label,
    disclosure: dataset.disclosure,
    items: dataset.items,
  };
}
