'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { Icon } from '@/components/platform/icon';
import { SectionCard, StatusBadge } from '@/components/platform/dashboard-primitives';
import { ApiError, createRole, getAuthorizationCatalogue } from '@/lib/api-client';
import {
  normalizeRoleName,
  validateCreateRole,
  type AuthorizationCatalogue,
  type CreateRoleErrors,
  type CreateRoleRequest,
  type Permission,
  type Role,
} from '@/lib/authorization-contract';

type RoleFilter = 'ALL' | 'SYSTEM' | 'TENANT';

export function TeamAccessWorkspace() {
  const [catalogue, setCatalogue] = useState<AuthorizationCatalogue | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ message: string; status?: number } | null>(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<RoleFilter>('ALL');
  const [createOpen, setCreateOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setCatalogue(await getAuthorizationCatalogue());
    } catch (loadError) {
      setError({
        message: loadError instanceof Error ? loadError.message : 'Unable to load access controls.',
        status: loadError instanceof ApiError ? loadError.status : undefined,
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const visibleRoles = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return (catalogue?.roles ?? []).filter((role) => {
      const matchesType = filter === 'ALL' || role.type === filter;
      const matchesQuery =
        normalizedQuery.length === 0 ||
        role.name.toLowerCase().includes(normalizedQuery) ||
        role.description?.toLowerCase().includes(normalizedQuery);
      return matchesType && matchesQuery;
    });
  }, [catalogue, filter, query]);

  function handleCreated(role: Role) {
    setCatalogue((current) =>
      current
        ? {
            ...current,
            roles: [...current.roles, role].sort((a, b) => a.name.localeCompare(b.name)),
            total: current.total + 1,
          }
        : current,
    );
    setCreateOpen(false);
  }

  return (
    <div className="mx-auto max-w-[94rem] space-y-5 sm:space-y-6">
      <header className="relative overflow-hidden rounded-[1.75rem] bg-[#08231d] px-5 py-7 text-white shadow-[0_24px_70px_-38px_rgba(5,35,28,.75)] sm:px-8 sm:py-9">
        <div className="premium-grid absolute inset-0 opacity-40" />
        <div className="absolute -right-20 -top-28 size-72 rounded-full bg-emerald-400/15 blur-[80px]" />
        <div className="relative flex flex-col justify-between gap-7 lg:flex-row lg:items-end">
          <div className="max-w-3xl">
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="inline-flex items-center gap-2 text-[10px] font-extrabold uppercase tracking-[.2em] text-emerald-300">
                <Icon name="shield" className="size-4" />
                Identity governance
              </span>
              <span className="rounded-full border border-emerald-200/15 bg-emerald-300/10 px-2.5 py-1 text-[9px] font-bold text-emerald-200">
                Live authorization data
              </span>
            </div>
            <h1 className="mt-4 font-[var(--font-display)] text-3xl font-bold tracking-[-.045em] sm:text-[2.55rem]">
              Team &amp; access
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-white/50">
              Build least-privilege roles from the tenant permission catalogue. Every successful
              change is enforced and audited by the authorization service.
            </p>
          </div>
          <div className="flex flex-wrap gap-2.5">
            <button
              type="button"
              onClick={() => void load()}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[.06] px-4 py-2.5 text-xs font-bold text-white/75 transition hover:bg-white/10 disabled:cursor-wait disabled:opacity-50"
            >
              <Icon name="refresh" className={`size-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              disabled={!catalogue}
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-300 px-4 py-2.5 text-xs font-black text-[#08231d] shadow-[0_14px_28px_-16px_rgba(110,231,183,.75)] transition hover:-translate-y-0.5 hover:bg-emerald-200 disabled:cursor-not-allowed disabled:opacity-45"
            >
              <Icon name="plus" className="size-4" />
              Create custom role
            </button>
          </div>
        </div>
      </header>

      {catalogue ? <AccessMetrics catalogue={catalogue} /> : null}

      {createOpen && catalogue ? (
        <CreateRolePanel
          permissions={catalogue.permissions}
          onCancel={() => setCreateOpen(false)}
          onCreated={handleCreated}
        />
      ) : null}

      <SectionCard>
        <div className="flex flex-col gap-4 border-b border-[#edf1ef] px-5 py-5 sm:px-6 lg:flex-row lg:items-center">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-extrabold uppercase tracking-[.18em] text-emerald-700">
              Role registry
            </p>
            <h2 className="mt-1 font-[var(--font-display)] text-xl font-bold tracking-[-.03em] text-[#173128]">
              Tenant roles
            </h2>
          </div>
          <div className="flex flex-col gap-2.5 sm:flex-row">
            <label className="relative min-w-64">
              <span className="sr-only">Search roles</span>
              <Icon
                name="search"
                className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-[#82918c]"
              />
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search roles"
                className="h-10 w-full rounded-xl border border-[#dbe4e0] bg-[#fbfcfb] pl-10 pr-3 text-xs text-[#18352c] placeholder:text-[#93a09c] focus:border-emerald-500"
              />
            </label>
            <div className="flex rounded-xl border border-[#dbe4e0] bg-[#f7f9f8] p-1">
              {(['ALL', 'SYSTEM', 'TENANT'] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setFilter(value)}
                  className={`rounded-lg px-3 py-2 text-[10px] font-extrabold transition ${
                    filter === value
                      ? 'bg-white text-emerald-800 shadow-sm'
                      : 'text-[#7b8b85] hover:text-[#3e5b51]'
                  }`}
                >
                  {value === 'ALL' ? 'All' : value === 'SYSTEM' ? 'System' : 'Custom'}
                </button>
              ))}
            </div>
          </div>
        </div>

        {loading && !catalogue ? <LoadingState /> : null}
        {error && !catalogue ? <ErrorState error={error} onRetry={load} /> : null}
        {catalogue && visibleRoles.length > 0 ? <RoleTable roles={visibleRoles} /> : null}
        {catalogue && visibleRoles.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <p className="text-sm font-bold text-[#28463c]">No matching roles</p>
            <p className="mt-2 text-xs text-[#7c8c86]">Adjust the search or role type filter.</p>
          </div>
        ) : null}
      </SectionCard>
    </div>
  );
}

function AccessMetrics({ catalogue }: { catalogue: AuthorizationCatalogue }) {
  const systemRoles = catalogue.roles.filter((role) => role.type === 'SYSTEM').length;
  const customRoles = catalogue.roles.filter((role) => role.type === 'TENANT').length;
  const assignments = catalogue.roles.reduce((total, role) => total + role.assignmentCount, 0);
  const metrics = [
    {
      label: 'Total roles',
      value: catalogue.total,
      detail: 'Active in this tenant',
      icon: 'team' as const,
    },
    {
      label: 'System roles',
      value: systemRoles,
      detail: 'Protected by policy',
      icon: 'shield' as const,
    },
    { label: 'Custom roles', value: customRoles, detail: 'Tenant managed', icon: 'key' as const },
    {
      label: 'Assignments',
      value: assignments,
      detail: `${catalogue.permissions.length} permissions available`,
      icon: 'trend' as const,
    },
  ];
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {metrics.map((metric) => (
        <article
          key={metric.label}
          className="rounded-[1.3rem] border border-[#dfe7e3] bg-white p-5 shadow-[0_14px_40px_rgba(24,57,47,.05)]"
        >
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-semibold text-[#71827c]">{metric.label}</p>
              <p className="mt-3 font-[var(--font-display)] text-[1.75rem] font-bold leading-none tracking-[-.045em] text-[#10271f]">
                {metric.value}
              </p>
            </div>
            <span className="grid size-10 place-items-center rounded-xl bg-emerald-50 text-emerald-700">
              <Icon name={metric.icon} className="size-[1.1rem]" />
            </span>
          </div>
          <p className="mt-4 text-[11px] font-medium text-[#7b8a85]">{metric.detail}</p>
        </article>
      ))}
    </div>
  );
}

function RoleTable({ roles }: { roles: readonly Role[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[820px] border-collapse text-left">
        <thead>
          <tr className="border-b border-[#edf1ef] bg-[#fbfcfb] text-[10px] font-extrabold uppercase tracking-[.13em] text-[#8a9994]">
            <th className="px-6 py-3.5" scope="col">
              Role
            </th>
            <th className="px-4 py-3.5" scope="col">
              Type
            </th>
            <th className="px-4 py-3.5" scope="col">
              Permissions
            </th>
            <th className="px-4 py-3.5" scope="col">
              Assignments
            </th>
            <th className="px-6 py-3.5" scope="col">
              Version
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#edf1ef]">
          {roles.map((role) => (
            <tr key={role.id} className="transition-colors hover:bg-[#fbfdfc]">
              <td className="px-6 py-4">
                <p className="text-sm font-bold text-[#1b372d]">{formatRoleName(role.name)}</p>
                <p className="mt-1 max-w-md text-xs text-[#85938f]">
                  {role.description ?? 'No description provided.'}
                </p>
              </td>
              <td className="px-4 py-4">
                <StatusBadge tone={role.type === 'SYSTEM' ? 'cyan' : 'emerald'}>
                  {role.type === 'SYSTEM' ? 'System' : 'Custom'}
                </StatusBadge>
              </td>
              <td className="px-4 py-4">
                <div className="flex max-w-sm flex-wrap gap-1.5">
                  {role.permissionKeys.slice(0, 2).map((permission) => (
                    <span
                      key={permission}
                      className="rounded-lg bg-[#f0f5f3] px-2 py-1 font-mono text-[9px] font-semibold text-[#4d685e]"
                    >
                      {shortPermission(permission)}
                    </span>
                  ))}
                  {role.permissionKeys.length > 2 ? (
                    <span className="rounded-lg bg-[#edf7f3] px-2 py-1 text-[9px] font-black text-emerald-700">
                      +{role.permissionKeys.length - 2}
                    </span>
                  ) : null}
                  {role.permissionKeys.length === 0 ? (
                    <span className="text-xs text-[#98a49f]">None</span>
                  ) : null}
                </div>
              </td>
              <td className="px-4 py-4 text-sm font-bold text-[#405a52]">{role.assignmentCount}</td>
              <td className="px-6 py-4 font-mono text-xs font-semibold text-[#6d7f78]">
                v{role.version}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CreateRolePanel({
  permissions,
  onCancel,
  onCreated,
}: {
  permissions: readonly Permission[];
  onCancel: () => void;
  onCreated: (role: Role) => void;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [errors, setErrors] = useState<CreateRoleErrors & { form?: string }>({});
  const [pending, setPending] = useState(false);
  const grouped = groupPermissions(permissions);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const request: CreateRoleRequest = {
      name: normalizeRoleName(name),
      ...(description.trim() ? { description: description.trim() } : {}),
      permissionKeys: selected,
    };
    const validation = validateCreateRole(
      request,
      permissions.map((permission) => permission.name),
    );
    if (Object.keys(validation).length > 0) {
      setErrors(validation);
      return;
    }
    setPending(true);
    setErrors({});
    try {
      onCreated(await createRole(request));
    } catch (submitError) {
      setErrors({
        form: submitError instanceof Error ? submitError.message : 'Unable to create role.',
      });
    } finally {
      setPending(false);
    }
  }

  return (
    <SectionCard className="ring-1 ring-emerald-600/10">
      <form onSubmit={submit} noValidate>
        <div className="flex items-start justify-between gap-5 border-b border-[#edf1ef] px-5 py-5 sm:px-6">
          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-[.18em] text-emerald-700">
              Least privilege
            </p>
            <h2 className="mt-1 font-[var(--font-display)] text-xl font-bold text-[#173128]">
              Create custom role
            </h2>
            <p className="mt-2 text-xs leading-5 text-[#7a8a84]">
              Choose only the capabilities this job function needs.
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="grid size-9 place-items-center rounded-xl border border-[#dfe7e3] text-[#6f8079] hover:bg-[#f7f9f8]"
            aria-label="Close role form"
          >
            <Icon name="close" className="size-4" />
          </button>
        </div>

        <div className="grid gap-6 p-5 sm:p-6 xl:grid-cols-[.75fr_1.25fr]">
          <div className="space-y-4">
            <label className="block">
              <span className="mb-2 block text-xs font-bold text-[#435951]">Role name</span>
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                onBlur={() => setName(normalizeRoleName(name))}
                placeholder="PHARMACY_MANAGER"
                aria-invalid={Boolean(errors.name)}
                className="w-full rounded-xl border border-[#dbe4e0] bg-[#fbfcfb] px-4 py-3 text-sm font-semibold text-[#17342b] placeholder:text-[#9aa6a2] focus:border-emerald-500"
              />
              {errors.name ? <p className="mt-2 text-xs text-rose-700">{errors.name}</p> : null}
            </label>
            <label className="block">
              <span className="mb-2 block text-xs font-bold text-[#435951]">
                Description <span className="font-medium text-[#8b9894]">(optional)</span>
              </span>
              <textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                maxLength={240}
                rows={4}
                placeholder="What this role is responsible for"
                aria-invalid={Boolean(errors.description)}
                className="w-full resize-none rounded-xl border border-[#dbe4e0] bg-[#fbfcfb] px-4 py-3 text-sm text-[#17342b] placeholder:text-[#9aa6a2] focus:border-emerald-500"
              />
              <div className="mt-2 flex justify-between gap-3 text-[10px] text-[#899691]">
                <span>{errors.description ?? 'Visible to access administrators.'}</span>
                <span>{description.length}/240</span>
              </div>
            </label>
          </div>

          <fieldset>
            <legend className="text-xs font-bold text-[#435951]">Permissions</legend>
            <p className="mt-1 text-[11px] text-[#83908c]">
              {selected.length} of {permissions.length} selected
            </p>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              {Object.entries(grouped).map(([group, groupPermissions]) => (
                <div key={group} className="rounded-2xl border border-[#e1e8e5] bg-[#fbfcfb] p-3">
                  <p className="px-1 text-[9px] font-extrabold uppercase tracking-[.15em] text-emerald-700">
                    {group}
                  </p>
                  <div className="mt-2 space-y-1">
                    {groupPermissions.map((permission) => (
                      <label
                        key={permission.id}
                        className="flex cursor-pointer items-start gap-3 rounded-xl px-2 py-2.5 transition hover:bg-white"
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
                          className="mt-0.5 size-4 rounded border-[#bdcac5] text-emerald-600 focus:ring-emerald-500"
                        />
                        <span>
                          <span className="block font-mono text-[10px] font-bold text-[#315247]">
                            {shortPermission(permission.name)}
                          </span>
                          <span className="mt-1 block text-[10px] leading-4 text-[#85938e]">
                            {permission.description}
                          </span>
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            {errors.permissionKeys ? (
              <p className="mt-2 text-xs text-rose-700">{errors.permissionKeys}</p>
            ) : null}
          </fieldset>
        </div>

        {errors.form ? (
          <p
            className="mx-5 mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-semibold text-rose-800 sm:mx-6"
            role="alert"
          >
            {errors.form}
          </p>
        ) : null}
        <div className="flex flex-col-reverse gap-2 border-t border-[#edf1ef] bg-[#fbfcfb] px-5 py-4 sm:flex-row sm:justify-end sm:px-6">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-xl border border-[#d9e3df] bg-white px-4 py-2.5 text-xs font-bold text-[#526a61]"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={pending}
            className="rounded-xl bg-[#0b5f4b] px-5 py-2.5 text-xs font-bold text-white shadow-[0_10px_24px_rgba(11,95,75,.18)] disabled:cursor-wait disabled:opacity-60"
          >
            {pending ? 'Creating role…' : 'Create role'}
          </button>
        </div>
      </form>
    </SectionCard>
  );
}

function LoadingState() {
  return (
    <div className="grid gap-3 p-6 sm:grid-cols-2" role="status">
      {[0, 1, 2, 3].map((item) => (
        <div key={item} className="h-24 animate-pulse rounded-2xl bg-[#f0f4f2]" />
      ))}
      <span className="sr-only">Loading access controls</span>
    </div>
  );
}

function ErrorState({
  error,
  onRetry,
}: {
  error: { message: string; status?: number };
  onRetry: () => Promise<void>;
}) {
  const signedOut = error.status === 401;
  return (
    <div className="px-6 py-16 text-center">
      <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-rose-50 text-rose-700">
        <Icon name="warning" className="size-5" />
      </span>
      <p className="mt-4 text-sm font-bold text-[#28463c]">
        {signedOut
          ? 'Session expired'
          : error.status === 403
            ? 'Access denied'
            : 'Access controls unavailable'}
      </p>
      <p className="mx-auto mt-2 max-w-md text-xs leading-5 text-[#7c8c86]">{error.message}</p>
      {signedOut ? (
        <a
          href="/login"
          className="mt-5 inline-flex rounded-xl bg-[#0b5f4b] px-4 py-2.5 text-xs font-bold text-white"
        >
          Sign in again
        </a>
      ) : (
        <button
          type="button"
          onClick={() => void onRetry()}
          className="mt-5 rounded-xl border border-[#d9e3df] bg-white px-4 py-2.5 text-xs font-bold text-[#426157]"
        >
          Try again
        </button>
      )}
    </div>
  );
}

function groupPermissions(permissions: readonly Permission[]): Record<string, Permission[]> {
  return permissions.reduce<Record<string, Permission[]>>((groups, permission) => {
    const group = permission.name.split('.')[0] ?? 'other';
    (groups[group] ??= []).push(permission);
    return groups;
  }, {});
}

function formatRoleName(value: string): string {
  return value
    .toLowerCase()
    .split('_')
    .map((part) => `${part[0]?.toUpperCase() ?? ''}${part.slice(1)}`)
    .join(' ');
}

function shortPermission(value: string): string {
  const parts = value.split('.');
  return parts.length > 1 ? parts.slice(1).join('.') : value;
}
