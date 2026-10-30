// Shared term (เทอม) helpers — usable on both server and client.
// A term key is "YYYY/N" (พ.ศ. / เทอม), e.g. "2568/1".

export interface TermItem { academicYear?: number | null; term?: number | null }

export function parseTerm(term: string | null | undefined): { year: number; no: number } | null {
  if (!term) return null;
  const m = String(term).match(/^(\d{4})\/([12])$/);
  if (!m) return null;
  return { year: Number(m[1]), no: Number(m[2]) };
}

export function termKeyOf(a: TermItem): string {
  return a.academicYear && a.term ? `${a.academicYear}/${a.term}` : '';
}

/** Filter assignment-like items by a term query string. Empty/invalid = no filter. */
export function filterByTerm<T extends TermItem>(items: T[], term: string | null | undefined): T[] {
  const t = parseTerm(term);
  if (!t) return items;
  return items.filter((a) => a.academicYear === t.year && a.term === t.no);
}
