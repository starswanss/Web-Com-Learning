'use client';

import { useEffect, useState } from 'react';

/**
 * Shared term (เทอม) dropdown. Controlled by `value` (a "YYYY/N" string, or ''
 * for ทุกเทอม). When the page passes `value === undefined`, this resolves a
 * default once — the saved choice (localStorage `lms_term`), else the active
 * term — and reports it via `onChange`. The choice is shared across all menus.
 */
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

  useEffect(() => {
    let cancelled = false;
    fetch('/api/teacher/terms')
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        const list: string[] = Array.isArray(d?.terms) ? d.terms : [];
        setTerms(list);
        if (value === undefined) {
          let init = '';
          try {
            const saved = localStorage.getItem('lms_term');
            if (saved !== null) init = saved; // '' = ทุกเทอม chosen explicitly
            else if (d?.current && list.includes(d.current)) init = d.current; // default: active term
          } catch { /* ignore */ }
          if (init && !list.includes(init)) init = ''; // saved term no longer present
          onChange(init);
        }
      })
      .catch(() => { if (!cancelled && value === undefined) onChange(''); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handle(v: string) {
    try { localStorage.setItem('lms_term', v); } catch { /* ignore */ }
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
