/**
 * R4-J crosswalk: one disposition for every ID of the owner's 95-screen / 164-document / 55-report / 73-KPI contract
 * (index: docs/digit-app-builder/construction/reference/contract_index.json, extracted by
 * scripts/construction-contract-index.py). Pure data — no runtime imports — so the generator
 * (scripts/construction-crosswalk.ts → CROSSWALK_95.md) and crosswalk.test.ts read the same table, and every ref is
 * checked to resolve to a real page, DocType, report, field or read-model export.
 *
 * Where two contract IDs describe the same screen / document / report (the research merged several source sets),
 * one is canonical and the other is MERGED into it, so nothing is counted twice and nothing is dropped. When a
 * PRODUCT_SPEC_54 name and a department-file name disagree for one ID, the PRODUCT_SPEC_54 meaning is used and the
 * other meaning is covered by the ID that owns it (noted).
 *
 * Ref syntax: page:<manifest page path> · list:<DocType> · form:<DocType> · report:<app report> ·
 * native-report:<catalog report> · field:<DocType>.<fieldname> · fn:<module under the app>#<export> · id:<contract ID>.
 */
export type Disposition = "BUILT" | "NATIVE" | "READ_MODEL" | "PARTIAL" | "POLICY_GATED" | "OWNER_DECISION" | "SERVER_ONLY" | "QA_CONTRACT" | "MERGED";
export interface Entry {
  d: Disposition; refs: string[]; note?: string; ev?: string; /** PARTIAL only: the gap needs no owner input (next build item) */ buildable?: boolean;
  /** Owner Decision Matrix IDs (ownerDecisions.ts) the open part of this item waits on, or that refine a built item */
  dec?: string[];
  /** the remaining gap is a Core (frozen platform) defect, not app work — names the decision that authorizes the fix */
  core?: string;
}
/**
 * Run 6 status classes (owner goal §3): every contract ID is implemented, partially implemented, owner-policy-blocked,
 * Core-dependent or Frappe-server-dependent. MERGED IDs take the class of the canonical ID they point at.
 */
export type StatusClass = "IMPLEMENTED" | "PARTIAL" | "OWNER_POLICY_BLOCKED" | "CORE_DEPENDENT" | "FRAPPE_SERVER_DEPENDENT";
export const STATUS_CLASSES: Record<StatusClass, string> = {
  IMPLEMENTED: "Implemented and tested in the Virtual Core (built, native reuse, read model or acceptance contract)",
  PARTIAL: "Partially implemented — the stated remainder waits on the named owner decision",
  OWNER_POLICY_BLOCKED: "Owner-policy-blocked — built up to the final action, or not built until the owner decides",
  CORE_DEPENDENT: "Core-dependent — works in the app; the remaining defect is in the frozen Core",
  FRAPPE_SERVER_DEPENDENT: "DIGIT-server-dependent — needs an authorized DIGIT staging server",
};
export function statusClass(e: Entry): StatusClass | "MERGED" {
  if (e.d === "MERGED") return "MERGED";
  if (e.core) return "CORE_DEPENDENT";
  if (e.d === "PARTIAL") return "PARTIAL";
  if (e.d === "POLICY_GATED" || e.d === "OWNER_DECISION") return "OWNER_POLICY_BLOCKED";
  if (e.d === "SERVER_ONLY") return "FRAPPE_SERVER_DEPENDENT";
  return "IMPLEMENTED";
}
export const DISPOSITIONS: Record<Disposition, { en: string; ar: string }> = {
  BUILT: { en: "Built in the app and tested", ar: "مبني في التطبيق ومختبر" },
  NATIVE: { en: "Native document / report reused (no clone)", ar: "مستند أو تقرير أصلي مُعاد استخدامه" },
  READ_MODEL: { en: "Computed at render time from source records", ar: "محسوب عند العرض من السجلات المصدر" },
  PARTIAL: { en: "Built with a stated gap", ar: "مبني مع فجوة موضحة" },
  POLICY_GATED: { en: "Built; the final action waits on an owner policy", ar: "مبني؛ الإجراء النهائي ينتظر سياسة المالك" },
  OWNER_DECISION: { en: "Not built — needs an owner scope or rule decision", ar: "غير مبني — يحتاج قرار المالك" },
  SERVER_ONLY: { en: "Needs the DIGIT server (staging not authorized)", ar: "يحتاج خادم DIGIT" },
  QA_CONTRACT: { en: "Cross-cutting acceptance contract met by tests", ar: "عقد قبول شامل تحققه الاختبارات" },
  MERGED: { en: "Same as another contract ID", ar: "مطابق لمعرّف آخر" },
};
const E = (d: Disposition, refs: string[], note?: string, ev?: string): Entry => ({ d, refs, ...(note ? { note } : {}), ...(ev ? { ev } : {}) });
/** attach Owner Decision Matrix IDs */
const W = (e: Entry, ...dec: string[]): Entry => ({ ...e, dec });
/** the remaining gap is a Core defect (decision ID authorizes the Core fix) */
const CORE = (e: Entry, decision: string, why: string): Entry => ({ ...e, dec: [decision], core: why });
const M = (id: string, note?: string): Entry => E("MERGED", [`id:${id}`], note);
/** PARTIAL whose gap needs an owner scope / rule decision */
const P = (refs: string[], note: string, ev?: string): Entry => E("PARTIAL", refs, note, ev);
/** PARTIAL whose gap is buildable without owner input */
const PB = (refs: string[], note: string, ev?: string): Entry => ({ ...P(refs, note, ev), buildable: true });
const CRAWL = "BR-EN35 / BR-AR35 / BR-M11 route crawls";

// ---------------------------------------------------------------- 95 screens
export const SCREENS: Record<string, Entry> = {
  "ADM-01": W(E("BUILT", ["page:settings"], "Four verified settings editable; twelve proposed settings listed as gaps", "TC-CON-R4-54…58, BR-R4-ADMIN"), "OD-33"),
  "ADV-01": W(E("BUILT", ["page:fin/advances"], "Retention release request draft; approval gated by P2; subcontract retention release unavailable (R4-N)", "TC-CON-R4 cashAdv, BR-R4-CASH"), "P2", "OD-09"),
  "BOQ-01": E("BUILT", ["list:Digit BOQ"], undefined, CRAWL),
  "BOQ-02": E("BUILT", ["form:Digit BOQ", "page:estimating/version/:id"], "Line editing on the BOQ form; rate analysis on the estimate version", CRAWL),
  "BOQ-03": W(E("BUILT", ["page:estimating/boq-compare"], "New revision via native Duplicate / Amend; a 'new revision' button is UX decision B-13", "TC-CON-R3, BR-R3-BOQ"), "OD-39"),
  "BUD-01": E("BUILT", ["page:cost/sheet"], undefined, "TC-CON-26, BR-R2"),
  "BUD-02": E("BUILT", ["list:Digit Budget Revision", "list:Digit Budget Transfer"], undefined, CRAWL),
  "BUD-EXT-01": W(E("BUILT", ["page:wbs", "page:cost/verify", "list:Digit Cost Code"], "Cost-code master Digit Cost Code (company and project-specific codes; retired codes blocked on budgets and purchase orders) built in the owner test list department 06; codes stay on BOQ / budget / purchase rows and are verified per source", "BR-R3-WBS, testlist/d06.test.ts"), "OD-12"),
  "BUD-EXT-02": E("BUILT", ["page:cost/verify", "report:Project Cost Sources"], undefined, "TC-CON-R4 costVerify"),
  "BUD-EXT-03": E("BUILT", ["page:cost/verify", "report:Cost Source Exceptions"], undefined, "TC-CON-R4 costVerify"),
  "CLM-01": M("CON-05"),
  "CLM-02": M("CON-06"),
  "CLS-01": M("FIN-03"),
  "CLS-02": W(E("POLICY_GATED", ["list:Digit Final Account"], "Final-account approval waits on P1", "TC-CON-29"), "P1"),
  "CON-01": E("BUILT", ["list:Digit Client Contract"], undefined, CRAWL),
  "CON-02": E("BUILT", ["form:Digit Client Contract", "report:Client Contract Position"], "SOV lines on the contract; position report per line", CRAWL),
  "CON-03": W(P(["page:contracts/versions", "form:Digit Client Contract", "fn:domain/contractVersions#contractVersions", "fn:domain/services#requestTermsRevision"], "PRODUCT_SPEC_54 meaning (versions & effective terms): versions derived from the contract SOV and each approved client variation, the version and terms in effect on a date, version comparison, terms revisions requested by contract writers and decided by a director (prospective); a stored version document and future-effective dates wait on the owner. The department-file meaning (subcontract register) is SUB-03", "TC-CON-R6-17…21"), "OD-06"),
  "CON-04": E("BUILT", ["list:Digit Client Variation"], "PRODUCT_SPEC_54 meaning (client change orders)", "TC-CON-28"),
  "CON-05": E("BUILT", ["list:Digit Client Claim"], undefined, CRAWL),
  "CON-06": W(E("BUILT", ["list:Digit Client Certificate", "field:Sales Invoice.digit_client_certificate"], "Certificate → native Sales Invoice hand-off", CRAWL), "P9"),
  "CSH-01": W(E("BUILT", ["page:fin/cashflow"], undefined, "TC-CON-R4 cashAdv, BR-R4-CASH"), "OD-11", "OD-29"),
  "CST-01": M("BUD-EXT-01"),
  "CST-02": E("BUILT", ["list:Digit Project Cost Budget"], undefined, CRAWL),
  "CST-03": M("BUD-02"),
  "CST-04": M("BUD-EXT-02"),
  "CST-05": E("BUILT", ["list:Digit Cost Forecast Snapshot"], undefined, CRAWL),
  "CST-06": M("BUD-EXT-03"),
  "EQP-01": M("RSP-04"),
  "ET-01": E("BUILT", ["list:Digit Construction Rate", "list:Digit Assembly"], undefined, CRAWL),
  "ET-02": E("BUILT", ["list:Digit Tender"], undefined, CRAWL),
  "ET-03": E("BUILT", ["page:dept/:key"], "Estimating workspace (dept/et) with tender queue and review actions", CRAWL),
  "ET-04": W(E("BUILT", ["page:estimating/version/:id"], undefined, CRAWL), "P6"),
  "ET-05": E("BUILT", ["page:estimating/tender/:id/boq", "page:estimating/boq-compare"], undefined, CRAWL),
  "EXT-01": E("BUILT", ["list:Digit Estimate Template"], undefined, CRAWL),
  "EXT-02": CORE(E("NATIVE", ["list:Project"], "Core list / form tools (filters, saved filters, import / export, print, attachments, assignments) serve every app list", "BR-R3-NATIVE11"), "OD-41", "The native list toolbar overflows at 390 px (Core list, every app)"),
  "EXT-03": W(E("BUILT", ["page:outputs"], "Signer authority, classification and server PDF storage open (R4-P)", "TC-CON-R4-48…53, BR-R4-PRINT"), "OD-34", "OD-35", "OD-36", "OD-45"),
  "FCT-01": M("CST-05"),
  "FIN-01": E("BUILT", ["page:finance"], undefined, CRAWL),
  "FIN-02": E("BUILT", ["page:fin/advances", "report:Construction Receivables Aging", "report:Supplier Invoices Outstanding"], undefined, "BR-R4-CASH"),
  "FIN-03": W(E("POLICY_GATED", ["list:Digit Closeout Assessment", "report:Closeout Readiness"], "Not Applicable gates wait on P4; final account on P1", "TC-CON-30"), "P4", "P1"),
  "FIN-04": E("BUILT", ["page:reports", "page:reports/:report"], undefined, "TC-CON-R2"),
  "FIN-05": W(E("BUILT", ["page:metrics", "page:reports/:report"], "95-screen meaning (saved views & KPI definitions); sharing and KPI publish workflow wait on R4-O", "TC-CON-R4 FIN-05, BR-R4-VIEWS"), "OD-30", "OD-31"),
  "FIN-06": W(P(["page:governance", "page:settings", "fn:domain/governance#reportRegister", "fn:domain/governance#sourceAvailability", "fn:domain/governance#auditTrail"], "Report register with sources, read access, raw last-change, stored permission matrix, live check and governance audit trail built (read-only); freshness thresholds, field masking and export policy wait on OD-32", "TC-CON-R6-22…25"), "OD-32"),
  "HOME-01": E("BUILT", ["page:"], undefined, CRAWL),
  "HOME-02": W(E("BUILT", ["page:inbox"], undefined, "TC-CON-R4 inbox, BR-R4-INBOX"), "OD-27", "OD-28"),
  "LAB-01": M("RSP-03"),
  "MAT-01": E("BUILT", ["page:proc/materials"], undefined, "TC-CON-R4 procPlan, BR-R4-PROC"),
  "MEA-01": M("SUB-05"),
  "MGT-01": E("BUILT", ["page:portfolio"], undefined, CRAWL),
  "MGT-02": E("BUILT", ["page:projects", "form:Project"], undefined, "BR-PRJ"),
  "MGT-03": E("BUILT", ["page:hub"], undefined, CRAWL),
  "MGT-04": M("HOME-02", "Approvals live in the inbox; owner policy decisions at settings/policies"),
  "MGT-05": E("BUILT", ["page:inbox"], "Construction notifications and quick-create actions", "TC-CON-R4 inbox"),
  "PRJ-01": E("BUILT", ["page:projects"], undefined, CRAWL),
  "PRJ-02": E("BUILT", ["form:Project"], "Native Project form with the construction custom fields", "BR-PRJ"),
  "PRJ-03": E("BUILT", ["page:project/:id"], undefined, "BR-R2, BR-R3"),
  "PRJ-04": E("BUILT", ["page:wbs"], undefined, "BR-R3-WBS"),
  "PRJ-05": W(E("BUILT", ["page:project/:id", "list:Digit Task Dependency"], "PRODUCT_SPEC_54 meaning (tasks, schedule, dependencies): Project 360 schedule tab; the team meaning is PRJ-TEAM-EXT", "BR-SCHED"), "OD-20"),
  "PRJ-06": E("BUILT", ["list:Digit Progress Update"], undefined, CRAWL),
  "PRJ-07": E("BUILT", ["list:Digit Site Activity Report"], undefined, CRAWL),
  "PRJ-TEAM-EXT": W(E("BUILT", ["page:team"], "Role taxonomy, primary rule, concurrency limit wait on R4-Q", "TC-CON-R4-59…63, BR-R4-TEAM"), "OD-22", "OD-23", "OD-24", "OD-25", "OD-26"),
  "PRO-01": E("BUILT", ["page:proc/plan"], undefined, "TC-CON-R4 procPlan, BR-R4-PROC"),
  "PRO-EXT-01": E("NATIVE", ["list:Material Request"], undefined, CRAWL),
  "PRO-EXT-02": E("NATIVE", ["list:Request for Quotation", "list:Supplier Quotation"], undefined, CRAWL),
  "PRO-EXT-03": E("BUILT", ["page:proc/comparison"], "Award = native Purchase Order from the chosen quotation; no separate award record", CRAWL),
  "PRO-EXT-04": E("NATIVE", ["list:Purchase Order"], undefined, CRAWL),
  "PRO-EXT-05": E("NATIVE", ["list:Purchase Receipt"], "Supplier return = native return receipt", "TC returns"),
  "PRO-EXT-06": E("NATIVE", ["list:Stock Entry"], undefined, CRAWL),
  "PRO-EXT-07": W(E("POLICY_GATED", ["page:proc/matching"], "Three-way match built; accepting a variance waits on P5", CRAWL), "P5"),
  "PRO-EXT-08": M("MAT-01", "Stock ledger and position are panels of the material position screen"),
  "PRO-EXT-09": E("NATIVE", ["list:Supplier", "list:Digit Subcontractor Profile"], undefined, CRAWL),
  "PROC-01": M("PRO-EXT-01"),
  "PROC-02": M("PRO-EXT-03"),
  "PROC-03": M("PRO-EXT-04"),
  "PROC-04": M("PRO-EXT-05"),
  "PROC-05": M("PRO-EXT-06"),
  "PROC-06": M("PRO-EXT-07"),
  "RPT-01": M("FIN-04"),
  "RSP-01": E("BUILT", ["page:dept/:key"], "Resources workspace (dept/rsp)", CRAWL),
  "RSP-02": M("PRJ-07"),
  "RSP-03": E("BUILT", ["list:Digit Crew", "list:Digit Field Attendance"], "Planning rates only; payroll stays in DIGIT HR", CRAWL),
  "RSP-04": E("BUILT", ["list:Digit Machinery Usage"], undefined, CRAWL),
  "RSP-05": W(E("POLICY_GATED", ["list:Digit Petty Cash Fund", "list:Digit Site Expense"], "Site expense journal posting waits on P7", "TC-CON-30"), "P7"),
  "RSP-06": E("BUILT", ["page:cost/verify", "list:Digit Cost Allocation"], undefined, "TC-CON-R4 costVerify"),
  "SITE-01": M("PRJ-07"),
  "SUB-01": W(E("BUILT", ["list:Supplier", "list:Digit Subcontractor Profile"], "Profile approval waits on P8", CRAWL), "P8"),
  "SUB-02": W(E("POLICY_GATED", ["form:Digit Subcontractor Profile"], "Profile approval waits on P8", CRAWL), "P8"),
  "SUB-03": E("BUILT", ["list:Digit Subcontract Work Order"], undefined, CRAWL),
  "SUB-04": E("BUILT", ["form:Digit Subcontract Work Order"], undefined, CRAWL),
  "SUB-05": E("BUILT", ["list:Digit Measurement Book"], undefined, "BR-QS"),
  "SUB-06": E("BUILT", ["page:sub/review"], "Certification = QS review of the measurement book", "BR-QS"),
  "SUB-07": W(E("POLICY_GATED", ["list:Digit Subcontractor Bill", "field:Purchase Invoice.digit_subcontractor_bill"], "Payment from Construction waits on P3", CRAWL), "P3"),
  "UI-CRUD-01": E("QA_CONTRACT", ["list:Project"], "Create / edit / master data through the native forms, insert-if-missing demo, Create From services", "BR-R3-NATIVE11, TC-CON-20"),
  "UI-QA-01": E("QA_CONTRACT", ["list:Project"], "Save → read-back → refresh → relations checked in every Run 4 browser journey", "BR-R4-*"),
  "VAR-01": M("CON-04"),
};

// ---------------------------------------------------------------- 164 documents (only those not matched by name)
/** Documents whose English name equals an app or native DocType are resolved automatically (BUILT / NATIVE). */
export const DOCUMENTS: Record<string, Entry> = {
  "ATT-EXECUTION-EVIDENCE": E("NATIVE", ["list:File"], "Attachments on progress / site activity forms"),
  "DOC-ACT-01": E("NATIVE", ["list:GL Entry"]),
  "DOC-ADV-01": E("READ_MODEL", ["fn:domain/advances#schedulesOf"], "Movement timeline from contracts, certificates, bills and payments"),
  "DOC-ALC-01": E("BUILT", ["field:Sales Invoice.digit_client_certificate"], "Invoice ↔ certificate link field"),
  "DOC-APPROVAL-DECISION": E("NATIVE", ["list:Comment"], "Workflow transitions write a Workflow comment (who, state, when)"),
  "DOC-APPROVAL-DELEGATION": W(E("OWNER_DECISION", [], "No delegation policy defined"), "OD-28"),
  "DOC-APPROVAL-REQUEST": E("NATIVE", ["list:Workflow"], "Exported Workflow fixtures with states and roles"),
  "DOC-APPROVAL-STEP": E("NATIVE", ["list:Workflow Transition"]),
  "DOC-ASSEMBLY": E("BUILT", ["list:Digit Assembly"]),
  "DOC-ASSEMBLY-CATEGORY": W(P(["field:Digit Assembly.category"], "Category is a select on the assembly; no category master"), "OD-02"),
  "DOC-ASSEMBLY-COMPONENT": E("BUILT", ["form:Digit Assembly Component"]),
  "DOC-ATTACH": E("NATIVE", ["list:File"]),
  "DOC-AWARD": E("NATIVE", ["list:Purchase Order"], "Award = Purchase Order created from the chosen Supplier Quotation"),
  "DOC-BOQ": E("BUILT", ["list:Digit BOQ"]),
  "DOC-BOQ-GROUP": E("BUILT", ["form:Digit BOQ Group"]),
  "DOC-BOQ-ITEM": E("BUILT", ["form:Digit BOQ Item"]),
  "DOC-BOQ-SOURCE-CONVERSION": E("BUILT", ["page:estimating/tender/:id/boq"], "Tender → BOQ draft is a Create From action; no conversion record"),
  "DOC-BOQ-SUB-ITEM": W(E("OWNER_DECISION", [], "BOQ is group → item; a sub-item level needs an owner decision"), "OD-03"),
  "DOC-BOQ-WP-SUMMARY": E("READ_MODEL", ["fn:domain/wbs#wbsTree"]),
  "DOC-BUD-01": E("BUILT", ["list:Digit Project Cost Budget"]),
  "DOC-BUD-REVISION-LINE": E("BUILT", ["form:Digit Budget Revision Delta"]),
  "DOC-CASH-01": E("BUILT", ["list:Digit Cashflow Forecast Item", "fn:domain/cashflow#cashFlow"]),
  "DOC-CER-01": M("DOC-CLIENT-CERT"),
  "DOC-CLIENT-CHANGE": E("BUILT", ["list:Digit Client Variation"]),
  "DOC-CLIENT-HANDOFF": E("BUILT", ["field:Sales Invoice.digit_client_certificate"], "Create Sales Invoice from a confirmed certificate"),
  "DOC-CLIENT-SOV": E("BUILT", ["form:Digit Contract SOV Line"]),
  "DOC-CLIENT-VERSION": W(P(["form:Digit Contract Terms Revision", "page:contracts/versions", "fn:domain/contractVersions#versionAt"], "Derived contract versions and terms-revision rows (no separate version document; stored version with its own approval waits on the owner)", "TC-CON-R6-17…21"), "OD-06"),
  "DOC-CMT-01": E("READ_MODEL", ["fn:domain/data#costSourceRows"]),
  "DOC-COL-01": E("NATIVE", ["list:Payment Entry Reference"]),
  "DOC-CON-02": M("DOC-CLIENT-SOV"),
  "DOC-COST-BUDGET": M("DOC-BUD-01"),
  "DOC-COST-BUDGET-LINE": E("BUILT", ["form:Digit Budget Line"]),
  "DOC-COST-FORECAST": M("DOC-FORECAST-SNAPSHOT"),
  "DOC-COST-FORECAST-LINE": E("BUILT", ["form:Digit Forecast Line"]),
  "DOC-COST-MAP": W(E("BUILT", ["list:Digit Cost Code"], "Cost-code master Digit Cost Code built in the owner test list department 06 (the mapping lives on the code and its source rows)", "testlist/d06.test.ts"), "OD-12"),
  "DOC-CUSTOMER-REFERENCE": E("NATIVE", ["list:Customer"]),
  "DOC-DIGIT-ADV-RET-SCHED": E("READ_MODEL", ["fn:domain/advances#schedulesOf"], "Schedules derived from contract and work-order terms"),
  "DOC-DIGIT-CASHFLOW": M("DOC-CASH-01"),
  "DOC-DIGIT-CLIENT-HANDOFF": M("DOC-CLIENT-HANDOFF"),
  "DOC-DIGIT-CLOSEOUT-GATE": E("BUILT", ["list:Digit Closeout Assessment"]),
  "DOC-DIGIT-CONTRACT": M("DOC-CLIENT-CONTRACT", "Subcontract side is DOC-WO"),
  "DOC-DIGIT-FIN-TERMS": E("BUILT", ["form:Digit Client Contract"], "Advance, retention and payment terms on the contract"),
  "DOC-DIGIT-SUB-CERT": M("DOC-SUB-CERT"),
  "DOC-DIGIT-SUB-PI-LINK": M("DOC-SUB-PI-LINK"),
  "DOC-EQP-01": E("BUILT", ["list:Digit Machinery Usage"]),
  "DOC-ESTIMATE-TEMPLATE": E("BUILT", ["list:Digit Estimate Template"]),
  "DOC-ESTIMATE-TEMPLATE-GROUP": W(P(["field:Digit Estimate Template Row.group_code"], "Group is a column on template rows"), "OD-02"),
  "DOC-ESTIMATE-TEMPLATE-ROW": E("BUILT", ["form:Digit Estimate Template Row"]),
  "DOC-FAVORITE-REPORT": W(E("BUILT", ["list:Digit Saved View"], "Personal saved views (sharing waits on R4-O)"), "OD-30"),
  "DOC-FCT-01": M("DOC-FORECAST-SNAPSHOT"),
  "DOC-FILE-01": E("NATIVE", ["list:File"]),
  "DOC-FIN-01": M("DOC-DIGIT-FINAL-ACCOUNT"),
  "DOC-FORECAST-CONTRACT": W(E("OWNER_DECISION", [], "Contract-level forecast rows are not defined"), "OD-13"),
  "DOC-FORECAST-REASON": W(E("OWNER_DECISION", [], "No forecast change-reason taxonomy"), "OD-13"),
  "DOC-FORECAST-SNAPSHOT-LINE": M("DOC-COST-FORECAST-LINE"),
  "DOC-IMR": W(E("POLICY_GATED", ["page:proc/matching"], "Matching is a read model; accepting a variance waits on P5"), "P5"),
  "DOC-ITEM-UOM": E("NATIVE", ["list:Item", "list:UOM"]),
  "DOC-MEA-01": M("DOC-MB"),
  "DOC-MEAS-LINE": E("BUILT", ["form:Digit Measurement Entry"]),
  "DOC-NATIVE-PE-REF": E("NATIVE", ["list:Payment Entry Reference"]),
  "DOC-NOTIFICATION": E("NATIVE", ["list:Notification Log"], "Manifest notifications write native Notification Log rows"),
  "DOC-PR": E("NATIVE", ["list:Purchase Receipt"]),
  "DOC-PRG-01": M("DOC-PROGRESS-UPDATE"),
  "DOC-PRN-01": E("BUILT", ["list:Digit Print Artifact"]),
  "DOC-PROJ-SUB": E("READ_MODEL", ["report:Subcontract Position"], "Subcontractors per project from their work orders"),
  "DOC-PROJECT-TEAM-ASSIGNMENT": E("BUILT", ["field:Project.digit_team", "form:Digit Project Team Member"]),
  "DOC-RATE-HISTORY": E("BUILT", ["form:Digit Construction Rate History"]),
  "DOC-RATE-MASTER": E("BUILT", ["list:Digit Construction Rate"]),
  "DOC-RATE-MASTER-CATEGORY": W(P(["field:Digit Construction Rate.category"], "Category is a select on the rate; no category master"), "OD-02"),
  "DOC-REPORT-DEFINITION": W(E("READ_MODEL", ["page:metrics"], "Read-only metric registry with a definition fingerprint (publish workflow R4-O)"), "OD-31"),
  "DOC-RES-01": E("BUILT", ["list:Digit Field Attendance"]),
  "DOC-RET-01": W(E("POLICY_GATED", ["list:Digit Retention Release Request"], "Release approval waits on P2"), "P2"),
  "DOC-REV-01": E("READ_MODEL", ["page:finance"], "Recognised revenue from native GL income rows"),
  "DOC-RPT-01": E("BUILT", ["page:reports"], "Manifest Script Reports (exported with Python stubs)"),
  "DOC-RPT-02": E("READ_MODEL", ["page:reports/:report"]),
  "DOC-RPT-03": E("BUILT", ["list:Digit Saved View"]),
  "DOC-RPT-04": W(E("SERVER_ONLY", [], "Background export jobs need the DIGIT server; client-side export uses the native list export"), "OD-45"),
  "DOC-SCHEDULE-BASELINE": E("BUILT", ["list:Digit Stage Planning"], "Approved stage plan holds the baseline dates"),
  "DOC-SE": E("NATIVE", ["list:Stock Entry"]),
  "DOC-SET-01": W(P(["page:settings"], "Four verified fields on Digit Construction Settings; the rest are listed gaps"), "OD-33"),
  "DOC-SET-02": E("NATIVE", ["list:Projects Settings"]),
  "DOC-STAGE-PLANNING": E("BUILT", ["list:Digit Stage Planning"]),
  "DOC-SUB-01": M("DOC-WO"),
  "DOC-SUB-02": M("DOC-SUB-CERT"),
  "DOC-SUB-CERT": E("BUILT", ["list:Digit Measurement Book", "list:Digit Subcontractor Bill"], "Certification = certified measurement book, billed by the running bill"),
  "DOC-SUB-PI-LINK": E("BUILT", ["field:Purchase Invoice.digit_subcontractor_bill"]),
  "DOC-SUB-SOV": E("BUILT", ["form:Digit Work Order Line"]),
  "DOC-TENDER": E("BUILT", ["list:Digit Tender"]),
  "DOC-TENDER-AWARD-DECISION": W(P(["field:Digit Tender.status"], "Won / Lost status on the tender; no separate decision record"), "OD-05"),
  "DOC-TENDER-ITEM": E("BUILT", ["form:Digit Tender Item"]),
  "DOC-TENDER-SECTION": W(E("OWNER_DECISION", [], "Tender items have codes but no section structure"), "OD-04"),
  "DOC-WF-01": E("NATIVE", ["list:Workflow", "list:Comment"]),
  "ENTITY-MATERIAL-ALLOCATION": W(P(["field:Purchase Order Item.digit_cost_code"], "Project and cost code on purchase / stock rows; task / WBS allocation not modelled"), "OD-19"),
  "READ-STOCK-LEDGER": E("READ_MODEL", ["page:proc/materials", "report:Project Material Movements"]),
  "READ-STOCK-POSITION": E("READ_MODEL", ["page:proc/materials", "report:Project Material Balance"]),
  "REF-BOQ": M("DOC-BOQ"),
  "RM-EXCEPTION-QUEUE-ITEM": E("READ_MODEL", ["fn:domain/queues#queues"]),
  "RM-PROJECT-360": E("READ_MODEL", ["page:project/:id"]),
  "XREF-CLIENT-CONTRACT": M("DOC-CLIENT-CONTRACT"),
};

// ---------------------------------------------------------------- 55 reports
export const REPORTS: Record<string, Entry> = {
  "EST-RPT-01": W(E("BUILT", ["report:BOQ Estimate Variance", "report:Estimate Versions"], "Per BOQ line vs its estimate line (qty / selling rate / amount differences, added and dropped lines); a unit mismatch shows no difference; plain differences only — variance tolerance and rounding are not set by the owner; history = stored BOQ revisions only", "TC-CON-R4-74, BR-R4R"), "OD-01"),
  "EST-RPT-02": E("BUILT", ["report:Assembly Components", "list:Digit Assembly"], "One row per component with current rate, validity as of a date and share of unit cost; no quantity roll-up across units; single-currency amounts only", "TC-CON-R4-75, BR-R4R"),
  "EST-RPT-03": E("BUILT", ["report:Rate Validity"], "Rate history rows on each rate"),
  "EST-RPT-04": E("BUILT", ["page:estimating/boq-compare"]),
  "EST-RPT-05": E("BUILT", ["report:Tender Pipeline"]),
  "R-01": E("BUILT", ["report:Project Cost Report"]),
  "R-02": E("BUILT", ["report:Project Cost Sources"]),
  "R-03": E("BUILT", ["report:Project Cost Report"], "ETC / EAC / VAC columns"),
  "R-04": E("BUILT", ["report:BOQ Measurement Reconciliation", "report:Measurement Availability and Exceptions"], "Client side per SOV line: original / revised / claimed / certified / rejected / disputed / remaining; client measurement is the claim (no separate client measurement document); subcontract measured vs accepted in the availability report", "TC-CON-R4-76, BR-R4R"),
  "R-05": E("BUILT", ["report:Claims and Certificates Register"]),
  "R-06": E("BUILT", ["report:Subcontract Position"]),
  "R-07": E("BUILT", ["report:Claims and Certificates Register", "report:Client Certificates"]),
  "R-08": E("BUILT", ["page:fin/advances", "report:Retention and Advances"]),
  "R-09": E("BUILT", ["report:Retention and Advances"]),
  "R-10": E("BUILT", ["report:Subcontract Position"]),
  "R-11": E("BUILT", ["report:Variations Register", "list:Digit Client Variation"], "Per variation line with pending / approved / rejected amounts kept apart; only approved client variations enter the revised contract value", "TC-CON-R4-77, BR-R4R"),
  "R-12": E("BUILT", ["report:Project Material Balance"]),
  "R-13": E("BUILT", ["report:Resource Utilization", "report:Machinery Usage Register", "report:Site Attendance Overtime"]),
  "R-14": E("BUILT", ["report:Project Cost Report", "report:Construction Portfolio Status"], "Margin = revised revenue − EAC"),
  "R-15": E("BUILT", ["report:Construction Cashflow", "page:fin/cashflow"]),
  "R-16": W(P(["report:Approval Aging", "page:inbox"], "Open decision steps with age from the workflow log, waiting roles, assignees and age buckets are built; SLA targets and completed-step P50/P90 wait on the owner's paused-time policy", "TC-CON-R4-81, BR-R4R"), "OD-27"),
  "R-17": W(E("POLICY_GATED", ["report:Closeout Readiness"], "Final account approval waits on P1"), "P1", "P4"),
  "RPT-CC-01": E("BUILT", ["report:Client Contract Position"]),
  "RPT-CC-02": M("R-11"),
  "RPT-CC-03": M("R-07"),
  "RPT-CC-04": M("R-10"),
  "RPT-CC-05": W(P(["report:Measurement Availability and Exceptions", "page:sub/review"], "Per work-order line: ordered / measured / pending review / accepted / billed, available to measure and to bill, quantity exceptions are built; missing-evidence counts need an evidence state that is not modelled (owner scope)", "TC-CON-R4-78, BR-R4R"), "OD-08"),
  "RPT-CC-06": W(E("POLICY_GATED", ["report:Supplier Invoices Outstanding"], "Payment from Construction waits on P3"), "P3"),
  "RPT-FIN-01": E("BUILT", ["page:finance"]),
  "RPT-FIN-02": E("BUILT", ["report:Construction Receivables Aging", "report:Supplier Invoices Outstanding"]),
  "RPT-FIN-03": CORE(E("NATIVE", ["native-report:Payment Ledger"]), "OD-40", "The Core report runner shows English diagnostics on Arabic screens outside Developer mode"),
  "RPT-FIN-04": M("R-08"),
  "RPT-FIN-05": E("BUILT", ["page:fin/cashflow"], "Weekly buckets from an explicit start week"),
  "RPT-FIN-06": M("R-17"),
  "RPT-FIN-07": W(E("POLICY_GATED", ["list:Digit Final Account"], "Final account approval waits on P1"), "P1"),
  "RPT-FIN-08": CORE(E("NATIVE", ["native-report:General Ledger", "native-report:Trial Balance", "native-report:Profit and Loss Statement"], "Project filter on the native reports"), "OD-40", "The Core report runner shows English diagnostics on Arabic screens outside Developer mode"),
  "RPT-MAT-01": M("R-12"),
  "RPT-MAT-02": E("BUILT", ["report:Material Request Status"]),
  "RPT-MAT-03": W(E("BUILT", ["report:Supply Progress and On-time Delivery", "page:proc/plan"], "Per PO line: received / returned / remaining, fully-received date vs schedule date and supplier on-time % of fully received lines; open lines excluded; 0-day tolerance until the owner sets one", "TC-CON-R4-79, BR-R4R"), "OD-17"),
  "RPT-MAT-04": W(E("OWNER_DECISION", [], "Estimate lines are BOQ codes, purchases are items: comparing prices needs an owner-approved item ↔ estimate-resource rule"), "OD-18"),
  "RPT-MAT-05": E("BUILT", ["report:Project Material Movements"]),
  "RPT-MAT-06": W(P(["page:proc/materials"], "Quantity variance (requested / ordered / received / issued); price variance needs the RPT-MAT-04 rule"), "OD-18"),
  "RPT-MAT-07": E("BUILT", ["page:proc/comparison", "page:proc/matching"]),
  "RPT-MGT-01": E("BUILT", ["report:Construction Portfolio Status"]),
  "RPT-MGT-02": M("R-16"),
  "RPT-MGT-03": E("BUILT", ["page:hub"]),
  "RPT-MGT-04": W(P(["report:Decision Follow-up", "page:follow-up", "field:ToDo.digit_decision", "fn:domain/followup#decisionEvents"], "Decision events (approve / reject / return / certify / review) from the workflow log with the follow-up assignments explicitly linked to each decision (add, close), other assignments on the document counted apart; response-time targets and lateness against a target wait on the owner's approval SLA policy", "TC-CON-R6-09…16"), "OD-27"),
  "RPT-MGT-05": E("BUILT", ["page:reports", "page:metrics"]),
  "RPT-PRJ-BASELINE-FINISH-VARIANCE": E("BUILT", ["report:Baseline Finish Variance", "page:project/:id"], "Per task vs the approved stage-plan baseline in calendar days; no approved baseline → no rows; no float or critical path", "TC-CON-R4-80, BR-R4R"),
  "RPT-PRJ-MILESTONE-OVERDUE": E("BUILT", ["report:Construction Tasks"]),
  "RPT-PRJ-PROGRESS-OBSERVATIONS": E("BUILT", ["list:Digit Progress Update"]),
  "RPT-PRJ-SCHEDULE-STATUS": E("BUILT", ["report:Construction Tasks", "report:Schedule Dependency Conflicts"]),
  "RPT-PRJ-SITE-DAILY-REGISTER": E("BUILT", ["list:Digit Site Activity Report"]),
  "RPT-PRJ-TEAM-RESPONSIBILITY": E("BUILT", ["page:team"]),
  "RPT-PRJ-WBS-STRUCTURE": E("BUILT", ["page:wbs"]),
};

/** KPI dispositions follow their screen (tiles and drill-downs live on the screen); merged screens point at the canonical KPI. */
export function kpiEntry(screenId: string, kpiByScreen: Map<string, string>): Entry | undefined {
  const s = SCREENS[screenId]; if (!s) return undefined;
  if (s.d === "MERGED") { const target = s.refs[0]!.slice(3); const k = kpiByScreen.get(target); return E("MERGED", [k ? `id:${k}` : `id:${target}`], `Screen ${screenId} is merged into ${target}`); }
  return { ...s };
}
/** Document disposition: explicit entry, else the English name matched to an app (BUILT) or native (NATIVE) DocType. */
export function documentEntry(id: string, name: string, app: Set<string>, native: Set<string>): Entry | undefined {
  return DOCUMENTS[id] ?? (app.has(name) ? E("BUILT", [`list:${name}`]) : native.has(name) ? E("NATIVE", [`list:${name}`]) : undefined);
}
