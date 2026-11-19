/**
 * Activity feed rules shared by the Enterprise Home and the notification bell (display only; stored records unchanged).
 *
 * Provenance: "Recent changes" lists only genuine tracked operations by the user. A Version row is excluded when it was
 * written by sample/setup data: its record carries the seed flag (`__synthetic`) and the row only records creation, or
 * the row itself is stamped as setup (`__setup`). Setup records themselves are never deleted.
 *
 * Language: Frappe renders system notification subjects from translatable templates in the recipient's language. The
 * preview keeps the stored English subject and shows, in Arabic, the record's own Arabic subject (`subject_ar`, set by
 * the seed for sample rows) or the Arabic template for the notification type built from its structured fields.
 */
import { adapter, type Doc } from "@/lib/adapter";
import { translateTo, type Lang } from "@/i18n";
import { enabledPlugins } from "@/plugins/runtime";

const dtAr = (dt: string) => translateTo(dt, "ar");

/** A Version row written by sample/setup data rather than by a user action. */
export function isSetupVersion(v: Doc, get: (dt: string, name: string) => Doc | undefined = (dt, n) => adapter.get(dt, n)): boolean {
  if (v["__setup"]) return true;
  const created = String(v["data"] ?? "").includes('"created":true');
  return created && !!get(String(v["ref_doctype"]), String(v["docname"]))?.["__synthetic"];
}

/** Newest genuine changes by `user` among the given Version rows (already permission-scoped by the caller). */
export function recentUserChanges(versions: Doc[], user: string, limit = 6, get?: (dt: string, name: string) => Doc | undefined): Doc[] {
  return versions
    .filter((v) => (v["owner"] ?? v["modified_by"]) === user && !isSetupVersion(v, get))
    .sort((a, b) => String(b["creation"] ?? "").localeCompare(String(a["creation"] ?? "")))
    .slice(0, limit);
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/**
 * Arabic for a subject produced by an app notification rule (Notification.subject / subject_ar templates with the same
 * {field} placeholders): the English template is matched against the stored subject and its values are carried into
 * the Arabic template. Covers logs written before the rule carried subject_ar. Record values stay as stored.
 */
export function subjectFromTemplates(subject: string, templates: { subject: string; subject_ar?: string | undefined }[]): string | undefined {
  for (const t of templates) {
    if (!t.subject_ar) continue;
    const keys: string[] = [];
    const re = new RegExp(`^${esc(t.subject).replace(/\\\{(\w+)\\\}/g, (_m, k: string) => { keys.push(k); return "(.+?)"; })}$`);
    const m = subject.match(re); if (!m) continue;
    const vals: Record<string, string> = {}; keys.forEach((k, i) => { vals[k] = m[i + 1] ?? ""; });
    return t.subject_ar.replace(/\{(\w+)\}/g, (_m, k: string) => vals[k] ?? "");
  }
  return undefined;
}

/** Notification Log subject in the UI language. */
export function notificationSubject(n: Doc, lang: Lang, templates: { subject: string; subject_ar?: string | undefined }[] = enabledPlugins().flatMap((p) => p.notifications ?? [])): string {
  const subject = String(n["subject"] ?? n.name).replace(/<[^>]+>/g, "");
  if (lang !== "ar") return subject;
  if (n["subject_ar"]) return String(n["subject_ar"]);
  const fromRule = subjectFromTemplates(subject, templates); if (fromRule) return fromRule;
  const dt = String(n["document_type"] ?? ""), dn = String(n["document_name"] ?? "");
  if (!dt || !dn) return subject;
  switch (String(n["type"] ?? "")) {
    case "Assignment": return `تم إسناد ${dtAr(dt)} ${dn} إليك`;
    case "Share": return `تمت مشاركة ${dtAr(dt)} ${dn} معك`;
    case "Mention": return `${n["from_user"] === "Administrator" ? "المسؤول" : String(n["from_user"] ?? "")} ذكرك في تعليق على ${dtAr(dt)} ${dn}`.trim();
    default: return subject; // configured alert text is record content
  }
}

/** Notification type label in the UI language. */
export function notificationType(type: string, lang: Lang): string {
  if (lang !== "ar") return type;
  return ({ Assignment: "إسناد", Share: "مشاركة", Mention: "إشارة", Alert: "تنبيه", "Energy Point": "نقاط" } as Record<string, string>)[type] ?? type;
}

const uiLang = (): Lang => (typeof window !== "undefined" && localStorage.getItem("digit-virtual-core:lang") === "ar" ? "ar" : "en");
/** Event subject in the current UI language, for data builders that run during render without a language argument. */
export function eventSubjectNow(e: Doc): string { return eventSubject(e, uiLang()); }

/** Event subject in the UI language (`subject_ar` when the record has one). */
export function eventSubject(e: Doc, lang: Lang): string {
  return lang === "ar" && e["subject_ar"] ? String(e["subject_ar"]) : String(e["subject"] ?? e.name);
}
