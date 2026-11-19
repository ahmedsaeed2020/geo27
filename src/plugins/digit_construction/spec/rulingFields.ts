/**
 * Fields the owner policy rulings P1–P9 (W0-02, 29 Oct 2026) need on existing documents. Pure data merged by schema.ts
 * after the specification fields (appended at the end of the DocType; never replacing an existing field).
 */
type F = { fieldname: string; label: string; label_ar: string; fieldtype: string; options?: string; read_only?: number; depends_on?: string; description?: string };
export const RULING_FIELDS: Record<string, F[]> = {
  // department 06: DEC-156 pay-item links, F06-07-1 allocation splits (cost code + remainder), DEC-150 forecast reason code
  "Digit Cost Code": [{ fieldname: "project", label: "Project (project-specific code)", label_ar: "المشروع (رمز خاص بالمشروع)", fieldtype: "Link", options: "Project", description: "DEC-154: blank = company-wide code; set = usable only on this project" }],
  "Digit Project Cost Budget": [
    { fieldname: "sb_pay_items", label: "Pay Item Links", label_ar: "ربط بنود العقد", fieldtype: "Section Break" },
    { fieldname: "pay_item_links", label: "Pay Item Links", label_ar: "ربط بنود العقد", fieldtype: "Table", options: "Digit Pay Item Link", description: "DEC-156: each contract pay item (SOV line) linked to budget lines by share; a budget line is linked at most 100%" }],
  "Digit Allocation Split": [{ fieldname: "cost_code", label: "Cost Code", label_ar: "رمز التكلفة", fieldtype: "Data", read_only: 1 }],
  "Digit Cost Allocation": [{ fieldname: "split_remainder", label: "Not Yet Split", label_ar: "المتبقي دون توزيع", fieldtype: "Currency", read_only: 1, description: "DEC-123: the source amount not yet split; it must be 0 (100%) to submit" }],
  "Digit Forecast Line": [{ fieldname: "reason_code", label: "Change Reason", label_ar: "سبب التغيير", fieldtype: "Select", options: "\nScope Change\nPrice\nProductivity\nRisk\nCorrection", description: "DEC-150: why this line's forecast moved" }],
  // department 05: DEC-071 payment terms, DEC-068 delay penalty (daily rate + cap, 10 % when blank)
  "Digit Subcontract Work Order": [
    { fieldname: "payment_terms_template", label: "Payment Terms Template", label_ar: "قالب شروط الدفع", fieldtype: "Link", options: "Payment Terms Template", description: "DEC-071: approved bills get an expected payment date and the Purchase Invoice its due date from this template" },
    { fieldname: "delay_penalty_rate", label: "Delay Penalty per Day (%)", label_ar: "غرامة التأخير اليومية (%)", fieldtype: "Percent", description: "DEC-068: percent of the work order value per day of delay" },
    { fieldname: "delay_penalty_cap", label: "Delay Penalty Cap (%)", label_ar: "سقف غرامة التأخير (%)", fieldtype: "Percent", description: "DEC-068: maximum penalty as a percent of the work order value (blank = 10%)" }],
  // F05-07-1 balance to finish, DEC-071 expected payment date
  "Digit Subcontractor Bill": [
    { fieldname: "balance_to_finish", label: "Balance to Finish", label_ar: "المتبقي للإنجاز", fieldtype: "Currency", read_only: 1, description: "Work order value − billed to date" },
    { fieldname: "expected_payment_date", label: "Expected Payment Date", label_ar: "تاريخ الدفع المتوقع", fieldtype: "Date", read_only: 1, description: "DEC-071: bill date + the credit days of the work order's payment terms" }],
  // DEC-069: evidence per measurement entry, accepted by the QS
  "Digit Measurement Entry": [
    { fieldname: "evidence_status", label: "Evidence", label_ar: "حالة الدليل", fieldtype: "Select", options: "\nPending\nAccepted\nRejected" },
    { fieldname: "evidence_file", label: "Evidence File", label_ar: "ملف الدليل", fieldtype: "Attach" },
    { fieldname: "evidence_by", label: "Evidence Accepted By", label_ar: "قبل الدليل", fieldtype: "Data", read_only: 1 }],
  // P6: the Director's override of an expired rate is recorded on the estimate
  "Digit Estimate Version": [{ fieldname: "expired_rate_reason", label: "Expired Rate Override Reason", label_ar: "سبب تجاوز الأسعار المنتهية", fieldtype: "Small Text", description: "Policy P6: required when an assembly rate in this estimate is expired; only the Digit Director approves." }],
  // P4: who marked a closeout row Not Applicable, and why (a different Director approves it)
  "Digit Closeout Assessment Row": [
    { fieldname: "na_marked_by", label: "Marked N/A By", label_ar: "حدّد عدم الانطباق", fieldtype: "Data", read_only: 1, depends_on: "eval:doc.status=='Not Applicable'" },
    { fieldname: "na_reason", label: "N/A Reason", label_ar: "سبب عدم الانطباق", fieldtype: "Small Text", depends_on: "eval:doc.status=='Not Applicable'" },
  ],
  // P5: the absolute cap on a matching variance (Finance value; blank = no cap)
  "Digit Construction Settings": [
    // research questions (owner work list Q*): documented best practice as changeable settings; blank = the stated fallback
    { fieldname: "approval_sla_days", label: "Approval Service Level (days)", label_ar: "مستوى خدمة الاعتماد (أيام)", fieldtype: "Int", description: "Days an approval may wait before it counts as over the service level (blank = 3)" },
    { fieldname: "slow_moving_days", label: "Slow-Moving Material Period (days)", label_ar: "فترة ركود المواد (أيام)", fieldtype: "Int", description: "Days without movement after which stock on hand counts as slow-moving (blank = 90)" },
    { fieldname: "machine_available_hours", label: "Machine Available Hours per Day", label_ar: "ساعات المعدة المتاحة يوميًا", fieldtype: "Float", description: "Working hours a machine is available per logged day, for utilisation (blank = 8)" },
    // ENT-NEED-18 (owner ruling): supplier score weights; all blank = equal weights
    { fieldname: "score_weight_on_time", label: "Supplier Score Weight — On Time", label_ar: "وزن تقييم المورد — التوريد في الموعد", fieldtype: "Float", description: "Relative weight of on-time delivery in the supplier score (all weights blank = equal weights)" },
    { fieldname: "score_weight_quality", label: "Supplier Score Weight — Quality", label_ar: "وزن تقييم المورد — الجودة", fieldtype: "Float", description: "Relative weight of accepted quantity (100 − rejected %) in the supplier score (all weights blank = equal weights)" },
    { fieldname: "score_weight_price", label: "Supplier Score Weight — Price", label_ar: "وزن تقييم المورد — السعر", fieldtype: "Float", description: "Relative weight of price accuracy (100 − |price variance %|) in the supplier score (all weights blank = equal weights)" },
    { fieldname: "award_saving_basis", label: "Award Saving Basis", label_ar: "أساس وفر الترسية", fieldtype: "Select", options: "\nAverage bid\nSecond lowest bid\nBudget", description: "What the awarded bid is compared with (blank = Average bid)" },
    { fieldname: "delivery_grace_days", label: "Delivery Grace Days", label_ar: "أيام السماح للتوريد", fieldtype: "Int", description: "DEC-152: one company-wide number of days after the schedule date a delivery still counts as on time (blank = 0)" },
    { fieldname: "match_abs_cap", label: "Matching Variance Cap", label_ar: "سقف مبلغ فرق المطابقة", fieldtype: "Currency", description: "Policy P5 (Finance value): a matching variance above this amount is beyond tolerance. Blank = no amount cap." },
    // DEC-035 / F03-14-1 / DEC-038: estimating thresholds (blank = default 60 % Go threshold, no margin floor, plain BOQ differences)
    { fieldname: "gng_threshold_pct", label: "Go / No-Go Threshold (%)", label_ar: "حد قرار التقدم (%)", fieldtype: "Percent", description: "DEC-035: a Go decision below this score needs a justification (blank = 60%)" },
    { fieldname: "min_margin_pct", label: "Minimum Estimate Margin (%)", label_ar: "الحد الأدنى لهامش التقدير (%)", fieldtype: "Percent", description: "F03-14-1: an estimate below this margin is not approved (blank = no floor)" },
    { fieldname: "boq_flag_pct", label: "BOQ Difference Flag (%)", label_ar: "حد تمييز فرق جدول الكميات (%)", fieldtype: "Percent", description: "DEC-038: flag a BOQ line above this percent of its estimate or the amount below, whichever is lower" },
    { fieldname: "boq_flag_amount", label: "BOQ Difference Flag (amount)", label_ar: "حد تمييز فرق جدول الكميات (مبلغ)", fieldtype: "Currency", description: "DEC-038: absolute difference that flags a BOQ line against its estimate" }],
  // P2: the native Sales Invoice draft that bills the released retention
  "Digit Retention Release Request": [{ fieldname: "sales_invoice", label: "Sales Invoice", label_ar: "فاتورة المبيعات", fieldtype: "Link", options: "Sales Invoice", read_only: 1 }],
  // DEC-032: a site diary is unique per project, date and shift
  "Digit Site Activity Report": [{ fieldname: "shift", label: "Shift", label_ar: "الوردية", fieldtype: "Data", description: "DEC-032: one site report per project, date and shift" }],
  // F02-10-1: the next step's due date = the day it becomes current + its duration
  "Digit Review Step": [{ fieldname: "duration_days", label: "Duration (days)", label_ar: "المدة (أيام)", fieldtype: "Int" }],
  // K02-09: average days from detection to closing reads the closing date stamped by the Close action
  // F03-05-1: imported takeoff rows keep the model element id for revision comparison
  "Digit Takeoff Dimension": [{ fieldname: "element_id", label: "Element ID", label_ar: "معرّف العنصر", fieldtype: "Data" }],
  // DEC-034: bids are leveled without tax in the base currency at the recorded exchange rate
  "Digit Subcontract Bid": [
    { fieldname: "currency", label: "Currency", label_ar: "العملة", fieldtype: "Link", options: "Currency" },
    { fieldname: "conversion_rate", label: "Exchange Rate", label_ar: "سعر الصرف", fieldtype: "Float", description: "DEC-034: base currency per bid currency unit, as of the date below (blank = 1)" },
    { fieldname: "fx_as_of", label: "Exchange Rate As Of", label_ar: "تاريخ سعر الصرف", fieldtype: "Date" },
    { fieldname: "tax_included", label: "Prices Include Tax", label_ar: "الأسعار شاملة الضريبة", fieldtype: "Check" },
    { fieldname: "tax_rate", label: "Tax Rate", label_ar: "نسبة الضريبة", fieldtype: "Percent", depends_on: "eval:doc.tax_included" },
    { fieldname: "base_total", label: "Total (base currency, excl. tax)", label_ar: "الإجمالي بعملة الأساس دون ضريبة", fieldtype: "Currency", read_only: 1 },
  ],
  // F03-13-2: a drawdown from the contingency line names its risk or change event; the balance after is shown
  "Digit Budget Transfer": [
    { fieldname: "risk", label: "Risk", label_ar: "المخاطرة", fieldtype: "Link", options: "Digit Risk" },
    { fieldname: "change_event", label: "Change Event", label_ar: "حدث التغيير", fieldtype: "Link", options: "Digit Change Event" },
    { fieldname: "contingency_balance", label: "Contingency Balance After", label_ar: "رصيد الاحتياطي بعد التحويل", fieldtype: "Currency", read_only: 1 },
  ],
  "Digit Defect": [{ fieldname: "closed_on", label: "Closed On", label_ar: "تاريخ الإغلاق", fieldtype: "Date", read_only: 1 }],
  // F04-07-1 / DEC-051: the pricing request's issue date (the due date is 7 working days later, Sunday–Thursday)
  "Digit Change RFQ": [{ fieldname: "issued_on", label: "Issued On", label_ar: "تاريخ الإصدار", fieldtype: "Date", description: "Set when the request goes out for pricing; the due date follows 7 working days later (Sunday–Thursday, company holidays skipped)" }],
  // DEC-055: a terms revision may take effect on a future date
  "Digit Contract Terms Revision": [
    { fieldname: "effective_date", label: "Effective Date", label_ar: "تاريخ السريان", fieldtype: "Date", description: "DEC-055: blank = from the decision; a future date applies the approved value from that date" },
    { fieldname: "applied", label: "Applied", label_ar: "مُطبّق", fieldtype: "Check", read_only: 1 },
  ],
  // DEC-054: whether this contract pays for materials stored on site
  "Digit Client Contract": [{ fieldname: "claims_stored_materials", label: "Claims Stored Materials", label_ar: "يطالب بالمواد المخزنة", fieldtype: "Check", description: "DEC-054: stored materials on a claim line need a submitted goods receipt and cannot exceed its value" }],
  // F04-13-1: stored materials are backed by a goods receipt
  "Digit Claim Line": [{ fieldname: "material_receipt", label: "Goods Receipt", label_ar: "سند الاستلام", fieldtype: "Link", options: "Purchase Receipt" }],
};
/** Select values the rulings add (P8 safety record on the compliance documents). */
export const RULING_OPTIONS: Record<string, Record<string, string[]>> = {
  "Digit Compliance Document": { doc_type: ["Safety"] },
  // F01-05-3 (catalog): an impacted risk raises a draft change event whose origin is the risk
  "Digit Change Event": { origin_type: ["Risk"] },
};
export const RULING_AR: Record<string, string> = { Safety: "السلامة", Risk: "مخاطرة", "Average bid": "متوسط العروض", "Second lowest bid": "ثاني أقل عرض", Budget: "الموازنة" };
