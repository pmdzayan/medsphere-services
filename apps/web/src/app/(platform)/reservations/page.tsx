import type { Metadata } from 'next';
import { ReservationWorkspace } from '@/features/reservations/reservation-workspace';

export const metadata: Metadata = {
  title: 'Reservations | MedSphere',
  description: 'Read-only assigned-provider medicine reservations.',
};

export default function ReservationsPage() {
  return <ReservationWorkspace />;
}
