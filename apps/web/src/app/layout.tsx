import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'MedSphere',
    template: '%s | MedSphere',
  },
  description: 'One connected healthcare operating system.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="font-[var(--font-body)]">{children}</body>
    </html>
  );
}
