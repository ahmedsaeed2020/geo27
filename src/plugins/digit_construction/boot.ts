/** Runtime boot of DIGIT Construction: registers the controller hooks on the shared adapter, the Insights data source and the demo installer. Imported by src/plugins/builtinBoot.ts. */
import "./domain/hooks";
import { runDateAlerts } from "./domain/alerts";
import { adapter } from "@/lib/adapter";
import { backfillCompany } from "./domain/companyScope";
import { isEnabled, registerAppRuntime, subscribePlugins } from "../runtime";
import { installConstructionDemo } from "./seed";
import { repairDemoTables } from "./domain/demoTables";
import { registerConstructionDataSource } from "./analytics/insightsSource";
import { seedConstructionInsights } from "./analytics/insightsSeed";
import { APP } from "./domain/data";
import { isFrappeHost } from "./domain/host";
import { registerVolumeProvider } from "@/lib/volume";
import { constructionVolume } from "./volume";
import { demoDataOn } from "./demoControl";
import { registerPrintRoles, registerPrintTitles } from "@/lib/printFrame";
import { ROLE_AR } from "./roleLabels";
import { registerPrintFormats } from "@/lib/printEngine";
import { CONSTRUCTION_DOCTYPES, DOCTYPE_AR } from "./schema";
import { translateTo } from "@/i18n";
import { PRINT_FORMATS } from "./domain/print";
import { departmentTeam, setTeamResolver } from "@/lib/sharedViews";
import { TEAM_TABLE } from "./domain/teamModel";

registerConstructionDataSource();
// phase 4 C4-09: «فريقي» on a saved view = the members of every project team the owner is on, plus the owner's department
setTeamResolver((user) => {
  const uid = (r: Record<string, unknown>) => String(r["user"] || adapter.get("Employee", String(r["employee"] ?? ""))?.["user_id"] || "");
  const out = new Set<string>(departmentTeam(user));
  if (isEnabled(APP)) for (const p of adapter.list("Project")) { const rs = Array.isArray(p[TEAM_TABLE]) ? (p[TEAM_TABLE] as Record<string, unknown>[]) : []; if (rs.some((r) => uid(r) === user)) rs.forEach((r) => { const u = uid(r); if (u) out.add(u); }); }
  return [...out];
}, ["Members of your project teams and department", "أعضاء فرق مشاريعك وقسمك"]);
// owner round 2026-11-14 (print on every document): bilingual printed titles and the bilingual Jinja formats in the shared print screen
registerPrintTitles(Object.fromEntries(CONSTRUCTION_DOCTYPES.map((d) => [d.name, [d.name.replace(/^Digit /, ""), DOCTYPE_AR[d.name] ?? translateTo(d.name, "ar").replace(/^Digit /, "")] as const])));
registerPrintRoles(Object.fromEntries(Object.entries(ROLE_AR).map(([r, ar]) => [r, [r.replace(/^Digit /, ""), ar] as const])));
registerPrintFormats(PRINT_FORMATS.map((p) => ({ name: p.name, doc_type: p.doc_type, app: APP, source: "digit_construction", print_format_type: "Jinja", html: p.html, css: p.css ?? "", format_data: "", raw_printing: 0, disabled: 0 })));
// rich sample layer (memory only, never saved): runs after the connected demo, only while the app is enabled and not on a Frappe host
// (owner round 2026-11-14: "Remove demo data" in Construction Settings switches both the connected demo and this layer off)
registerVolumeProvider(APP, constructionVolume, () => isEnabled(APP) && !isFrappeHost() && demoDataOn());
// demo install, then (browser, async) empty demo child tables are stored as [] so the preview never fills them with sample rows
// On the Frappe-hosted UI records belong to the server: no browser demo install and no preview maintenance writes
// (demo data there comes only from the opt-in server installer on a disposable site). The Insights workbook is analysis
// metadata kept in the browser, so it is still provided.
registerAppRuntime("digit_construction", { install_demo: () => { if (isFrappeHost() || !demoDataOn()) return 0; const n = installConstructionDemo(); seedConstructionInsights(); void repairDemoTables(); return n; } });
if (typeof window !== "undefined" && import.meta.env?.MODE !== "test" && isFrappeHost()) {
  const ensure = () => { if (isEnabled(APP)) seedConstructionInsights(); };
  setTimeout(ensure, 0);
} else if (typeof window !== "undefined" && import.meta.env?.MODE !== "test") {
  setTimeout(() => { if (isEnabled(APP) && backfillCompany()) adapter.flush(); void repairDemoTables(); if (isEnabled(APP) && runDateAlerts()) adapter.flush(); }, 0);
  // the DIGIT Construction Insights workbook exists whenever the app is enabled (analysis records, insert-if-missing)
  const ensure = () => { if (isEnabled(APP)) seedConstructionInsights(); };
  setTimeout(ensure, 0);
  subscribePlugins(ensure);
}

// Enterprise Visual Round 1 X04: the shared report page computes Construction reports from the virtual records (the same
// `run` the plugin report screen uses), so «Budget vs Actual» and the other Construction reports never ask for a server
import { RUNNERS } from "@/lib/reportRunner";
import type { RCol, Row as RRow } from "@/lib/reportKit";
import { CONSTRUCTION_REPORTS } from "./reports";
for (const r of CONSTRUCTION_REPORTS) {
  if (!r.run || RUNNERS[r.name]) continue;
  const run = r.run;
  RUNNERS[r.name] = { src: `digit_construction reports ${r.name}`, filters: (r.filters ?? []).map((f) => ({ fieldname: f.fieldname, label: f.label, fieldtype: f.fieldtype, ...(f.options !== undefined ? { options: f.options } : {}), ...(f.default !== undefined ? { default: f.default } : {}) })),
    run: (f) => ({ columns: r.columns as unknown as RCol[], rows: run(f) as RRow[] }) };
}
