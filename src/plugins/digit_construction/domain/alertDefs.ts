/**
 * Construction alerts NTF-01 … NTF-07 (owner list sheet 6), declared as native Notification records: exported to the
 * Frappe app as Notification fixtures (Value Change / Days Before run natively there) and run in the preview by
 * domain/alerts.ts. Conditions use the shared expression grammar; the export turns && / || into Python and / or.
 */
import type { Notification } from "../../types";

const DIR = "Digit Director", PM = "Digit Project Manager", SE = "Digit Site Engineer", PROC = "Digit Procurement Officer";
export const CONSTRUCTION_ALERTS: Notification[] = [
  // NTF-01 a scenario sent for approval → the Director
  { name: "Construction Scenario Submitted", document_type: "Digit Portfolio Scenario", event: "Value Change", value_changed: "workflow_state", condition: "doc.workflow_state == 'Submitted'",
    subject: "Scenario {title} is waiting for your approval", subject_ar: "سيناريو {title} بانتظار اعتمادك", message: "Portfolio scenario {title} ({name}) was submitted for approval.", recipients: [{ receiver_by_role: DIR }] },
  // NTF-02 approved / rejected → the project manager
  { name: "Construction Scenario Approved", document_type: "Digit Portfolio Scenario", event: "Value Change", value_changed: "workflow_state", condition: "doc.workflow_state == 'Shared'",
    subject: "Scenario {title} was approved", subject_ar: "تم اعتماد سيناريو {title}", message: "Portfolio scenario {title} ({name}) was approved and shared.", recipients: [{ receiver_by_role: PM }] },
  { name: "Construction Scenario Rejected", document_type: "Digit Portfolio Scenario", event: "Value Change", value_changed: "workflow_state", condition: "doc.workflow_state == 'Rejected'",
    subject: "Scenario {title} was rejected", subject_ar: "تم رفض سيناريو {title}", message: "Portfolio scenario {title} ({name}) was rejected.", recipients: [{ receiver_by_role: PM }] },
  // NTF-03 risk review date within 7 days → the project manager
  { name: "Construction Risk Review Due", document_type: "Digit Risk", event: "Days Before", date_changed: "due_date", days_in_advance: 7, condition: "doc.workflow_state != 'Rejected' && doc.workflow_state != 'Managed'",
    subject: "Review risk {title}", subject_ar: "راجع المخاطرة {title}", message: "The review date of risk {title} ({name}) is {due_date}.", recipients: [{ receiver_by_role: PM }] },
  // NTF-04 risk score ≥ 15 → the Director
  { name: "Construction High Risk", document_type: "Digit Risk", event: "Value Change", value_changed: "risk_score", condition: "doc.risk_score >= 15",
    subject: "High risk on {project}", subject_ar: "مخاطرة عالية في {project}", message: "Risk {title} ({name}) scores {risk_score}.", recipients: [{ receiver_by_role: DIR }] },
  // NTF-05 submittal submit-by date in 3 days → the site engineer
  { name: "Construction Submittal Due", document_type: "Digit Submittal", event: "Days Before", date_changed: "submit_by", days_in_advance: 3, condition: "doc.workflow_state == 'Draft'",
    subject: "Submittal {title} is due for submission", subject_ar: "اقترب موعد تقديم {title}", message: "Submittal {title} ({name}) must be submitted by {submit_by}.", recipients: [{ receiver_by_role: SE }] },
  // NTF-06 review decision C / D → the site engineer
  { name: "Construction Submittal Returned", document_type: "Digit Submittal", event: "Value Change", value_changed: "decision_code",
    condition: "doc.decision_code == 'C' || doc.decision_code == 'D' || doc.decision_code == 'C Revise & Resubmit' || doc.decision_code == 'D Rejected'",
    subject: "{title} was returned with code {decision_code}", subject_ar: "أعيد {title} بكود {decision_code}", message: "Submittal {title} ({name}) was returned with decision {decision_code}.", recipients: [{ receiver_by_role: SE }] },
  // NTF-07 subcontractor insurance expiring within 30 days → procurement
  { name: "Construction Insurance Expiry", document_type: "Digit Subcontractor Profile", event: "Days Before", date_changed: "insurance_expiry", days_in_advance: 30,
    subject: "Insurance of {supplier} expires on {insurance_expiry}", subject_ar: "تأمين {supplier} ينتهي في {insurance_expiry}", message: "The insurance of subcontractor {supplier} ({name}) expires on {insurance_expiry}.", recipients: [{ receiver_by_role: PROC }] },
];
