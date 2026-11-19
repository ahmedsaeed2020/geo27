/**
 * Enterprise invoices-by-status and payment-score blocks (PRO P3-01 / P3-03, owner 2026-11-17; shared with DIGIT CRM
 * Customer 360 — CRM C3-04 / C3-05). Invoices by status: the shared strip with amounts over the list (separate approval and
 * payment columns, «متأخر N يوم»; the tab amounts add up to the list total). Payment score: one tick per recent invoice.
 * Figures come only from lib/coreShared/receivables.ts; the host app passes side, company ("" = every readable company),
 * party (one name or several) and the user, so the blocks compute nothing of their own.
 */
import { useState, type ReactNode } from "react";
import type { Doc } from "@/lib/adapter";
import { cachedMeta } from "@/lib/catalog";
import { fmtCurrency, fmtDate } from "@/lib/format";
import { inStripTab, overdueDays } from "@/lib/statusStrip";
import { invoiceApproval, invoiceDocs, invoicePayment, invoiceStrip, openPart, partyField, partyScore, settledPart, sideDoctype, type InvState, type PartySel, type Side } from "@/lib/coreShared/receivables";
import { StatusStrip, OverdueTag } from "./StatusStrip";
import { QuickLink, openQuickView } from "./QuickView";
import { StatePill } from "./kit/ApprovalQueue";
import { PaymentScore, type ScoreTick } from "./kit/ReconKit";

const todayIso = () => new Date().toISOString().slice(0, 10);
const pill = (p: InvState, ar: boolean, col: string) => <StatePill s={{ key: p.key, label: ar ? p.ar : p.en, tone: p.tone, hint: p.hint ? (ar ? p.hint[1] : p.hint[0]) : undefined }} attrs={{ [`data-inv-${col}`]: p.key }} />;
/** P3-06 — approval and payment as two separate pills of one invoice. */
export function InvoiceStatePills({ dt, d, ar }: { dt: string; d: Doc; ar: boolean }) {
  return <span className="inline-flex flex-wrap gap-1">{pill(invoiceApproval(dt, d), ar, "approval")}{pill(invoicePayment(dt, d), ar, "payment")}</span>;
}

/** P3-01 / P3-02 / P3-07 — invoices by status with amounts; the tab amounts add up to the list total. */
export function InvoiceStatusSection({ side, company, asOf, user, ar, tab, onTab, party, currency, hideParty }: { side: Side; company: string; asOf: string; user: string; ar: boolean; tab: string | undefined; onTab: (k: string | undefined) => void; party?: PartySel; currency: string;
  /** a one-party page (Customer 360) drops the party column, which would repeat the page's own name on every row */ hideParty?: boolean | undefined }) {
  const [limit, setLimit] = useState(25);
  const t = (en: string, a: string) => (ar ? a : en);
  const dt = sideDoctype(side); const meta = cachedMeta(dt);
  if (!meta) return null;
  const today = todayIso(); const docs = invoiceDocs(side, company, asOf, user, party);
  const tabs = invoiceStrip(meta, docs, today);
  const rows = docs.filter((d) => inStripTab(meta, d, tab, today));
  const m = (v: number) => fmtCurrency(v, currency);
  const sum = (f: (d: (typeof rows)[number]) => number) => rows.reduce((a, d) => a + f(d), 0);
  const total = sum((d) => Number(d["grand_total"]) || 0), settled = sum(settledPart), open = sum(openPart);
  const stateSum = tabs.slice(1).reduce((a, x) => a + (x.amount ?? 0), 0);
  const pf = partyField(side); const nameF = side === "receivable" ? "customer_name" : "supplier_name";
  return <section className="ek-card ek-card-pad mt-4" data-dp-inv-status={rows.length} data-dp-inv-total={Math.round(total * 100) / 100}>
    <div className="mb-2 flex flex-wrap items-baseline gap-2">
      <h2 className="font-semibold">{t("Invoices by status", "الفواتير حسب الحالة")}</h2>
      <span className="text-xs text-muted-foreground">{t("Invoice totals; cancelled invoices are not listed. Status as of today.", "المبالغ = إجمالي الفاتورة؛ الفواتير الملغاة غير مدرجة. الحالة كما هي اليوم.")}</span>
      <span className="ms-auto text-[11px] text-muted-foreground" data-dp-inv-check={Math.round(stateSum * 100) / 100}>{t("Sum of the states", "مجموع الحالات")} <bdi data-no-i18n>{m(stateSum)}</bdi> = {t("all", "الكل")} <bdi data-no-i18n>{m(tabs[0]?.amount ?? 0)}</bdi></span>
    </div>
    <StatusStrip tabs={tabs} active={tab} ar={ar} onPick={(k) => { setLimit(25); onTab(k); }} label={t("Invoice states", "حالات الفواتير")} />
    {!rows.length ? <p className="text-sm text-muted-foreground">{t("No invoice in this state.", "لا توجد فواتير بهذه الحالة.")}</p> : <div className="dp-reg max-h-[560px] overflow-auto">
      <table className="whitespace-nowrap" data-dp-inv-table>
        <thead><tr><th className="px-3 py-2 text-start">{t("Invoice", "الفاتورة")}</th>{!hideParty && <th className="px-2 py-2 text-start">{side === "receivable" ? t("Customer", "العميل") : t("Supplier", "المورد")}</th>}
          <th className="px-2 py-2 text-start">{t("Date", "التاريخ")}</th><th className="px-2 py-2 text-start">{t("Due", "الاستحقاق")}</th>
          <th className="px-2 py-2 text-start">{t("Approval", "الاعتماد")}</th><th className="px-2 py-2 text-start">{side === "receivable" ? t("Collection", "التحصيل") : t("Payment", "السداد")}</th>
          <th className="px-2 py-2 text-end">{t("Invoice total", "إجمالي الفاتورة")}</th><th className="px-2 py-2 text-end">{side === "receivable" ? t("Collected", "المحصّل") : t("Paid", "المدفوع")}</th><th className="px-3 py-2 text-end">{t("Outstanding", "المتبقي")}</th></tr></thead>
        <tbody>{rows.slice(0, limit).map((d) => { const late = overdueDays(meta, d, today);
          return <tr key={d.name} data-dp-inv-row={d.name}>
            <td className="px-3 py-2"><QuickLink doctype={dt} name={d.name}><bdi>{d.name}</bdi></QuickLink></td>
            {!hideParty && <td className="max-w-[14rem] truncate px-2 py-2" data-no-i18n title={String(d[nameF] || d[pf] || "")}><bdi>{String(d[nameF] || d[pf] || "")}</bdi></td>}
            <td className="px-2 py-2 tabular-nums" data-no-i18n>{fmtDate(d["posting_date"])}</td>
            <td className="px-2 py-2 tabular-nums"><span className="inline-flex flex-wrap items-center gap-1.5"><bdi data-no-i18n>{fmtDate(d["due_date"])}</bdi><OverdueTag days={late} ar={ar} /></span></td>
            <td className="px-2 py-2">{pill(invoiceApproval(dt, d), ar, "approval")}</td>
            <td className="px-2 py-2">{pill(invoicePayment(dt, d, today), ar, "payment")}</td>
            <td className="px-2 py-2 text-end tabular-nums" data-no-i18n>{m(Number(d["grand_total"]) || 0)}</td>
            <td className="px-2 py-2 text-end tabular-nums" data-no-i18n>{Number(d.docstatus) === 1 ? m(settledPart(d)) : "—"}</td>
            <td className={`px-3 py-2 text-end font-medium tabular-nums ${late > 0 ? "text-destructive" : ""}`} data-no-i18n>{Number(d.docstatus) === 1 ? m(openPart(d)) : "—"}</td>
          </tr>; })}</tbody>
        <tfoot><tr><td className="px-3 py-2" colSpan={hideParty ? 5 : 6}>{t("Total", "الإجمالي")} · <bdi data-no-i18n>{rows.length}</bdi>{rows.length > limit && <> · {t("showing", "المعروض")} <bdi data-no-i18n>{limit}</bdi></>}</td>
          <td className="px-2 py-2 text-end tabular-nums" data-no-i18n data-dp-inv-foot="total">{m(total)}</td><td className="px-2 py-2 text-end tabular-nums" data-no-i18n data-dp-inv-foot="settled">{m(settled)}</td><td className="px-3 py-2 text-end tabular-nums" data-no-i18n data-dp-inv-foot="open">{m(open)}</td></tr></tfoot>
      </table>
    </div>}
    {rows.length > limit && <button type="button" className="btn-ghost mt-2 text-xs" onClick={() => setLimit(limit + 50)} data-dp-inv-more>{t("Show more", "عرض المزيد")} (<bdi data-no-i18n>{Math.min(50, rows.length - limit)}</bdi>)</button>}
  </section>;
}

/** P3-03 — payment score of one customer (they pay us) or supplier (we pay them). */
export function PartyScoreCard({ side, company, party, user, ar, currency, partyName, attrs }: { attrs?: Record<string, string> | undefined; side: Side; company: string; party: PartySel; user: string; ar: boolean; currency: string; partyName?: ReactNode }) {
  const t = (en: string, a: string) => (ar ? a : en);
  const sc = partyScore(side, company, party, user, todayIso());
  const dt = sideDoctype(side);
  const word = (i: (typeof sc.items)[number]) => i.state === "ontime" ? t("paid on time", "سُددت في موعدها") : i.state === "late" ? t(`paid ${i.days} days late`, `سُددت متأخرة ${i.days} يوم`) : i.state === "overdue" ? t(`overdue ${i.days} days`, `متأخرة ${i.days} يوم`) : t("open, not due yet", "مفتوحة ولم تستحق بعد");
  const ticks: ScoreTick[] = sc.items.map((i) => ({ key: i.name, state: i.state, title: `${i.name} · ${t("due", "الاستحقاق")} ${fmtDate(i.due)}${i.settled ? ` · ${t("settled", "السداد")} ${fmtDate(i.settled)}` : ""} · ${word(i)} · ${fmtCurrency(i.amount, currency)}`,
    onOpen: (e) => openQuickView({ kind: "doc", doctype: dt, name: i.name }, e.currentTarget) }));
  return <PaymentScore ar={ar} ticks={ticks} score={sc.score} attrs={{ "data-dp-score": (typeof party === "string" ? party : party?.join(",")) || "*", ...attrs }}
    title={side === "receivable" ? t("Payment score", "انتظام السداد") : t("Our payment record", "التزامنا بالسداد")}
    sub={<>{(typeof party === "string" ? party : party?.length) ? (partyName ? <><bdi data-no-i18n>{partyName}</bdi> · </> : null) : <>{side === "receivable" ? t("all customers", "كل العملاء") : t("all suppliers", "كل الموردين")} · </>}{t(`last ${sc.items.length} invoices, oldest first`, `آخر ${sc.items.length} فاتورة، الأقدم أولًا`)}{(typeof party === "string" ? party : party?.length) ? null : <> · {t("select a name to see one party", "اختر اسمًا لعرض طرف واحد")}</>}</>}
    summary={sc.score === null ? t("No settled or overdue invoice yet.", "لا توجد فواتير مسددة أو متأخرة بعد.") : <><bdi data-no-i18n>{sc.ontime}</bdi> {t("of", "من")} <bdi data-no-i18n>{sc.ontime + sc.late + sc.overdue}</bdi> {t("on time", "في موعدها")}{sc.avgLate !== null ? <> · {t("average delay", "متوسط التأخير")} <bdi data-no-i18n>{sc.avgLate}</bdi> {t("days", "يوم")}</> : null}{sc.overdue ? <> · <span className="text-destructive"><bdi data-no-i18n>{sc.overdue}</bdi> {t("overdue now", "متأخرة الآن")}</span></> : null}</>}
    legend={{ ontime: t("on time", "في الموعد"), late: t("late", "متأخرة"), overdue: t("overdue", "متأخرة حاليًا"), open: t("not due", "لم تستحق") }}
    empty={t("No invoices for this party yet.", "لا توجد فواتير لهذا الطرف بعد.")} />;
}
