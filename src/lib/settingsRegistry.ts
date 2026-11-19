/**
 * Settings & administration registry (P2.3). Domains map to settings/administration DocTypes that exist in the frozen
 * catalog (asserted by masterFoundation.test.ts — names are never invented). Execution is evidence-based:
 * LOCAL_CONFIG_CONSUMED = the record is read by Core code (runtime-contract settings_consumers);
 * LOCAL_CONFIG_STORED = editable and persisted through the adapter, but no virtual behaviour reads it yet;
 * effects of controller hooks on these records remain FRAPPE_SERVER_REQUIRED.
 */
import type { IndexEntry } from "./catalog";
import type { RuntimeContract } from "./runtimeContract";

export interface SettingsDomain { id: string; label: { en: string; ar: string }; modules: string[]; doctypes: string[]; pages?: string[]; always?: boolean }
export const SETTINGS_DOMAINS: SettingsDomain[] = [
  { id: "system", label: { en: "System", ar: "النظام" }, modules: ["Core", "Desk"], doctypes: ["System Settings", "Global Defaults", "Log Settings", "Navbar Settings", "Session Default Settings"] },
  { id: "accounts", label: { en: "Accounts", ar: "الحسابات" }, modules: ["Accounts"], doctypes: ["Accounts Settings", "Currency Exchange Settings", "Finance Book"] },
  { id: "buying", label: { en: "Buying", ar: "المشتريات" }, modules: ["Buying"], doctypes: ["Buying Settings"] },
  { id: "selling", label: { en: "Selling", ar: "المبيعات" }, modules: ["Selling"], doctypes: ["Selling Settings", "POS Settings"] },
  { id: "stock", label: { en: "Stock", ar: "المخزون" }, modules: ["Stock"], doctypes: ["Stock Settings", "Stock Reposting Settings", "Item Variant Settings", "Delivery Settings"] },
  { id: "manufacturing", label: { en: "Manufacturing", ar: "التصنيع" }, modules: ["Manufacturing"], doctypes: ["Manufacturing Settings"] },
  { id: "projects", label: { en: "Projects", ar: "المشاريع" }, modules: ["Projects"], doctypes: ["Projects Settings"] },
  { id: "hrms", label: { en: "HRMS", ar: "الموارد البشرية" }, modules: ["HR", "Payroll"], doctypes: ["HR Settings", "Payroll Settings"] },
  { id: "crm", label: { en: "CRM", ar: "إدارة علاقات العملاء" }, modules: ["CRM", "FCRM"], doctypes: ["CRM Settings", "ERPNext CRM Settings", "FCRM Settings"] },
  { id: "support", label: { en: "Support", ar: "الدعم" }, modules: ["Support"], doctypes: ["Support Settings"] },
  { id: "quality", label: { en: "Quality", ar: "الجودة" }, modules: ["Quality Management"], doctypes: ["Quality Goal", "Quality Procedure", "Quality Inspection Template"] },
  { id: "assets", label: { en: "Assets", ar: "الأصول" }, modules: ["Assets"], doctypes: ["Asset Category", "Finance Book"] },
  { id: "permissions", label: { en: "Permissions", ar: "الصلاحيات" }, modules: [], doctypes: ["Role", "Role Profile", "Module Profile", "Custom DocPerm", "User Permission"], pages: ["permission-manager"], always: true },
  { id: "workflows", label: { en: "Workflows", ar: "سير العمل" }, modules: ["Workflow"], doctypes: ["Workflow", "Workflow State", "Workflow Action Master"], pages: ["workflow-builder"], always: true },
  { id: "naming", label: { en: "Naming Series", ar: "سلاسل التسمية" }, modules: [], doctypes: ["Document Naming Settings", "Document Naming Rule"], always: true },
  { id: "currencies", label: { en: "Currencies", ar: "العملات" }, modules: [], doctypes: ["Currency", "Currency Exchange"] },
  { id: "companies", label: { en: "Companies", ar: "الشركات" }, modules: [], doctypes: ["Company"] },
  { id: "fiscal_year", label: { en: "Fiscal Year", ar: "السنة المالية" }, modules: [], doctypes: ["Fiscal Year"] },
  { id: "reports", label: { en: "Reports", ar: "التقارير" }, modules: [], doctypes: ["Report", "Prepared Report"] },
  { id: "print", label: { en: "Print Formats", ar: "تنسيقات الطباعة" }, modules: ["Printing"], doctypes: ["Print Format", "Print Settings", "Letter Head"], pages: ["print-format-builder"], always: true },
  { id: "notifications", label: { en: "Notifications", ar: "الإشعارات" }, modules: [], doctypes: ["Notification", "Notification Settings", "Email Account"], always: true },
  { id: "app_config", label: { en: "Application Configuration", ar: "إعدادات التطبيقات" }, modules: [], doctypes: ["Installed Applications", "Module Def", "Desktop Settings", "Workspace", "List View Settings"] },
];
export type SettingsExecution = "LOCAL_CONFIG_CONSUMED" | "LOCAL_CONFIG_STORED" | "SOURCE_UNVERIFIED";
export interface ResolvedSetting { doctype: string; present: boolean; app?: string; slug?: string; issingle?: boolean; execution: SettingsExecution; consumers: string[]; server_effects: string[] }
export interface ResolvedDomain { id: string; label: { en: string; ar: string }; settings: ResolvedSetting[]; pages: string[]; app_settings: { plugin: string; doctype: string; label: string }[] }

export function resolveSetting(dt: string, index: IndexEntry[], contract?: RuntimeContract | null): ResolvedSetting {
  const e = index.find((i) => i.name === dt);
  if (!e) return { doctype: dt, present: false, execution: "SOURCE_UNVERIFIED", consumers: [], server_effects: [] };
  const consumers = contract?.settings_consumers[dt] ?? [];
  const hooks = contract?.lifecycle[dt]?.hooks ?? [];
  return { doctype: dt, present: true, app: e.app, slug: e.slug, issingle: !!e.issingle, execution: consumers.length ? "LOCAL_CONFIG_CONSUMED" : "LOCAL_CONFIG_STORED", consumers,
    server_effects: hooks.filter((h) => ["validate", "on_update", "before_save", "on_change"].includes(h)).map((h) => `${dt}.${h} (FRAPPE_SERVER_REQUIRED)`) };
}
export function resolveSettingsDomains(index: IndexEntry[], contract?: RuntimeContract | null, appSettings: { plugin: string; doctype: string; label: string }[] = []): ResolvedDomain[] {
  const domains = SETTINGS_DOMAINS.map((d) => ({ id: d.id, label: d.label, settings: d.doctypes.map((dt) => resolveSetting(dt, index, contract)), pages: d.pages ?? [], app_settings: [] as ResolvedDomain["app_settings"] }));
  if (appSettings.length) domains.find((d) => d.id === "app_config")!.app_settings = appSettings;
  return domains;
}
/** Settings relevant to a DocType: same-module domains + always-relevant administration (naming, workflows, permissions, print, notifications). */
export function settingsForDocType(meta: { name: string; module: string; autoname?: string | null | undefined; fields?: { fieldname?: string | undefined }[] | undefined }, index: IndexEntry[], contract?: RuntimeContract | null): ResolvedDomain[] {
  const naming = !!meta.autoname || !!meta.fields?.some((f) => f.fieldname === "naming_series");
  return resolveSettingsDomains(index, contract).filter((d) => { const def = SETTINGS_DOMAINS.find((x) => x.id === d.id)!; return def.modules.includes(meta.module) || (def.always && (def.id !== "naming" || naming)); });
}
/** Search settings DocTypes and the domains that own them (e.g. "naming", "Stock Settings", "currency"). */
export function searchSettings(q: string, index: IndexEntry[], contract?: RuntimeContract | null): ResolvedDomain[] {
  const s = q.trim().toLowerCase(); if (!s) return resolveSettingsDomains(index, contract);
  return resolveSettingsDomains(index, contract).map((d) => ({ ...d, settings: d.label.en.toLowerCase().includes(s) || d.label.ar.includes(q.trim()) ? d.settings : d.settings.filter((x) => x.doctype.toLowerCase().includes(s)) })).filter((d) => d.settings.length);
}
