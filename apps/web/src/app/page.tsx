import Link from 'next/link';

const foundations = [
  ['01', 'Identity', 'Verified membership and tenant-aware sessions.'],
  ['02', 'Operations', 'A calm command layer for healthcare teams.'],
  ['03', 'Intelligence', 'Clear signals without clinical noise.'],
] as const;

const metrics = [
  ['Tenant context', 'Verified'],
  ['Access posture', 'Deny by default'],
  ['Audit boundary', 'Attributable'],
] as const;

export default function HomePage() {
  return (
    <main className="min-h-screen overflow-hidden bg-[#f7f6f0]">
      <div className="mx-auto max-w-[1500px] px-4 py-4 sm:px-6 sm:py-6">
        <section className="fine-noise premium-grid relative overflow-hidden rounded-[1.75rem] bg-[#07110f] text-white shadow-[0_35px_100px_-42px_rgba(7,17,15,.72)] sm:rounded-[2.5rem]">
          <div className="pointer-events-none absolute -right-36 -top-48 size-[34rem] rounded-full bg-emerald-400/15 blur-[110px]" />
          <div className="pointer-events-none absolute -bottom-64 left-1/3 size-[36rem] rounded-full bg-cyan-300/10 blur-[120px]" />

          <nav
            className="relative z-10 mx-auto flex max-w-7xl items-center justify-between px-5 py-5 sm:px-9 sm:py-7"
            aria-label="Primary"
          >
            <BrandMark />
            <div className="flex items-center gap-3">
              <span className="hidden items-center gap-2 text-xs font-medium text-white/55 sm:flex">
                <span className="size-1.5 rounded-full bg-emerald-400 shadow-[0_0_12px_#34d399]" />
                Foundation online
              </span>
              <Link
                href="/login"
                className="rounded-full border border-white/15 bg-white/[.07] px-5 py-2.5 text-sm font-semibold text-white backdrop-blur-xl transition hover:border-emerald-300/50 hover:bg-white/[.12]"
              >
                Sign in <span aria-hidden="true">↗</span>
              </Link>
            </div>
          </nav>

          <div className="relative z-10 mx-auto grid max-w-7xl items-center gap-14 px-5 pb-16 pt-14 sm:px-9 sm:pb-24 sm:pt-20 lg:grid-cols-[1.02fr_.98fr] lg:gap-20 lg:pb-28">
            <div>
              <div className="mb-7 inline-flex items-center gap-3 rounded-full border border-[#d7b56d]/25 bg-[#d7b56d]/[.07] px-4 py-2 text-[11px] font-bold uppercase tracking-[.22em] text-[#e8cc91]">
                <span className="h-px w-5 bg-[#d7b56d]" /> Healthcare operating system
              </div>
              <h1 className="max-w-4xl font-[var(--font-display)] text-[3.45rem] font-semibold leading-[.96] tracking-[-.065em] sm:text-7xl lg:text-[5.4rem]">
                Healthcare,
                <span className="block text-emerald-300">beautifully connected.</span>
              </h1>
              <p className="mt-7 max-w-xl text-base leading-8 text-white/58 sm:text-lg">
                One secure operating layer that brings identity, coordination, inventory, and care
                into a clear, trusted workspace.
              </p>
              <div className="mt-10 flex flex-col gap-3 sm:flex-row sm:items-center">
                <Link
                  href="/login"
                  className="group inline-flex items-center justify-center gap-3 rounded-full bg-[#f5f2e8] px-6 py-3.5 text-sm font-bold text-[#10201c] transition hover:bg-emerald-300"
                >
                  Enter MedSphere
                  <span
                    className="transition-transform group-hover:translate-x-1"
                    aria-hidden="true"
                  >
                    →
                  </span>
                </Link>
                <span className="px-3 text-center text-xs leading-5 text-white/38 sm:text-left">
                  Stabilization environment
                  <br /> No real patient data
                </span>
              </div>
            </div>

            <ProductPreview />
          </div>

          <div className="relative z-10 border-t border-white/[.08]">
            <div className="mx-auto grid max-w-7xl grid-cols-1 divide-y divide-white/[.08] px-5 sm:px-9 md:grid-cols-3 md:divide-x md:divide-y-0">
              {metrics.map(([label, value]) => (
                <div
                  key={label}
                  className="flex items-center justify-between py-5 md:px-7 md:first:pl-0"
                >
                  <span className="text-xs text-white/38">{label}</span>
                  <span className="text-xs font-semibold text-emerald-300">{value}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-2 py-20 sm:py-28">
          <div className="grid gap-10 lg:grid-cols-[.8fr_1.2fr] lg:gap-20">
            <div>
              <p className="text-xs font-bold uppercase tracking-[.22em] text-emerald-700">
                Trust architecture
              </p>
              <h2 className="mt-5 max-w-md font-[var(--font-display)] text-4xl font-semibold tracking-[-.045em] text-[#10201c] sm:text-5xl">
                Premium should feel calm, not crowded.
              </h2>
            </div>
            <div className="grid gap-px overflow-hidden rounded-[1.75rem] border border-[#10201c]/10 bg-[#10201c]/10 sm:grid-cols-3">
              {foundations.map(([number, title, description]) => (
                <article key={title} className="bg-[#fffef9] p-7 sm:min-h-64">
                  <span className="text-xs font-bold tracking-[.16em] text-[#b08a41]">
                    {number}
                  </span>
                  <h3 className="mt-16 font-[var(--font-display)] text-xl font-bold tracking-tight">
                    {title}
                  </h3>
                  <p className="mt-3 text-sm leading-6 text-[#60706b]">{description}</p>
                </article>
              ))}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

function BrandMark({ dark = true }: { dark?: boolean }) {
  return (
    <Link href="/" className="inline-flex items-center gap-3 font-[var(--font-display)] font-bold">
      <span
        className={`grid size-10 place-items-center rounded-[.9rem] border text-sm shadow-inner ${
          dark
            ? 'border-emerald-300/25 bg-emerald-300/10 text-emerald-300'
            : 'border-emerald-950/10 bg-emerald-950 text-emerald-300'
        }`}
      >
        M
      </span>
      <span className="tracking-[-.02em]">MedSphere</span>
    </Link>
  );
}

function ProductPreview() {
  return (
    <div className="soft-float relative mx-auto w-full max-w-xl">
      <div className="absolute -inset-5 rounded-[2.5rem] bg-emerald-300/[.08] blur-2xl" />
      <div className="relative overflow-hidden rounded-[1.6rem] border border-white/[.14] bg-white/[.08] p-2 shadow-[0_30px_90px_-20px_rgba(0,0,0,.7)] backdrop-blur-2xl">
        <div className="overflow-hidden rounded-[1.25rem] bg-[#f5f3ec] text-[#10201c]">
          <div className="flex items-center justify-between border-b border-[#10201c]/[.08] px-4 py-3 sm:px-5">
            <div className="flex items-center gap-2">
              <span className="size-2 rounded-full bg-emerald-500" />
              <span className="text-[10px] font-bold uppercase tracking-[.16em] text-[#60706b]">
                Operations overview
              </span>
            </div>
            <span className="rounded-full bg-white px-3 py-1 text-[9px] font-semibold text-[#60706b] shadow-sm">
              Live context
            </span>
          </div>
          <div className="grid grid-cols-[4.4rem_1fr] sm:grid-cols-[6.5rem_1fr]">
            <div className="border-r border-[#10201c]/[.07] bg-[#eceae2] p-3 sm:p-4">
              <div className="mb-7 size-7 rounded-lg bg-[#0b2f28]" />
              {[true, false, false, false].map((active, index) => (
                <div
                  key={index}
                  className={`mb-3 h-2 rounded-full ${active ? 'bg-emerald-600' : 'bg-[#10201c]/10'}`}
                  style={{ width: index % 2 ? '68%' : '88%' }}
                />
              ))}
            </div>
            <div className="p-4 sm:p-6">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-[10px] font-semibold text-[#60706b]">Good morning</p>
                  <p className="mt-1 font-[var(--font-display)] text-lg font-bold sm:text-2xl">
                    Command centre
                  </p>
                </div>
                <div className="size-8 rounded-full border-4 border-white bg-[#d7b56d] shadow" />
              </div>
              <div className="mt-6 grid grid-cols-2 gap-3">
                <PreviewCard label="Identity" value="Protected" accent="emerald" />
                <PreviewCard label="Tenant" value="Verified" accent="cyan" />
              </div>
              <div className="mt-3 rounded-xl border border-[#10201c]/[.07] bg-white p-4 shadow-[0_12px_30px_-22px_rgba(7,17,15,.5)]">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold">System activity</span>
                  <span className="text-[9px] text-[#60706b]">Today</span>
                </div>
                <div className="mt-5 flex h-16 items-end gap-1.5">
                  {[34, 52, 41, 72, 58, 88, 70, 96, 76, 92].map((height, index) => (
                    <span
                      key={index}
                      className="flex-1 rounded-t-sm bg-emerald-500/80"
                      style={{ height: `${height}%`, opacity: 0.35 + index * 0.06 }}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function PreviewCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent: 'emerald' | 'cyan';
}) {
  return (
    <div className="rounded-xl border border-[#10201c]/[.07] bg-white p-3.5 shadow-[0_12px_30px_-24px_rgba(7,17,15,.55)]">
      <span
        className={`mb-3 block size-2 rounded-full ${accent === 'emerald' ? 'bg-emerald-500' : 'bg-cyan-500'}`}
      />
      <p className="text-[9px] text-[#60706b]">{label}</p>
      <p className="mt-1 text-xs font-bold sm:text-sm">{value}</p>
    </div>
  );
}
