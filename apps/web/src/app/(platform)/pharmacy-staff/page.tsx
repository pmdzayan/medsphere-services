import type { Metadata } from 'next';

import { PharmacyStaffWorkspace } from '@/features/pharmacy-staff/pharmacy-staff-workspace';
import { translate } from '@/lib/i18n';
import { getServerLocale } from '@/lib/server-locale';

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getServerLocale();
  return { title: translate(locale, 'meta.pharmacyStaff.title') };
}

export default function PharmacyStaffPage() {
  return <PharmacyStaffWorkspace />;
}
