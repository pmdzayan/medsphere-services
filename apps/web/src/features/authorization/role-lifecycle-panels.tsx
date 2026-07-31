'use client';

import { FormEvent, useEffect, useState } from 'react';
import { SectionCard, StatusBadge } from '@/components/platform/dashboard-primitives';
import { Icon } from '@/components/platform/icon';
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
} from '@/lib/authorization-contract';

export function RoleEditorPanel({
  role,
  permissions,
  onCancel,
  onSaved,
  onDeleted,
}: {
  role: Role;
  permissions: readonly Permission[];
  onCancel: () => void;
  onSaved: (role: Role) => void;
  onDeleted: (roleId: string) => void;
}) {
  const [name, setName] = useState(role.name);
  const [description, setDescription] = useState(role.description ?? '');
  const [selected, setSelected] = useState(role.permissionKeys);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function save(event: FormEvent) {
    event.preventDefault();
    const request = {
      name: normalizeRoleName(name),
      ...(description.trim() ? { description: description.trim() } : {}),
      permissionKeys: selected,
    };
    const errors = validateCreateRole(
      request,
      permissions.map((permission) => permission.name),
    );
    if (Object.keys(errors).length) {
      setError(Object.values(errors)[0] ?? 'Invalid role.');
      return;
    }
    setPending(true);
    setError('');
    try {
      onSaved(await updateRole(role.id, { ...request, version: role.version }));
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Unable to update role.');
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
      setError(failure instanceof Error ? failure.message : 'Unable to delete role.');
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
              Version-safe mutation · v{role.version}
            </p>
            <h2 className="mt-1 text-xl font-bold text-[#173128]">Edit custom role</h2>
          </div>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Close editor"
            className="grid size-9 place-items-center rounded-xl border border-[#dfe7e3]"
          >
            <Icon name="close" className="size-4" />
          </button>
        </div>
        <div className="grid gap-5 p-6 lg:grid-cols-2">
          <div className="space-y-4">
            <label className="block text-xs font-bold text-[#435951]">
              Role name
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                onBlur={() => setName(normalizeRoleName(name))}
                className="mt-2 w-full rounded-xl border border-[#dbe4e0] bg-[#fbfcfb] px-4 py-3 text-sm"
              />
            </label>
            <label className="block text-xs font-bold text-[#435951]">
              Description
              <textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                maxLength={240}
                rows={4}
                className="mt-2 w-full resize-none rounded-xl border border-[#dbe4e0] bg-[#fbfcfb] px-4 py-3 text-sm"
              />
            </label>
          </div>
          <fieldset>
            <legend className="text-xs font-bold text-[#435951]">
              Permissions · {selected.length} selected
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
          <button
            type="button"
            disabled={pending}
            onClick={() => void remove()}
            className="rounded-xl border border-rose-200 px-4 py-2.5 text-xs font-bold text-rose-700"
          >
            {confirmDelete ? 'Confirm permanent removal' : 'Delete role'}
          </button>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onCancel}
              className="rounded-xl border border-[#d9e3df] px-4 py-2.5 text-xs font-bold"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={pending}
              className="rounded-xl bg-[#0b5f4b] px-5 py-2.5 text-xs font-bold text-white"
            >
              {pending ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </div>
      </form>
    </SectionCard>
  );
}

export function MembershipDirectory({ roles }: { roles: readonly Role[] }) {
  const [members, setMembers] = useState<Membership[] | null>(null);
  const [selected, setSelected] = useState<Membership | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState('');
  useEffect(() => {
    getMembershipCatalogue()
      .then((result) => setMembers(result.data))
      .catch((failure: unknown) =>
        setError(failure instanceof Error ? failure.message : 'Unable to load team.'),
      )
      .finally(() => setLoading(false));
  }, []);

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
      setError(failure instanceof Error ? failure.message : 'Unable to update assignment.');
    } finally {
      setPending('');
    }
  }

  return (
    <SectionCard>
      <div className="border-b border-[#edf1ef] px-6 py-5">
        <p className="text-[10px] font-extrabold uppercase tracking-[.18em] text-emerald-700">
          Membership directory
        </p>
        <h2 className="mt-1 text-xl font-bold text-[#173128]">Team role assignments</h2>
      </div>
      {error ? (
        <p role="alert" className="m-5 rounded-xl bg-rose-50 px-4 py-3 text-xs text-rose-800">
          {error}
        </p>
      ) : null}
      {loading ? (
        <div className="p-8 text-center text-xs text-[#7c8c86]">Loading tenant memberships…</div>
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
                  {member.status.toLowerCase()}
                </StatusBadge>
              </button>
            ))}
          </div>
          <div className="border-t border-[#edf1ef] bg-[#fbfcfb] p-6 lg:border-l lg:border-t-0">
            {selected ? (
              <>
                <h3 className="text-sm font-bold text-[#1b372d]">
                  Manage {selected.firstName}&apos;s roles
                </h3>
                <p className="mt-1 text-xs text-[#85938f]">
                  Changes are enforced and audited immediately.
                </p>
                <div className="mt-4 space-y-2">
                  {roles.map((role) => {
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
                          disabled={pending === key || (selected.status !== 'ACTIVE' && !assigned)}
                          onChange={(event) => void toggle(role, event.target.checked)}
                        />
                        <span className="flex-1 text-xs font-bold text-[#315247]">{role.name}</span>
                        <span className="text-[9px] text-[#899691]">
                          {role.type === 'SYSTEM' ? 'Protected role' : 'Custom'}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </>
            ) : (
              <div className="py-12 text-center text-xs text-[#84928d]">
                Select a team member to manage assignments.
              </div>
            )}
          </div>
        </div>
      ) : null}
    </SectionCard>
  );
}
