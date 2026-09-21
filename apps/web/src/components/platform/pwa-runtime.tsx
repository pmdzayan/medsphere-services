'use client';

import { useEffect } from 'react';

function isLocalDevelopmentHost(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
}

export function canRegisterAimServiceWorker(location: Pick<Location, 'protocol' | 'hostname'>): boolean {
  return location.protocol === 'https:' || isLocalDevelopmentHost(location.hostname);
}

/**
 * Registers AIM's privacy-conservative service worker.
 *
 * The worker itself only caches public/versioned static assets. It never
 * intercepts API traffic or page navigations, so protected healthcare state
 * remains network/server authoritative.
 */
export function PwaRuntime() {
  useEffect(() => {
    if (!('serviceWorker' in navigator) || !canRegisterAimServiceWorker(window.location)) {
      return;
    }

    let cancelled = false;

    void navigator.serviceWorker
      .register('/sw.js', {
        scope: '/',
        updateViaCache: 'none',
      })
      .then((registration) => {
        if (!cancelled) {
          void registration.update();
        }
      })
      .catch(() => {
        // PWA enhancement must never block rendering, auth, or healthcare work.
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
