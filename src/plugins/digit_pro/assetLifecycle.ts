/**
 * EC-R1 Phase 7 — Fixed Assets lifecycle selectors (SC-A-01, /pro/assets-overview). Read-only projections over the
 * existing asset workspace (assetWorkspace.ts) so every figure shares its company / as-of / finance-book scope.
 *  - Lifecycle timeline: native Asset.status in lifecycle order; each stage opens All Assets with the same scope + status.
 *  - Depreciation: scheduled rows from submitted Asset Depreciation Schedules. "Booked" is split into
 *    verified (the referenced Journal Entry is submitted AND has non-cancelled GL Entry rows the user can read) and
 *    reference-only (a journal reference exists but posting cannot be verified). Unbooked rows are due or upcoming.
 *    Nothing here posts depreciation — booking runs on the ERPNext server.
 */
import type { Doc } from "@/lib/adapter";
import { scopedList } from "@/lib/scope";
import { currentUser } from "@/lib/session";
import { addDays, monthEnd, type Bi, type Drill, type Severity } from "./command";
import { sourceStatus, type SourceStatus } from "./finance";
import type { projectAssets } from "./assetWorkspace";
import { postedJournalCheck } from "./postedJournal";

type Workspace = ReturnType<typeof projectAssets> & { states: Record<string, SourceStatus> };
const n = (v: unknown) => Number(v) || 0;
const s = (v: unknown) => String(v ?? "");
const r2 = (x: number) => Math.round(x * 100) / 100;

export type Phase = "acquire" | "use" | "care" | "retire";
export const PHASES: { id: Phase; label: Bi }[] = [
  { id: "acquire", label: ["Acquire", "الاقتناء"] }, { id: "use", label: ["In service", "في الخدمة"] },
  { id: "care", label: ["Maintain", "الصيانة"] }, { id: "retire", label: ["Retire", "الاستبعاد"] },
];
/** Native Asset.status values in lifecycle order (ERPNext asset.py set_status). Unknown statuses are appended, never dropped. */
export const LIFECYCLE: { status: string; phase: Phase; label: Bi }[] = [
  { status: "Draft", phase: "acquire", label: ["Draft", "مسودة"] },
  { status: "Submitted", phase: "use", label: ["Submitted, not yet depreciated", "معتمد ولم يُهلك بعد"] },
  { status: "Partially Depreciated", phase: "use", label: ["Partially depreciated", "مُهلك جزئيًا"] },
  { status: "Fully Depreciated", phase: "use", label: ["Fully depreciated", "مُهلك بالكامل"] },
  { status: "In Maintenance", phase: "care", label: ["In maintenance", "قيد الصيانة"] },
  { status: "Out of Order", phase: "care", label: ["Out of order", "معطّل"] },
  { status: "Capitalized", phase: "retire", label: ["Capitalized", "مُرسمل"] },
  { status: "Sold", phase: "retire", label: ["Sold", "مُباع"] },
  { status: "Scrapped", phase: "retire", label: ["Scrapped", "مُخرَّد"] },
];
export interface Stage { status: string; phase: Phase; label: Bi; count: number; book: number | undefined; drill: Drill }
export interface Scope { company: string; asof: string; book?: string | undefined }

const registerDrill = (sc: Scope, status: string): Drill => ({ kind: "pro", to: "/pro/asset-register", search: { company: sc.company, status, asof: sc.asof, book: sc.book || undefined } });

export function lifecycleStages(w: Workspace, sc: Scope): Stage[] {
  const by = new Map<string, Doc[]>();
  for (const a of w.all) { const st = s(a["status"] || "Draft"); by.set(st, [...(by.get(st) ?? []), a]); }
  const known = new Set(LIFECYCLE.map((x) => x.status));
  const defs = [...LIFECYCLE, ...[...by.keys()].filter((k) => !known.has(k)).sort().map((status) => ({ status, phase: "use" as Phase, label: [status, status] as Bi }))];
  return defs.map((d) => {
    const xs = by.get(d.status) ?? [];
    const book = xs.some((a) => w.financial(a).book === undefined) ? undefined : r2(xs.reduce((t, a) => t + (w.financial(a).book ?? 0), 0));
    return { ...d, count: xs.length, book, drill: registerDrill(sc, d.status) };
  });
}

export type DepState = "due" | "reference" | "upcoming" | "verified";
export interface DepRow {
  key: string; asset: string; assetName: string; category: string; location: string; custodian: string; schedule: string; book: string;
  date: string; amount: number; je: string; marker: boolean; state: DepState; severity: Severity; nbv: number | undefined; next: Bi;
}
export interface DepMonth { month: string; from: string; to: string; scheduled: number; verified: number; reference: number; unbooked: number; drill: Drill }
export interface DepLifecycle { status: SourceStatus; verifiable: SourceStatus; rows: DepRow[]; queue: DepRow[]; months: DepMonth[]; totals: Record<DepState, number> }

const NEXT: Record<DepState, Bi> = {
  due: ["Book on the DIGIT server (scheduled depreciation job or the Asset's depreciation entry)", "يُقيَّد على خادم DIGIT (مهمة الإهلاك المجدولة أو قيد الإهلاك من الأصل)"],
  reference: ["Check that the journal entry exists, is submitted and posted", "تحقق من وجود قيد اليومية واعتماده وترحيله"],
  upcoming: ["No action before the scheduled date", "لا إجراء قبل تاريخ الجدولة"],
  verified: ["Posted — open the journal entry", "مُرحّل — افتح قيد اليومية"],
};

/** Months: the 6 ending at the as-of month plus the next 3. Queue: due (oldest first), rows scheduled within `horizon`
 * days after the as-of date, then journal references whose posting cannot be verified. */
export function depreciationLifecycle(w: Workspace, sc: Scope, user = currentUser(), horizon = 90): DepLifecycle {
  const empty = { due: 0, reference: 0, upcoming: 0, verified: 0 };
  const st = w.states["Asset Depreciation Schedule"] ?? "unavailable";
  const jeSt = sourceStatus("Journal Entry", user), glSt = sourceStatus("GL Entry", user);
  const verifiable: SourceStatus = jeSt !== "ok" ? jeSt : glSt;
  const [y, m] = sc.asof.split("-").map(Number) as [number, number];
  const months = Array.from({ length: 9 }, (_, i) => new Date(Date.UTC(y, m - 6 + i, 1)).toISOString().slice(0, 7));
  const mk = (month: string): DepMonth => ({ month, from: `${month}-01`, to: monthEnd(month), scheduled: 0, verified: 0, reference: 0, unbooked: 0,
    drill: { kind: "pro", to: "/pro/depreciation", search: { company: sc.company, from: `${month}-01`, to: monthEnd(month), book: sc.book || undefined } } });
  if (st !== "ok") return { status: st, verifiable, rows: [], queue: [], months: months.map(mk), totals: empty };
  const isPosted = postedJournalCheck(user);
  const until = addDays(sc.asof, horizon);
  const rows: DepRow[] = w.dep.filter((r) => r.asset).map((r) => {
    const a = r.asset!;
    // "preview" is the Core's booked-without-journal marker (src/lib/assets.ts posted()): a reference that can never be verified.
    const marker = r.je === "preview"; const je = marker ? "" : r.je;
    const state: DepState = r.je ? (isPosted(r.je) ? "verified" : "reference") : r.date <= sc.asof ? "due" : "upcoming";
    const age = state === "due" ? Math.round((Date.parse(`${sc.asof}T00:00:00Z`) - Date.parse(`${r.date}T00:00:00Z`)) / 864e5) : 0;
    return { key: `${r.schedule}:${r.date}:${r.amount}`, asset: a.name, assetName: s(a["asset_name"]) || a.name, category: s(a["asset_category"]), location: s(a["location"]), custodian: s(a["custodian"]),
      schedule: r.schedule, book: r.book, date: r.date, amount: r2(r.amount), je, marker, state,
      severity: state === "due" ? (age > 30 ? "high" : "medium") : state === "reference" ? "medium" : "low", nbv: w.financial(a).book, next: NEXT[state] };
  });
  const byMonth = new Map(months.map((mo) => [mo, mk(mo)]));
  const totals = { ...empty };
  for (const r of rows) {
    const b = byMonth.get(r.date.slice(0, 7));
    if (b) { b.scheduled = r2(b.scheduled + r.amount); if (r.state === "verified") b.verified = r2(b.verified + r.amount); else if (r.state === "reference") b.reference = r2(b.reference + r.amount); else b.unbooked = r2(b.unbooked + r.amount); }
    if (r.state !== "upcoming" || r.date <= until) totals[r.state] = r2(totals[r.state] + r.amount);
  }
  const rank: Record<DepState, number> = { due: 0, upcoming: 1, reference: 2, verified: 3 };
  const queue = rows.filter((r) => r.state === "due" || r.state === "reference" || (r.state === "upcoming" && r.date <= until))
    .sort((a, b) => rank[a.state] - rank[b.state] || a.date.localeCompare(b.date) || a.asset.localeCompare(b.asset));
  return { status: st, verifiable, rows, queue, months: [...byMonth.values()], totals };
}
