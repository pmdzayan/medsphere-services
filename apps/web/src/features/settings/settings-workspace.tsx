'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Icon } from '@/components/platform/icon';
import { MetricCard, SectionCard, StatusBadge } from '@/components/platform/dashboard-primitives';
import {
  getPrivacyPreferences,
  getSupportedLanguages,
  updatePreferredLanguage,
  updatePrivacyPreferences,
} from '@/lib/api-client';
import type {
  PrivacyPreferences,
  PrivacyPreferenceUpdate,
  SupportedLanguage,
  SupportedLanguageCode,
} from '@/lib/settings-contract';

interface SettingsIdentity {
  readonly name: string;
  readonly email: string;
  readonly tenantSlug: string;
  readonly tenantId: string;
  readonly membershipId: string;
}

const privacyOptions: Array<{
  key: keyof PrivacyPreferences;
  title: string;
  description: string;
  tone: 'emerald' | 'cyan' | 'amber';
}> = [
  {
    key: 'hideSensitiveNotifications',
    title: 'Hide sensitive notification previews',
    description: 'Reduce sensitive detail shown in notification previews where supported.',
    tone: 'emerald',
  },
  {
    key: 'privatePickup',
    title: 'Private medicine pickup',
    description: 'Request privacy-aware pickup handling in workflows that support this preference.',
    tone: 'cyan',
  },
  {
    key: 'allowInAppChat',
    title: 'Allow in-app chat',
    description: 'Allow approved MedSphere workflows to contact you through in-app chat.',
    tone: 'emerald',
  },
  {
    key: 'shareEmail',
    title: 'Share email',
    description: 'Allow your email to be used when an accepted care workflow requests it.',
    tone: 'amber',
  },
  {
    key: 'sharePhone',
    title: 'Share phone number',
    description: 'Allow your phone number to be used when an accepted care workflow requests it.',
    tone: 'amber',
  },
];

export function SettingsWorkspace({ identity }: { identity: SettingsIdentity }) {
  const [privacy, setPrivacy] = useState<PrivacyPreferences | null>(null);
  const [privacyDraft, setPrivacyDraft] = useState<PrivacyPreferences | null>(null);
  const [languages, setLanguages] = useState<SupportedLanguage[]>([]);
  const [selectedLanguage, setSelectedLanguage] = useState<'' | SupportedLanguageCode>('');
  const [loading, setLoading] = useState(true);
  const [savingPrivacy, setSavingPrivacy] = useState(false);
  const [savingLanguage, setSavingLanguage] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [privacyNotice, setPrivacyNotice] = useState<string | null>(null);
  const [languageNotice, setLanguageNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [nextPrivacy, nextLanguages] = await Promise.all([
        getPrivacyPreferences(),
        getSupportedLanguages(),
      ]);
      setPrivacy(nextPrivacy);
      setPrivacyDraft(nextPrivacy);
      setLanguages(nextLanguages);
    } catch (loadError) {
      setPrivacy(null);
      setPrivacyDraft(null);
      setLanguages([]);
      setError(loadError instanceof Error ? loadError.message : 'Unable to load settings.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const privacyChanges = useMemo(
    () => (privacy && privacyDraft ? changedPreferences(privacy, privacyDraft) : {}),
    [privacy, privacyDraft],
  );
  const privacyDirty = Object.keys(privacyChanges).length > 0;
  const enabledProtections = privacyDraft
    ? Number(privacyDraft.hideSensitiveNotifications) + Number(privacyDraft.privatePickup)
    : 0;

  async function savePrivacy() {
    if (!privacyDirty) return;
    setSavingPrivacy(true);
    setPrivacyNotice(null);
    try {
      const saved = await updatePrivacyPreferences(privacyChanges);
      setPrivacy(saved);
      setPrivacyDraft(saved);
      setPrivacyNotice('Privacy preferences saved.');
    } catch (saveError) {
      setPrivacyNotice(
        saveError instanceof Error ? saveError.message : 'Unable to save privacy preferences.',
      );
    } finally {
      setSavingPrivacy(false);
    }
  }

  async function saveLanguage() {
    if (!selectedLanguage) return;
    setSavingLanguage(true);
    setLanguageNotice(null);
    try {
      const response = await updatePreferredLanguage({ preferredLanguage: selectedLanguage });
      setLanguageNotice(response.message);
    } catch (saveError) {
      setLanguageNotice(
        saveError instanceof Error ? saveError.message : 'Unable to update language.',
      );
    } finally {
      setSavingLanguage(false);
    }
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
                <Icon name="settings" className="size-4" />
                Personal control centre
              </span>
              <span className="rounded-full border border-cyan-200/15 bg-cyan-300/10 px-2.5 py-1 text-[9px] font-bold text-cyan-100">
                Authenticated settings
              </span>
            </div>
            <h1 className="mt-4 font-[var(--font-display)] text-3xl font-bold tracking-[-.045em] sm:text-[2.55rem]">
              Privacy &amp; preferences
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-white/50">
              Review the identity bound to this session and control the personal preferences exposed
              by MedSphere&apos;s accepted account APIs.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="inline-flex w-fit items-center gap-2 rounded-xl border border-white/10 bg-white/[.06] px-4 py-2.5 text-xs font-bold text-white/75 transition hover:bg-white/10 disabled:cursor-wait disabled:opacity-50"
          >
            <Icon name="refresh" className={`size-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh settings
          </button>
        </div>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Privacy controls"
          value="5"
          detail="Accepted personal preferences"
          icon="shield"
        />
        <MetricCard
          label="Protection options"
          value={loading ? '—' : `${enabledProtections}/2`}
          detail="Sensitive preview and pickup"
          icon="key"
          accent="cyan"
        />
        <MetricCard
          label="Supported languages"
          value={loading ? '—' : String(languages.length)}
          detail="Provided by the language service"
          icon="documents"
          accent="amber"
        />
        <MetricCard
          label="Session context"
          value="Verified"
          detail="Signed identity and tenant"
          icon="team"
          accent="emerald"
        />
      </div>

      {error ? <SettingsError message={error} onRetry={() => void load()} /> : null}
      {loading && !error ? <SettingsLoading /> : null}

      {!loading && !error && privacyDraft ? (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(20rem,.65fr)]">
          <PrivacyPanel
            draft={privacyDraft}
            dirty={privacyDirty}
            saving={savingPrivacy}
            notice={privacyNotice}
            onChange={setPrivacyDraft}
            onReset={() => {
              setPrivacyDraft(privacy);
              setPrivacyNotice(null);
            }}
            onSave={() => void savePrivacy()}
          />

          <div className="space-y-5">
            <IdentityPanel identity={identity} />
            <LanguagePanel
              languages={languages}
              selected={selectedLanguage}
              saving={savingLanguage}
              notice={languageNotice}
              onSelect={setSelectedLanguage}
              onSave={() => void saveLanguage()}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}

function PrivacyPanel({
  draft,
  dirty,
  saving,
  notice,
  onChange,
  onReset,
  onSave,
}: {
  draft: PrivacyPreferences;
  dirty: boolean;
  saving: boolean;
  notice: string | null;
  onChange: (value: PrivacyPreferences) => void;
  onReset: () => void;
  onSave: () => void;
}) {
  return (
    <SectionCard>
      <div className="flex flex-col gap-3 border-b border-[#edf1ef] px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div>
          <p className="text-[10px] font-extrabold uppercase tracking-[.18em] text-emerald-700">
            Personal privacy
          </p>
          <h2 className="mt-1 font-[var(--font-display)] text-xl font-bold tracking-[-.03em] text-[#173128]">
            Preference controls
          </h2>
        </div>
        <StatusBadge tone={dirty ? 'amber' : 'emerald'}>
          {dirty ? 'Unsaved changes' : 'Saved'}
        </StatusBadge>
      </div>

      <div className="divide-y divide-[#edf1ef] px-5 sm:px-6">
        {privacyOptions.map((option) => (
          <PreferenceToggle
            key={option.key}
            title={option.title}
            description={option.description}
            tone={option.tone}
            checked={draft[option.key]}
            onToggle={() => onChange({ ...draft, [option.key]: !draft[option.key] })}
          />
        ))}
      </div>

      <div className="flex flex-col gap-3 border-t border-[#edf1ef] bg-[#fbfcfb] px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p aria-live="polite" className="min-h-5 text-xs text-[#60756d]">
          {notice ?? 'Changes are sent only when you choose Save preferences.'}
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onReset}
            disabled={!dirty || saving}
            className="rounded-xl border border-[#d7e2dd] bg-white px-4 py-2.5 text-xs font-bold text-[#587168] transition hover:bg-[#f4f8f6] disabled:cursor-not-allowed disabled:opacity-45"
          >
            Reset
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={!dirty || saving}
            className="rounded-xl bg-[#0a342a] px-4 py-2.5 text-xs font-black text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-45"
          >
            {saving ? 'Saving…' : 'Save preferences'}
          </button>
        </div>
      </div>
    </SectionCard>
  );
}

function PreferenceToggle({
  title,
  description,
  tone,
  checked,
  onToggle,
}: {
  title: string;
  description: string;
  tone: 'emerald' | 'cyan' | 'amber';
  checked: boolean;
  onToggle: () => void;
}) {
  const iconTone = {
    emerald: 'bg-emerald-50 text-emerald-700',
    cyan: 'bg-cyan-50 text-cyan-700',
    amber: 'bg-amber-50 text-amber-700',
  }[tone];
  return (
    <div className="flex items-start gap-4 py-5">
      <span className={`grid size-10 shrink-0 place-items-center rounded-xl ${iconTone}`}>
        <Icon name={tone === 'amber' ? 'team' : 'shield'} className="size-[1.1rem]" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-[#23463b]">{title}</p>
        <p className="mt-1 max-w-2xl text-xs leading-5 text-[#7a8b84]">{description}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={title}
        onClick={onToggle}
        className={`relative mt-1 h-7 w-12 shrink-0 rounded-full transition ${checked ? 'bg-emerald-600' : 'bg-[#cfd9d5]'}`}
      >
        <span
          className={`absolute top-1 size-5 rounded-full bg-white shadow-sm transition-transform ${checked ? 'left-6' : 'left-1'}`}
        />
      </button>
    </div>
  );
}

function IdentityPanel({ identity }: { identity: SettingsIdentity }) {
  return (
    <SectionCard>
      <div className="bg-[#0a2a22] px-5 py-5 text-white">
        <p className="text-[9px] font-extrabold uppercase tracking-[.18em] text-emerald-300">
          Read-only identity
        </p>
        <h2 className="mt-2 font-[var(--font-display)] text-xl font-bold tracking-[-.03em]">
          {identity.name}
        </h2>
        <p className="mt-1 text-xs text-white/45">{identity.email}</p>
      </div>
      <dl className="divide-y divide-[#edf1ef] px-5">
        <IdentityItem label="Organization" value={formatTenant(identity.tenantSlug)} />
        <IdentityItem label="Tenant" value={abbreviate(identity.tenantId)} mono />
        <IdentityItem label="Membership" value={abbreviate(identity.membershipId)} mono />
      </dl>
      <p className="border-t border-[#edf1ef] bg-emerald-50 px-5 py-3 text-[10px] leading-5 text-emerald-800">
        Identity and tenant context come from the signed session and cannot be changed here.
      </p>
    </SectionCard>
  );
}

function IdentityItem({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-3.5 text-xs">
      <dt className="font-semibold text-[#7a8984]">{label}</dt>
      <dd className={`text-right text-[#2b4b40] ${mono ? 'font-mono text-[10px]' : 'font-bold'}`}>
        {value}
      </dd>
    </div>
  );
}

function LanguagePanel({
  languages,
  selected,
  saving,
  notice,
  onSelect,
  onSave,
}: {
  languages: readonly SupportedLanguage[];
  selected: '' | SupportedLanguageCode;
  saving: boolean;
  notice: string | null;
  onSelect: (value: '' | SupportedLanguageCode) => void;
  onSave: () => void;
}) {
  return (
    <SectionCard>
      <div className="border-b border-[#edf1ef] px-5 py-5">
        <p className="text-[10px] font-extrabold uppercase tracking-[.18em] text-emerald-700">
          Language
        </p>
        <h2 className="mt-1 font-[var(--font-display)] text-lg font-bold tracking-[-.025em] text-[#173128]">
          Preferred language
        </h2>
      </div>
      <div className="space-y-4 px-5 py-5">
        <label className="block space-y-2">
          <span className="text-[10px] font-extrabold uppercase tracking-[.12em] text-[#74857f]">
            Choose a language
          </span>
          <select
            aria-label="Preferred language"
            value={selected}
            onChange={(event) => onSelect(event.target.value as '' | SupportedLanguageCode)}
            className="h-11 w-full rounded-xl border border-[#dbe4e0] bg-[#fbfcfb] px-3 text-xs text-[#18352c] focus:border-emerald-500"
          >
            <option value="">Select language</option>
            {languages.map((language) => (
              <option key={language.code} value={language.code}>
                {language.name}
              </option>
            ))}
          </select>
        </label>
        <p className="text-[10px] leading-5 text-[#82918c]">
          The accepted API can update this preference but does not expose the currently stored
          value. This screen will not guess it.
        </p>
        <button
          type="button"
          onClick={onSave}
          disabled={!selected || saving}
          className="w-full rounded-xl bg-[#0a342a] px-4 py-2.5 text-xs font-black text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-45"
        >
          {saving ? 'Updating…' : 'Update language'}
        </button>
        <p aria-live="polite" className="min-h-5 text-xs text-[#60756d]">
          {notice}
        </p>
      </div>
    </SectionCard>
  );
}

function SettingsLoading() {
  return (
    <div
      className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(20rem,.65fr)]"
      aria-label="Loading settings"
    >
      <div className="h-[32rem] animate-pulse rounded-[1.4rem] bg-white" />
      <div className="space-y-5">
        <div className="h-72 animate-pulse rounded-[1.4rem] bg-white" />
        <div className="h-64 animate-pulse rounded-[1.4rem] bg-white" />
      </div>
    </div>
  );
}

function SettingsError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div
      role="alert"
      className="rounded-[1.4rem] border border-rose-200 bg-white px-6 py-14 text-center"
    >
      <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-rose-50 text-rose-700">
        <Icon name="warning" className="size-5" />
      </span>
      <p className="mt-4 text-sm font-bold text-[#28463c]">Settings could not be loaded</p>
      <p className="mx-auto mt-2 max-w-lg text-xs leading-6 text-[#7c8c86]">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-5 rounded-xl border border-[#d7e2dd] px-4 py-2.5 text-xs font-bold text-emerald-800"
      >
        Try again
      </button>
    </div>
  );
}

function changedPreferences(
  saved: PrivacyPreferences,
  draft: PrivacyPreferences,
): PrivacyPreferenceUpdate {
  return privacyOptions.reduce<PrivacyPreferenceUpdate>((changes, option) => {
    if (saved[option.key] !== draft[option.key]) changes[option.key] = draft[option.key];
    return changes;
  }, {});
}

function formatTenant(slug: string): string {
  return slug
    .split('-')
    .map((part) => `${part[0]?.toUpperCase() ?? ''}${part.slice(1)}`)
    .join(' ');
}

function abbreviate(value: string): string {
  return value.length <= 18 ? value : `${value.slice(0, 17)}…`;
}
