/**
 * PRO P3 receivables / payables pieces (owner 2026-11-17): invoices by status (shared strip + list with separate approval
 * and payment columns and «متأخر N يوم»), the payment-score card, ranked parties (top 10, «عرض الكل» opens the side
 * panel) and the next 14 days of collections / payments. Figures come from arInsights.ts; the Enterprise kit draws them.
 */
import { addDays } from "@/lib/reportKit";
import { fmtCurrency, fmtDate } from "@/lib/format";
import { QuickLink, openQuickView } from "@/components/enterprise/QuickView";
import { RankCard } from "@/components/enterprise/kit/rank";
import { UpcomingList, dueTag } from "@/components/enterprise/kit/ReconKit";
import { rankParties, upcomingDue } from "./arInsights";
import { sideDoctype, type ArRow, type Side } from "./aging";
import { todayIso } from "./finance";
/** P3-01 / P3-03 / P3-06 blocks are Enterprise blocks (shared with DIGIT CRM Customer 360); re-exported for existing Pro imports. */
export { InvoiceStatePills, InvoiceStatusSection, PartyScoreCard } from "@/components/enterprise/InvoiceStatus";

/** P3-04 — parties ranked by open balance (top 10; «عرض الكل» opens the side panel). */
export function PartyRankCard({ rows, side, ar, currency, onParty, active }: { rows: ArRow[]; side: Side; ar: boolean; currency: string; onParty: (p: string | undefined) => void; active?: string | undefined }) {
  const t = (en: string, a: string) => (ar ? a : en);
  const ranked = rankParties(rows); const total = ranked.reduce((a, p) => a + p.outstanding, 0);
  return <RankCard id={`${side}-parties`} ar={ar} top={10} title={side === "receivable" ? t("Customers by open balance", "العملاء حسب الرصيد المستحق") : t("Suppliers by open balance", "الموردون حسب الرصيد المستحق")}
    sub={t("Open balance of submitted invoices on the as-of date; select a name to filter the page.", "الرصيد المتبقي من الفواتير المعتمدة في تاريخ الاحتساب؛ اختر اسمًا لتصفية الصفحة.")}
    total={<>{t("Total", "الإجمالي")} <bdi data-no-i18n>{fmtCurrency(total, currency)}</bdi> · <bdi data-no-i18n>{ranked.length}</bdi> {side === "receivable" ? t("customers", "عميل") : t("suppliers", "مورد")}</>}
    rows={ranked.map((p) => ({ key: p.party, label: <bdi data-no-i18n>{p.name}</bdi>, value: p.outstanding, shown: fmtCurrency(p.outstanding, currency), share: total ? (p.outstanding / total) * 100 : 0, title: `${p.invoices} ${t("invoices", "فواتير")}${p.overdue ? ` · ${t("overdue", "متأخر")} ${fmtCurrency(p.overdue, currency)}` : ""}`,
      onOpen: () => onParty(active === p.party ? undefined : p.party), attrs: { "data-dp-rank-party": p.party, ...(active === p.party ? { "data-on": "" } : {}) } }))} />;
}

/** P3-05 — collections / payments due in the next 14 days, with coloured due tags. */
export function UpcomingDueCard({ rows, side, ar, currency }: { rows: ArRow[]; side: Side; ar: boolean; currency: string }) {
  const t = (en: string, a: string) => (ar ? a : en);
  const today = todayIso(); const due = upcomingDue(rows, today, 14); const total = due.reduce((a, x) => a + x.row.outstanding, 0);
  const dt = sideDoctype(side);
  return <UpcomingList ar={ar} title={side === "receivable" ? t("Collections due in the next 14 days", "تحصيلات مستحقة خلال 14 يومًا") : t("Payments due in the next 14 days", "مدفوعات مستحقة خلال 14 يومًا")}
    sub={t("Open invoices by due date (invoices on hold excluded).", "الفواتير المفتوحة حسب تاريخ الاستحقاق (عدا الموقوفة).")}
    empty={(() => { // owner notes B-08: the empty state says why — overdue items, later due dates, or nothing open
      const open = rows.filter((r) => r.outstanding > 0); const late = open.filter((r) => r.due && r.due < today).length;
      const later = open.filter((r) => r.due && r.due > addDays(today, 14)).map((r) => r.due).sort()[0];
      if (!open.length) return t("Nothing falls due in the next 14 days: no open invoices.", "لا شيء يستحق خلال 14 يومًا: لا توجد فواتير مفتوحة.");
      return <>{t("Nothing falls due in the next 14 days", "لا شيء يستحق خلال 14 يومًا")}{late ? <> · <bdi data-no-i18n>{late}</bdi> {t("already overdue", "متأخرة بالفعل")}</> : null}{later ? <> · {t("next due on", "أقرب استحقاق في")} <bdi data-no-i18n>{fmtDate(later)}</bdi></> : null}.</>;
    })()}
    total={<>{t("Total", "الإجمالي")} <bdi data-no-i18n>{fmtCurrency(total, currency)}</bdi> · <bdi data-no-i18n>{due.length}</bdi> {t("invoices", "فواتير")}</>}
    rows={due.slice(0, 10).map(({ row, inDays }) => ({ key: row.name, date: fmtDate(row.due), label: <bdi data-no-i18n>{row.partyName}</bdi>, sub: <QuickLink doctype={dt} name={row.name}><bdi>{row.name}</bdi></QuickLink>,
      amount: fmtCurrency(row.outstanding, row.currency || currency), tag: dueTag(inDays, ar), attrs: { "data-dp-upcoming": row.name, "data-in-days": String(inDays) } }))}
    action={due.length > 10 ? <button type="button" className="ek-card-link font-semibold" onClick={(e) => openQuickView({ kind: "content", title: side === "receivable" ? t("Collections due in the next 14 days", "تحصيلات مستحقة خلال 14 يومًا") : t("Payments due in the next 14 days", "مدفوعات مستحقة خلال 14 يومًا"),
      sub: `${due.length}`, node: <ol className="divide-y divide-border text-sm">{due.map(({ row, inDays }) => <li key={row.name} className="flex flex-wrap items-center gap-2 py-1.5"><bdi data-no-i18n className="tabular-nums text-muted-foreground">{fmtDate(row.due)}</bdi><bdi data-no-i18n className="font-medium">{row.partyName}</bdi><span className="text-xs">{dueTag(inDays, ar).label}</span><bdi data-no-i18n className="ms-auto tabular-nums">{fmtCurrency(row.outstanding, row.currency || currency)}</bdi></li>)}</ol> }, e.currentTarget)} data-dp-upcoming-all>{t(`Show all (${due.length})`, `عرض الكل (${due.length})`)}</button> : undefined}
    attrs={{ "data-dp-upcoming-total": String(Math.round(total * 100) / 100) }} />;
}
