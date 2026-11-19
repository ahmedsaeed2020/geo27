/**
 * CRM department workspaces — composition only. Each department panel reuses board widgets (W-xxx, wf10) and contextual
 * metrics (C-xxx, wf11) by stable id, so a number shown on a workspace is the same computation, scope and drill as on the
 * board. The 37 research IA nodes map to the existing owner-approved routes (the menu is not regrouped).
 */
import { BOARD_IDS, boardOfWidget, buildBoard, type BoardFilter, type BoardId, type BoardMemo, type Widget } from "./wf10";
import { contextWidget, isCtxId } from "./wf11";
import type { PageRef, ReportRef } from "./wf12";

export type DeptId =
  | "home" | "mywork" | "manager" | "leads" | "contacts" | "accounts" | "customer360" | "deals" | "pipeline"
  | "activities" | "tasks" | "calls" | "followups" | "campaigns" | "teams" | "territories" | "targets" | "forecast" | "commissions" | "admin";
export type DeptSpec = {
  id: DeptId; title: string;
  /** Research IA node codes served by this department panel. */
  nodes: string[];
  /** KPI band (3–5) and analytical/priority panels, by widget id; order is the system default layout. */
  kpis: string[]; panels: string[];
  reports: (ReportRef | PageRef)[];
  /** Owner/period filter applies (only filterable widgets honor it; the rest are labelled "all permitted records"). */
  filters: boolean;
  /** Registers/boards: KPI band visible, analysis collapsed until opened, so the working list stays on screen. */
  compact?: boolean;
};
const T = (topic: ReportRef["topic"], table: string): ReportRef => ({ topic, table });
const P = (to: string, label: string, search?: Record<string, string>): PageRef => ({ to, label, ...(search ? { search } : {}) });

export const DEPTS: Record<DeptId, DeptSpec> = {
  home: { id: "home", title: "CRM Home", nodes: ["GH"], filters: true,
    kpis: ["W-017", "W-041", "W-001", "W-020", "C-GH-01"], panels: ["W-033", "W-047", "W-011", "W-058"],
    reports: [T("pipeline", "stage"), T("activity", "followup"), P("/digit-crm/dashboards", "CRM Dashboards", { board: "exec" })] },
  mywork: { id: "mywork", title: "My Work", nodes: ["SW"], filters: false,
    kpis: ["W-020", "W-023", "C-GH-01"], panels: ["W-019", "W-021", "W-022"],
    reports: [T("activity", "followup"), P("/digit-crm/dashboards", "Sales Rep board", { board: "rep" })] },
  manager: { id: "manager", title: "Manager", nodes: ["MW"], filters: true,
    kpis: ["W-008", "W-077", "W-016", "W-039"], panels: ["W-013", "W-009", "W-012", "W-010", "W-014", "W-015"],
    reports: [T("pipeline", "owner"), T("activity", "compliance"), T("pipeline", "hvnf"), P("/digit-crm/dashboards", "Sales Manager board", { board: "mgr" })] },
  leads: { id: "leads", title: "Leads", nodes: ["LD", "LDET"], filters: true, compact: true,
    kpis: ["W-029", "W-028", "W-045", "W-076"], panels: ["W-025", "W-026", "W-030", "W-027", "W-031", "W-032", "W-080"],
    reports: [T("leads", "source"), T("leads", "firstcontact"), T("leads", "hygiene"), T("leads", "score"), T("leads", "campaign"), P("/digit-crm/dashboards", "Lead board", { board: "lead" })] },
  contacts: { id: "contacts", title: "Contacts", nodes: ["CT"], filters: false, compact: true,
    kpis: ["C-CT-01", "C-CT-02", "C-AC-01"], panels: ["C-CT-03", "C-CT-04"],
    reports: [T("customers", "accounts")] },
  accounts: { id: "accounts", title: "Accounts", nodes: ["AC"], filters: false, compact: true,
    kpis: ["C-AC-01", "W-062", "W-061", "W-060"], panels: ["W-057", "W-063", "W-058", "W-059", "W-064"],
    reports: [T("customers", "health"), T("customers", "accounts"), P("/digit-crm/dashboards", "Account Health board", { board: "health" })] },
  customer360: { id: "customer360", title: "Customer 360", nodes: ["C360"], filters: false,
    kpis: ["C-AC-01", "W-005", "W-060", "W-061"], panels: ["W-057", "W-064", "W-043"],
    reports: [T("customers", "accounts"), T("customers", "handoff")] },
  deals: { id: "deals", title: "Deals", nodes: ["OP", "OPD"], filters: true, compact: true,
    kpis: ["W-001", "W-002", "W-004", "W-006"], panels: ["W-033", "W-036", "W-037", "W-034", "W-015"],
    reports: [T("pipeline", "stage"), T("pipeline", "owner"), T("pipeline", "stale"), T("pipeline", "lost"), P("/digit-crm/dashboards", "Pipeline board", { board: "pipe" })] },
  pipeline: { id: "pipeline", title: "Pipeline", nodes: ["PK", "PR", "QH", "SOH", "SIC", "COL"], filters: true, compact: true,
    kpis: ["W-001", "W-002", "W-039", "C-SO-01", "C-SI-01"], panels: ["W-034", "W-035", "W-040", "W-036", "C-QH-01", "C-QH-02", "W-075", "W-060"],
    reports: [T("pipeline", "aging"), T("pipeline", "promise"), T("customers", "handoff"), T("customers", "accounts")] },
  activities: { id: "activities", title: "Activities", nodes: ["AV", "EM", "WA"], filters: false, compact: true,
    kpis: ["C-GH-01", "W-041", "W-044", "W-070", "W-071"], panels: ["W-047", "W-042", "W-067", "W-043", "W-068"],
    reports: [T("activity", "kind"), T("activity", "channel"), P("/digit-crm/dashboards", "Activity board", { board: "act" }), P("/digit-crm/dashboards", "Communication board", { board: "comm" })] },
  tasks: { id: "tasks", title: "Tasks", nodes: ["TK"], filters: false, compact: true,
    kpis: ["W-017", "W-041", "W-044"], panels: ["W-022", "W-042"],
    reports: [T("activity", "followup"), T("activity", "compliance")] },
  calls: { id: "calls", title: "Call Logs", nodes: ["CL"], filters: false, compact: true,
    kpis: ["W-071"], panels: ["C-CL-01"],
    reports: [T("activity", "calls"), T("activity", "channel")] },
  followups: { id: "followups", title: "Follow-ups", nodes: ["FU", "MT"], filters: false, compact: true,
    kpis: ["W-017", "W-041", "W-046", "C-MT-01", "C-MT-02"], panels: ["W-010", "W-048"],
    reports: [T("activity", "followup"), T("activity", "compliance"), T("pipeline", "promise")] },
  campaigns: { id: "campaigns", title: "Campaigns", nodes: ["CMP"], filters: true,
    kpis: ["W-021", "W-027"], panels: ["W-031", "C-CMP-01", "W-026"],
    reports: [T("leads", "campaign"), T("leads", "source")] },
  teams: { id: "teams", title: "Sales Teams", nodes: ["ST", "SP"], filters: true,
    kpis: ["W-077", "W-006", "W-004"], panels: ["W-013", "W-009", "W-014", "W-010"],
    reports: [T("pipeline", "owner"), T("activity", "followup"), T("activity", "compliance")] },
  territories: { id: "territories", title: "Territories", nodes: ["TR"], filters: true,
    kpis: ["W-001", "W-006"], panels: ["W-038"],
    reports: [T("pipeline", "territory")] },
  targets: { id: "targets", title: "Targets", nodes: ["TG"], filters: false,
    kpis: ["W-020", "W-008", "W-051"], panels: ["W-013", "C-TG-01"],
    reports: [P("/digit-crm/forecast", "Forecast"), T("pipeline", "owner")] },
  forecast: { id: "forecast", title: "Forecast", nodes: ["FC"], filters: false,
    kpis: ["W-049", "W-050", "W-052", "W-051", "W-053"], panels: ["W-054", "W-055", "W-036"],
    reports: [P("/digit-crm/dashboards", "Forecast board", { board: "fcb" }), T("pipeline", "stage")] },
  commissions: { id: "commissions", title: "Commissions", nodes: ["CM"], filters: false,
    kpis: ["W-079"], panels: [],
    reports: [P("/digit-crm/dashboards", "CRM Operations board", { board: "ops" })] },
  admin: { id: "admin", title: "Administration", nodes: ["AU", "IM", "SET", "RP", "MOB"], filters: false,
    kpis: ["W-073", "W-076", "W-078", "W-080"], panels: ["W-075"],
    reports: [T("leads", "hygiene"), P("/digit-crm/dashboards", "CRM Operations board", { board: "ops" })] },
};

/** Research IA nodes (37) → current route and the department panel / screen that carries their context. */
export type IaNode = { id: string; group: string; label: string; route: string; dept?: DeptId; note?: string };
export const IA_NODES: IaNode[] = [
  { id: "GH", group: "Home & My Work", label: "CRM Global Home", route: "/digit-crm/home", dept: "home" },
  { id: "SW", group: "Home & My Work", label: "Salesperson Workspace", route: "/digit-crm", dept: "mywork" },
  { id: "MW", group: "Home & My Work", label: "Sales Manager Workspace", route: "/digit-crm/manager", dept: "manager" },
  { id: "LD", group: "Customers & Qualification", label: "Leads", route: "/crm/leads", dept: "leads" },
  { id: "LDET", group: "Customers & Qualification", label: "Lead Detail", route: "/crm/leads/$id", dept: "leads", note: "Lead form + Lead Workspace panel (status, activity, first response, next activity, score, campaign, converted deal)" },
  { id: "CT", group: "Customers & Qualification", label: "Contacts", route: "/crm/contacts", dept: "contacts" },
  { id: "AC", group: "Customers & Qualification", label: "Accounts", route: "/crm/organizations", dept: "accounts" },
  { id: "C360", group: "Customers & Qualification", label: "Customer 360", route: "/digit-crm/customers/$org", dept: "customer360" },
  { id: "OP", group: "Sales Pipeline & ERP Handoff", label: "Opportunities register", route: "/crm/deals", dept: "deals" },
  { id: "PK", group: "Sales Pipeline & ERP Handoff", label: "Pipeline Kanban", route: "/digit-crm/pipeline", dept: "pipeline" },
  { id: "OPD", group: "Sales Pipeline & ERP Handoff", label: "Opportunity detail", route: "/digit-crm/deals/$id", dept: "deals", note: "Stage strip, products, quotation and customer handoff on the deal" },
  { id: "PR", group: "Sales Pipeline & ERP Handoff", label: "Products", route: "/digit-crm/deals/$id", dept: "pipeline", note: "Deal product lines (CRM Products child table)" },
  { id: "QH", group: "Sales Pipeline & ERP Handoff", label: "Quotation handoff", route: "/app/selling/quotation", dept: "pipeline" },
  { id: "SOH", group: "Sales Pipeline & ERP Handoff", label: "Sales Order handoff", route: "/app/selling/sales-order", dept: "pipeline" },
  { id: "SIC", group: "Sales Pipeline & ERP Handoff", label: "Sales Invoice context", route: "/app/accounts/sales-invoice", dept: "pipeline" },
  { id: "COL", group: "Sales Pipeline & ERP Handoff", label: "Collections context", route: "/digit-crm/customers/$org", dept: "pipeline", note: "Read-only receivables on Customer 360; W-060 overdue receivables" },
  { id: "AV", group: "Activities & Communication", label: "Activities", route: "/digit-crm/activities", dept: "activities" },
  { id: "TK", group: "Activities & Communication", label: "Tasks", route: "/crm/tasks", dept: "tasks" },
  { id: "CL", group: "Activities & Communication", label: "Call Logs", route: "/crm/call-logs", dept: "calls" },
  { id: "MT", group: "Activities & Communication", label: "Meetings", route: "/digit-crm/follow-ups", dept: "followups", note: "Event records (upcoming / missed)" },
  { id: "EM", group: "Activities & Communication", label: "Email", route: "/digit-crm/activities", dept: "activities", note: "W-070 email reply rate, channel mix" },
  { id: "WA", group: "Activities & Communication", label: "WhatsApp", route: "/digit-crm/activities", dept: "activities", note: "Production gate: needs a connected WhatsApp Business account; demo shows labelled simulated messages" },
  { id: "FU", group: "Activities & Communication", label: "Follow-ups", route: "/digit-crm/follow-ups", dept: "followups" },
  { id: "CMP", group: "Sales Growth & Leadership", label: "Campaigns", route: "/digit-crm/campaigns", dept: "campaigns" },
  { id: "ST", group: "Sales Growth & Leadership", label: "Sales Teams", route: "/digit-crm/sales-teams", dept: "teams" },
  { id: "SP", group: "Sales Growth & Leadership", label: "Salespersons", route: "/digit-crm/sales-teams", dept: "teams", note: "Per-person rows on Sales Teams and Targets" },
  { id: "TR", group: "Sales Growth & Leadership", label: "Territories", route: "/digit-crm/territories", dept: "territories" },
  { id: "TG", group: "Sales Growth & Leadership", label: "Targets", route: "/digit-crm/targets", dept: "targets" },
  { id: "CM", group: "Sales Growth & Leadership", label: "Commissions", route: "/digit-crm/commissions", dept: "commissions", note: "Production calculations need an approved commission policy" },
  { id: "FC", group: "Sales Growth & Leadership", label: "Forecast", route: "/digit-crm/forecast", dept: "forecast" },
  { id: "RC", group: "Reports & Intelligence", label: "Reports Center", route: "/digit-crm/reports", note: "Topic reports, searchable catalog, research registry, CSV export by permission" },
  { id: "DB", group: "Reports & Intelligence", label: "Dashboards", route: "/digit-crm/dashboards", note: "10 boards / 80 widgets with owner/period filter and personal layout" },
  { id: "AU", group: "Administration & Channels", label: "Automation", route: "/digit-crm/automation", dept: "admin" },
  { id: "IM", group: "Administration & Channels", label: "Import", route: "/app/frappe/data-import", dept: "admin", note: "Native Data Import" },
  { id: "SET", group: "Administration & Channels", label: "Settings", route: "/digit-crm/settings", dept: "admin" },
  { id: "RP", group: "Administration & Channels", label: "Roles & Permissions", route: "/digit-crm/settings", dept: "admin", note: "Native Role Permission Manager / User Permission records" },
  { id: "MOB", group: "Administration & Channels", label: "Mobile", route: "/digit-crm/mobile", dept: "admin" },
];

/** Resolve widget ids to widgets: board widgets come from their own board (built once per board), C- ids from wf11. */
export function resolveWidgets(ids: readonly string[], user: string, f: BoardFilter = {}, now = new Date()): Widget[] {
  const boards = new Map<BoardId, Widget[]>(), memo: BoardMemo = new Map();
  const out: Widget[] = [];
  for (const id of ids) {
    if (isCtxId(id)) { out.push(contextWidget(id, user, f, now)); continue; }
    const b = boardOfWidget(id); if (!b || !BOARD_IDS.includes(b)) continue;
    if (!boards.has(b)) boards.set(b, buildBoard(b, user, now, f, memo).widgets);
    const w = boards.get(b)?.find((x) => x.id === id); if (w) out.push(w);
  }
  return out;
}
export const deptWidgetIds = (d: DeptSpec) => [...new Set([...d.kpis, ...d.panels])];
