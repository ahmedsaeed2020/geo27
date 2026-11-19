/**
 * Owner FINAL WORK LIST 2026-11-13, Part 1b (78 KPI rows "FORMULA NOT YET DEFINED"): the exact formula of a KPI as shown in
 * its info tooltip — numerator, denominator, as-of date and filters — derived from the KPI definition the figure is
 * computed from (the same filters and rule the drill opens), so the tooltip can never drift from the value.
 * Pure: reads only catalog meta for field labels; Arabic via the shared i18n dictionary.
 */
import { cachedMeta } from "@/lib/catalog";
import type { Filter } from "@/lib/desk";
import { t as tr } from "@/i18n";

export type Bi = [string, string];
/** The parts of a KPI definition the formula reads (structural, so every app's KPI shape fits). */
export interface FormulaSource {
  doctype: string; filters: Filter[]; hint: Bi;
  measure?: string | undefined; cur?: string | undefined; unit?: string | undefined;
  value?: unknown; pick?: unknown; fn?: unknown; rate?: { filters: Filter[]; pick?: unknown } | undefined;
}
export interface KpiFormula { basis: Bi; numerator: Bi; denominator: Bi | null; asOf: string; window?: { from: string; to: string } | undefined; filters: Bi[]; rule: Bi | null; source: Bi; money: boolean }

const OPS: Record<string, Bi> = {
  "=": ["is", "يساوي"], "!=": ["is not", "لا يساوي"], ">": ["above", "أكبر من"], "<": ["below", "أقل من"], ">=": ["on or after / at least", "من / لا يقل عن"], "<=": ["on or before / at most", "حتى / لا يزيد عن"],
  in: ["is one of", "أحد"], "not in": ["is none of", "ليس أحد"], like: ["contains", "يحتوي"], "not like": ["does not contain", "لا يحتوي"], between: ["between", "بين"],
};
const SPECIAL: Record<string, Bi> = { docstatus: ["Document state", "حالة المستند"], is_cancelled: ["Cancelled", "ملغى"], name: ["Document", "المستند"], company: ["Company", "الشركة"] };
const DOCSTATUS: Record<string, Bi> = { "0": ["Draft", "مسودة"], "1": ["Submitted", "معتمد"], "2": ["Cancelled", "ملغى"] };

/** The label of a field of a DocType in both languages (source label; Arabic from the shared dictionary). */
export function fieldLabel(dt: string, field: string): Bi {
  if (SPECIAL[field]) return SPECIAL[field]!;
  const f = (cachedMeta(dt) as { fields?: { fieldname: string; label?: string }[] } | undefined)?.fields?.find((x) => x.fieldname === field);
  const en = f?.label || field.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
  return [en, tr(en, dt) || tr(en)];
}
const val = (field: string, v: unknown, ar: boolean): string => {
  // dates and codes keep their left-to-right order inside an Arabic sentence (Unicode isolate)
  const iso = (x: string) => (ar && /^[\dA-Z][\w.:/-]*$/.test(x) && /\d/.test(x) ? `\u2066${x}\u2069` : x);
  const one = (x: unknown) => iso(oneRaw(x));
  const oneRaw = (x: unknown) => { const s = String(x ?? ""); if (field === "docstatus") return DOCSTATUS[s]?.[ar ? 1 : 0] ?? s; if (field === "is_cancelled" || /^is_|^on_hold$|^disabled$/.test(field)) return s === "1" ? (ar ? "نعم" : "yes") : s === "0" ? (ar ? "لا" : "no") : s; return ar ? tr(s) : s; };
  return Array.isArray(v) ? v.map(one).join(ar ? "، " : ", ") : one(v);
};
/** One filter in words, e.g. "Due Date on or before 2026-11-13" / "تاريخ الاستحقاق حتى 2026-11-13". */
export function filterWords(dt: string, f: Filter): Bi {
  const [field, op, v] = f; const l = fieldLabel(dt, field);
  if (op === "is") return [`${l[0]} is ${v === "set" ? "set" : "not set"}`, `${l[1]} ${v === "set" ? "محدد" : "غير محدد"}`];
  if (op === "between" && Array.isArray(v)) return [`${l[0]} between ${val(field, v[0], false)} and ${val(field, v[1], false)}`, `${l[1]} بين ${val(field, v[0], true)} و ${val(field, v[1], true)}`];
  const o = OPS[op] ?? [op, op];
  return [`${l[0]} ${o[0]} ${val(field, v, false)}`, `${l[1]} ${o[1]} ${val(field, v, true)}`];
}

/** The KPI's exact formula: what is counted or summed, divided by what, as of which date, under which filters. */
export function kpiFormula(k: FormulaSource, asOf: string, window?: { from: string; to: string }): KpiFormula {
  const dt: Bi = [k.doctype, tr(k.doctype) || k.doctype];
  const filters = k.filters.map((f) => filterWords(k.doctype, f));
  const rule: Bi | null = k.pick || k.fn ? ["plus the rule stated in the basis (checked on each record)", "مع القاعدة المذكورة في الأساس (تُفحص على كل سجل)"] : null;
  let numerator: Bi; let denominator: Bi | null = null; let money = false;
  if (k.rate) {
    numerator = [`Number of ${dt[0]} records matching all filters`, `عدد سجلات ${dt[1]} المطابقة لكل الشروط`];
    const base = k.rate.filters.map((f) => filterWords(k.doctype, f));
    denominator = [`Number of ${dt[0]} records matching: ${base.map((b) => b[0]).join(" · ")}`, `عدد سجلات ${dt[1]} المطابقة لـ: ${base.map((b) => b[1]).join(" · ")}`];
  } else if (k.fn) {
    numerator = [`${dt[0]} records selected by the stated rule`, `سجلات ${dt[1]} المختارة بالقاعدة المذكورة`];
  } else if (k.unit && k.value) {
    numerator = [`Sum of the per-record value over matching ${dt[0]} records`, `مجموع قيمة كل سجل من سجلات ${dt[1]} المطابقة`];
  } else if (k.value) {
    numerator = [`Sum of the computed amount of each matching ${dt[0]} record, per currency`, `مجموع المبلغ المحسوب لكل سجل ${dt[1]} مطابق، لكل عملة`]; money = true;
  } else if (k.measure) {
    const m = fieldLabel(k.doctype, k.measure);
    numerator = [`Sum of ${m[0]} over matching ${dt[0]} records, per currency`, `مجموع ${m[1]} لسجلات ${dt[1]} المطابقة، لكل عملة`]; money = true;
  } else {
    numerator = [`Number of matching ${dt[0]} records`, `عدد سجلات ${dt[1]} المطابقة`];
  }
  return { basis: k.hint, numerator, denominator, asOf, window, filters, rule, source: dt, money };
}
