'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Icon } from '@/components/platform/icon';
import { MetricCard, SectionCard, StatusBadge } from '@/components/platform/dashboard-primitives';
import { useLanguage } from '@/components/language-provider';
import { isLocale, type TranslationKey } from '@/lib/i18n';
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
import { DevicePermissionsSection } from './device-permissions-section';

interface SettingsIdentity {
  readonly name: string;
  readonly email: string;
  readonly tenantName: string;
  readonly tenantId: string;
  readonly membershipId: string;
}

const privacyOptions: Array<{
  key: keyof PrivacyPreferences;
  titleKey: TranslationKey;
  descriptionKey: TranslationKey;
  tone: 'emerald' | 'cyan' | 'amber';
}> = [
  {
    key: 'hideSensitiveNotifications',
    titleKey: 'settings.privacy.hidePreview.title',
    descriptionKey: 'settings.privacy.hidePreview.description',
    tone: 'emerald',
  },
  {
    key: 'privatePickup',
    titleKey: 'settings.privacy.privatePickup.title',
    descriptionKey: 'settings.privacy.privatePickup.description',
    tone: 'cyan',
  },
  {
    key: 'allowInAppChat',
    titleKey: 'settings.privacy.chat.title',
    descriptionKey: 'settings.privacy.chat.description',
    tone: 'emerald',
  },
  {
    key: 'shareEmail',
    titleKey: 'settings.privacy.email.title',
    descriptionKey: 'settings.privacy.email.description',
    tone: 'amber',
  },
  {
    key: 'sharePhone',
    titleKey: 'settings.privacy.phone.title',
    descriptionKey: 'settings.privacy.phone.description',
    tone: 'amber',
  },
  {
    key: 'wantsReservationNotifications',
    titleKey: 'settings.privacy.reservationNotifications.title',
    descriptionKey: 'settings.privacy.reservationNotifications.description',
    tone: 'emerald',
  },
  {
    key: 'wantsOperationalAlerts',
    titleKey: 'settings.privacy.operationalAlerts.title',
    descriptionKey: 'settings.privacy.operationalAlerts.description',
    tone: 'cyan',
  },
];

export function SettingsWorkspace({ identity }: { identity: SettingsIdentity }) {
  const { setLocale, t } = useLanguage();
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
      setError(t('settings.error.load'));
    } finally {
      setLoading(false);
    }
  }, [t]);

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
      setPrivacyNotice(t('settings.notice.privacySaved'));
    } catch (saveError) {
      setPrivacyNotice(t('settings.error.savePrivacy'));
    } finally {
      setSavingPrivacy(false);
    }
  }

  async function saveLanguage() {
    if (!selectedLanguage) return;
    setSavingLanguage(true);
    setLanguageNotice(null);
    try {
      await updatePreferredLanguage({ preferredLanguage: selectedLanguage });
      setLanguageNotice(t('settings.notice.languageSaved'));
      // The Settings panel persists the preference server-side; it must
      // also update the live, rendered UI immediately (the same
      // requirement the top-navigation LanguageSelector already meets),
      // not only take effect after a future page reload.
      if (isLocale(selectedLanguage)) {
        setLocale(selectedLanguage, { persist: false });
      }
    } catch (saveError) {
      setLanguageNotice(t('settings.error.saveLanguage'));
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
                {t('settings.hero.eyebrow')}
              </span>
              <span className="rounded-full border border-cyan-200/15 bg-cyan-300/10 px-2.5 py-1 text-[9px] font-bold text-cyan-100">
                {t('settings.hero.badge')}
              </span>
            </div>
            <h1 className="mt-4 font-[var(--font-display)] text-3xl font-bold tracking-[-.045em] sm:text-[2.55rem]">
              {t('settings.hero.title')}
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-white/50">
              {t('settings.hero.description')}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="inline-flex w-fit items-center gap-2 rounded-xl border border-white/10 bg-white/[.06] px-4 py-2.5 text-xs font-bold text-white/75 transition hover:bg-white/10 disabled:cursor-wait disabled:opacity-50"
          >
            <Icon name="refresh" className={`size-4 ${loading ? 'animate-spin' : ''}`} />
            {t('settings.refresh')}
          </button>
        </div>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label={t('settings.metric.privacy')}
          value="5"
          detail={t('settings.metric.privacyDetail')}
          icon="shield"
        />
        <MetricCard
          label={t('settings.metric.protection')}
          value={loading ? '—' : `${enabledProtections}/2`}
          detail={t('settings.metric.protectionDetail')}
          icon="key"
          accent="cyan"
        />
        <MetricCard
          label={t('settings.metric.languages')}
          value={loading ? '—' : String(languages.length)}
          detail={t('settings.metric.languagesDetail')}
          icon="documents"
          accent="amber"
        />
        <MetricCard
          label={t('settings.metric.session')}
          value={t('settings.metric.verified')}
          detail={t('settings.metric.sessionDetail')}
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
            <DevicePermissionsSection />
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
  const { t } = useLanguage();
  return (
    <SectionCard>
      <div className="flex flex-col gap-3 border-b border-[#edf1ef] px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div>
          <p className="text-[10px] font-extrabold uppercase tracking-[.18em] text-emerald-700">
            {t('settings.privacy.eyebrow')}
          </p>
          <h2 className="mt-1 font-[var(--font-display)] text-xl font-bold tracking-[-.03em] text-[#173128]">
            {t('settings.privacy.title')}
          </h2>
        </div>
        <StatusBadge tone={dirty ? 'amber' : 'emerald'}>
          {dirty ? t('settings.privacy.unsaved') : t('settings.privacy.saved')}
        </StatusBadge>
      </div>

      <div className="divide-y divide-[#edf1ef] px-5 sm:px-6">
        {privacyOptions.map((option) => (
          <PreferenceToggle
            key={option.key}
            title={t(option.titleKey)}
            description={t(option.descriptionKey)}
            tone={option.tone}
            checked={draft[option.key]}
            onToggle={() => onChange({ ...draft, [option.key]: !draft[option.key] })}
          />
        ))}
      </div>

      <div className="flex flex-col gap-3 border-t border-[#edf1ef] bg-[#fbfcfb] px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p aria-live="polite" className="min-h-5 text-xs text-[#60756d]">
          {notice ?? t('settings.privacy.pending')}
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onReset}
            disabled={!dirty || saving}
            className="rounded-xl border border-[#d7e2dd] bg-white px-4 py-2.5 text-xs font-bold text-[#587168] transition hover:bg-[#f4f8f6] disabled:cursor-not-allowed disabled:opacity-45"
          >
            {t('settings.privacy.reset')}
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={!dirty || saving}
            className="rounded-xl bg-[#0a342a] px-4 py-2.5 text-xs font-black text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-45"
          >
            {saving ? t('settings.privacy.saving') : t('settings.privacy.save')}
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
  const { t } = useLanguage();
  return (
    <SectionCard>
      <div className="bg-[#0a2a22] px-5 py-5 text-white">
        <p className="text-[9px] font-extrabold uppercase tracking-[.18em] text-emerald-300">
          {t('settings.identity.eyebrow')}
        </p>
        <h2 className="mt-2 font-[var(--font-display)] text-xl font-bold tracking-[-.03em]">
          {identity.name}
        </h2>
        <p className="mt-1 text-xs text-white/45">{identity.email}</p>
      </div>
      <dl className="divide-y divide-[#edf1ef] px-5">
        <IdentityItem label={t('settings.identity.organization')} value={identity.tenantName} />
        <IdentityItem
          label={t('settings.identity.tenant')}
          value={abbreviate(identity.tenantId)}
          mono
        />
        <IdentityItem
          label={t('settings.identity.membership')}
          value={abbreviate(identity.membershipId)}
          mono
        />
      </dl>
      <p className="border-t border-[#edf1ef] bg-emerald-50 px-5 py-3 text-[10px] leading-5 text-emerald-800">
        {t('settings.identity.boundary')}
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
  const { t } = useLanguage();
  return (
    <SectionCard>
      <div className="border-b border-[#edf1ef] px-5 py-5">
        <p className="text-[10px] font-extrabold uppercase tracking-[.18em] text-emerald-700">
          {t('settings.language.eyebrow')}
        </p>
        <h2 className="mt-1 font-[var(--font-display)] text-lg font-bold tracking-[-.025em] text-[#173128]">
          {t('settings.language.title')}
        </h2>
      </div>
      <div className="space-y-4 px-5 py-5">
        <label className="block space-y-2">
          <span className="text-[10px] font-extrabold uppercase tracking-[.12em] text-[#74857f]">
            {t('settings.language.choose')}
          </span>
          <select
            aria-label={t('settings.language.title')}
            value={selected}
            onChange={(event) => onSelect(event.target.value as '' | SupportedLanguageCode)}
            className="h-11 w-full rounded-xl border border-[#dbe4e0] bg-[#fbfcfb] px-3 text-xs text-[#18352c] focus:border-emerald-500"
          >
            <option value="">{t('settings.language.select')}</option>
            {languages.map((language) => (
              <option key={language.code} value={language.code}>
                {language.name}
              </option>
            ))}
          </select>
        </label>
        <p className="text-[10px] leading-5 text-[#82918c]">{t('settings.language.boundary')}</p>
        <button
          type="button"
          onClick={onSave}
          disabled={!selected || saving}
          className="w-full rounded-xl bg-[#0a342a] px-4 py-2.5 text-xs font-black text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-45"
        >
          {saving ? t('settings.language.updating') : t('settings.language.update')}
        </button>
        <p aria-live="polite" className="min-h-5 text-xs text-[#60756d]">
          {notice}
        </p>
      </div>
    </SectionCard>
  );
}

function SettingsLoading() {
  const { t } = useLanguage();
  return (
    <div
      className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(20rem,.65fr)]"
      aria-label={t('settings.loading')}
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
  const { t } = useLanguage();
  return (
    <div
      role="alert"
      className="rounded-[1.4rem] border border-rose-200 bg-white px-6 py-14 text-center"
    >
      <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-rose-50 text-rose-700">
        <Icon name="warning" className="size-5" />
      </span>
      <p className="mt-4 text-sm font-bold text-[#28463c]">{t('settings.loadFailure')}</p>
      <p className="mx-auto mt-2 max-w-lg text-xs leading-6 text-[#7c8c86]">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-5 rounded-xl border border-[#d7e2dd] px-4 py-2.5 text-xs font-bold text-emerald-800"
      >
        {t('settings.tryAgain')}
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

function abbreviate(value: string): string {
  return value.length <= 18 ? value : `${value.slice(0, 17)}…`;
}
