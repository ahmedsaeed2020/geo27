/**
 * RXP-01 decision chart: receivable/payable outstanding by age segment (CFO-AR-AGING / CFO-AP-DUE).
 * Same as-of register as /pro/receivables and /pro/payables; each bar is a link carrying the exact predicate
 * (company + segment, marked as a dashboard drill), so the destination rows and totals reconcile with the bar.
 */
import { Link } from "@tanstack/react-router";
import { fmtCurrency } from "@/lib/format";
import { useLang } from "@/i18n";
import { DevOnly } from "@/components/DevOnly";
import { arRegister, segmentTotals, SEGMENTS, SEGMENTS_AR, CREDIT_SEGMENT, type Side } from "./aging";
import { SourceState } from "./ProFrame";
import { DRILL } from "./savedViews";
import { Meter } from "@/components/enterprise/kit";

export function AgingInsight({ side, company, currency, user }: { side: Side; company: string; currency: string; user: string }) {
  const ar = useLang() === "ar"; const t = (en: string, arabic: string) => (ar ? arabic : en);
  const route = side === "receivable" ? "/pro/receivables" : "/pro/payables";
  const r = arRegister(side, company, undefined, user);
  const title = side === "receivable" ? t("Receivables by age", "الذمم المدينة حسب العمر") : t("Payables by age", "الذمم الدائنة حسب العمر");
  if (r.status !== "ok") return <section className="dp-card" data-dp-aging-insight={side}><h2 className="dp-ws-h">{title}</h2><SourceState status={r.status} doctype={r.doctype} /></section>;
  const inCur = r.rows.filter((x) => !currency || x.currency === currency || !x.currency);
  const other = r.rows.length - inCur.length;
  const segs = segmentTotals(inCur);
  const amount = (i: number) => segs[i]!.totals.reduce((s, x) => s + x.amount, 0);
  const max = Math.max(1, ...segs.map((s, i) => Math.abs(amount(i))));
  const open = segs.filter((s) => s.bucket !== CREDIT_SEGMENT).reduce((s, x) => s + x.totals.reduce((a, b) => a + b.amount, 0), 0);
  const overdue = [1, 2, 3, 4].reduce((s, i) => s + amount(i), 0);
  const money = (v: number) => (currency ? fmtCurrency(v, currency) : v.toLocaleString("en-US"));
  // Reconciliation with figures read from the stored invoice balance (e.g. the Receivables key figure): movements dated after today.
  const adj = inCur.filter((x) => Math.abs(x.adjusted) >= 0.005);
  const adjTotal = adj.reduce((s, x) => s + x.adjusted, 0);
  return (
    <section className="dp-card" aria-label={title} data-dp-aging-insight={side}>
      <div className="flex flex-wrap items-baseline gap-2">
        <h2 className="dp-ws-h">{title}</h2>
        <span className="text-xs text-muted-foreground"><span>{t("As of today", "حتى اليوم")}</span> · <bdi data-no-i18n>{currency || "—"}</bdi></span>
        <Link to={route as never} search={{ company } as never} className="ms-auto text-xs hover:underline" data-dp-aging-all={side}>{t("Open register", "فتح السجل")}</Link>
      </div>
      <p className="mt-1 text-sm"><span>{t("Open", "مفتوح")}</span> <b className="tabular-nums" data-no-i18n>{money(open)}</b> · <span>{t("Overdue", "متأخر")}</span> <b className={`tabular-nums ${overdue ? "text-destructive" : ""}`} data-no-i18n>{money(overdue)}</b></p>
      <ul className="mt-2 space-y-1" aria-label={t("Select an age segment to open its invoices", "اختر شريحة عمرية لفتح فواتيرها")}>
        {segs.map((s) => { const v = amount(s.bucket); const label = (ar ? SEGMENTS_AR : SEGMENTS)[s.bucket]!; const tone = s.bucket >= 3 && s.bucket < CREDIT_SEGMENT;
          const body = <>
            <span className="w-28 shrink-0 truncate text-xs text-muted-foreground sm:w-36">{label}</span>
            <span className="flex-1"><Meter value={v} max={max} tone={tone ? "risk" : "good"} label={label} /></span>
            <span className={`w-28 shrink-0 text-end text-xs font-semibold tabular-nums ${tone && v ? "text-destructive" : ""}`} data-no-i18n>{s.count ? money(v) : "—"}</span>
            <span className="w-8 shrink-0 text-end text-[11px] text-muted-foreground tabular-nums" data-no-i18n>{s.count}</span></>;
          return <li key={s.bucket}>{s.count
            ? <Link to={route as never} search={{ company, bucket: String(s.bucket), fs: DRILL } as never} className="flex items-center gap-2 rounded px-1 py-0.5 hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
                title={`${label} · ${s.count} ${t("invoices", "فواتير")} · ${money(v)}`} data-dp-aging-bar={`${side}:${s.bucket}`}>{body}</Link>
            : <div className="flex items-center gap-2 px-1 py-0.5 opacity-70" data-dp-aging-bar-empty={`${side}:${s.bucket}`}>{body}</div>}</li>; })}
      </ul>
      {adj.length > 0 && <p className="mt-2 rounded border border-border bg-muted/40 px-2 py-1 text-[11px]" data-dp-aging-recon={side}>
        <span>{t("Includes", "يشمل")}</span> <b className="tabular-nums" data-no-i18n>{money(adjTotal)}</b> <span>{t("of payments or credits dated after today on", "من مدفوعات أو إشعارات بتاريخ لاحق لليوم على")}</span> <bdi data-no-i18n>{adj.length}</bdi> <span>{t("invoices", "فواتير")}</span> (<bdi data-no-i18n>{adj.map((x) => x.name).join(", ")}</bdi>) — <span>{t("taken back out as the native Accounts Receivable report does; figures read from the stored invoice balance already deduct them.", "أُعيدت كما يفعل تقرير الذمم الأصلي؛ الأرقام المقروءة من رصيد الفاتورة المخزّن تخصمها مسبقًا.")}</span></p>}
      <p className="mt-2 text-[11px] text-muted-foreground"><span>{t("Source", "المصدر")}</span>: <span>{t("open balance", "الرصيد المتبقي")}</span><DevOnly> <bdi data-no-i18n>{r.doctype}.outstanding_amount</bdi></DevOnly> · <span>{t("submitted invoices of the selected company; age = days past due date", "الفواتير المعتمدة للشركة المحددة؛ العمر = الأيام بعد تاريخ الاستحقاق")}</span>
        {!r.glChecked && <> · <span className="text-warning">{t("General Ledger not readable — future-dated movements are not taken out", "دفتر الأستاذ غير متاح — لا تُستبعد الحركات ذات التاريخ اللاحق")}</span></>}
        {other > 0 && <> · <span className="text-warning"><bdi data-no-i18n>{other}</bdi> {t("invoices in other currencies are not summed here", "فواتير بعملات أخرى غير مجمّعة هنا")}</span></>}</p>
    </section>
  );
}
