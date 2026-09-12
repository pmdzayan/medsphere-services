'use client';

import { FormEvent, useId, useState } from 'react';
import { useLanguage } from '@/components/language-provider';
import { Button, Input } from '@/components/platform/primitives';
import { ApiError, updatePatientProfile } from '@/lib/api-client';
import type { PatientProfile } from '@/lib/patient-profile-contract';

export interface PatientProfileFormProps {
  readonly profile: PatientProfile;
  readonly onSaved: (profile: PatientProfile) => void;
  readonly onCancel: () => void;
}

/**
 * Candidate Task 0032 (pre-0031). Only fields the patient is
 * legitimately allowed to maintain are editable here -- email, phone
 * verification status, and every server-managed field are rendered
 * read-only or omitted entirely, matching the backend's own explicit
 * whitelist (see UpdatePatientProfileDto).
 */
export function PatientProfileForm({ profile, onSaved, onCancel }: PatientProfileFormProps) {
  const { t } = useLanguage();
  const [firstName, setFirstName] = useState(profile.firstName);
  const [lastName, setLastName] = useState(profile.lastName);
  const [wantsReservationNotifications, setWantsReservationNotifications] = useState(
    profile.wantsReservationNotifications,
  );
  const [errors, setErrors] = useState<{ firstName?: string; lastName?: string; form?: string }>(
    {},
  );
  const [pending, setPending] = useState(false);
  const [success, setSuccess] = useState(false);
  const notificationsId = useId();

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;

    const nextErrors: typeof errors = {};
    if (firstName.trim().length === 0)
      nextErrors.firstName = t('patient.profile.validationFirstName');
    if (lastName.trim().length === 0) nextErrors.lastName = t('patient.profile.validationLastName');
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    setPending(true);
    setErrors({});
    setSuccess(false);
    try {
      const updated = await updatePatientProfile({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        wantsReservationNotifications,
      });
      setSuccess(true);
      onSaved(updated);
    } catch (thrown) {
      setErrors({
        form:
          thrown instanceof ApiError && thrown.status === 401
            ? t('patient.profile.sessionExpired')
            : t('patient.profile.saveError'),
      });
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="mt-4 space-y-4" onSubmit={handleSubmit} noValidate>
      <Input
        name="firstName"
        label={t('patient.profile.firstNameLabel')}
        value={firstName}
        onChange={(event) => setFirstName(event.target.value)}
        error={errors.firstName}
        maxLength={120}
      />
      <Input
        name="lastName"
        label={t('patient.profile.lastNameLabel')}
        value={lastName}
        onChange={(event) => setLastName(event.target.value)}
        error={errors.lastName}
        maxLength={120}
      />
      <label htmlFor={notificationsId} className="flex items-center gap-2 text-sm text-[#43524e]">
        <input
          id={notificationsId}
          type="checkbox"
          checked={wantsReservationNotifications}
          onChange={(event) => setWantsReservationNotifications(event.target.checked)}
          className="size-4 rounded border-[#10201c]/25"
        />
        {t('patient.profile.notificationsLabel')}
      </label>

      {errors.form ? (
        <p role="alert" className="text-sm text-red-700">
          {errors.form}
        </p>
      ) : null}
      {success ? (
        <p role="status" className="text-sm font-semibold text-emerald-700">
          {t('patient.profile.saveSuccess')}
        </p>
      ) : null}

      <div className="flex gap-3">
        <Button type="submit" loading={pending} loadingLabel={t('patient.profile.saving')}>
          {t('patient.profile.saveButton')}
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel} disabled={pending}>
          {t('patient.profile.cancelButton')}
        </Button>
      </div>
    </form>
  );
}
