'use client';

import { useEffect } from 'react';

/**
 * Registers the network-first service worker (production only). The SW only
 * provides an offline fallback page — it never caches app content — so it
 * cannot serve a stale build after a deploy.
 */
export default function PWARegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return;
    if (!('serviceWorker' in navigator)) return;
    const onLoad = () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    };
    window.addEventListener('load', onLoad);
    return () => window.removeEventListener('load', onLoad);
  }, []);

  return null;
}
