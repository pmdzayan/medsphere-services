import type { Metadata } from 'next';
import { ExpiryWorklistWorkspace } from '@/features/inventory/expiry-worklist-workspace';
import { translate } from '@/lib/i18n';
import { getServerLocale } from '@/lib/server-locale';

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getServerLocale();
  return {
    title: translate(locale, 'meta.expiry.title'),
    description: translate(locale, 'meta.expiry.description'),
  };
}

export default function ExpiryWorklistPage() {
  return <ExpiryWorklistWorkspace />;
}
