'use client';

import { useEffect, useState } from 'react';

/**
 * Shared term (เทอม) dropdown. Controlled by `value` (a "YYYY/N" string, or ''
 * for ทุกเทอม). When the page passes `value === undefined`, this resolves a
 * default once and reports it via `onChange`.
 *
 * The DEFAULT is the ACTIVE term (system/config.currentTerm) so each menu shows
 * only the current term's work and past terms don't clutter it. The teacher can
 * still pick "ทุกเทอม" or an older term; that pick is remembered until Admin
 * changes the active term, at which point it resets back to the new active term.
 */
const CUR_KEY = 'lms_term';

export default function TermSelect({
  value,
  onChange,
  className,
}: {
  value: string | undefined;
  onChange: (term: string) => void;
  className?: string;
}) {
  const [terms, setTerms] = useState<string[]>([]);
  const [current, setCurrent] = useState<string>('');

  useEffect(() => {
    let cancelled = false;
    fetch('/api/teacher/terms')
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        const list: string[] = Array.isArray(d?.terms) ? d.terms : [];
        const cur: string = typeof d?.current === 'string' ? d.current : '';
        setTerms(list);
        setCurrent(cur);
        if (value === undefined) {
          // Default = the ACTIVE term, so past terms don't show unless chosen. A
          // saved pick (incl. an explicit "ทุกเทอม") only sticks while the active
          // term hasn't changed since it was made.
          let init = cur; // current term by default
          try {
            const raw = localStorage.getItem(CUR_KEY);
            if (raw) {
              const saved = JSON.parse(raw) as { sel?: string; cur?: string };
              if (saved && saved.cur === cur && (saved.sel === '' || (saved.sel && list.includes(saved.sel)))) {
                init = saved.sel ?? init;
              }
            }
          } catch { /* ignore malformed / legacy value */ }
          onChange(init);
        }
      })
      .catch(() => { if (!cancelled && value === undefined) onChange(''); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handle(v: string) {
    try { localStorage.setItem(CUR_KEY, JSON.stringify({ sel: v, cur: current })); } catch { /* ignore */ }
    onChange(v);
  }

  // Nothing to switch between — hide the control.
  if (terms.length === 0) return null;

  return (
    <select
      value={value ?? ''}
      onChange={(e) => handle(e.target.value)}
      title="เลือกเทอมที่จะดูข้อมูล"
      className={className ?? 'rounded-lg border border-blue-800 bg-blue-950/30 px-3 py-1.5 text-xs text-blue-200'}
    >
      <option value="">🗓 ทุกเทอม</option>
      {terms.map((t) => {
        const [y, n] = t.split('/');
        return <option key={t} value={t}>ปี {y} เทอม {n}</option>;
      })}
    </select>
  );
}
