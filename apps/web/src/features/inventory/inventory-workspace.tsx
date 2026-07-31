'use client';

import { useMemo, useState } from 'react';

import { MetricCard, SectionCard, StatusBadge } from '@/components/platform/dashboard-primitives';
import { Icon } from '@/components/platform/icon';

import { filterInventoryItems, inventoryItems, type InventoryStatus } from './inventory-data';

const statusPresentation: Record<
  InventoryStatus,
  { label: string; tone: 'emerald' | 'amber' | 'rose' | 'cyan' }
> = {
  healthy: { label: 'Healthy', tone: 'emerald' },
  low: { label: 'Low stock', tone: 'amber' },
  expiring: { label: 'Expiring soon', tone: 'cyan' },
  out: { label: 'Out of stock', tone: 'rose' },
};

const statusTabs: Array<{ value: 'all' | InventoryStatus; label: string; count: number }> = [
  { value: 'all', label: 'All stock', count: inventoryItems.length },
  {
    value: 'low',
    label: 'Low stock',
    count: inventoryItems.filter((item) => item.status === 'low').length,
  },
  {
    value: 'expiring',
    label: 'Expiring soon',
    count: inventoryItems.filter((item) => item.status === 'expiring').length,
  },
  {
    value: 'out',
    label: 'Out of stock',
    count: inventoryItems.filter((item) => item.status === 'out').length,
  },
];

const categories = [
  'all',
  ...Array.from(new Set(inventoryItems.map((item) => item.category))).sort(),
];

function formatCurrency(value: number) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: value < 10 ? 2 : 0,
    maximumFractionDigits: value < 10 ? 2 : 0,
  }).format(value);
}

export function InventoryWorkspace() {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<'all' | InventoryStatus>('all');
  const [category, setCategory] = useState('all');

  const filteredItems = useMemo(
    () => filterInventoryItems(inventoryItems, { query, status, category }),
    [category, query, status],
  );

  const clearFilters = () => {
    setQuery('');
    setStatus('all');
    setCategory('all');
  };

  return (
    <div className="mx-auto max-w-[94rem] space-y-5 sm:space-y-6">
      <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <p className="text-xs font-extrabold uppercase tracking-[.18em] text-emerald-700">
              Inventory control
            </p>
            <span className="rounded-full bg-[#e8f3ef] px-2.5 py-1 text-[10px] font-bold text-[#42645a]">
              Preview data
            </span>
          </div>
          <h1 className="mt-3 font-[var(--font-display)] text-3xl font-bold tracking-[-.045em] text-[#10271f] sm:text-[2.45rem]">
            Medicine inventory
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[#71817c]">
            Monitor batches, availability, reorder positions, and expiry risk from one workspace.
          </p>
        </div>
        <div className="flex flex-wrap gap-2.5">
          <button
            type="button"
            disabled
            title="Available when inventory import APIs are connected"
            className="inline-flex cursor-not-allowed items-center gap-2 rounded-xl border border-[#d8e2de] bg-white px-4 py-2.5 text-sm font-bold text-[#657770] opacity-70"
          >
            <Icon name="download" className="size-4" />
            Import stock
          </button>
          <button
            type="button"
            disabled
            title="Available when stock receipt APIs are connected"
            className="inline-flex cursor-not-allowed items-center gap-2 rounded-xl bg-[#0b5f4b] px-4 py-2.5 text-sm font-bold text-white opacity-70 shadow-[0_10px_24px_rgba(11,95,75,.18)]"
          >
            <Icon name="plus" className="size-4" />
            Receive stock
          </button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Inventory value"
          value="₹24.8L"
          icon="billing"
          detail="Across active sellable batches"
        />
        <MetricCard
          label="Active products"
          value="1,254"
          icon="inventory"
          accent="cyan"
          detail="18,420 available units"
        />
        <MetricCard
          label="Low stock"
          value="94"
          icon="warning"
          accent="amber"
          detail="27 items below critical level"
        />
        <MetricCard
          label="Expiring in 90 days"
          value="21"
          icon="calendar"
          accent="rose"
          detail="₹38,420 value at risk"
        />
      </div>

      <SectionCard>
        <div className="border-b border-[#e8eeeb] px-4 pt-4 sm:px-6 sm:pt-5">
          <div className="flex gap-1 overflow-x-auto" role="tablist" aria-label="Inventory status">
            {statusTabs.map((tab) => {
              const active = status === tab.value;
              return (
                <button
                  key={tab.value}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setStatus(tab.value)}
                  className={`relative shrink-0 rounded-t-xl px-3.5 pb-3 pt-2 text-xs font-bold transition-colors sm:px-4 ${
                    active ? 'text-emerald-800' : 'text-[#7d8c87] hover:text-[#38554b]'
                  }`}
                >
                  {tab.label}
                  <span
                    className={`ml-2 rounded-full px-2 py-0.5 text-[10px] ${active ? 'bg-emerald-100' : 'bg-[#f0f3f2]'}`}
                  >
                    {tab.count}
                  </span>
                  {active ? (
                    <span className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-emerald-600" />
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex flex-col gap-3 border-b border-[#edf1ef] bg-[#fbfcfb] p-4 sm:flex-row sm:items-center sm:p-5 lg:px-6">
          <label className="relative min-w-0 flex-1">
            <span className="sr-only">Search medicine inventory</span>
            <Icon
              name="search"
              className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-[#8b9a95]"
            />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search product, generic, SKU, or batch"
              className="h-11 w-full rounded-xl border border-[#dce5e1] bg-white pl-10 pr-4 text-sm text-[#264239] placeholder:text-[#9aa7a3] focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/15"
            />
          </label>
          <label className="relative sm:w-48">
            <span className="sr-only">Filter by category</span>
            <Icon
              name="filter"
              className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-[#8b9a95]"
            />
            <select
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              className="h-11 w-full appearance-none rounded-xl border border-[#dce5e1] bg-white pl-10 pr-8 text-sm font-semibold text-[#4b625a] focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/15"
            >
              {categories.map((option) => (
                <option key={option} value={option}>
                  {option === 'all' ? 'All categories' : option}
                </option>
              ))}
            </select>
            <Icon
              name="chevron"
              className="pointer-events-none absolute right-3 top-1/2 size-3.5 -translate-y-1/2 rotate-90 text-[#8b9a95]"
            />
          </label>
          <button
            type="button"
            disabled
            title="Barcode scanner connection is not configured"
            className="grid size-11 shrink-0 cursor-not-allowed place-items-center rounded-xl border border-[#dce5e1] bg-white text-[#789089] opacity-65"
            aria-label="Scan barcode"
          >
            <Icon name="scan" className="size-[1.1rem]" />
          </button>
        </div>

        <div className="flex items-center justify-between gap-4 border-b border-[#edf1ef] px-5 py-3 text-xs text-[#7c8c87] sm:px-6">
          <p>
            <strong className="text-[#354f46]">{filteredItems.length}</strong> medicines shown
          </p>
          {(query || status !== 'all' || category !== 'all') && (
            <button
              type="button"
              onClick={clearFilters}
              className="font-bold text-emerald-700 hover:text-emerald-800"
            >
              Clear filters
            </button>
          )}
        </div>

        {filteredItems.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] border-collapse text-left">
              <thead>
                <tr className="border-b border-[#edf1ef] bg-[#fbfcfb] text-[10px] font-extrabold uppercase tracking-[.13em] text-[#8a9994]">
                  <th scope="col" className="px-6 py-3.5">
                    Medicine
                  </th>
                  <th scope="col" className="px-4 py-3.5">
                    Batch & expiry
                  </th>
                  <th scope="col" className="px-4 py-3.5">
                    Stock position
                  </th>
                  <th scope="col" className="px-4 py-3.5">
                    Location
                  </th>
                  <th scope="col" className="px-4 py-3.5">
                    Unit price
                  </th>
                  <th scope="col" className="px-4 py-3.5">
                    Status
                  </th>
                  <th scope="col" className="px-6 py-3.5">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#edf1ef]">
                {filteredItems.map((item) => {
                  const presentation = statusPresentation[item.status];
                  const stockPercent = Math.min(
                    100,
                    Math.round((item.available / Math.max(item.reorderAt, 1)) * 100),
                  );
                  return (
                    <tr key={item.id} className="transition-colors hover:bg-[#fbfdfc]">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#edf6f2] text-emerald-700">
                            <Icon name="inventory" className="size-[1.1rem]" />
                          </span>
                          <div>
                            <p className="text-sm font-bold text-[#1b372d]">{item.product}</p>
                            <p className="mt-1 text-xs text-[#85938f]">
                              {item.genericName} · {item.sku}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <p className="font-mono text-xs font-semibold text-[#516861]">
                          {item.batch}
                        </p>
                        <p className="mt-1 text-xs text-[#8a9893]">Expires {item.expiry}</p>
                      </td>
                      <td className="w-44 px-4 py-4">
                        <div className="flex items-end justify-between gap-3">
                          <p className="text-sm font-bold text-[#28453b]">{item.available}</p>
                          <p className="text-[10px] text-[#8d9a96]">{item.reserved} reserved</p>
                        </div>
                        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#edf2f0]">
                          <div
                            className={`h-full rounded-full ${item.status === 'out' ? 'bg-rose-400' : item.status === 'low' ? 'bg-amber-400' : 'bg-emerald-500'}`}
                            style={{ width: `${stockPercent}%` }}
                          />
                        </div>
                      </td>
                      <td className="px-4 py-4 text-xs font-semibold text-[#536a62]">
                        {item.location}
                      </td>
                      <td className="px-4 py-4 text-sm font-semibold text-[#405a52]">
                        {formatCurrency(item.unitPrice)}
                      </td>
                      <td className="px-4 py-4">
                        <StatusBadge tone={presentation.tone}>{presentation.label}</StatusBadge>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button
                          type="button"
                          disabled
                          aria-label={`Actions for ${item.product}`}
                          className="cursor-not-allowed rounded-lg p-2 text-[#9aa7a3]"
                        >
                          <Icon name="more" className="size-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="grid min-h-72 place-items-center px-6 py-12 text-center">
            <div>
              <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-[#edf6f2] text-emerald-700">
                <Icon name="search" className="size-5" />
              </span>
              <h2 className="mt-4 font-[var(--font-display)] text-lg font-bold text-[#203c32]">
                No inventory found
              </h2>
              <p className="mt-2 text-sm text-[#80908b]">
                Try a different search or clear the active filters.
              </p>
              <button
                type="button"
                onClick={clearFilters}
                className="mt-4 text-sm font-bold text-emerald-700 hover:text-emerald-800"
              >
                Clear all filters
              </button>
            </div>
          </div>
        )}
      </SectionCard>

      <p className="pb-2 text-center text-[11px] text-[#93a09c]">
        Sanitised sample inventory for interface validation · Live mutations remain disabled
      </p>
    </div>
  );
}
