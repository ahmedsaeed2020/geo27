/**
 * DIGIT shared Core saved report criteria (Part B: R1-b). A user saves the filter values of a query / script report under a
 * title and may mark one set to open with by default. Records are the Core DocType "Digit Report Criteria", owner-only:
 * nobody reads, changes or removes another user's criteria, and criteria never change a report's figures — they only fill
 * its filters, so the report still applies the same role and User Permission rules.
 */
import { adapter, type Doc } from "@/lib/adapter";
import { currentUser } from "@/lib/session";
import { CORE_DT } from "./doctypes";

export type Bi = [string, string];
export type Criteria = Record<string, string>;
const s = (v: unknown) => String(v ?? "");
const parse = (v: unknown): Criteria => { try { const o = JSON.parse(s(v) || "{}"); return o && typeof o === "object" && !Array.isArray(o) ? Object.fromEntries(Object.entries(o).map(([k, x]) => [k, s(x)])) : {}; } catch { return {}; } };
/** Only filled filters are stored, in a stable order, so equal criteria compare equal. */
const clean = (f: Criteria): Criteria => Object.fromEntries(Object.entries(f).filter(([, v]) => v !== "" && v !== undefined && v !== null).sort(([a], [b]) => a.localeCompare(b)));

export const criteriaFor = (report: string, user = currentUser()): Doc[] =>
  adapter.list(CORE_DT.reportCriteria).filter((d) => s(d["report"]) === report && s(d["user"]) === user).sort((a, b) => Number(b["is_default"] ?? 0) - Number(a["is_default"] ?? 0) || s(a["title"]).localeCompare(s(b["title"])));
export const criteriaValues = (d: Doc): Criteria => parse(d["filters"]);
export function defaultCriteria(report: string, user = currentUser()): Criteria | null {
  const d = criteriaFor(report, user).find((x) => Number(x["is_default"] ?? 0)); return d ? criteriaValues(d) : null;
}
/** Save (or overwrite the user's set with the same title). */
export function saveCriteria(report: string, title: string, filters: Criteria, opts: { isDefault?: boolean } = {}, user = currentUser()): { ok: true; name: string } | { ok: false; reason: Bi } {
  const t = title.trim(); if (!t) return { ok: false, reason: ["Give the criteria a title.", "أعطِ المعايير عنوانًا."] };
  const values = clean(filters); if (!Object.keys(values).length) return { ok: false, reason: ["Set at least one filter before saving.", "اضبط مرشحًا واحدًا على الأقل قبل الحفظ."] };
  const mine = criteriaFor(report, user); const same = mine.find((d) => s(d["title"]).toLowerCase() === t.toLowerCase());
  if (opts.isDefault) for (const d of mine) if (d !== same && Number(d["is_default"] ?? 0)) adapter.update(CORE_DT.reportCriteria, d.name, { is_default: 0 });
  const row = { title: t, report, user, filters: JSON.stringify(values), is_default: opts.isDefault ? 1 : same ? Number(same["is_default"] ?? 0) : 0 };
  if (same) { adapter.update(CORE_DT.reportCriteria, same.name, row); return { ok: true, name: same.name }; }
  const d = adapter.insertDoc(CORE_DT.reportCriteria, { ...row, owner: user }); return { ok: true, name: d.name };
}
const own = (name: string, user: string) => { const d = adapter.get(CORE_DT.reportCriteria, name); return d && s(d["user"]) === user ? d : undefined; };
export function setDefaultCriteria(name: string, on: boolean, user = currentUser()): { ok: true } | { ok: false; reason: Bi } {
  const d = own(name, user); if (!d) return { ok: false, reason: ["These criteria are not yours.", "هذه المعايير ليست لك."] };
  if (on) for (const x of criteriaFor(s(d["report"]), user)) if (x.name !== name && Number(x["is_default"] ?? 0)) adapter.update(CORE_DT.reportCriteria, x.name, { is_default: 0 });
  adapter.update(CORE_DT.reportCriteria, name, { is_default: on ? 1 : 0 }); return { ok: true };
}
export function deleteCriteria(name: string, user = currentUser()): { ok: true } | { ok: false; reason: Bi } {
  if (!own(name, user)) return { ok: false, reason: ["These criteria are not yours.", "هذه المعايير ليست لك."] };
  adapter.remove(CORE_DT.reportCriteria, name); return { ok: true };
}
/** The saved set whose values equal the current filters (shown as selected). */
export function matchingCriteria(report: string, filters: Criteria, user = currentUser()): Doc | undefined {
  const want = JSON.stringify(clean(filters)); return criteriaFor(report, user).find((d) => JSON.stringify(clean(criteriaValues(d))) === want);
}
