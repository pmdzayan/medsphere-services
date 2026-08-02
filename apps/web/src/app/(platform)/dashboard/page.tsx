import { Icon } from '@/components/platform/icon';
import {
  MetricCard,
  ProgressBar,
  SectionCard,
  SectionHeader,
  StatusBadge,
} from '@/components/platform/dashboard-primitives';

const stockHealth = [
  { label: 'Healthy stock', count: '1,112', share: 87, tone: 'emerald' as const },
  { label: 'Low stock', count: '94', share: 8, tone: 'amber' as const },
  { label: 'Out of stock', count: '27', share: 3, tone: 'rose' as const },
  { label: 'Expiring soon', count: '21', share: 2, tone: 'cyan' as const },
];

const attentionItems = [
  {
    product: 'Metformin 500 mg',
    form: 'Tablets · 10 × 10',
    batch: 'MTF-24018',
    available: '18 units',
    coverage: '2 days',
    status: 'Critical',
    tone: 'rose' as const,
  },
  {
    product: 'Amoxicillin 250 mg',
    form: 'Capsules · 10 × 6',
    batch: 'AMX-25041',
    available: '42 units',
    coverage: '4 days',
    status: 'Low stock',
    tone: 'amber' as const,
  },
  {
    product: 'Insulin Glargine',
    form: 'Injection · 3 ml',
    batch: 'IGL-25009',
    available: '12 units',
    coverage: '6 days',
    status: 'Cold chain',
    tone: 'cyan' as const,
  },
  {
    product: 'Atorvastatin 20 mg',
    form: 'Tablets · 10 × 10',
    batch: 'ATV-24112',
    available: '61 units',
    coverage: '9 days',
    status: 'Reorder',
    tone: 'slate' as const,
  },
];

const reservations = [
  {
    initials: 'RK',
    patient: 'Rohan Kumar',
    items: '3 medicines',
    due: '12 min',
    tone: 'bg-emerald-100 text-emerald-800',
  },
  {
    initials: 'FM',
    patient: 'Farah Malik',
    items: '1 medicine',
    due: '28 min',
    tone: 'bg-cyan-100 text-cyan-800',
  },
  {
    initials: 'AN',
    patient: 'Aditya Nair',
    items: '4 medicines',
    due: '45 min',
    tone: 'bg-amber-100 text-amber-800',
  },
];

const activity = [
  {
    title: 'Stock receipt posted',
    detail: 'GRN-00483 · 48 line items',
    time: '10 min ago',
    colour: 'bg-emerald-500',
  },
  {
    title: 'Reservation fulfilled',
    detail: 'RSV-18924 · counter 02',
    time: '24 min ago',
    colour: 'bg-cyan-500',
  },
  {
    title: 'Expiry alert reviewed',
    detail: '7 batches acknowledged',
    time: '1 hr ago',
    colour: 'bg-amber-400',
  },
];

export default function DashboardPage() {
  const formattedDate = new Intl.DateTimeFormat('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date());

  return (
    <div className="mx-auto max-w-[94rem] space-y-5 sm:space-y-6">
      <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <p className="text-xs font-extrabold uppercase tracking-[.18em] text-emerald-700">
              Pharmacy operations
            </p>
            <span className="rounded-full bg-[#e8f3ef] px-2.5 py-1 text-[10px] font-bold text-[#42645a]">
              Preview data
            </span>
          </div>
          <h1 className="mt-3 font-[var(--font-display)] text-3xl font-bold tracking-[-.045em] text-[#10271f] sm:text-[2.45rem]">
            Operations overview
          </h1>
          <p className="mt-2 text-sm text-[#71817c]">
            {formattedDate} · Here is today&apos;s operating picture.
          </p>
        </div>

        <div className="flex flex-wrap gap-2.5">
          <button
            type="button"
            disabled
            title="Available after inventory workflows are connected"
            className="inline-flex cursor-not-allowed items-center gap-2 rounded-xl border border-[#d8e2de] bg-white px-4 py-2.5 text-sm font-bold text-[#657770] opacity-70"
          >
            <Icon name="inventory" className="size-4" />
            Receive stock
          </button>
          <button
            type="button"
            disabled
            title="Available after reservation workflows are connected"
            className="inline-flex cursor-not-allowed items-center gap-2 rounded-xl bg-[#0b5f4b] px-4 py-2.5 text-sm font-bold text-white opacity-70 shadow-[0_10px_24px_rgba(11,95,75,.18)]"
          >
            <Icon name="plus" className="size-4" />
            New reservation
          </button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Inventory value"
          value="₹24.8L"
          icon="billing"
          detail={
            <span>
              <strong className="text-emerald-700">+4.8%</strong> from last month
            </span>
          }
        />
        <MetricCard
          label="Available units"
          value="18,420"
          icon="inventory"
          accent="cyan"
          detail={
            <span>
              <strong className="text-[#355d51]">1,254</strong> active products
            </span>
          }
        />
        <MetricCard
          label="Needs attention"
          value="142"
          icon="warning"
          accent="amber"
          detail={
            <span>
              <strong className="text-amber-700">27 critical</strong> stock positions
            </span>
          }
        />
        <MetricCard
          label="Open reservations"
          value="16"
          icon="reservations"
          accent="rose"
          detail={
            <span>
              <strong className="text-rose-700">3 due</strong> within 30 minutes
            </span>
          }
        />
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.55fr_1fr]">
        <SectionCard>
          <SectionHeader
            eyebrow="Inventory control"
            title="Stock health"
            action={<StatusBadge tone="emerald">97.4% available</StatusBadge>}
          />
          <div className="grid gap-7 p-5 sm:p-6 lg:grid-cols-[.9fr_1.1fr] lg:items-center">
            <div className="relative mx-auto grid size-52 place-items-center rounded-full bg-[conic-gradient(#10b981_0_87%,#fbbf24_87%_95%,#fb7185_95%_98%,#22d3ee_98%)] p-[18px] shadow-[0_18px_45px_rgba(16,185,129,.16)]">
              <div className="grid size-full place-items-center rounded-full bg-white text-center shadow-inner">
                <div>
                  <p className="font-[var(--font-display)] text-4xl font-bold tracking-[-.05em] text-[#113126]">
                    1,254
                  </p>
                  <p className="mt-1 text-xs font-semibold text-[#7b8b86]">Active products</p>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              {stockHealth.map((item) => (
                <div key={item.label}>
                  <div className="mb-2 flex items-center justify-between gap-4 text-xs">
                    <span className="font-semibold text-[#4c615a]">{item.label}</span>
                    <span className="font-bold text-[#18362c]">{item.count}</span>
                  </div>
                  <ProgressBar
                    value={item.share}
                    tone={item.tone}
                    label={`${item.label}: ${item.share}%`}
                  />
                </div>
              ))}
            </div>
          </div>
        </SectionCard>

        <SectionCard>
          <SectionHeader
            eyebrow="Pickup desk"
            title="Reservation queue"
            action={<span className="text-xs font-bold text-[#73847e]">16 open</span>}
          />
          <div className="divide-y divide-[#edf1ef] px-5 sm:px-6">
            {reservations.map((reservation) => (
              <div key={reservation.patient} className="flex items-center gap-3 py-4">
                <span
                  className={`grid size-10 shrink-0 place-items-center rounded-xl text-xs font-extrabold ${reservation.tone}`}
                >
                  {reservation.initials}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-[#1d382f]">{reservation.patient}</p>
                  <p className="mt-1 text-xs text-[#80908b]">{reservation.items}</p>
                </div>
                <div className="text-right">
                  <p className="inline-flex items-center gap-1 text-xs font-bold text-[#49665c]">
                    <Icon name="clock" className="size-3.5" />
                    {reservation.due}
                  </p>
                  <p className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-[#9aa6a2]">
                    pickup
                  </p>
                </div>
              </div>
            ))}
          </div>
          <div className="border-t border-[#edf1ef] bg-[#fbfcfb] px-5 py-3 sm:px-6">
            <p className="text-xs text-[#7a8b85]">
              Actions unlock when reservation APIs are connected.
            </p>
          </div>
        </SectionCard>
      </div>

      <SectionCard>
        <SectionHeader
          eyebrow="Priority worklist"
          title="Inventory requiring attention"
          action={
            <button
              type="button"
              disabled
              className="cursor-not-allowed text-xs font-bold text-emerald-700 opacity-60"
            >
              View inventory
            </button>
          }
        />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] border-collapse text-left">
            <thead>
              <tr className="border-b border-[#edf1ef] bg-[#fbfcfb] text-[10px] font-extrabold uppercase tracking-[.13em] text-[#8a9994]">
                <th scope="col" className="px-6 py-3.5">
                  Product
                </th>
                <th scope="col" className="px-4 py-3.5">
                  Batch
                </th>
                <th scope="col" className="px-4 py-3.5">
                  Available
                </th>
                <th scope="col" className="px-4 py-3.5">
                  Coverage
                </th>
                <th scope="col" className="px-4 py-3.5">
                  Status
                </th>
                <th scope="col" className="px-6 py-3.5">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#edf1ef]">
              {attentionItems.map((item) => (
                <tr key={item.batch} className="transition-colors hover:bg-[#fbfdfc]">
                  <td className="px-6 py-4">
                    <p className="text-sm font-bold text-[#1b372d]">{item.product}</p>
                    <p className="mt-1 text-xs text-[#85938f]">{item.form}</p>
                  </td>
                  <td className="px-4 py-4 font-mono text-xs font-semibold text-[#516861]">
                    {item.batch}
                  </td>
                  <td className="px-4 py-4 text-sm font-semibold text-[#405a52]">
                    {item.available}
                  </td>
                  <td className="px-4 py-4 text-sm text-[#60736c]">{item.coverage}</td>
                  <td className="px-4 py-4">
                    <StatusBadge tone={item.tone}>{item.status}</StatusBadge>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button
                      type="button"
                      disabled
                      aria-label={`Actions for ${item.product}`}
                      className="cursor-not-allowed rounded-lg p-2 text-[#9aa7a3]"
                    >
                      <Icon name="more" className="size-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>

      <div className="grid gap-5 lg:grid-cols-2">
        <SectionCard>
          <SectionHeader eyebrow="Audit trail" title="Recent activity" />
          <div className="px-5 py-1 sm:px-6">
            {activity.map((item, index) => (
              <div key={item.title} className="relative flex gap-4 py-4">
                {index < activity.length - 1 ? (
                  <span className="absolute left-[5px] top-8 h-[calc(100%-16px)] w-px bg-[#dfe8e4]" />
                ) : null}
                <span
                  className={`relative mt-1.5 size-[11px] shrink-0 rounded-full ring-4 ring-white ${item.colour}`}
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-[#244037]">{item.title}</p>
                  <p className="mt-1 text-xs text-[#7e8e89]">{item.detail}</p>
                </div>
                <time className="shrink-0 text-[11px] font-semibold text-[#9aa6a2]">
                  {item.time}
                </time>
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard className="bg-[#092d26] text-white">
          <div className="relative h-full overflow-hidden p-6 sm:p-7">
            <div className="absolute -right-16 -top-20 size-56 rounded-full bg-emerald-400/15 blur-3xl" />
            <div className="relative flex h-full flex-col justify-between gap-8">
              <div>
                <span className="grid size-11 place-items-center rounded-2xl bg-white/10 text-emerald-300 ring-1 ring-white/10">
                  <Icon name="trend" className="size-5" />
                </span>
                <p className="mt-5 text-xs font-extrabold uppercase tracking-[.18em] text-emerald-300">
                  Today&apos;s fulfilment
                </p>
                <h2 className="mt-2 font-[var(--font-display)] text-3xl font-bold tracking-[-.04em]">
                  94.2% ready on time
                </h2>
                <p className="mt-2 max-w-md text-sm leading-6 text-white/60">
                  128 of 136 requested medicine lines were prepared inside the target window.
                </p>
              </div>
              <div>
                <div className="mb-2 flex justify-between text-xs font-bold text-white/70">
                  <span>Daily target</span>
                  <span>94.2%</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-white/10">
                  <div className="h-full w-[94.2%] rounded-full bg-gradient-to-r from-emerald-400 to-cyan-300" />
                </div>
              </div>
            </div>
          </div>
        </SectionCard>
      </div>

      <p className="pb-2 text-center text-[11px] text-[#93a09c]">
        Sanitised sample data for interface validation · No patient records are displayed
      </p>
    </div>
  );
}
