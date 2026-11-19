// @ts-nocheck -- DIGIT Pro/HR apps are switched off in the merged site build; their original /pro/* and /hr/* app routes are not in this route tree (re-enabling the app needs those routes, then remove this line)
/**
 * RXP-02 / SC-F-07 AP payment calendar on /pro/payables. Liabilities (as-of supplier invoice balances) by due window,
 * with PO commitments as a separate current-only series that opens Open Purchase Orders on the identical window.
 * Supplier concentration and review exceptions filter the same invoice register below (one URL predicate).
 */
import { Link } from "@tanstack/react-router";
import { fmtCurrency } from "@/lib/format";
import type { ArRow } from "./aging";
import { AP_EXCEPTIONS, apExceptionLabel, commitmentCalendar, dueBandLabel, dueCalendar, exceptionCounts, filterAp, supplierConcentration, type ApException, type DueBand } from "./apCalendar";
import { openPurchaseOrders } from "./openPo";
import { sourceStatus } from "./finance";
import { BlockCard, Meter, RankCard, RankPair } from "@/components/enterprise/kit";

const money = (v: number, c: string) => (c ? fmtCurrency(v, c) : v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));

export function ApCalendar({ base, baseNoParty, asOf, today, company, party, band, ex, user, ar, onBand, onEx, onParty }: {
  /** register rows after every shared aging predicate (bucket/party/search/overdue), before due window and exception */
  base: ArRow[]; baseNoParty: ArRow[]; asOf: string; today: string; company: string; party?: string | undefined; band?: string | undefined; ex?: string | undefined; user: string; ar: boolean;
  onBand: (b: DueBand | undefined) => void; onEx: (e: ApException | undefined) => void; onParty: (p: string | undefined) => void;
}) {
  const t = (en: string, arabic: string) => (ar ? arabic : en);
  const cal = dueCalendar(filterAp(base, { ex }, asOf, true), asOf);
  const counts = exceptionCounts(filterAp(base, { due_band: band }, asOf));
  const conc = supplierConcentration(filterAp(baseNoParty, { due_band: band, ex }, asOf), Number.MAX_SAFE_INTEGER);
  const maxBand = Math.max(1, ...cal.bands.map((b) => Math.abs(b.totals[0]?.amount ?? 0)));
  // Commitments are current state (billed_amt today); a past as-of date cannot reconstruct them, so they are not shown.
  const poStatus = sourceStatus("Purchase Order", user);
  const current = asOf === today;
  const po = current && poStatus === "ok" ? openPurchaseOrders({ company, supplier: party }, user, today) : undefined;
  const com = po && po.status === "ok" ? commitmentCalendar(po.lines, asOf) : undefined;
  const range = (b: { band: DueBand; from?: string | undefined; to?: string | undefined }) =>
    b.band === "overdue" ? <>{t("Due before", "مستحقة قبل")} <bdi data-no-i18n>{asOf}</bdi></> : b.band === "later" ? <>{t("Due from", "مستحقة من")} <bdi data-no-i18n>{b.from}</bdi></> : <><span className="block">{t("From", "من")} <bdi data-no-i18n>{b.from}</bdi></span><span className="block">{t("To", "إلى")} <bdi data-no-i18n>{b.to}</bdi></span></>;
  return (
    <>
    <section className="ek-card mt-5" aria-labelledby="dp-ap-cal-h" data-dp-ap-calendar>
      <div className="ek-card-pad">
      <div className="flex flex-wrap items-baseline gap-2">
        <h3 id="dp-ap-cal-h" className="ek-h3">{t("Payment calendar", "تقويم السداد")}</h3>
        <span className="text-xs text-muted-foreground">{t("Supplier invoice due date, in 7-day windows starting on the as-of date. Purchase order commitments are a separate line and are not payables.", "تاريخ استحقاق فاتورة المورد، بنوافذ من 7 أيام تبدأ من تاريخ الاحتساب. التزامات أوامر الشراء سطر منفصل وليست ذممًا دائنة.")}</span>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {cal.bands.map((b) => {
          const on = band === b.band; const c = com?.bands.find((x) => x.band === b.band); const main = b.totals[0];
          return <div key={b.band} className="flex min-w-0 flex-col gap-1" data-dp-ap-band-cell={b.band}>
            <button type="button" className="dp-seg" aria-pressed={on} disabled={!b.count && !on} onClick={() => onBand(on ? undefined : b.band)} data-dp-ap-band={b.band}
              title={`${dueBandLabel(b.band, ar)} · ${b.count} · ${b.totals.map((x) => money(x.amount, x.currency)).join(" + ") || "—"}`}>
              <span className="text-xs font-medium">{dueBandLabel(b.band, ar)}</span>
              <span className="text-[11px] leading-tight text-muted-foreground">{range(b)}</span>
              {b.totals.length ? b.totals.map((x) => <span key={x.currency} className={`whitespace-nowrap text-base font-semibold tabular-nums ${b.band === "overdue" && x.amount ? "text-destructive" : ""}`} data-no-i18n>{money(x.amount, x.currency)}</span>) : <span className="text-base font-semibold text-muted-foreground" data-no-i18n>—</span>}
              <span className="text-[11px] text-muted-foreground"><bdi data-no-i18n>{b.count}</bdi> {t("invoices", "فواتير")}</span>
              <Meter value={main?.amount ?? 0} max={maxBand} tone={b.band === "overdue" ? "risk" : "good"} />
            </button>
            <div className="rounded-md border border-dashed border-border px-2 py-1.5 text-[11px]" data-dp-ap-commit={b.band}>
              <div className="text-muted-foreground">{t("Ordered, not billed", "مطلوب ولم يُفوتر")}</div>
              {!current ? <div className="text-muted-foreground">{t("Current only", "للتاريخ الحالي فقط")}</div>
                : poStatus !== "ok" ? <div className="text-muted-foreground">{poStatus === "denied" ? t("Not permitted", "غير مسموح") : t("Source unavailable", "المصدر غير متاح")}</div>
                : !c?.lines ? <div className="text-muted-foreground" data-no-i18n>—</div>
                : <Link to="/pro/open-purchase-orders" search={{ company, supplier: party, sched_from: b.from, sched_to: b.to, fs: "drill" } as never} className="block hover:underline" data-dp-ap-commit-link={b.band}>
                  {c.totals.map((x) => <span key={x.currency} className="block whitespace-nowrap font-medium tabular-nums" data-no-i18n>{money(x.toBill, x.currency)}</span>)}
                  <span className="text-muted-foreground"><bdi data-no-i18n>{c.lines}</bdi> {t("PO lines", "بنود أوامر شراء")}</span>
                </Link>}
            </div>
          </div>;
        })}
      </div>
      <p className="mt-1 text-[11px] text-muted-foreground">
        {t("Select a window to filter the invoices and totals below; select it again to clear.", "اختر نافذة لتصفية الفواتير والإجماليات أدناه؛ واخترها مجددًا للإلغاء.")}
        {cal.credits > 0 && <> {t("Credit balances are not scheduled:", "الأرصدة الدائنة لا تُجدول:")} <bdi data-no-i18n>{cal.credits}</bdi>.</>}
        {com && com.undated > 0 && <> {t("PO lines without an expected date:", "بنود أوامر شراء بدون تاريخ متوقع:")} <bdi data-no-i18n>{com.undated}</bdi>.</>}
        {!current && <> {t("Commitments use today's order and billing status, so they are shown only for today's date.", "الالتزامات تعتمد حالة الطلب والفوترة اليوم، لذا تظهر لتاريخ اليوم فقط.")}</>}
      </p>

      </div>
    </section>
    {/* supplier concentration (ranked card, names, top 8, show all) beside the review card — both in shared cards (owner 2026-11-12 evening §7–§8) */}
    <div className="mt-4"><RankPair>
      {conc.length ? conc.map((c) => <RankCard key={c.currency} id={`ap-conc-${c.currency}`} ar={ar} top={10} title={t("Supplier concentration", "تركّز الموردين")}
        sub={t("Share of the open payable in each currency. Select a supplier to filter the register.", "حصة المورد من الذمم المفتوحة في كل عملة. اختر موردًا لتصفية السجل.")}
        total={<span data-no-i18n>{c.currency || "—"} · {money(c.total, c.currency)}</span>}
        rows={c.top.map((p) => ({ key: p.party, label: <bdi data-no-i18n>{party === p.party ? `● ${p.partyName}` : p.partyName}</bdi>, title: p.party, value: p.amount, shown: money(p.amount, c.currency), share: p.share,
          onOpen: () => onParty(party === p.party ? undefined : p.party), attrs: { "data-dp-ap-conc": p.party } }))} />)
        : <BlockCard title={t("Supplier concentration", "تركّز الموردين")} id="ap-conc"><p className="text-xs text-muted-foreground">{t("Nothing to show", "لا توجد بيانات")}</p></BlockCard>}
      <BlockCard title={t("Review before paying", "مراجعة قبل السداد")} id="ap-review" attrs={{ "data-dp-ap-exceptions": "" }}>
          <ul className="space-y-2">
            {AP_EXCEPTIONS.map((k) => { const on = ex === k; return <li key={k}>
              <button type="button" aria-pressed={on} disabled={!counts[k] && !on} className={`flex w-full items-start gap-2 rounded-md border border-border px-2 py-1.5 text-start text-sm hover:bg-accent disabled:opacity-60 ${on ? "dp-row-on" : ""}`} onClick={() => onEx(on ? undefined : k)} data-dp-ap-ex={k}>
                <span className="flex-1"><span className="font-medium">{apExceptionLabel(k, ar)}</span>
                  <span className="block text-[11px] text-muted-foreground">{k === "hold" ? t("Native hold still active on the as-of date; DIGIT does not allow paying it until released.", "إيقاف أصلي ما زال ساريًا في تاريخ الاحتساب؛ لا يسمح DIGIT بسدادها قبل رفع الإيقاف.") : t("No item line links a purchase order or receipt. Check it is a valid direct invoice.", "لا يرتبط أي بند بأمر شراء أو إيصال استلام. تحقق من أنها فاتورة مباشرة صحيحة.")}</span></span>
                <span className={`chip tabular-nums ${counts[k] ? "bg-warning/20" : "bg-muted"}`} data-no-i18n>{counts[k]}</span>
              </button></li>; })}
            <li><Link to="/pro/received-not-billed" search={{ company } as never} className="flex items-center gap-2 rounded-md border border-border px-2 py-1.5 text-sm hover:bg-accent" data-dp-ap-rnb>
              <span className="flex-1"><span className="font-medium">{t("Received, not billed", "مستلم ولم يُفوتر")}</span><span className="block text-[11px] text-muted-foreground">{t("Receipt lines still waiting for a supplier invoice.", "بنود استلام ما زالت بانتظار فاتورة المورد.")}</span></span>
              <span aria-hidden>{ar ? "←" : "→"}</span></Link></li>
          </ul>
      </BlockCard>
    </RankPair></div>
    </>
  );
}
