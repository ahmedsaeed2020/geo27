/**
 * Global search extension point (additive Core API). An app plugin may register a provider that contributes pages,
 * permitted actions and reports to the awesomebar while its experience is active (M-05 command discovery). With no
 * provider registered the awesomebar behaves exactly as the Frappe awesome_bar port (DocTypes, reports, records).
 */
export type SearchHref = { to: string; params?: Record<string, string>; search?: Record<string, unknown> };
export interface SearchHit {
  label: string;
  /** Short category shown on the right (e.g. "Page", "Action", "Report"). */
  hint: string;
  /** Higher ranks first; exact/prefix label matches should score above substring matches. */
  score: number;
  href?: SearchHref;
  /** Runs instead of navigation (e.g. create a new native draft, then open it). */
  run?: (nav: (h: SearchHref) => void) => void;
}
export interface SearchContext { appOf: (doctype: string) => string | undefined; lang: string; /** roles allowed on a report (empty = everyone); undefined when the report does not exist */ reportRoles?: (report: string) => string[] | undefined }
export type SearchProvider = (q: string, ctx: SearchContext) => SearchHit[];

const providers = new Map<string, SearchProvider>();
export function registerSearchProvider(id: string, p: SearchProvider) { providers.set(id, p); }
export function unregisterSearchProvider(id: string) { providers.delete(id); }

/** Folds case, Arabic diacritics and letter variants so "الاستاذ" finds "الأستاذ". */
export function foldSearch(s: string): string {
  return s.toLowerCase().normalize("NFKD").replace(/[\u064B-\u065F\u0670\u0640]/g, "").replace(/[أإآٱ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه").replace(/\s+/g, " ").trim();
}
/** 3 = exact, 2 = prefix / word prefix, 1 = substring, 0 = no match (folded). */
export function matchRank(q: string, label: string): number {
  const a = foldSearch(q), b = foldSearch(label); if (!a || !b) return 0;
  if (a === b) return 3;
  if (b.startsWith(a) || b.split(/[\s/·—-]+/).some((w) => w.startsWith(a))) return 2;
  return b.includes(a) ? 1 : 0;
}

export function runSearchProviders(q: string, ctx: SearchContext): SearchHit[] {
  const out: SearchHit[] = [];
  for (const p of providers.values()) { try { out.push(...p(q, ctx)); } catch { /* a failing provider never breaks Core search */ } }
  return out.sort((x, y) => y.score - x.score);
}
