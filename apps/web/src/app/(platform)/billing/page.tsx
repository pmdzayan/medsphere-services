import type { Metadata } from 'next';

import { PosWorkspace } from '@/features/pos/pos-workspace';
import { translate } from '@/lib/i18n';
import { getServerLocale } from '@/lib/server-locale';

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getServerLocale();
  return {
    title: translate(locale, 'meta.billing.title'),
    description: translate(locale, 'meta.billing.description'),
  };
}

export default function BillingPage() {
  return <PosWorkspace />;
}
