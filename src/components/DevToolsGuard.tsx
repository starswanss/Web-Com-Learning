'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';

/**
 * Best-effort deterrent that blocks the common ways students open DevTools /
 * inspect the page: F12, Ctrl/⌘+Shift+I/J/C, Ctrl+U (view-source) and the
 * right-click context menu. Only active for students — teachers are unaffected.
 *
 * NOTE: this is DETERRENCE, not security. A determined user can still open
 * DevTools via the browser menu, disable JS, or use remote debugging. Treat it
 * as friction for casual inspection, not a guarantee. Never put secrets in
 * client code on the assumption this hides them.
 */
export default function DevToolsGuard() {
  const { profile } = useAuth();
  const [warned, setWarned] = useState(false);

  useEffect(() => {
    if (profile?.role !== 'student') return;

    const flashWarning = () => {
      setWarned(true);
      window.clearTimeout((flashWarning as unknown as { _t?: number })._t);
      (flashWarning as unknown as { _t?: number })._t = window.setTimeout(() => setWarned(false), 2500);
    };

    const onKey = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      const blocked =
        e.key === 'F12' ||
        ((e.ctrlKey || e.metaKey) && e.shiftKey && (k === 'i' || k === 'j' || k === 'c')) ||
        ((e.ctrlKey || e.metaKey) && k === 'u'); // view-source
      if (blocked) {
        e.preventDefault();
        e.stopPropagation();
        flashWarning();
      }
    };

    const onContext = (e: MouseEvent) => {
      e.preventDefault();
      flashWarning();
    };

    window.addEventListener('keydown', onKey, true);
    window.addEventListener('contextmenu', onContext, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('contextmenu', onContext, true);
    };
  }, [profile?.role]);

  if (!warned) return null;

  return (
    <div className="fixed bottom-24 left-1/2 z-[60] -translate-x-1/2 rounded-xl border border-amber-700/60 bg-amber-950/90 px-4 py-2.5 text-sm font-medium text-amber-300 shadow-lg backdrop-blur-sm sm:bottom-6">
      🚫 ไม่อนุญาตให้เปิดเครื่องมือผู้พัฒนา
    </div>
  );
}
