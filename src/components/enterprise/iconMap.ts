/**
 * Where each official DIGIT icon belongs. Fixed places (app rail, header, menus, toolbars, admin/help entries) are
 * listed here once; data-driven places (company industry, POS sector) pick the icon from the stored record value and
 * fall back to the module icon, so an icon only appears when the data says so. Destinations are native screens.
 */
import { DIGIT_LOGO, digitIconSrc, type DigitIconName } from "./DigitIcon";

/** Native Desk launchers inside the Enterprise Desk menu (DOCK_APPS ids). */
export const DESK_LAUNCHER_ICON: Record<string, DigitIconName> = {
  home: "ui-dashboard",
  erpnext: "svc-erpnext",
  frappe: "svc-customization",
  hrms: "mod-hr",
  crm: "mod-crm",
  insights: "feat-ai",
  hrapp: "mod-hr",
  reports: "mod-reports",
};

/** DIGIT HR modules (src/plugins/digit_hr/v5/data.ts MODULES ids) and HR rail utilities. */
export const HR_MODULE_ICON: Record<string, DigitIconName> = {
  "01": "mod-hr",          // Core HR
  "02": "svc-training",    // Human capital & talent (recruitment, learning, performance)
  "03": "ui-calendar",     // Workforce: attendance, shifts, overtime
  "04": "mod-financial",   // Payroll, benefits & legislation
  "05": "ui-user",         // Employee self-service & experience
  "06": "feat-ai",         // HR intelligence & planning
  "07": "feat-security",   // Settings & governance
};
/** DIGIT Construction rail modules (manifest navigation `icon` keys) → official icons (owner icon pack, exact artwork). */
export const CONSTRUCTION_MODULE_ICON: Record<string, DigitIconName> = {
  home: "ui-dashboard", projects: "mod-projects", estimating: "trust-comparison", contracts: "feat-signature", subcontracts: "ind-proservices",
  cost: "mod-financial", procurement: "mod-purchases", resources: "mod-inventory", finance: "mod-accounts", reports: "mod-reports", settings: "ui-settings",
  people: "mod-hr", module: "ui-dashboard",
};
/** DIGIT FSM + ITM rail modules (manifest navigation `icon` keys, src/plugins/digit_fsm/screens.ts) → official icons. */
export const FSM_MODULE_ICON: Record<string, DigitIconName> = {
  "fsm-home": "ui-dashboard", "fsm-sites": "trust-location", "fsm-intake": "svc-support", "fsm-agreements": "feat-signature", "fsm-operations": "svc-implementation",
  "fsm-dispatch": "ui-calendar", "fsm-itm": "ui-success", "fsm-deficiencies": "ui-warning", "fsm-field": "trust-phone", "fsm-parts": "mod-inventory",
  "fsm-commercial": "mod-financial", "fsm-comms": "ui-notifications", "fsm-analytics": "mod-reports", "fsm-config": "ui-settings",
};
/** Every rail-module icon key of every module-rail app (one lookup for the shared NavIcon). */
export const RAIL_MODULE_ICON: Record<string, DigitIconName> = { ...CONSTRUCTION_MODULE_ICON, ...FSM_MODULE_ICON };
/** Application → official app icon (dock, Enterprise Home, app headers). CRM and HR module icons are the pack's Extended set. */
export const APP_ICON: Record<string, DigitIconName> = { digit_pro: "mod-accounts", digit_hr: "mod-hr", digit_crm: "mod-crm", digit_construction: "ind-contracting", digit_fsm: "svc-maintenance" };
/**
 * One logo per app (owner Final UI Fix Pass §2, 2026-10-19). The dock tile, the rail's top app tile, the Enterprise Home
 * card, the command-band app badge and the browser tab icon all resolve here, so they always show the same artwork
 * (docs/digit-app-builder/ICON_ASSET_MAPPING.md). Only the surface variant differs: `light` on white tiles, `dark` on
 * green surfaces. DIGIT Pro's app icon is the DIGIT logo mark (`app` tile / `white` on green). Department icons never
 * appear in these places.
 */
export type AppIconPlace = "dock" | "rail" | "home" | "band" | "favicon" | "tile";
const APP_BRAND: Record<string, { light: string; dark: string }> = {
  digit_pro: { light: DIGIT_LOGO.app, dark: DIGIT_LOGO.white },
  digit_hr: { light: digitIconSrc("mod-hr", "light"), dark: digitIconSrc("mod-hr", "dark") },
  digit_crm: { light: digitIconSrc("mod-crm", "light"), dark: digitIconSrc("mod-crm", "dark") },
  digit_construction: { light: digitIconSrc("ind-contracting", "light"), dark: digitIconSrc("ind-contracting", "dark") },
  digit_fsm: { light: digitIconSrc("svc-maintenance", "light"), dark: digitIconSrc("svc-maintenance", "dark") },
};
/**
 * Surface of each place per app: green surfaces (command bands and every app's rail brand, drawn straight on the green
 * rail like DIGIT Pro) take the official dark (green-backed) variant; warm light tiles (dock, Enterprise Home) the light one.
 */
const DARK_PLACES: Record<string, AppIconPlace[]> = { digit_pro: ["rail", "band"], digit_hr: ["rail", "band"], digit_crm: ["rail", "band"], digit_construction: ["rail", "band"], digit_fsm: ["rail", "band"] };
export const BRANDED_APPS = Object.keys(APP_BRAND);
export function appIconFor(app: string, place: AppIconPlace): string | undefined {
  if (place === "tile") return appTile(app)?.icon;
  const b = APP_BRAND[app];
  return b ? ((DARK_PLACES[app] ?? []).includes(place) ? b.dark : b.light) : undefined;
}
/**
 * App tile (owner Final Targeted UX correction 2026-10-21): the right-side app dock, the Enterprise Home applications list
 * and the Home navigation's app directory draw EVERY DIGIT app exactly like DIGIT Pro — the official dark (white + mint)
 * artwork edge to edge on the DIGIT deep-green square with a 24% corner radius. DIGIT Pro's logo file already carries that
 * square (`own`); the other apps' official dark artwork is set on the same square by the shared AppTile (`brand`, CSS
 * `.dx-tile-brand` = --dx-deep, the colour of Pro's square). No artwork is redrawn and no pale light-surface variant is
 * used for an app tile.
 */
export function appTile(app: string): { icon: string; kind: "own" | "brand" } | undefined {
  const b = APP_BRAND[app];
  if (!b) return undefined;
  return app === "digit_pro" ? { icon: DIGIT_LOGO.app, kind: "own" } : { icon: b.dark, kind: "brand" };
}
/** Base artwork of an icon path (drops the folder and the -light/-dark or logo surface suffix): equal base = same logo. */
export function appIconBase(src: string): string {
  const file = src.slice(src.lastIndexOf("/") + 1).replace(/\.svg$/, "");
  return /^digit-icon(-app|-white|-mono)?$/.test(file) ? "digit-icon" : file.replace(/-(light|dark)$/, "");
}
export const HR_UTIL_ICON = { home: "ui-dashboard", reports: "mod-reports" } as const satisfies Record<string, DigitIconName>;

/**
 * Owner-review status of each department icon (docs/digit-app-builder/ICON_ASSET_MAPPING.md). Every icon is the supplied
 * artwork unchanged; the status says whether the pack has an icon for that exact concept.
 *   exact          — the pack's Official icon for the same concept (e.g. Accounting → mod-accounts)
 *   exact-extended — same concept, but the icon is in the pack's "Extended — awaiting owner signature" set (pack README)
 *   provisional    — the pack has no icon for this department; nearest Official/Extended icon chosen for owner review
 * Nothing here is owner-approved until the owner signs the mapping off.
 */
export type IconStatus = "exact" | "exact-extended" | "provisional";
export const DEPARTMENT_ICON_STATUS: Record<"digit_pro" | "digit_hr" | "digit_construction" | "digit_crm" | "digit_fsm", Record<string, IconStatus>> = {
  digit_pro: { executive: "exact", accounting: "exact", selling: "exact", purchasing: "exact", inventory: "exact", assets: "exact", reports: "exact", compliance: "exact", settings: "exact", support: "exact" },
  digit_hr: { home: "exact", "01": "exact-extended", "02": "provisional", "03": "provisional", "04": "provisional", "05": "provisional", "06": "provisional", "07": "provisional", reports: "exact" },
  digit_construction: { home: "exact", projects: "exact", estimating: "provisional", contracts: "provisional", subcontracts: "provisional", cost: "provisional", procurement: "exact", resources: "provisional", finance: "exact" },
  digit_crm: { home: "exact", customers: "exact-extended", pipeline: "exact", activities: "provisional", management: "provisional", reports: "exact", admin: "exact" },
  digit_fsm: { "fsm-home": "exact", "fsm-sites": "provisional", "fsm-intake": "provisional", "fsm-agreements": "provisional", "fsm-operations": "provisional", "fsm-dispatch": "provisional", "fsm-itm": "provisional",
    "fsm-deficiencies": "provisional", "fsm-field": "provisional", "fsm-parts": "exact", "fsm-commercial": "exact", "fsm-comms": "provisional", "fsm-analytics": "exact", "fsm-config": "exact" },
};

/** Company.domain / Industry Type values → industry icon (ERPNext domains: Distribution, Manufacturing, Retail, Services, Education, Healthcare, …). */
const INDUSTRY: [RegExp, DigitIconName][] = [
  [/manufactur|factory|industrial/i, "ind-manufacturing"],
  [/distribut|wholesale|logistic/i, "ind-distribution"],
  [/retail|shop|store/i, "ind-retail"],
  [/educat|school|universit|training/i, "ind-education"],
  [/health|hospital|clinic|medical/i, "ind-healthcare"],
  [/hospitality|hotel|restaurant|tourism/i, "ind-hospitality"],
  [/real ?estate|property/i, "ind-realestate"],
  [/construct|contract/i, "ind-contracting"],
  [/service|consult|professional/i, "ind-proservices"],
];
export const industryIcon = (value: unknown): DigitIconName | undefined => {
  const s = String(value ?? "").trim();
  return s ? INDUSTRY.find(([re]) => re.test(s))?.[1] : undefined;
};

/** POS Profile / sector names → POS sector icon; any other profile uses the Point of Sale module icon. */
const POS: [RegExp, DigitIconName][] = [
  [/mobile|phone|جوال/i, "pos-mobileshops"],
  [/pharma|صيدل/i, "pos-pharmacies"],
  [/salon|beauty|barber|صالون/i, "pos-salons"],
  [/sweet|bakery|confection|حلوي|حلو/i, "pos-sweets"],
];
export const posIcon = (value: unknown): DigitIconName => POS.find(([re]) => re.test(String(value ?? "")))?.[1] ?? "mod-pos";

export interface PlaceLink { id: string; icon: DigitIconName; label: { en: string; ar: string }; doctype?: string; to?: string }

/** Enterprise Home › Help & services (every user; each entry shown only when the user may read its DocType). */
export const HELP_LINKS: PlaceLink[] = [
  { id: "help", icon: "trust-knowledge", label: { en: "Help articles", ar: "مقالات المساعدة" }, doctype: "Help Article" },
  { id: "issues", icon: "svc-support", label: { en: "Support tickets", ar: "تذاكر الدعم" }, doctype: "Issue" },
  { id: "sla", icon: "trust-sla", label: { en: "Service level agreements", ar: "اتفاقيات مستوى الخدمة" }, doctype: "Service Level Agreement" },
  { id: "onboarding", icon: "svc-implementation", label: { en: "Getting started", ar: "البدء والتهيئة" }, doctype: "Module Onboarding" },
  { id: "training", icon: "svc-training", label: { en: "Training programs", ar: "البرامج التدريبية" }, doctype: "Training Program" },
  { id: "maintenance", icon: "svc-maintenance", label: { en: "Maintenance schedules", ar: "جداول الصيانة" }, doctype: "Maintenance Schedule" },
  { id: "comparison", icon: "trust-comparison", label: { en: "BOM comparison", ar: "مقارنة قوائم المواد" }, to: "/page/bom-comparison-tool" },
];

/** Enterprise Home › Administration (Desk-authorised users only: Administrator / System Manager / Developer mode). */
export const ADMIN_LINKS: PlaceLink[] = [
  { id: "customize", icon: "svc-customization", label: { en: "Customize Form", ar: "تخصيص النموذج" }, to: "/customize-form" },
  { id: "import", icon: "svc-data-migration", label: { en: "Data import", ar: "استيراد البيانات" }, doctype: "Data Import" },
  { id: "roles", icon: "feat-permissions", label: { en: "Role permissions", ar: "صلاحيات الأدوار" }, to: "/page/permission-manager" },
  { id: "security", icon: "feat-security", label: { en: "System settings", ar: "إعدادات النظام" }, doctype: "System Settings" },
  { id: "translations", icon: "feat-bilingual", label: { en: "Translations", ar: "الترجمات" }, doctype: "Translation" },
  { id: "currency", icon: "feat-multicurrency", label: { en: "Currency exchange", ar: "أسعار صرف العملات" }, doctype: "Currency Exchange" },
  { id: "files", icon: "feat-documents", label: { en: "Files", ar: "الملفات" }, doctype: "File" },
  { id: "letterhead", icon: "feat-signature", label: { en: "Letter heads", ar: "الترويسات" }, doctype: "Letter Head" },
  { id: "integrations", icon: "feat-integrations", label: { en: "Webhooks", ar: "خطافات الويب" }, doctype: "Webhook" },
  { id: "email", icon: "trust-email", label: { en: "Email accounts", ar: "حسابات البريد" }, doctype: "Email Account" },
  { id: "backups", icon: "feat-backup", label: { en: "Backups", ar: "النسخ الاحتياطية" }, to: "/page/backups" },
  { id: "health", icon: "feat-cloud", label: { en: "System health", ar: "صحة النظام" }, doctype: "System Health Report" },
  { id: "jobs", icon: "svc-hosting", label: { en: "Scheduled jobs", ar: "المهام المجدولة" }, doctype: "Scheduled Job Type" },
  { id: "activity", icon: "svc-discovery", label: { en: "Activity log", ar: "سجل النشاط" }, doctype: "Activity Log" },
  { id: "errors", icon: "ui-warning", label: { en: "Error logs", ar: "سجلات الأخطاء" }, doctype: "Error Log" },
  { id: "insights", icon: "feat-ai", label: { en: "Insights", ar: "التحليلات" }, to: "/insights" },
];
