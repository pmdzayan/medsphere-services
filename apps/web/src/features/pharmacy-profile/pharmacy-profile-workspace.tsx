'use client';

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { SectionCard, StatusBadge } from '@/components/platform/dashboard-primitives';
import { Button, Input } from '@/components/platform/primitives';
import { useLanguage } from '@/components/language-provider';
import {
  ApiError,
  getAssignedProviders,
  getPharmacyProfile,
  getPharmacyVerificationState,
  submitPharmacyVerification,
  updatePharmacyProfile,
} from '@/lib/api-client';
import type { ProviderAccess } from '@/lib/inventory-contract';
import {
  isSubmitPharmacyVerificationRequest,
  isUpdatePharmacyProfileRequest,
  type PharmacyProfile,
  type PharmacyVerificationRecord,
  type PharmacyVerificationState,
} from '@/lib/pharmacy-verification-contract';

type ProfileForm = {
  businessName: string;
  ownerName: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  country: string;
  postalCode: string;
  latitude: string;
  longitude: string;
};

type VerificationForm = {
  licenseNumber: string;
  licenseExpiryDate: string;
  businessRegistrationNumber: string;
  governmentIdReference: string;
};

const EMPTY_PROFILE_FORM: ProfileForm = {
  businessName: '',
  ownerName: '',
  email: '',
  phone: '',
  address: '',
  city: '',
  state: '',
  country: '',
  postalCode: '',
  latitude: '',
  longitude: '',
};

const EMPTY_VERIFICATION_FORM: VerificationForm = {
  licenseNumber: '',
  licenseExpiryDate: '',
  businessRegistrationNumber: '',
  governmentIdReference: '',
};

function toProfileForm(profile: PharmacyProfile): ProfileForm {
  return {
    businessName: profile.businessName,
    ownerName: profile.ownerName,
    email: profile.email,
    phone: profile.phone,
    address: profile.address,
    city: profile.city,
    state: profile.state,
    country: profile.country,
    postalCode: profile.postalCode,
    latitude: String(profile.latitude),
    longitude: String(profile.longitude),
  };
}

export function PharmacyProfileWorkspace() {
  const { t } = useLanguage();
  const requestSequence = useRef(0);

  const [providers, setProviders] = useState<ProviderAccess[]>([]);
  const [providerId, setProviderId] = useState('');
  const [providersLoading, setProvidersLoading] = useState(true);
  const [providerLoadFailed, setProviderLoadFailed] = useState(false);

  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsError, setDetailsError] = useState<string | null>(null);
  const [profileForm, setProfileForm] = useState<ProfileForm>(EMPTY_PROFILE_FORM);
  const [verification, setVerification] = useState<PharmacyVerificationState | null>(null);

  const [profileSaving, setProfileSaving] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileSaved, setProfileSaved] = useState(false);

  const [verificationForm, setVerificationForm] =
    useState<VerificationForm>(EMPTY_VERIFICATION_FORM);
  const [verificationSubmitting, setVerificationSubmitting] = useState(false);
  const [verificationError, setVerificationError] = useState<string | null>(null);
  const [verificationSubmitted, setVerificationSubmitted] = useState(false);

  const loadProviders = useCallback(async () => {
    setProvidersLoading(true);
    setProviderLoadFailed(false);
    try {
      const assigned = await getAssignedProviders();
      const pharmacies = assigned.filter((provider) => provider.providerType === 'PHARMACY');
      setProviders(pharmacies);
      setProviderId((current) =>
        pharmacies.some((provider) => provider.providerId === current)
          ? current
          : (pharmacies[0]?.providerId ?? ''),
      );
    } catch {
      setProviders([]);
      setProviderId('');
      setProviderLoadFailed(true);
    } finally {
      setProvidersLoading(false);
    }
  }, []);

  const loadProviderDetails = useCallback(
    async (targetProviderId: string) => {
      const sequence = ++requestSequence.current;
      setDetailsLoading(true);
      setDetailsError(null);
      setProfileError(null);
      setProfileSaved(false);
      setVerificationError(null);
      setVerificationSubmitted(false);

      try {
        const [profile, verificationState] = await Promise.all([
          getPharmacyProfile(targetProviderId),
          getPharmacyVerificationState(targetProviderId),
        ]);
        if (requestSequence.current !== sequence) return;
        setProfileForm(toProfileForm(profile));
        setVerification(verificationState);
      } catch (error) {
        if (requestSequence.current !== sequence) return;
        setVerification(null);
        setProfileForm(EMPTY_PROFILE_FORM);
        setDetailsError(
          error instanceof ApiError && error.status === 403
            ? t('pharmacyProfile.access.denied')
            : t('pharmacyProfile.error.load'),
        );
      } finally {
        if (requestSequence.current === sequence) setDetailsLoading(false);
      }
    },
    [t],
  );

  useEffect(() => {
    void loadProviders();
  }, [loadProviders]);

  useEffect(() => {
    if (providersLoading) return;
    if (!providerId) {
      requestSequence.current += 1;
      setDetailsLoading(false);
      setDetailsError(null);
      setVerification(null);
      setProfileForm(EMPTY_PROFILE_FORM);
      return;
    }
    void loadProviderDetails(providerId);
  }, [loadProviderDetails, providerId, providersLoading]);

  const selectedProvider = useMemo(
    () => providers.find((provider) => provider.providerId === providerId),
    [providerId, providers],
  );

  const currentStatus = verification?.current?.status ?? null;
  const hasOpenReview =
    verification?.openSubmission !== null ||
    currentStatus === 'PENDING' ||
    currentStatus === 'UNDER_REVIEW';
  const suspended = currentStatus === 'SUSPENDED';
  const canSubmitVerification = Boolean(providerId && verification && !hasOpenReview && !suspended);

  const verificationAction = useMemo(() => {
    if (currentStatus === 'APPROVED') {
      return {
        title: t('pharmacyProfile.verification.form.renewTitle'),
        label: t('pharmacyProfile.verification.form.renew'),
      };
    }
    if (currentStatus === 'REJECTED' || currentStatus === 'EXPIRED') {
      return {
        title: t('pharmacyProfile.verification.form.resubmitTitle'),
        label: t('pharmacyProfile.verification.form.resubmit'),
      };
    }
    return {
      title: t('pharmacyProfile.verification.form.title'),
      label: t('pharmacyProfile.verification.form.submit'),
    };
  }, [currentStatus, t]);

  async function handleProfileSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!providerId || profileSaving) return;

    setProfileSaved(false);
    setProfileError(null);

    if (!profileForm.latitude.trim() || !profileForm.longitude.trim()) {
      setProfileError(t('pharmacyProfile.error.invalidProfile'));
      return;
    }

    const request = {
      businessName: profileForm.businessName.trim(),
      ownerName: profileForm.ownerName.trim(),
      email: profileForm.email.trim().toLowerCase(),
      phone: profileForm.phone.trim(),
      address: profileForm.address.trim(),
      city: profileForm.city.trim(),
      state: profileForm.state.trim(),
      country: profileForm.country.trim(),
      postalCode: profileForm.postalCode.trim(),
      latitude: Number(profileForm.latitude),
      longitude: Number(profileForm.longitude),
    };

    if (!isUpdatePharmacyProfileRequest(request)) {
      setProfileError(t('pharmacyProfile.error.invalidProfile'));
      return;
    }

    setProfileSaving(true);
    try {
      await updatePharmacyProfile(providerId, request);
      const refreshed = await getPharmacyProfile(providerId);
      setProfileForm(toProfileForm(refreshed));
      setProfileSaved(true);
    } catch (error) {
      setProfileError(error instanceof ApiError ? error.message : t('pharmacyProfile.error.save'));
    } finally {
      setProfileSaving(false);
    }
  }

  async function handleVerificationSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!providerId || !canSubmitVerification || verificationSubmitting) return;

    setVerificationSubmitted(false);
    setVerificationError(null);

    if (
      !verificationForm.licenseExpiryDate ||
      new Date(`${verificationForm.licenseExpiryDate}T00:00:00.000Z`).getTime() <= Date.now()
    ) {
      setVerificationError(t('pharmacyProfile.error.invalidVerification'));
      return;
    }

    const request = {
      licenseNumber: verificationForm.licenseNumber.trim(),
      licenseExpiryDate: `${verificationForm.licenseExpiryDate}T00:00:00.000Z`,
      businessRegistrationNumber: verificationForm.businessRegistrationNumber.trim(),
      governmentIdReference: verificationForm.governmentIdReference.trim(),
    };

    if (!isSubmitPharmacyVerificationRequest(request)) {
      setVerificationError(t('pharmacyProfile.error.invalidVerification'));
      return;
    }

    setVerificationSubmitting(true);
    try {
      await submitPharmacyVerification(providerId, request);
      const refreshed = await getPharmacyVerificationState(providerId);
      setVerification(refreshed);
      setVerificationForm(EMPTY_VERIFICATION_FORM);
      setVerificationSubmitted(true);
    } catch (error) {
      setVerificationError(
        error instanceof ApiError ? error.message : t('pharmacyProfile.error.submit'),
      );
    } finally {
      setVerificationSubmitting(false);
    }
  }

  function statusLabel(status: PharmacyVerificationRecord['status']) {
    if (status === 'PENDING') return t('pharmacyProfile.verification.status.pending');
    if (status === 'UNDER_REVIEW') return t('pharmacyProfile.verification.status.underReview');
    if (status === 'APPROVED') return t('pharmacyProfile.verification.status.approved');
    if (status === 'REJECTED') return t('pharmacyProfile.verification.status.rejected');
    if (status === 'SUSPENDED') return t('pharmacyProfile.verification.status.suspended');
    return t('pharmacyProfile.verification.status.expired');
  }

  function statusTone(status: PharmacyVerificationRecord['status']) {
    if (status === 'APPROVED') return 'emerald' as const;
    if (status === 'PENDING') return 'amber' as const;
    if (status === 'UNDER_REVIEW') return 'cyan' as const;
    if (status === 'EXPIRED') return 'slate' as const;
    return 'rose' as const;
  }

  function verificationCard(record: PharmacyVerificationRecord, heading: string) {
    return (
      <article className="rounded-xl border border-[#e4ebe7] bg-[#f8faf9] p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-bold text-[#16281f]">{heading}</h3>
          <StatusBadge tone={statusTone(record.status)}>{statusLabel(record.status)}</StatusBadge>
        </div>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs font-semibold text-[#6c7b74]">
              {t('pharmacyProfile.verification.submittedAt')}
            </dt>
            <dd className="mt-1 text-[#16281f]">
              {new Date(record.submittedAt).toLocaleDateString()}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold text-[#6c7b74]">
              {t('pharmacyProfile.verification.licenseExpiry')}
            </dt>
            <dd className="mt-1 text-[#16281f]">
              {new Date(record.licenseExpiryDate).toLocaleDateString()}
            </dd>
          </div>
        </dl>
        {record.applicantMessage ? (
          <div className="mt-4 rounded-lg border border-[#eadfc0] bg-[#fffaf0] p-3">
            <p className="text-xs font-semibold text-[#765b1b]">
              {t('pharmacyProfile.verification.message')}
            </p>
            <p className="mt-1 text-sm text-[#594814]">{record.applicantMessage}</p>
          </div>
        ) : null}
      </article>
    );
  }

  const minimumExpiryDate = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  return (
    <div className="space-y-6">
      <SectionCard className="p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-[#16281f]">{t('pharmacyProfile.title')}</h1>
            <p className="mt-1 max-w-2xl text-sm text-[#5a6b62]">
              {t('pharmacyProfile.description')}
            </p>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
              <Link className="font-semibold text-[#1f7a4d] underline" href="/pharmacy-staff">
                {t('pharmacyProfile.links.staff')}
              </Link>
              <Link className="font-semibold text-[#1f7a4d] underline" href="/team">
                {t('pharmacyProfile.links.team')}
              </Link>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {providers.length > 1 ? (
              <label className="text-sm font-semibold text-[#5a6b62]">
                <span className="sr-only">{t('pharmacyProfile.provider.label')}</span>
                <select
                  aria-label={t('pharmacyProfile.provider.label')}
                  value={providerId}
                  onChange={(event) => setProviderId(event.target.value)}
                  className="rounded-lg border border-[#d5ded9] bg-white px-3 py-2 text-sm text-[#16281f]"
                >
                  {providers.map((provider) => (
                    <option key={provider.providerId} value={provider.providerId}>
                      {provider.businessName}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <button
              type="button"
              disabled={!providerId || detailsLoading}
              onClick={() => void loadProviderDetails(providerId)}
              className="rounded-lg border border-[#d5ded9] px-3 py-2 text-sm font-semibold text-[#16281f] disabled:opacity-60"
            >
              {t('pharmacyProfile.refresh')}
            </button>
          </div>
        </div>

        <div className="mt-5" aria-live="polite">
          {providersLoading ? (
            <p className="text-sm text-[#5a6b62]">{t('pharmacyProfile.loading')}</p>
          ) : providerLoadFailed ? (
            <p role="alert" className="text-sm font-semibold text-[#b3261e]">
              {t('pharmacyProfile.error.providers')}
            </p>
          ) : providers.length === 0 ? (
            <div className="rounded-xl border border-dashed border-[#d5ded9] p-8 text-center">
              <p className="font-semibold text-[#16281f]">
                {t('pharmacyProfile.noProvider.title')}
              </p>
              <p className="mt-1 text-sm text-[#5a6b62]">
                {t('pharmacyProfile.noProvider.detail')}
              </p>
            </div>
          ) : detailsLoading ? (
            <p className="text-sm text-[#5a6b62]">{t('pharmacyProfile.loading')}</p>
          ) : detailsError ? (
            <p role="alert" className="text-sm font-semibold text-[#b3261e]">
              {detailsError}
            </p>
          ) : selectedProvider ? (
            <p className="text-xs font-semibold uppercase tracking-[.12em] text-[#6c7b74]">
              {selectedProvider.businessName}
            </p>
          ) : null}
        </div>
      </SectionCard>

      {!providersLoading && providerId && !detailsLoading && !detailsError ? (
        <div className="grid gap-6 xl:grid-cols-[1.15fr_.85fr]">
          <SectionCard className="p-5 sm:p-6">
            <h2 className="text-lg font-bold text-[#16281f]">
              {t('pharmacyProfile.profile.title')}
            </h2>
            <p className="mt-1 text-sm text-[#5a6b62]">
              {t('pharmacyProfile.profile.description')}
            </p>

            <form className="mt-6 space-y-5" onSubmit={handleProfileSubmit}>
              <div className="grid gap-4 sm:grid-cols-2">
                <Input
                  required
                  name="businessName"
                  maxLength={200}
                  label={t('pharmacyProfile.profile.businessName')}
                  value={profileForm.businessName}
                  onChange={(event) =>
                    setProfileForm((current) => ({ ...current, businessName: event.target.value }))
                  }
                />
                <Input
                  required
                  name="ownerName"
                  maxLength={200}
                  label={t('pharmacyProfile.profile.ownerName')}
                  value={profileForm.ownerName}
                  onChange={(event) =>
                    setProfileForm((current) => ({ ...current, ownerName: event.target.value }))
                  }
                />
                <Input
                  required
                  type="email"
                  name="email"
                  maxLength={254}
                  label={t('pharmacyProfile.profile.email')}
                  value={profileForm.email}
                  onChange={(event) =>
                    setProfileForm((current) => ({ ...current, email: event.target.value }))
                  }
                />
                <Input
                  required
                  type="tel"
                  name="phone"
                  maxLength={30}
                  label={t('pharmacyProfile.profile.phone')}
                  value={profileForm.phone}
                  onChange={(event) =>
                    setProfileForm((current) => ({ ...current, phone: event.target.value }))
                  }
                />
                <div className="sm:col-span-2">
                  <Input
                    required
                    name="address"
                    maxLength={300}
                    label={t('pharmacyProfile.profile.address')}
                    value={profileForm.address}
                    onChange={(event) =>
                      setProfileForm((current) => ({ ...current, address: event.target.value }))
                    }
                  />
                </div>
                <Input
                  required
                  name="city"
                  maxLength={120}
                  label={t('pharmacyProfile.profile.city')}
                  value={profileForm.city}
                  onChange={(event) =>
                    setProfileForm((current) => ({ ...current, city: event.target.value }))
                  }
                />
                <Input
                  required
                  name="state"
                  maxLength={120}
                  label={t('pharmacyProfile.profile.state')}
                  value={profileForm.state}
                  onChange={(event) =>
                    setProfileForm((current) => ({ ...current, state: event.target.value }))
                  }
                />
                <Input
                  required
                  name="country"
                  maxLength={120}
                  label={t('pharmacyProfile.profile.country')}
                  value={profileForm.country}
                  onChange={(event) =>
                    setProfileForm((current) => ({ ...current, country: event.target.value }))
                  }
                />
                <Input
                  required
                  name="postalCode"
                  maxLength={20}
                  label={t('pharmacyProfile.profile.postalCode')}
                  value={profileForm.postalCode}
                  onChange={(event) =>
                    setProfileForm((current) => ({ ...current, postalCode: event.target.value }))
                  }
                />
                <Input
                  required
                  type="number"
                  step="any"
                  min={-90}
                  max={90}
                  name="latitude"
                  label={t('pharmacyProfile.profile.latitude')}
                  value={profileForm.latitude}
                  onChange={(event) =>
                    setProfileForm((current) => ({ ...current, latitude: event.target.value }))
                  }
                />
                <Input
                  required
                  type="number"
                  step="any"
                  min={-180}
                  max={180}
                  name="longitude"
                  label={t('pharmacyProfile.profile.longitude')}
                  value={profileForm.longitude}
                  onChange={(event) =>
                    setProfileForm((current) => ({ ...current, longitude: event.target.value }))
                  }
                />
              </div>

              {profileError ? (
                <p role="alert" className="text-sm font-semibold text-[#b3261e]">
                  {profileError}
                </p>
              ) : null}
              {profileSaved ? (
                <p role="status" className="text-sm font-semibold text-[#1f7a4d]">
                  {t('pharmacyProfile.profile.saved')}
                </p>
              ) : null}

              <Button
                type="submit"
                loading={profileSaving}
                loadingLabel={t('pharmacyProfile.profile.saving')}
              >
                {t('pharmacyProfile.profile.save')}
              </Button>
            </form>
          </SectionCard>

          <SectionCard className="p-5 sm:p-6">
            <h2 className="text-lg font-bold text-[#16281f]">
              {t('pharmacyProfile.verification.title')}
            </h2>
            <p className="mt-1 text-sm text-[#5a6b62]">
              {t('pharmacyProfile.verification.description')}
            </p>

            <div className="mt-5 space-y-4">
              {verification?.current ? (
                verificationCard(verification.current, t('pharmacyProfile.verification.current'))
              ) : (
                <p className="rounded-xl border border-dashed border-[#d5ded9] p-4 text-sm text-[#5a6b62]">
                  {t('pharmacyProfile.verification.none')}
                </p>
              )}
              {verification?.openSubmission
                ? verificationCard(
                    verification.openSubmission,
                    t('pharmacyProfile.verification.renewal'),
                  )
                : null}
            </div>

            {hasOpenReview ? (
              <p className="mt-5 rounded-xl border border-[#eadfc0] bg-[#fffaf0] p-4 text-sm text-[#594814]">
                {t('pharmacyProfile.verification.openBlocked')}
              </p>
            ) : null}
            {suspended ? (
              <p
                role="alert"
                className="mt-5 rounded-xl border border-[#f0cbc7] bg-[#fff5f4] p-4 text-sm text-[#8c241d]"
              >
                {t('pharmacyProfile.verification.suspendedBlocked')}
              </p>
            ) : null}

            {canSubmitVerification ? (
              <form className="mt-6 space-y-4" onSubmit={handleVerificationSubmit}>
                <h3 className="text-base font-bold text-[#16281f]">{verificationAction.title}</h3>
                <Input
                  required
                  name="licenseNumber"
                  maxLength={120}
                  label={t('pharmacyProfile.verification.form.licenseNumber')}
                  value={verificationForm.licenseNumber}
                  onChange={(event) =>
                    setVerificationForm((current) => ({
                      ...current,
                      licenseNumber: event.target.value,
                    }))
                  }
                />
                <Input
                  required
                  type="date"
                  name="licenseExpiryDate"
                  min={minimumExpiryDate}
                  label={t('pharmacyProfile.verification.form.licenseExpiryDate')}
                  value={verificationForm.licenseExpiryDate}
                  onChange={(event) =>
                    setVerificationForm((current) => ({
                      ...current,
                      licenseExpiryDate: event.target.value,
                    }))
                  }
                />
                <Input
                  required
                  name="businessRegistrationNumber"
                  maxLength={120}
                  label={t('pharmacyProfile.verification.form.registrationNumber')}
                  value={verificationForm.businessRegistrationNumber}
                  onChange={(event) =>
                    setVerificationForm((current) => ({
                      ...current,
                      businessRegistrationNumber: event.target.value,
                    }))
                  }
                />
                <Input
                  required
                  name="governmentIdReference"
                  maxLength={200}
                  pattern="[A-Za-z0-9][A-Za-z0-9._-]*"
                  label={t('pharmacyProfile.verification.form.governmentReference')}
                  hint={t('pharmacyProfile.verification.form.referenceHelp')}
                  value={verificationForm.governmentIdReference}
                  onChange={(event) =>
                    setVerificationForm((current) => ({
                      ...current,
                      governmentIdReference: event.target.value,
                    }))
                  }
                />

                {verificationError ? (
                  <p role="alert" className="text-sm font-semibold text-[#b3261e]">
                    {verificationError}
                  </p>
                ) : null}
                {verificationSubmitted ? (
                  <p role="status" className="text-sm font-semibold text-[#1f7a4d]">
                    {t('pharmacyProfile.verification.submitted')}
                  </p>
                ) : null}

                <Button
                  type="submit"
                  loading={verificationSubmitting}
                  loadingLabel={t('pharmacyProfile.verification.form.submitting')}
                >
                  {verificationAction.label}
                </Button>
              </form>
            ) : null}
          </SectionCard>
        </div>
      ) : null}
    </div>
  );
}
