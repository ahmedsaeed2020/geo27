/**
 * Pure business rules of DIGIT FSM + ITM (kit 14 W01–W10, kit 06 K-grain rules). No adapter access, so tests, services,
 * reports and every screen share one definition.
 */
export type Row = Record<string, unknown>;
export const s = (v: unknown) => (v === undefined || v === null ? "" : String(v));
export const today = () => new Date().toISOString().slice(0, 10);
export const nowIso = () => new Date().toISOString().slice(0, 19).replace("T", " ");

const STEP: Record<string, number> = { Monthly: 1, Quarterly: 3, "Semi-Annual": 6, Annual: 12 };
export function addMonths(iso: string, n: number): string {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number) as [number, number, number];
  const t = new Date(Date.UTC(y, m - 1 + n, 1));
  const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate();
  t.setUTCDate(Math.min(d, last));
  return t.toISOString().slice(0, 10);
}
export function addDays(iso: string, n: number): string { const t = new Date(`${iso.slice(0, 10)}T00:00:00Z`); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); }
export const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b.slice(0, 10)}T00:00:00Z`) - Date.parse(`${a.slice(0, 10)}T00:00:00Z`)) / 86400000);
/** Hours between two "YYYY-MM-DD HH:MM[:SS]" / ISO datetimes (0 when either is missing or the interval is negative). */
export function hoursBetween(a: unknown, b: unknown): number {
  const pa = Date.parse(s(a).replace(" ", "T")), pb = Date.parse(s(b).replace(" ", "T"));
  return Number.isFinite(pa) && Number.isFinite(pb) && pb > pa ? (pb - pa) / 3600000 : 0;
}

/** Due dates of one coverage line inside [start, min(end, start+horizon)] — first due = start + one period. */
export function dueDates(start: string, end: string, frequency: string, horizonMonths = 12): string[] {
  const step = STEP[frequency]; if (!step || !start || !end) return [];
  const limit = [end, addMonths(start, horizonMonths)].sort()[0]!;
  const out: string[] = [];
  for (let k = 1; k < 200; k++) { const d = addMonths(start, step * k); if (d > limit) break; out.push(d); }
  return out;
}
export const obligationKey = (agreement: string, row: string, due: string) => `${agreement}|${row}|${due}`;

/**
 * Technical result of a run, derived only from result rows: any Fail → Fail; any Untested/Inaccessible → Incomplete;
 * Pass only when every applicable row passed. Not Applicable rows are excluded; a run without applicable rows is
 * Incomplete. Form completion never implies Pass/compliant.
 */
export function technicalResult(results: Row[]): "Pending" | "Pass" | "Fail" | "Incomplete" {
  if (!results.length) return "Pending";
  const o = results.map((r) => s(r["outcome"]) || "Untested");
  if (o.includes("Fail")) return "Fail";
  const applicable = o.filter((x) => x !== "Not Applicable");
  if (!applicable.length) return "Incomplete";
  if (applicable.some((x) => x === "Untested" || x === "Inaccessible")) return "Incomplete";
  return "Pass";
}
/** Measurement outside [min, max] is a failed check. */
export function measurementFails(v: unknown, min: unknown, max: unknown): boolean {
  if (v === "" || v === undefined || v === null) return false;
  const n = Number(v); if (!Number.isFinite(n)) return false;
  return (min !== undefined && min !== null && min !== "" && n < Number(min)) || (max !== undefined && max !== null && max !== "" && n > Number(max));
}
export const deficiencyKey = (run: string, check: string, device: string) => `${run}|${check}|${device}`;

/**
 * Coverage of one run (K05–K10, RP03). Device grain and check grain are never mixed:
 *   expected      = distinct devices frozen in the run snapshot (expected_devices; falls back to distinct result devices)
 *   inspected     = distinct devices whose every applicable device check has a technical outcome (Pass/Fail)
 *   failedDevices = distinct devices with at least one Fail
 *   inaccessible  = distinct devices with at least one Inaccessible outcome (access ≠ untested ≠ not applicable)
 *   untestedChecks= result rows (checks) still Untested
 */
export interface Coverage { expected: number; inspected: number; failedDevices: number; inaccessibleDevices: number; untestedChecks: number; naChecks: number; checks: number; passChecks: number; failChecks: number; coverage: number | null }
export function runCoverage(results: Row[], expectedDevices?: number): Coverage {
  const byDev = new Map<string, string[]>();
  let untested = 0, na = 0, pass = 0, fail = 0;
  for (const r of results) {
    const o = s(r["outcome"]) || "Untested";
    if (o === "Untested") untested++; if (o === "Not Applicable") na++; if (o === "Pass") pass++; if (o === "Fail") fail++;
    const d = s(r["device"]); if (!d) continue;
    const l = byDev.get(d) ?? []; l.push(o); byDev.set(d, l);
  }
  const expected = expectedDevices && expectedDevices > 0 ? expectedDevices : byDev.size;
  let inspected = 0, failed = 0, inacc = 0;
  for (const o of byDev.values()) {
    const app = o.filter((x) => x !== "Not Applicable");
    if (app.length && app.every((x) => x === "Pass" || x === "Fail")) inspected++;
    if (o.includes("Fail")) failed++;
    if (o.includes("Inaccessible")) inacc++;
  }
  return { expected, inspected, failedDevices: failed, inaccessibleDevices: inacc, untestedChecks: untested, naChecks: na, checks: results.length, passChecks: pass, failChecks: fail, coverage: expected ? inspected / expected : null };
}

export interface Span { start: string; end: string; name?: string | undefined }
/** Booking overlap for one technician (half-open intervals). */
export function overlaps(a: Span, b: Span) { return a.start < b.end && b.start < a.end; }
export function conflicts(candidate: Span, others: Span[]): Span[] { return others.filter((o) => o.name !== candidate.name && overlaps(candidate, o)); }

/** Technician eligibility for a system type at a date: active, holding the skill, certificate valid on that date. */
export function eligibility(tech: Row | undefined, skill: string, onDate: string): { ok: boolean; reason?: string; reason_ar?: string } {
  if (!tech) return { ok: false, reason: "Technician not found", reason_ar: "الفني غير موجود" };
  if (s(tech["status"]) === "Inactive") return { ok: false, reason: "Technician is inactive", reason_ar: "الفني غير نشط" };
  if (!skill) return { ok: true };
  const rows = ((tech["skills"] as Row[] | undefined) ?? []).filter((r) => s(r["skill"]) === skill);
  if (!rows.length) return { ok: false, reason: `No ${skill} skill`, reason_ar: `لا يملك مهارة ${skill}` };
  const valid = rows.some((r) => !s(r["valid_until"]) || s(r["valid_until"]) >= onDate.slice(0, 10));
  return valid ? { ok: true } : { ok: false, reason: `${skill} certification expired`, reason_ar: `انتهت شهادة ${skill}` };
}

/** Obligation is missed when its window ended before as-of and it was not fulfilled or waived. */
export function isMissed(o: Row, asOf = today()): boolean {
  const st = s(o["status"]);
  if (st === "Fulfilled" || st === "Waived") return false;
  const end = s(o["window_end"]) || s(o["due_date"]);
  return !!end && end < asOf;
}
/** Obligation fulfilled inside its window (K04 numerator). */
export function onTime(o: Row): boolean {
  return s(o["status"]) === "Fulfilled" && !!s(o["fulfilled_on"]) && s(o["fulfilled_on"]).slice(0, 10) <= (s(o["window_end"]) || s(o["due_date"]));
}
export function agingBucket(days: number): string { return days <= 7 ? "0–7" : days <= 30 ? "8–30" : days <= 90 ? "31–90" : ">90"; }
export const AGING_BUCKETS = ["0–7", "8–30", "31–90", ">90"];
export const OPEN_DEFICIENCY = new Set(["Open", "Quoted", "Approved for Repair", "Retest Pending", "Disputed"]);
/** Window intersection of an obligation with a period (K01 cohort). */
export function inPeriod(o: Row, from: string, to: string): boolean {
  const a = s(o["due_date"]), b = s(o["window_end"]) || a;
  return (!from || b >= from) && (!to || a <= to);
}
