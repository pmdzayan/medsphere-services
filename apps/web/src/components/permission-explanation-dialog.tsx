'use client';

import { useEffect, useId, useRef } from 'react';
import { useLanguage } from './language-provider';

export function PermissionExplanationDialog({
  kind,
  open,
  busy = false,
  onContinue,
  onAlternative,
}: {
  readonly kind: 'location' | 'notifications';
  readonly open: boolean;
  readonly busy?: boolean;
  readonly onContinue: () => void;
  readonly onAlternative: () => void;
}) {
  const { t } = useLanguage();
  const titleId = useId();
  const descriptionId = useId();
  const alternativeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    alternativeRef.current?.focus();

    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape' && !busy) onAlternative();
    }

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [busy, onAlternative, open]);

  if (!open) return null;

  const titleKey =
    kind === 'location' ? 'permissions.location.title' : 'permissions.notifications.title';
  const explanationKey =
    kind === 'location'
      ? 'permissions.location.explanation'
      : 'permissions.notifications.explanation';
  const precisionKey =
    kind === 'location' ? 'permissions.location.precision' : 'permissions.notifications.precision';
  const continueKey =
    kind === 'location'
      ? 'permissions.action.continueLocation'
      : 'permissions.action.continueNotifications';
  const alternativeKey =
    kind === 'location' ? 'permissions.action.manualLocation' : 'permissions.action.cancel';

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-[#031711]/70 p-3 backdrop-blur-sm sm:items-center sm:p-6"
      role="presentation"
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className="w-full max-w-lg rounded-[1.5rem] bg-white p-5 shadow-2xl sm:p-7"
      >
        <h2 id={titleId} className="text-xl font-extrabold text-[#173128] sm:text-2xl">
          {t(titleKey)}
        </h2>
        <div id={descriptionId} className="mt-3 space-y-3 text-sm leading-6 text-[#536a62]">
          <p>{t(explanationKey)}</p>
          <p>{t(precisionKey)}</p>
        </div>
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            ref={alternativeRef}
            type="button"
            onClick={onAlternative}
            disabled={busy}
            className="min-h-11 rounded-xl border border-[#173128]/15 px-4 py-2.5 text-sm font-bold text-[#334a42] focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:ring-offset-2 disabled:opacity-50"
          >
            {t(alternativeKey)}
          </button>
          <button
            type="button"
            onClick={onContinue}
            disabled={busy}
            className="min-h-11 rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-bold text-white focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:ring-offset-2 disabled:cursor-wait disabled:opacity-60"
          >
            {t(continueKey)}
          </button>
        </div>
      </section>
    </div>
  );
}
