import type { Metadata } from 'next';
import { LanguageProvider } from '@/components/language-provider';
import { getLocaleDirection, translate } from '@/lib/i18n';
import { getServerLocale, getServerLocalePreference } from '@/lib/server-locale';
import './globals.css';

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getServerLocale();
  return {
    title: { default: 'MedSphere', template: '%s | MedSphere' },
    description: translate(locale, 'meta.description'),
  };
}

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // Authenticated profile preference wins; signed-out visits use the
  // non-sensitive locale cookie maintained alongside local storage.
  const serverPreference = await getServerLocalePreference();
  const serverLocale = serverPreference ?? 'en';

  return (
    <html lang={serverLocale} dir={getLocaleDirection(serverLocale)}>
      <body className="font-[var(--font-body)]">
        <LanguageProvider initialLocale={serverPreference}>{children}</LanguageProvider>
      </body>
    </html>
  );
}
