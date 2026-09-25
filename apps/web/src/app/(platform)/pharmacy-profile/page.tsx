import type { Metadata } from 'next';

import { PharmacyProfileWorkspace } from '@/features/pharmacy-profile/pharmacy-profile-workspace';
import { translate } from '@/lib/i18n';
import { getServerLocale } from '@/lib/server-locale';

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getServerLocale();
  return { title: translate(locale, 'meta.pharmacyProfile.title') };
}

export default function PharmacyProfilePage() {
  return <PharmacyProfileWorkspace />;
}
