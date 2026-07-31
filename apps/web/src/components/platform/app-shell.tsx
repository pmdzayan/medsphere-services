'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { PlatformBrand } from './brand';
import { Icon, type IconName } from './icon';

const primaryNavigation: NavigationItem[] = [
  { label: 'Overview', href: '/dashboard', icon: 'dashboard' },
  { label: 'Inventory', href: '/inventory', icon: 'inventory', badge: '12' },
  { label: 'Reservations', href: '/reservations', icon: 'reservations', badge: '4' },
  { label: 'Billing', href: '/billing', icon: 'billing' },
  { label: 'Documents', href: '/documents', icon: 'documents' },
];

const organizationNavigation: NavigationItem[] = [
  { label: 'Team & access', href: '/team', icon: 'team' },
  { label: 'Settings', href: '/settings', icon: 'settings' },
];

export function AppShell({ children }: Readonly<{ children: React.ReactNode }>) {
  const pathname = usePathname();
  const [mobileNavigationOpen, setMobileNavigationOpen] = useState(false);

  useEffect(() => setMobileNavigationOpen(false), [pathname]);

  return (
    <div className="min-h-screen bg-[#f3f6f3] text-[#12231e]">
      <a
        href="#main-content"
        className="fixed left-4 top-3 z-[100] -translate-y-20 rounded-full bg-[#09251f] px-4 py-2 text-sm font-bold text-white transition focus:translate-y-0"
      >
        Skip to content
      </a>

      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[17.5rem] flex-col bg-[#071713] px-4 pb-5 pt-5 text-white lg:flex">
        <div className="px-2">
          <PlatformBrand />
        </div>
        <TenantContext />
        <Navigation pathname={pathname} />
        <SidebarFooter />
      </aside>

      {mobileNavigationOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true">
          <button
            type="button"
            className="absolute inset-0 bg-[#03110e]/65 backdrop-blur-sm"
            onClick={() => setMobileNavigationOpen(false)}
            aria-label="Close navigation"
          />
          <aside className="relative flex h-full w-[min(88vw,21rem)] flex-col bg-[#071713] px-4 pb-5 pt-5 text-white shadow-2xl">
            <div className="flex items-center justify-between px-2">
              <PlatformBrand />
              <button
                type="button"
                onClick={() => setMobileNavigationOpen(false)}
                className="grid size-10 place-items-center rounded-xl border border-white/10 bg-white/[.06] text-white/70"
                aria-label="Close navigation"
              >
                <Icon name="close" className="size-5" />
              </button>
            </div>
            <TenantContext />
            <Navigation pathname={pathname} />
            <SidebarFooter />
          </aside>
        </div>
      ) : null}

      <div className="lg:pl-[17.5rem]">
        <header className="sticky top-0 z-30 border-b border-[#102c24]/[.07] bg-[#f3f6f3]/90 backdrop-blur-xl">
          <div className="flex h-[4.75rem] items-center gap-3 px-4 sm:px-6 lg:px-8">
            <button
              type="button"
              className="grid size-10 shrink-0 place-items-center rounded-xl border border-[#102c24]/10 bg-white text-[#21433a] shadow-sm lg:hidden"
              onClick={() => setMobileNavigationOpen(true)}
              aria-expanded={mobileNavigationOpen}
              aria-label="Open navigation"
            >
              <Icon name="menu" className="size-5" />
            </button>

            <label className="relative hidden w-full max-w-lg md:block">
              <span className="sr-only">Search MedSphere</span>
              <Icon
                name="search"
                className="pointer-events-none absolute left-4 top-1/2 size-[18px] -translate-y-1/2 text-[#70827c]"
              />
              <input
                type="search"
                placeholder="Search inventory, reservations, documents…"
                className="h-11 w-full rounded-2xl border border-[#173b31]/10 bg-white/75 pl-11 pr-16 text-sm text-[#142a24] shadow-[0_8px_30px_-24px_rgba(5,40,31,.55)] outline-none placeholder:text-[#83918d] focus:border-emerald-500/50 focus:ring-4 focus:ring-emerald-500/10"
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 rounded-md border border-[#173b31]/10 bg-[#f3f6f3] px-2 py-1 text-[10px] font-bold text-[#70827c]">
                ⌘ K
              </span>
            </label>

            <div className="ml-auto flex items-center gap-2 sm:gap-3">
              <span className="hidden items-center gap-2 rounded-full border border-emerald-800/10 bg-emerald-50 px-3 py-2 text-[11px] font-bold text-emerald-800 sm:flex">
                <span className="size-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_#10b981]" />
                Systems healthy
              </span>
              <button
                type="button"
                className="relative grid size-10 place-items-center rounded-xl border border-[#102c24]/10 bg-white text-[#466159] shadow-sm transition hover:border-emerald-500/30 hover:text-emerald-700"
                aria-label="Notifications, 3 unread"
              >
                <Icon name="bell" className="size-[18px]" />
                <span className="absolute right-2 top-2 size-2 rounded-full border-2 border-white bg-[#d3a84e]" />
              </button>
              <button
                type="button"
                className="flex items-center gap-3 rounded-2xl border border-[#102c24]/10 bg-white py-1.5 pl-1.5 pr-2 shadow-sm transition hover:border-emerald-500/25"
                aria-label="Open account menu"
              >
                <span className="grid size-8 place-items-center rounded-xl bg-[#0b342b] text-xs font-black text-emerald-200">
                  AZ
                </span>
                <span className="hidden text-left xl:block">
                  <span className="block text-xs font-bold text-[#17352c]">Aisha Zahra</span>
                  <span className="mt-0.5 block text-[10px] text-[#71817c]">Pharmacy manager</span>
                </span>
                <Icon
                  name="chevron"
                  className="hidden size-3.5 rotate-90 text-[#81908b] xl:block"
                />
              </button>
            </div>
          </div>
        </header>

        <main id="main-content" className="px-4 pb-24 pt-6 sm:px-6 sm:pt-8 lg:px-8 lg:pb-10">
          {children}
        </main>
      </div>

      <nav
        className="fixed inset-x-3 bottom-3 z-30 flex h-[4.25rem] items-center justify-around rounded-[1.35rem] border border-white/10 bg-[#071713]/95 px-2 text-white shadow-[0_22px_60px_-20px_rgba(2,20,15,.75)] backdrop-blur-xl lg:hidden"
        aria-label="Mobile navigation"
      >
        {primaryNavigation.slice(0, 4).map((item) => {
          const active = isActivePath(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex min-w-14 flex-col items-center gap-1 rounded-xl px-2 py-2 text-[9px] font-semibold transition ${active ? 'bg-emerald-300/10 text-emerald-300' : 'text-white/45'}`}
            >
              <Icon name={item.icon} className="size-[19px]" />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

function TenantContext() {
  return (
    <button
      type="button"
      className="mt-7 flex w-full items-center gap-3 rounded-2xl border border-white/[.08] bg-white/[.045] p-3 text-left transition hover:bg-white/[.07]"
      aria-label="Switch organization"
    >
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#d9b568] text-xs font-black text-[#1f281e]">
        AC
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs font-bold text-white">Apollo Care Pharmacy</span>
        <span className="mt-1 block text-[10px] text-white/38">Bengaluru · Main branch</span>
      </span>
      <Icon name="chevron" className="size-3.5 rotate-90 text-white/30" />
    </button>
  );
}

function Navigation({ pathname }: { pathname: string }) {
  return (
    <nav className="mt-7 flex min-h-0 flex-1 flex-col overflow-y-auto" aria-label="Workspace">
      <NavigationGroup label="Workspace" items={primaryNavigation} pathname={pathname} />
      <NavigationGroup
        label="Organization"
        items={organizationNavigation}
        pathname={pathname}
        className="mt-7"
      />
    </nav>
  );
}

function NavigationGroup({
  label,
  items,
  pathname,
  className = '',
}: {
  label: string;
  items: readonly NavigationItem[];
  pathname: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <p className="px-3 text-[9px] font-bold uppercase tracking-[.22em] text-white/25">{label}</p>
      <div className="mt-2 space-y-1">
        {items.map((item) => {
          const active = isActivePath(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`group flex min-h-11 items-center gap-3 rounded-xl px-3 text-[13px] font-semibold transition ${
                active
                  ? 'bg-emerald-300/[.12] text-emerald-200 shadow-inner'
                  : 'text-white/48 hover:bg-white/[.05] hover:text-white/80'
              }`}
            >
              <Icon
                name={item.icon}
                className={`size-[18px] ${active ? 'text-emerald-300' : 'text-white/34 group-hover:text-white/65'}`}
              />
              <span className="flex-1">{item.label}</span>
              {item.badge ? (
                <span
                  className={`rounded-full px-2 py-0.5 text-[9px] font-black ${
                    active ? 'bg-emerald-300/15 text-emerald-200' : 'bg-white/[.07] text-white/38'
                  }`}
                >
                  {item.badge}
                </span>
              ) : null}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function SidebarFooter() {
  return (
    <div className="mt-5 rounded-2xl border border-white/[.07] bg-white/[.035] p-3">
      <div className="flex items-start gap-3">
        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-cyan-300/10 text-cyan-200">
          <Icon name="help" className="size-4" />
        </span>
        <span>
          <span className="block text-[11px] font-bold text-white/75">Need help?</span>
          <span className="mt-1 block text-[9px] leading-4 text-white/34">
            Read the operations guide or contact support.
          </span>
        </span>
      </div>
    </div>
  );
}

function isActivePath(pathname: string, href: string) {
  return pathname === href || (href !== '/dashboard' && pathname.startsWith(`${href}/`));
}

interface NavigationItem {
  readonly label: string;
  readonly href: string;
  readonly icon: IconName;
  readonly badge?: string;
}
