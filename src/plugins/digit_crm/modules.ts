/**
 * DIGIT CRM module command centers — composition only (no formulas, no stored values).
 * Each module answers one business question by arranging EXISTING widgets (W-xxx from wf10, C-xxx from wf11) with a
 * visualization chosen for their meaning (part-to-whole → donut, progression → funnel, time → area/columns, owner ×
 * category → stacked, attainment → bullets, exceptions → ranked worklists). Every number, segment and row keeps the
 * widget's own drill, so a click opens exactly the records it counts. Worklists read the shared wf04 drill keys.
 */
import type { BoardId } from "./wf10";
import type { PageRef, ReportRef } from "./wf12";
import type { Topic } from "./wf04";

export const MODULE_IDS = ["home", "customers", "pipeline", "activities", "management", "health", "admin"] as const;
export type ModuleId = (typeof MODULE_IDS)[number];
export const isModuleId = (v: unknown): v is ModuleId => (MODULE_IDS as readonly string[]).includes(String(v));

export type Tone = "critical" | "warning" | "positive" | "neutral";
export type Viz = "donut" | "funnel" | "area" | "columns" | "stacked" | "heat" | "bullets" | "ranked" | "bars" | "exceptions" | "auto";
export type SignalSpec = { id: string; tone: Tone };
/** `ids` is used by the "exceptions" visualization: one ranked row per listed widget (count + drill). */
export type PanelSpec = { id: string; viz: Viz; unit?: string; wide?: boolean; title?: string; ids?: string[] };
export type ReasonSpec = { key: string; reason: string; tone: Tone; cat: Topic };
export type WorkBlock =
  | { kind: "queue"; only?: "deals"; title: string }
  | { kind: "widget"; id: string; viz: Viz; unit?: string }
  | { kind: "unassigned" } | { kind: "followups" } | { kind: "teams" } | { kind: "manager-exceptions" }
  | { kind: "recent-deals" } | { kind: "timeline" } | { kind: "coverage" };
export type ActionSpec = { kind: "add-lead" } | { kind: "schedule" } | { kind: "link"; label: string; to: string; search?: Record<string, string> };
export type DocLink = { label: string; to: string; search?: Record<string, string>; kind: "digit" | "native" | "desk" };
export const TABS = ["overview", "work", "documents", "reports", "details"] as const;
export type TabId = (typeof TABS)[number];
export const TAB_LABEL: Record<TabId, string> = { overview: "Overview", work: "Work & Activities", documents: "Documents", reports: "Reports", details: "Details" };
export const isTab = (v: unknown): v is TabId => (TABS as readonly string[]).includes(String(v));

export type ModuleSpec = {
  id: ModuleId; title: string; question: string;
  /** CRM_NAV group whose sections this module owns (Documents tab, sidebar context). */
  nav: string;
  /** Personal/team layout key (boardLayout); CRM Home keeps the existing `dept:home` key so saved layouts still apply. */
  dash: string;
  /** Owner/period filter applies (only filterable widgets honor it; others are labelled "all permitted records"). */
  filters: boolean;
  signals: SignalSpec[]; panels: PanelSpec[];
  /** Salesperson variant (CRM Home is role-based); managers and administrators see `signals`/`panels`. */
  rep?: { signals: SignalSpec[]; panels: PanelSpec[] };
  worklist?: { title: string; reasons: ReasonSpec[] };
  /** Show the ranked action queue (wf09 actionQueue) on the Overview. */
  priorities?: boolean;
  work: WorkBlock[];
  reports: (ReportRef | PageRef)[]; boards: BoardId[]; topics: Topic[];
  /** Section labels taken from the nav group (default: all); extra canonical documents for this module. */
  docs?: string[]; extraDocs?: DocLink[];
  /** DocTypes in the Details tab data-readiness table (default: every CRM source). */
  doctypes?: string[];
  /** Known data dependencies that keep a metric unavailable — shown truthfully, never as zero. */
  notes?: { label: string; reason: string }[];
  actions: ActionSpec[];
};

const T = (topic: ReportRef["topic"], table: string): ReportRef => ({ topic, table });
const P = (to: string, label: string, search?: Record<string, string>): PageRef => ({ to, label, ...(search ? { search } : {}) });
const S = (id: string, tone: Tone): SignalSpec => ({ id, tone });
const link = (label: string, to: string, search?: Record<string, string>): ActionSpec => ({ kind: "link", label, to, ...(search ? { search } : {}) });

export const MODULES: Record<ModuleId, ModuleSpec> = {
  home: {
    id: "home", title: "CRM Home", question: "What needs attention today?", nav: "home", dash: "dept:home", filters: true, priorities: true,
    signals: [S("W-041", "critical"), S("W-017", "warning"), S("C-GH-01", "neutral"), S("W-001", "neutral"), S("W-002", "positive")],
    panels: [
      { id: "W-047", viz: "area", unit: "Activities", wide: true }, { id: "W-003", viz: "bullets" },
      { id: "W-034", viz: "bars", unit: "Weighted value" },
      { id: "EX-home", viz: "exceptions", title: "Critical exceptions", ids: ["W-078", "W-080", "W-015", "W-075", "W-029", "W-076"] },
      { id: "W-013", viz: "bullets" },
    ],
    rep: {
      signals: [S("W-018", "critical"), S("W-017", "warning"), S("C-GH-01", "neutral"), S("W-001", "neutral"), S("W-002", "positive")],
      panels: [
        { id: "W-022", viz: "area", unit: "Activities", wide: true }, { id: "W-020", viz: "bullets" }, { id: "W-019", viz: "ranked" },
        { id: "W-034", viz: "bars", unit: "Weighted value" },
        { id: "EX-home", viz: "exceptions", title: "Critical exceptions", ids: ["W-078", "W-080", "W-015", "W-029"] },
      ],
    },
    work: [{ kind: "queue", title: "Action queue" }, { kind: "recent-deals" }, { kind: "timeline" }],
    reports: [T("pipeline", "stage"), T("activity", "followup"), P("/digit-crm/dashboards", "CRM Dashboards", { board: "exec" })],
    boards: ["exec", "mgr", "rep"], topics: ["pipeline", "activity"],
    doctypes: ["CRM Lead", "CRM Deal", "CRM Task", "CRM Call Log", "FCRM Note", "Communication", "Sales Person"],
    actions: [{ kind: "add-lead" }, { kind: "schedule" }, link("My Work", "/digit-crm")],
  },
  customers: {
    id: "customers", title: "Customers & Qualification", question: "Are incoming leads becoming qualified opportunities?", nav: "customers", dash: "ws:customers", filters: true,
    signals: [S("W-029", "critical"), S("W-045", "warning"), S("W-028", "neutral"), S("W-076", "warning"), S("C-CT-01", "neutral")],
    panels: [
      { id: "W-026", viz: "donut", unit: "Leads" }, { id: "W-030", viz: "funnel", unit: "Leads" },
      { id: "W-025", viz: "area", unit: "Leads per week", wide: true },
      { id: "C-LD-01", viz: "columns", unit: "Open leads" }, { id: "W-027", viz: "bars", unit: "% converted" },
    ],
    worklist: { title: "Leads needing action", reasons: [
      { key: "unassigned:", reason: "No owner", tone: "critical", cat: "leads" },
      { key: "dup:", reason: "Possible duplicate", tone: "warning", cat: "leads" },
      { key: "firstcontact:", reason: "Never contacted", tone: "warning", cat: "leads" },
      { key: "stalelead:", reason: "No recent activity", tone: "warning", cat: "leads" },
    ] },
    work: [{ kind: "unassigned" }, { kind: "widget", id: "W-080", viz: "ranked" }, { kind: "widget", id: "W-032", viz: "ranked" }, { kind: "widget", id: "W-021", viz: "ranked" }],
    reports: [T("leads", "source"), T("leads", "firstcontact"), T("leads", "hygiene"), T("leads", "score"), T("leads", "campaign"), T("customers", "accounts"), P("/digit-crm/dashboards", "Lead board", { board: "lead" })],
    boards: ["lead", "health"], topics: ["leads"],
    doctypes: ["CRM Lead", "Contact", "CRM Organization", "Customer", "Campaign"],
    actions: [{ kind: "add-lead" }, link("Leads", "/crm/leads"), link("Qualification & Conversion", "/digit-crm/qualification")],
  },
  pipeline: {
    id: "pipeline", title: "Opportunities & Sales", question: "Where is our pipeline value, and what is blocking progress?", nav: "pipeline", dash: "ws:pipeline", filters: true,
    signals: [S("W-001", "neutral"), S("W-002", "positive"), S("W-004", "positive"), S("W-039", "neutral"), S("W-015", "critical")],
    panels: [
      { id: "W-040", viz: "funnel", unit: "% of deals" }, { id: "W-012", viz: "heat", unit: "Open deals" },
      { id: "C-PL-01", viz: "stacked", unit: "Open deals", wide: true },
      { id: "W-036", viz: "columns", unit: "Open deals" }, { id: "W-034", viz: "bars", unit: "Weighted value" },
    ],
    worklist: { title: "Deals blocking progress", reasons: [
      { key: "hvnf:", reason: "High value, no next action", tone: "critical", cat: "pipeline" },
      { key: "promise:", reason: "Close date promised, no follow-up", tone: "warning", cat: "pipeline" },
      { key: "staledeal:*", reason: "No recent activity", tone: "warning", cat: "pipeline" },
    ] },
    work: [{ kind: "queue", only: "deals", title: "Deals without next action" }, { kind: "widget", id: "W-037", viz: "ranked" }, { kind: "widget", id: "W-075", viz: "ranked" }, { kind: "widget", id: "C-QH-02", viz: "donut", unit: "Quotations" }, { kind: "widget", id: "C-QH-01", viz: "bars", unit: "Quotations" }],
    reports: [T("pipeline", "stage"), T("pipeline", "owner"), T("pipeline", "aging"), T("pipeline", "stale"), T("pipeline", "lost"), T("pipeline", "promise"), T("customers", "handoff"), P("/digit-crm/dashboards", "Pipeline board", { board: "pipe" })],
    boards: ["pipe", "fcb"], topics: ["pipeline"],
    doctypes: ["CRM Deal", "CRM Deal Status", "Quotation", "Sales Order", "Sales Invoice"],
    actions: [link("Pipeline", "/digit-crm/pipeline"), link("Pipeline Kanban", "/digit-crm/pipeline", { tab: "board" }), link("Deals & Opportunities", "/crm/deals")],
  },
  activities: {
    id: "activities", title: "Activities & Communication", question: "Which customer interactions require action today?", nav: "activities", dash: "ws:activities", filters: false,
    signals: [S("W-041", "critical"), S("W-017", "warning"), S("C-GH-01", "neutral"), S("W-044", "positive"), S("W-045", "warning")],
    panels: [
      { id: "W-047", viz: "area", unit: "Activities", wide: true }, { id: "W-042", viz: "donut", unit: "Activities" },
      { id: "W-067", viz: "donut", unit: "Messages and calls" }, { id: "C-CL-01", viz: "donut", unit: "Calls" },
      { id: "W-010", viz: "bullets" },
      { id: "EX-meet", viz: "exceptions", title: "Meetings and callbacks", ids: ["C-MT-01", "C-MT-02", "W-046", "W-023"] },
    ],
    worklist: { title: "Interactions requiring action", reasons: [
      { key: "taskoverdue:", reason: "Overdue follow-up", tone: "critical", cat: "activity" },
      { key: "meetings:missed", reason: "Missed meeting", tone: "warning", cat: "activity" },
      { key: "firstcontact:", reason: "Lead never contacted", tone: "warning", cat: "leads" },
    ] },
    work: [{ kind: "followups" }, { kind: "timeline" }, { kind: "widget", id: "W-043", viz: "ranked" }],
    reports: [T("activity", "followup"), T("activity", "compliance"), T("activity", "kind"), T("activity", "channel"), T("activity", "calls"), P("/digit-crm/dashboards", "Activity board", { board: "act" }), P("/digit-crm/dashboards", "Communication board", { board: "comm" })],
    boards: ["act", "comm"], topics: ["activity"],
    doctypes: ["CRM Task", "FCRM Note", "CRM Call Log", "Communication", "Event"],
    notes: [
      { label: "WhatsApp", reason: "Needs a connected WhatsApp Business account" },
      { label: "Meetings", reason: "Counted from Event records; none means no meeting has been recorded" },
      { label: "Promised callbacks", reason: "CRM Call Log has no callback-promise field" },
    ],
    actions: [{ kind: "schedule" }, link("Follow-up Center", "/digit-crm/follow-ups", { tab: "overdue" }), link("All Activities", "/digit-crm/activities")],
  },
  management: {
    id: "management", title: "Sales Management", question: "Which teams and activities are producing results?", nav: "management", dash: "ws:management", filters: true,
    signals: [S("W-006", "positive"), S("W-004", "positive"), S("W-052", "neutral"), S("W-008", "neutral"), S("W-077", "critical")],
    panels: [
      { id: "C-ST-01", viz: "stacked", unit: "Deals", wide: true },
      { id: "W-009", viz: "bars", unit: "Open value" }, { id: "W-013", viz: "bullets" },
      { id: "W-014", viz: "ranked" }, { id: "C-TG-01", viz: "columns", unit: "Sales orders" },
      { id: "W-054", viz: "bars", unit: "Weighted value" }, { id: "W-053", viz: "auto" },
      { id: "C-CMP-01", viz: "bars", unit: "Open deals" }, { id: "W-038", viz: "bars", unit: "Open deals" },
      { id: "W-079", viz: "auto" },
    ],
    worklist: { title: "Management action queue", reasons: [
      { key: "hvnf:", reason: "High value, no next action", tone: "critical", cat: "pipeline" },
      { key: "staledeal:*", reason: "No recent activity", tone: "warning", cat: "pipeline" },
      { key: "unassigned:", reason: "Lead without owner", tone: "warning", cat: "leads" },
    ] },
    work: [{ kind: "manager-exceptions" }, { kind: "teams" }],
    reports: [T("pipeline", "owner"), T("pipeline", "territory"), T("activity", "followup"), T("activity", "compliance"), T("leads", "campaign"), P("/digit-crm/forecast", "Forecast"), P("/digit-crm/targets", "Targets"), P("/digit-crm/dashboards", "Sales Manager board", { board: "mgr" })],
    boards: ["mgr", "fcb", "ops"], topics: ["pipeline", "activity"],
    doctypes: ["Sales Person", "CRM Deal", "Sales Order", "Campaign", "Fiscal Year"],
    notes: [
      { label: "Commissions", reason: "Production calculations need an approved commission policy" },
      { label: "Forecast history", reason: "No historical forecast snapshots are recorded" },
    ],
    actions: [link("Targets", "/digit-crm/targets"), link("Forecast", "/digit-crm/forecast"), link("Sales Teams", "/digit-crm/sales-teams")],
  },
  health: {
    id: "health", title: "Customer Health", question: "Which customer relationships are healthy and which require intervention?", nav: "customers", dash: "ws:health", filters: false,
    signals: [S("C-AC-01", "neutral"), S("W-060", "critical"), S("W-061", "positive"), S("W-062", "positive"), S("W-005", "positive")],
    panels: [
      { id: "W-057", viz: "donut", unit: "Accounts" }, { id: "W-058", viz: "ranked" },
      { id: "W-063", viz: "bars", unit: "Open deals" }, { id: "W-059", viz: "ranked" }, { id: "W-064", viz: "ranked" },
    ],
    worklist: { title: "Accounts requiring intervention", reasons: [
      { key: "health:At risk", reason: "Overdue receivable", tone: "critical", cat: "customers" },
      { key: "health:Silent", reason: "No activity for 30 days", tone: "warning", cat: "customers" },
    ] },
    work: [{ kind: "widget", id: "W-043", viz: "ranked" }, { kind: "widget", id: "W-075", viz: "ranked" }],
    reports: [T("customers", "health"), T("customers", "accounts"), T("customers", "handoff"), P("/digit-crm/dashboards", "Account Health board", { board: "health" })],
    boards: ["health", "exec"], topics: ["customers"],
    docs: ["Companies & Accounts", "Customer 360", "Contacts"],
    extraDocs: [{ label: "Customers", to: "/app/erpnext/customer", kind: "desk" }, { label: "Sales Invoices", to: "/app/erpnext/sales_invoice", kind: "desk" }],
    doctypes: ["CRM Organization", "Customer", "Contact", "Sales Invoice", "Payment Entry"],
    notes: [{ label: "ERP balances", reason: "Receivables appear only for users who may read Sales Invoice" }],
    actions: [link("Customer 360", "/digit-crm/customers"), link("Companies & Accounts", "/crm/organizations")],
  },
  admin: {
    id: "admin", title: "Administration & Settings", question: "Is CRM data complete, clean and correctly configured?", nav: "admin", dash: "ws:admin", filters: false,
    signals: [S("W-073", "critical"), S("W-076", "warning"), S("W-078", "warning"), S("W-080", "critical")],
    panels: [{ id: "W-075", viz: "ranked", wide: true }, { id: "W-032", viz: "bullets", wide: true }],
    worklist: { title: "Data hygiene queue", reasons: [
      { key: "unassigned:", reason: "No owner", tone: "critical", cat: "leads" },
      { key: "dup:", reason: "Possible duplicate", tone: "warning", cat: "leads" },
    ] },
    work: [{ kind: "coverage" }],
    reports: [T("leads", "hygiene"), P("/digit-crm/dashboards", "CRM Operations board", { board: "ops" })],
    boards: ["ops"], topics: ["leads"],
    actions: [link("Demo dataset", "/digit-crm/demo"), link("CRM Settings", "/digit-crm/settings")],
  },
};

/** Command center that owns a route's sections — used by the sidebar to show Overview / All sections. */
export const MODULE_OF_NAV: Record<string, ModuleId> = { customers: "customers", pipeline: "pipeline", activities: "activities", management: "management", admin: "admin" };
export const workspacePath = (m: ModuleId) => (m === "home" ? "/digit-crm/home" : `/digit-crm/workspace/${m}`);

/** Canonical DocType behind a section route, for the Documents tab's permitted record counts. */
export const DOC_OF_ROUTE: Record<string, string> = {
  "/crm/leads": "CRM Lead", "/crm/contacts": "Contact", "/crm/organizations": "CRM Organization", "/crm/deals": "CRM Deal",
  "/crm/tasks": "CRM Task", "/crm/call-logs": "CRM Call Log", "/crm/notes": "FCRM Note", "/app/frappe/event": "Event",
  "/app/erpnext/item_price": "Item Price", "/app/erpnext/quotation": "Quotation", "/app/erpnext/sales_order": "Sales Order",
  "/app/erpnext/sales_invoice": "Sales Invoice", "/app/erpnext/customer": "Customer", "/app/erpnext/campaign": "Campaign",
  "/app/erpnext/sales_partner": "Sales Partner", "/app/erpnext/sales_person": "Sales Person", "/app/crm/crm_deal_status": "CRM Deal Status",
  "/app/crm/crm_lead_status": "CRM Lead Status", "/app/frappe/role": "Role",
};

/** Every widget id a module composes (signals, panels, exception rows, work blocks), for layout and validation. */
export function moduleWidgetIds(m: ModuleSpec, rep = false): string[] {
  const sig = rep && m.rep ? m.rep.signals : m.signals, pan = rep && m.rep ? m.rep.panels : m.panels;
  return [...new Set([...sig.map((s) => s.id), ...pan.flatMap((p) => (p.viz === "exceptions" ? p.ids ?? [] : [p.id])), ...m.work.flatMap((w) => (w.kind === "widget" ? [w.id] : []))])];
}
/** The visualization a widget gets wherever it is drawn as a chart (first module composition that charts it), so the
 *  department bands on native registers draw the same chart as the module command center. */
export const PANEL_VIZ: ReadonlyMap<string, PanelSpec> = new Map(Object.values(MODULES).flatMap((m) => [...m.panels, ...(m.rep?.panels ?? [])])
  .filter((p) => p.viz !== "exceptions" && p.viz !== "auto").reverse().map((p) => [p.id, { ...p, wide: false }] as const));
/** Layout ids (what the personal layout orders/hides): signals + panels, with an exceptions panel as one item. */
export const layoutIds = (m: ModuleSpec, rep = false) => {
  const sig = rep && m.rep ? m.rep.signals : m.signals, pan = rep && m.rep ? m.rep.panels : m.panels;
  return [...sig.map((s) => s.id), ...pan.map((p) => p.id)];
};

/** Board selector groups (presentation only — the ten boards and their widgets stay in wf10). */
export const BOARD_GROUPS: { label: string; boards: BoardId[] }[] = [
  { label: "Leadership", boards: ["exec", "mgr", "fcb"] },
  { label: "Sales execution", boards: ["rep", "pipe", "lead"] },
  { label: "Engagement", boards: ["act", "comm"] },
  { label: "Customers & operations", boards: ["health", "ops"] },
];
export const BOARD_INFO: Record<BoardId, { title: string; audience: string; purpose: string }> = {
  exec: { title: "Executive CRM Board", audience: "Executives", purpose: "Commercial health, forecast and growth." },
  mgr: { title: "Sales Manager Board", audience: "Sales managers", purpose: "Intervention and accountability." },
  rep: { title: "Salesperson Board", audience: "Salespeople", purpose: "Today's work and direct actions." },
  lead: { title: "Lead Acquisition Board", audience: "Marketing and sales managers", purpose: "Acquisition quality and lead handling." },
  pipe: { title: "Pipeline Board", audience: "Sales managers", purpose: "Stage movement, bottlenecks and upcoming closings." },
  act: { title: "Activity & Follow-up Board", audience: "Sales managers", purpose: "Follow-up discipline." },
  fcb: { title: "Forecast Board", audience: "Executives and sales managers", purpose: "Forecast categories, gap and coverage." },
  health: { title: "Customer Health Board", audience: "Account managers", purpose: "Account risk, silence and value." },
  comm: { title: "Communication Board", audience: "Sales and service teams", purpose: "Channel volume and responsiveness." },
  ops: { title: "Operations Exceptions Board", audience: "Sales operations", purpose: "Records needing action now." },
};
