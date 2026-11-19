import { VISIT_DT } from "@/plugins/digit_fsm/schema";
/**
 * DIGIT FSM + ITM screen registry — the ONE source of the app's information architecture (kit 03: N01–N88 + P01–P08).
 * Navigation V2 (owner goal 2026-10-21 13:32): NINE primary groups; the technician workspace (N53–N58) and the customer
 * portal preview (P01–P08) are separate experiences reached from their hubs, not office groups. Every screen keeps its
 * ID and route; `legacy` records the earlier 14-module parent for the crosswalk (docs/digit_fsm/NAVIGATION_V2_ROUTE_CROSSWALK.csv).
 * The manifest navigation, the group workspaces, the crosswalk and the docs are all derived from this table.
 *
 * kind:
 *   IMPLEMENTED_PAGE         app-owned page under /plugins/digit_fsm/<to>
 *   IMPLEMENTED_REGISTER     the app's own DocType list/form (doctype:FSM …)
 *   NATIVE_LINK              a native Frappe/ERPNext DocType opened inside the DIGIT FSM shell
 *   SOURCE_BASED_ACTION      an app page whose actions create/convert native or app documents from a source record
 *   DEFERRED_SERVER_EXPLICIT an honest page naming the server/mobile dependency (no fake create, no blank screen)
 */
export type ScreenKind = "IMPLEMENTED_PAGE" | "IMPLEMENTED_REGISTER" | "NATIVE_LINK" | "SOURCE_BASED_ACTION" | "DEFERRED_SERVER_EXPLICIT";
/** Workspace scope of the switcher at the top of the app (emphasis only, never access). */
export type WorkspaceMode = "field" | "itm" | "all";
export interface FsmScreen { id: string; module: string; legacy: string; label: string; label_ar: string; to: string; kind: ScreenKind; featured?: boolean; note?: string }
export interface FsmModule { key: string; label: string; label_ar: string; short: string; short_ar: string; icon: string; match?: string[]; question: string; question_ar: string }

/** Nine primary groups (owner Navigation V2). `match` keeps 360 / record pages inside their group in the rail. */
export const FSM_MODULES: FsmModule[] = [
  { key: "HOME", label: "Home", label_ar: "الرئيسية", short: "Home", short_ar: "الرئيسية", icon: "fsm-home", match: ["executive", "operations", "field", "my/", "portal"],
    question: "What needs attention today, and what is going wrong?", question_ar: "ما الذي يحتاج الانتباه اليوم، وما الذي يسير بشكل خاطئ؟" },
  { key: "PORT", label: "Customers, sites & assets", label_ar: "العملاء والمواقع والأصول", short: "Sites", short_ar: "المواقع", icon: "fsm-sites", match: ["site/", "device/", "sites", "site-explorer", "list/fsm_service_site", "list/fsm_service_system", "list/fsm_device", "list/fsm_location_node", "list/fsm_asset_change"],
    question: "Which customers and sites do we serve, and what is installed where?", question_ar: "ما العملاء والمواقع التي نخدمها، وما المركّب وأين؟" },
  { key: "CR", label: "Contracts & requests", label_ar: "العقود والطلبات", short: "Contracts", short_ar: "العقود", icon: "fsm-agreements", match: ["agreement/", "emergency", "list/fsm_service_agreement", "list/fsm_obligation", "list/fsm_renewal_case"],
    question: "What did we promise, what was requested, and what is due?", question_ar: "بماذا التزمنا، وما المطلوب، وما المستحق؟" },
  { key: "OPS", label: "Operations & dispatch", label_ar: "العمليات والجدولة", short: "Operations", short_ar: "العمليات", icon: "fsm-operations", match: ["job/", "dispatch", "visit/", "visits", "ops-center", "technicians", "technician/", "list/fsm_job", "list/fsm_visit", "list/fsm_booking", "list/fsm_technician", "list/fsm_crew", "list/fsm_offline_action"],
    question: "Which jobs and visits are running, who is booked, and what is blocked?", question_ar: "ما أوامر العمل والزيارات الجارية، ومن المحجوز، وما المتعطل؟" },
  { key: "ITM", label: "Inspection & technical approval", label_ar: "الفحص والاعتماد", short: "Inspection", short_ar: "الفحص", icon: "fsm-itm", match: ["run/", "report-preview/", "list/fsm_inspection_run", "list/fsm_report_revision", "list/fsm_result_event"],
    question: "Which inspections are recorded, reviewed and published as evidence?", question_ar: "ما الفحوص المسجلة والمراجَعة والمنشورة كأدلة؟" },
  { key: "DEF", label: "Deficiencies & safety", label_ar: "العيوب والسلامة", short: "Findings", short_ar: "العيوب", icon: "fsm-deficiencies", match: ["deficiency/", "list/fsm_deficiency", "list/fsm_retest", "list/fsm_impairment"],
    question: "Which findings are open, unsafe or waiting for a verified closure?", question_ar: "ما الملاحظات المفتوحة أو غير الآمنة أو بانتظار إغلاق موثق؟" },
  { key: "BILL", label: "Parts, labour & billing", label_ar: "المواد والفوترة", short: "Billing", short_ar: "الفوترة", icon: "fsm-commercial", match: ["list/fsm_charge_proposal"],
    question: "Which parts, hours and charges belong to each job, and what is ready for finance?", question_ar: "ما المواد والساعات والتحصيلات لكل أمر عمل، وما الجاهز للمالية؟" },
  { key: "RPT", label: "Analytics & reports", label_ar: "التقارير", short: "Reports", short_ar: "التقارير", icon: "fsm-analytics", match: ["reports"],
    question: "Which metric answers the question, and which report proves it?", question_ar: "أي مؤشر يجيب عن السؤال، وأي تقرير يثبته؟" },
  { key: "SET", label: "Settings & governance", label_ar: "الإعدادات", short: "Settings", short_ar: "الإعدادات", icon: "fsm-config", match: ["config/", "deferred/", "list/fsm_inspection_template", "list/fsm_integration_exception", "list/fsm_portal_grant"],
    question: "How is the app configured, and which capabilities still need the server?", question_ar: "كيف هُيئ التطبيق، وما القدرات التي ما زالت تتطلب الخادم؟" },
];
/** Separate experiences (not office groups): reached from their hubs and from the switcher bar. */
export const FSM_EXPERIENCES = [
  { key: "FIELD", label: "Technician workspace", label_ar: "مساحة الفني الميدانية", to: "field" },
  { key: "PORTAL", label: "Customer portal (staff preview)", label_ar: "بوابة العميل (معاينة للموظفين)", to: "portal" },
] as const;

/** New primary group of a screen ID (Navigation V2 ranges; P* and N53–N58 are separate experiences). */
export function groupOf(id: string): string {
  if (id.startsWith("P")) return "PORTAL";
  const n = Number(id.slice(1));
  if (id.startsWith("X")) return ({ 1: "SET", 2: "CR", 3: "DEF", 4: "ITM", 5: "CR", 6: "PORT", 7: "DEF", 8: "HOME", 9: "CR" } as Record<number, string>)[n] ?? "HOME";
  if (n <= 4) return "HOME"; if (n <= 12) return "PORT"; if (n <= 24) return "CR"; if (n <= 38) return "OPS"; if (n <= 45) return "ITM"; if (n <= 52) return "DEF";
  if (n <= 58) return "FIELD"; if (n <= 69) return "BILL"; if (n === 73) return "RPT"; return "SET";
}
/** Workspace emphasis of a screen: field services, inspection & safety, or both. */
export function screenMode(id: string): "field" | "itm" | "both" {
  const n = Number(id.slice(1));
  if (id.startsWith("P") || id.startsWith("X")) return id === "X03" || id === "X04" || id === "X07" ? "itm" : "both";
  if (n === 17 || (n >= 39 && n <= 52) || n === 54 || (n >= 74 && n <= 79)) return "itm";
  if ((n >= 13 && n <= 38) || n === 53 || n === 55 || n === 56 || n === 58 || (n >= 59 && n <= 69)) return "field";
  return "both";
}

const mk = (kind: ScreenKind) => (id: string, legacy: string, label: string, label_ar: string, to: string, featured = false, note?: string): FsmScreen => ({ id, module: groupOf(id), legacy, label, label_ar, to, kind, featured, ...(note ? { note } : {}) });
const P = mk("IMPLEMENTED_PAGE"), SA = mk("SOURCE_BASED_ACTION");
const R = (id: string, legacy: string, label: string, label_ar: string, doctype: string, featured = false) => mk("IMPLEMENTED_REGISTER")(id, legacy, label, label_ar, `doctype:${doctype}`, featured);
const NL = (id: string, legacy: string, label: string, label_ar: string, doctype: string, featured = false, note?: string) => mk("NATIVE_LINK")(id, legacy, label, label_ar, `doctype:${doctype}`, featured, note);
const DF = (id: string, legacy: string, label: string, label_ar: string, to: string, note: string, featured = false) => mk("DEFERRED_SERVER_EXPLICIT")(id, legacy, label, label_ar, to, featured, note);

export const FSM_SCREENS: FsmScreen[] = [
  P("N01", "HOME", "My work", "عملي", "", true),
  P("N02", "HOME", "Executive overview", "النظرة التنفيذية", "executive", true),
  P("N03", "HOME", "Operations control", "مركز العمليات", "operations", true),
  SA("N04", "HOME", "Data & integration exceptions", "الاستثناءات", "queue/exceptions", true),

  NL("N05", "PORT", "Customers", "العملاء", "Customer", true),
  P("N06", "PORT", "Contacts & site access", "جهات الاتصال والوصول للمواقع", "queue/site-contacts", false, "Portal invitations / revocations need server-side grants (N83)."),
  P("N07", "PORT", "Service sites", "مواقع الخدمة", "sites", true),
  R("N08", "PORT", "Buildings, floors & zones", "المباني والطوابق والمناطق", "FSM Location Node", true),
  R("N09", "PORT", "Systems", "الأنظمة", "FSM Service System", true),
  R("N10", "PORT", "Devices & equipment", "الأجهزة والمعدات", "FSM Device", true),
  SA("N11", "PORT", "Asset changes & reconciliation", "تغييرات الأصول والمطابقة", "queue/asset-changes"),
  P("N12", "PORT", "Site service history", "سجل خدمة الموقع", "reports/RP16"),

  SA("N13", "INTAKE", "Service requests", "طلبات الخدمة", "queue/requests", true),
  SA("N14", "INTAKE", "Emergency triage", "فرز الطوارئ", "emergency", true),
  NL("N15", "INTAKE", "Estimates & quotations", "التقديرات وعروض الأسعار", "Quotation", true),
  SA("N16", "INTAKE", "Customer decisions", "قرارات العملاء", "queue/decisions"),
  SA("N17", "INTAKE", "Findings to quote", "ملاحظات للتسعير", "queue/to-quote"),
  R("N18", "AGR", "Service agreements", "اتفاقيات الخدمة", "FSM Service Agreement", true),
  P("N19", "AGR", "Coverage lines & service profiles", "بنود التغطية وملفات الخدمة", "queue/coverage"),
  P("N20", "AGR", "Recurrence rules", "قواعد التكرار", "queue/recurrence"),
  SA("N21", "AGR", "Due obligations", "الالتزامات المستحقة", "queue/due", true),
  SA("N22", "AGR", "Overdue & catch-up", "المتأخر والاستدراك", "queue/overdue", true),
  R("N23", "AGR", "Generation runs", "دورات التوليد", "FSM Generation Run"),
  SA("N24", "AGR", "Renewals", "التجديدات", "queue/renewals"),

  R("N25", "OPS", "Service jobs", "أوامر عمل الخدمة", "FSM Job", true),
  R("N26", "OPS", "Service visits", "زيارات الخدمة", VISIT_DT, true),
  P("N27", "OPS", "Blocked & incomplete work", "الأعمال المتعطلة وغير المكتملة", "queue/blocked", true),
  P("N28", "OPS", "Multi-day plans & handovers", "الخطط متعددة الأيام والتسليم", "queue/multiday"),
  R("N29", "OPS", "Subcontract assignments", "إسنادات مقاولي الباطن", "FSM Subcontract Assignment"),
  SA("N30", "OPS", "Closeout & billing readiness", "جاهزية الإغلاق والفوترة", "queue/readiness"),
  SA("N31", "DISP", "Dispatch board", "لوحة الجدولة", "dispatch", true),
  P("N32", "DISP", "Unscheduled visits", "الزيارات غير المجدولة", "queue/unscheduled", true),
  R("N33", "DISP", "Resource bookings", "حجوزات الموارد", "FSM Booking"),
  R("N34", "DISP", "Technicians & crews", "الفنيون والطواقم", "FSM Technician"),
  P("N35", "DISP", "Skills & certifications", "المهارات والشهادات", "queue/certifications"),
  R("N36", "DISP", "Availability & on-call", "التوفر والمناوبات", "FSM Calendar Exception"),
  SA("N37", "DISP", "Assignment acknowledgements", "الإقرار بالتكليفات", "queue/acks"),
  P("N38", "DISP", "Route plans (day sequence)", "خطط المسارات (تسلسل اليوم)", "queue/day-plan", false, "Day sequence by booking time only; route optimisation is not claimed."),

  R("N39", "ITM", "Inspection runs", "تشغيلات الفحص", "FSM Inspection Run", true),
  P("N40", "ITM", "Device results & measurements", "نتائج الأجهزة والقياسات", "reports/RP02", true),
  P("N41", "ITM", "Coverage & untested devices", "التغطية والأجهزة غير المفحوصة", "reports/RP03", true),
  SA("N42", "ITM", "Technical review queue", "طابور المراجعة الفنية", "queue/review", true),
  R("N43", "ITM", "Published technical reports", "التقارير الفنية المنشورة", "FSM Report Revision", true),
  P("N44", "ITM", "Evidence library", "مكتبة الأدلة", "queue/evidence"),
  R("N45", "ITM", "Test instruments & calibration", "أدوات الاختبار والمعايرة", "FSM Test Instrument"),

  R("N46", "DEF", "Deficiency register", "سجل العيوب", "FSM Deficiency", true),
  P("N47", "DEF", "Critical findings", "الملاحظات الحرجة", "queue/critical", true),
  SA("N48", "DEF", "System impairments", "تعطّلات الأنظمة", "queue/impairments", true),
  P("N49", "DEF", "Corrective work", "الأعمال التصحيحية", "queue/corrective"),
  SA("N50", "DEF", "Retest requirements", "متطلبات إعادة الفحص", "queue/retests", true),
  SA("N51", "DEF", "Closure review", "مراجعة الإغلاق", "queue/closure", true),
  SA("N52", "DEF", "Disputes, duplicates & reopened", "الاعتراضات والمكرر والمعاد فتحه", "queue/disputes"),

  SA("N53", "FIELD", "My visits", "زياراتي", "my/visits", true),
  SA("N54", "FIELD", "My inspections", "فحوصاتي", "my/inspections", true),
  SA("N55", "FIELD", "My repairs & retests", "إصلاحاتي وإعادات الفحص", "my/repairs", true),
  P("N56", "FIELD", "Work-pack readiness", "جاهزية حزمة العمل", "queue/workpacks", true, "Skills, certificate, published template, parts and site contact per visit (domain/field.ts workPack)."),
  P("N57", "FIELD", "Offline queue & recovery", "طابور العمل دون اتصال والاسترداد", "field/offline", true, "Virtual queue: steps captured offline are replayed in order on sync; a step whose record moved meanwhile stays a conflict for the dispatcher. The server-side device store is in FRAPPE_DEVELOPER_GUIDE.md."),
  P("N58", "FIELD", "My time & materials", "وقتي وموادي", "my/time"),

  NL("N59", "PARTS", "Material requests", "طلبات المواد", "Material Request", true),
  NL("N60", "PARTS", "Reservations & stock issues", "الحجوزات والصرف المخزني", "Stock Entry", true),
  NL("N61", "PARTS", "Van custody (warehouses)", "عهدة السيارات (المستودعات)", "Warehouse", false, "A van is a native warehouse; balances come from native stock reports."),
  P("N62", "PARTS", "Consumption by job", "الاستهلاك حسب أمر العمل", "reports/RP13", true),
  NL("N63", "PARTS", "Returns & discrepancies", "المرتجعات والفروقات", "Stock Reconciliation"),
  NL("N64", "PARTS", "Purchase & subcontract references", "مراجع الشراء والباطن", "Purchase Order"),
  NL("N65", "PARTS", "Labour approval (timesheets)", "اعتماد ساعات العمل", "Timesheet", true),
  R("N66", "COMM", "Coverage decisions & charges", "قرارات التغطية والتحصيل", "FSM Charge Proposal", true),
  SA("N67", "COMM", "Invoice-ready work", "أعمال جاهزة للفوترة", "queue/invoice-ready", true),
  SA("N68", "COMM", "Financial hand-offs", "التسليمات المالية", "queue/handoffs", true),
  P("N69", "COMM", "Job & agreement contribution", "مساهمة أوامر العمل والعقود", "reports/RP14", false, "Cost and margin need posted native costs — SERVER_REQUIRED columns."),

  NL("N70", "MSG", "Message intents & delivery", "رسائل التواصل والتسليم", "Communication", false, "Native Communication records; provider delivery receipts need the server."),
  DF("N71", "MSG", "Failed notifications", "الإشعارات الفاشلة", "deferred/notifications", "Provider delivery events (SMS/WhatsApp/e-mail receipts) arrive only on a server with a configured provider — SERVER_REQUIRED."),
  NL("N72", "MSG", "Customer contact preferences", "تفضيلات تواصل العملاء", "Contact"),

  P("N73", "ANL", "Dashboard & report catalogue", "دليل اللوحات والتقارير", "reports", true),

  P("N74", "CFG", "Trade packs", "حزم التخصص", "config/trade-packs", true),
  P("N75", "CFG", "Asset & system taxonomies", "تصنيفات الأصول والأنظمة", "config/taxonomies"),
  R("N76", "CFG", "Inspection templates", "قوالب الفحص", "FSM Inspection Template", true),
  SA("N77", "CFG", "Template versions & publishing", "إصدارات القوالب والنشر", "queue/templates", true),
  P("N78", "CFG", "Standards references & applicability", "المراجع القياسية والانطباق", "config/standards"),
  P("N79", "CFG", "Severity, escalation & closure policies", "سياسات الخطورة والتصعيد والإغلاق", "config/policies", true),
  NL("N80", "CFG", "Service calendars (holiday lists)", "تقاويم الخدمة (قوائم العطل)", "Holiday List"),
  P("N81", "CFG", "Dispatch eligibility policies", "سياسات أهلية الجدولة", "config/eligibility"),
  NL("N82", "CFG", "SLA policies", "سياسات مستوى الخدمة", "Service Level Agreement"),
  DF("N83", "CFG", "Portal grants & publication policies", "منح البوابة وسياسات النشر", "deferred/portal-grants", "Customer site grants must be enforced by the server (site-scoped permission query); a customer e-mail is never an authorisation — SERVER_REQUIRED."),
  NL("N84", "CFG", "Notification templates", "قوالب الإشعارات", "Notification", false, "Native Notification templates; providers are configured on the server."),
  P("N85", "CFG", "Core field & document mappings", "ربط حقول ومستندات النواة", "config/mappings", true),
  NL("N86", "CFG", "Imports & migration", "الاستيراد والترحيل", "Data Import"),
  NL("N87", "CFG", "Audit & retention (versions)", "التدقيق والاحتفاظ (الإصدارات)", "Version"),
  P("N88", "CFG", "Adapter & integration health", "صحة المحول والتكامل", "config/health", true),

  DF("P01", "MSG", "Portal — portfolio overview (staff preview)", "البوابة — نظرة على المحفظة (معاينة للموظفين)", "portal/p01", "Staff-only preview. External customer access needs server-enforced site grants — SERVER_REQUIRED."),
  DF("P02", "MSG", "Portal — my sites", "البوابة — مواقعي", "portal/p02", "Staff-only preview; SERVER_REQUIRED for customers."),
  DF("P03", "MSG", "Portal — upcoming visits", "البوابة — الزيارات القادمة", "portal/p03", "Staff-only preview; SERVER_REQUIRED for customers."),
  DF("P04", "MSG", "Portal — reports & documents", "البوابة — التقارير والمستندات", "portal/p04", "Staff-only preview of published revisions only; SERVER_REQUIRED for customers."),
  DF("P05", "MSG", "Portal — findings & impairments", "البوابة — الملاحظات والتعطّلات", "portal/p05", "Staff-only preview; SERVER_REQUIRED for customers."),
  DF("P06", "MSG", "Portal — quotes & decisions", "البوابة — العروض والقرارات", "portal/p06", "Staff-only preview; customer approval authority is SERVER_REQUIRED."),
  DF("P07", "MSG", "Portal — service requests", "البوابة — طلبات الخدمة", "portal/p07", "Staff-only preview; SERVER_REQUIRED for customers."),
  DF("P08", "MSG", "Portal — history & financial references", "البوابة — السجل والمراجع المالية", "portal/p08", "Staff-only preview; SERVER_REQUIRED for customers."),
];

/** Registers and records reachable from the group directories (not part of the kit's N/P numbering). */
export const FSM_EXTRA_NAV: FsmScreen[] = [
  R("X01", "CFG", "FSM settings", "إعدادات الخدمة الميدانية", "FSM Settings", true),
  R("X02", "AGR", "Obligation ledger", "سجل الالتزامات", "FSM Obligation"),
  R("X03", "DEF", "Retest register", "سجل إعادات الفحص", "FSM Retest"),
  R("X04", "ITM", "Result events (audit)", "أحداث النتائج (تدقيق)", "FSM Result Event"),
  R("X05", "AGR", "Renewal cases", "حالات التجديد", "FSM Renewal Case"),
  R("X06", "PORT", "Asset change records", "سجلات تغييرات الأصول", "FSM Asset Change"),
  R("X07", "DEF", "Impairment records", "سجلات التعطّلات", "FSM Impairment"),
  R("X08", "HOME", "Integration exception records", "سجلات استثناءات التكامل", "FSM Integration Exception"),
  NL("X09", "INTAKE", "Service request records (Issue)", "سجلات طلبات الخدمة", "Issue"),
];

/** Contextual cross-links: a screen owned by another group that this group's users need one click away. */
export const FSM_CROSS_LINKS: Record<string, string[]> = { ITM: ["N76", "N77", "N78"], DEF: ["N17"], OPS: ["N56"] };
/** Reports listed in the Reports group directory, grouped by business area. */
export const REPORT_AREAS: { key: string; label: string; label_ar: string; reports: string[] }[] = [
  { key: "ops", label: "Operations", label_ar: "العمليات", reports: ["RP09", "RP10", "RP11", "RP16"] },
  { key: "itm", label: "Inspection", label_ar: "الفحص", reports: ["RP01", "RP02", "RP03", "RP04", "RP17"] },
  { key: "safety", label: "Safety", label_ar: "السلامة", reports: ["RP05", "RP06", "RP07"] },
  { key: "contracts", label: "Contracts", label_ar: "العقود", reports: ["RP08", "RP12", "RP15"] },
  { key: "finance", label: "Parts & finance", label_ar: "المواد والمالية", reports: ["RP13", "RP14", "RP19"] },
  { key: "server", label: "Server-required", label_ar: "تتطلب الخادم", reports: ["RP18", "RP20"] },
];

export const screenById = (id: string) => [...FSM_SCREENS, ...FSM_EXTRA_NAV].find((s) => s.id === id);
/** Screens of a primary group in registry order (own screens, then cross-links). */
export const groupScreens = (key: string) => [...FSM_SCREENS, ...FSM_EXTRA_NAV].filter((s) => s.module === key);

/**
 * Three-level navigation (owner low-credit goal 2026-10-21 14:29, blueprint 02): App Dock → nine groups → contextual
 * WORKSPACE DESTINATIONS. The context sidebar lists only these destinations; each opens a full workspace page (never a
 * raw DocType list) whose Documents tab holds the source lists, Create eligibility and forms. N01–N88 stay registered as
 * deep links (non-featured navigation items) so bookmarks and the crosswalk keep working.
 * `docs` are screen IDs whose DocType lists appear under Documents; `queues` are QUEUES keys (Work & Activities);
 * `reports` are RP IDs; `kind` names the dedicated page or "ws" for the generic destination workspace (ws/<key>).
 */
export interface FsmDestination { key: string; group: string; label: string; label_ar: string; to: string; question: string; question_ar: string; docs: string[]; queues: string[]; reports: string[]; overview?: "itm" | "risk" | "def-site" | "unavailable-finance" }
const D = (group: string, key: string, label: string, label_ar: string, to: string, question: string, question_ar: string, docs: string[], queues: string[], reports: string[], overview?: FsmDestination["overview"]): FsmDestination =>
  ({ key, group, label, label_ar, to: to === "ws" ? `ws/${key}` : to, question, question_ar, docs, queues, reports, ...(overview ? { overview } : {}) });
export const FSM_DESTINATIONS: FsmDestination[] = [
  D("HOME", "my", "My work", "عملي", "", "What needs my attention today?", "ما الذي يحتاج انتباهي اليوم؟", [], [], []),
  D("HOME", "control", "Operations control", "مركز العمليات", "operations", "What is going wrong right now, worst first?", "ما الذي يسير بشكل خاطئ الآن، الأسوأ أولاً؟", [], [], ["RP09"]),
  D("HOME", "management", "Management", "الإدارة", "executive", "How is the service business performing?", "كيف يؤدي نشاط الخدمة؟", [], [], ["RP05", "RP09", "RP17"]),
  D("HOME", "exceptions", "Exceptions", "الاستثناءات", "queue/exceptions", "Which data and integration exceptions are open?", "ما استثناءات البيانات والتكامل المفتوحة؟", ["X08"], ["exceptions"], ["RP19"]),

  D("PORT", "site-explorer", "Site explorer", "مستكشف المواقع", "site-explorer", "What is installed where, and what is happening at each place?", "ما المركّب وأين، وماذا يحدث في كل مكان؟", ["N05", "N07", "N08", "N09", "N10", "X06"], ["asset-changes", "site-contacts"], ["RP01", "RP16"]),
  D("PORT", "sites", "Sites portfolio", "محفظة المواقع", "sites", "Which sites do we serve, and where is the risk?", "ما المواقع التي نخدمها، وأين الخطر؟", ["N07"], [], ["RP01", "RP16"]),
  D("PORT", "service-history", "Service history", "سجل الخدمة", "ws", "What was done at each site, and what evidence was published?", "ما الذي نُفذ في كل موقع، وما الأدلة المنشورة؟", ["N25", "N26", "N39", "N43"], [], ["RP16", "RP02"]),

  D("CR", "requests", "Requests", "الطلبات", "ws", "Which service requests and quotations are waiting?", "ما طلبات الخدمة وعروض الأسعار المنتظرة؟", ["X09", "N15"], ["requests", "decisions", "to-quote"], ["RP11"]),
  D("CR", "contracts", "Contract 360", "العقود 360", "ws", "What did we promise each customer, and is it delivered?", "بماذا التزمنا لكل عميل، وهل نُفذ؟", ["N18", "X02", "X05"], ["due", "renewals"], ["RP08", "RP12", "RP15"]),
  D("CR", "coverage", "Coverage", "التغطية", "ws", "Which devices and services does each agreement cover, and how often?", "ما الأجهزة والخدمات التي تغطيها كل اتفاقية، وبأي تكرار؟", ["N18"], ["coverage", "recurrence"], ["RP08", "RP12"]),
  D("CR", "obligations", "Obligation schedule", "جدول الالتزامات", "ws", "Which obligations are due or overdue?", "ما الالتزامات المستحقة أو المتأخرة؟", ["X02", "N23"], ["due", "overdue"], ["RP08", "RP09"]),
  D("CR", "renewals", "Renewals", "التجديدات", "ws", "Which agreements end soon, and what is at risk?", "ما الاتفاقيات التي تنتهي قريباً، وما المعرّض للخطر؟", ["X05", "N18"], ["renewals"], ["RP12", "RP15"]),

  D("OPS", "ops-center", "Service manager centre", "مركز مدير الخدمة", "ops-center", "Which visits are running, late or unassigned, and who carries the load?", "ما الزيارات الجارية أو المتأخرة أو غير المسندة، ومن يحمل العبء؟", ["N25", "N26", "N33"], ["unscheduled", "acks", "blocked"], ["RP09", "RP10", "RP11"]),
  D("OPS", "visits", "Visits portfolio", "محفظة الزيارات", "visits", "Where is every visit, who leads it, and what did it find?", "أين كل زيارة، ومن يقودها، وماذا وجدت؟", ["N26", "N33", "N25"], ["unscheduled", "multiday"], ["RP09", "RP16"]),
  D("OPS", "late-visits", "Late visits", "الزيارات المتأخرة", "visits/late", "Which visits passed their window without completion?", "ما الزيارات التي تجاوزت نافذتها دون إكمال؟", ["N26"], ["blocked"], ["RP09"]),
  D("OPS", "dispatch", "Dispatch", "التوزيع", "dispatch", "Who goes where, and when?", "من يذهب إلى أين، ومتى؟", ["N33", "N34"], ["unscheduled", "day-plan"], ["RP09"]),
  D("OPS", "team", "Team & technicians", "الفريق والفنيون", "technicians", "How is each technician performing, measured from real visits?", "كيف يؤدي كل فني، مقيساً من الزيارات الفعلية؟", ["N34", "N33", "N36"], ["certifications", "acks"], ["RP10"]),

  D("ITM", "itm-lead", "ITM command", "قيادة الفحص", "ws", "Where are inspections stuck, and what did they find?", "أين تتعثر الفحوص، وماذا وجدت؟", ["N39", "N43", "N76"], ["review"], ["RP03", "RP04", "RP17"], "itm"),
  D("ITM", "runs", "Inspection runs", "جولات الفحص", "ws", "Which runs are in progress, submitted or reviewed?", "ما الجولات الجارية أو المقدمة أو المراجَعة؟", ["N39", "X04"], ["review"], ["RP02", "RP03"]),
  D("ITM", "results", "Results", "النتائج", "ws", "What did each device check return?", "ماذا أعاد كل بند فحص للجهاز؟", ["N39", "X04"], [], ["RP02", "RP04"]),
  D("ITM", "evidence", "Evidence review", "مراجعة الأدلة", "ws", "Which evidence is attached, missing or waiting for review?", "ما الأدلة المرفقة أو الناقصة أو بانتظار المراجعة؟", ["N39"], ["evidence", "review"], ["RP17"]),
  D("ITM", "published", "Published reports", "التقارير المنشورة", "ws", "Which technical reports were published, and which revision is current?", "ما التقارير الفنية المنشورة، وأي إصدار هو الحالي؟", ["N43"], [], ["RP17"]),

  D("DEF", "risk", "Risk command", "قيادة المخاطر", "ws", "Which findings and impairments carry the most risk?", "ما الملاحظات والتعطّلات الأعلى خطراً؟", ["N46", "X07"], ["critical", "impairments"], ["RP05", "RP07"], "risk"),
  D("DEF", "by-site", "Findings by site", "العيوب حسب الموقع", "ws", "Which sites hold the most open findings?", "ما المواقع التي تحمل أكثر الملاحظات المفتوحة؟", ["N46"], ["corrective"], ["RP05", "RP06"], "def-site"),
  D("DEF", "aging", "Findings aging", "أعمار العيوب", "ws", "How long have findings stayed open?", "منذ متى بقيت الملاحظات مفتوحة؟", ["N46"], ["critical", "disputes"], ["RP05"]),
  D("DEF", "retests", "Retests", "إعادة الاختبار", "ws", "Which repairs wait for a retest or a closure review?", "ما الإصلاحات بانتظار إعادة فحص أو مراجعة إغلاق؟", ["X03", "N46"], ["retests", "closure"], ["RP06"]),

  D("BILL", "commercial", "Commercial execution", "إدارة التنفيذ التجاري", "ws", "Which work is ready for billing, and what is blocked?", "ما الأعمال الجاهزة للفوترة، وما المتعطل؟", ["N66"], ["readiness", "invoice-ready", "handoffs"], ["RP19", "RP13"]),
  D("BILL", "materials", "Materials consumption", "استهلاك المواد", "ws", "Which parts were requested, issued and returned per job?", "ما المواد المطلوبة والمصروفة والمرتجعة لكل أمر عمل؟", ["N59", "N60", "N61", "N63"], [], ["RP13"]),
  D("BILL", "labour", "Labour hours", "ساعات العمل", "ws", "Which hours were booked against each job?", "ما الساعات المسجلة على كل أمر عمل؟", ["N65"], [], ["RP10", "RP14"]),
  D("BILL", "billing", "Billing", "الفوترة", "ws", "Which charges are approved and handed to finance?", "ما التحصيلات المعتمدة والمسلّمة للمالية؟", ["N66", "N64"], ["invoice-ready", "handoffs"], ["RP19"]),
  D("BILL", "profitability", "Profitability", "الربحية", "ws", "What does each job and agreement contribute?", "ما مساهمة كل أمر عمل واتفاقية؟", ["N66"], [], ["RP14", "RP15"], "unavailable-finance"),

  D("RPT", "rpt-manager", "Service manager board", "لوحة مدير الخدمة", "ws", "Which operational numbers need action this week?", "ما الأرقام التشغيلية التي تحتاج إجراءً هذا الأسبوع؟", [], [], ["RP09", "RP11", "RP16", "RP08"]),
  D("RPT", "rpt-tech", "Technicians", "الفنيون", "ws", "How productive and punctual are technicians?", "ما مدى إنتاجية الفنيين والتزامهم بالمواعيد؟", ["N34"], [], ["RP10"]),
  D("RPT", "rpt-quality", "Quality & compliance", "الجودة والالتزام", "ws", "Are inspections complete, reviewed and findings closed?", "هل الفحوص مكتملة ومراجَعة والملاحظات مغلقة؟", [], [], ["RP03", "RP04", "RP05", "RP06", "RP07", "RP17"]),
  D("RPT", "rpt-contracts", "Contracts & profitability", "العقود والربحية", "ws", "Are agreements delivered, renewed and profitable?", "هل الاتفاقيات منفذة ومجددة ومربحة؟", [], [], ["RP08", "RP12", "RP14", "RP15", "RP19"]),
  D("RPT", "all-reports", "All reports (RP01–RP20)", "جميع التقارير (RP01–RP20)", "reports", "Which report answers the question?", "أي تقرير يجيب عن السؤال؟", [], [], []),

  D("SET", "trade-packs", "Trade packs", "حزمة المجالات", "config/trade-packs", "Which trade packs are active?", "ما حزم التخصص المفعّلة؟", [], [], []),
  D("SET", "policies", "Policies", "السياسات", "config/policies", "Which severity, escalation and closure rules apply?", "ما قواعد الخطورة والتصعيد والإغلاق المطبقة؟", ["X01"], [], []),
  D("SET", "permissions", "Permissions", "الصلاحيات", "ws", "Which roles may read, create and approve FSM records?", "ما الأدوار التي يمكنها قراءة سجلات الخدمة وإنشاؤها واعتمادها؟", ["N34", "X01"], [], []),
  D("SET", "templates", "Templates", "القوالب", "ws", "Which inspection templates and versions are published?", "ما قوالب الفحص وإصداراتها المنشورة؟", ["N76", "N45"], ["templates"], ["RP03"]),
  D("SET", "comms", "Communications", "الاتصالات", "ws", "Which messages, templates and contact preferences exist?", "ما الرسائل والقوالب وتفضيلات التواصل الموجودة؟", ["N70", "N72", "N84"], [], ["RP20"]),
];
export const destinationByKey = (k: string) => FSM_DESTINATIONS.find((d) => d.key === k);
export const destinationOfPath = (to: string) => FSM_DESTINATIONS.find((d) => d.to === to);
