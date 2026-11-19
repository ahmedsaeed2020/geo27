import { V8_MAP } from "./v8/doctypes";
import { R9_MAP } from "./r9/doctypes";
import { R10_MAP, R10_NATIVE_PLACEMENT } from "./r10/doctypes";
/** Verified native destinations per DIGIT HR subspace, generated from HR_MODULES_30_SOURCE_DESTINATIONS.csv and checked against public/catalog/index.json (unknown/child DocTypes dropped). */
export type NativeTarget = { doctype: string; app: string; slug: string };
const MAP: Record<string, NativeTarget[]> = {
 "01.1": [
  {
   "doctype": "Company",
   "app": "erpnext",
   "slug": "company"
  },
  {
   "doctype": "Department",
   "app": "erpnext",
   "slug": "department"
  },
  {
   "doctype": "Branch",
   "app": "erpnext",
   "slug": "branch"
  },
  {
   "doctype": "Employee",
   "app": "erpnext",
   "slug": "employee"
  },
  {
   "doctype": "Cost Center",
   "app": "erpnext",
   "slug": "cost_center"
  }
 ],
 "01.2": [
  {
   "doctype": "Designation",
   "app": "erpnext",
   "slug": "designation"
  }
 ],
 "01.3": [
  {
   "doctype": "Employee",
   "app": "erpnext",
   "slug": "employee"
  },
  {
   "doctype": "Job Opening",
   "app": "hrms",
   "slug": "job_opening"
  },
  {
   "doctype": "Cost Center",
   "app": "erpnext",
   "slug": "cost_center"
  },
  {
   "doctype": "Department",
   "app": "erpnext",
   "slug": "department"
  }
 ],
 "01.4": [
  {
   "doctype": "Employee",
   "app": "erpnext",
   "slug": "employee"
  },
  {
   "doctype": "Leave Application",
   "app": "hrms",
   "slug": "leave_application"
  },
  {
   "doctype": "Attendance",
   "app": "hrms",
   "slug": "attendance"
  },
  {
   "doctype": "Salary Structure Assignment",
   "app": "hrms",
   "slug": "salary_structure_assignment"
  }
 ],
 "01.5": [
  {
   "doctype": "Employee",
   "app": "erpnext",
   "slug": "employee"
  },
  {
   "doctype": "Employee Transfer",
   "app": "hrms",
   "slug": "employee_transfer"
  },
  {
   "doctype": "Employee Promotion",
   "app": "hrms",
   "slug": "employee_promotion"
  }
 ],
 "01.6": [
  {
   "doctype": "Employee",
   "app": "erpnext",
   "slug": "employee"
  },
  {
   "doctype": "Job Offer",
   "app": "hrms",
   "slug": "job_offer"
  }
 ],
 "02.1": [
  {
   "doctype": "Job Requisition",
   "app": "hrms",
   "slug": "job_requisition"
  },
  {
   "doctype": "Job Opening",
   "app": "hrms",
   "slug": "job_opening"
  },
  {
   "doctype": "Job Applicant",
   "app": "hrms",
   "slug": "job_applicant"
  },
  {
   "doctype": "Interview",
   "app": "hrms",
   "slug": "interview"
  },
  {
   "doctype": "Job Offer",
   "app": "hrms",
   "slug": "job_offer"
  },
  {
   "doctype": "Interview Feedback",
   "app": "hrms",
   "slug": "interview_feedback"
  },
  {
   "doctype": "Employee Onboarding",
   "app": "hrms",
   "slug": "employee_onboarding"
  }
 ],
 "02.2": [
  {
   "doctype": "Employee Onboarding",
   "app": "hrms",
   "slug": "employee_onboarding"
  },
  {
   "doctype": "Employee Onboarding Template",
   "app": "hrms",
   "slug": "employee_onboarding_template"
  },
  {
   "doctype": "Employee",
   "app": "erpnext",
   "slug": "employee"
  }
 ],
 "02.3": [
  {
   "doctype": "Employee Performance Feedback",
   "app": "hrms",
   "slug": "employee_performance_feedback"
  },
  {
   "doctype": "Goal",
   "app": "hrms",
   "slug": "goal"
  },
  {
   "doctype": "Appraisal",
   "app": "hrms",
   "slug": "appraisal"
  },
  {
   "doctype": "Appraisal Template",
   "app": "hrms",
   "slug": "appraisal_template"
  },
  {
   "doctype": "Appraisal Cycle",
   "app": "hrms",
   "slug": "appraisal_cycle"
  },
  {
   "doctype": "Employee",
   "app": "erpnext",
   "slug": "employee"
  },
  {
   "doctype": "Employee Grievance",
   "app": "hrms",
   "slug": "employee_grievance"
  }
 ],
 "02.4": [
  {
   "doctype": "Training Program",
   "app": "hrms",
   "slug": "training_program"
  },
  {
   "doctype": "Training Event",
   "app": "hrms",
   "slug": "training_event"
  },
  {
   "doctype": "Training Feedback",
   "app": "hrms",
   "slug": "training_feedback"
  },
  {
   "doctype": "Training Result",
   "app": "hrms",
   "slug": "training_result"
  },
  {
   "doctype": "Employee Skill Map",
   "app": "hrms",
   "slug": "employee_skill_map"
  },
  {
   "doctype": "Skill",
   "app": "hrms",
   "slug": "skill"
  },
  {
   "doctype": "Appraisal",
   "app": "hrms",
   "slug": "appraisal"
  },
  {
   "doctype": "Employee",
   "app": "erpnext",
   "slug": "employee"
  }
 ],
 "02.5": [
  {
   "doctype": "Employee",
   "app": "erpnext",
   "slug": "employee"
  },
  {
   "doctype": "Appraisal",
   "app": "hrms",
   "slug": "appraisal"
  }
 ],
 "03.1": [
  {
   "doctype": "Leave Application",
   "app": "hrms",
   "slug": "leave_application"
  },
  {
   "doctype": "Leave Allocation",
   "app": "hrms",
   "slug": "leave_allocation"
  },
  {
   "doctype": "Leave Ledger Entry",
   "app": "hrms",
   "slug": "leave_ledger_entry"
  },
  {
   "doctype": "Leave Type",
   "app": "hrms",
   "slug": "leave_type"
  },
  {
   "doctype": "Leave Policy",
   "app": "hrms",
   "slug": "leave_policy"
  },
  {
   "doctype": "Leave Policy Assignment",
   "app": "hrms",
   "slug": "leave_policy_assignment"
  }
 ],
 "03.2": [
  {
   "doctype": "Employee Checkin",
   "app": "hrms",
   "slug": "employee_checkin"
  },
  {
   "doctype": "Attendance",
   "app": "hrms",
   "slug": "attendance"
  },
  {
   "doctype": "Shift Assignment",
   "app": "hrms",
   "slug": "shift_assignment"
  }
 ],
 "03.3": [
  {
   "doctype": "Shift Type",
   "app": "hrms",
   "slug": "shift_type"
  },
  {
   "doctype": "Shift Schedule",
   "app": "hrms",
   "slug": "shift_schedule"
  },
  {
   "doctype": "Shift Assignment",
   "app": "hrms",
   "slug": "shift_assignment"
  },
  {
   "doctype": "Overtime Slip",
   "app": "hrms",
   "slug": "overtime_slip"
  },
  {
   "doctype": "Attendance",
   "app": "hrms",
   "slug": "attendance"
  },
  {
   "doctype": "Salary Slip",
   "app": "hrms",
   "slug": "salary_slip"
  }
 ],
 "03.4": [
  { "doctype": "Employee Checkin", "app": "hrms", "slug": "employee_checkin" },
  { "doctype": "Attendance", "app": "hrms", "slug": "attendance" },
  { "doctype": "Employee", "app": "erpnext", "slug": "employee" },
  { "doctype": "Data Import", "app": "frappe", "slug": "data_import" }
 ],
 "04.1": [
  {
   "doctype": "Payroll Entry",
   "app": "hrms",
   "slug": "payroll_entry"
  },
  {
   "doctype": "Salary Slip",
   "app": "hrms",
   "slug": "salary_slip"
  },
  {
   "doctype": "Salary Structure Assignment",
   "app": "hrms",
   "slug": "salary_structure_assignment"
  },
  {
   "doctype": "Salary Component",
   "app": "hrms",
   "slug": "salary_component"
  },
  {
   "doctype": "Salary Structure",
   "app": "hrms",
   "slug": "salary_structure"
  },
  {
   "doctype": "Employee",
   "app": "erpnext",
   "slug": "employee"
  },
  {
   "doctype": "Additional Salary",
   "app": "hrms",
   "slug": "additional_salary"
  },
  {
   "doctype": "Arrear",
   "app": "hrms",
   "slug": "arrear"
  },
  {
   "doctype": "Payroll Correction",
   "app": "hrms",
   "slug": "payroll_correction"
  },
  {
   "doctype": "Journal Entry",
   "app": "erpnext",
   "slug": "journal_entry"
  },
  {
   "doctype": "GL Entry",
   "app": "erpnext",
   "slug": "gl_entry"
  }
 ],
 "04.2": [
  {
   "doctype": "Salary Slip",
   "app": "hrms",
   "slug": "salary_slip"
  },
  {
   "doctype": "Payroll Entry",
   "app": "hrms",
   "slug": "payroll_entry"
  },
  {
   "doctype": "Payment Entry",
   "app": "erpnext",
   "slug": "payment_entry"
  }
 ],
 "04.3": [
  {
   "doctype": "Leave Type",
   "app": "hrms",
   "slug": "leave_type"
  },
  {
   "doctype": "Salary Component",
   "app": "hrms",
   "slug": "salary_component"
  },
  {
   "doctype": "Employee",
   "app": "erpnext",
   "slug": "employee"
  },
  {
   "doctype": "Salary Slip",
   "app": "hrms",
   "slug": "salary_slip"
  },
  {
   "doctype": "Gratuity",
   "app": "hrms",
   "slug": "gratuity"
  },
  {
   "doctype": "Gratuity Rule",
   "app": "hrms",
   "slug": "gratuity_rule"
  },
  {
   "doctype": "Full and Final Statement",
   "app": "hrms",
   "slug": "full_and_final_statement"
  }
 ],
 "04.4": [
  {
   "doctype": "Salary Structure Assignment",
   "app": "hrms",
   "slug": "salary_structure_assignment"
  },
  {
   "doctype": "Salary Component",
   "app": "hrms",
   "slug": "salary_component"
  },
  {
   "doctype": "Additional Salary",
   "app": "hrms",
   "slug": "additional_salary"
  },
  {
   "doctype": "Employee Benefit Application",
   "app": "hrms",
   "slug": "employee_benefit_application"
  },
  {
   "doctype": "Salary Slip",
   "app": "hrms",
   "slug": "salary_slip"
  }
 ],
 "04.5": [
  {
   "doctype": "Employee Advance",
   "app": "hrms",
   "slug": "employee_advance"
  },
  {
   "doctype": "Expense Claim",
   "app": "hrms",
   "slug": "expense_claim"
  }
 ],
 "05.1": [
  {
   "doctype": "Employee",
   "app": "erpnext",
   "slug": "employee"
  },
  {
   "doctype": "Leave Application",
   "app": "hrms",
   "slug": "leave_application"
  },
  {
   "doctype": "Salary Slip",
   "app": "hrms",
   "slug": "salary_slip"
  },
  {
   "doctype": "Employee Onboarding",
   "app": "hrms",
   "slug": "employee_onboarding"
  },
  {
   "doctype": "Employee Advance",
   "app": "hrms",
   "slug": "employee_advance"
  },
  {
   "doctype": "Expense Claim",
   "app": "hrms",
   "slug": "expense_claim"
  }
 ],
 "05.2": [
  {
   "doctype": "Employee",
   "app": "erpnext",
   "slug": "employee"
  },
  {
   "doctype": "Leave Application",
   "app": "hrms",
   "slug": "leave_application"
  },
  {
   "doctype": "Shift Assignment",
   "app": "hrms",
   "slug": "shift_assignment"
  },
  {
   "doctype": "Workflow Action",
   "app": "frappe",
   "slug": "workflow_action"
  },
  {
   "doctype": "Attendance",
   "app": "hrms",
   "slug": "attendance"
  }
 ],
 "05.3": [
  {
   "doctype": "Employee",
   "app": "erpnext",
   "slug": "employee"
  },
  {
   "doctype": "Employee Grievance",
   "app": "hrms",
   "slug": "employee_grievance"
  },
  {
   "doctype": "File",
   "app": "frappe",
   "slug": "file"
  }
 ],
 "06.1": [
  {
   "doctype": "Employee",
   "app": "erpnext",
   "slug": "employee"
  },
  {
   "doctype": "Department",
   "app": "erpnext",
   "slug": "department"
  },
  {
   "doctype": "Salary Slip",
   "app": "hrms",
   "slug": "salary_slip"
  },
  {
   "doctype": "Job Opening",
   "app": "hrms",
   "slug": "job_opening"
  },
  {
   "doctype": "Leave Application",
   "app": "hrms",
   "slug": "leave_application"
  },
  {
   "doctype": "Employee Onboarding",
   "app": "hrms",
   "slug": "employee_onboarding"
  },
  {
   "doctype": "Workflow Action",
   "app": "frappe",
   "slug": "workflow_action"
  },
  {
   "doctype": "Employee Advance",
   "app": "hrms",
   "slug": "employee_advance"
  },
  {
   "doctype": "Leave Ledger Entry",
   "app": "hrms",
   "slug": "leave_ledger_entry"
  },
  {
   "doctype": "Attendance",
   "app": "hrms",
   "slug": "attendance"
  }
 ],
 "06.2": [
  {
   "doctype": "Employee",
   "app": "erpnext",
   "slug": "employee"
  },
  {
   "doctype": "Department",
   "app": "erpnext",
   "slug": "department"
  },
  {
   "doctype": "Salary Slip",
   "app": "hrms",
   "slug": "salary_slip"
  },
  {
   "doctype": "Salary Structure Assignment",
   "app": "hrms",
   "slug": "salary_structure_assignment"
  }
 ],
 "06.3": [
  {
   "doctype": "Employee",
   "app": "erpnext",
   "slug": "employee"
  },
  {
   "doctype": "Department",
   "app": "erpnext",
   "slug": "department"
  },
  {
   "doctype": "Job Opening",
   "app": "hrms",
   "slug": "job_opening"
  },
  {
   "doctype": "Leave Application",
   "app": "hrms",
   "slug": "leave_application"
  },
  {
   "doctype": "Salary Slip",
   "app": "hrms",
   "slug": "salary_slip"
  },
  {
   "doctype": "Payroll Entry",
   "app": "hrms",
   "slug": "payroll_entry"
  },
  {
   "doctype": "GL Entry",
   "app": "erpnext",
   "slug": "gl_entry"
  },
  {
   "doctype": "Attendance",
   "app": "hrms",
   "slug": "attendance"
  },
  {
   "doctype": "Shift Assignment",
   "app": "hrms",
   "slug": "shift_assignment"
  },
  {
   "doctype": "Job Applicant",
   "app": "hrms",
   "slug": "job_applicant"
  },
  {
   "doctype": "Interview",
   "app": "hrms",
   "slug": "interview"
  },
  {
   "doctype": "Job Offer",
   "app": "hrms",
   "slug": "job_offer"
  },
  {
   "doctype": "Workflow Action",
   "app": "frappe",
   "slug": "workflow_action"
  },
  {
   "doctype": "Version",
   "app": "frappe",
   "slug": "version"
  }
 ],
 "07.1": [
  {
   "doctype": "Company",
   "app": "erpnext",
   "slug": "company"
  },
  {
   "doctype": "Department",
   "app": "erpnext",
   "slug": "department"
  },
  {
   "doctype": "HR Settings",
   "app": "hrms",
   "slug": "hr_settings"
  },
  {
   "doctype": "Leave Type",
   "app": "hrms",
   "slug": "leave_type"
  },
  {
   "doctype": "Salary Structure",
   "app": "hrms",
   "slug": "salary_structure"
  },
  {
   "doctype": "Workflow",
   "app": "frappe",
   "slug": "workflow"
  },
  {
   "doctype": "Workflow Action",
   "app": "frappe",
   "slug": "workflow_action"
  },
  {
   "doctype": "Role",
   "app": "frappe",
   "slug": "role"
  }
 ],
 "07.2": [
  {
   "doctype": "Role",
   "app": "frappe",
   "slug": "role"
  },
  {
   "doctype": "User Permission",
   "app": "frappe",
   "slug": "user_permission"
  },
  {
   "doctype": "Employee",
   "app": "erpnext",
   "slug": "employee"
  }
 ],
 "07.3": [
  {
   "doctype": "Print Format",
   "app": "frappe",
   "slug": "print_format"
  },
  {
   "doctype": "Notification",
   "app": "frappe",
   "slug": "notification"
  },
  {
   "doctype": "Email Template",
   "app": "frappe",
   "slug": "email_template"
  }
 ],
 "07.4": [
  {
   "doctype": "Scheduled Job Type",
   "app": "frappe",
   "slug": "scheduled_job_type"
  },
  {
   "doctype": "Error Log",
   "app": "frappe",
   "slug": "error_log"
  }
 ]
};
// V8: native HRMS/ERPNext screens that exist in the frozen source but were missing from the CSV, plus DIGIT extensions.
const ADD: Record<string, NativeTarget[]> = {
 "03.2": [{ doctype: "Attendance Request", app: "hrms", slug: "attendance_request" }, { doctype: "Shift Request", app: "hrms", slug: "shift_request" }],
 "05.1": [{ doctype: "Attendance Request", app: "hrms", slug: "attendance_request" }],
 "01.5": [{ doctype: "Task", app: "erpnext", slug: "task" }, { doctype: "Employee Separation", app: "hrms", slug: "employee_separation" }, { doctype: "Exit Interview", app: "hrms", slug: "exit_interview" }, { doctype: "Asset Movement", app: "erpnext", slug: "asset_movement" }],
 "01.3": [{ doctype: "Staffing Plan", app: "hrms", slug: "staffing_plan" }],
 "06.2": [{ doctype: "Staffing Plan", app: "hrms", slug: "staffing_plan" }],
 "05.3": [{ doctype: "DIGIT HR Service Case", app: "hrms", slug: "digit_hr_service_case" }],
 "01.6": [{ doctype: "DIGIT Document Renewal", app: "hrms", slug: "digit_document_renewal" }],
 // Batch B (additive): source screens referenced by existing HR links and the self-service catalog but missing from the CSV.
 "03.1": [{ doctype: "Compensatory Leave Request", app: "hrms", slug: "compensatory_leave_request" }, { doctype: "Holiday List", app: "erpnext", slug: "holiday_list" }],
};
for (const [k, list] of [...Object.entries(V8_MAP), ...Object.entries(R9_MAP), ...Object.entries(R10_MAP)]) (ADD[k] ??= []).push(...list.map((doctype) => ({ doctype, app: "hrms", slug: doctype.toLowerCase().replace(/ /g, "_") })));
for (const [k, list] of Object.entries(R10_NATIVE_PLACEMENT)) (ADD[k] ??= []).push(...list);
for (const [k, v] of Object.entries(ADD)) { const cur = (MAP[k] ??= []); for (const t of v) if (!cur.some((c) => c.doctype === t.doctype)) cur.push(t); }
export default MAP;
export const HR_SLUGS = new Set(Object.values(MAP).flat().map((t) => `${t.app}/${t.slug}`));
