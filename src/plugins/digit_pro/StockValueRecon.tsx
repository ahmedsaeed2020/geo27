// @ts-nocheck -- DIGIT Pro/HR apps are switched off in the merged site build; their original /pro/* and /hr/* app routes are not in this route tree (re-enabling the app needs those routes, then remove this line)
/**
 * EQ-01 P4 — Stock Value Reconciliation page (/pro/stock-value-reconciliation) and the shared "source valuation
 * discrepancy" notice shown next to Bin-based stock value figures. Read-only: it never writes Bin, Stock Ledger Entry,
 * GL Entry or valuation, and it never substitutes one figure for the other.
 */
import { KPI_TILE } from "@/components/enterprise/kit";
import { EntTable } from "@/components/enterprise/kit/EntTable";
import { Link, useNavigate } from "@tanstack/react-router";
import { AlertTriangle, Download } from "lucide-react";
import { useCallback, useState } from "react";
import { fmtCurrency } from "@/lib/format";
import { useSessionUser } from "@/lib/session";
import { useScopeMetas } from "@/lib/scope";
import { useLang } from "@/i18n";
import { ProFrame, SourceState } from "./ProFrame";
import { financeContext, slug, todayIso } from "./finance";
import { bi } from "./CommandUi";
import { validIso } from "./Q2cUi";
import type { Bi, Signal } from "./command";
import { CLASS_CAUSE, CLASS_LABEL, RECON_CLASSES, reconciliationCsv, stockReconciliation, stockValueGap, type ReconClass, type ReconRow, type VoucherRef } from "./stockReconciliation";
import { DateInput } from "@/components/form/DateInput";

export const RECON_ROUTE = "/pro/stock-value-reconciliation" as const;
export const RECON_KEYS = ["company", "as_of", "cls", "q"];
type Q = Record<string, string | undefined>;
const PAGE = 50;
const qty = (v: number | null) => (v === null ? "—" : v.toLocaleString("en-US", { maximumFractionDigits: 3 }));
const DOCS = ["Bin", "Stock Ledger Entry", "Warehouse", "Item", "GL Entry", "Account"];
const NOTICE_DOCS = ["Bin", "Stock Ledger Entry", "Warehouse", "Item"];
const DocA = ({ dt, name, className = "" }: { dt: string; name: string; className?: string }) =>
  <Link to="/app/$app/$doctype/$name" params={{ app: "erpnext", doctype: slug(dt), name }} className={`hover:underline ${className}`} data-no-i18n><bdi>{name}</bdi></Link>;

/** Company-level gap for Bin-based cards (skipped when the card is filtered to a warehouse/item group: not the same scope). */
export const gapOf = (company: string, user: string, filtered = false) => (filtered ? null : stockValueGap(company, todayIso(), user));
/** Adds the ledger figure to the Bin-based "stock value" cards so the card itself never reads as the only truth. */
export function withStockGap(signals: Signal[], gap: ReturnType<typeof stockValueGap>, currency: string): Signal[] {
  if (!gap) return signals;
  return signals.map((s) => (s.id === "stock" || s.id === "binvalue") ? { ...s, note: [`Bin snapshot · posted ledger ${fmtCurrency(gap.sle, currency)} (differs)`, `لقطة الأرصدة · الدفتر المرحّل ${fmtCurrency(gap.sle, currency)} (مختلف)`] as Bi } : s);
}

/** Disclosure next to a Bin-based stock value: both figures, the difference and access to the reconciliation. */
export function StockValueNotice({ company, currency, asOf, className = "" }: { company: string; currency: string; asOf?: string | undefined; className?: string }) {
  const ar = useLang() === "ar"; const t = (en: string, arabic: string) => (ar ? arabic : en);
  const user = useSessionUser();
  useScopeMetas(NOTICE_DOCS); // the notice may sit on a screen that has not loaded the ledger's permission meta yet
  const day = asOf && validIso(asOf) ? asOf : todayIso();
  const gap = stockValueGap(company, day, user);
  if (!gap) return null;
  return <div role="note" className={`dp-recon-notice ${className}`} data-dp-stock-discrepancy={gap.diff}>
    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
    <div className="min-w-0 flex-1">
      <p className="font-semibold">{t("Source valuation discrepancy", "تباين في مصادر تقييم المخزون")}</p>
      <p className="mt-0.5">
        {t("Stock value from Bin records", "قيمة المخزون من سجلات الأرصدة")}: <bdi data-no-i18n>{fmtCurrency(gap.bin, currency)}</bdi> ·{" "}
        {t("posted Stock Ledger", "دفتر المخزون المرحّل")}: <bdi data-no-i18n>{fmtCurrency(gap.sle, currency)}</bdi> ·{" "}
        {t("difference", "الفرق")}: <bdi data-no-i18n>{fmtCurrency(gap.diff, currency)}</bdi>{" "}
        ({t("item–warehouse pairs that disagree", "أزواج صنف–مستودع مختلفة")}: <bdi data-no-i18n>{gap.mismatched} / {gap.pairs}</bdi>).
      </p>
      <p className="mt-0.5 text-[11px] opacity-90">{t("Neither figure replaces the other and nothing has been corrected; a correction needs the owner's financial sign-off.", "لا يحل أي رقم محل الآخر ولم يُصحَّح شيء؛ أي تصحيح يتطلب اعتمادًا ماليًا من المالك.")}</p>
    </div>
    <Link to={RECON_ROUTE} search={{ company, as_of: asOf && validIso(asOf) ? asOf : undefined } as never} className="btn-ghost shrink-0 text-xs" data-dp-recon-open>{t("Open reconciliation", "فتح المطابقة")}</Link>
  </div>;
}

const VoucherLink = ({ v }: { v: VoucherRef | null }) => v
  ? <Link to="/app/$app/$doctype/$name" params={{ app: "erpnext", doctype: slug(v.voucherType), name: v.voucherNo }} className="text-primary hover:underline" data-no-i18n data-dp-recon-voucher={v.voucherNo}>
      {v.voucherNo}</Link>
  : <span className="text-muted-foreground">—</span>;

export function StockValueReconPro({ search }: { search: Q }) {
  const nav = useNavigate();
  const set = useCallback((p: Q) => void nav({ to: RECON_ROUTE, search: ((prev: Q) => ({ ...prev, ...p })) as never, replace: true }), [nav]);
  const ar = useLang() === "ar"; const t = (en: string, arabic: string) => (ar ? arabic : en);
  const [shown, setShown] = useState(PAGE);
  return <ProFrame title="Stock Value Reconciliation" subtitle="Bin snapshot compared with the posted Stock Ledger and stock GL — read-only." tabs={false} doctypes={DOCS}>
    {({ user }) => {
      const ctx = financeContext(search["company"], user);
      if (!ctx.companies.length) return <SourceState status="denied" doctype="Company" />;
      const asOf = validIso(search["as_of"]) ? search["as_of"]! : todayIso();
      const r = stockReconciliation(ctx.company, asOf, user);
      const bar = <section className="dp-context flex-wrap" data-dp-context>
        <label className="dp-ctx-item"><span>{t("Company", "الشركة")}</span>
          <select className="field-input" value={ctx.company} onChange={(e) => set({ company: e.target.value })} data-no-i18n>{ctx.companies.map((c) => <option key={c}>{c}</option>)}</select></label>
        <label className="dp-ctx-item"><span>{t("Ledger as of", "الدفتر حتى تاريخ")}</span>
          <DateInput className="field-input" value={asOf} onChange={(e) => validIso(e.target.value) && set({ as_of: e.target.value === todayIso() ? undefined : e.target.value })} data-dp-recon-asof /></label>
        <label className="dp-ctx-item"><span>{t("Search", "بحث")}</span>
          <input className="field-input" value={search["q"] ?? ""} placeholder={t("Item or warehouse", "صنف أو مستودع")} onChange={(e) => set({ q: e.target.value || undefined })} data-dp-recon-q /></label>
      </section>;
      if (r.status !== "ok") return <>{bar}<div className="mt-4"><SourceState status={r.status} doctype="Bin · Stock Ledger Entry" /></div></>;
      const cls = (RECON_CLASSES as string[]).includes(search["cls"] ?? "") ? (search["cls"] as ReconClass) : undefined;
      const q = (search["q"] ?? "").trim().toLowerCase();
      const rows = r.rows.filter((x) => (!cls || x.cls === cls) && (!q || `${x.item} ${x.warehouse}`.toLowerCase().includes(q)));
      const tot = r.totals;
      const download = () => {
        const url = URL.createObjectURL(new Blob(["\uFEFF" + reconciliationCsv({ ...r, rows })], { type: "text/csv;charset=utf-8" }));
        const a = document.createElement("a"); a.href = url; a.download = `stock_value_variances_${ctx.company}_${asOf}.csv`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
      };
      return <>
        {bar}
        <section className="dp-cc-signals mt-4" aria-label={t("Source totals", "إجماليات المصادر")} data-dp-recon-totals>
          <Link to="/pro/stock-balance" search={{ company: ctx.company } as never} className={KPI_TILE} data-dp-recon-total="bin">
            <span className="dp-cc-label">{t("Bin snapshot value", "قيمة لقطة الأرصدة")}</span>
            <span className="dp-cc-value" data-no-i18n>{fmtCurrency(tot.bin, ctx.currency)}</span>
            <span className="dp-cc-meta">{t("Warehouse balances — undated snapshot (what Stock Balance shows)", "قيمة سجلات الأرصدة — لقطة بلا تاريخ (ما يعرضه رصيد المخزون)")}</span>
          </Link>
          <Link to="/pro/stock-ledger" search={{ company: ctx.company, to: asOf } as never} className={KPI_TILE} data-dp-recon-total="sle">
            <span className="dp-cc-label">{t("Posted Stock Ledger value", "قيمة دفتر المخزون المرحّلة")}</span>
            <span className="dp-cc-value" data-no-i18n>{fmtCurrency(tot.sle, ctx.currency)}</span>
            <span className="dp-cc-meta">{t("Σ stock value change, submitted non-cancelled rows up to the as-of date", "مجموع تغير القيمة للقيود المعتمدة غير الملغاة حتى التاريخ")}</span>
          </Link>
          <div className={KPI_TILE} data-dp-recon-total="gl" data-status={tot.glStatus}>
            <span className="dp-cc-label">{t("Stock GL balance", "رصيد حسابات المخزون في الأستاذ")}</span>
            {tot.gl === null ? <SourceState status={tot.glStatus === "ok" ? "unavailable" : (tot.glStatus as "denied" | "unavailable")} doctype="GL Entry" /> : <>
              <span className="dp-cc-value" data-no-i18n>{fmtCurrency(tot.gl, ctx.currency)}</span>
              <span className="dp-cc-meta">{tot.glAccounts.length ? <>{t("Accounts of type Stock", "حسابات من نوع مخزون")}: <bdi data-no-i18n>{tot.glAccounts.join(", ")}</bdi></> : t("No company account of type Stock", "لا يوجد حساب مخزون للشركة")}
                {tot.glDiff !== null && <> · {Math.abs(tot.glDiff) < 0.01 ? t("agrees with the Stock Ledger", "مطابق لدفتر المخزون") : <>{t("differs from the Stock Ledger by", "يختلف عن دفتر المخزون بـ")} <bdi data-no-i18n>{fmtCurrency(tot.glDiff, ctx.currency)}</bdi></>}</>}</span></>}
          </div>
          <div className={KPI_TILE} data-dp-recon-total="diff" {...(Math.abs(tot.diff) >= 0.01 ? { "data-tone": "warn" } : {})}>
            <span className="dp-cc-label">{t("Difference (Stock Ledger − Bin)", "الفرق (دفتر المخزون − الأرصدة)")}</span>
            <span className="dp-cc-value" data-no-i18n>{fmtCurrency(tot.diff, ctx.currency)}</span>
            <span className="dp-cc-meta">{t("Pairs that disagree", "أزواج مختلفة")}: <bdi data-no-i18n>{tot.mismatched} / {tot.pairs}</bdi></span>
          </div>
        </section>

        <section className="dp-cc-panel mt-4" data-dp-recon-basis>
          <header className="dp-cc-panel-h"><h2>{t("How this is compared", "طريقة المقارنة")}</h2></header>
          <div className="dp-cc-panel-b space-y-1 text-xs text-muted-foreground">
            <p>{t("Each item × warehouse pair: Bin quantity and value against the posted ledger replayed in posting order (date, time, creation). The class is decided only from these facts.", "لكل زوج صنف × مستودع: كمية الرصيد وقيمته مقابل الدفتر المرحّل بترتيب الترحيل (التاريخ والوقت والإنشاء). يُحدَّد التصنيف من هذه الحقائق فقط.")}</p>
            <p>{t("Read-only: no Bin, Stock Ledger, GL or valuation record is changed here. A correction is an owner decision with financial sign-off — currently pending.", "للقراءة فقط: لا يُغيَّر هنا أي سجل رصيد أو دفتر مخزون أو أستاذ أو تقييم. التصحيح قرار للمالك باعتماد مالي — معلّق حاليًا.")}</p>
          </div>
        </section>

        <section className="dp-cc-panel mt-4" data-dp-recon-classes>
          <header className="dp-cc-panel-h"><h2>{t("Probable cause by class", "السبب المرجّح حسب التصنيف")}</h2>
            {cls && <button type="button" className="dp-link ms-auto text-xs" onClick={() => { setShown(PAGE); set({ cls: undefined }); }} data-dp-recon-clear>{t("Show all classes", "عرض كل التصنيفات")}</button>}</header>
          <div className="overflow-x-auto"><EntTable id="pro-stock-recon-groups" wrap><table className="dp-cc-table">
            <thead><tr><th scope="col">{t("Class", "التصنيف")}</th><th scope="col">{t("What the records show", "ما تُظهره السجلات")}</th><th scope="col" className="text-end">{t("Pairs", "الأزواج")}</th><th scope="col" className="text-end">{t("Value difference", "فرق القيمة")}</th></tr></thead>
            <tbody>{r.byClass.map((c) => <tr key={c.cls} data-dp-recon-class={c.cls} aria-selected={cls === c.cls}>
              <td><button type="button" className="dp-link text-start" aria-pressed={cls === c.cls} onClick={() => { setShown(PAGE); set({ cls: cls === c.cls ? undefined : c.cls }); }} data-dp-recon-class-btn={c.cls}>{bi(ar, CLASS_LABEL[c.cls])}</button></td>
              <td className="max-w-[28rem] text-xs text-muted-foreground">{bi(ar, CLASS_CAUSE[c.cls])}</td>
              <td className="text-end tabular-nums" data-no-i18n>{c.count}</td>
              <td className="whitespace-nowrap text-end tabular-nums" data-no-i18n>{fmtCurrency(c.valueDiff, ctx.currency)}</td></tr>)}</tbody>
          </table></EntTable></div>
        </section>

        <section className="dp-cc-panel mt-4" data-dp-recon-rows={rows.length}>
          <header className="dp-cc-panel-h"><h2>{t("Item × warehouse variances", "فروقات الصنف × المستودع")}</h2>
            <span className="dp-cc-note"><bdi data-no-i18n>{rows.length}</bdi> {t("pairs", "زوجًا")}{cls ? <> · {bi(ar, CLASS_LABEL[cls])}</> : null}</span>
            <button type="button" className="btn-ghost ms-auto text-xs" onClick={download} disabled={!rows.length} data-dp-recon-csv><Download className="h-3.5 w-3.5" /> {t("Export CSV", "تصدير CSV")}</button></header>
          {!rows.length ? <div className="dp-cc-panel-b"><SourceState status="empty" /></div> : <div className="overflow-x-auto"><EntTable id="pro-stock-recon" wrap><table className="dp-cc-table" data-dp-recon-table>
            <thead><tr>
              <th scope="col">{t("Item", "الصنف")}</th><th scope="col">{t("Warehouse", "المستودع")}</th>
              <th scope="col" className="text-end">{t("Bin qty", "كمية الرصيد")}</th><th scope="col" className="text-end">{t("Ledger qty", "كمية الدفتر")}</th>
              <th scope="col" className="text-end">{t("Bin value", "قيمة الرصيد")}</th><th scope="col" className="text-end">{t("Ledger value", "قيمة الدفتر")}</th>
              <th scope="col" className="text-end">{t("Difference", "الفرق")}</th><th scope="col">{t("Class", "التصنيف")}</th>
              <th scope="col">{t("Bin equals balance after", "الرصيد يساوي الرصيد بعد")}</th><th scope="col">{t("First voucher missing from Bin", "أول مستند غير منعكس في الرصيد")}</th><th scope="col">{t("Sources", "المصادر")}</th>
            </tr></thead>
            <tbody>{rows.slice(0, shown).map((x) => <Row key={`${x.item}|${x.warehouse}`} x={x} company={ctx.company} currency={ctx.currency} asOf={asOf} ar={ar} />)}</tbody>
          </table></EntTable>
          {rows.length > shown && <div className="p-2 text-center"><button type="button" className="btn-ghost text-xs" onClick={() => setShown((v) => v + PAGE)} data-dp-recon-more>{t("Show more", "عرض المزيد")} (<bdi data-no-i18n>{rows.length - shown}</bdi>)</button></div>}
          </div>}
        </section>
      </>;
    }}
  </ProFrame>;
}

function Row({ x, company, currency, asOf, ar }: { x: ReconRow; company: string; currency: string; asOf: string; ar: boolean }) {
  const t = (en: string, arabic: string) => (ar ? arabic : en);
  const flags = [x.uomMismatch && t("Bin unit differs from the item's stock unit", "وحدة الرصيد تختلف عن وحدة الصنف"), x.cancelledRows > 0 && `${t("cancelled ledger rows", "قيود دفتر ملغاة")}: ${x.cancelledRows}`,
    x.laterRows > 0 && `${t("rows after the as-of date", "قيود بعد التاريخ")}: ${x.laterRows}`, Math.abs(x.binInternalGap) >= 0.01 && t("Bin value ≠ quantity × rate", "قيمة الرصيد ≠ الكمية × المعدل")].filter(Boolean) as string[];
  return <tr data-dp-recon-row={x.cls}>
    <td className="whitespace-nowrap"><DocA dt="Item" name={x.item} /></td>
    <td className="max-w-40 truncate text-xs" data-no-i18n title={x.warehouse}>{x.warehouse}</td>
    <td className="text-end tabular-nums" data-no-i18n>{qty(x.binQty)}</td>
    <td className="whitespace-nowrap text-end tabular-nums" data-no-i18n>{qty(x.sleQty)} <small className="text-muted-foreground">{x.uom}</small></td>
    <td className="whitespace-nowrap text-end tabular-nums" data-no-i18n>{x.binValue === null ? "—" : fmtCurrency(x.binValue, currency)}</td>
    <td className="whitespace-nowrap text-end tabular-nums" data-no-i18n>{fmtCurrency(x.sleValue, currency)}</td>
    <td className={`whitespace-nowrap text-end tabular-nums ${Math.abs(x.valueDiff) >= 0.01 ? "font-semibold" : ""}`} data-no-i18n>{fmtCurrency(x.valueDiff, currency)}
      {Math.abs(x.qtyDiff) > 1e-6 && <span className="block text-[11px] font-normal text-muted-foreground">{x.qtyDiff > 0 ? "+" : ""}{qty(x.qtyDiff)} {x.uom}</span>}</td>
    <td className="min-w-[9rem] text-xs"><span className={`dp-pill ${x.cls === "match" ? "dp-pill-ok" : x.cls === "not-from-ledger" || x.cls === "ledger-inconsistent" ? "dp-pill-er" : "dp-pill-wn"} whitespace-nowrap`}>{bi(ar, CLASS_LABEL[x.cls])}</span>{flags.length > 0 && <span className="mt-1 block text-[11px] text-muted-foreground">{flags.join(" · ")}</span>}</td>
    <td className="whitespace-nowrap text-xs"><VoucherLink v={x.matchedAfter} /></td>
    <td className="whitespace-nowrap text-xs">{x.firstDivergent ? <VoucherLink v={x.firstDivergent} /> : <span className="text-muted-foreground">{x.cls === "not-from-ledger" ? t("Not identifiable", "غير قابل للتحديد") : "—"}</span>}</td>
    <td className="whitespace-nowrap text-xs">
      <Link to="/pro/stock-ledger" search={{ company, item: x.item, warehouse: x.warehouse, to: asOf } as never} className="text-primary hover:underline" data-dp-recon-ledger>{t("Ledger rows", "قيود الدفتر")}</Link>
      {x.bin && <><span className="text-muted-foreground" aria-hidden> · </span><DocA dt="Bin" name={x.bin} className="text-primary" /></>}
    </td>
  </tr>;
}
