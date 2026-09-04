'use client';

import { useEffect } from 'react';

/**
 * Installs the offline shell, from the take flow only.
 *
 * Mounted here rather than in the root layout because the teacher app has no
 * offline story and would only inherit the staleness risk. Registration happens
 * on mount, which is while the student still has a connection — by the time it
 * matters the worker is already installed.
 *
 * The worker's scope is the whole origin regardless of where it is registered;
 * see public/sw.js for why /api/* is excluded from it.
 */
export const RegisterServiceWorker = () => {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    // Failure here is survivable — it costs the offline reload, not the
    // attempt, and the answers are in IndexedDB either way. Nothing the student
    // could do about it, so it stays out of their way.
    // Wait for the load event before taking stock. This effect runs during
    // hydration, when most of the chunks the page needs have not been recorded
    // yet — collecting then caught one asset out of a dozen, and a shell whose
    // scripts are missing never hydrates. It renders the server's "Loading…"
    // and stops there, which looks exactly like a hang.
    const settled = new Promise<void>((resolve) => {
      if (document.readyState === 'complete') {
        resolve();
        return;
      }
      window.addEventListener(
        'load',
        () => {
          resolve();
        },
        { once: true },
      );
    });

    const warm = async (): Promise<void> => {
      await navigator.serviceWorker.register('/sw.js');
      const registration = await navigator.serviceWorker.ready;
      await settled;

      // registration.active, not navigator.serviceWorker.controller. On a first
      // visit the worker has activated but has not finished claiming this page,
      // so controller is still null — and that is exactly the load whose cache
      // the student will need. Messaging the active worker warms it anyway; by
      // the time anything is read back, the claim has landed.
      const worker = registration.active;
      if (worker === null) return;

      // What this page actually loaded, straight from the browser. The worker
      // can't know it — these requests may well have happened before it took
      // control, and the student arrives here by client-side navigation, so
      // there was never a document request for it to see either.
      const assets = performance
        .getEntriesByType('resource')
        .map((entry) => entry.name)
        .filter((name) => name.startsWith(window.location.origin + '/_next/static/'));

      worker.postMessage({ type: 'warm-shell', shell: window.location.href, assets });
    };

    void warm().catch((error: unknown) => {
      console.warn('Offline shell unavailable', error);
    });
  }, []);

  return null;
};
