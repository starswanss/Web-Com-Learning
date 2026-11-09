import { adminDb } from '@/lib/firebase/admin';

/**
 * The active term that the admin set (system/config.currentTerm). New student
 * submissions are stamped with this so teacher views can separate work by term
 * even though the worksheets themselves are a permanent, reused library.
 *
 * Falls back to the current Thai year / term 1 if config is missing.
 */
export async function getActiveTerm(): Promise<{ academicYear: number; term: number }> {
  let academicYear = new Date().getFullYear() + 543;
  let term = 1;
  try {
    const cfg = await adminDb.collection('system').doc('config').get();
    const ct = cfg.exists ? cfg.data()?.currentTerm : null;
    if (ct && typeof ct.year === 'number') academicYear = ct.year;
    if (ct && (ct.term === 1 || ct.term === 2)) term = ct.term;
  } catch {
    /* default to current year / term 1 */
  }
  return { academicYear, term };
}
