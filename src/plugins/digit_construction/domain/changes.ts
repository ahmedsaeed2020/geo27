/**
 * Read models for RFIs and change events (FT-02-06, FT-VAR-CE, FT-04-06). Computed from records at read time; every
 * figure returns the exact rows it sums, so a card and its drill list always show the same number.
 *
 * Exposure rule (D-R12-CE-01 / D-R14-0406-02, applied as default): a change event is EXPOSURE until its lines sit in an
 * APPROVED client variation; then the amount is contract value (already in the contract position) and leaves exposure.
 * Exposure never posts and never revises the budget. Rejected / closed / cancelled events are excluded.
 */
import type { Doc } from "@/lib/adapter";
import { adapter } from "@/lib/adapter";
import { num, r2, sumBy } from "./calc";
import { list, rows, today } from "./data";

const live = (d: Doc) => num(d.docstatus) !== 2;
const days = (a: string, b: string) => Math.round((Date.parse(a) - Date.parse(b)) / 86400000);
type Scope = { project?: string | undefined; projects?: Set<string> | undefined };
const inScope = (s: Scope) => (d: Doc) => (!s.project || d["project"] === s.project) && (!s.projects || s.projects.has(String(d["project"])));

// ---------------------------------------------------------------- RFI
export const RFI_OPEN = ["Open", "Answered"] as const;
export interface RfiAging { open: Doc[]; overdue: Doc[]; buckets: { key: string; en: string; ar: string; docs: Doc[] }[] }
/** Open = Open or Answered (not closed). Overdue = state Open and due date before `on` (answered RFIs wait for closure, not for a reply). Aging buckets count days since sent. */
export function rfiAging(s: Scope = {}, on = today()): RfiAging {
  const open = list("Digit RFI", (r) => RFI_OPEN.includes(String(r["workflow_state"]) as never) && inScope(s)(r));
  const overdue = open.filter((r) => r["workflow_state"] === "Open" && !!r["due_date"] && String(r["due_date"]) < on);
  const age = (r: Doc) => (r["sent_on"] ? days(on, String(r["sent_on"])) : 0);
  const B: [string, string, string, number, number][] = [["0-7", "0–7 days", "0–7 أيام", 0, 7], ["8-14", "8–14 days", "8–14 يوماً", 8, 14], ["15-30", "15–30 days", "15–30 يوماً", 15, 30], ["30+", "Over 30 days", "أكثر من 30 يوماً", 31, Infinity]];
  return { open, overdue, buckets: B.map(([key, en, ar, lo, hi]) => ({ key, en, ar, docs: open.filter((r) => age(r) >= lo && age(r) <= hi) })) };
}

// ---------------------------------------------------------------- change exposure
export type Stage = "Potential" | "Priced" | "Under Review" | "Approved – not transferred" | "In pending variation";
export const STAGE_AR: Record<Stage, string> = { Potential: "محتمل", Priced: "مُسعّر", "Under Review": "قيد المراجعة", "Approved – not transferred": "معتمد ولم يُحوّل", "In pending variation": "في أمر تغييري قيد الاعتماد" };
export interface ExposureRow { event: string; title: string; project: string; contract: string; stage: Stage; reason: string; scope: string; line_key: string; description: string; cost: number; revenue: number; variation: string }
/** Stage of one event line, or null when the line is no longer exposure (approved variation) or the event is out (rejected / closed / cancelled). */
function stageOf(ev: Doc, line: Record<string, unknown>): Stage | null {
  const st = String(ev["workflow_state"]);
  if (!live(ev) || st === "Rejected" || st === "Closed") return null;
  if (st === "Draft") return "Potential";
  if (st === "Priced") return "Priced";
  if (st === "Under Review") return "Under Review";
  const v = line["variation_line_key"] && ev["variation"] ? adapter.get("Digit Client Variation", String(ev["variation"])) : undefined;
  if (!v || !live(v) || v["workflow_state"] === "Rejected") return "Approved – not transferred";
  return v["workflow_state"] === "Approved" ? null : "In pending variation";
}
/** F04-05-1 event-grain stage: Potential (Draft) → Priced → Under Review → Approved – not transferred → In pending variation → Approved variation; rejected / closed / cancelled = Closed. */
export type EventStage = Stage | "Approved variation" | "Closed";
export const EVENT_STAGES: EventStage[] = ["Potential", "Priced", "Under Review", "Approved – not transferred", "In pending variation", "Approved variation", "Closed"];
export const EVENT_STAGE_AR: Record<EventStage, string> = { ...STAGE_AR, "Approved variation": "أمر تغييري معتمد", Closed: "مغلق" };
export function eventStage(ev: Doc): EventStage {
  const st = String(ev["workflow_state"] || "Draft");
  if (!live(ev) || ["Rejected", "Closed", "Cancelled"].includes(st)) return "Closed";
  if (st === "Draft") return "Potential";
  if (st === "Priced") return "Priced";
  if (st === "Under Review" || st === "Pricing Requested") return "Under Review";
  const vn = ev["variation"] || ev["associated_variation"]; const v = vn ? adapter.get("Digit Client Variation", String(vn)) : undefined;
  if (!v || !live(v) || v["workflow_state"] === "Rejected") return "Approved – not transferred";
  return v["workflow_state"] === "Approved" ? "Approved variation" : "In pending variation";
}
/** Line-grain exposure rows (the drill of every exposure card). */
export function exposureRows(s: Scope = {}): ExposureRow[] {
  const out: ExposureRow[] = [];
  for (const ev of list("Digit Change Event", inScope(s))) for (const l of rows(ev, "lines")) {
    const stage = stageOf(ev, l); if (!stage) continue;
    out.push({ event: ev.name, title: String(ev["title"] ?? ""), project: String(ev["project"] ?? ""), contract: String(ev["contract"] ?? ""), stage, reason: String(ev["change_reason"] ?? ""), scope: String(ev["scope"] ?? ""),
      line_key: String(l["line_key"] ?? ""), description: String(l["description"] ?? ""), cost: num(l["cost_amount"]), revenue: num(l["revenue_amount"]), variation: String(ev["variation"] ?? "") });
  }
  return out;
}
export interface Exposure { rows: ExposureRow[]; cost: number; revenue: number; byStage: { stage: Stage; ar: string; rows: ExposureRow[]; cost: number; revenue: number }[]; byReason: { reason: string; rows: ExposureRow[]; revenue: number }[] }
/** Totals and breakdowns; each group carries its rows, and the groups sum exactly to the totals. */
export function changeExposure(s: Scope = {}): Exposure {
  const rs = exposureRows(s);
  const stages: Stage[] = ["Potential", "Priced", "Under Review", "Approved – not transferred", "In pending variation"];
  const reasons = [...new Set(rs.map((r) => r.reason))];
  return { rows: rs, cost: r2(sumBy(rs, (r) => r.cost)), revenue: r2(sumBy(rs, (r) => r.revenue)),
    byStage: stages.map((stage) => { const g = rs.filter((r) => r.stage === stage); return { stage, ar: STAGE_AR[stage], rows: g, cost: r2(sumBy(g, (r) => r.cost)), revenue: r2(sumBy(g, (r) => r.revenue)) }; }),
    byReason: reasons.map((reason) => { const g = rs.filter((r) => r.reason === reason); return { reason, rows: g, revenue: r2(sumBy(g, (r) => r.revenue)) }; }) };
}
/** Lineage of a client variation back to its source: RFI → change event → variation (FT-VAR-CE relation graph). */
export function changeLineage(variation: string): { rfi?: Doc | undefined; event?: Doc | undefined; variation?: Doc | undefined } {
  const v = adapter.get("Digit Client Variation", variation);
  const ev = v?.["change_event"] ? adapter.get("Digit Change Event", String(v["change_event"])) : undefined;
  const rfi = ev?.["rfi"] ? adapter.get("Digit RFI", String(ev["rfi"])) : undefined;
  return { rfi, event: ev, variation: v };
}
