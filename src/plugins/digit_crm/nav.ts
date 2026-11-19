/**
 * DIGIT CRM application navigation — owned by digit_crm (no DIGIT Pro imports).
 * 7 sidebar sections resolved against the 37-node IA / 24-screen atlas (research package 04/07).
 * kind: digit = DIGIT CRM screen, native = Frappe CRM screen (/crm/*, not routed in the merged site build — /crm is the website), desk = canonical Desk list/report,
 * missing = no verified source yet (rendered disabled with its reason, never a fake page).
 * Every `to` is an existing registered route; no item implies a new DocType.
 */
export type NavItem = { label: string; to?: string; search?: Record<string, string>; kind: "digit" | "native" | "desk" | "missing"; reason?: string };
export type NavGroup = { id: string; label: string; icon: string; items: NavItem[] };

export const CRM_NAV: NavGroup[] = [
  { id: "home", label: "Home", icon: "dashboard", items: [
    { label: "CRM Dashboard", to: "/digit-crm/home", kind: "digit" },
    { label: "My Work", to: "/digit-crm", kind: "digit" },
    { label: "Manager Workbench", to: "/digit-crm/manager", kind: "digit" },
  ] },
  { id: "customers", label: "Customers & Qualification", icon: "users", items: [
    { label: "Overview", to: "/digit-crm/workspace/customers", kind: "digit" },
    { label: "Leads", to: "/digit-crm/leads", kind: "digit" },
    { label: "Contacts", to: "/digit-crm/contacts", kind: "digit" },
    { label: "Companies & Accounts", to: "/app/crm/crm_organization", kind: "desk" },
    { label: "Customer 360", to: "/digit-crm/customers", kind: "digit" },
    { label: "Customer Health", to: "/digit-crm/workspace/health", kind: "digit" },
    { label: "Qualification & Conversion", to: "/digit-crm/qualification", kind: "digit" },
    { label: "All sections", to: "/digit-crm/workspace/customers", search: { tab: "documents" }, kind: "digit" },
  ] },
  { id: "pipeline", label: "Opportunities & Sales", icon: "pipeline", items: [
    { label: "Overview", to: "/digit-crm/workspace/pipeline", kind: "digit" },
    { label: "Deals & Opportunities", to: "/app/crm/crm_deal", kind: "desk" },
    { label: "Pipeline", to: "/digit-crm/pipeline", kind: "digit" },
    { label: "Pipeline Kanban", to: "/digit-crm/pipeline", search: { tab: "board" }, kind: "digit" },
    { label: "Products & Price Lists", to: "/app/erpnext/item_price", kind: "desk" },
    { label: "Quotations", to: "/app/erpnext/quotation", kind: "desk" },
    { label: "Sales Orders", to: "/app/erpnext/sales_order", kind: "desk" },
    { label: "Sales Invoices", to: "/app/erpnext/sales_invoice", kind: "desk" },
    { label: "All sections", to: "/digit-crm/workspace/pipeline", search: { tab: "documents" }, kind: "digit" },
  ] },
  { id: "activities", label: "Activities & Communication", icon: "activity", items: [
    { label: "Overview", to: "/digit-crm/workspace/activities", kind: "digit" },
    { label: "All Activities", to: "/digit-crm/activities", kind: "digit" },
    { label: "Tasks & Follow-ups", to: "/digit-crm/activities", search: { view: "task" }, kind: "digit" },
    { label: "Follow-up Center", to: "/digit-crm/follow-ups", kind: "digit" },
    { label: "Call Logs", to: "/digit-crm/activities", search: { view: "call" }, kind: "digit" },
    { label: "Meetings", to: "/digit-crm/activities", search: { view: "meeting" }, kind: "digit" },
    { label: "Notes", to: "/digit-crm/activities", search: { view: "note" }, kind: "digit" },
    { label: "WhatsApp", to: "/digit-crm/activities", search: { view: "message" }, kind: "digit" },
    { label: "All sections", to: "/digit-crm/workspace/activities", search: { tab: "documents" }, kind: "digit" },
  ] },
  { id: "management", label: "Sales Management", icon: "team", items: [
    { label: "Overview", to: "/digit-crm/workspace/management", kind: "digit" },
    { label: "Campaigns", to: "/app/erpnext/campaign", kind: "desk" },
    { label: "Campaign Results", to: "/digit-crm/campaigns", kind: "digit" },
    { label: "Sales Partners", to: "/app/erpnext/sales_partner", kind: "desk" },
    { label: "Sales Teams", to: "/digit-crm/sales-teams", kind: "digit" },
    { label: "Sales Persons", to: "/app/erpnext/sales_person", kind: "desk" },
    { label: "Territories", to: "/digit-crm/territories", kind: "digit" },
    { label: "Targets", to: "/digit-crm/targets", kind: "digit" },
    { label: "Forecast", to: "/digit-crm/forecast", kind: "digit" },
    { label: "Commissions", to: "/digit-crm/commissions", kind: "digit" },
    { label: "All sections", to: "/digit-crm/workspace/management", search: { tab: "documents" }, kind: "digit" },
  ] },
  { id: "reports", label: "Reports & Intelligence", icon: "reports", items: [
    { label: "Reports Center", to: "/digit-crm/reports", kind: "digit" },
    { label: "Dashboards", to: "/digit-crm/dashboards", kind: "digit" },
    { label: "Native CRM Dashboard", kind: "missing", reason: "The classic CRM screens are not part of this site build" },
    { label: "Sales Pipeline & Opportunity Performance", to: "/digit-crm/reports", search: { cat: "pipeline" }, kind: "digit" },
    { label: "Leads, Sources & Conversion", to: "/digit-crm/reports", search: { cat: "leads" }, kind: "digit" },
    { label: "Salesperson Activities & Follow-up", to: "/digit-crm/reports", search: { cat: "activity" }, kind: "digit" },
    { label: "Customer & Commercial Performance", to: "/digit-crm/reports", search: { cat: "customers" }, kind: "digit" },
  ] },
  { id: "admin", label: "Administration & Settings", icon: "settings", items: [
    { label: "Overview", to: "/digit-crm/workspace/admin", kind: "digit" },
    { label: "Demo dataset", to: "/digit-crm/demo", kind: "digit" },
    { label: "CRM Automation", to: "/digit-crm/automation", kind: "digit" },
    { label: "CRM Settings", to: "/digit-crm/settings", kind: "digit" },
    { label: "Sales Stages", to: "/app/crm/crm_deal_status", kind: "desk" },
    { label: "Lead Statuses", to: "/app/crm/crm_lead_status", kind: "desk" },
    { label: "Import & Data Mapping", to: "/app/data-import", kind: "desk" },
    { label: "Channels & Integrations", to: "/app/crm/erpnext_crm_settings", kind: "desk" },
    { label: "Roles & Permissions", to: "/app/frappe/role", kind: "desk" },
    { label: "Mobile CRM", to: "/digit-crm/mobile", kind: "digit" },
    { label: "All sections", to: "/digit-crm/workspace/admin", search: { tab: "documents" }, kind: "digit" },
  ] },
];

const norm = (p: string) => p.replace(/\/$/, "") || "/";

/** Section owning a path (longest-prefix match). Deal detail belongs to the pipeline section. */
export const groupOfPath = (path: string): NavGroup => {
  const fallback: NavGroup = CRM_NAV[0] ?? { id: "home", label: "Home", icon: "dashboard", items: [] };
  const p = norm(path);
  if (p.startsWith("/digit-crm/deal/") || p.startsWith("/digit-crm/deals/") || p.startsWith("/app/crm/crm_deal/")) return CRM_NAV.find((g) => g.id === "pipeline") ?? fallback;
  if (p.startsWith("/digit-crm/lead/") || p.startsWith("/app/crm/crm_lead/") || p === "/crm/leads" || p.startsWith("/crm/leads/")) return CRM_NAV.find((g) => g.id === "customers") ?? fallback;
  let best: { g: NavGroup; len: number } | null = null;
  for (const g of CRM_NAV) for (const i of g.items) if (i.to && (p === i.to || (i.to !== "/digit-crm" && p.startsWith(i.to + "/"))) && (!best || i.to.length > best.len)) best = { g, len: i.to.length };
  return best?.g ?? fallback;
};

/** Search keys that distinguish sibling items sharing one route (report categories, workspace tabs). */
const KEYS = ["cat", "tab", "view"] as const;
const claims = (i: NavItem, search: Record<string, unknown>) => KEYS.some((k) => i.search?.[k]) && KEYS.every((k) => (i.search?.[k] ?? "") === String(search[k] ?? ""));
/** Item matching a location, search-aware: an item with cat/tab is active only for that value; a plain item is active
 *  unless a sibling with the same route claims the current value (e.g. Overview vs All sections, Reports Center vs a topic). */
export const isItemActive = (i: NavItem, path: string, search: Record<string, unknown>, siblings: NavItem[] = []): boolean => {
  if (!i.to) return false;
  const p = norm(path);
  if (i.to === "/digit-crm/leads" && (p.startsWith("/app/crm/crm_lead/") || p.startsWith("/digit-crm/lead/") || p.startsWith("/digit-crm/leads/"))) return true;
  // the classic lead list and its records stay part of «Leads» (its deeper siblings such as the Kanban keep their own item)
  if (i.to === "/digit-crm/leads" && (p === "/crm/leads" || p.startsWith("/crm/leads/"))) return isItemActive({ ...i, to: "/crm/leads" }, path, search, siblings.length ? siblings : CRM_NAV.flatMap((g) => g.items));
  if (i.to === "/app/crm/crm_deal" && (p.startsWith("/app/crm/crm_deal/") || p.startsWith("/digit-crm/deal/") || p.startsWith("/digit-crm/deals/"))) return true;
  if (p !== i.to && !(i.to !== "/digit-crm" && p.startsWith(i.to + "/"))) return false;
  if (KEYS.some((k) => i.search?.[k])) return claims(i, search);
  const all = siblings.length ? siblings : CRM_NAV.flatMap((g) => g.items);
  // A deeper sibling owns its own sub-path (Pipeline Kanban /crm/deals/view/kanban is not also "Deals & Opportunities").
  if (p !== i.to && all.some((s) => s !== i && s.to && s.to.length > i.to!.length && (p === s.to || p.startsWith(s.to + "/")))) return false;
  if (i.to === "/digit-crm/reports" && search["cat"]) return false;
  return !all.some((s) => s !== i && s.to === i.to && claims(s, search));
};
/** Module landing page for a nav group: its command-center Overview, or the first section when it has none. */
export const groupHome = (g: NavGroup): NavItem | undefined => g.items.find((i) => i.label === "Overview") ?? g.items.find((i) => i.to);
