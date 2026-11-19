/**
 * R19 — ids and titles of the 36 contract workspaces for the app menu (index.ts CONSTRUCTION_NAV). Kept free of the
 * contract JSON so the manifest stays small; r19/workspaces.ts holds the full contract binding and the same titles.
 */
export const WS_INDEX: [id: string, en: string, ar: string][] = [
  ["01-01", "Portfolio & performance", "المحفظة والأداء"], ["01-02", "Risk & exposure", "المخاطر والتعرض"], ["01-03", "Decisions & policies", "القرارات والسياسات"], ["01-04", "Team & permissions", "الفريق والصلاحيات"],
  ["02-01", "Planning & scheduling", "التخطيط والجدولة"], ["02-02", "Site & execution", "الموقع والتنفيذ"], ["02-03", "Technical documents", "المستندات الفنية"], ["02-04", "Quality & handover", "الجودة والتسليم"],
  ["03-01", "Rate library", "مكتبة الأسعار"], ["03-02", "Quantities & estimating", "الكميات والتقدير"], ["03-03", "Tenders", "العطاءات"], ["03-04", "Subcontract bids & award", "عروض الباطن والترسية"],
  ["04-01", "Client contracts", "عقود العملاء"], ["04-02", "Claims & certificates", "المطالبات والشهادات"], ["04-03", "Changes", "التغييرات"], ["04-04", "Contractual claims & retention", "المطالبات التعاقدية والمحتجزات"],
  ["05-01", "Subcontractors", "مقاولو الباطن"], ["05-02", "Work orders", "أوامر العمل"], ["05-03", "Measurement", "القياس"], ["05-04", "Subcontract bills", "مستخلصات الباطن"],
  ["06-01", "Budgets", "الموازنات"], ["06-02", "Cost codes & sources", "أكواد ومصادر التكلفة"], ["06-03", "Forecasts", "التوقعات"], ["06-04", "Cash flow & revenue", "التدفق النقدي والإيراد"],
  ["07-01", "Material requests", "طلبات المواد"], ["07-02", "Purchasing", "الشراء"], ["07-03", "Receiving & stock", "الاستلام والمخزون"], ["07-04", "Supplier invoices", "فواتير الموردين"],
  ["08-01", "Labour", "العمالة"], ["08-02", "Equipment", "المعدات"], ["08-03", "Site expenses", "مصروفات الموقع"], ["08-04", "Safety & compliance", "السلامة والامتثال"],
  ["09-01", "Billing & collection", "الفوترة والتحصيل"], ["09-02", "Retention & balances", "المحتجزات والأرصدة"], ["09-03", "Closeout & final account", "الإغلاق والحساب الختامي"], ["09-04", "Financial control", "الرقابة المالية"],
];
/**
 * Workspace entries of one contract department ("01"…"09") as nav items (path ws/<id>). `taken` are the labels the
 * module's older entries already use: a workspace whose title equals one of them (e.g. "Budgets" next to the Budgets
 * list) is labelled "… workspace" so the two never look alike.
 */
export const wsNavItems = (dept: string, taken: string[] = []) => WS_INDEX.filter(([id]) => id.startsWith(`${dept}-`)).map(([id, en, ar]) => {
  const clash = taken.some((l) => l.toLowerCase() === en.toLowerCase());
  return { label: clash ? `${en} workspace` : en, label_ar: clash ? `مساحة ${ar}` : ar, to: wsRoute(id), featured: true as const };
});

/* ---------------------------------------------------------------- app paths (owner ruling 2026-11-14) ----------------------------------------------------------------
 * Construction opens under its own app path like Pro: /construction/<department>/<workspace>/<tab>. These are the page paths
 * inside the app (manifest pages); src/lib/appUrls.ts maps them to the visible /construction/… address. */
export const DEPT_NAMES: Record<string, [string, string]> = {
  "01": ["Management & portfolio", "الإدارة العليا والمحفظة"], "02": ["Projects, execution & quality", "المشاريع والتنفيذ والجودة"], "03": ["Estimating & tenders", "التقدير والعطاءات"],
  "04": ["Contracts & claims", "العقود والمطالبات"], "05": ["Subcontracts & measurement", "الباطن والقياس"], "06": ["Budget, cost & forecasts", "الموازنة والتكلفة والتوقعات"],
  "07": ["Procurement & materials", "المشتريات والمواد"], "08": ["Resources", "الموارد"], "09": ["Finance & closeout", "المالية والإغلاق"],
};
/** Department path segment (never equal to an older page's first segment, so no page is shadowed). */
export const DEPT_SLUGS: Record<string, string> = { "01": "management", "02": "projects-execution", "03": "estimating-tenders", "04": "contracts-claims", "05": "subcontracts", "06": "budget-cost", "07": "procurement", "08": "resources", "09": "finance-closeout" };
const slugOf = (s: string) => s.toLowerCase().replace(/&/g, " ").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
/** Workspace path segment, from its English title (portfolio-performance, cost-codes-sources, …). */
export const WS_SLUGS: Record<string, string> = Object.fromEntries(WS_INDEX.map(([id, en]) => [id, slugOf(en)]));
export type WsTab = "overview" | "documents" | "reports";
export const WS_TABS: readonly WsTab[] = ["overview", "documents", "reports"];
/** Page path of a workspace tab: <department>/<workspace>/<tab>. */
export const wsRoute = (id: string, tab: WsTab = "overview") => `${DEPT_SLUGS[id.slice(0, 2)]}/${WS_SLUGS[id]}/${tab}`;
export const deptBySlug = (slug: string) => Object.entries(DEPT_SLUGS).find(([, v]) => v === slug)?.[0];
export const wsBySlug = (dept: string, ws: string) => WS_INDEX.find(([id]) => DEPT_SLUGS[id.slice(0, 2)] === dept && WS_SLUGS[id] === ws)?.[0];
