/**
 * 03.3 shift requests and overtime facts over PRE-SCOPED rows (HRMS Shift Request / Shift Assignment / Overtime Slip).
 * Stages follow the source: a request is decided by setting status Approved/Rejected and submitting it; in Frappe,
 * submitting an approved request creates the Shift Assignment (shift_request.py on_submit) — the preview only reports
 * whether a matching assignment exists. Overtime shows recorded hours only; pay is computed by payroll on the server.
 */
type Row = Record<string, unknown>;
const s = (v: unknown) => (v == null ? "" : String(v));
const n = (v: unknown) => Number(v || 0);
const d10 = (v: unknown) => s(v).slice(0, 10);
export const overlaps = (a1: string, a2: string, b1: string, b2: string) => !!a1 && !!b1 && a1 <= (b2 || "9999-12-31") && b1 <= (a2 || "9999-12-31");

export type ShiftReqStage = "pending" | "decided" | "approved" | "rejected";
export type ShiftReqRow = {
  name: string; employee: string; employeeName: string; shiftType: string; from: string; to: string; status: string;
  stage: ShiftReqStage; approver: string; assignment: string; conflicts: string[]; leave: string[];
};

export function requestStage(r: Row): ShiftReqStage {
  const st = s(r["status"]) || "Draft";
  if (n(r["docstatus"]) === 0) return st === "Draft" ? "pending" : "decided";
  return st === "Approved" ? "approved" : "rejected";
}

/** Live (not cancelled) requests with the matching submitted assignment, other-shift overlaps and approved-leave overlaps. */
export function shiftRequestRows(reqs: Row[], assigns: Row[], leaves: Row[]): ShiftReqRow[] {
  const sub = assigns.filter((a) => n(a["docstatus"]) === 1 && s(a["status"] || "Active") !== "Inactive");
  const appr = leaves.filter((l) => n(l["docstatus"]) === 1 && s(l["status"]) === "Approved");
  return reqs.filter((r) => n(r["docstatus"]) !== 2).map((r) => {
    const emp = s(r["employee"]), from = d10(r["from_date"]), to = d10(r["to_date"]), shift = s(r["shift_type"]);
    const mine = sub.filter((a) => s(a["employee"]) === emp && overlaps(d10(a["start_date"]), d10(a["end_date"]), from, to));
    return {
      name: s(r["name"]), employee: emp, employeeName: s(r["employee_name"]) || emp, shiftType: shift, from, to,
      status: s(r["status"]) || "Draft", stage: requestStage(r), approver: s(r["approver"]),
      assignment: s(mine.find((a) => s(a["shift_type"]) === shift && (s(a["shift_request"]) === s(r["name"]) || d10(a["start_date"]) <= from))?.["name"]),
      conflicts: mine.filter((a) => s(a["shift_type"]) !== shift).map((a) => s(a["name"])),
      leave: appr.filter((l) => s(l["employee"]) === emp && overlaps(d10(l["from_date"]), d10(l["to_date"]), from, to)).map((l) => s(l["name"])),
    };
  }).sort((a, b) => STAGE_ORDER[a.stage] - STAGE_ORDER[b.stage] || a.from.localeCompare(b.from) || a.name.localeCompare(b.name));
}
const STAGE_ORDER: Record<ShiftReqStage, number> = { pending: 0, decided: 1, approved: 2, rejected: 3 };

export function stageCounts(rows: ShiftReqRow[]): Record<ShiftReqStage, number> {
  const c: Record<ShiftReqStage, number> = { pending: 0, decided: 0, approved: 0, rejected: 0 };
  for (const r of rows) c[r.stage] += 1;
  return c;
}

export type OvertimeRow = { name: string; employee: string; employeeName: string; from: string; to: string; hours: number; state: "draft" | "submitted"; salarySlip: string };

/** Overtime slips (not cancelled): hours = total_overtime_duration, else the sum of overtime_details durations. */
export function overtimeRows(slips: Row[]): OvertimeRow[] {
  return slips.filter((x) => n(x["docstatus"]) !== 2).map((x) => {
    const det = Array.isArray(x["overtime_details"]) ? (x["overtime_details"] as Row[]) : [];
    const hours = n(x["total_overtime_duration"]) || det.reduce((t, r) => t + n(r["overtime_duration"]), 0);
    return { name: s(x["name"]), employee: s(x["employee"]), employeeName: s(x["employee_name"]) || s(x["employee"]), from: d10(x["start_date"]), to: d10(x["end_date"]), hours: Math.round(hours * 100) / 100, state: n(x["docstatus"]) === 1 ? "submitted" as const : "draft" as const, salarySlip: s(x["salary_slip"]) };
  }).sort((a, b) => (a.state === b.state ? b.from.localeCompare(a.from) : a.state === "draft" ? -1 : 1));
}

export function overtimeTotals(rows: OvertimeRow[]) {
  const sum = (st: OvertimeRow["state"]) => Math.round(rows.filter((r) => r.state === st).reduce((t, r) => t + r.hours, 0) * 100) / 100;
  return { draft: rows.filter((r) => r.state === "draft").length, submitted: rows.filter((r) => r.state === "submitted").length, draftHours: sum("draft"), submittedHours: sum("submitted") };
}
