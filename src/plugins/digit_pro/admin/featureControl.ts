/**
 * ADM-01 Feature Control — every DIGIT Pro department, section workspace, workspace tab and Run11.1 requirement id, plus the
 * shared Enterprise features, can be switched on/off per company and per role. Rules are adapter records of the app's own
 * DocType "Digit Pro Feature Control" (feature / company / role / enabled); nothing is a business value.
 * Resolution (most specific wins): company+role → company+any role → any company+role → any+any → default on.
 * A user sees a feature when ANY of their roles resolves to on (Frappe roles are additive). Administrator is never locked out.
 * Enforced by navAccess.navItemState (departments, workspaces) and SectionWorkspace (tabs); denied = hidden, never zero.
 */
import { ANY, APP_FEATURES, DOC_FEATURES, clearFeature, FEATURE_DT, featureOn, featureRules, roleResolves, setFeature, type FeatureRule } from "@/lib/coreShared/features";
import type { Bi } from "../command";
import { DEPARTMENTS, SECTION_PAGES } from "../nav";
import { RUN11_TAB_LABEL, RUN11_TABS } from "../run11";
import REQ from "./requirements.generated.json";

/** Resolution and storage are the shared Core feature switches (src/lib/coreShared/features.ts); this file adds the Pro catalogue. */
export { ANY, clearFeature, FEATURE_DT, featureRules, roleResolves, setFeature, type FeatureRule };
export type FeatureKind = "department" | "workspace" | "tab" | "requirement" | "enterprise";
export interface FeatureDef { key: string; kind: FeatureKind; label: Bi; group: string; parent?: string | undefined }

/** Shared Enterprise features an administrator may switch per company / role (keys are stable). */
export const ENTERPRISE_FEATURES: [string, Bi][] = [
  ["ent:split-view", ["Connected split view on reports and ledgers", "العرض المنقسم المتصل في التقارير والدفاتر"]],
  ["ent:assistant", ["DIGIT Assistant", "مساعد ديجيت"]],
  ["ent:quick-process", ["Quick process (deliver, invoice, receive in one step)", "المعالجة السريعة (تسليم وفوترة وتحصيل بخطوة واحدة)"]],
  ["ent:ocr", ["Supplier invoice OCR", "قراءة فواتير الموردين آليًا"]],
  ["ent:barcode", ["Barcode scanning", "مسح الباركود"]],
  ["ent:bank-feed", ["Bank feed import", "استيراد كشوف البنك آليًا"]],
  ["ent:pinned", ["Recent and pinned documents", "المستندات الأخيرة والمثبتة"]],
  ["ent:my-work", ["My Work counter", "عدّاد عملي"]],
  ["ent:dashboard-edit", ["Personal dashboard editing", "تعديل لوحة المعلومات الشخصية"]],
  ["ent:report-problem", ["Report a problem on a screen", "الإبلاغ عن مشكلة في شاشة"]],
  ...DOC_FEATURES,
  ...APP_FEATURES,
];

let catalogCache: FeatureDef[] | null = null;
export function featureCatalog(): FeatureDef[] {
  if (catalogCache) return catalogCache;
  const out: FeatureDef[] = [];
  for (const d of DEPARTMENTS) out.push({ key: `dept:${d.id}`, kind: "department", label: [d.label, d.label], group: d.id });
  for (const p of SECTION_PAGES) {
    out.push({ key: `ws:${p.id}`, kind: "workspace", label: [p.label, p.label], group: p.dept, parent: `dept:${p.dept}` });
    for (const t of RUN11_TABS) out.push({ key: `ws:${p.id}:${t}`, kind: "tab", label: RUN11_TAB_LABEL[t], group: p.dept, parent: `ws:${p.id}` });
  }
  for (const [id, dept, title] of (REQ as unknown as { requirements: [string, string, string][] }).requirements) out.push({ key: `run11:${id}`, kind: "requirement", label: [title, title], group: dept });
  for (const [key, label] of ENTERPRISE_FEATURES) out.push({ key, kind: "enterprise", label, group: "enterprise" });
  return (catalogCache = out);
}

/** Whether a feature (and every parent of it) is on for this user at this company. */
export function featureEnabled(key: string, opts: { user?: string; roles?: string[]; company?: string } = {}): boolean {
  const defs = featureCatalog();
  return featureOn(key, opts, (k) => defs.find((d) => d.key === k)?.parent);
}
/** Preview: which of these roles would see the feature at a company. */
export function featurePreview(key: string, roles: string[], company: string): Record<string, boolean> {
  return Object.fromEntries(roles.map((r) => [r, featureEnabled(key, { user: `preview::${r}`, roles: [r], company })]));
}
