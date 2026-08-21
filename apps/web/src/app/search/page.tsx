import type { Metadata } from 'next';
import { PublicMedicineSearch } from '@/features/public-search/public-medicine-search';

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
    return (
      <main className="mx-auto max-w-2xl px-4 py-14 sm:px-6">
        <h1 className="text-2xl font-extrabold text-[#173128]">Medicine availability search</h1>
        <p className="mt-3 text-sm text-[#536a62]">
          This search is linked from a specific pharmacy&apos;s page. Use the link your pharmacy
          provided to check availability.
        </p>
      </main>
    );
  }

  return (
    <main>
      <PublicMedicineSearch providerId={providerId} />
    </main>
  );
}
