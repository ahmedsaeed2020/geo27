/**
 * Summary of a document list (owner 2026-11-12 evening §11; Enterprise Visual Round 1 §4/§10): the Enterprise KPI cards
 * above every document list — documents, drafts / submitted / cancelled for submittable DocTypes, this month, and the
 * submitted value of the main amount field — then the list's own month trend and its top 5, so a list page is never a bare
 * table. Every card filters the list below (same filter path as the native filter bar); figures are counted from the
 * readable rows the list already holds, never stored.
 */
import type { DocTypeMeta } from "@/lib/catalog";
import type { Filter } from "@/lib/desk";
import { fmtCurrency } from "@/lib/format";
import { linkTitle } from "@/lib/linkTitle";
import { adapter, type Doc } from "@/lib/adapter";

/** Names, not codes: the linked record's own title field (customer_name, supplier_name, project_name, …), else the shared
 *  link title, else the stored value. Display only — the drill keeps the stored value. */
const NAME_FIELDS = ["customer_name", "supplier_name", "employee_name", "project_name", "item_name", "title", "full_name", "department_name"];
function nameOf(doctype: string, value: string): string {
  const d = adapter.get(doctype, value);
  const t = d ? NAME_FIELDS.map((f) => d[f]).find((x) => typeof x === "string" && x.trim()) : undefined;
  return typeof t === "string" ? t : linkTitle(doctype, value) || value;
}
import { ChartCard, Columns, RankedBars, moneyShort, type Datum } from "@/components/enterprise/kit";
import { KpiCard, KpiSlots, useLeadRow } from "@/components/enterprise/kit/KpiCard";

const AMOUNT_FIELDS = ["grand_total", "base_grand_total", "rounded_total", "paid_amount", "total_debit", "total_amount", "net_total", "total", "this_claim", "net_certified", "net_amount", "amount", "total_sanctioned_amount", "gross_purchase_amount", "net_pay", "gross_pay"];
const TOP_FIELDS = ["customer_name", "customer", "supplier_name", "supplier", "party_name", "party", "employee_name", "department", "project", "item_group", "leave_type", "designation", "branch"];
const MONTHS_AR = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];
const MONTHS_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function ListKpis({ meta, rows, ar, filters, onFilter }: { meta: DocTypeMeta; rows: Doc[]; ar: boolean; filters: Filter[]; onFilter: (f: Filter[]) => void }) {
  const lead = useLeadRow();
  const t = (en: string, a: string) => (ar ? a : en);
  const now = new Date(); const month = now.toISOString().slice(0, 7);
  const dateField = ["posting_date", "transaction_date", "date", "from_date", "start_date", "creation"].find((f) => f === "creation" || meta.fields.some((x) => x.fieldname === f)) ?? "creation";
  const amt = AMOUNT_FIELDS.find((f) => meta.fields.some((x) => x.fieldname === f && (x.fieldtype === "Currency" || x.fieldtype === "Float")));
  const sub = meta.is_submittable ? rows.filter((r) => Number(r.docstatus ?? 0) === 1) : rows;
  const cur = String(sub.find((r) => r["currency"])?.["currency"] ?? "SAR");
  const total = amt ? sub.reduce((a, r) => a + (Number(r[amt]) || 0), 0) : 0;
  // the last 12 months of the list (counts; value when the list has an amount)
  const keys = Array.from({ length: 12 }, (_, i) => { const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11 + i, 1)); return d.toISOString().slice(0, 7); });
  const inMonth = (r: Doc, k: string) => String(r[dateField] ?? "").slice(0, 7) === k;
  const counts = keys.map((k) => rows.filter((r) => inMonth(r, k)).length);
  const values = amt ? keys.map((k) => sub.filter((r) => inMonth(r, k)).reduce((a, r) => a + (Number(r[amt]) || 0), 0)) : [];
  const thisMonth = counts[counts.length - 1] ?? 0;
  const has = (f: Filter) => filters.some((x) => x[0] === f[0] && x[1] === f[1] && String(x[2]) === String(f[2]));
  const toggle = (f: Filter) => onFilter(has(f) ? filters.filter((x) => !(x[0] === f[0] && x[1] === f[1])) : [...filters.filter((x) => x[0] !== f[0]), f]);
  const card = (k: string, label: string, value: string | number, meta2: string, f?: Filter, tone?: "attention" | "risk", spark?: number[]) =>
    <KpiCard key={k} ar={ar} label={label} value={typeof value === "number" ? value.toLocaleString("en-US") : value} meta={meta2} tone={tone} spark={spark}
      attrs={{ "data-list-kpi": k, ...(f ? { "aria-pressed": has(f) } : {}) }}
      Root={f ? (rp) => <button type="button" onClick={() => toggle(f)} {...(rp as Record<string, unknown>)}>{rp.children}</button> : undefined} />;
  const cards = [card("all", t("Documents", "المستندات"), rows.length, t("Readable records in this list", "السجلات المتاحة في هذه القائمة"), undefined, undefined, counts.slice(-6))];
  if (meta.is_submittable) {
    const n = (s: number) => rows.filter((r) => Number(r.docstatus ?? 0) === s).length;
    cards.push(card("draft", t("Drafts", "المسودات"), n(0), t("Not submitted yet", "لم تُعتمد بعد"), ["docstatus", "=", 0], n(0) ? "attention" : undefined));
    cards.push(card("submitted", t("Submitted", "المعتمدة"), n(1), t("Posted documents", "مستندات مرحّلة"), ["docstatus", "=", 1]));
    if (n(2)) cards.push(card("cancelled", t("Cancelled", "الملغاة"), n(2), t("Kept for audit", "محفوظة للتدقيق"), ["docstatus", "=", 2], "risk"));
  }
  cards.push(card("month", t("This month", "هذا الشهر"), thisMonth, t("By document date", "حسب تاريخ المستند"), undefined, undefined, counts.slice(-6)));
  if (amt && total) cards.push(card("value", meta.is_submittable ? t("Submitted value", "قيمة المعتمد") : t("Total value", "إجمالي القيمة"), fmtCurrency(total, cur), t("Sum of the main amount", "مجموع المبلغ الرئيسي"), undefined, undefined, values.slice(-6)));
  // top 5 by the list's own party / grouping field
  const topField = TOP_FIELDS.find((f) => meta.fields.some((x) => x.fieldname === f) && rows.some((r) => r[f]));
  // names, not codes: a Link grouping field shows the linked record's title
  const topDef = topField ? meta.fields.find((x) => x.fieldname === topField) : undefined;
  const topLink = topDef?.fieldtype === "Link" ? topDef.options : undefined;
  const top = new Map<string, number>();
  if (topField) for (const r of amt ? sub : rows) { const k = String(r[topField] ?? ""); if (k) top.set(k, (top.get(k) ?? 0) + (amt ? Number(r[amt]) || 0 : 1)); }
  const topData: Datum[] = [...top.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k, v]) => ({ key: k, label: topLink ? nameOf(topLink, k) : k, value: v }));
  const trend: Datum[] = keys.map((k, i) => ({ key: k, label: `${(ar ? MONTHS_AR : MONTHS_EN)[Number(k.slice(5, 7)) - 1]} ${k.slice(2, 4)}`, value: amt ? values[i]! : counts[i]! }));
  const topLabel = topField ? (meta.fields.find((x) => x.fieldname === topField)?.label ?? topField) : "";
  return <section className="ek-list-kpis grid gap-3" data-list-kpis={cards.length} aria-label={t("Summary", "الملخص")}>
    <div className="ek-kpi-grid"><KpiSlots lead={lead}>{cards}</KpiSlots></div>
    {rows.length > 0 && <div className="r1-list-charts" data-r1-list-summary>
      <ChartCard title={amt ? t("Value by month", "القيمة حسب الشهر") : t("Documents by month", "المستندات حسب الشهر")} sub={t("Last 12 months, by document date", "آخر 12 شهرًا حسب تاريخ المستند")} size="md">
        <Columns data={trend} ar={ar} height={200} {...(amt ? { fmt: moneyShort(cur), axisFmt: moneyShort(cur) } : {})} />
      </ChartCard>
      {topData.length > 0 && <ChartCard title={<>{t("Top 5 by", "أعلى 5 حسب")} <span>{topLabel}</span></>} sub={amt ? t("By submitted value", "حسب القيمة المعتمدة") : t("By number of documents", "حسب عدد المستندات")} size="md">
        <RankedBars data={topData} ar={ar} max={5} {...(amt ? { fmt: (v: number) => fmtCurrency(v, cur) } : {})} />
      </ChartCard>}
    </div>}
  </section>;
}
