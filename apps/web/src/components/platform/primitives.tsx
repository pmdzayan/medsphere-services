'use client';

import type { InputHTMLAttributes, ReactNode } from 'react';
import { useLanguage } from '@/components/language-provider';

/**
 * Shared MedSphere visual primitives (Task 1 — design-system foundation).
 *
 * These consolidate patterns that were previously duplicated per-screen
 * (the login form's local `Field`, the registration form's own input
 * styling, one-off card/badge markup across dashboard and settings
 * screens) into a single, small set of building blocks. This is
 * deliberately not a general-purpose UI framework: every primitive here
 * exists because at least two current MedSphere screens needed it.
 */

// ---------------------------------------------------------------------------
// Card — the default, opaque surface. Use for dashboard cards, list rows,
// settings panels. This is the *default* container; reach for GlassPanel
// only for navigation chrome and overlays.
// ---------------------------------------------------------------------------
export function Card({
  children,
  className = '',
  padded = true,
}: {
  children: ReactNode;
  className?: string;
  padded?: boolean;
}) {
  return (
    <div
      className={`overflow-hidden rounded-[1.35rem] border border-canvas-400 bg-white shadow-card ${
        padded ? 'p-5 sm:p-6' : ''
      } ${className}`}
    >
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// GlassPanel — restrained glassmorphism. Reserved for navigation surfaces,
// modals/overlays, and the occasional hero moment. Never the default card
// treatment (Task 1 direction: "no glass on every component").
// ---------------------------------------------------------------------------
export function GlassPanel({
  children,
  className = '',
  dark = false,
}: {
  children: ReactNode;
  className?: string;
  dark?: boolean;
}) {
  return (
    <div
      className={`rounded-[1.35rem] ${dark ? 'glass-surface-dark' : 'glass-surface'} ${className}`}
    >
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Button — replaces the one-off `<button className="...">` blocks in
// login-form.tsx and registration-form.tsx with a single, accessible,
// non-double-submittable primitive.
// ---------------------------------------------------------------------------
type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

const buttonVariants: Record<ButtonVariant, string> = {
  primary:
    'bg-emerald-800 text-white shadow-[0_18px_35px_-20px_rgba(11,47,40,.8)] hover:bg-emerald-700 hover:-translate-y-0.5',
  secondary:
    'border border-canvas-400 bg-white text-ink-900 hover:border-emerald-600/40 hover:bg-canvas-100',
  ghost: 'text-ink-800 hover:bg-canvas-200',
  danger: 'bg-rose-700 text-white shadow-[0_18px_35px_-20px_rgba(159,18,57,.7)] hover:bg-rose-600',
};

export function Button({
  children,
  variant = 'primary',
  loading = false,
  loadingLabel,
  className = '',
  disabled,
  type = 'button',
  ...rest
}: {
  children: ReactNode;
  variant?: ButtonVariant;
  loading?: boolean;
  loadingLabel?: string;
  className?: string;
} & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'children'>) {
  const { t } = useLanguage();
  return (
    <button
      {...rest}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={`inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3.5 text-sm font-bold transition disabled:cursor-wait disabled:opacity-60 disabled:hover:translate-y-0 ${buttonVariants[variant]} ${className}`}
    >
      {loading ? (loadingLabel ?? t('common.working')) : children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Input — replaces the local `Field` component duplicated in the login and
// registration forms. Keeps the accessible error-association pattern both
// already had (aria-invalid, aria-describedby) as the default, not an
// opt-in.
// ---------------------------------------------------------------------------
export function Input({
  label,
  error,
  hint,
  ...input
}: InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  error?: string;
  hint?: string;
}) {
  const id = `field-${input.name ?? label.toLowerCase().replace(/\s+/g, '-')}`;
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <label className="block" htmlFor={id}>
      <span className="mb-2 block text-xs font-bold text-canvas-700">{label}</span>
      <input
        {...input}
        id={id}
        aria-invalid={Boolean(error)}
        aria-describedby={describedBy}
        className="w-full rounded-xl border border-ink-900/[.11] bg-canvas-50 px-4 py-3.5 text-sm text-ink-900 shadow-[0_1px_0_rgba(255,255,255,.8)_inset] transition placeholder:text-canvas-500 hover:border-ink-900/25 focus:border-emerald-600 focus:bg-white"
      />
      {error ? (
        <span id={`${id}-error`} className="mt-2 block text-xs text-rose-700" role="alert">
          {error}
        </span>
      ) : hint ? (
        <span id={`${id}-hint`} className="mt-2 block text-xs text-canvas-600">
          {hint}
        </span>
      ) : null}
    </label>
  );
}

// ---------------------------------------------------------------------------
// Badge — same tone system as the existing dashboard StatusBadge, exposed
// as the general-purpose primitive so non-dashboard screens (settings,
// team, audit) don't reinvent it.
// ---------------------------------------------------------------------------
export type BadgeTone = 'emerald' | 'amber' | 'rose' | 'slate' | 'cyan';

const badgeToneStyles: Record<BadgeTone, string> = {
  emerald: 'bg-emerald-50 text-emerald-700 ring-emerald-600/15',
  amber: 'bg-amber-50 text-amber-700 ring-amber-600/15',
  rose: 'bg-rose-50 text-rose-700 ring-rose-600/15',
  slate: 'bg-canvas-200 text-canvas-700 ring-canvas-500/20',
  cyan: 'bg-cyan-50 text-cyan-700 ring-cyan-600/15',
};

export function Badge({ children, tone = 'slate' }: { children: ReactNode; tone?: BadgeTone }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-bold ring-1 ring-inset ${badgeToneStyles[tone]}`}
    >
      {children}
    </span>
  );
}

// ---------------------------------------------------------------------------
// StatusIndicator — a small live/inactive dot + label, for operational
// health rows (Task 3 will consume this for the bento dashboard).
// ---------------------------------------------------------------------------
export type StatusTone = 'positive' | 'warning' | 'critical' | 'neutral';

const statusDotStyles: Record<StatusTone, string> = {
  positive: 'bg-emerald-500',
  warning: 'bg-amber-400',
  critical: 'bg-rose-500',
  neutral: 'bg-canvas-500',
};

export function StatusIndicator({ tone, label }: { tone: StatusTone; label: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-xs font-semibold text-canvas-700">
      <span className={`size-2 rounded-full ${statusDotStyles[tone]}`} aria-hidden="true" />
      {label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// EmptyState — one shared empty/zero-data presentation, replacing ad hoc
// "Nothing here" text so every screen's empty state looks intentional.
// ---------------------------------------------------------------------------
export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
      <p className="text-sm font-bold text-ink-800">{title}</p>
      {description ? <p className="max-w-sm text-sm text-canvas-600">{description}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Skeleton — a single loading-state primitive. Uses Tailwind's
// motion-reduce:animate-none alongside animate-pulse so it actually
// respects prefers-reduced-motion, consistent with the reduced-motion
// handling already present in globals.css for the rest of the app.
// ---------------------------------------------------------------------------
export function Skeleton({ className = '' }: { className?: string }) {
  const { t } = useLanguage();
  return (
    <div
      className={`animate-pulse rounded-lg bg-canvas-300/70 motion-reduce:animate-none ${className}`}
      role="status"
      aria-label={t('common.loading')}
    />
  );
}
