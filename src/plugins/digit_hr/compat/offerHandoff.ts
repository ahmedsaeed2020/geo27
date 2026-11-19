/**
 * Accepted Job Offer → draft Employee Onboarding handoff (mirrors HRMS
 * "Create Onboarding" from Job Offer). Idempotent: one onboarding per job
 * applicant; a second call returns the existing record. Creating the Employee
 * itself stays server-dependent (HRMS make_employee), so it is never faked here.
 */
import { adapter, type Doc } from "@/lib/adapter";
import { assertScoped, scopedGet } from "@/plugins/digit_hr/compat/scope";

const s = (v: unknown) => String(v ?? "");

export type HandoffResult = { created: boolean; doc: Doc };

export function existingOnboarding(jobApplicant: string): Doc | undefined {
  if (!jobApplicant) return undefined;
  return adapter.list("Employee Onboarding").find((b) => s(b["job_applicant"]) === jobApplicant && Number(b["docstatus"]) !== 2);
}

export function handoffOffer(offerName: string): HandoffResult {
  const offer = scopedGet("Job Offer", offerName);
  if (!offer) throw new Error(`Job Offer ${offerName} not found`);
  if (s(offer["status"]) !== "Accepted") throw new Error("Only an Accepted Job Offer can start onboarding");
  const applicant = s(offer["job_applicant"]);
  if (!applicant) throw new Error("Job Offer has no Job Applicant");
  const prior = existingOnboarding(applicant);
  if (prior) { const visible = scopedGet('Employee Onboarding',prior.name); if (!visible) throw new Error('Existing onboarding is not permitted'); return { created: false, doc: visible }; }
  assertScoped("Employee Onboarding", "create", {name:'',doctype:'Employee Onboarding',company:offer['company']});
  const doc = adapter.insertDoc("Employee Onboarding", {
    job_applicant: applicant, job_offer: offerName, employee_name: s(offer["applicant_name"]),
    designation: s(offer["designation"]), company: s(offer["company"]), boarding_status: "Pending",
    date_of_joining: s(offer["date_of_joining"]) || undefined,
  });
  return { created: true, doc };
}
