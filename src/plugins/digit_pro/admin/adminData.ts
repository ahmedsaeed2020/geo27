/**
 * Administration data (ADM-03, HOST-ADMIN, HOST-ACCESS, PL3, PL4, PL6, ENT-18, providers): pure readers over adapter records
 * and catalog metadata — the role × department × workspace × action matrix, integrations and background jobs, automation
 * records, upgrade impact of site customizations, site flags and external-engine provider settings.
 * Server-only facts (RQ queue, installed app HEAD) are reported as server states with their Frappe method, never invented.
 */
import { adapter, type Doc } from "@/lib/adapter";
import { cachedMeta } from "@/lib/catalog";
import { permRules } from "@/lib/session";
import { getDevMode } from "@/lib/mode";
import { volumeEnabled } from "@/lib/volume";
import { allPlugins, enabledPlugins } from "@/plugins/runtime";
import { PROVIDER_DT, PROVIDER_LABEL, providerSettings } from "@/lib/coreShared/providers";
import type { Bi } from "../command";
import { CORE_DT } from "@/lib/coreShared/doctypes";
import { safeLogo } from "@/lib/printFrame";
import { DEPARTMENTS, dtOf, pageItems, SECTION_PAGES } from "../nav";
import { featureEnabled, featureRules } from "./featureControl";

/* ------------------------------------------------------------------ ADM-03 permissions matrix ------------------------------------------------------------------ */
export const MATRIX_ACTIONS = ["read", "create", "write", "submit", "cancel", "delete", "report", "export", "print"] as const;
export type MatrixAction = (typeof MATRIX_ACTIONS)[number];
export type CellState = "allowed" | "hidden" | "unknown";
export interface MatrixRow { dept: string; workspace: string; workspaceLabel: string; doctype: string; visible: boolean; cells: Record<MatrixAction, CellState>; source: "Custom DocPerm" | "DocType" | "unknown" }
/** The doctypes a workspace hosts (navigation items + nothing invented). */
export const workspaceDoctypes = (pageId: string) => { const p = SECTION_PAGES.find((x) => x.id === pageId); return p ? [...new Set(pageItems(p).flatMap((i) => dtOf(i.target)))] : []; };
/** Role × app (DIGIT Pro) × department × workspace × action, from the same DocPerm rules session.ts enforces. Denied = hidden. */
export function permissionMatrix(role: string, company = ""): MatrixRow[] {
  const out: MatrixRow[] = [];
  for (const p of SECTION_PAGES) {
    const visibleWs = featureEnabled(`ws:${p.id}`, { user: `matrix::${role}`, roles: [role], company });
    for (const dt of workspaceDoctypes(p.id)) {
      const meta = cachedMeta(dt);
      const cells = {} as Record<MatrixAction, CellState>;
      if (!meta) { for (const a of MATRIX_ACTIONS) cells[a] = visibleWs ? "unknown" : "hidden"; out.push({ dept: p.dept, workspace: p.id, workspaceLabel: p.label, doctype: dt, visible: false, cells, source: "unknown" }); continue; }
      const custom = adapter.list("Custom DocPerm").some((x) => x["parent"] === dt);
      const rules = permRules(meta).filter((r) => (r.role === role || r.role === "All") && Number(r.permlevel ?? 0) === 0);
      for (const a of MATRIX_ACTIONS) cells[a] = visibleWs && rules.some((r) => Number(r[a] ?? 0) === 1) ? "allowed" : "hidden";
      out.push({ dept: p.dept, workspace: p.id, workspaceLabel: p.label, doctype: dt, visible: visibleWs && cells.read === "allowed", cells, source: custom ? "Custom DocPerm" : "DocType" });
    }
  }
  return out;
}
/** Roles that exist in the site (Role records) plus the roles named by DocPerm rules of the Pro doctypes. */
export function knownRoles(): string[] {
  const s = new Set(adapter.list("Role").map((r) => r.name));
  for (const p of SECTION_PAGES) for (const dt of workspaceDoctypes(p.id)) for (const r of cachedMeta(dt) ? permRules(cachedMeta(dt)!) : []) s.add(r.role);
  for (const x of ["Administrator", "Guest", "All"]) s.delete(x);
  return [...s].sort();
}
export const matrixDoctypes = () => [...new Set(SECTION_PAGES.flatMap((p) => workspaceDoctypes(p.id)))];

/* ------------------------------------------------------------------ PL3 integrations & background jobs ------------------------------------------------------------------ */
export interface JobRow { name: string; kind: Bi; status: string; last?: string | undefined; detail?: string | undefined; route: { doctype: string; name: string } }
export interface MonitorResult { jobs: JobRow[]; integrations: JobRow[]; server: { method: string; note: Bi } }
export function jobMonitor(): MonitorResult {
  const jobs: JobRow[] = [
    ...adapter.list("Scheduled Job Type").map((d) => ({ name: d.name, kind: ["Scheduled job", "مهمة مجدولة"] as Bi, status: Number(d["stopped"]) ? "Stopped" : "Active", last: str(d["last_execution"]), detail: str(d["frequency"]), route: { doctype: "Scheduled Job Type", name: d.name } })),
    ...adapter.list("Data Import").map((d) => ({ name: d.name, kind: ["Data import", "استيراد بيانات"] as Bi, status: str(d["status"]) || "Pending", last: str(d["modified"]), detail: str(d["reference_doctype"]), route: { doctype: "Data Import", name: d.name } })),
    ...adapter.list("Prepared Report").map((d) => ({ name: d.name, kind: ["Prepared report", "تقرير مُعدّ"] as Bi, status: str(d["status"]) || "Queued", last: str(d["modified"]), detail: str(d["report_name"]), route: { doctype: "Prepared Report", name: d.name } })),
  ];
  const integrations: JobRow[] = [
    ...adapter.list("Webhook").map((d) => ({ name: d.name, kind: ["Webhook", "خطاف ويب"] as Bi, status: Number(d["enabled"] ?? 1) ? "Enabled" : "Disabled", detail: `${str(d["webhook_doctype"])} · ${str(d["webhook_docevent"])}`, route: { doctype: "Webhook", name: d.name } })),
    ...adapter.list("Email Account").map((d) => ({ name: d.name, kind: ["Email account", "حساب بريد"] as Bi, status: Number(d["enable_outgoing"]) ? "Outgoing on" : "Outgoing off", detail: str(d["email_id"]), route: { doctype: "Email Account", name: d.name } })),
    ...providerSettings().map((p) => ({ name: p.name, kind: PROVIDER_LABEL[p.engine], status: p.mode === "server" ? (p.endpoint ? "Server endpoint set" : "Server endpoint missing") : "Preview engine", detail: p.provider, route: { doctype: PROVIDER_DT, name: p.name } })),
  ];
  return { jobs, integrations, server: { method: "frappe.core.page.background_jobs.background_jobs.get_info", note: ["Live queue workers, failed jobs and retries are read from the DIGIT server (RQ); the preview lists the job records it holds.", "عمّال الطابور الحيّ والمهام الفاشلة وإعادة المحاولة تُقرأ من خادم فرابي (RQ)؛ المعاينة تعرض سجلات المهام المتوفرة لديها."] } };
}
const str = (v: unknown) => (v === undefined || v === null ? "" : String(v));

/* ------------------------------------------------------------------ PL6 automation overview ------------------------------------------------------------------ */
export const AUTOMATION_DTS: [string, Bi, string][] = [
  ["Assignment Rule", ["Assignment rules", "قواعد الإسناد"], "document_type"], ["Notification", ["Notifications & alerts", "الإشعارات والتنبيهات"], "document_type"],
  ["Auto Repeat", ["Recurring documents", "المستندات المتكررة"], "reference_doctype"], ["Workflow", ["Workflows", "سير العمل"], "document_type"],
  ["Server Script", ["Server scripts", "نصوص الخادم"], "reference_doctype"], ["Client Script", ["Client scripts", "نصوص العميل"], "dt"],
  ["Webhook", ["Webhooks", "خطافات الويب"], "webhook_doctype"], ["Digit Saved Query Alert", ["Saved-query alerts", "تنبيهات الاستعلامات المحفوظة"], "query"],
];
export interface AutomationGroup { doctype: string; label: Bi; rows: { name: string; target: string; enabled: boolean }[] }
export function automationOverview(): AutomationGroup[] {
  return AUTOMATION_DTS.map(([dt, label, field]) => ({ doctype: dt, label, rows: adapter.list(dt).map((d) => ({ name: d.name, target: str(d[field]), enabled: !(Number(d["disabled"] ?? 0) === 1 || Number(d["enabled"] ?? 1) === 0 || Number(d["is_active"] ?? 1) === 0) })) }));
}

/* ------------------------------------------------------------------ PL4 upgrade impact ------------------------------------------------------------------ */
export type ImpactRisk = "breaks" | "review" | "ok";
export interface ImpactRow { doctype: string; name: string; target: string; risk: ImpactRisk; reason: Bi }
/**
 * Which site customizations would break or need review against the CURRENT DocType definitions (what an upgrade changes):
 * Custom Field insert_after / Property Setter field / Client & Server Script doctype that no longer exist.
 */
export function upgradeImpact(): ImpactRow[] {
  const out: ImpactRow[] = [];
  const has = (dt: string, f: string) => { const m = cachedMeta(dt); return m ? m.fields.some((x) => x.fieldname === f) || adapter.list("Custom Field").some((c) => c["dt"] === dt && c["fieldname"] === f) : undefined; };
  for (const c of adapter.list("Custom Field")) {
    const dt = str(c["dt"]); const m = cachedMeta(dt); const after = str(c["insert_after"]);
    if (!m) out.push({ doctype: "Custom Field", name: c.name, target: dt, risk: "review", reason: ["Target DocType definition not loaded — check after upgrade", "تعريف المستند الهدف غير محمّل — يُراجع بعد الترقية"] });
    else if (after && has(dt, after) === false) out.push({ doctype: "Custom Field", name: c.name, target: `${dt}.${after}`, risk: "breaks", reason: ["Inserted after a field that no longer exists", "مُدرج بعد حقل لم يعد موجودًا"] });
    else out.push({ doctype: "Custom Field", name: c.name, target: `${dt}.${str(c["fieldname"])}`, risk: "ok", reason: ["Anchor field still exists", "حقل الإرساء ما زال موجودًا"] });
  }
  for (const p of adapter.list("Property Setter")) {
    const dt = str(p["doc_type"]); const f = str(p["field_name"]);
    if (!f) { out.push({ doctype: "Property Setter", name: p.name, target: dt, risk: cachedMeta(dt) ? "ok" : "review", reason: ["DocType-level property", "خاصية على مستوى المستند"] }); continue; }
    const ok = has(dt, f);
    out.push({ doctype: "Property Setter", name: p.name, target: `${dt}.${f}`, risk: ok === false ? "breaks" : ok ? "ok" : "review", reason: ok === false ? ["Field no longer exists — the setter is ignored", "الحقل لم يعد موجودًا — يُتجاهل الإعداد"] : ok ? ["Field still exists", "الحقل ما زال موجودًا"] : ["Target DocType definition not loaded", "تعريف المستند الهدف غير محمّل"] });
  }
  for (const [dt, field] of [["Client Script", "dt"], ["Server Script", "reference_doctype"]] as const) for (const s of adapter.list(dt)) {
    const target = str(s[field]); if (!target) continue;
    out.push({ doctype: dt, name: s.name, target, risk: cachedMeta(target) ? "review" : "review", reason: ["Script code must be re-tested on the upgraded version (code is never run in the preview)", "يجب إعادة اختبار الشيفرة على الإصدار المُرقّى (لا تُنفّذ في المعاينة)"] });
  }
  return out;
}

/* ------------------------------------------------------------------ ENT-18 site flags ------------------------------------------------------------------ */
export interface SiteFlag { key: string; label: Bi; value: string; source: string }
export function siteFlags(): SiteFlag[] {
  const en = new Set(enabledPlugins().map((p) => p.name));
  return [
    ...allPlugins().map((p) => ({ key: `app:${p.name}`, label: [`App ${p.title}`, `تطبيق ${p.title_ar ?? p.title}`] as Bi, value: en.has(p.name) ? "enabled" : "disabled", source: "Apps & Plugins" })),
    { key: "sample-volume", label: ["Demo sample data", "بيانات العرض التجريبية"], value: volumeEnabled() ? "on" : "off", source: "Administration → Site" },
    { key: "developer-mode", label: ["Developer mode", "وضع المطوّر"], value: getDevMode() ? "on" : "off", source: "Avatar menu" },
    { key: "feature-rules", label: ["Feature Control rules", "قواعد التحكم بالميزات"], value: String(featureRules().length), source: "Administration → Features" },
    { key: "providers", label: ["External engine providers", "مزوّدو المحركات الخارجية"], value: providerSettings().map((p) => `${p.engine}:${p.mode}`).join(", ") || "preview defaults", source: "Administration → Integrations" },
    { key: "departments", label: ["Pro departments visible to all", "أقسام برو الظاهرة للجميع"], value: String(DEPARTMENTS.filter((d) => !featureRules(`dept:${d.id}`).some((r) => !r.enabled)).length), source: "Administration → Features" },
  ];
}

/* ------------------------------------------------------------------ external engines: provider settings ------------------------------------------------------------------ */
// Moved to the shared Core (owner DEC-02): src/lib/coreShared/providers.ts owns the DocType, engines and the sending log.
export { PROVIDER_DT, PROVIDER_LABEL, ENGINES, providerSettings, providerFor, setProvider, type Engine, type ProviderSetting } from "@/lib/coreShared/providers";

/* ------------------------------------------------------------------ print branding (owner 2026-11-12 §C6) ------------------------------------------------------------------ */
export const BRANDING_FIELDS = ["company_name_ar", "company_name_en", "logo", "vat_number", "cr_number", "address_ar", "address_en", "phone", "email", "website", "bank_name", "account_name", "iban", "terms_ar", "terms_en", "footer_note_ar", "footer_note_en"] as const;
export type BrandingField = (typeof BRANDING_FIELDS)[number];
/** Save a company's print branding (the Core Digit Print Branding record read by the Enterprise print frame). */
export function setBranding(company: string, patch: Partial<Record<BrandingField, string>>): { ok: true } | { ok: false; error: Bi } {
  if (!company) return { ok: false, error: ["Choose a company.", "اختر الشركة."] };
  const v = (k: BrandingField) => String(patch[k] ?? "").trim();
  if (v("vat_number") && !/^3\d{13}3$/.test(v("vat_number"))) return { ok: false, error: ["The VAT number must be 15 digits starting and ending with 3.", "يجب أن يكون الرقم الضريبي 15 رقمًا يبدأ وينتهي بالرقم 3."] };
  if (v("cr_number") && !/^\d{10}$/.test(v("cr_number"))) return { ok: false, error: ["The CR number must be 10 digits.", "يجب أن يكون السجل التجاري 10 أرقام."] };
  if (v("iban") && !/^SA\d{2}[A-Z0-9]{20}$/.test(v("iban").replace(/\s+/g, "").toUpperCase())) return { ok: false, error: ["A Saudi IBAN is SA followed by 22 characters.", "الآيبان السعودي يبدأ بـ SA ويليه 22 خانة."] };
  if (v("logo") && !safeLogo(v("logo"))) return { ok: false, error: ["The logo must be an uploaded image or an https address.", "يجب أن يكون الشعار صورة مرفوعة أو عنوان https."] };
  const data = Object.fromEntries(BRANDING_FIELDS.filter((k) => k in patch).map((k) => [k, v(k)]));
  if (adapter.get(CORE_DT.printBranding, company)) adapter.update(CORE_DT.printBranding, company, data);
  else adapter.insertDoc(CORE_DT.printBranding, { name: company, company, ...data });
  return { ok: true };
}
