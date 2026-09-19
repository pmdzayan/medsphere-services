'use client';

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { SectionCard, StatusBadge } from '@/components/platform/dashboard-primitives';
import { useLanguage } from '@/components/language-provider';
import {
  ApiError,
  assignPharmacyStaff,
  getAssignedProviders,
  getAuthorizationCatalogue,
  getMembershipCatalogue,
  getPharmacyStaff,
  revokePharmacyStaffAccess,
} from '@/lib/api-client';
import {
  AUTHORIZATION_PERMISSIONS,
  hasAuthorizationPermission,
  type Membership,
} from '@/lib/authorization-contract';
import type { ProviderAccess } from '@/lib/inventory-contract';
import type { PharmacyStaffCatalogue, PharmacyStaffMember } from '@/lib/pharmacy-staff-contract';

const PAGE_SIZE = 50;
const EMPTY_CATALOGUE: PharmacyStaffCatalogue = { data: [], total: 0, limit: PAGE_SIZE, offset: 0 };

export function PharmacyStaffWorkspace() {
  const { t } = useLanguage();
  const requestSequence = useRef(0);

  const [providers, setProviders] = useState<ProviderAccess[]>([]);
  const [providerId, setProviderId] = useState('');
  const [providersLoading, setProvidersLoading] = useState(true);
  const [providerLoadFailed, setProviderLoadFailed] = useState(false);

  const [staffPage, setStaffPage] = useState<PharmacyStaffCatalogue>(EMPTY_CATALOGUE);
  const [staffOffset, setStaffOffset] = useState(0);
  const [staffLoading, setStaffLoading] = useState(false);
  const [staffError, setStaffError] = useState<string | null>(null);

  const [canManageProviderAccess, setCanManageProviderAccess] = useState(false);
  const [canReadMemberships, setCanReadMemberships] = useState(false);
  const [membershipDirectory, setMembershipDirectory] = useState<Membership[] | null>(null);
  const [membershipDirectoryTruncated, setMembershipDirectoryTruncated] = useState(false);

  const [assignOpen, setAssignOpen] = useState(false);
  const [assignMembershipId, setAssignMembershipId] = useState('');
  const [assignSubmitting, setAssignSubmitting] = useState(false);
  const [assignError, setAssignError] = useState<string | null>(null);

  const [revokeTarget, setRevokeTarget] = useState<PharmacyStaffMember | null>(null);
  const [revokeSubmitting, setRevokeSubmitting] = useState(false);
  const [revokeError, setRevokeError] = useState<string | null>(null);

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

  const loadCapabilities = useCallback(async () => {
    try {
      const catalogue = await getAuthorizationCatalogue();
      const canManage = hasAuthorizationPermission(
        catalogue,
        AUTHORIZATION_PERMISSIONS.providerAccessManage,
      );
      const canReadDirectory = hasAuthorizationPermission(
        catalogue,
        AUTHORIZATION_PERMISSIONS.assignmentsRead,
      );
      setCanManageProviderAccess(canManage);
      setCanReadMemberships(canReadDirectory);

      if (canManage && canReadDirectory) {
        const directory = await getMembershipCatalogue();
        setMembershipDirectory(directory.data.filter((member) => member.status === 'ACTIVE'));
        setMembershipDirectoryTruncated(directory.total > directory.data.length);
      } else {
        setMembershipDirectory(null);
        setMembershipDirectoryTruncated(false);
      }
    } catch {
      setCanManageProviderAccess(false);
      setCanReadMemberships(false);
      setMembershipDirectory(null);
      setMembershipDirectoryTruncated(false);
    }
  }, []);

  const loadStaff = useCallback(
    async (targetProviderId: string, offset: number) => {
      const sequence = ++requestSequence.current;
      setStaffLoading(true);
      setStaffError(null);
      try {
        const page = await getPharmacyStaff(targetProviderId, offset);
        if (requestSequence.current === sequence) setStaffPage(page);
      } catch (loadError) {
        if (requestSequence.current !== sequence) return;
        setStaffPage({ ...EMPTY_CATALOGUE, offset });
        setStaffError(
          loadError instanceof ApiError && loadError.status === 403
            ? t('pharmacyStaff.access.denied')
            : t('pharmacyStaff.error.load'),
        );
      } finally {
        if (requestSequence.current === sequence) setStaffLoading(false);
      }
    },
    [t],
  );

  useEffect(() => {
    void loadProviders();
    void loadCapabilities();
  }, [loadCapabilities, loadProviders]);

  useEffect(() => {
    if (providersLoading) return;
    if (!providerId) {
      requestSequence.current += 1;
      setStaffPage(EMPTY_CATALOGUE);
      setStaffLoading(false);
      return;
    }
    void loadStaff(providerId, staffOffset);
  }, [loadStaff, providerId, providersLoading, staffOffset]);

  const selectedProvider = useMemo(
    () => providers.find((provider) => provider.providerId === providerId),
    [providerId, providers],
  );
  const assignedMembershipIds = useMemo(
    () => new Set(staffPage.data.map((member) => member.membershipId)),
    [staffPage.data],
  );
  const assignmentCandidates = useMemo(
    () => (membershipDirectory ?? []).filter((member) => !assignedMembershipIds.has(member.id)),
    [assignedMembershipIds, membershipDirectory],
  );
  const canAssign = canManageProviderAccess && canReadMemberships && membershipDirectory !== null;

  async function handleAssignSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!providerId || !assignMembershipId || assignSubmitting) return;
    setAssignSubmitting(true);
    setAssignError(null);
    try {
      await assignPharmacyStaff(providerId, assignMembershipId);
      setAssignOpen(false);
      setAssignMembershipId('');
      setStaffOffset(0);
      await loadStaff(providerId, 0);
    } catch (submitError) {
      setAssignError(
        submitError instanceof ApiError ? submitError.message : t('pharmacyStaff.error.assign'),
      );
    } finally {
      setAssignSubmitting(false);
    }
  }

  async function handleRevokeConfirm() {
    if (!providerId || !revokeTarget || revokeSubmitting) return;
    setRevokeSubmitting(true);
    setRevokeError(null);
    try {
      await revokePharmacyStaffAccess(providerId, revokeTarget.membershipId);
      setRevokeTarget(null);
      const nextOffset =
        staffPage.data.length === 1 && staffOffset > 0
          ? Math.max(0, staffOffset - PAGE_SIZE)
          : staffOffset;
      setStaffOffset(nextOffset);
      await loadStaff(providerId, nextOffset);
    } catch (submitError) {
      setRevokeError(
        submitError instanceof ApiError ? submitError.message : t('pharmacyStaff.error.revoke'),
      );
    } finally {
      setRevokeSubmitting(false);
    }
  }

  function statusTone(status: PharmacyStaffMember['status']) {
    if (status === 'ACTIVE') return 'emerald' as const;
    if (status === 'PENDING') return 'amber' as const;
    return 'rose' as const;
  }

  function statusLabel(status: PharmacyStaffMember['status']) {
    if (status === 'ACTIVE') return t('pharmacyStaff.status.active');
    if (status === 'PENDING') return t('pharmacyStaff.status.pending');
    if (status === 'SUSPENDED') return t('pharmacyStaff.status.suspended');
    return t('pharmacyStaff.status.revoked');
  }

  return (
    <SectionCard className="p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-[#16281f]">{t('pharmacyStaff.title')}</h1>
          <p className="mt-1 max-w-xl text-sm text-[#5a6b62]">{t('pharmacyStaff.description')}</p>
          <p className="mt-2 text-xs text-[#5a6b62]">
            {t('pharmacyStaff.roles.readOnly')}{' '}
            <Link className="font-semibold text-[#1f7a4d] underline" href="/team">
              {t('pharmacyStaff.roles.teamAccess')}
            </Link>
          </p>
        </div>
        <div className="flex items-center gap-2">
          {providers.length > 1 && (
            <select
              aria-label={t('pharmacyStaff.provider.label')}
              value={providerId}
              onChange={(event) => {
                setStaffOffset(0);
                setProviderId(event.target.value);
              }}
              className="rounded-lg border border-[#d5ded9] bg-white px-3 py-2 text-sm"
            >
              {providers.map((provider) => (
                <option key={provider.providerId} value={provider.providerId}>
                  {provider.businessName}
                </option>
              ))}
            </select>
          )}
          <button
            type="button"
            disabled={!providerId || staffLoading}
            onClick={() => void loadStaff(providerId, staffOffset)}
            className="rounded-lg border border-[#d5ded9] px-3 py-2 text-sm font-semibold text-[#16281f] disabled:opacity-60"
          >
            {t('pharmacyStaff.refresh')}
          </button>
          {canAssign && providerId && (
            <button
              type="button"
              onClick={() => {
                setAssignMembershipId('');
                setAssignError(null);
                setAssignOpen(true);
              }}
              className="rounded-lg bg-[#1f7a4d] px-3 py-2 text-sm font-semibold text-white"
            >
              {t('pharmacyStaff.assign')}
            </button>
          )}
        </div>
      </div>

      <div className="mt-6" aria-live="polite">
        {providersLoading ? (
          <p className="text-sm text-[#5a6b62]">{t('pharmacyStaff.loading')}</p>
        ) : providerLoadFailed ? (
          <p role="alert" className="text-sm font-semibold text-[#b3261e]">
            {t('pharmacyStaff.error.providers')}
          </p>
        ) : providers.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[#d5ded9] p-8 text-center">
            <p className="font-semibold text-[#16281f]">{t('pharmacyStaff.noProvider.title')}</p>
            <p className="mt-1 text-sm text-[#5a6b62]">{t('pharmacyStaff.noProvider.detail')}</p>
          </div>
        ) : staffLoading ? (
          <p className="text-sm text-[#5a6b62]">{t('pharmacyStaff.loading')}</p>
        ) : staffError ? (
          <p role="alert" className="text-sm font-semibold text-[#b3261e]">
            {staffError}
          </p>
        ) : staffPage.data.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[#d5ded9] p-8 text-center">
            <p className="font-semibold text-[#16281f]">{t('pharmacyStaff.empty.title')}</p>
            <p className="mt-1 text-sm text-[#5a6b62]">{t('pharmacyStaff.empty.detail')}</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full rounded-xl text-left text-sm">
                <caption className="sr-only">
                  {selectedProvider?.businessName ?? t('pharmacyStaff.title')}
                </caption>
                <thead>
                  <tr className="bg-[#f3f7f5] text-xs font-semibold uppercase text-[#5a6b62]">
                    <th scope="col" className="px-4 py-3">
                      {t('pharmacyStaff.table.name')}
                    </th>
                    <th scope="col" className="px-4 py-3">
                      {t('pharmacyStaff.table.email')}
                    </th>
                    <th scope="col" className="px-4 py-3">
                      {t('pharmacyStaff.table.role')}
                    </th>
                    <th scope="col" className="px-4 py-3">
                      {t('pharmacyStaff.table.status')}
                    </th>
                    {canManageProviderAccess && (
                      <th scope="col" className="px-4 py-3">
                        {t('pharmacyStaff.table.actions')}
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {staffPage.data.map((member) => (
                    <tr key={member.membershipId} className="border-t border-[#eef2f0]">
                      <td className="px-4 py-3 font-medium text-[#16281f]">
                        {member.firstName} {member.lastName}
                      </td>
                      <td className="px-4 py-3 text-[#5a6b62]">{member.email}</td>
                      <td className="px-4 py-3 text-[#5a6b62]">
                        {member.roles.map((role) => role.name).join(', ') || '—'}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge tone={statusTone(member.status)}>
                          {statusLabel(member.status)}
                        </StatusBadge>
                      </td>
                      {canManageProviderAccess && (
                        <td className="px-4 py-3">
                          <button
                            type="button"
                            onClick={() => {
                              setRevokeTarget(member);
                              setRevokeError(null);
                            }}
                            className="rounded-lg border border-[#f3c7c2] px-2.5 py-1.5 text-xs font-semibold text-[#b3261e]"
                          >
                            {t('pharmacyStaff.action.revoke')}
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-4 flex items-center justify-between gap-3">
              <p className="text-xs text-[#5a6b62]">
                {staffOffset + 1}–{staffOffset + staffPage.data.length} / {staffPage.total}
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={staffOffset === 0}
                  onClick={() => setStaffOffset(Math.max(0, staffOffset - PAGE_SIZE))}
                  className="rounded-lg border border-[#d5ded9] px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
                >
                  {t('pharmacyStaff.pagination.previous')}
                </button>
                <button
                  type="button"
                  disabled={staffOffset + staffPage.data.length >= staffPage.total}
                  onClick={() => setStaffOffset(staffOffset + PAGE_SIZE)}
                  className="rounded-lg border border-[#d5ded9] px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
                >
                  {t('pharmacyStaff.pagination.next')}
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {assignOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="pharmacy-staff-assign-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
        >
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h2 id="pharmacy-staff-assign-title" className="text-lg font-bold text-[#16281f]">
              {t('pharmacyStaff.assign.title')}
            </h2>
            <p className="mt-1 text-sm text-[#5a6b62]">{t('pharmacyStaff.assign.detail')}</p>
            <form className="mt-4 space-y-4" onSubmit={handleAssignSubmit}>
              <div>
                <label
                  htmlFor="assign-membership"
                  className="block text-sm font-semibold text-[#16281f]"
                >
                  {t('pharmacyStaff.assign.memberLabel')}
                </label>
                <select
                  id="assign-membership"
                  required
                  value={assignMembershipId}
                  onChange={(event) => setAssignMembershipId(event.target.value)}
                  className="mt-1 w-full rounded-lg border border-[#d5ded9] px-3 py-2 text-sm"
                >
                  <option value="">{t('pharmacyStaff.assign.memberPlaceholder')}</option>
                  {assignmentCandidates.map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.firstName} {member.lastName} — {member.email}
                    </option>
                  ))}
                </select>
              </div>
              {assignmentCandidates.length === 0 && (
                <p className="text-sm text-[#5a6b62]">{t('pharmacyStaff.assign.none')}</p>
              )}
              {membershipDirectoryTruncated && (
                <p className="text-sm text-[#8a5a00]">{t('pharmacyStaff.assign.truncated')}</p>
              )}
              {assignError && (
                <p role="alert" className="text-sm font-semibold text-[#b3261e]">
                  {assignError}
                </p>
              )}
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  disabled={assignSubmitting}
                  onClick={() => setAssignOpen(false)}
                  className="rounded-lg border border-[#d5ded9] px-3 py-2 text-sm font-semibold"
                >
                  {t('pharmacyStaff.assign.cancel')}
                </button>
                <button
                  type="submit"
                  disabled={assignSubmitting || !assignMembershipId}
                  className="rounded-lg bg-[#1f7a4d] px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
                >
                  {t('pharmacyStaff.assign.submit')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {revokeTarget && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="pharmacy-staff-revoke-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
        >
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h2 id="pharmacy-staff-revoke-title" className="text-lg font-bold text-[#16281f]">
              {t('pharmacyStaff.revokeDialog.title')}
            </h2>
            <p className="mt-2 text-sm text-[#5a6b62]">{t('pharmacyStaff.revokeDialog.body')}</p>
            {revokeError && (
              <p role="alert" className="mt-3 text-sm font-semibold text-[#b3261e]">
                {revokeError}
              </p>
            )}
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                disabled={revokeSubmitting}
                onClick={() => setRevokeTarget(null)}
                className="rounded-lg border border-[#d5ded9] px-3 py-2 text-sm font-semibold"
              >
                {t('pharmacyStaff.revokeDialog.cancel')}
              </button>
              <button
                type="button"
                disabled={revokeSubmitting}
                onClick={() => void handleRevokeConfirm()}
                className="rounded-lg bg-[#b3261e] px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
              >
                {t('pharmacyStaff.revokeDialog.confirm')}
              </button>
            </div>
          </div>
        </div>
      )}
    </SectionCard>
  );
}
