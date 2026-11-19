/**
 * The Frappe host's own app list, mirrored from the DIGIT Enterprise source archive (digit_enterprise-main.zip,
 * SHA-256 dadd53a354dce07eb02b523239f7ede35260e039cac4a41ff1dd1bbe3e2887ab):
 *  - api/apps.py DIGIT_APPS — the six apps the host knows (installed-app check + `digit_app` / `add_to_apps_screen` hooks
 *    decide visibility and access on a real site; a failed check is DENIED, never a grant);
 *  - api/shared.py APP_CONTRACTS — per app, the owning server method behind each shared capability (None = the host
 *    reports BACKEND_CONTRACT_MISSING).
 * These are labels for traceability and diagnostics only: nothing here is imported or called from the browser, and an app
 * is never exposed in the preview because it appears in this list (ITM is not in DIGIT_APPS; its screens ship inside
 * DIGIT FSM + ITM).
 */
export const ENTERPRISE_ARCHIVE = { file: "digit_enterprise-main.zip", sha256: "dadd53a354dce07eb02b523239f7ede35260e039cac4a41ff1dd1bbe3e2887ab" } as const;

export const HOST_APP_IDS = ["digit_pro", "digit_hr", "digit_crm", "digit_construction", "digit_fsm", "digit_distribution"] as const;
export type HostAppId = (typeof HOST_APP_IDS)[number];
export const isHostApp = (id: string): id is HostAppId => (HOST_APP_IDS as readonly string[]).includes(id);

/** api/shared.py APP_CONTRACTS (null = BACKEND_CONTRACT_MISSING on the host). */
export const HOST_APP_CONTRACTS: Record<HostAppId, Record<string, string | null>> = {
  digit_pro: { workspace: "digit_pro.sections.get_section", dashboard: "digit_pro.api.get_dashboard", reports: "digit_pro.report_registry.get_report_contract", activity: "digit_pro.activity.get_activity_contract", context: "digit_pro.period_context.get_period_context", guide: "digit_pro.guidance.evaluate" },
  digit_hr: { workspace: "digit_hr.api.workspace.section", module_home: "digit_hr.api.workspace.module_home", dashboard: "digit_hr.api.metrics.summary", approvals: "digit_hr.api.approvals.queue", guide: "digit_hr.api.guide.document", capabilities: "digit_hr.capabilities.get", context: null },
  digit_crm: { capabilities: "digit_crm.api.capabilities", reports: "digit_crm.api.report_catalog", dashboard: null, workspace: null, context: null, guide: null },
  digit_construction: { workspace: null, context: null, guide: null },
  digit_fsm: { dashboard: "digit_fsm.api.insights.kpis", reports: "digit_fsm.api.insights.report", workspace: null, context: null, guide: null },
  digit_distribution: { workspace: null, dashboard: null, reports: null, context: null, guide: null },
};

/** Host-side UI scripts of the archive per app (public/js), for the traceability view. */
export const HOST_UI_SOURCES: Partial<Record<HostAppId, string[]>> = {
  digit_pro: ["public/js/pro-sections.js", "public/js/pro-dash.js", "public/js/shared-ui.js"],
  digit_hr: ["public/js/hr-ops.js", "public/js/shared-ui.js"],
  digit_construction: ["public/js/construction-host.js", "public/js/con-screens.js", "public/js/con-depts.js", "public/js/con-operations.js"],
  digit_fsm: ["public/js/fsm-host.js"],
  digit_distribution: ["public/js/distribution-host.js"],
};
