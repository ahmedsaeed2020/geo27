/**
 * Dept 08 P1 resources (Blueprint 08, R19 evidence) — read models; nothing here posts to the ledger.
 *
 * - bookingOverlaps / bookedOn / unbookedUsage: FT-08-06 equipment assignment, double booking (Q-10), use without a booking
 * - rateFor / slidingCharge / equipmentChargeOut: FT-08-10 CMiC charge-out — Amount = Qty × Rate, the cheapest mix of
 *   daily / weekly / monthly rates for the booked days (sliding scale); hours × hourly rate where nothing is booked
 * - fieldProduction:  FT-08-04 Procore Field Production — earned, remaining and projected hours per task
 * - laborCost / laborSplit: FT-08-03/08-14 approved hours × classification planning rate (estimate) beside subcontract bills (actual)
 */
import { adapter, type Doc } from "@/lib/adapter";
import { num, r2, sumBy } from "./calc";
import { list, rows, today } from "./data";
import { laborProductivity } from "./control";
import { constructionProjects } from "./queues";

type Row = Record<string, unknown>;
export const WORKDAY_HOURS = 8; // Q-13 default (Fieldwire: 1 man-day = 8 hours)
const projectsIn = (project?: string) => new Set(project ? [project] : constructionProjects().map((p) => p.name));
const all = (dt: string) => adapter.list(dt).filter((d) => !d["__synthetic"]);
const END = "9999-12-31";
const dayN = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000) + 1;

// ---------------------------------------------------------------- FT-08-06 bookings
const live = (a: Doc) => a["status"] !== "Released";
const toOf = (a: Doc) => String(a["to_date"] || END);
/** Other live bookings of the same machine whose period overlaps [from, to]. */
export function bookingOverlaps(a: Doc): Doc[] {
  const f = String(a["from_date"] ?? ""), t = toOf(a);
  return all("Digit Equipment Assignment").filter((x) => x.name !== a.name && x["machinery"] === a["machinery"] && live(x) && String(x["from_date"]) <= t && toOf(x) >= f);
}
export function bookedOn(machinery: string, project: string, date: string): Doc | undefined {
  return all("Digit Equipment Assignment").find((x) => x["machinery"] === machinery && x["project"] === project && live(x) && String(x["from_date"]) <= date && toOf(x) >= date);
}
/** Submitted usage records on a day the machine had no booking on that project. */
export function unbookedUsage(project?: string): Doc[] {
  const ps = projectsIn(project);
  return list("Digit Machinery Usage", (u) => num(u.docstatus) === 1 && ps.has(String(u["project"])) && !bookedOn(String(u["machinery"]), String(u["project"]), String(u["usage_date"])));
}
export interface Availability { machinery: string; name: string; type: string; status: string; booking?: Doc | undefined; next?: Doc | undefined }
/** Each machine with its booking covering `on` (if any) and its next future booking. */
export function equipmentAvailability(on = today()): Availability[] {
  const bs = all("Digit Equipment Assignment").filter(live);
  return all("Digit Machinery").map((m) => ({
    machinery: m.name, name: String(m["machine_name"] ?? m.name), type: String(m["machine_type"] ?? ""), status: String(m["status"] ?? ""),
    booking: bs.find((b) => b["machinery"] === m.name && String(b["from_date"]) <= on && toOf(b) >= on),
    next: bs.filter((b) => b["machinery"] === m.name && String(b["from_date"]) > on).sort((a, b) => String(a["from_date"]).localeCompare(String(b["from_date"])))[0],
  })).sort((a, b) => a.name.localeCompare(b.name));
}

// ---------------------------------------------------------------- FT-08-10 charge-out
/** Most specific valid rate: project + machine, project + type, machine, type (CMiC priority, simplified). */
export function rateFor(machinery: string, project: string, on = today()): Doc | undefined {
  const m = adapter.get("Digit Machinery", machinery); const type = String(m?.["machine_type"] ?? "");
  const ok = all("Digit Equipment Rate").filter((r) => !r["valid_from"] || String(r["valid_from"]) <= on);
  const pick = (f: (r: Doc) => boolean) => ok.filter(f).sort((a, b) => String(b["valid_from"] ?? "").localeCompare(String(a["valid_from"] ?? "")))[0];
  return pick((r) => r["project"] === project && r["machinery"] === machinery) ?? pick((r) => r["project"] === project && !r["machinery"] && r["machine_type"] === type)
    ?? pick((r) => !r["project"] && r["machinery"] === machinery) ?? pick((r) => !r["project"] && !r["machinery"] && r["machine_type"] === type);
}
/** Cheapest cover of `days` with daily / weekly (7) / monthly (30) rates; a longer period may cover the tail when cheaper. */
export function slidingCharge(days: number, rate: Row): { amount: number; months: number; weeks: number; dayUnits: number } | null {
  const d = num(rate["daily_rate"]) || null, w = num(rate["weekly_rate"]) || null, mo = num(rate["monthly_rate"]) || null;
  if (!d && !w && !mo) return null;
  const best: { c: number; m: number; w: number; d: number }[] = [{ c: 0, m: 0, w: 0, d: 0 }];
  for (let n = 1; n <= days; n++) {
    const opts: { c: number; m: number; w: number; d: number }[] = [];
    const prev = (k: number) => best.at(Math.max(0, n - k))!;
    if (d) { const p = prev(1); opts.push({ c: p.c + d, m: p.m, w: p.w, d: p.d + 1 }); }
    if (w) { const p = prev(7); opts.push({ c: p.c + w, m: p.m, w: p.w + 1, d: p.d }); }
    if (mo) { const p = prev(30); opts.push({ c: p.c + mo, m: p.m + 1, w: p.w, d: p.d }); }
    best.push(opts.reduce((a, b) => (b.c < a.c - 1e-9 ? b : a)));
  }
  const r = best.at(days)!; return { amount: r2(r.c), months: r.m, weeks: r.w, dayUnits: r.d };
}
export interface ChargeLine { machinery: string; name: string; project: string; basis: "Booked days" | "Usage hours" | "No rate"; qty: number; amount: number; detail: string; rate?: string | undefined }
/** Indicative charge-out per machine and project for [from, to]. Booked days use the sliding scale; unbooked usage uses hourly. Never posted (Q-11). */
export function equipmentChargeOut(project: string | undefined, from: string, to: string): ChargeLine[] {
  const ps = projectsIn(project); const out: ChargeLine[] = [];
  const nameOf = (m: string) => String(adapter.get("Digit Machinery", m)?.["machine_name"] ?? m);
  const byKey = new Map<string, number>();
  for (const b of all("Digit Equipment Assignment").filter((x) => live(x) && ps.has(String(x["project"])))) {
    const f = String(b["from_date"]) > from ? String(b["from_date"]) : from, t = toOf(b) < to ? toOf(b) : to; if (f > t) continue;
    const k = `${String(b["machinery"])}|${String(b["project"])}`; byKey.set(k, (byKey.get(k) ?? 0) + dayN(f, t));
  }
  for (const [k, days] of byKey) {
    const [m, p] = k.split("|") as [string, string]; const rt = rateFor(m, p, to); const c = rt ? slidingCharge(days, rt) : null;
    out.push(c ? { machinery: m, name: nameOf(m), project: p, basis: "Booked days", qty: days, amount: c.amount, detail: `${c.months}M ${c.weeks}W ${c.dayUnits}D`, rate: rt?.name }
      : { machinery: m, name: nameOf(m), project: p, basis: "No rate", qty: days, amount: 0, detail: "", rate: rt?.name });
  }
  const hours = new Map<string, number>();
  for (const u of unbookedUsage(project).filter((x) => String(x["usage_date"]) >= from && String(x["usage_date"]) <= to)) { const k = `${String(u["machinery"])}|${String(u["project"])}`; hours.set(k, r2((hours.get(k) ?? 0) + num(u["hours"]))); }
  for (const [k, h] of hours) {
    const [m, p] = k.split("|") as [string, string]; const rt = rateFor(m, p, to);
    const hr = num(rt?.["hourly_rate"]) || num(adapter.get("Digit Machinery", m)?.["hourly_rate"]);
    out.push({ machinery: m, name: nameOf(m), project: p, basis: hr ? "Usage hours" : "No rate", qty: h, amount: r2(h * hr), detail: hr ? `${h} h × ${hr}` : "", rate: rt?.name });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

// ---------------------------------------------------------------- FT-08-04 field production
export interface FieldProduction { project: string; task: string; uom: string; budgetQty: number | null; budgetHours: number | null; actualQty: number; actualHours: number; remainingHours: number | null; earnedHours: number | null; projectedHours: number | null; performance: number | null }
/** Budget applies only to the output in the task's budget unit. Procore formulas: Remaining = Budget h − Actual h; Earned = Budget h × Actual qty ÷ Budget qty; Projected = Remaining qty ÷ (Actual qty ÷ Actual h) + Actual h. */
export function fieldProduction(project?: string): FieldProduction[] {
  return laborProductivity(project).map((p) => {
    const tk = adapter.get("Task", p.task); const t = tk && (!tk["digit_budget_uom"] || tk["digit_budget_uom"] === p.uom) ? tk : undefined; const bq = t?.["digit_budget_qty"] ? num(t["digit_budget_qty"]) : null, bh = t?.["digit_budget_hours"] ? num(t["digit_budget_hours"]) : null;
    const earned = bq && bh !== null ? r2((bh * p.output) / bq) : null;
    const projected = bq !== null && p.output > 0 && p.manHours > 0 ? r2(Math.max(0, bq - p.output) / (p.output / p.manHours) + p.manHours) : null;
    return { project: p.project, task: p.task, uom: p.uom, budgetQty: bq, budgetHours: bh, actualQty: p.output, actualHours: p.manHours, remainingHours: bh === null ? null : r2(bh - p.manHours), earnedHours: earned, projectedHours: projected, performance: earned !== null && p.manHours ? r2(earned / p.manHours) : null };
  });
}

// ---------------------------------------------------------------- FT-08-03 / 08-14 labour cost and split
export interface LaborLine { project: string; attendance: string; date: string; employee: string; classification: string; cost_code: string; hours: number; overtime: number; rate: number | null; amount: number | null }
/** Approved attendance rows (docstatus 1) priced at the classification planning rate; overtime × rate × factor. Unpriced rows keep amount null. */
export function laborCost(project?: string): LaborLine[] {
  const ps = projectsIn(project); const out: LaborLine[] = [];
  for (const a of list("Digit Field Attendance", (x) => num(x.docstatus) === 1 && ps.has(String(x["project"])))) for (const e of rows(a, "employees")) {
    if (!["Present", "Half Day"].includes(String(e["attendance"]))) continue;
    const cl = String(e["classification"] ?? ""); const lr = cl ? adapter.get("Digit Labor Rate", cl) : undefined;
    const rate = lr ? num(lr["hourly_rate"]) : null, f = lr?.["overtime_factor"] === undefined || lr?.["overtime_factor"] === "" ? 1.5 : num(lr["overtime_factor"]);
    const h = num(e["hours"]), ot = num(e["overtime_hours"]);
    out.push({ project: String(a["project"]), attendance: a.name, date: String(a["attendance_date"] ?? ""), employee: String(e["employee"] ?? ""), classification: cl, cost_code: String(e["cost_code"] ?? ""), hours: h, overtime: ot, rate, amount: rate === null ? null : r2(h * rate + ot * rate * f) });
  }
  return out;
}
export interface LaborSplit { project: string; directHours: number; directEstimate: number; unpricedHours: number; subcontractBilled: number; bills: Doc[] }
/** Direct labour (estimate from approved hours) beside subcontract bills (actual gross of approved / invoiced bills). Never added together. */
export function laborSplit(project?: string): LaborSplit[] {
  const ls = laborCost(project);
  return [...projectsIn(project)].map((p) => {
    const mine = ls.filter((l) => l.project === p);
    const bills = list("Digit Subcontractor Bill", (b) => b["project"] === p && num(b.docstatus) === 1);
    return { project: p, directHours: r2(sumBy(mine, (l) => l.hours + l.overtime)), directEstimate: r2(sumBy(mine, (l) => l.amount ?? 0)), unpricedHours: r2(sumBy(mine.filter((l) => l.amount === null), (l) => l.hours + l.overtime)), subcontractBilled: r2(sumBy(bills, (b) => num(b["gross_amount"]))), bills };
  }).filter((x) => x.directHours || x.subcontractBilled);
}
