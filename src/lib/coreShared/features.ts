/**
 * Shared Core feature switches (owner decision 4, 2026-11-11: Administration controls which features, apps, tabs and
 * blocks show per role and company). Rules are adapter records of the Core DocType "Digit Pro Feature Control"
 * (feature / company / role / enabled; name kept so stored rules stay valid). Resolution, most specific wins:
 * company+role → company+any role → any company+role → any+any → default on. A user sees a feature when ANY of their roles
 * resolves to on (roles are additive); Administrator is never locked out. App-agnostic: apps add their own feature
 * catalogues and parent chains on top (DIGIT Pro: src/plugins/digit_pro/admin/featureControl.ts).
 */
import { adapter, type Doc } from "@/lib/adapter";
import { ADMIN, userRoles } from "@/lib/session";
import { CORE_DT } from "./doctypes";

export type Bi = [string, string];
export const FEATURE_DT = CORE_DT.feature;
export const ANY = "*";
export interface FeatureRule { name: string; feature: string; company: string; role: string; enabled: boolean }

/** DIGIT apps an administrator may show or hide per company / role (dock, Enterprise menu, app discovery). */
export const APP_FEATURES: [string, Bi][] = [
  ["app:digit_pro", ["DIGIT Pro app", "تطبيق ديجيت برو"]],
  ["app:digit_hr", ["DIGIT HR app", "تطبيق ديجيت للموارد البشرية"]],
  ["app:digit_construction", ["DIGIT Construction app", "تطبيق ديجيت للمقاولات"]],
  ["app:digit_crm", ["DIGIT CRM app", "تطبيق ديجيت لإدارة العملاء"]],
  ["app:digit_fsm", ["DIGIT Field Service app", "تطبيق ديجيت للخدمة الميدانية"]],
];

/** Blocks inside every document an administrator may show or hide per company / role (owner OWN-45, FINAL WORK LIST
 * 2026-11-13): the shared document frame's blocks and the four document panel tabs. Read by the document route
 * (DocFrame.tsx) and DocPanels.tsx with the session user, so a hidden block disappears for that role in every document. */
export const DOC_FEATURES: [string, Bi][] = [
  ["ent:smart-guide", ["Smart Guide on documents", "الدليل الذكي على المستندات"]],
  ["doc:smart-buttons", ["Related-document buttons with counts in the document header", "أزرار المستندات المرتبطة مع العدد في رأس المستند"]],
  ["doc:party360", ["Party 360 beside the document", "لوحة الطرف 360 بجانب المستند"]],
  ["doc:effect", ["Ledger / stock effect preview inside documents", "معاينة الأثر المحاسبي والمخزني داخل المستندات"]],
  ["doc:tabs", ["Linked documents, Activity and Changes tabs", "تبويبات المستندات المرتبطة والنشاط والتغييرات"]],
  ["doc:actions", ["Hold, reverse, repeat and save & new buttons", "أزرار الإيقاف والعكس والتكرار والحفظ مع جديد"]],
  ["doc:panels-work", ["Document panels: work on the document", "لوحات المستند: العمل على المستند"]],
  ["doc:panels-insight", ["Document panels: 360 insight", "لوحات المستند: الرؤية الشاملة 360"]],
  ["doc:panels-flow", ["Document panels: flow and history", "لوحات المستند: المسار والسجل"]],
  ["doc:panels-control", ["Document panels: controls and compliance", "لوحات المستند: الضوابط والامتثال"]],
];

const ruleName = (key: string, company: string, role: string) => `${key}::${company || ANY}::${role || ANY}`;
const asRule = (d: Doc): FeatureRule => ({ name: d.name, feature: String(d["feature"]), company: String(d["company"] || ANY), role: String(d["role"] || ANY), enabled: Number(d["enabled"]) === 1 });
export function featureRules(key?: string): FeatureRule[] { return adapter.list(FEATURE_DT).map(asRule).filter((r) => !key || r.feature === key); }

/** Set (or replace) the rule for a feature at one company/role scope. */
export function setFeature(key: string, enabled: boolean, company = ANY, role = ANY): FeatureRule {
  const name = ruleName(key, company, role); const fields = { feature: key, company, role, enabled: enabled ? 1 : 0 };
  if (adapter.get(FEATURE_DT, name)) adapter.update(FEATURE_DT, name, fields); else adapter.insertDoc(FEATURE_DT, { name, ...fields });
  return asRule(adapter.get(FEATURE_DT, name)!);
}
export function clearFeature(key: string, company = ANY, role = ANY) { const n = ruleName(key, company, role); if (adapter.get(FEATURE_DT, n)) adapter.remove(FEATURE_DT, n); }

/** On/off for one role at a company (most specific rule wins; no rule = on). */
export function roleResolves(key: string, role: string, company: string, rules = featureRules(key)): { enabled: boolean; rule?: FeatureRule | undefined } {
  const pick = (c: string, r: string) => rules.find((x) => x.company === c && x.role === r);
  const rule = (company ? pick(company, role) : undefined) ?? (company ? pick(company, ANY) : undefined) ?? pick(ANY, role) ?? pick(ANY, ANY);
  return { enabled: rule ? rule.enabled : true, rule };
}

/** Whether a feature (and every parent `parentOf` names) is on for this user at this company. */
export function featureOn(key: string, opts: { user?: string; roles?: string[]; company?: string } = {}, parentOf: (k: string) => string | undefined = () => undefined): boolean {
  const user = opts.user ?? ADMIN; if (user === ADMIN) return true;
  const all = featureRules(); if (!all.length) return true;
  // "All" / "Guest" are implicit roles: they decide only for a user with no real role (or when a rule names them)
  const own = (opts.roles ?? userRoles(user)).filter((r) => r !== "Guest" && r !== "All"); const roles = own.length ? own : ["All"];
  const chain: string[] = []; let k: string | undefined = key;
  while (k && !chain.includes(k)) { chain.push(k); k = parentOf(k); }
  return chain.every((c) => { const rules = all.filter((r) => r.feature === c); if (!rules.length) return true; return roles.some((r) => roleResolves(c, r, opts.company ?? "", rules).enabled); });
}
