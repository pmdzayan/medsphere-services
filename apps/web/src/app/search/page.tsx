import type { Metadata } from 'next';
import { PublicMedicineSearch } from '@/features/public-search/public-medicine-search';
import { PublicSearchMissingProvider } from '@/features/public-search/public-search-missing-provider';

export const metadata: Metadata = {
  title: 'Medicine availability search — MedSphere',
};

export default async function PublicSearchPage({
  searchParams,
}: {
  searchParams: Promise<{ providerId?: string }>;
}) {
  const resolvedSearchParams = await searchParams;
  const providerId = resolvedSearchParams.providerId ?? '';
  const uuidV4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

  if (!uuidV4.test(providerId)) {
    return <PublicSearchMissingProvider />;
  }

  return (
    <main>
      <PublicMedicineSearch providerId={providerId} />
    </main>
  );
}
