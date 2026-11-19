import { VISIT_DT } from "@/plugins/digit_fsm/schema";
/**
 * Derived work state of FSM records — the SLA clock and the next step a list row shows (owner FSM round F1-03 / F2-06).
 * Pure reads over canonical records; nothing is stored. The SLA of a service request is its own response / resolution
 * deadline (native Issue response_by / resolution_by / first_responded_on); a job and its visits carry the request's clock,
 * and a planned inspection job carries the end of its obligations' compliance window.
 */
import type { Doc } from "@/lib/adapter";
import { list, raw, rows } from "./data";
import { nowIso, s, today } from "./rules";

export type SlaState = "ok" | "risk" | "breached" | "met" | "na";
export interface Sla { state: SlaState; due: string; leftH: number; basis: "response" | "resolution" | "window" | "" }
const NA: Sla = { state: "na", due: "", leftH: 0, basis: "" };
const ms = (v: string) => Date.parse((v.length === 10 ? `${v} 23:59:59` : v).replace(" ", "T"));
const hours = (a: string, b: string) => (ms(b) - ms(a)) / 3600000;
const DONE_JOB = new Set(["Completed", "Closed"]);

function clock(start: string, due: string, done: string | null, basis: Sla["basis"], now = nowIso()): Sla {
  if (!due) return NA;
  if (done) return { state: ms(done) <= ms(due) ? "met" : "breached", due, leftH: hours(done, due), basis };
  const left = hours(now, due); const span = start ? Math.max(1, hours(start, due)) : 24;
  return { state: left < 0 ? "breached" : left <= Math.max(4, span * 0.2) ? "risk" : "ok", due, leftH: left, basis };
}
/** SLA of a native service request: first response first, then resolution. */
export function issueSla(i: Doc, now = nowIso()): Sla {
  const open = `${s(i["opening_date"])} ${s(i["opening_time"]) || "08:00:00"}`.trim();
  const st = s(i["status"]); const closed = st === "Resolved" || st === "Closed";
  if (!i["response_by"] && !i["resolution_by"]) return NA;
  if (!i["first_responded_on"] && !closed) return clock(open, s(i["response_by"]), null, "response", now);
  return clock(open, s(i["resolution_by"]), closed ? s(i["resolution_date"]) || s(i["modified"]) || now : null, "resolution", now);
}
/** SLA of a job: its request's clock, else the earliest compliance-window end of its obligations. */
export function jobSla(j: Doc | undefined, now = nowIso()): Sla {
  if (!j || s(j["workflow_state"]) === "Cancelled") return NA;
  const req = j["issue"] ? raw("Issue", j["issue"]) : list("Issue").find((i) => s(i["digit_fsm_job"]) === j.name);
  if (req) return issueSla(req, now);
  const ends = rows(j, "obligations").map((b) => s(raw("FSM Obligation", b["obligation"])?.["window_end"])).filter(Boolean).sort();
  if (!ends.length) return NA;
  const first = rows(j, "obligations").map((b) => s(raw("FSM Obligation", b["obligation"])?.["due_date"])).filter(Boolean).sort()[0] ?? "";
  return clock(first ? `${first} 00:00:00` : "", ends[0]!, DONE_JOB.has(s(j["workflow_state"])) ? s(j["completed_on"]) || now : null, "window", now);
}
export function slaOf(dt: string, d: Doc | undefined, now = nowIso()): Sla {
  if (!d) return NA;
  if (dt === "Issue") return issueSla(d, now);
  if (dt === "FSM Job") return jobSla(d, now);
  if (dt === VISIT_DT) return ["Completed", "Cancelled"].includes(s(d["workflow_state"])) ? NA : jobSla(raw("FSM Job", d["job"]), now);
  return NA;
}

export interface NextStep { label: [string, string]; date: string; tone: "bad" | "warn" | "neutral" }
const step = (en: string, ar: string, date: unknown): NextStep => { const d = s(date).slice(0, 10); return { label: [en, ar], date: s(date), tone: !d ? "neutral" : d < today() ? "bad" : d === today() ? "warn" : "neutral" }; };
/** The next step of an open record and its date (red when overdue, amber today); null once nothing is left to do. */
export function nextStep(dt: string, d: Doc | undefined): NextStep | null {
  if (!d) return null; const st = s(d["workflow_state"]);
  switch (dt) {
    case VISIT_DT:
      if (st === "Unscheduled") return step("Book on the board", "الجدولة في اللوحة", jobSla(raw("FSM Job", d["job"])).due);
      if (st === "Planned") return step("Dispatch to the technician", "الإرسال إلى الفني", d["scheduled_start"]);
      if (st === "Dispatched") return d["acknowledged_on"] ? step("Travel and check in", "التوجه وتسجيل الوصول", d["scheduled_start"]) : step("Get the acknowledgement", "طلب إقرار الفني", d["scheduled_start"]);
      if (st === "On Site") return step("Record results and sign off", "تسجيل النتائج والتوقيع", d["scheduled_end"]);
      return null;
    case "FSM Job":
      if (st === "Draft") return step("Plan the visits", "تخطيط الزيارات", jobSla(d).due);
      if (st === "Scheduled") { const v = list(VISIT_DT).filter((x) => s(x["job"]) === d.name && x["scheduled_start"]).map((x) => s(x["scheduled_start"])).sort()[0]; return step("Visit planned", "زيارة مخططة", v ?? ""); }
      if (st === "In Progress") return step("Complete the visit", "إكمال الزيارة", today());
      if (st === "On Hold") return step("Resolve the hold", "معالجة الإيقاف", d["modified"]);
      if (st === "Completed") return step("Close and charge", "الإغلاق والتحصيل", d["completed_on"]);
      return null;
    case "FSM Deficiency":
      if (st === "Open") return d["quotation"] ? step("Send the quotation", "إرسال عرض السعر", d["opened_on"]) : step("Draft a quotation", "إعداد عرض سعر", d["opened_on"]);
      if (st === "Quoted") return step("Customer decision", "قرار العميل", raw("Quotation", d["quotation"])?.["valid_till"] ?? d["opened_on"]);
      if (st === "Approved for Repair") { const j = raw("FSM Job", d["repair_job"]); const v = list(VISIT_DT).find((x) => s(x["job"]) === s(j?.name) && x["scheduled_start"]); return step("Repair", "تنفيذ الإصلاح", v?.["scheduled_start"] ?? d["decision_on"] ?? ""); }
      if (st === "Retest Pending") { const r = list("FSM Retest").find((x) => s(x["deficiency"]) === d.name && s(x["status"]) !== "Passed"); return step("Verification retest", "إعادة فحص للتحقق", r?.["due_date"] ?? ""); }
      if (st === "Disputed") return step("Settle the dispute", "حسم الاعتراض", d["modified"]);
      return null;
    case "FSM Inspection Run":
      if (st === "Draft" || st === "In Progress") return step("Record and submit", "التسجيل والتقديم", raw(VISIT_DT, d["visit"])?.["scheduled_end"] ?? "");
      if (st === "Submitted for Review") return step("Technical review", "المراجعة الفنية", d["submitted_on"]);
      if (st === "Reviewed") return step("Publish the report", "نشر التقرير", d["reviewed_on"] ?? "");
      return null;
    case "FSM Obligation": {
      const os = s(d["status"]);
      if (os === "Due") return step("Release a job", "إصدار أمر عمل", d["due_date"]);
      if (os === "Scheduled") return step("Visit planned", "زيارة مخططة", d["due_date"]);
      if (os === "Missed") return step("Catch up or waive", "الاستدراك أو الإعفاء", d["window_end"]);
      return null;
    }
    case "FSM Retest": return s(d["status"]) === "Passed" ? null : step("Retest run", "تشغيل إعادة الفحص", d["due_date"]);
    case "Issue": {
      const is = s(d["status"]); if (is === "Resolved" || is === "Closed") return null;
      if (!d["first_responded_on"]) return step("First response", "الاستجابة الأولى", d["response_by"]);
      return d["digit_fsm_job"] ? step("Follow the job", "متابعة أمر العمل", d["resolution_by"]) : step("Create a job", "إنشاء أمر عمل", d["resolution_by"]);
    }
  }
  return null;
}
