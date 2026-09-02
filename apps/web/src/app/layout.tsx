import type { Metadata } from 'next';
import { BRAND } from '@medsphere/brand';
import { BrandStartup } from '@/components/brand/brand-startup';
import { LanguageProvider } from '@/components/language-provider';
import { getLocaleDirection } from '@/lib/i18n';
import { getServerLocalePreference } from '@/lib/server-locale';
import './globals.css';

export async function generateMetadata(): Promise<Metadata> {
  return {
    applicationName: BRAND.fullName,
    title: { default: BRAND.applicationTitle, template: `%s | ${BRAND.shortName}` },
    manifest: '/manifest.webmanifest',
    appleWebApp: {
      capable: true,
      title: BRAND.shortName,
      statusBarStyle: 'black-translucent',
    },
    openGraph: {
      type: 'website',
      siteName: BRAND.fullName,
      title: BRAND.applicationTitle,
    },
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
        <LanguageProvider initialLocale={serverPreference}>
          <BrandStartup />
          {children}
        </LanguageProvider>
      </body>
    </html>
  );
}
