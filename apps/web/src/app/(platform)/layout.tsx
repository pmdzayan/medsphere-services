import { AppShell } from '@/components/platform/app-shell';

export default function PlatformLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <AppShell>{children}</AppShell>;
}
