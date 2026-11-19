/**
 * WF-12 — CRM report catalog.
 * 1. Current reports: every table the Reports Center renders (wf04 topicTables), with its topic, source DocType (export
 *    permission basis) and URL (cat + rpt) — the catalog lists what exists, it never adds a second report engine.
 * 2. Research registry: the 65 research report IDs (R-001…R-064 plus R-039b) in the owner-specified groups. Only IDs whose
 *    research name is already matched to an implemented table are marked implemented. The research registry file
 *    (08_REPORT_REGISTRY_65.csv) is not in this project, so other IDs keep "name pending source registry" and point to their
 *    group's current reports as contextual entries — never claimed as that research report.
 */
import { cachedMeta } from "@/lib/catalog";
import { hasPerm } from "@/lib/session";
import type { Topic } from "./wf04";

export type ReportRef = { topic: Topic; table: string };
export type CurrentReport = ReportRef & { rid: string; title: string; source: string };
/** Static list of current Reports Center tables (ids from wf04 topicTables; a test keeps them in sync). */
export const CURRENT_REPORTS: CurrentReport[] = [
  { topic: "pipeline", table: "stage", rid: "R-P1", title: "Pipeline by stage", source: "CRM Deal" },
  { topic: "pipeline", table: "owner", rid: "R-P2", title: "Win rate by owner", source: "CRM Deal" },
  { topic: "pipeline", table: "aging", rid: "R-019", title: "Stage aging (open opportunities)", source: "CRM Deal" },
  { topic: "pipeline", table: "hvnf", rid: "R-020", title: "High-value opportunities without follow-up", source: "CRM Deal" },
  { topic: "pipeline", table: "stale", rid: "R-024", title: "Stale opportunities", source: "CRM Deal" },
  { topic: "pipeline", table: "promise", rid: "R-039b", title: "Promised close without follow-up", source: "CRM Deal" },
  { topic: "pipeline", table: "territory", rid: "R-P4", title: "Pipeline by territory", source: "CRM Deal" },
  { topic: "pipeline", table: "lost", rid: "R-P3", title: "Lost reasons", source: "CRM Deal" },
  { topic: "leads", table: "source", rid: "R-L1", title: "Lead source conversion", source: "CRM Lead" },
  { topic: "leads", table: "firstcontact", rid: "R-005", title: "Lead first-contact time", source: "CRM Lead" },
  { topic: "leads", table: "hygiene", rid: "R-006/007/008", title: "Lead hygiene", source: "CRM Lead" },
  { topic: "leads", table: "score", rid: "R-010", title: "Lead score distribution", source: "CRM Lead" },
  { topic: "leads", table: "status", rid: "R-L2", title: "Leads by status", source: "CRM Lead" },
  { topic: "leads", table: "campaign", rid: "R-L3", title: "Campaign results", source: "CRM Lead" },
  { topic: "activity", table: "followup", rid: "R-A1", title: "Follow-up by salesperson", source: "CRM Task" },
  { topic: "activity", table: "compliance", rid: "R-031", title: "Follow-up compliance", source: "CRM Task" },
  { topic: "activity", table: "kind", rid: "R-A2", title: "Activities by type", source: "CRM Task" },
  { topic: "activity", table: "channel", rid: "R-A3", title: "Communication channel mix", source: "Communication" },
  { topic: "activity", table: "calls", rid: "R-A4", title: "Calls by outcome", source: "CRM Call Log" },
  { topic: "customers", table: "handoff", rid: "R-C3", title: "Quote-to-order handoff", source: "Quotation" },
  { topic: "customers", table: "health", rid: "R-C2", title: "Account health", source: "CRM Organization" },
  { topic: "customers", table: "accounts", rid: "R-C1", title: "Accounts — pipeline and billing", source: "CRM Organization" },
];
export const currentReport = (table: string) => CURRENT_REPORTS.find((r) => r.table === table);
/** Export follows the source DocType's native "export" permission (same rule as list Export). */
export function canExportReport(table: string, user: string) {
  const r = currentReport(table), m = r ? cachedMeta(r.source) : undefined;
  return !!m && hasPerm(m, "export", undefined, user);
}

/** Non-report destinations used as contextual entries for research groups served by a screen instead of a table. */
export type PageRef = { to: string; label: string; search?: Record<string, string> };
export type ResearchStatus = "implemented" | "name-pending" | "dependency";
export type ResearchReport = { rid: string; group: string; name?: string; status: ResearchStatus; table?: string; related: (ReportRef | PageRef)[]; dependency?: string };

const T = (topic: Topic, table: string): ReportRef => ({ topic, table });
/** Research IDs whose name was matched to an implemented table in earlier waves (REPORT_REGISTRY.md / wf05 / wf07). */
const MATCHED: Record<string, { name: string; table: string }> = {
  "R-005": { name: "Lead first-contact time", table: "firstcontact" },
  "R-006": { name: "Unassigned leads", table: "hygiene" },
  "R-007": { name: "Stale leads", table: "hygiene" },
  "R-008": { name: "Duplicate leads", table: "hygiene" },
  "R-010": { name: "Lead score distribution", table: "score" },
  "R-019": { name: "Stage aging", table: "aging" },
  "R-020": { name: "High-value opportunities without follow-up", table: "hvnf" },
  "R-024": { name: "Stale opportunities", table: "stale" },
  "R-031": { name: "Follow-up compliance", table: "compliance" },
  "R-039b": { name: "Promised close without follow-up", table: "promise" },
};
const ids = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => `R-${String(a + i).padStart(3, "0")}`);
/** Owner-specified research groups (goal §8) with the current reports/screens that serve each group contextually. */
export const RESEARCH_GROUPS: { group: string; ids: string[]; related: (ReportRef | PageRef)[]; dependency?: string }[] = [
  { group: "Lead Acquisition", ids: ids(1, 8), related: [T("leads", "source"), T("leads", "firstcontact"), T("leads", "hygiene"), T("leads", "campaign")] },
  { group: "Lead Qualification", ids: ids(9, 11), related: [T("leads", "score"), T("leads", "status")] },
  { group: "Lead Conversion", ids: ids(12, 13), related: [T("leads", "source")] },
  { group: "Pipeline", ids: ids(14, 20), related: [T("pipeline", "stage"), T("pipeline", "aging"), T("pipeline", "hvnf")] },
  { group: "Opportunity Management", ids: ids(21, 27), related: [T("pipeline", "stale"), T("pipeline", "lost"), T("pipeline", "owner")] },
  { group: "Activities", ids: ids(28, 37), related: [T("activity", "kind"), T("activity", "followup"), T("activity", "compliance"), T("activity", "channel"), T("activity", "calls")] },
  { group: "Follow-up", ids: ["R-038", "R-039", "R-039b"], related: [T("activity", "followup"), T("activity", "compliance"), T("pipeline", "promise")] },
  { group: "Salesperson Performance", ids: ids(40, 41), related: [T("pipeline", "owner"), T("activity", "followup")] },
  { group: "Team Performance", ids: ids(42, 42), related: [{ to: "/digit-crm/sales-teams", label: "Sales Teams" }] },
  { group: "Territories", ids: ids(43, 43), related: [T("pipeline", "territory"), { to: "/digit-crm/territories", label: "Territories" }] },
  { group: "Targets", ids: ids(44, 45), related: [{ to: "/digit-crm/targets", label: "Targets" }] },
  { group: "Forecast", ids: ids(46, 48), related: [{ to: "/digit-crm/forecast", label: "Forecast" }] },
  { group: "Customer Health", ids: ids(49, 52), related: [T("customers", "health"), T("customers", "accounts")] },
  { group: "Communication", ids: ids(53, 53), related: [T("activity", "channel")] },
  { group: "Campaigns", ids: ids(54, 54), related: [T("leads", "campaign"), { to: "/digit-crm/campaigns", label: "Campaigns" }] },
  { group: "Commissions", ids: ids(55, 56), related: [{ to: "/digit-crm/commissions", label: "Commissions" }], dependency: "Approved commission policy" },
  { group: "Quote-to-Order", ids: ids(57, 58), related: [T("customers", "handoff")] },
  { group: "CRM-to-ERP", ids: ids(59, 60), related: [T("customers", "handoff"), T("customers", "accounts")] },
  { group: "Operational Exceptions", ids: ids(61, 62), related: [T("leads", "hygiene"), T("pipeline", "stale"), T("pipeline", "hvnf")] },
  { group: "Executive CRM", ids: ids(63, 64), related: [{ to: "/digit-crm/dashboards", label: "CRM Dashboards", search: { board: "exec" } }] },
];
export const RESEARCH_REPORTS: ResearchReport[] = RESEARCH_GROUPS.flatMap((g) => g.ids.map((rid): ResearchReport => {
  const m = MATCHED[rid];
  if (m) return { rid, group: g.group, name: m.name, status: "implemented", table: m.table, related: g.related };
  return { rid, group: g.group, status: g.dependency ? "dependency" : "name-pending", related: g.related, ...(g.dependency ? { dependency: g.dependency } : {}) };
}));
export const isReportRef = (x: ReportRef | PageRef): x is ReportRef => "table" in x;
export const refTitle = (x: ReportRef | PageRef) => (isReportRef(x) ? currentReport(x.table)?.title ?? x.table : x.label);

/** Catalog search over current reports and research IDs (id, title, group, source). */
export function searchCatalog(q: string) {
  const s = q.trim().toLowerCase(), hit = (...xs: (string | undefined)[]) => !s || xs.some((x) => x?.toLowerCase().includes(s));
  return {
    current: CURRENT_REPORTS.filter((r) => hit(r.rid, r.title, r.topic, r.source)),
    research: RESEARCH_REPORTS.filter((r) => hit(r.rid, r.name, r.group, r.status, ...r.related.map(refTitle))),
  };
}

/** CSV for one rendered report table (UTF-8 BOM so Arabic opens correctly in spreadsheet tools). */
export function tableCsv(cols: string[], rows: { label: string; cells: (number | string | null)[] }[], total?: (number | string | null)[]) {
  const esc = (v: unknown) => { const x = v === null || v === undefined ? "" : String(v); return /[",\n\r]/.test(x) ? `"${x.replace(/"/g, '""')}"` : x; };
  const lines = [cols.map(esc).join(","), ...rows.map((r) => [r.label, ...r.cells].map(esc).join(",")), ...(total ? [["Total", ...total].map(esc).join(",")] : [])];
  return `\uFEFF${lines.join("\r\n")}`;
}
