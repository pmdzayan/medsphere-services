'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useLanguage } from '@/components/language-provider';
import { Card, EmptyState, Skeleton } from '@/components/platform/primitives';
import { getPatientProfile } from '@/lib/api-client';
import type { PatientProfile } from '@/lib/patient-profile-contract';
import { PatientProfileForm } from './patient-profile-form';

/**
 * A deliberately simple patient home. Every section either uses real,
 * already-accepted backend capability (profile) or shows an honest
 * "coming soon" state -- never synthetic placeholder data presented as
 * though it belongs to the logged-in patient.
 */
export function PatientDashboard() {
  const { t } = useLanguage();
  const [profile, setProfile] = useState<PatientProfile | null>(null);
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getPatientProfile()
      .then((result) => {
        if (cancelled) return;
        setProfile(result);
        setStatus('success');
      })
      .catch(() => {
        if (cancelled) return;
        setStatus('error');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const isLoading = status === 'loading';
  const isError = status === 'error';
  const isSuccess = status === 'success';
  const greeting =
    isSuccess && profile
      ? t('patient.dashboard.greeting').replace('{name}', profile.firstName)
      : null;

  return (
    <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-10">
      <h1 className="font-[var(--font-display)] text-2xl font-bold tracking-[-.03em] text-[#10201c] sm:text-3xl">
        {t('patient.dashboard.title')}
      </h1>
      {greeting ? <p className="mt-2 text-sm text-[#60706b]">{greeting}</p> : null}

      <section className="mt-8" aria-labelledby="patient-profile-heading">
        <Card>
          <div className="flex items-center justify-between">
            <h2 id="patient-profile-heading" className="text-sm font-bold text-[#173128]">
              {t('patient.dashboard.profileSummary')}
            </h2>
            {isSuccess && !editing ? (
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="text-xs font-bold text-emerald-700 underline"
              >
                {t('patient.dashboard.editProfile')}
              </button>
            ) : null}
          </div>

          {isLoading ? (
            <div className="mt-4 space-y-2">
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-4 w-1/3" />
            </div>
          ) : isError ? (
            <p role="alert" className="mt-4 text-sm text-red-700">
              {t('patient.profile.loadError')}
            </p>
          ) : profile && editing ? (
            <PatientProfileForm
              profile={profile}
              onSaved={(updated) => {
                setProfile(updated);
                setEditing(false);
              }}
              onCancel={() => setEditing(false)}
            />
          ) : profile ? (
            <dl className="mt-4 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-xs font-bold text-[#71807b]">
                  {t('patient.profile.firstNameLabel')}
                </dt>
                <dd className="mt-1 text-[#10201c]">{profile.firstName}</dd>
              </div>
              <div>
                <dt className="text-xs font-bold text-[#71807b]">
                  {t('patient.profile.lastNameLabel')}
                </dt>
                <dd className="mt-1 text-[#10201c]">{profile.lastName}</dd>
              </div>
              <div>
                <dt className="text-xs font-bold text-[#71807b]">
                  {t('patient.profile.emailLabel')}
                </dt>
                <dd className="mt-1 text-[#10201c]">{profile.email}</dd>
              </div>
              {profile.phone ? (
                <div>
                  <dt className="text-xs font-bold text-[#71807b]">
                    {t('patient.profile.phoneLabel')}
                  </dt>
                  <dd className="mt-1 text-[#10201c]">
                    {profile.phone}{' '}
                    <span className="text-xs text-[#71807b]">
                      (
                      {profile.phoneVerified
                        ? t('patient.profile.phoneVerified')
                        : t('patient.profile.phoneUnverified')}
                      )
                    </span>
                  </dd>
                </div>
              ) : null}
            </dl>
          ) : null}
        </Card>
      </section>

      <section
        className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2"
        aria-label={t('patient.dashboard.title')}
      >
        <Link href="/search" className="block">
          <Card className="h-full transition hover:border-emerald-600">
            <p className="text-sm font-bold text-[#173128]">
              {t('patient.dashboard.medicineSearch')}
            </p>
          </Card>
        </Link>
        <Card>
          <p className="text-sm font-bold text-[#173128]">{t('patient.dashboard.reservations')}</p>
          <EmptyState
            title={t('patient.dashboard.comingSoon')}
            description={t('patient.dashboard.reservationsComingSoon')}
          />
        </Card>
        <Card>
          <p className="text-sm font-bold text-[#173128]">{t('patient.dashboard.appointments')}</p>
          <EmptyState
            title={t('patient.dashboard.comingSoon')}
            description={t('patient.dashboard.appointmentsComingSoon')}
          />
        </Card>
        <Card>
          <EmptyState
            title={t('patient.dashboard.comingSoon')}
            description={t('patient.dashboard.prescriptionsComingSoon')}
          />
        </Card>
        <Card>
          <EmptyState
            title={t('patient.dashboard.comingSoon')}
            description={t('patient.dashboard.reportsComingSoon')}
          />
        </Card>
      </section>
    </main>
  );
}
