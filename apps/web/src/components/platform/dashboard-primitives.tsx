import type { ReactNode } from 'react';

import { Icon, type IconName } from './icon';

type Tone = 'emerald' | 'amber' | 'rose' | 'slate' | 'cyan';

const toneStyles: Record<Tone, string> = {
  emerald: 'bg-emerald-50 text-emerald-700 ring-emerald-600/15',
  amber: 'bg-amber-50 text-amber-700 ring-amber-600/15',
  rose: 'bg-rose-50 text-rose-700 ring-rose-600/15',
  slate: 'bg-slate-100 text-slate-600 ring-slate-500/10',
  cyan: 'bg-cyan-50 text-cyan-700 ring-cyan-600/15',
};

export function StatusBadge({ children, tone }: { children: ReactNode; tone: Tone }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-bold ring-1 ring-inset ${toneStyles[tone]}`}
    >
      {children}
    </span>
  );
}

export function SectionCard({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`overflow-hidden rounded-[1.4rem] border border-[#dfe7e3] bg-white shadow-[0_18px_60px_rgba(24,57,47,.06)] ${className}`}
    >
      {children}
    </section>
  );
}

export function SectionHeader({
  title,
  eyebrow,
  action,
}: {
  title: string;
  eyebrow?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-[#edf1ef] px-5 py-4 sm:px-6">
      <div>
        {eyebrow ? (
          <p className="mb-1 text-[10px] font-extrabold uppercase tracking-[.18em] text-emerald-700">
            {eyebrow}
          </p>
        ) : null}
        <h2 className="font-[var(--font-display)] text-lg font-bold tracking-[-.025em] text-[#173128]">
          {title}
        </h2>
      </div>
      {action}
    </div>
  );
}

export function MetricCard({
  label,
  value,
  detail,
  icon,
  accent = 'emerald',
}: {
  label: string;
  value: string;
  detail: ReactNode;
  icon: IconName;
  accent?: 'emerald' | 'cyan' | 'amber' | 'rose';
}) {
  const accents = {
    emerald: 'bg-emerald-50 text-emerald-700',
    cyan: 'bg-cyan-50 text-cyan-700',
    amber: 'bg-amber-50 text-amber-700',
    rose: 'bg-rose-50 text-rose-700',
  };

  return (
    <article className="group relative overflow-hidden rounded-[1.35rem] border border-[#dfe7e3] bg-white p-5 shadow-[0_14px_40px_rgba(24,57,47,.05)] transition-transform duration-300 hover:-translate-y-0.5">
      <div className="absolute -right-8 -top-8 size-24 rounded-full bg-emerald-100/40 blur-2xl transition-transform group-hover:scale-125" />
      <div className="relative flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold text-[#71827c]">{label}</p>
          <p className="mt-3 font-[var(--font-display)] text-[1.7rem] font-bold leading-none tracking-[-.045em] text-[#10271f]">
            {value}
          </p>
        </div>
        <span className={`grid size-10 shrink-0 place-items-center rounded-xl ${accents[accent]}`}>
          <Icon name={icon} className="size-[1.15rem]" />
        </span>
      </div>
      <div className="relative mt-4 text-xs font-medium text-[#72827d]">{detail}</div>
    </article>
  );
}

export function ProgressBar({
  value,
  tone = 'emerald',
  label,
}: {
  value: number;
  tone?: 'emerald' | 'cyan' | 'amber' | 'rose';
  label: string;
}) {
  const barColours = {
    emerald: 'bg-emerald-500',
    cyan: 'bg-cyan-500',
    amber: 'bg-amber-400',
    rose: 'bg-rose-400',
  };

  return (
    <div
      className="h-2 overflow-hidden rounded-full bg-[#eef3f1]"
      role="progressbar"
      aria-label={label}
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className={`h-full rounded-full ${barColours[tone]}`}
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    </div>
  );
}
