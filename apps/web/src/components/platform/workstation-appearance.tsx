'use client';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';

export type WorkstationAppearancePreference = 'system' | 'light' | 'dark';
export type ResolvedWorkstationAppearance = 'light' | 'dark';

const STORAGE_KEY = 'aim.workstation.appearance';

interface WorkstationAppearanceContextValue {
  preference: WorkstationAppearancePreference;
  resolved: ResolvedWorkstationAppearance;
  setPreference: (preference: WorkstationAppearancePreference) => void;
}

const WorkstationAppearanceContext = createContext<WorkstationAppearanceContextValue | null>(null);

export function resolveWorkstationAppearance(
  preference: WorkstationAppearancePreference,
  systemDark: boolean,
): ResolvedWorkstationAppearance {
  if (preference === 'system') return systemDark ? 'dark' : 'light';
  return preference;
}

function isPreference(value: string | null): value is WorkstationAppearancePreference {
  return value === 'system' || value === 'light' || value === 'dark';
}

function applyAppearance(resolved: ResolvedWorkstationAppearance, preference: string) {
  document.documentElement.dataset.appearance = resolved;
  document.documentElement.dataset.appearancePreference = preference;
  document.documentElement.style.colorScheme = resolved;
}

export function WorkstationAppearanceProvider({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const [preference, setPreferenceState] = useState<WorkstationAppearancePreference>('system');
  const [systemDark, setSystemDark] = useState(false);

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const stored = window.localStorage.getItem(STORAGE_KEY);
    const nextPreference = isPreference(stored) ? stored : 'system';

    setPreferenceState(nextPreference);
    setSystemDark(media.matches);
    applyAppearance(resolveWorkstationAppearance(nextPreference, media.matches), nextPreference);

    const onChange = (event: MediaQueryListEvent) => {
      setSystemDark(event.matches);
    };
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  const resolved = resolveWorkstationAppearance(preference, systemDark);

  useEffect(() => {
    applyAppearance(resolved, preference);
  }, [preference, resolved]);

  function setPreference(nextPreference: WorkstationAppearancePreference) {
    setPreferenceState(nextPreference);
    window.localStorage.setItem(STORAGE_KEY, nextPreference);
  }

  const value = useMemo(
    () => ({ preference, resolved, setPreference }),
    [preference, resolved],
  );

  return (
    <WorkstationAppearanceContext.Provider value={value}>
      {children}
    </WorkstationAppearanceContext.Provider>
  );
}

export function useWorkstationAppearance(): WorkstationAppearanceContextValue {
  const value = useContext(WorkstationAppearanceContext);
  if (!value) {
    throw new Error(
      'useWorkstationAppearance must be used within WorkstationAppearanceProvider.',
    );
  }
  return value;
}
