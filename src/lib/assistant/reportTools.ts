/**
 * DIGIT Assistant report answers (Part B: PL8-b). The assistant can find a report and run it through the same local report
 * runner the report screen uses (src/lib/reportRunner.ts), as the signed-in user: a report about a record type the user may
 * not read is refused, and rows outside the user's User Permissions are removed (session.ts filterReportRows) before any
 * row, count or total reaches the model — so an answer never shows more than the user's own report screen would.
 */
import { RUNNERS, runnerDefaults, type F, type Row } from "@/lib/reportRunner";
import { cachedMeta, ensureMetas } from "@/lib/catalog";
import { currentUser, filterReportRows, hasPerm } from "@/lib/session";
import { translateTo } from "@/i18n";

type Out = Record<string, unknown>;
interface ReportIx { name: string; ref_doctype?: string; module?: string }
let repP: Promise<ReportIx[]> | null = null;
function loadReports(): Promise<ReportIx[]> {
  repP ??= fetch("/catalog/reports.json").then((r) => (r.ok ? (r.json() as Promise<ReportIx[]>) : [])).catch(() => { repP = null; return []; });
  return repP;
}
/** Test seam. */
export function __setReportsForTests(r: ReportIx[] | null) { repP = r ? Promise.resolve(r) : null; }

/** Refusal when the user may not read the report's record type (frappe: report permission follows its ref_doctype). */
async function refusal(report: string, user: string): Promise<Out | null> {
  if (!RUNNERS[report]) return { error: "unknown_report", report, hint: "Call find_reports to get an exact report name." };
  const ref = (await loadReports()).find((r) => r.name === report)?.ref_doctype;
  if (ref) { if (!cachedMeta(ref)) await ensureMetas([ref]); const m = cachedMeta(ref); if (m && !hasPerm(m, "read", undefined, user)) return { error: "not_permitted", report, doctype: ref }; }
  return null;
}

export async function findReports(query: string, user = currentUser()): Promise<Out> {
  const q = query.trim().toLowerCase(); const toks = q.split(/\s+/).filter((t) => t.length > 1);
  const ix = await loadReports(); const names = Object.keys(RUNNERS);
  const scored = names.map((name) => {
    const en = name.toLowerCase(); const ar = translateTo(name, "ar"); let s = 0;
    if (en === q || ar === query.trim()) s += 100; if (q && (en.includes(q) || ar.includes(query.trim()))) s += 60;
    for (const t of toks) if (en.includes(t) || ar.includes(t)) s += 18;
    return { name, s, ref: ix.find((r) => r.name === name)?.ref_doctype ?? "" };
  }).filter((x) => x.s > 0).sort((a, b) => b.s - a.s || a.name.localeCompare(b.name)).slice(0, 12);
  const out: Out[] = [];
  for (const x of scored) { if (await refusal(x.name, user)) continue; out.push({ report: x.name, label_ar: translateTo(x.name, "ar"), about: x.ref, filters: RUNNERS[x.name]!.filters.map((f) => ({ field: f.fieldname, label: f.label, type: f.fieldtype, ...(Array.isArray(f.options) ? { options: f.options } : {}) })) }); if (out.length >= 8) break; }
  return { reports: out };
}

export async function runReport(i: { report: string; filters: { field: string; value: string }[] | null; limit: number | null }, user = currentUser()): Promise<Out> {
  const no = await refusal(i.report, user); if (no) return no;
  const rn = RUNNERS[i.report]!; const known = new Set(rn.filters.map((f) => f.fieldname));
  const bad = (i.filters ?? []).filter((f) => !known.has(f.field)).map((f) => f.field);
  if (bad.length) return { error: "unknown_filter", unknown: bad, filters: rn.filters.map((f) => f.fieldname) };
  const f: F = { ...runnerDefaults(i.report), ...Object.fromEntries((i.filters ?? []).map((x) => [x.field, x.value])) };
  const r = rn.run(f); if (r.error) return { error: "report_error", message: r.error };
  const all = r.rows as Row[]; const kept = filterReportRows(all, user); const body = kept.filter((x) => !x.is_total);
  const nums = r.columns.filter((c) => ["Currency", "Float", "Int"].includes(c.fieldtype)).map((c) => c.fieldname);
  const totals = Object.fromEntries(nums.map((k) => [k, Math.round(body.reduce((a, b) => a + (typeof b[k] === "number" ? (b[k] as number) : 0), 0) * 100) / 100]));
  const limit = Math.min(25, Math.max(1, i.limit ?? 10)); const cols = r.columns.filter((c) => !c.hidden).map((c) => c.fieldname);
  return { report: i.report, filters: f, columns: r.columns.filter((c) => !c.hidden).map((c) => ({ field: c.fieldname, label: c.label, type: c.fieldtype })), row_count: body.length,
    hidden_by_permissions: all.filter((x) => !x.is_total).length - body.length, totals, rows: body.slice(0, limit).map((x) => Object.fromEntries(cols.map((k) => [k, x[k] ?? null]))) };
}
