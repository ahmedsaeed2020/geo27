/**
 * Research evaluation round (owner 2026-11-14): where each research row is evaluated on screen. A target is
 * "ws:<id>" (workspace overview), "ws:<id>/d" (Documents & work), "ws:<id>/r" (Full reports), "R:<report>", "P:<page path>"
 * ("$p" = the evaluated demo project), "D:<DocType>" (one demo record) or "H" (Construction home). `s` fixes the score where
 * the row cannot score 2 by its screen alone (0 missing, 1 partial, 2 works, 3 better than the competitors) and `gap` says why.
 * Features, reports and rows already proven in the earlier rounds resolve from their own evidence (researchEval.ts); only rows
 * without such a home are listed here, so every mapping is visible in one file.
 */
export interface Manual { t: string; s?: 0 | 1 | 2 | 3; gap?: string; note?: string }

const STAGING = "needs an authorised disposable DIGIT server staging site (owner authorisation; no production or customer site)";
const PLATFORM = "DIGIT Construction on the DIGIT Core is that implementation; this list is the fit-gap run on the demo company (516 rows scored on screen). A pilot on a live project needs an authorised site (owner).";

/** Features whose earlier test run was not PASS: evaluated on their screens in this round. */
export const FEATURE_MAP: Record<string, Manual> = {
  "FT-06-01": { t: "ws:06-02/d", note: "Cost code tree with parent codes and categories (Material / Labour / Equipment / Subcontract / Overhead / Contingency); a retired or unknown code on a PO or budget is refused (owner ruling); budget lines are cost code × category." },
  "FT-09-COM-01": { t: "R:Commissioning Test Register", note: "Commissioning tests per system with result, witness and the defect raised from a failed test." },
  "FT-09-HO-01": { t: "D:Digit Handover Asset", note: "Handover asset register with completeness % and missing required documents." },
  // revenue earning rules carry the revenue basis, a Finance value (P10): the screen works, no rule is seeded, WIP stays report-only
  "FT-06-13": { t: "D:Digit Revenue Earning Rule", s: 1, gap: "Revenue earning rules hold the revenue basis per contract line — a Finance value (P10, owner ruling DEC-304); the screen and rule validation work, no rule is seeded, so WIP adjustments stay report-only drafts until Finance sets them." },
  "FT-09-HO-02": { t: "R:O&M Manual Index", note: "Digital O&M manual index: every handover asset with its manuals, warranties and as-built references." },
};

/** Customer cases CS-dd-nn (problem → solution) still open after the test run: the screen that shows the solution. */
export const CS_MAP: Record<string, Manual> = {
  "CS-01-01": { t: "ws:01-01" }, "CS-01-02": { t: "R:Portfolio Scenario Comparison" }, "CS-01-03": { t: "P:inbox" }, "CS-01-04": { t: "R:Milestone Summary" }, "CS-01-05": { t: "R:Portfolio Exposure" },
  "CS-02-01": { t: "P:project/$p" }, "CS-02-02": { t: "ws:02-01" }, "CS-02-03": { t: "ws:02-02" }, "CS-02-04": { t: "ws:02-03" }, "CS-02-05": { t: "ws:02-04" }, "CS-02-06": { t: "ws:02-04/d" },
  "CS-03-01": { t: "ws:03-03" }, "CS-03-02": { t: "P:estimating/boq-compare" }, "CS-03-03": { t: "ws:03-01" }, "CS-03-04": { t: "R:Bid Leveling Summary" }, "CS-03-05": { t: "R:Estimate Versions" }, "CS-03-06": { t: "ws:03-04" },
  "CS-04-01": { t: "ws:04-01" }, "CS-04-02": { t: "R:Change Chain" }, "CS-04-03": { t: "ws:04-03" }, "CS-04-04": { t: "ws:04-04" }, "CS-04-05": { t: "R:Claims and Certificates Register" }, "CS-04-06": { t: "ws:09-03" },
  "CS-05-01": { t: "ws:05-01" }, "CS-05-02": { t: "ws:05-02" }, "CS-05-03": { t: "ws:05-03" }, "CS-05-04": { t: "D:Digit Back Charge" }, "CS-05-05": { t: "R:Subcontract Position" }, "CS-05-06": { t: "D:Digit Subcontract Final Account" },
  "CS-06-01": { t: "ws:06-01" }, "CS-06-02": { t: "P:cost/verify" }, "CS-06-03": { t: "R:Pay Item Margin" }, "CS-06-04": { t: "ws:06-03" }, "CS-06-05": { t: "R:Margin Fade" }, "CS-06-06": { t: "R:Project Cost Sources" },
  "CS-07-01": { t: "P:proc/materials" }, "CS-07-02": { t: "P:proc/comparison" }, "CS-07-03": { t: "P:proc/plan" }, "CS-07-04": { t: "ws:07-03" }, "CS-07-05": { t: "R:Project Material Movements" }, "CS-07-06": { t: "P:proc/matching" },
  "CS-08-01": { t: "ws:08-01" }, "CS-08-02": { t: "R:Field Production" }, "CS-08-03": { t: "ws:08-02" }, "CS-08-04": { t: "R:Equipment Cost Split" }, "CS-08-05": { t: "ws:08-03" }, "CS-08-06": { t: "ws:08-04" },
  "CS-09-01": { t: "ws:09-01" }, "CS-09-02": { t: "P:fin/advances" }, "CS-09-03": { t: "R:WIP Schedule", note: "WIP stays report-only until Finance sets the revenue basis (P10 ruling)." }, "CS-09-04": { t: "P:fin/cashflow" }, "CS-09-05": { t: "R:Cost Source Exceptions" }, "CS-09-06": { t: "ws:09-03" },
};

/** Research recommendations (vendor studies, customer problems) still open after the test run. */
export const REC_MAP: Record<string, Manual> = {
  "PROCORE-REC001": { t: "R:Change Chain" }, "PROCORE-REC002": { t: "R:Claims and Certificates Register" }, "PROCORE-REC003": { t: "ws:06-03" }, "PROCORE-REC004": { t: "H", note: PLATFORM },
  "AUTODESK-REC005": { t: "ws:04-03" }, "AUTODESK-REC006": { t: "R:Construction Cashflow" }, "AUTODESK-REC007": { t: "R:Field Production" }, "AUTODESK-REC008": { t: "H", note: PLATFORM },
  "UNIFIER-REC009": { t: "R:Project Cost Report" }, "UNIFIER-REC010": { t: "R:Variations Register" }, "UNIFIER-REC011": { t: "ws:02-03" }, "UNIFIER-REC012": { t: "R:Risk Register" }, "UNIFIER-REC013": { t: "H", note: PLATFORM },
  "ACUMATICA-REC014": { t: "P:cost/sheet" }, "ACUMATICA-REC015": { t: "R:Change Exposure by Stage" }, "ACUMATICA-REC016": { t: "ws:04-02" }, "ACUMATICA-REC017": { t: "ws:02-02", note: "Owner ruling ENT-NEED-24: no separate phone app; the workspaces at 390 px are the field capture (daily report, attendance, photos as attachments, RFIs)." },
  "ACUMATICA-REC018": { t: "D:Sales Invoice", s: 1, gap: "VAT, ZATCA QR on tax invoices, Riyal sign and Hijri dates are on screen and in print; ZATCA phase-2 clearance, bank and payroll interfaces need a provider configured in Administration and an authorised site (owner)." },
  "SAGE-REC019": { t: "R:Variations Register" }, "SAGE-REC020": { t: "R:Construction Receivables Aging" }, "SAGE-REC021": { t: "P:estimating/boq-compare" }, "SAGE-REC022": { t: "R:Budget vs Actual" }, "SAGE-REC023": { t: "H", note: PLATFORM },
  "CMIC-REC024": { t: "R:WIP Schedule" }, "CMIC-REC025": { t: "D:Digit Subcontract Work Order" }, "CMIC-REC026": { t: "H", note: PLATFORM },
  "CMIC-REC027": { t: "ws:02-02", note: "Role workspaces (site, QS, PM, finance) and the 390 px field screens (owner ruling ENT-NEED-24); offline capture is not provided by that ruling." },
  "CMIC-REC028": { t: "ws:01-02" }, "TRIMBLE-REC029": { t: "P:cost/sheet" }, "TRIMBLE-REC030": { t: "R:Change Exposure" }, "TRIMBLE-REC031": { t: "R:Claims and Certificates Register" }, "TRIMBLE-REC032": { t: "ws:02-02" },
  "TRIMBLE-REC033": { t: "P:metrics", note: "Metric catalogue: every figure states its source, formula and filters before it is drawn." },
  "BUILDSUITE-REC034": { t: "P:project/$p" }, "BUILDSUITE-REC035": { t: "ws:04-03" }, "BUILDSUITE-REC036": { t: "P:proc/plan" }, "BUILDSUITE-REC037": { t: "ws:05-04" }, "BUILDSUITE-REC038": { t: "P:reports" }, "BUILDSUITE-REC039": { t: "R:Site Attendance Overtime" },
  "CUSTOMER_PROBLEMS-REC040": { t: "R:Baseline Finish Variance" }, "CUSTOMER_PROBLEMS-REC041": { t: "R:Manpower Histogram" }, "CUSTOMER_PROBLEMS-REC042": { t: "R:Decision Follow-up" }, "CUSTOMER_PROBLEMS-REC043": { t: "R:Supply Progress and On-time Delivery" },
  "CUSTOMER_PROBLEMS-REC044": { t: "R:Client Certificates" }, "CUSTOMER_PROBLEMS-REC045": { t: "ws:04-03/d" }, "CUSTOMER_PROBLEMS-REC046": { t: "R:BOQ Estimate Variance" },
  "ACONEX-REC047": { t: "R:Defects & NCR Register" }, "ACONEX-REC048": { t: "D:Digit Site Activity Report" }, "ACONEX-REC049": { t: "D:Digit Inspection" }, "ACONEX-REC050": { t: "ws:02-03/d" },
  "ACONEX-REC051": { t: "ws:02-03", note: "Own DIGIT screens (Enterprise brand, Arabic first); only document-governance patterns taken: revision, transmittal, review workflow, audit trail." },
  "QUANTBIT-REC052": { t: "H", note: "No field or rule copied from Quantbit; every DocType comes from the supplied Construction source and owner test lists (crosswalk)." },
};

/** Gates and blockers: the screen that shows the gate resolved, or why it stays open. */
export const GATE_MAP: Record<string, Manual> = {
  G01: { t: "ws:01-01", note: "The Dept 01 read models (scenarios, exposure, risks, decisions, team) show in the Enterprise workspaces 01-01 … 01-04." },
  G02: { t: "R:Construction Receivables Aging", note: "Fixed this round: as of a past day the outstanding adds back later payments, journal settlements and credit notes, and ages from that day ([RDP-G02])." },
  G03: { t: "D:Digit Risk", note: "Create From on the risk: «Create change event» (changeEventFromRisk) — the change event keeps the risk as its origin." },
  G04: { t: "D:Digit Schedule Baseline", note: "Baseline snapshots are frozen after capture; time extensions go through Digit EOT with its own approval." },
  G05: { t: "ws:06-02", s: 1, gap: "Foreign-currency cost sources and the FX exception kinds need the Finance FX policy (owner/Finance value); SAR sources are verified." },
  G06: { t: "D:Digit Schedule Baseline", note: "Restore baseline to live tasks runs only after confirmation, all-or-nothing, with a comment on the baseline (restoreBaseline)." },
  G07: { t: "D:Digit RFI", note: "Create From on RFI and correspondence: «Create change event» (createChangeEventFromRfi / changeEventFromCorrespondence)." },
  G08: { t: "D:Digit Drawing", note: "A reference to a superseded revision warns with the current revision (DEC-016); the transmittal records the revision sent." },
  G09: { t: "H", note: "The Construction source lives in this repository (plugin + server app), so no push or source transfer is needed." },
  G10: { t: "H", s: 1, gap: `New DocTypes and fixtures are generated in the server app; migrate ${STAGING}.` },
  G11: { t: "H", note: "The Run3 features are inspected and scored on screen in this list (Feature rows)." },
  G12: { t: "H", note: "Additive only: no existing document, screen or file of another process was removed or replaced." },
  G13: { t: "H", s: 1, gap: "Independent QA / UAT sign-off is an owner step; this round gives the evidence pack (screenshots per row)." },
  G14: { t: "H", note: "Source is in this repository; the Enterprise preview compiles it directly." },
  G15: { t: "D:Digit Back Charge", note: "Back charges deduct on the subcontractor bill and appear in the subcontract final account." },
  G16: { t: "D:Digit Inspection", s: 1, gap: `Hold points are enforced by the browser rule and its Python twin (same message); a real insert / submit proof ${STAGING}.` },
  G17: { t: "P:project/$p", note: "Project 360 and the 26 screens observed in this round's screenshots." },
  "GATE-01": { t: "P:settings/policies", s: 1, gap: "Reconciling the 333 owner decisions against live configuration is an owner review; the P1–P9 rulings are applied and shown with their status." },
  "GATE-02": { t: "H", note: "All 137 atlas features are scored on screen in this list (one row each), not by the 55 audit functions." },
  "GATE-03": { t: "H", note: "One host: /construction inside the Enterprise shell; no /plugin path in any visible URL." },
  "GATE-04": { t: "H", note: "Functionality is proven by screens and tests in this round, not by hashes." },
  "GATE-05": { t: "D:Digit Retention Release Request", note: "Owner ruling WF-113: the retention release stays a draft Sales Invoice until Finance names the retention account (P2)." },
  "GATE-06": { t: "P:settings/policies", note: "P9 VAT basis ruled per certificate / contract (owner decision table), not a company default." },
  "GATE-07": { t: "R:Project Cost Report", note: "Purchase-basis costing: open PO lines and unbilled work orders are commitments, invoices and journals are actuals, receipts / issues are never cost — no double count (Project Cost Sources drill)." },
  "GATE-08": { t: "H", s: 1, gap: `Every rule has a Python twin compared by the twin harness; running them on the server ${STAGING}.` },
  "GATE-09": { t: "H", note: "Construction supplies data and rules; shell, navigation, cards, charts, lists, side panel and print are the shared Enterprise ones." },
  "GATE-10": { t: "ws:02-04", s: 1, gap: "W3 items built: WIP (report-only, P10), safety, commissioning, as-built / O&M index. BIM model viewer and a supplier portal need an explicit scoped design (W3 condition, owner)." },
  "W0-01": { t: "H", s: 1, gap: `Read-only baseline and restore-backed staging clone ${STAGING}.` },
  "W0-02": { t: "P:settings/policies", note: "Each policy shows ruled / configured / Finance value pending separately; no blanket Defined." },
  "W0-03": { t: "H", s: 1, gap: `The hosted bundle is rebuilt with SHA-256 build.json; deploying it ${STAGING}.` },
  "W0-04": { t: "P:settings", note: "Demo master data is company-scoped and removable with one button (Construction Settings › Demo data)." },
  "W0-05": { t: "R:Actuals vs GL", note: "Reports compute from permission-filtered records; Actuals vs GL shows the ledger lineage of every actual." },
  "W0-06": { t: "ws:06-01/r", note: "Company / project / as-of filters, drill and Back are the shared Enterprise report workbench behaviour." },
  "W0-07": { t: "R:Subcontract Position", s: 1, gap: `Works on the demo company in the preview; the staging run ${STAGING}.` },
  "W1-01..04": { t: "ws:04-03" }, "W1-05..12": { t: "H" },
  "W2-01..10": { t: "ws:02-03", note: "Transmittals, quality, claims / EOT, resource allocation and cash are on their workspaces; the phone experience is the 390 px workspaces (owner ruling ENT-NEED-24)." },
  W3: { t: "ws:09-04", s: 1, gap: "WIP (report-only until P10), safety, commissioning and as-built are built; BIM and a supplier portal need an explicit scoped design (owner)." },
  "RC1-G-01": { t: "H", s: 1, gap: "Installation on a production or customer site is not authorised (owner)." },
  "RC1-G-02": { t: "H", s: 1, gap: `Upgrade of a pre-customised tenant site ${STAGING}.` },
  "RC1-G-03": { t: "H", s: 1, gap: `Rollback by restoring a backup ${STAGING}.` },
  "RC1-G-10": { t: "P:reports" }, "RC1-G-11": { t: "R:Project Cost Report", s: 1, gap: "In the preview every card equals its drill rows (reconcile tests); an independent SQL reconciliation needs a running DIGIT server site (owner authorisation)." },
  "RC1-G-12": { t: "ws:01-01" },
  "RC1-G-13": { t: "H", s: 1, gap: "Desk Number Cards / Dashboard Charts are installed and health-checked; showing them on the v16 Desk workspace needs the DIGIT server Desk host." },
  "RC1-G-14": { t: "R:Construction Portfolio Status" }, "RC1-G-20": { t: "P:settings/policies", note: "P1–P9 carry the owner rulings (insert-if-missing); only Finance values (P2 account, P5 tolerances, P7 mapping) stay empty and their actions stay drafts / report-only." },
  "RC1-G-21": { t: "H" }, "RC1-G-22": { t: "H" },
  "RC1-G-23": { t: "H", s: 1, gap: "Screens refresh after every save; live push needs the DIGIT server realtime service." },
  "RC1-G-24": { t: "D:Digit BOQ", note: "Fixed this round: every document prints A4 Arabic / English and downloads as PDF (300-line BOQ paginates with repeated headers)." },
  "RC1-G-25": { t: "P:settings", s: 1, gap: "Notification e-mail needs a mail provider in Administration (external sending: provider setting); not configured in the preview." },
  "RC1-G-26": { t: "H", s: 1, gap: "The prebuilt bundle ships in the app; the asset build runs on the DIGIT server site." },
  "RC1-G-28": { t: "H", s: 1, gap: "Every page, report and dashboard opens in the preview (this list); the same pass on the DIGIT server host needs an authorised site." },
  "RC1-G-30": { t: "H", note: "Unknown or disabled DocType URLs render «DocType not found», never an endless Loading." },
  "RC1-G-31": { t: "ws:07-02/d", s: 1, gap: "Construction lists fit 390 px; the native Core list width rule is an owner decision (RC1-G-31)." },
  "RC1-G-32": { t: "H", s: 1, gap: "The owner's reference package and screenshot were never received." },
};

/** Competitor reports (R19 reverse engineering): the DIGIT report or screen that covers each one. */
export const COMP_MAP: Record<string, Manual> = {
  "RE-0454": { t: "R:Maintenance Due" }, "RE-0455": { t: "R:Maintenance Order Register" }, "RE-0456": { t: "R:Workflow Review Status" }, "RE-0457": { t: "R:Workflow Review Status" }, "RE-0458": { t: "R:Workflow Review Status" },
  "RE-0459": { t: "R:Submittal Log" }, "RE-0460": { t: "R:Submittal Log" }, "RE-0461": { t: "H" }, "RE-0462": { t: "R:Open Purchase Order Lines" }, "RE-0463": { t: "R:Stock Adjustments by Reason" },
  "RE-0464": { t: "R:Project Material Balance" }, "RE-0465": { t: "R:Commitments Register" }, "RE-0466": { t: "R:Commitments Register" }, "RE-0467": { t: "R:PO Detail by Cost Code" }, "RE-0468": { t: "R:Supplier Scorecard" },
  "RE-0469": { t: "R:Supply Progress and On-time Delivery" }, "RE-0470": { t: "R:Supply Progress and On-time Delivery" }, "RE-0471": { t: "R:Open Purchase Order Lines" }, "RE-0472": { t: "R:Commitments Register" },
  "RE-0473": { t: "R:Open Commitments" }, "RE-0474": { t: "R:PO Change Log" }, "RE-0475": { t: "P:wbs" }, "RE-0476": { t: "R:Construction Tasks" }, "RE-0477": { t: "R:Site Spend Register" }, "RE-0478": { t: "R:Budget vs Actual" },
  "RE-0479": { t: "P:cost/sheet" }, "RE-0480": { t: "ws:02-02" }, "RE-0481": { t: "R:Field Production" }, "RE-0482": { t: "R:Change Exposure by Stage" }, "RE-0483": { t: "R:Variations Register" }, "RE-0484": { t: "R:Change Chain" },
  "RE-0485": { t: "R:Risk Quality Outstanding Actions" }, "RE-0486": { t: "R:Client Contract Position" }, "RE-0487": { t: "R:Client Contract Position" }, "RE-0488": { t: "R:Subcontract Position" }, "RE-0489": { t: "R:Bid Comparison" },
  "RE-0490": { t: "R:Construction Portfolio Status" }, "RE-0491": { t: "R:Project Cost Report" }, "RE-0492": { t: "R:Project Cost Sources" }, "RE-0493": { t: "R:Job Snapshot Comparison" }, "RE-0494": { t: "R:Revised and Potential Budget" },
  "RE-0495": { t: "R:Budget vs Actual" }, "RE-0496": { t: "P:project/$p" }, "RE-0497": { t: "R:Project Profitability" }, "RE-0498": { t: "R:Margin Fade" }, "RE-0499": { t: "R:Job Snapshot Comparison" }, "RE-0500": { t: "R:Approval Aging" },
  "RE-0501": { t: "R:Supplier Invoices Outstanding" }, "RE-0502": { t: "R:Variations Register" }, "RE-0503": { t: "R:Risk Quality Outstanding Actions" }, "RE-0504": { t: "R:RFI Aging" }, "RE-0505": { t: "ws:06-04" }, "RE-0506": { t: "P:fin/cashflow" },
  "RE-0507": { t: "R:Portfolio Scenario Comparison" }, "RE-0508": { t: "R:Risk Register" }, "RE-0509": { t: "ws:01-02" }, "RE-0510": { t: "ws:01-02" }, "RE-0511": { t: "P:outputs" }, "RE-0512": { t: "P:outputs" },
  "RE-0513": { t: "R:Construction Portfolio Status" }, "RE-0514": { t: "R:Milestone Summary" }, "RE-0515": { t: "D:Digit Lookahead" }, "RE-0516": { t: "P:wbs" },
};

/**
 * Score 3 (better than the competitors) only with a stated reason that the screen shows and the compared products do not
 * offer in the Saudi market (keyed by Source ID or row ID).
 */
export const BETTER: Record<string, string> = {
  "VAL-V07": "Arabic-first RTL on every workspace at 390 px with the Riyal sign and Hijri dates; the compared products ship English-first field apps without Hijri dates.",
  "VAL-V14": "Every figure drills to the exact source rows it sums and the cost source verifier lists every unmapped / out-of-budget row with a re-attribution that never edits the source document.",
  "CS-06-06": "Cost variance drills to source rows with exception status and allocation history (cost source verifier), beyond a budget-line drill.",
  "CS-09-05": "Cost reconciliation exceptions are a work queue (review → correction / allocation) tied to the report catalogue, with the source never edited.",
  "RC1-G-24": "Bilingual A4 prints for every document with Hijri + Gregorian dates, amount in Arabic words, workflow signatures and ZATCA QR only on tax invoices.",
  "GATE-07": "Commitment and actual are separated by document basis and each figure drills to its rows, so the same invoice can never be counted as commitment and cost.",
  "RE-0490": "Job status per project with chart, Arabic / English, Riyal amounts, drill to each source document and export within permission, from the same read model as the portfolio cards.",
  "RE-0491": "EAC / ETC / VAC per cost code × category with drill to commitment and actual rows and the forecast snapshot history.",
};
