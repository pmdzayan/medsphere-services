'use client';

import { FormEvent, useEffect, useState } from 'react';
import { SectionCard, StatusBadge } from '@/components/platform/dashboard-primitives';
import { Icon } from '@/components/platform/icon';
import { useLanguage } from '@/components/language-provider';
import {
  deleteRole,
  getMembershipCatalogue,
  setRoleAssignment,
  updateRole,
} from '@/lib/api-client';
import {
  normalizeRoleName,
  validateCreateRole,
  type Membership,
  type Permission,
  type Role,
  type UpdateRoleRequest,
} from '@/lib/authorization-contract';

export function RoleEditorPanel({
  role,
  permissions,
  canUpdate,
  canDelete,
  canReadPermissions,
  onCancel,
  onSaved,
  onDeleted,
}: {
  role: Role;
  permissions: readonly Permission[];
  canUpdate: boolean;
  canDelete: boolean;
  canReadPermissions: boolean;
  onCancel: () => void;
  onSaved: (role: Role) => void;
  onDeleted: (roleId: string) => void;
}) {
  const { t } = useLanguage();
  const [name, setName] = useState(role.name);
  const [description, setDescription] = useState(role.description ?? '');
  const [selected, setSelected] = useState(role.permissionKeys);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!canUpdate) return;
    const editable = {
      name: normalizeRoleName(name),
      ...(description.trim() ? { description: description.trim() } : {}),
    };
    const errors = validateCreateRole(
      {
        ...editable,
        permissionKeys: canReadPermissions ? selected : [],
      },
      canReadPermissions ? permissions.map((permission) => permission.name) : [],
    );
    if (Object.keys(errors).length) {
      setError(t('team.error.invalidRole'));
      return;
    }
    setPending(true);
    setError('');
    try {
      const request: UpdateRoleRequest = {
        ...editable,
        ...(canReadPermissions ? { permissionKeys: selected } : {}),
        version: role.version,
      };
      onSaved(await updateRole(role.id, request));
    } catch (failure) {
      setError(t('team.error.update'));
    } finally {
      setPending(false);
    }
  }

  async function remove() {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    setPending(true);
    setError('');
    try {
      await deleteRole(role.id, role.version);
      onDeleted(role.id);
    } catch (failure) {
      setError(t('team.error.delete'));
      setConfirmDelete(false);
    } finally {
      setPending(false);
    }
  }

  return (
    <SectionCard className="ring-1 ring-amber-500/20">
      <form onSubmit={save}>
        <div className="flex items-start justify-between border-b border-[#edf1ef] px-6 py-5">
          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-[.18em] text-amber-700">
              {t('team.editor.eyebrow', { version: role.version })}
            </p>
            <h2 className="mt-1 text-xl font-bold text-[#173128]">{t('team.editor.title')}</h2>
          </div>
          <button
            type="button"
            onClick={onCancel}
            aria-label={t('team.editor.close')}
            className="grid size-9 place-items-center rounded-xl border border-[#dfe7e3]"
          >
            <Icon name="close" className="size-4" />
          </button>
        </div>
        <div className="grid gap-5 p-6 lg:grid-cols-2">
          <div className="space-y-4">
            <label className="block text-xs font-bold text-[#435951]">
              {t('team.roleName')}
              <input
                value={name}
                disabled={!canUpdate}
                onChange={(event) => setName(event.target.value)}
                onBlur={() => setName(normalizeRoleName(name))}
                className="mt-2 w-full rounded-xl border border-[#dbe4e0] bg-[#fbfcfb] px-4 py-3 text-sm"
              />
            </label>
            <label className="block text-xs font-bold text-[#435951]">
              {t('team.descriptionLabel')}
              <textarea
                value={description}
                disabled={!canUpdate}
                onChange={(event) => setDescription(event.target.value)}
                maxLength={240}
                rows={4}
                className="mt-2 w-full resize-none rounded-xl border border-[#dbe4e0] bg-[#fbfcfb] px-4 py-3 text-sm"
              />
            </label>
          </div>
          {canUpdate && canReadPermissions ? (
            <fieldset>
              <legend className="text-xs font-bold text-[#435951]">
                {t('team.editor.permissionsSelected', { count: selected.length })}
              </legend>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {permissions.map((permission) => (
                  <label
                    key={permission.id}
                    className="flex gap-2 rounded-xl border border-[#e1e8e5] p-3 text-[10px]"
                  >
                    <input
                      type="checkbox"
                      checked={selected.includes(permission.name)}
                      onChange={(event) =>
                        setSelected((current) =>
                          event.target.checked
                            ? [...current, permission.name]
                            : current.filter((key) => key !== permission.name),
                        )
                      }
                    />
                    <span>
                      <strong className="block font-mono text-[#315247]">{permission.name}</strong>
                      <span className="mt-1 block text-[#85938e]">{permission.description}</span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
          ) : (
            <div>
              <p className="text-xs font-bold text-[#435951]">
                {t('team.editor.currentPermissions')}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {role.permissionKeys.map((permission) => (
                  <span
                    key={permission}
                    className="rounded-lg bg-[#f0f5f3] px-2 py-1 font-mono text-[9px] text-[#4d685e]"
                  >
                    {permission}
                  </span>
                ))}
                {role.permissionKeys.length === 0 ? (
                  <span className="text-xs text-[#8a9893]">{t('team.editor.noPermissions')}</span>
                ) : null}
              </div>
            </div>
          )}
        </div>
        {error ? (
          <p
            role="alert"
            className="mx-6 mb-4 rounded-xl bg-rose-50 px-4 py-3 text-xs text-rose-800"
          >
            {error}
          </p>
        ) : null}
        <div className="flex flex-wrap justify-between gap-3 border-t border-[#edf1ef] bg-[#fbfcfb] px-6 py-4">
          {canDelete ? (
            <button
              type="button"
              disabled={pending}
              onClick={() => void remove()}
              className="rounded-xl border border-rose-200 px-4 py-2.5 text-xs font-bold text-rose-700"
            >
              {confirmDelete ? t('team.editor.confirmDelete') : t('team.editor.delete')}
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onCancel}
              className="rounded-xl border border-[#d9e3df] px-4 py-2.5 text-xs font-bold"
            >
              {t('team.cancel')}
            </button>
            {canUpdate ? (
              <button
                type="submit"
                disabled={pending}
                className="rounded-xl bg-[#0b5f4b] px-5 py-2.5 text-xs font-bold text-white"
              >
                {pending ? t('team.editor.saving') : t('team.editor.save')}
              </button>
            ) : null}
          </div>
        </div>
      </form>
    </SectionCard>
  );
}

export function MembershipDirectory({
  roles,
  canManage,
}: {
  roles: readonly Role[];
  canManage: boolean;
}) {
  const { t } = useLanguage();
  const [members, setMembers] = useState<Membership[] | null>(null);
  const [selected, setSelected] = useState<Membership | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState('');
  useEffect(() => {
    getMembershipCatalogue()
      .then((result) => setMembers(result.data))
      .catch(() => setError(t('team.error.loadMembers')))
      .finally(() => setLoading(false));
  }, [t]);

  async function toggle(role: Role, assigned: boolean) {
    if (!selected) return;
    const key = `${selected.id}:${role.id}`;
    setPending(key);
    setError('');
    try {
      await setRoleAssignment(selected.id, role.id, assigned);
      const updated = {
        ...selected,
        roles: assigned
          ? [...selected.roles, { id: role.id, name: role.name }]
          : selected.roles.filter((item) => item.id !== role.id),
      };
      setSelected(updated);
      setMembers(
        (current) =>
          current?.map((member) => (member.id === updated.id ? updated : member)) ?? null,
      );
    } catch (failure) {
      setError(t('team.error.assignment'));
    } finally {
      setPending('');
    }
  }

  return (
    <SectionCard>
      <div className="border-b border-[#edf1ef] px-6 py-5">
        <p className="text-[10px] font-extrabold uppercase tracking-[.18em] text-emerald-700">
          {t('team.directory.eyebrow')}
        </p>
        <h2 className="mt-1 text-xl font-bold text-[#173128]">{t('team.directory.title')}</h2>
      </div>
      {error ? (
        <p role="alert" className="m-5 rounded-xl bg-rose-50 px-4 py-3 text-xs text-rose-800">
          {error}
        </p>
      ) : null}
      {loading ? (
        <div className="p-8 text-center text-xs text-[#7c8c86]">{t('team.directory.loading')}</div>
      ) : members ? (
        <div className="grid lg:grid-cols-[1fr_1.15fr]">
          <div className="divide-y divide-[#edf1ef]">
            {members.map((member) => (
              <button
                key={member.id}
                type="button"
                onClick={() => setSelected(member)}
                className={`flex w-full items-center gap-3 px-6 py-4 text-left ${selected?.id === member.id ? 'bg-emerald-50' : 'hover:bg-[#fbfdfc]'}`}
              >
                <span className="grid size-10 place-items-center rounded-xl bg-[#0b342b] text-xs font-bold text-emerald-200">
                  {member.firstName[0]}
                  {member.lastName[0]}
                </span>
                <span className="min-w-0 flex-1">
                  <strong className="block truncate text-sm text-[#1b372d]">
                    {member.firstName} {member.lastName}
                  </strong>
                  <span className="mt-1 block truncate text-xs text-[#85938f]">{member.email}</span>
                </span>
                <StatusBadge tone={member.status === 'ACTIVE' ? 'emerald' : 'slate'}>
                  {member.status === 'ACTIVE' ? t('team.status.active') : t('team.status.inactive')}
                </StatusBadge>
              </button>
            ))}
          </div>
          <div className="border-t border-[#edf1ef] bg-[#fbfcfb] p-6 lg:border-l lg:border-t-0">
            {selected ? (
              <>
                <h3 className="text-sm font-bold text-[#1b372d]">
                  {t('team.directory.manage', { name: selected.firstName })}
                </h3>
                <p className="mt-1 text-xs text-[#85938f]">
                  {canManage ? t('team.directory.enforced') : t('team.directory.readOnly')}
                </p>
                <div className="mt-4 space-y-2">
                  {canManage
                    ? roles.map((role) => {
                        const assigned = selected.roles.some((item) => item.id === role.id);
                        const key = `${selected.id}:${role.id}`;
                        return (
                          <label
                            key={role.id}
                            className="flex items-center gap-3 rounded-xl border border-[#dfe7e3] bg-white p-3"
                          >
                            <input
                              type="checkbox"
                              checked={assigned}
                              disabled={
                                pending === key || (selected.status !== 'ACTIVE' && !assigned)
                              }
                              onChange={(event) => void toggle(role, event.target.checked)}
                            />
                            <span className="flex-1 text-xs font-bold text-[#315247]">
                              {role.name}
                            </span>
                            <span className="text-[9px] text-[#899691]">
                              {role.type === 'SYSTEM'
                                ? t('team.directory.protectedRole')
                                : t('team.filter.custom')}
                            </span>
                          </label>
                        );
                      })
                    : selected.roles.map((role) => (
                        <div
                          key={role.id}
                          className="flex items-center gap-3 rounded-xl border border-[#dfe7e3] bg-white p-3"
                        >
                          <span className="flex-1 text-xs font-bold text-[#315247]">
                            {role.name}
                          </span>
                          <span className="text-[9px] text-[#899691]">
                            {t('team.directory.assigned')}
                          </span>
                        </div>
                      ))}
                  {!canManage && selected.roles.length === 0 ? (
                    <p className="rounded-xl border border-dashed border-[#dfe7e3] p-4 text-xs text-[#899691]">
                      {t('team.directory.noRoles')}
                    </p>
                  ) : null}
                </div>
              </>
            ) : (
              <div className="py-12 text-center text-xs text-[#84928d]">
                {t('team.directory.select')}
              </div>
            )}
          </div>
        </div>
      ) : null}
    </SectionCard>
  );
}
