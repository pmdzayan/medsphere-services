import type { Metadata } from 'next';
import { PatientMedicinesWorkspace } from '@/features/patient/patient-medicines';
import { translate } from '@/lib/i18n';
import { getServerLocale } from '@/lib/server-locale';

/**
 * Task 0034 - Patient medicine search & reservations workspace under the
 * accepted Task 0032 patient shell (/patient/layout.tsx owns the personal
 * NONE-organization session boundary).
 */
export async function generateMetadata(): Promise<Metadata> {
  const locale = await getServerLocale();
  return { title: translate(locale, 'patientMedicines.title') };
}

export default function PatientMedicinesPage() {
  return <PatientMedicinesWorkspace />;
}
