import type { Metadata } from 'next';
import { ReservationWorkspace } from '@/features/reservations/reservation-workspace';
import { translate } from '@/lib/i18n';
import { getServerLocale } from '@/lib/server-locale';

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getServerLocale();
  return {
    title: translate(locale, 'meta.reservations.title'),
    description: translate(locale, 'meta.reservations.description'),
  };
}

export default function ReservationsPage() {
  return <ReservationWorkspace />;
}
