import type { Metadata } from 'next';
import { PatientDashboard } from '@/features/patient/patient-dashboard';
import { translate } from '@/lib/i18n';
import { getServerLocale } from '@/lib/server-locale';

/**
 * Candidate Task 0032 (pre-0031). Deliberately a separate route
 * (/patient/dashboard) from the existing organization-operations
 * (platform)/dashboard -- see the candidate integration document for
 * the known gap this creates (nothing currently redirects a
 * personal-account user here after login) and the required
 * post-reconciliation follow-up.
 */
export async function generateMetadata(): Promise<Metadata> {
  const locale = await getServerLocale();
  return { title: translate(locale, 'patient.dashboard.title') };
}

export default function PatientDashboardPage() {
  return <PatientDashboard />;
}
