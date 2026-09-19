import type { Metadata } from 'next';
import { PatientTimelineWorkspace } from '@/features/patient-timeline/patient-timeline-workspace';
import { translate } from '@/lib/i18n';
import { getServerLocale } from '@/lib/server-locale';
export async function generateMetadata(): Promise<Metadata> {
  const locale = await getServerLocale();
  return { title: translate(locale, 'patientTimeline.title') };
}

export default async function PatientTimelinePage() {
  return <PatientTimelineWorkspace />;
}
