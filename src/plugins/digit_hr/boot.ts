import { migrateHrNames } from "./renameStored";
migrateHrNames();
/** Runtime boot of DIGIT HR: registers the HR R9 controller rules on the shared adapter. Imported by src/plugins/builtinBoot.ts. */
import "./r9/hooks";
import "./r10/hooks";

// HR rich demo (owner brief 2026-11-15 §7): memory-only sample layer records for the enabled HR app (never on the Frappe host)
import { registerVolumeProvider } from "@/lib/volume";
import { isServerHosted } from "@/lib/serverHost";
import { isEnabled } from "../runtime";
import { hrProductVolume } from "./product/demo";
import { hrRound2Volume } from "./r10/demo";
import { registerHrSampleNames } from "./r10/sampleNames";
import "./product/reportsBoot";
import { registerPrintFormats, registerPrintListScope } from "@/lib/printEngine";
import { hrIdentityAllows } from "./compat/identity";
import { registerPrintTitles } from "@/lib/printFrame";
import { HR_PRINT_FORMATS, HR_PRINT_TITLES } from "./product/prints";
import { R10_PRINTS, R10_PRINT_TITLES } from "./r10/doctypes";
import { R10_EXTRA_PRINTS, R10_EXTRA_TITLES } from "./r10/prints";
registerVolumeProvider("digit_hr", (ctx) => { hrProductVolume(ctx); hrRound2Volume(ctx); }, () => isEnabled("digit_hr") && !isServerHosted());
// HR prints (owner brief 2026-11-15 §2): bilingual formats inside the shared print frame
registerPrintTitles({ ...(HR_PRINT_TITLES as Record<string, [string, string]>), ...R10_PRINT_TITLES, ...R10_EXTRA_TITLES });
// HR prints look up rows through frappe.get_list: the HR team-only rule narrows them like every other HR read
registerPrintListScope((dt, d, user) => hrIdentityAllows(dt, d, user, "read"));
registerPrintFormats([...HR_PRINT_FORMATS, ...R10_PRINTS, ...R10_EXTRA_PRINTS].map((p) => ({ name: p.name, doc_type: p.doc_type, app: "digit_hr", source: "digit_hr", print_format_type: "Jinja", html: p.html, css: p.css ?? "", format_data: "", raw_printing: 0, disabled: 0 })));
registerHrSampleNames();

// Enterprise approval path (Visual Round 1 §9): HR owns how its approvals are decided; the shared path calls these
import { registerApprovalHandler } from "@/lib/approvalPath";
import { decideLeave } from "./operations";
import { hrApplyWorkflow } from "./compat/workflow";
import { R10_WORKFLOWS } from "./r10/doctypes";
registerApprovalHandler("Leave Application", (_dt, name, decision) => {
  if (decision === "changes") return []; // the comment written by the path is the request; the leave stays open
  try { decideLeave(name, decision === "approve" ? "Approved" : "Rejected"); return []; } catch (e) { return [e instanceof Error ? e.message : String(e)]; }
});
for (const w of R10_WORKFLOWS) registerApprovalHandler(w.document_type, (dt, name, decision) => {
  const action = decision === "approve" ? "Approve" : decision === "reject" ? "Reject" : "";
  return action ? hrApplyWorkflow(dt, name, action) : [];
});

// DEC-015 (owner 18/11/2026): a blank «يحتاج حساب مستخدم» takes the default on save (Python twin: accountNeedSpec ACCOUNT_NEED_SCRIPT)
import { registerDocHook } from "@/lib/adapter";
import { accountNeed } from "./userAccounts";
import { NEEDS_ACCOUNT_FIELD } from "./accountNeedSpec";
registerDocHook("Employee", (doc) => (!isEnabled("digit_hr") || doc[NEEDS_ACCOUNT_FIELD] ? { doc } : { doc: { ...doc, [NEEDS_ACCOUNT_FIELD]: accountNeed(doc).needs ? "Yes" : "No" } }));
