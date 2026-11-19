/**
 * Department 09 finance and closeout reports (owner spec catalog RPT-N30 Earned Value, RPT-N31 WIP Schedule, RPT-N32
 * Actuals vs GL, plus the FT-09-10 snapshot comparison and the FT-09-HO-02 O&M manual index). Each runs the read model
 * of domain/finance.ts over the session's readable construction projects (domain/queues constructionProjects), so a
 * report row and a screen figure count the same rows. Nothing here posts. Python scripts stay server stubs.
 */
import type { PluginReport } from "../types";
import { adapter } from "@/lib/adapter";
import { currentUser, userRoles } from "@/lib/session";
import { today } from "./domain/data";
import { constructionProjects } from "./domain/queues";
import { actualsVsGl, earnedValue, manualIndex, periodEnd, snapshotDiff, wipRow } from "./domain/finance";

type F = Record<string, unknown>;
const C = (fieldname: string, label: string, fieldtype = "Currency", options?: string) => ({ fieldname, label, fieldtype, ...(options ? { options } : {}), width: 130 });
const S = (q: string) => `# FRAPPE_SERVER_REQUIRED: the Virtual Core computes this report in digit_construction/reportsFin.ts (${q}).\n# Port it to Python and test it on staging before enabling this report on the DIGIT server site.\nraise NotImplementedError("${q}")\n`;
const L = (fieldname: string, label: string, options: string) => ({ fieldname, label, fieldtype: "Link", options });
const D = (fieldname: string, label: string, fieldtype = "Date") => ({ fieldname, label, fieldtype });
const PERIOD_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
/** Finance reports: accountant, director, project manager and quantity surveyor (project scope applies). */
export const FIN_ROLES = ["Digit Accountant", "Digit Director", "Digit Project Manager", "Digit QS", "System Manager"];
const gate = <X,>(fn: () => X[]): X[] => { const u = currentUser(); return u === "Administrator" || userRoles(u).some((r) => FIN_ROLES.includes(r)) ? fn() : []; };
const projects = (f: F) => constructionProjects({ ...(f["company"] ? { company: String(f["company"]) } : {}), ...(f["project"] ? { project: String(f["project"]) } : {}) }).map((p) => p.name).sort();
const periodOf = (f: F) => (PERIOD_RE.test(String(f["period"] ?? "")) ? String(f["period"]) : today().slice(0, 7));

export const FIN_REPORTS: PluginReport[] = [
  { name: "Earned Value", ref_doctype: "Project", report_type: "Script Report", script: S("Earned Value"), filters: [L("project", "Project", "Project"), D("period", "Period (YYYY-MM)", "Data")],
    columns: [C("project", "Project", "Link", "Project"), C("period", "Period", "Data"), C("bac", "BAC"), C("pv", "PV"), C("ev", "EV"), C("ac", "AC"), C("cpi", "CPI", "Float"), C("spi", "SPI", "Float"), C("eac", "EAC (BAC÷CPI)"),
      C("progress", "Progress %", "Percent"), C("planned", "Planned %", "Percent")],
    run: (f) => gate(() => { const per = periodOf(f); const asOf = per === today().slice(0, 7) ? today() : periodEnd(per);
      return projects(f).map((p) => { const ev = earnedValue(p, asOf); return { project: p, period: per, bac: ev.bac, pv: ev.pv, ev: ev.ev, ac: ev.ac, cpi: ev.cpi, spi: ev.spi, eac: ev.eac, progress: ev.progress, planned: ev.planned }; }); }) },
  { name: "WIP Schedule", ref_doctype: "Project", report_type: "Script Report", script: S("WIP Schedule"), filters: [L("company", "Company", "Company"), D("as_of", "As Of")],
    columns: [C("project", "Project", "Link", "Project"), C("revised", "Revised Contract"), C("eac", "EAC"), C("margin", "Est. Margin"), C("pct", "% Complete (cost)", "Percent"), C("earned", "Earned Revenue"), C("billed", "Billed"),
      C("over_under", "Over/(Under) Billed"), C("actual", "Cost to Date")],
    run: (f) => gate(() => projects(f).map((p) => wipRow(p, (f["as_of"] as string) || today()))) },
  { name: "Actuals vs GL", ref_doctype: "GL Entry", report_type: "Script Report", script: S("Actuals vs GL"), filters: [L("company", "Company", "Company"), L("project", "Project", "Project"), D("period", "Period (YYYY-MM)", "Data")],
    columns: [C("project", "Project", "Link", "Project"), C("account", "Account", "Link", "Account"), C("gl", "GL Amount"), C("digit", "DIGIT Actual"), C("difference", "Difference"), C("unmatched_count", "Unmatched Lines", "Int"), C("unmatched", "Unmatched Vouchers", "Small Text")],
    run: (f) => gate(() => { const per = PERIOD_RE.test(String(f["period"] ?? "")) ? String(f["period"]) : ""; const from = per ? `${per}-01` : "", to = per ? periodEnd(per) : "";
      return projects(f).flatMap((p) => actualsVsGl(p, from, to)).map((r) => ({ project: r.project, account: r.account, gl: r.gl, digit: r.digit, difference: r.difference, unmatched_count: r.unmatched.length,
        unmatched: r.unmatched.map((u) => `${u.voucher} (GL ${u.gl} / DIGIT ${u.digit})`).join(", ") })); }) },
  { name: "Job Snapshot Comparison", ref_doctype: "Digit Job Snapshot", report_type: "Script Report", script: S("Job Snapshot Comparison"),
    filters: [L("from_snapshot", "From Snapshot", "Digit Job Snapshot"), L("to_snapshot", "To Snapshot", "Digit Job Snapshot")],
    columns: [C("metric", "Metric", "Data"), C("from", "From"), C("to", "To"), C("diff", "Difference")],
    run: (f) => gate(() => { const a = adapter.get("Digit Job Snapshot", String(f["from_snapshot"] ?? "")), b = adapter.get("Digit Job Snapshot", String(f["to_snapshot"] ?? ""));
      const ok = new Set(projects({})); return a && b && ok.has(String(a["project"])) && ok.has(String(b["project"])) ? snapshotDiff(a, b) : []; }) },
  { name: "O&M Manual Index", ref_doctype: "Digit Handover Asset", report_type: "Script Report", script: S("O&M Manual Index"), filters: [L("project", "Project", "Project")],
    columns: [C("system", "System", "Data"), C("location", "Location", "Data"), C("asset", "Asset", "Link", "Digit Handover Asset"), C("asset_tag", "Asset Tag", "Data"), C("documents", "Accepted Documents", "Int"), C("files", "Documents", "Small Text")],
    run: (f) => (f["project"] && projects(f).includes(String(f["project"])) ? manualIndex(String(f["project"])).entries.map((e) => ({ system: e.system, location: e.location, asset: e.asset, asset_tag: e.asset_tag,
      documents: e.documents.length, files: e.documents.map((d) => `${d.type}: ${d.description}`).join(", ") })) : []) },
];
