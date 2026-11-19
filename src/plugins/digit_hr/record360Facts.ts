/**
 * Pure facts for the Position, Contract and Case 360 pages. Every function takes rows the caller already read through
 * permission-scoped reads (scopedGet/scopedList) and only derives display facts: nothing here writes, posts or decides
 * pay, budget, statutory or contract outcomes. Dates are ISO strings; `today` is passed in so results are deterministic.
 */
type Row = Record<string, unknown> & { name: string };

const str = (v: unknown) => (v == null ? "" : String(v));
const dayOf = (v: unknown) => str(v).slice(0, 10);
const DAY = 86_400_000;

/** Whole days from `today` to `date` (negative = past). Null when either date is missing or invalid. */
export function daysUntil(date: unknown, today: string): number | null {
  const a = Date.parse(`${dayOf(date)}T00:00:00Z`), b = Date.parse(`${dayOf(today)}T00:00:00Z`);
  if (!dayOf(date) || Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.round((a - b) / DAY);
}

/* ---------------- Position ---------------- */

/** Walk reports_to upwards from a position. Stops at a missing/unreadable parent or a cycle (returns cycle=true). */
export function reportingChain(start: Row, get: (name: string) => Row | null | undefined, limit = 12): { chain: Row[]; cycle: boolean; brokenAt: string | null } {
  const chain: Row[] = []; const seen = new Set([start.name]);
  let next = str(start["reports_to"]);
  while (next && chain.length < limit) {
    if (seen.has(next)) return { chain, cycle: true, brokenAt: null };
    const row = get(next);
    if (!row) return { chain, cycle: false, brokenAt: next };
    chain.push(row); seen.add(next); next = str(row["reports_to"]);
  }
  return { chain, cycle: false, brokenAt: null };
}

/** Assignment periods for one position, newest first; the open-ended row (no to_date) is the current holder. */
export function assignmentTimeline(rows: Row[], position: string): Array<Row & { current: boolean }> {
  return rows.filter((r) => str(r["position"]) === position)
    .map((r): Row & { current: boolean } => ({ ...r, current: !dayOf(r["to_date"]) }))
    .sort((a, b) => dayOf(b["from_date"]).localeCompare(dayOf(a["from_date"])) || a.name.localeCompare(b.name));
}

export type PositionFinding = { code: "vacant_no_successor" | "filled_without_incumbent" | "incumbent_mismatch" | "history_holder_mismatch" | "no_budget_period"; detail?: string };

/**
 * Data-consistency findings a reviewer should look at. Only compares stored values; never infers who should hold the seat.
 * `incumbentRow` is null when the incumbent link is unreadable/missing; undefined when no incumbent is set.
 */
export function positionFindings(input: {
  position: Row; incumbentRow: Row | null | undefined; successors: Row[]; history: Array<Row & { current: boolean }>; budgetCovering: Row | null;
}): PositionFinding[] {
  const { position: p, incumbentRow, successors, history, budgetCovering } = input;
  const out: PositionFinding[] = [];
  const status = str(p["position_status"]); const incumbent = str(p["incumbent"]);
  if (status === "Vacant" && successors.length === 0) out.push({ code: "vacant_no_successor" });
  if (status === "Filled" && !incumbent) out.push({ code: "filled_without_incumbent" });
  if (incumbent && incumbentRow) {
    const dept = str(incumbentRow["department"]), des = str(incumbentRow["designation"]);
    if ((p["department"] && dept && dept !== str(p["department"])) || (p["designation"] && des && des !== str(p["designation"]))) out.push({ code: "incumbent_mismatch", detail: [dept, des].filter(Boolean).join(" · ") });
  }
  const current = history.find((h) => h.current);
  if (incumbent && current && str(current["employee"]) !== incumbent) out.push({ code: "history_holder_mismatch", detail: str(current["employee"]) });
  if (!budgetCovering && p["department"]) out.push({ code: "no_budget_period" });
  return out;
}

/** The submitted/approved position budget whose period covers `today` for the position's company and department. */
export function budgetCovering(budgets: Row[], position: Row, today: string): Row | null {
  return budgets.filter((b) => str(b["company"]) === str(position["company"]) && str(b["department"]) === str(position["department"])
    && Number(b["docstatus"] ?? 0) !== 2 && dayOf(b["from_date"]) <= today && (!dayOf(b["to_date"]) || dayOf(b["to_date"]) >= today))
    .sort((a, b) => dayOf(b["from_date"]).localeCompare(dayOf(a["from_date"])))[0] ?? null;
}

/** Positions recorded against a department (for headcount context next to a budget). Counts stored statuses only. */
export function departmentSeats(positions: Row[], company: string, department: string): { total: number; filled: number; vacant: number; other: number } {
  const rows = positions.filter((p) => str(p["company"]) === company && str(p["department"]) === department);
  const filled = rows.filter((p) => str(p["position_status"]) === "Filled").length;
  const vacant = rows.filter((p) => str(p["position_status"]) === "Vacant").length;
  return { total: rows.length, filled, vacant, other: rows.length - filled - vacant };
}

/* ---------------- Contract ---------------- */

export type ContractTerm = { kind: "open_ended" | "ended" | "ending_soon" | "running" | "not_started" | "unknown"; days: number | null };

/** Term position of a contract relative to today. `soonDays` defaults to 90 (display banding only, not a legal notice rule). */
export function contractTerm(contract: Row, today: string, soonDays = 90): ContractTerm {
  const start = daysUntil(contract["start_date"], today);
  const end = daysUntil(contract["end_date"], today);
  if (start != null && start > 0) return { kind: "not_started", days: start };
  if (!dayOf(contract["end_date"])) return { kind: start == null ? "unknown" : "open_ended", days: null };
  if (end == null) return { kind: "unknown", days: null };
  if (end < 0) return { kind: "ended", days: end };
  return { kind: end <= soonDays ? "ending_soon" : "running", days: end };
}

/** Probation end = start_date + probation_days (stored values only). Null when either is missing. */
export function probationEnd(contract: Row): string | null {
  const days = Number(contract["probation_days"]);
  const start = Date.parse(`${dayOf(contract["start_date"])}T00:00:00Z`);
  if (!dayOf(contract["start_date"]) || !Number.isFinite(days) || days <= 0 || Number.isNaN(start)) return null;
  return new Date(start + days * DAY).toISOString().slice(0, 10);
}

export type ContractFinding = { code: "active_past_end" | "extension_not_on_contract" | "draft_amendment_open" | "overlapping_contract"; detail?: string };

/** Review findings. Amendments are reviews: a submitted extension is reported, never applied to the contract here. */
export function contractFindings(contract: Row, amendments: Row[], siblings: Row[], today: string): ContractFinding[] {
  const out: ContractFinding[] = [];
  const end = dayOf(contract["end_date"]);
  if (str(contract["contract_status"]) === "Active" && end && end < today) out.push({ code: "active_past_end", detail: end });
  const ext = amendments.filter((a) => Number(a["docstatus"]) === 1 && str(a["amendment_type"]) === "Extension" && dayOf(a["new_end_date"]) && dayOf(a["new_end_date"]) !== end)
    .sort((a, b) => dayOf(b["effective_date"]).localeCompare(dayOf(a["effective_date"])))[0];
  if (ext) out.push({ code: "extension_not_on_contract", detail: dayOf(ext["new_end_date"]) });
  const draft = amendments.find((a) => Number(a["docstatus"] ?? 0) === 0);
  if (draft) out.push({ code: "draft_amendment_open", detail: draft.name });
  const s = dayOf(contract["start_date"]), e = end || "9999-12-31";
  const overlap = siblings.find((o) => o.name !== contract.name && Number(o["docstatus"] ?? 0) !== 2 && str(o["employee"]) === str(contract["employee"])
    && !["Terminated"].includes(str(o["contract_status"])) && dayOf(o["start_date"]) <= e && (dayOf(o["end_date"]) || "9999-12-31") >= s);
  if (s && overlap) out.push({ code: "overlapping_contract", detail: overlap.name });
  return out;
}

/** Contract history for one employee, newest start first. */
export function employeeContracts(rows: Row[], employee: string): Row[] {
  return rows.filter((r) => str(r["employee"]) === employee).sort((a, b) => dayOf(b["start_date"]).localeCompare(dayOf(a["start_date"])) || a.name.localeCompare(b.name));
}

/* ---------------- Case ---------------- */

export type CaseClock = { kind: "closed" | "overdue" | "due_today" | "due_soon" | "on_track" | "no_due"; hours: number | null };

/** Service-level clock from stored due_at; `now` is an ISO datetime. Resolved/Closed cases stop the clock. */
export function caseClock(c: Row, now: string): CaseClock {
  if (["Resolved", "Closed"].includes(str(c["case_status"]))) return { kind: "closed", hours: null };
  const due = Date.parse(str(c["due_at"]).replace(" ", "T") + (str(c["due_at"]).length <= 10 ? "T23:59:59Z" : "Z"));
  const n = Date.parse(now.endsWith("Z") ? now : now.replace(" ", "T") + "Z");
  if (!c["due_at"] || Number.isNaN(due) || Number.isNaN(n)) return { kind: "no_due", hours: null };
  const hours = Math.round((due - n) / 3_600_000);
  if (hours < 0) return { kind: "overdue", hours };
  if (str(c["due_at"]).slice(0, 10) === now.slice(0, 10)) return { kind: "due_today", hours };
  return { kind: hours <= 48 ? "due_soon" : "on_track", hours };
}

/** Ordered case stages for the stepper (the native workflow states) and the index of the current one (-1 if unknown). */
export const CASE_STAGES = ["Open", "Assigned", "In Progress", "Resolved", "Closed"] as const;
export function caseStage(c: Row): number { return CASE_STAGES.indexOf(str(c["case_status"]) as (typeof CASE_STAGES)[number]); }

/** Other cases for the same employee (newest first), excluding this one. */
export function relatedCases(rows: Row[], c: Row): Row[] {
  return rows.filter((r) => r.name !== c.name && str(r["employee"]) && str(r["employee"]) === str(c["employee"]))
    .sort((a, b) => str(b["opened_on"]).localeCompare(str(a["opened_on"])) || a.name.localeCompare(b.name));
}
