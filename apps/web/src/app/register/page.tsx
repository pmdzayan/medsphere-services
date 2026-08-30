import type { Metadata } from 'next';
import { RegisterPageContent } from './register-page-content';
import { translate } from '@/lib/i18n';
import { getServerLocale } from '@/lib/server-locale';

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getServerLocale();
  return { title: translate(locale, 'meta.register.title') };
}

export default function RegisterPage() {
  return <RegisterPageContent />;
}
