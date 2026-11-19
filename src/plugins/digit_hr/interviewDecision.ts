/**
 * NB-3 applicant/interview decision (hrms interview.py): an interview is submitted only with status Cleared or Rejected;
 * after submit the source asks whether to update the Job Applicant to the mapped status (Cleared → Accepted,
 * Rejected → Rejected) and saves it only on confirmation (update_job_applicant_status). Both steps use scoped
 * reads/writes and native submit; nothing here sends email, schedules or creates offers. Synthetic preview only.
 */
import { adapter, type Doc } from "@/lib/adapter";
import { assertScoped, scopedGet } from "@/plugins/digit_hr/compat/scope";
import { submit } from "@/lib/posting";
import { activeWorkflow, transitionsFor } from "@/lib/workflow";
import { hrApplyWorkflow } from "@/plugins/digit_hr/compat/workflow";
import { cachedMeta } from "@/lib/catalog";
import { validateDoc } from "@/lib/formRules";

export type InterviewDecision = "Cleared" | "Rejected";
/** hrms Interview.get_job_applicant_status status map. */
export const APPLICANT_STATUS_FOR: Record<InterviewDecision, "Accepted" | "Rejected"> = { Cleared: "Accepted", Rejected: "Rejected" };
const DECIDABLE = new Set(["Pending", "Under Review", "Scheduled", ""]);

const allowed = (dt: string, ptypes: ("write" | "submit")[], doc: Doc) => { try { for (const p of ptypes) assertScoped(dt, p, doc); return true; } catch { return false; } };

/** Same checks as decideInterview, without writing: draft, still open, and write+submit in scope. */
export function mayDecideInterview(doc: Doc | undefined): boolean {
  if (!doc) return false;
  return Number(doc.docstatus ?? 0) === 0 && DECIDABLE.has(String(doc["status"] ?? "")) && allowed("Interview", ["write", "submit"], doc);
}

/**
 * Record the decision and submit. Missing mandatory fields block before any write; a failed submit restores the previous status
 * and surfaces the validation messages. Core posting rewrites unknown statuses to "Submitted" (Interview is not in its
 * keep-status list) while hrms keeps Cleared/Rejected, so the decided status is restored (see docs/CORE_GAPS.md).
 */
export function decideInterview(name: string, decision: InterviewDecision): { doc: Doc; applicantStatus: "Accepted" | "Rejected" } {
  if (decision !== "Cleared" && decision !== "Rejected") throw new Error("Only Cleared or Rejected interviews can be submitted");
  const doc = scopedGet("Interview", name);
  if (!doc) throw new Error("Record not found or not permitted");
  assertScoped("Interview", "write", doc); assertScoped("Interview", "submit", doc);
  if (!mayDecideInterview(doc)) throw new Error("Interview is no longer open for a decision");
  const before = String(doc["status"] ?? "");
  // Same mandatory check as a native save/submit (frappe check_mandatory), so a decision cannot submit an incomplete interview.
  const meta = cachedMeta("Interview");
  if (meta) { const errs = validateDoc(meta, undefined, { doc: { ...doc, status: decision }, over: {}, applied: [] }); if (errs.length) throw new Error(errs.join(" · ")); }
  const w = activeWorkflow("Interview");
  if (w) {
    const t = transitionsFor(w, doc).find((x) => x.next_state === decision);
    if (!t) throw new Error("No eligible workflow transition for this decision");
    const errors = hrApplyWorkflow("Interview", name, t.action);
    if (errors.length) throw new Error(errors.join(" · "));
  } else {
    adapter.update("Interview", name, { status: decision });
    let errors: string[];
    try { errors = submit("Interview", name); } catch (e) { adapter.update("Interview", name, { status: before }); throw e; }
    if (errors.length) { adapter.update("Interview", name, { status: before }); throw new Error(errors.join(" · ")); }
    adapter.update("Interview", name, { status: decision });
  }
  const back = scopedGet("Interview", name);
  if (!back || Number(back.docstatus) !== 1 || back["status"] !== decision) throw new Error("Decision could not be read back");
  return { doc: back, applicantStatus: APPLICANT_STATUS_FOR[decision] };
}

/** Whether the applicant of a decided interview can be updated to the mapped status (confirmation step). */
export function applicantUpdateFor(interview: Doc | undefined): { applicant: string; status: "Accepted" | "Rejected" } | null {
  if (!interview || Number(interview.docstatus) !== 1) return null;
  const decision = String(interview["status"]) as InterviewDecision;
  const status = APPLICANT_STATUS_FOR[decision];
  if (!status) return null;
  const applicant = scopedGet("Job Applicant", String(interview["job_applicant"] ?? ""));
  if (!applicant || applicant["status"] === status || !allowed("Job Applicant", ["write"], applicant)) return null;
  return { applicant: applicant.name, status };
}

/** Confirmed applicant update after an interview decision; re-validates and reads back. */
export function updateApplicantFromInterview(interviewName: string): Doc {
  const interview = scopedGet("Interview", interviewName);
  const next = applicantUpdateFor(interview);
  if (!next) throw new Error("No applicant update is available for this interview");
  const applicant = scopedGet("Job Applicant", next.applicant);
  if (!applicant) throw new Error("Applicant not found or not permitted");
  assertScoped("Job Applicant", "write", applicant);
  adapter.update("Job Applicant", next.applicant, { status: next.status });
  const back = scopedGet("Job Applicant", next.applicant);
  if (!back || back["status"] !== next.status) throw new Error("Applicant status could not be read back");
  return back;
}
