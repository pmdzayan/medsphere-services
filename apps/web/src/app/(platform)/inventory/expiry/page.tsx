import type { Metadata } from 'next';
import { ExpiryWorklistWorkspace } from '@/features/inventory/expiry-worklist-workspace';

export const metadata: Metadata = {
  title: 'Expiry worklist | MedSphere',
  description: 'Assigned-provider physical batch expiry worklist.',
};

export default function ExpiryWorklistPage() {
  return <ExpiryWorklistWorkspace />;
}
