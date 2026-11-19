/**
 * Owner test list → app equivalences (pure data). A spec field that this app already stores under another name in
 * the same DocType is checked on that field and never added twice (adding it would split one value over two fields).
 * "@standard" names a Frappe standard column every record has (owner, creation, parent). Used by the schema generator
 * (scripts/construction-spec-schema.ts) and the documents & fields suite (testlist/fields.test.ts).
 */
export const STANDARD_FIELDS = new Set(["owner", "creation", "modified", "modified_by", "parent", "name", "docstatus", "idx"]);

/** spec child DocType → existing child DocType of the same parent */
export const CHILD_ALIASES: Record<string, string> = {
  "Digit Checklist Template Item": "Digit Checklist Item",
};

/** DocType → spec fieldname → existing fieldname (same meaning, same kind of value) */
export const FIELD_ALIASES: Record<string, Record<string, string>> = {
  "Digit Addendum Item Change": { change: "change_type" },
  "Digit Baseline Task": { start: "baseline_start", finish: "baseline_end", duration: "duration_days" },
  "Digit Back Charge": { deducted_in: "deducted_in_bill" },
  "Digit Assembly Component": { resource_components: "parent" },
  "Digit Change Event": { origin_type: "source_type", client_contract: "contract", linked_variation: "associated_variation" },
  "Digit Checklist Template": { title: "template_name" },
  "Digit Checklist Item": { item: "description" },
  "Digit Client Contract": { contract_reference: "reference", approved_changes: "approved_variations", retention_percent: "retention_pct" },
  "Digit Client Variation": { client_contract: "contract" },
  "Digit Commercial Claim": { claimed_days: "time_claimed_days", variation: "associated_variation" },
  "Digit Cost Code": { parent_code: "parent_cost_code", title_en: "description", cost_category: "category" },
  "Digit Crew Member": { crew: "parent", members: "parent" },
  "Purchase Receipt Item": { accepted_qty: "qty", accepted_value: "amount", purchase_receipt: "parent" },
  "Purchase Receipt": { purchase_receipt: "name" },
  "Digit Defect": { photos_before: "before_photo", photos_after: "after_photo", assigned_user: "assigned_to", owner: "owner" },
  "Digit EOT Delay Event": { from_date: "start_date", to_date: "end_date", cause: "delay_category", concurrent: "concurrent_with_prev", days: "days_affected" },
  "Digit EOT": { new_completion: "revised_completion_date" },
  "Digit Drawing Revision": { revision: "revision_code", file: "attachment" },
  "Digit Drawing": { revision_code: "current_revision" },
  "Digit Field Task": { assignee: "assigned_to" },
  "Digit Inspection Line": { item: "description", photo: "evidence" },
  "Digit Handover Requirement": { category: "requirement_type", document: "file_attachment" },
  "Digit Inspection": { template: "checklist_template", score_pct: "score" },
  "Digit Lookahead Row": { done: "completed" },
  "Digit Punch Item": { assignee: "assigned_to", closed_by: "closer", location_code: "location" },
  "Digit RFI": { title: "subject", creation_date: "creation" },
  "Digit Schedule Baseline": { baseline: "based_on_revision" },
  "Digit Subcontract Change Line": { old_qty: "current_qty", new_qty: "revised_qty", amount_change: "amount_delta" },
  "Digit Subcontract Change": { total_change: "total_delta" },
  "Digit Subcontract Final Account": { original_value: "total_wo_value", back_charges: "back_charges_total", final_value: "final_amount", certified_to_date: "total_billed", balance_due: "outstanding_balance" },
  "Digit Subcontract Work Order": { supplier: "subcontractor", order_date: "wo_date", gross_amount: "total_value" },
  "Digit Submittal": { purchase_order: "linked_purchase_order" },
  "Digit Takeoff Sheet": { revision: "drawing_revision" },
  "Digit Tender": { gng_by: "gng_decision_by", gng_note: "gng_decision_note" },
  "Digit Tender Addendum": { file: "file_attachment" },
  "Digit Transmittal Item": { revision: "transmitted_revision" },
  "Digit Portfolio Scenario": { scenario_name: "title" },
};

/** Select values the spec writes differently from the stored option (same meaning) */
export const OPTION_SYNONYMS: Record<string, string> = {
  "Re-measured": "Re-measurement", "No-Go": "No Go", "As-built": "As-Built", Labor: "Labour", Material: "Materials",
  ARCH: "Architecture", STR: "Structure", CIV: "Civil", Drawing: "Digit Drawing", Submittal: "Digit Submittal",
};
/** OPTION_SYNONYMS apply only where the stored options use the long form (Material stays Material elsewhere) */
export const synonymFor = (o: string, have: string[]) => (have.includes(o) ? o : OPTION_SYNONYMS[o] && have.includes(OPTION_SYNONYMS[o]!) ? OPTION_SYNONYMS[o]! : o);

/** Link fields the spec lists without a target: target by fieldname */
export const LINK_GUESS: Record<string, string> = {
  project: "Project", company: "Company", supplier: "Supplier", customer: "Customer", employee: "Employee", item: "Item", item_code: "Item",
  warehouse: "Warehouse", task: "Task", work_package: "Digit Work Package", submittal_ref: "Digit Submittal", linked_variation: "Digit Client Variation",
  client_contract: "Digit Client Contract", contract: "Digit Client Contract", equipment: "Digit Machinery", contractor_supplier: "Supplier", sales_invoice: "Sales Invoice",
  purchase_order: "Purchase Order", purchase_receipt: "Purchase Receipt", uom: "UOM", quality_inspection: "Quality Inspection", tender: "Digit Tender",
  owner_user: "User", reviewer: "User", reviewed_by: "User", inspector: "User", assignee: "User", witness_user: "User", created_by: "User", closed_by: "User",
  assigned_user: "User", project_manager: "User", drawing_revision: "Digit Drawing", supersedes_revision: "Digit Drawing",
};

/** Table fields the spec lists without a child DocType: the child built for them */
export const TABLE_CHILD: Record<string, string> = {
  resource_components: "Digit Resource Component", blockers: "Digit Lookahead Blocker", lines: "Digit Change RFQ Line", precautions: "Digit Permit Precaution",
  invoice_allocations: "Digit Invoice Allocation", attachments: "Digit Submittal Attachment", technical_defects: "Digit Defect Link",
};

/** Select fields the spec lists without values: the values used (owner may extend) */
export const SELECT_FALLBACK: Record<string, string[]> = {
  execution_stage: ["", "Planning", "Mobilisation", "Execution", "Testing & Commissioning", "Handover", "Closeout"],
  discipline: ["", "Architecture", "Structure", "MEP", "Civil", "Landscape", "Other"], trade: ["", "Civil", "Structural", "MEP", "Finishing", "Landscaping", "Steel", "Other"],
  period_unit: ["Month", "Quarter", "Year"], miss_reason: ["", "Material", "Drawing", "RFI", "Equipment", "Permit", "Labour", "Weather", "Other"],
  vat_basis: ["Standard 15%", "Zero Rated", "Exempt", "Out of Scope"], revenue_rule: ["Certified", "Percent Complete", "Milestone", "Start/Finish"],
  earned_value_basis: ["Physical Progress", "Cost-to-Cost", "Certified Quantity"], allocation_basis: ["Percent", "Amount", "Quantity"],
  inspection_result: ["", "Pass", "Fail", "Partial"], measurement_method: ["Linear", "Area", "Volume", "Count", "Weight"], classification: ["", "Uniclass", "MasterFormat", "UniFormat", "Other"],
  gate_condition: ["", "Inspection Passed", "Hold Point Released", "Approval Received"], payment_mode: ["", "Bank Transfer", "Cheque", "Cash"],
  posted_unposted_status: ["Unposted", "Posted", "Reversed"], approval_role: ["", "Digit Project Manager", "Digit Accountant", "Digit Director"],
  earning_method: ["Certified", "Percent Complete", "Start/Finish"], package_type: ["", "As-built", "O&M Manual", "Warranty", "Test Certificates", "Full Handover"],
  revision_policy: ["Latest Revision", "All Revisions"], stage: ["", "ROM", "Pricing", "Negotiation", "Approved"], change_reason: ["", "Client Instruction", "Design Change", "Site Condition", "Value Engineering", "Other"],
  scope: ["", "In Scope", "Out of Scope", "Disputed"], schedule_impact: ["", "Not Determined", "Yes", "No"], drawing_status: ["", "For Information", "For Construction", "Superseded", "Void"],
  final_outcome: ["", "Approved", "Approved as Noted", "Revise & Resubmit", "Rejected"], asset_type: ["", "Equipment", "System", "Component"], system: ["", "Electrical", "HVAC", "Fire", "Plumbing", "Lifts", "BMS"],
  compliance_status: ["", "Compliant", "Expiring", "Non-compliant"], priority: ["Medium", "High", "Low"], status: ["Draft", "Open", "Closed"], workflow_state: ["Draft", "Submitted", "Approved", "Rejected"],
  digit_trade: ["", "Civil", "Structural", "MEP", "Finishing", "Landscaping", "Steel", "Other"], submittal_type: ["", "Shop Drawing", "Material", "Method Statement", "Sample", "Other"],
  final_response: ["", "Approved", "Approved as Noted", "Revise & Resubmit", "Rejected"],
};

type Col = { fieldname: string; label: string; label_ar: string; fieldtype: string; options?: string; in_list_view?: number; reqd?: number; read_only?: number };
const col = (fieldname: string, label: string, label_ar: string, fieldtype: string, options?: string, x: Partial<Col> = {}): Col => ({ fieldname, label, label_ar, fieldtype, ...(options ? { options } : {}), in_list_view: 1, ...x });
/** Columns of the child tables built for spec Table fields that name no child DocType */
export const CHILD_COLUMNS: Record<string, Col[]> = {
  "Digit Change RFQ Line": [col("line_key", "Line Key", "مفتاح البند", "Data"), col("description", "Description", "الوصف", "Data", undefined, { reqd: 1 }), col("qty", "Quantity", "الكمية", "Float"), col("unit_cost", "Unit Cost", "تكلفة الوحدة", "Currency"), col("quoted_amount", "Quoted Amount", "المبلغ المعروض", "Currency")],
  "Digit Permit Precaution": [col("precaution", "Precaution", "الاحتياط", "Data", undefined, { reqd: 1 }), col("checked", "Checked", "تم التحقق", "Check"), col("checked_by", "Checked By", "تحقق بواسطة", "Link", "User")],
  "Digit Invoice Allocation": [col("payment_entry", "Payment Entry", "سند الدفع", "Link", "Payment Entry"), col("allocated_amount", "Allocated Amount", "المبلغ المخصص", "Currency"), col("allocation_date", "Allocation Date", "تاريخ التخصيص", "Date")],
  "Digit Submittal Attachment": [col("description", "Description", "الوصف", "Data"), col("file", "File", "الملف", "Attach", undefined, { reqd: 1 }), col("revision", "Revision", "المراجعة", "Data")],
  "Digit Lookahead Blocker": [col("blocker", "Blocker", "المعوق", "Data", undefined, { reqd: 1 }), col("constraint_type", "Constraint", "القيد", "Select", "\nMaterial\nDrawing\nRFI\nEquipment\nPermit\nLabour\nOther"), col("responsible", "Responsible", "المسؤول", "Link", "User"), col("due_date", "Due", "الموعد", "Date"), col("resolved", "Resolved", "تمت المعالجة", "Check")],
  "Digit Resource Component": [col("resource_type", "Resource Type", "نوع المورد", "Select", "Labour\nEquipment\nMaterial\nSubcontract"), col("description", "Description", "الوصف", "Data"), col("uom", "UOM", "الوحدة", "Link", "UOM"), col("qty", "Quantity", "الكمية", "Float"), col("rate", "Rate", "السعر", "Currency"), col("amount", "Amount", "المبلغ", "Currency", undefined, { read_only: 1 })],
  "Digit Defect Link": [col("defect", "Defect", "العيب", "Link", "Digit Defect"), col("description", "Description", "الوصف", "Data")],
};

/** Lossless type corrections of existing fields so they match the spec (no stored value changes meaning) */
export const FIELD_PROPS: Record<string, Record<string, Record<string, unknown>>> = {
  "Digit Schedule Baseline": { captured_on: { fieldtype: "Datetime" } },
  "Digit Submittal Review Step": { step: { fieldtype: "Int" } },
  // the Go / No-Go decider and rationale: a user link, and the rationale becomes mandatory once a decision is taken
  "Digit Tender": { source_channel: { fieldtype: "Select", options: "\nEtimad\nDirect Invitation\nPrivate\nOther" }, gng_decision_by: { fieldtype: "Link", options: "User" }, gng_decision_note: { mandatory_depends_on: "eval:doc.gng_decision && doc.gng_decision != 'Pending'" } },
  "Digit Tender Criterion": { criterion: { fieldtype: "Select", options: "\nCapability\nCapacity\nExpected Margin\nRisk\nClient Relationship\nCash Requirement\nCompetition" }, weight_pct: { fieldtype: "Percent" } },
  "Digit Forecast Line": { cost_code: { fieldtype: "Link", options: "Digit Cost Code" } },
  // spec mandatory flags on existing fields (no demo record leaves them empty)
  "Digit Drawing Revision": { attachment: { reqd: 1 } },
  "Digit Punch Item": { evidence: { mandatory_depends_on: "eval:doc.status=='Closed'" } },
  "Digit Risk": { change_event: { options: "Digit Change Event" }, owner_user: { reqd: 1 } },
};

/** spec type → stored type pairs that hold the same value (stored type is the narrower, constrained form) */
export const COMPATIBLE_TYPES: [string, string, string][] = [
  ["Data", "Select", "stored as a Select of the listed values (constrained text)"], ["Small Text", "Select", "stored as a Select of the listed values (constrained text)"],
  ["Data", "Link", "stored as a Link (text that must name an existing record)"], ["Dynamic Link", "Link", "stored as a Link to the one DocType it can reference"],
  ["Attach", "Table", "stored as a table of attachment rows (several files)"],
];

/** Rows whose spec cannot be met on the platform as written: result, exact reason and the owner of the next action */
export const DEVIATIONS: Record<string, { result: "BLOCKED" | "NOT_TESTABLE"; reason: string; owner: string }> = {};
