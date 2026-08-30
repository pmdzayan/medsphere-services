import type { Metadata } from 'next';
import { LoginPageContent } from './login-page-content';
import { translate } from '@/lib/i18n';
import { getServerLocale } from '@/lib/server-locale';

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getServerLocale();
  return { title: translate(locale, 'meta.login.title') };
}

export default function LoginPage() {
  return <LoginPageContent />;
}
