/**
 * List views of Construction documents (owner UX depth round 2026-11-14, checklist "Kanban / calendar where the
 * document has stages or dates"): a Calendar / Gantt view for every dated Construction DocType (manifest
 * calendar_views, the same field_map shape as a source <doctype>_calendar.js) and a saved Kanban board on the workflow
 * status of every Construction workflow (seeded insert-if-missing). Display only: cards still move through the
 * document API and the workflow gate, so no state changes outside its workflow.
 */
const C = (start: string, end: string, title?: string) => ({ field_map: { start, end, ...(title ? { title } : {}) }, source: "digit_construction" });
export const CONSTRUCTION_CALENDARS: Record<string, { field_map: { start: string; end: string; title?: string }; source: string }> = {
  "Digit Work Package": C("start_date", "end_date"),
  "Digit Stage Planning": C("planned_start", "planned_end"),
  "Digit Progress Update": C("update_date", "update_date"),
  "Digit Site Activity Report": C("report_date", "report_date"),
  "Digit Tender": C("submission_deadline", "submission_deadline", "title"),
  "Digit Client Contract": C("start_date", "end_date", "title"),
  "Digit Client Claim": C("period_start", "period_end"),
  "Digit Client Certificate": C("cert_date", "cert_date"),
  "Digit Subcontract Work Order": C("wo_date", "wo_date"),
  "Digit Measurement Book": C("mb_date", "mb_date"),
  "Digit Subcontractor Bill": C("bill_date", "bill_date"),
  "Digit Cost Forecast Snapshot": C("cutoff_date", "cutoff_date"),
  "Digit Machinery Usage": C("usage_date", "usage_date"),
  "Digit Field Attendance": C("attendance_date", "attendance_date"),
  "Digit Site Expense": C("expense_date", "expense_date"),
  "Digit Issue Request": C("required_on", "required_on"),
  "Digit Closeout Assessment": C("assessment_date", "assessment_date"),
};
