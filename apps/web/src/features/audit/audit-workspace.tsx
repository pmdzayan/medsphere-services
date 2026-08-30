'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { Icon } from '@/components/platform/icon';
import { MetricCard, SectionCard, StatusBadge } from '@/components/platform/dashboard-primitives';
import { useLanguage } from '@/components/language-provider';
import { ApiError, getAuditEvents } from '@/lib/api-client';
import type { TranslationKey, TranslationValues } from '@/lib/i18n';
import {
  AUDIT_EVENT_TYPES,
  AUDIT_OUTCOMES,
  type AuditEvent,
  type AuditEventFilters,
  type AuditEventType,
  type AuditOutcome,
} from '@/lib/audit-contract';

const PAGE_SIZE = 25;

interface FilterDraft {
  eventType: '' | AuditEventType;
  outcome: '' | AuditOutcome;
  actorMembershipId: string;
  resourceType: string;
  resourceId: string;
  startDate: string;
  endDate: string;
}

const emptyDraft: FilterDraft = {
  eventType: '',
  outcome: '',
  actorMembershipId: '',
  resourceType: '',
  resourceId: '',
  startDate: '',
  endDate: '',
};

export function AuditWorkspace() {
  const { locale, t } = useLanguage();
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<AuditEvent | null>(null);
  const [draft, setDraft] = useState<FilterDraft>(emptyDraft);
  const [appliedFilters, setAppliedFilters] = useState<AuditEventFilters>({ limit: PAGE_SIZE });
  const [filterError, setFilterError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<{ message: string; status?: number } | null>(null);

  const load = useCallback(
    async (filters: AuditEventFilters, append = false) => {
      append ? setLoadingMore(true) : setLoading(true);
      setError(null);
      try {
        const page = await getAuditEvents(filters);
        setEvents((current) => (append ? mergeEvents(current, page.data) : page.data));
        setNextCursor(page.nextCursor);
        if (!append) setSelectedEvent(null);
      } catch (loadError) {
        setError({
          message: t('audit.error.load'),
          status: loadError instanceof ApiError ? loadError.status : undefined,
        });
        if (!append) {
          setEvents([]);
          setNextCursor(null);
          setSelectedEvent(null);
        }
      } finally {
        append ? setLoadingMore(false) : setLoading(false);
      }
    },
    [t],
  );

  useEffect(() => {
    void load({ limit: PAGE_SIZE });
  }, [load]);

  const metrics = useMemo(() => loadedMetrics(events, locale, t), [events, locale, t]);

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const validation = validateFilterDraft(draft, t);
    if (validation) {
      setFilterError(validation);
      return;
    }
    setFilterError(null);
    const filters = toFilters(draft);
    setAppliedFilters(filters);
    void load(filters);
  }

  function clearFilters() {
    setDraft(emptyDraft);
    setFilterError(null);
    const filters = { limit: PAGE_SIZE };
    setAppliedFilters(filters);
    void load(filters);
  }

  if (error?.status === 403 && events.length === 0) {
    return <AuditAccessDenied t={t} onRetry={() => void load(appliedFilters)} />;
  }

  return (
    <div className="mx-auto max-w-[94rem] space-y-5 sm:space-y-6">
      <header className="relative overflow-hidden rounded-[1.75rem] bg-[#08231d] px-5 py-7 text-white shadow-[0_24px_70px_-38px_rgba(5,35,28,.75)] sm:px-8 sm:py-9">
        <div className="premium-grid absolute inset-0 opacity-40" />
        <div className="absolute -right-20 -top-28 size-72 rounded-full bg-cyan-400/15 blur-[80px]" />
        <div className="relative flex flex-col justify-between gap-7 lg:flex-row lg:items-end">
          <div className="max-w-3xl">
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="inline-flex items-center gap-2 text-[10px] font-extrabold uppercase tracking-[.2em] text-emerald-300">
                <Icon name="audit" className="size-4" />
                {t('audit.eyebrow')}
              </span>
              <span className="rounded-full border border-cyan-200/15 bg-cyan-300/10 px-2.5 py-1 text-[9px] font-bold text-cyan-100">
                {t('audit.appendOnly')}
              </span>
            </div>
            <h1 className="mt-4 font-[var(--font-display)] text-3xl font-bold tracking-[-.045em] sm:text-[2.55rem]">
              {t('audit.title')}
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-white/50">
              {t('audit.description')}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void load(appliedFilters)}
            disabled={loading}
            className="inline-flex w-fit items-center gap-2 rounded-xl border border-white/10 bg-white/[.06] px-4 py-2.5 text-xs font-bold text-white/75 transition hover:bg-white/10 disabled:cursor-wait disabled:opacity-50"
          >
            <Icon name="refresh" className={`size-4 ${loading ? 'animate-spin' : ''}`} />
            {t('audit.refresh')}
          </button>
        </div>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label={t('audit.metric.loaded')}
          value={String(metrics.total)}
          detail={t('audit.metric.pages')}
          icon="audit"
        />
        <MetricCard
          label={t('audit.metric.denied')}
          value={String(metrics.denied)}
          detail={t('audit.metric.withinLoaded')}
          icon="shield"
          accent="rose"
        />
        <MetricCard
          label={t('audit.metric.actors')}
          value={String(metrics.actors)}
          detail={t('audit.metric.memberships')}
          icon="team"
          accent="cyan"
        />
        <MetricCard
          label={t('audit.metric.newest')}
          value={metrics.newestTime}
          detail={metrics.newestDate}
          icon="clock"
          accent="amber"
        />
      </div>

      <AuditFilters
        t={t}
        draft={draft}
        error={filterError}
        loading={loading}
        onChange={setDraft}
        onApply={applyFilters}
        onClear={clearFilters}
      />

      {error && events.length > 0 ? (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-800"
        >
          <Icon name="warning" className="mt-0.5 size-4 shrink-0" />
          <span>{t('audit.loadedWarning', { error: error.message })}</span>
        </div>
      ) : null}

      <div className={`grid gap-5 ${selectedEvent ? 'xl:grid-cols-[minmax(0,1fr)_24rem]' : ''}`}>
        <SectionCard>
          <div className="flex flex-col gap-2 border-b border-[#edf1ef] px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <div>
              <p className="text-[10px] font-extrabold uppercase tracking-[.18em] text-emerald-700">
                {t('audit.stream.eyebrow')}
              </p>
              <h2 className="mt-1 font-[var(--font-display)] text-xl font-bold tracking-[-.03em] text-[#173128]">
                {t('audit.stream.title')}
              </h2>
            </div>
            <p className="text-[11px] font-medium text-[#7a8a84]">
              {t('audit.stream.count', { count: events.length })}
            </p>
          </div>

          {loading && events.length === 0 ? <LoadingState t={t} /> : null}
          {error && events.length === 0 ? (
            <ErrorState t={t} error={error.message} onRetry={() => void load(appliedFilters)} />
          ) : null}
          {!loading && !error && events.length === 0 ? <EmptyState t={t} /> : null}
          {events.length > 0 ? (
            <AuditEventTable
              events={events}
              locale={locale}
              t={t}
              selectedId={selectedEvent?.id ?? null}
              onSelect={setSelectedEvent}
            />
          ) : null}

          {nextCursor ? (
            <div className="border-t border-[#edf1ef] px-5 py-4 text-center sm:px-6">
              <button
                type="button"
                disabled={loadingMore}
                onClick={() =>
                  void load({ ...appliedFilters, cursor: nextCursor, limit: PAGE_SIZE }, true)
                }
                className="inline-flex items-center gap-2 rounded-xl border border-[#d7e2dd] bg-white px-4 py-2.5 text-xs font-bold text-emerald-800 transition hover:border-emerald-300 hover:bg-emerald-50 disabled:cursor-wait disabled:opacity-50"
              >
                <Icon name="plus" className="size-4" />
                {loadingMore ? t('audit.loadingMore') : t('audit.loadOlder')}
              </button>
            </div>
          ) : null}
        </SectionCard>

        {selectedEvent ? (
          <AuditEventDetails
            event={selectedEvent}
            locale={locale}
            t={t}
            onClose={() => setSelectedEvent(null)}
          />
        ) : null}
      </div>
    </div>
  );
}

function AuditFilters({
  t,
  draft,
  error,
  loading,
  onChange,
  onApply,
  onClear,
}: {
  t: Translator;
  draft: FilterDraft;
  error: string | null;
  loading: boolean;
  onChange: (draft: FilterDraft) => void;
  onApply: (event: FormEvent<HTMLFormElement>) => void;
  onClear: () => void;
}) {
  return (
    <SectionCard>
      <form onSubmit={onApply}>
        <div className="flex items-center justify-between gap-4 border-b border-[#edf1ef] px-5 py-4 sm:px-6">
          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-[.18em] text-emerald-700">
              {t('audit.filters.eyebrow')}
            </p>
            <h2 className="mt-1 font-[var(--font-display)] text-lg font-bold tracking-[-.025em] text-[#173128]">
              {t('audit.filters.title')}
            </h2>
          </div>
          <Icon name="filter" className="size-5 text-emerald-700" />
        </div>
        <div className="grid gap-4 px-5 py-5 sm:grid-cols-2 sm:px-6 lg:grid-cols-4">
          <FilterField label={t('audit.filters.eventType')}>
            <select
              aria-label={t('audit.filters.eventType')}
              value={draft.eventType}
              onChange={(event) =>
                onChange({ ...draft, eventType: event.target.value as FilterDraft['eventType'] })
              }
              className={inputClassName}
            >
              <option value="">{t('audit.filters.allEvents')}</option>
              {AUDIT_EVENT_TYPES.map((eventType) => (
                <option key={eventType} value={eventType}>
                  {t('audit.event.generic')} · {eventType}
                </option>
              ))}
            </select>
          </FilterField>
          <FilterField label={t('audit.filters.outcome')}>
            <select
              aria-label={t('audit.filters.outcome')}
              value={draft.outcome}
              onChange={(event) =>
                onChange({ ...draft, outcome: event.target.value as FilterDraft['outcome'] })
              }
              className={inputClassName}
            >
              <option value="">{t('audit.filters.allOutcomes')}</option>
              {AUDIT_OUTCOMES.map((outcome) => (
                <option key={outcome} value={outcome}>
                  {outcomeLabel(outcome, t)}
                </option>
              ))}
            </select>
          </FilterField>
          <FilterField label={t('audit.filters.from')}>
            <input
              aria-label={t('audit.filters.from')}
              type="datetime-local"
              value={draft.startDate}
              onChange={(event) => onChange({ ...draft, startDate: event.target.value })}
              className={inputClassName}
            />
          </FilterField>
          <FilterField label={t('audit.filters.until')}>
            <input
              aria-label={t('audit.filters.until')}
              type="datetime-local"
              value={draft.endDate}
              onChange={(event) => onChange({ ...draft, endDate: event.target.value })}
              className={inputClassName}
            />
          </FilterField>
          <FilterField label={t('audit.filters.actorId')}>
            <input
              aria-label={t('audit.filters.actorId')}
              value={draft.actorMembershipId}
              onChange={(event) => onChange({ ...draft, actorMembershipId: event.target.value })}
              placeholder="UUID"
              className={inputClassName}
            />
          </FilterField>
          <FilterField label={t('audit.filters.resourceType')}>
            <input
              aria-label={t('audit.filters.resourceType')}
              value={draft.resourceType}
              onChange={(event) => onChange({ ...draft, resourceType: event.target.value })}
              placeholder={t('audit.filters.resourceTypePlaceholder')}
              maxLength={80}
              className={inputClassName}
            />
          </FilterField>
          <FilterField label={t('audit.filters.resourceId')}>
            <input
              aria-label={t('audit.filters.resourceId')}
              value={draft.resourceId}
              onChange={(event) => onChange({ ...draft, resourceId: event.target.value })}
              placeholder={t('audit.filters.resourceIdPlaceholder')}
              maxLength={120}
              className={inputClassName}
            />
          </FilterField>
          <div className="flex items-end gap-2">
            <button
              type="submit"
              disabled={loading}
              className="h-10 flex-1 rounded-xl bg-[#0a342a] px-4 text-xs font-black text-white transition hover:bg-emerald-800 disabled:cursor-wait disabled:opacity-50"
            >
              {t('audit.filters.apply')}
            </button>
            <button
              type="button"
              onClick={onClear}
              disabled={loading}
              className="h-10 rounded-xl border border-[#d9e3df] px-3 text-xs font-bold text-[#587168] transition hover:bg-[#f4f8f6] disabled:opacity-50"
            >
              {t('audit.filters.clear')}
            </button>
          </div>
        </div>
        {error ? (
          <p
            role="alert"
            className="border-t border-rose-100 bg-rose-50 px-6 py-3 text-xs text-rose-700"
          >
            {error}
          </p>
        ) : null}
      </form>
    </SectionCard>
  );
}

function FilterField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="space-y-2">
      <span className="block text-[10px] font-extrabold uppercase tracking-[.12em] text-[#74857f]">
        {label}
      </span>
      {children}
    </label>
  );
}

function AuditEventTable({
  events,
  locale,
  t,
  selectedId,
  onSelect,
}: {
  events: readonly AuditEvent[];
  locale: string;
  t: Translator;
  selectedId: string | null;
  onSelect: (event: AuditEvent) => void;
}) {
  return (
    <>
      {/* Desktop/tablet: full table. Below lg, a stacked card list takes
          over instead of forcing horizontal scroll across 5 columns --
          same convention established in Task 4 for the inventory,
          reservation, and expiry-worklist tables. */}
      <div className="hidden overflow-x-auto lg:block">
        <table className="w-full min-w-[860px] border-collapse text-left">
          <thead>
            <tr className="border-b border-[#edf1ef] bg-[#fbfcfb] text-[10px] font-extrabold uppercase tracking-[.13em] text-[#8a9994]">
              <th className="px-6 py-3.5" scope="col">
                {t('audit.table.event')}
              </th>
              <th className="px-4 py-3.5" scope="col">
                {t('audit.table.outcome')}
              </th>
              <th className="px-4 py-3.5" scope="col">
                {t('audit.table.resource')}
              </th>
              <th className="px-4 py-3.5" scope="col">
                {t('audit.table.actor')}
              </th>
              <th className="px-6 py-3.5" scope="col">
                {t('audit.table.occurred')}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#edf1ef]">
            {events.map((event) => (
              <tr
                key={event.id}
                className={`transition ${selectedId === event.id ? 'bg-emerald-50/70' : 'hover:bg-[#fbfdfc]'}`}
              >
                <td className="px-6 py-4">
                  <button
                    type="button"
                    onClick={() => onSelect(event)}
                    aria-label={t('audit.event.view', { event: event.eventType })}
                    className="group text-left"
                  >
                    <span className="block text-xs font-bold text-[#17372d] group-hover:text-emerald-700">
                      {t('audit.event.generic')}
                    </span>
                    <span className="mt-1 block font-mono text-[9px] text-[#889791]">
                      {event.eventType} · {abbreviate(event.id, 18)}
                    </span>
                  </button>
                </td>
                <td className="px-4 py-4">
                  <OutcomeBadge outcome={event.outcome} t={t} />
                </td>
                <td className="px-4 py-4 text-[11px] text-[#60756d]">
                  {event.resourceType && event.resourceId ? (
                    <>
                      <span className="block font-bold text-[#365248]">{event.resourceType}</span>
                      <span className="mt-1 block font-mono text-[9px]">
                        {abbreviate(event.resourceId, 18)}
                      </span>
                    </>
                  ) : (
                    <span className="text-[#9aa7a2]">{t('audit.notAttached')}</span>
                  )}
                </td>
                <td className="px-4 py-4 font-mono text-[9px] text-[#71837c]">
                  {event.actorMembershipId
                    ? abbreviate(event.actorMembershipId, 18)
                    : t('audit.system')}
                </td>
                <td className="px-6 py-4 text-[11px] text-[#536c63]">
                  <span className="block font-bold">{formatDate(event.occurredAt, locale)}</span>
                  <span className="mt-1 block text-[9px] text-[#8b9994]">
                    {formatTime(event.occurredAt, locale)}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="divide-y divide-[#edf1ef] lg:hidden">
        {events.map((event) => (
          <li key={event.id} className={selectedId === event.id ? 'bg-emerald-50/70' : ''}>
            <button
              type="button"
              onClick={() => onSelect(event)}
              aria-label={t('audit.event.view', { event: event.eventType })}
              className="block w-full p-4 text-left sm:p-5"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <span className="block text-xs font-bold text-[#17372d]">
                    {t('audit.event.generic')}
                  </span>
                  <span className="mt-1 block font-mono text-[9px] text-[#889791]">
                    {event.eventType} · {abbreviate(event.id, 18)}
                  </span>
                </div>
                <OutcomeBadge outcome={event.outcome} t={t} />
              </div>
              <p className="mt-2 text-[11px] text-[#60756d]">
                {event.resourceType && event.resourceId ? (
                  <>
                    <span className="font-bold text-[#365248]">{event.resourceType}</span>{' '}
                    <span className="font-mono text-[9px]">{abbreviate(event.resourceId, 18)}</span>
                  </>
                ) : (
                  <span className="text-[#9aa7a2]">{t('audit.noResource')}</span>
                )}
              </p>
              <p className="mt-2 text-[11px] text-[#536c63]">
                {t('audit.mobile.timeline', {
                  date: formatDate(event.occurredAt, locale),
                  time: formatTime(event.occurredAt, locale),
                  actor: event.actorMembershipId
                    ? abbreviate(event.actorMembershipId, 18)
                    : t('audit.system'),
                })}
              </p>
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}

function AuditEventDetails({
  event,
  locale,
  t,
  onClose,
}: {
  event: AuditEvent;
  locale: string;
  t: Translator;
  onClose: () => void;
}) {
  const metadata = Object.entries(event.metadata);
  return (
    <aside
      className="h-fit overflow-hidden rounded-[1.4rem] border border-[#dfe7e3] bg-white shadow-[0_18px_60px_rgba(24,57,47,.08)] xl:sticky xl:top-24"
      aria-label={t('audit.details.aria')}
    >
      <div className="flex items-start justify-between gap-4 bg-[#0a2a22] px-5 py-5 text-white">
        <div>
          <p className="text-[9px] font-extrabold uppercase tracking-[.18em] text-emerald-300">
            {t('audit.details.eyebrow')}
          </p>
          <h2 className="mt-2 text-sm font-bold leading-5">
            {t('audit.event.generic')} · <code>{event.eventType}</code>
          </h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={t('audit.details.close')}
          className="grid size-8 shrink-0 place-items-center rounded-lg bg-white/[.07] text-white/60 hover:bg-white/10 hover:text-white"
        >
          <Icon name="close" className="size-4" />
        </button>
      </div>
      <div className="space-y-5 px-5 py-5">
        <OutcomeBadge outcome={event.outcome} t={t} />
        <DetailItem
          label={t('audit.details.occurred')}
          value={`${formatDate(event.occurredAt, locale)} · ${formatTime(event.occurredAt, locale)}`}
        />
        <DetailItem label={t('audit.details.eventId')} value={event.id} mono />
        <DetailItem
          label={t('audit.details.actorMembership')}
          value={event.actorMembershipId ?? t('audit.details.systemActor')}
          mono={Boolean(event.actorMembershipId)}
        />
        <DetailItem
          label={t('audit.details.requestId')}
          value={event.requestId ?? t('audit.details.notRecorded')}
          mono={Boolean(event.requestId)}
        />
        <DetailItem
          label={t('audit.details.resource')}
          value={
            event.resourceType && event.resourceId
              ? `${event.resourceType} · ${event.resourceId}`
              : t('audit.notAttached')
          }
          mono={Boolean(event.resourceId)}
        />
        <div>
          <p className="text-[9px] font-extrabold uppercase tracking-[.14em] text-[#899791]">
            {t('audit.details.metadata')}
          </p>
          {metadata.length > 0 ? (
            <dl className="mt-2 divide-y divide-[#edf1ef] rounded-xl border border-[#e2e9e6] bg-[#fbfcfb] px-3">
              {metadata.map(([key, value]) => (
                <div
                  key={key}
                  className="flex items-start justify-between gap-3 py-2.5 text-[10px]"
                >
                  <dt className="font-bold text-[#6d8079]">{key}</dt>
                  <dd className="max-w-[60%] break-words text-right font-mono text-[#27483d]">
                    {String(value)}
                  </dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="mt-2 text-[11px] text-[#82918c]">{t('audit.details.noMetadata')}</p>
          )}
        </div>
        <p className="rounded-xl bg-emerald-50 px-3 py-3 text-[10px] leading-5 text-emerald-800">
          {t('audit.details.immutable')}
        </p>
      </div>
    </aside>
  );
}

function DetailItem({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <p className="text-[9px] font-extrabold uppercase tracking-[.14em] text-[#899791]">{label}</p>
      <p
        className={`mt-1.5 break-words text-[11px] leading-5 text-[#2b4a40] ${mono ? 'font-mono' : 'font-semibold'}`}
      >
        {value}
      </p>
    </div>
  );
}

function OutcomeBadge({ outcome, t }: { outcome: AuditOutcome; t: Translator }) {
  const tone = outcome === 'SUCCEEDED' ? 'emerald' : outcome === 'DENIED' ? 'rose' : 'amber';
  return <StatusBadge tone={tone}>{outcomeLabel(outcome, t)}</StatusBadge>;
}

function AuditAccessDenied({ t, onRetry }: { t: Translator; onRetry: () => void }) {
  return (
    <div className="mx-auto max-w-3xl rounded-[1.75rem] border border-[#dfe7e3] bg-white px-6 py-16 text-center shadow-[0_24px_70px_rgba(20,52,42,.08)] sm:px-10">
      <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-amber-50 text-amber-700">
        <Icon name="shield" className="size-6" />
      </span>
      <p className="mt-5 text-[10px] font-extrabold uppercase tracking-[.18em] text-amber-700">
        {t('audit.access.eyebrow')}
      </p>
      <h1 className="mt-2 font-[var(--font-display)] text-2xl font-bold tracking-[-.035em] text-[#173128]">
        {t('audit.access.title')}
      </h1>
      <p className="mx-auto mt-3 max-w-xl text-sm leading-7 text-[#71827c]">
        {t('audit.access.detailPrefix')}{' '}
        <code className="rounded bg-[#f2f5f4] px-1.5 py-1 text-[11px]">audit.events.read</code>{' '}
        {t('audit.access.detailSuffix')}
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-6 rounded-xl bg-[#0a342a] px-4 py-2.5 text-xs font-bold text-white"
      >
        {t('audit.access.retry')}
      </button>
    </div>
  );
}

function LoadingState({ t }: { t: Translator }) {
  return (
    <div className="space-y-3 px-6 py-7" aria-label={t('audit.loading')}>
      {[0, 1, 2, 3].map((item) => (
        <div key={item} className="h-14 animate-pulse rounded-xl bg-[#f0f4f2]" />
      ))}
    </div>
  );
}

function ErrorState({ t, error, onRetry }: { t: Translator; error: string; onRetry: () => void }) {
  return (
    <div role="alert" className="px-6 py-16 text-center">
      <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-rose-50 text-rose-700">
        <Icon name="warning" className="size-5" />
      </span>
      <p className="mt-4 text-sm font-bold text-[#28463c]">{t('audit.error.title')}</p>
      <p className="mx-auto mt-2 max-w-lg text-xs leading-6 text-[#7c8c86]">{error}</p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-5 rounded-xl border border-[#d7e2dd] px-4 py-2.5 text-xs font-bold text-emerald-800"
      >
        {t('audit.tryAgain')}
      </button>
    </div>
  );
}

function EmptyState({ t }: { t: Translator }) {
  return (
    <div className="px-6 py-16 text-center">
      <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-emerald-50 text-emerald-700">
        <Icon name="audit" className="size-5" />
      </span>
      <p className="mt-4 text-sm font-bold text-[#28463c]">{t('audit.empty.title')}</p>
      <p className="mt-2 text-xs text-[#7c8c86]">{t('audit.empty.detail')}</p>
    </div>
  );
}

function validateFilterDraft(draft: FilterDraft, t: Translator): string | null {
  if (Boolean(draft.resourceType.trim()) !== Boolean(draft.resourceId.trim()))
    return t('audit.validation.resourcePair');
  if (
    draft.actorMembershipId.trim() &&
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      draft.actorMembershipId.trim(),
    )
  )
    return t('audit.validation.actorId');
  if (
    draft.startDate &&
    draft.endDate &&
    new Date(draft.startDate).getTime() > new Date(draft.endDate).getTime()
  )
    return t('audit.validation.dateOrder');
  return null;
}

function toFilters(draft: FilterDraft): AuditEventFilters {
  return {
    ...(draft.eventType ? { eventType: draft.eventType } : {}),
    ...(draft.outcome ? { outcome: draft.outcome } : {}),
    ...(draft.actorMembershipId.trim()
      ? { actorMembershipId: draft.actorMembershipId.trim() }
      : {}),
    ...(draft.resourceType.trim()
      ? { resourceType: draft.resourceType.trim(), resourceId: draft.resourceId.trim() }
      : {}),
    ...(draft.startDate ? { startDate: new Date(draft.startDate).toISOString() } : {}),
    ...(draft.endDate ? { endDate: new Date(draft.endDate).toISOString() } : {}),
    limit: PAGE_SIZE,
  };
}

function loadedMetrics(events: readonly AuditEvent[], locale: string, t: Translator) {
  const newest = events[0];
  return {
    total: events.length,
    denied: events.filter((event) => event.outcome === 'DENIED').length,
    actors: new Set(
      events.flatMap((event) => (event.actorMembershipId ? [event.actorMembershipId] : [])),
    ).size,
    newestTime: newest ? formatTime(newest.occurredAt, locale) : '—',
    newestDate: newest ? formatDate(newest.occurredAt, locale) : t('audit.metric.none'),
  };
}

function mergeEvents(
  current: readonly AuditEvent[],
  incoming: readonly AuditEvent[],
): AuditEvent[] {
  const known = new Set(current.map((event) => event.id));
  return [...current, ...incoming.filter((event) => !known.has(event.id))];
}

function formatDate(value: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value));
}

function formatTime(value: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }).format(
    new Date(value),
  );
}

function abbreviate(value: string, maximum: number): string {
  return value.length <= maximum ? value : `${value.slice(0, maximum - 1)}…`;
}

const inputClassName =
  'h-10 w-full rounded-xl border border-[#dbe4e0] bg-[#fbfcfb] px-3 text-xs text-[#18352c] placeholder:text-[#93a09c] focus:border-emerald-500';

type Translator = (key: TranslationKey, values?: TranslationValues) => string;

function outcomeLabel(outcome: AuditOutcome, t: Translator): string {
  const keyByOutcome: Record<AuditOutcome, TranslationKey> = {
    SUCCEEDED: 'audit.outcome.succeeded',
    DENIED: 'audit.outcome.denied',
    FAILED: 'audit.outcome.failed',
  };
  return t(keyByOutcome[outcome]);
}
