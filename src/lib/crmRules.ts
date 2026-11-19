/** Pure helpers ported from crm SLA/Assignment settings (WorkDayModal, EditResponseResolutionModal, AssignmentRuleView). */
export type Row = Record<string, unknown>;
export const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
export const RULES = ["Round Robin", "Load Balancing", "Based on Field", "Weighted Distribution"];

/** Duration seconds -> "H:MM" (hide_days/hide_seconds like Service Level Priority). */
export const toHM = (s: unknown) => { const n = Math.max(0, Number(s) || 0); return `${Math.floor(n / 3600)}:${String(Math.floor(n % 3600 / 60)).padStart(2, "0")}`; };
export const fromHM = (v: string) => { const [h, m] = v.split(":").map(x => Number(x) || 0); return (h ?? 0) * 3600 + (m ?? 0) * 60; };

/** WorkDayModal: set the same hours for the chosen days, replacing existing rows for those days; keeps source day order. */
export function applyWorkDays(rows: Row[], days: string[], start: string, end: string): Row[] {
  const kept = rows.filter(r => !days.includes(String(r["workday"])));
  return [...kept, ...days.map(workday => ({ workday, start_time: start, end_time: end }))].sort((a, b) => DAYS.indexOf(String(a["workday"])) - DAYS.indexOf(String(b["workday"])));
}

/** Validation mirrors the source save guards; returns a message key or "". */
export function validateSla(d: Row): string {
  const pr = Array.isArray(d["priorities"]) ? d["priorities"] as Row[] : [];
  if (!pr.length) return "At least one priority is required";
  if (pr.some(r => Number(r["first_response_time"]) <= 0)) return "Response time must be positive";
  if (pr.some(r => r["resolution_time"] && Number(r["resolution_time"]) < Number(r["first_response_time"]))) return "Resolution time must be after response time";
  if (pr.filter(r => Number(r["default_priority"])).length !== 1) return "Exactly one default priority is required";
  const wh = Array.isArray(d["working_hours"]) ? d["working_hours"] as Row[] : [];
  if (wh.some(r => String(r["start_time"]) >= String(r["end_time"]))) return "End time must be after start time";
  return "";
}

export function validateAssignment(d: Row): string {
  const users = Array.isArray(d["users"]) ? d["users"] as Row[] : [];
  if (!users.filter(u => u["user"]).length) return "At least one assignee is required";
  if (d["rule"] === "Based on Field" && !d["field"]) return "Field is required";
  if (d["rule"] === "Weighted Distribution" && users.some(u => Number(u["weight"] ?? 1) <= 0)) return "Weight must be positive";
  if (!Array.isArray(d["assignment_days"]) || !(d["assignment_days"] as Row[]).length) return "Select at least one assignment day";
  return "";
}
