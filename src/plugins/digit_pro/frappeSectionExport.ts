/**
 * Builds the installable Frappe app's section-workspace manifest (frappe_apps/digit_pro/digit_pro/config/sections.json)
 * from the SAME declarative specs the preview renders (sections.ts SPECS + nav.ts SECTION_PAGES), so the real app's
 * KPI / queue / chart predicates are byte-for-byte the preview's predicates.
 *
 * Date and company values are exported as tokens ({company}, {as_of}, {d7}, …); the Frappe server
 * (digit_pro/section_logic.py) substitutes them with the windows defined by CTX_WINDOWS. A golden file evaluated
 * with two concrete contexts lets the Python tests prove the substitution matches this TypeScript evaluation.
 * Pure: no adapter reads, no writes. Run through scripts/export_digit_pro_nav.ts; staleness is guarded by a test.
 */
import { DEPARTMENTS, deptById, NAV_AR, pageItems, SECTION_PAGES, type NavItem } from "./nav";
import { digitPro } from "./index";
import { CTX_WINDOWS, sectionCtx, SPECS, type SectionCtx } from "./sections";
import type { Bi } from "./command";

export const TOKEN_CTX: SectionCtx = {
  company: "{company}", currency: "{currency}", asOf: "{as_of}", monthFrom: "{month_from}",
  d7: "{d7}", d30: "{d30}", from30: "{from30}", from90: "{from90}", from12: "{from12}",
};
export const SECTION_TABS_BI: Record<string, Bi> = { overview: ["Overview", "نظرة عامة"], work: ["Work & Operations", "العمل والعمليات"], documents: ["Documents", "المستندات"], reports: ["Reports", "التقارير"], details: ["Details", "التفاصيل"] };
/** Section panels that exist in the export as links to already-ported Page routes; every other panel is disclosed as unavailable. */
export const EXTRA_PORT: Record<string, { label: Bi; route: string[] }[]> = {
  dues: [{ label: ["Receivables", "الذمم المدينة"], route: ["receivables"] }, { label: ["Payables", "الذمم الدائنة"], route: ["payables"] }],
  cash: [{ label: ["Payments", "المدفوعات"], route: ["payments"] }],
  "ops-review": [{ label: ["General Ledger", "دفتر الأستاذ العام"], route: ["general-ledger"] }, { label: ["Chart of Accounts", "دليل الحسابات"], route: ["accounts"] }],
  "sel-intel": [{ label: ["Collections", "التحصيل"], route: ["collections"] }],
  "pur-orders": [{ label: ["Open Purchase Orders", "أوامر الشراء المفتوحة"], route: ["open-purchase-orders"] }],
};
export const EXTRA_LABEL: Record<string, Bi> = {
  "inv-heat": ["Warehouse × item group stock heatmap", "خريطة المخزون حسب المستودع ومجموعة الأصناف"], dues: ["Receivables and payables ageing register", "سجل تقادم الذمم المدينة والدائنة"],
  cash: ["Posted cash position by account", "الرصيد النقدي المرحّل حسب الحساب"], close: ["Period close checks", "فحوص إقفال الفترة"], "ops-review": ["Posting review", "مراجعة الترحيل"],
  "sel-fulfil": ["Delivery and billing position", "موقف التسليم والفوترة"], "sel-intel": ["Collections and sales analytics", "التحصيلات وتحليلات المبيعات"], "customer-mix": ["Customer contribution", "مساهمة العملاء"],
  "pur-quotes": ["Supplier quotation comparison", "مقارنة عروض الموردين"], "inv-expiry": ["Near-expiry timeline", "الجدول الزمني لقرب الانتهاء"], "asset-service": ["Maintenance calendar and repair cost vs book value", "تقويم الصيانة وتكلفة الإصلاح مقابل القيمة الدفترية"], "asset-books": ["Book vs tax book", "الدفتر المحاسبي مقابل الدفتر الضريبي"], "pur-orders": ["Open purchase order lines", "بنود أوامر الشراء المفتوحة"], "pur-receive": ["Receipt and invoice check", "مطابقة الاستلام والفاتورة"],
  supplier: ["Supplier contribution and reliability", "مساهمة الموردين وموثوقيتهم"], "stock-exposure": ["Stock exposure and replenishment", "تعرض المخزون وإعادة الطلب"], "stock-sources": ["Stock source reconciliation", "مطابقة مصادر المخزون"],
  "asset-life": ["Asset lifecycle timeline", "المسار الزمني لدورة حياة الأصل"], "asset-dep": ["Depreciation schedule priorities", "أولويات جدول الإهلاك"],
};

const bis: Bi[] = [];
const keep = <T extends Bi>(b: T): T => { bis.push(b); return b; };
const item = (i: NavItem) => ({ label: i.label, target: i.target, ...(i.hint ? { hint: i.hint } : {}), ...(i.roles ? { roles: i.roles } : {}) });

function build(ctx: SectionCtx, collect: boolean) {
  const k = <T extends Bi>(b: T) => (collect ? keep(b) : b);
  return SECTION_PAGES.map((p) => {
    const s = SPECS[p.id]!;
    return {
      id: p.id, dept: p.dept, slug: p.slug, label: k([p.label, NAV_AR[p.label] ?? p.label]),
      role: k(s.role), purpose: k(s.purpose), questions: k(s.questions),
      docs: s.docs.map((d) => ({ ...d, role: k(d.role) })),
      kpis: s.kpis(ctx).map((x) => ({ ...x, label: k(x.label), hint: k(x.hint) })),
      queues: s.queues(ctx).map((x) => ({ ...x, label: k(x.label), action: k(x.action) })),
      charts: s.charts(ctx).map((x) => ({ ...x, label: k(x.label) })),
      flow: s.flow.map(k), guards: s.guards.map(k), scope: s.scope.map(k),
      extra: (s.extra ?? []).map((id) => ({ id, label: k(EXTRA_LABEL[id] ?? [id, id]), ported: (EXTRA_PORT[id] ?? []).map((x) => ({ label: k(x.label), route: x.route })) })),
      items: pageItems(p).map(item),
    };
  });
}

export type ExportedSection = ReturnType<typeof build>[number];

/** UI strings the Frappe section pages render besides the specs: hosted item labels/hints and the department menu. */
function renderedStrings(): string[] {
  const items = SECTION_PAGES.flatMap((p) => pageItems(p));
  return [...new Set([...items.flatMap((i) => [i.label, i.hint ?? ""]), ...DEPARTMENTS.flatMap((d) => [d.label, d.all.label])].filter(Boolean))];
}

/** Spec pairs: one English key must have exactly one Arabic value (collisions are build errors). Rendered UI strings
 *  then take the preview plugin dictionary's value (digitPro.translations) unless a spec pair already owns the key. */
function stringTable(): { table: Record<string, string>; missing: string[] } {
  const out: Record<string, string> = {}; const clash: string[] = [];
  for (const [en, arv] of [...bis, ...Object.values(SECTION_TABS_BI)]) {
    if (!en || !arv || en === arv) continue;
    if (out[en] && out[en] !== arv) clash.push(`${en}: ${out[en]} ≠ ${arv}`);
    out[en] = out[en] ?? arv;
  }
  if (clash.length) throw new Error(`Arabic conflicts in section strings:\n${clash.join("\n")}`);
  const dict = (digitPro.translations ?? {}) as Record<string, string>;
  const missing: string[] = [];
  for (const k of renderedStrings()) { if (out[k]) continue; const v = dict[k] ?? NAV_AR[k]; if (v && v !== k) out[k] = v; else missing.push(k); }
  return { table: Object.fromEntries(Object.entries(out).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))), missing: missing.sort() };
}

function assertTokensOnly(sections: ExportedSection[]) {
  const bad = JSON.stringify(sections).match(/NaN|Invalid Date|\b\d{4}-\d{2}-\d{2}\b/g);
  if (bad) throw new Error(`section specs must use SectionCtx windows only, found literal/invalid dates: ${[...new Set(bad)].join(", ")}`);
}

export function buildSectionExport() {
  bis.length = 0;
  const sections = build(TOKEN_CTX, true);
  assertTokensOnly(sections);
  const departments = [...new Set(SECTION_PAGES.map((p) => p.dept))].map((id) => ({ id, label: deptById(id)!.label, sections: SECTION_PAGES.filter((p) => p.dept === id).map((p) => p.id) }));
  const manifest = {
    _meta: "Generated from src/plugins/digit_pro/sections.ts + nav.ts by scripts/export_digit_pro_nav.ts — do not hand-edit.",
    tokens: { company: "{company}", currency: "{currency}", as_of: "{as_of}", month_from: "{month_from}", windows: Object.fromEntries(Object.entries(CTX_WINDOWS).map(([kk, v]) => [`{${kk}}`, v])) },
    tabs: Object.keys(SECTION_TABS_BI), departments, sections,
  };
  const st = stringTable();
  const strings = { _meta: "Section workspace strings (English → Arabic) exported from the preview specs and the DIGIT Pro plugin dictionary. Registered by build_translations.py only where ERPNext/Frappe has no native translation. `untranslated`: rendered strings with no preview Arabic (DocType/report names rely on the native ERPNext translation).", strings: st.table, untranslated: st.missing };
  const golden = [["C1", "SAR", "2026-10-18"], ["C2", "USD", "2028-03-01"], ["C3", "EUR", "2027-01-31"]].map(([company, currency, asOf]) => ({
    company, currency, as_of: asOf,
    sections: Object.fromEntries(build(sectionCtx(company!, currency!, asOf!), false).map((s) => [s.id, {
      kpis: s.kpis.map((x) => x.filters), queues: s.queues.map((x) => ({ filters: x.filters, overdueFrom: x.overdueFrom ?? null })), charts: s.charts.map((x) => x.filters),
    }])),
  }));
  return { manifest, strings, golden };
}

export const SECTION_EXPORT_PATHS = {
  manifest: "frappe_apps/digit_pro/digit_pro/config/sections.json",
  strings: "frappe_apps/digit_pro/digit_pro/i18n_source/remix_current/section_strings.json",
  golden: "frappe_apps/digit_pro/digit_pro/tests/fixtures/sections_golden.json",
} as const;
export const serialize = (o: unknown) => JSON.stringify(o, null, 1) + "\n";
