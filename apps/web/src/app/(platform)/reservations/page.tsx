import type { Metadata } from 'next';
import { ReservationWorkspace } from '@/features/reservations/reservation-workspace';

export const metadata: Metadata = {
  title: 'Reservations | MedSphere',
  description: 'Assigned-provider medicine reservation reads and bounded staff actions.',
};

export default function ReservationsPage() {
  return <ReservationWorkspace />;
}
