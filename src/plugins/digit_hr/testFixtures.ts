/**
 * TEST-ONLY DIGIT HR sample rows. The DIGIT HR snapshot added these recruitment, performance, training, staffing and
 * separation rows to its Core seed (snapshot src/lib/seed.ts lines 76–92, 113–117, 120–123, 132). The Final Core seed is
 * protected and HR sample data must never auto-install, so HR tests that exercise those flows insert them explicitly
 * with installHrTestFixtures() (insert-if-missing, explicit names). Nothing in the app imports this module.
 */
import { adapter } from "@/lib/adapter";

const COMPANY = "Digit Synthetic Co";
type Rec = [string, string, Record<string, unknown>];

export const HR_TEST_FIXTURES: Rec[] = [
    ["Job Opening", "SYN-JOB-001", { job_title: "Accountant", designation: "Accountant", status: "Open", company: COMPANY, posting_date: "2026-09-20" }],
    ["Job Opening", "SYN-JOB-002", { job_title: "HR Officer", designation: "HR Officer", status: "Open", company: COMPANY, posting_date: "2026-09-28" }],
    ["Job Opening", "SYN-JOB-003", { job_title: "Sales Executive", designation: "Sales Executive", status: "Closed", company: COMPANY, posting_date: "2026-07-10" }],
    ["Job Applicant", "SYN-JA-001", { applicant_name: "Khalid Applicant", email_id: "khalid.a@digit.test", job_title: "SYN-JOB-001", status: "Open" }],
    ["Job Applicant", "SYN-JA-002", { applicant_name: "Mona Applicant", email_id: "mona.a@digit.test", job_title: "SYN-JOB-001", status: "Replied" }],
    ["Job Applicant", "SYN-JA-003", { applicant_name: "Faisal Applicant", email_id: "faisal.a@digit.test", job_title: "SYN-JOB-002", status: "Open" }],
    ["Job Applicant", "SYN-JA-004", { applicant_name: "Reem Applicant", email_id: "reem.a@digit.test", job_title: "SYN-JOB-002", status: "Hold" }],
    ["Job Applicant", "SYN-JA-005", { applicant_name: "Yousef Applicant", email_id: "yousef.a@digit.test", job_title: "SYN-JOB-003", status: "Rejected" }],
    ["Job Applicant", "SYN-JA-006", { applicant_name: "Lama Applicant", email_id: "lama.a@digit.test", job_title: "SYN-JOB-003", status: "Accepted" }],
    ["Interview Type", "HR Round", { interview_type_name: "HR Round", expected_skill_set: [{ idx: 1, skill: "Communication" }, { idx: 2, skill: "Payroll Basics" }] }],
    ["Interview Type", "Technical Round", { interview_type_name: "Technical Round", expected_skill_set: [{ idx: 1, skill: "Communication" }, { idx: 2, skill: "Problem Solving" }, { idx: 3, skill: "Spreadsheet Analysis" }] }],
    ["Interview Type", "Final Round", { interview_type_name: "Final Round", expected_skill_set: [{ idx: 1, skill: "Communication" }, { idx: 2, skill: "Negotiation" }] }],
    ["Interview", "SYN-INT-001", { job_applicant: "SYN-JA-002", job_opening: "SYN-JOB-001", interview_type: "HR Round", scheduled_on: "2026-10-20", status: "Pending" }],
    ["Interview", "SYN-INT-002", { job_applicant: "SYN-JA-004", job_opening: "SYN-JOB-002", interview_type: "Technical Round", scheduled_on: "2026-10-12", status: "Under Review" }],
    ["Interview", "SYN-INT-003", { job_applicant: "SYN-JA-006", job_opening: "SYN-JOB-003", interview_type: "Final Round", scheduled_on: "2026-08-01", status: "Cleared" }],
    ["Job Offer", "SYN-JO-001", { job_applicant: "SYN-JA-006", applicant_name: "Lama Applicant", designation: "Sales Executive", offer_date: "2026-08-10", status: "Accepted", company: COMPANY }],
    ["Job Offer", "SYN-JO-002", { job_applicant: "SYN-JA-002", applicant_name: "Mona Applicant", designation: "Accountant", offer_date: "2026-10-13", status: "Awaiting Response", company: COMPANY }],
    ["Appraisal Cycle", "SYN-APC-2026", { cycle_name: "SYN-APC-2026", company: COMPANY, status: "In Progress", start_date: "2026-07-01", end_date: "2026-12-31", appraisees: [{ idx: 1, employee: "SYN-EMP-001", employee_name: "Sara Synthetic" }, { idx: 2, employee: "SYN-EMP-002", employee_name: "Omar Synthetic" }] }],
    ["Training Program", "Synthetic Onboarding Basics", { training_program: "Synthetic Onboarding Basics", company: COMPANY, status: "Scheduled", description: "Synthetic onboarding course" }],
    ["Training Event", "SYN-TEV-0001", { event_name: "SYN-TEV-0001", training_program: "Synthetic Onboarding Basics", event_status: "Completed", type: "Workshop", company: COMPANY, location: "HQ", start_time: "2026-10-05 09:00:00", end_time: "2026-10-05 13:00:00", introduction: "Synthetic onboarding workshop", docstatus: 1, employees: [{ idx: 1, employee: "SYN-EMP-001", employee_name: "Sara Synthetic", attendance: "Present", status: "Feedback Submitted" }, { idx: 2, employee: "SYN-EMP-002", employee_name: "Omar Synthetic", attendance: "Present", status: "Completed" }] }],
    ["Training Event", "SYN-TEV-0002", { event_name: "SYN-TEV-0002", training_program: "Synthetic Onboarding Basics", event_status: "Scheduled", type: "Seminar", company: COMPANY, location: "HQ", start_time: "2026-11-15 09:00:00", end_time: "2026-11-15 12:00:00", introduction: "Synthetic follow-up seminar", employees: [{ idx: 1, employee: "SYN-EMP-002", employee_name: "Omar Synthetic", status: "Invited" }] }],
    ["Training Feedback", "SYN-TRF-0001", { employee: "SYN-EMP-001", employee_name: "Sara Synthetic", training_event: "SYN-TEV-0001", event_name: "SYN-TEV-0001", feedback: "Clear and practical.", docstatus: 1 }],
    ["Staffing Plan", "SYN-STP-2026", { company: COMPANY, from_date: "2026-01-01", to_date: "2026-12-31", docstatus: 1, staffing_details: [{ idx: 1, designation: "Accountant", vacancies: 1, current_count: 1, number_of_positions: 2, current_openings: 1 }, { idx: 2, designation: "Technician", vacancies: 1, current_count: 1, number_of_positions: 2, current_openings: 0 }] }],
    ["Appraisal Cycle", "SYN-APC-2025", { cycle_name: "SYN-APC-2025", company: COMPANY, status: "Completed", start_date: "2025-01-01", end_date: "2025-12-31", appraisees: [{ idx: 1, employee: "SYN-EMP-003", employee_name: "Huda Synthetic" }, { idx: 2, employee: "SYN-EMP-004", employee_name: "Faisal Synthetic" }] }],
    ["Appraisal", "SYN-APR-2025-01", { employee: "SYN-EMP-003", employee_name: "Huda Synthetic", appraisal_cycle: "SYN-APC-2025", company: COMPANY, start_date: "2025-01-01", end_date: "2025-12-31", final_score: 4.2, status: "Completed", docstatus: 1 }],
    ["Appraisal", "SYN-APR-2025-02", { employee: "SYN-EMP-004", employee_name: "Faisal Synthetic", appraisal_cycle: "SYN-APC-2025", company: COMPANY, start_date: "2025-01-01", end_date: "2025-12-31", final_score: 3.1, status: "Completed", docstatus: 1 }],
    ["Employee Separation", "SYN-SEP-0001", { employee: "SYN-EMP-004", employee_name: "Faisal Synthetic", designation: "Technician", company: COMPANY, boarding_status: "Pending", boarding_begins_on: "2026-11-01" }],
];

/** Inserts the snapshot HR sample rows that are missing (never overwrites existing records). */
export function installHrTestFixtures(): void {
  for (const [dt, name, data] of HR_TEST_FIXTURES) if (!adapter.get(dt, name)) adapter.insertDocQuiet(dt, { ...data, name });
  adapter.flush();
}
