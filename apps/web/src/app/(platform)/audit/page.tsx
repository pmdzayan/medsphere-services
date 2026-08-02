import type { Metadata } from 'next';
import { AuditWorkspace } from '@/features/audit/audit-workspace';

export const metadata: Metadata = {
  title: 'Audit trail | MedSphere',
  description: 'Tenant-scoped security and operations evidence.',
};

export default function AuditPage() {
  return <AuditWorkspace />;
}
