import type { Metadata } from 'next';
import { AuditWorkspace } from '@/features/audit/audit-workspace';
import { translate } from '@/lib/i18n';
import { getServerLocale } from '@/lib/server-locale';

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getServerLocale();
  return {
    title: translate(locale, 'meta.audit.title'),
    description: translate(locale, 'meta.audit.description'),
  };
}

export default function AuditPage() {
  return <AuditWorkspace />;
}
