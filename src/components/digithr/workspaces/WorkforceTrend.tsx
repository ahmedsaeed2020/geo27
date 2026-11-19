/**
 * NB-4 monthly workforce trend (06.3): hires, exits, net and month-end headcount reconstructed from Employee
 * date_of_joining / relieving_date, with the same company and period as the page scope. Hires/exits drill into the
 * Joiners/Exits metric registers for that month (identical rules, so counts reconcile). A reconciliation block
 * explains reconstructed headcount vs the Active Headcount metric. Records that cannot be dated are listed, not guessed.
 */
import { Link } from "@tanstack/react-router";
import { metricId } from "@/plugins/digit_hr/hrMetrics";
import { returnPeriod } from "@/components/digithr/MetricLink";
import { reconcileHeadcount, workforceTrend } from "@/plugins/digit_hr/workforceTrend";
import type { ModuleScope } from "@/components/digithr/ModuleScope";
import { HrInsightPanel, HrOperationalKpi } from "@/components/digithr/home/kit";
import { todayIso } from "@/components/digithr/Record360Kit";
import { type Sources } from "./shared";

type Tx = (ar: string, en: string) => string;

function last12(today: string) {
  const y = Number(today.slice(0, 4)), m = Number(today.slice(5, 7));
  const sy = m === 12 ? y : y - 1, sm = m === 12 ? 1 : m + 1;
  return { from: `${sy}-${String(sm).padStart(2, "0")}-01`, to: today };
}

export function WorkforceTrendPanel({ scope, src, tx, lang }: { scope: ModuleScope; src: Sources; tx: Tx; lang: string }) {
  const today = todayIso();
  const explicit = !!(scope.from && scope.to);
  const period = explicit ? { from: scope.from, to: scope.to } : last12(today);
  const ready = src.ready("Employee") && scope.companyKnown;
  const emps = ready ? scope.filter(src.rows("Employee")) : [];
  const t = workforceTrend(emps, period.from, period.to);
  const rec = reconcileHeadcount(emps, today);
  const max = Math.max(1, ...t.months.map((m) => Math.max(m.hires, m.exits)));
  const fmt = new Intl.DateTimeFormat(lang === "ar" ? "ar-u-nu-latn" : "en-GB", { month: "short", year: "numeric", timeZone: "UTC" });
  const monthLabel = (ym: string) => fmt.format(Date.UTC(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)) - 1, 1));
  const drill = (metric: "Joiners" | "Exits", from: string, to: string, n: number) => n === 0
    ? <span className="dhr-tnum text-[var(--dhr-muted)]">0</span>
    : <Link to="/digit-hr/metrics/$metric" params={{ metric: metricId(metric) }} search={{ company: scope.company, from, to, back: "06.3", ret: returnPeriod(scope.from, scope.to) }} className="dhr-link dhr-tnum" data-trend-drill={`${metric}|${from}`}>{n}</Link>;
  const bar = (n: number, color: string) => <span aria-hidden className="block h-2 rounded-full" style={{ width: `${Math.max(n ? 6 : 0, (n / max) * 100)}%`, background: color }} />;
  return (
    <HrInsightPanel data-workforce-trend={t.months.length} title={tx("اتجاه القوى العاملة الشهري", "Monthly workforce trend")}
      meta={<>{explicit ? <>{tx("الفترة", "Period")} <bdi dir="ltr" data-no-i18n>{period.from} – {period.to}</bdi></> : tx("آخر 12 شهرًا (لم تُحدَّد فترة)", "Last 12 months (no period selected)")} · {tx(`السكان: ${emps.length} سجل موظف يحق لك قراءته`, `Population: ${emps.length} employee records you may read`)}{scope.company ? ` · ${scope.company}` : ""}</>}
      info={tx("التعيينات = تاريخ الانضمام ضمن الشهر؛ حالات الخروج = تاريخ المغادرة ضمن الشهر لحالة «غادر» — نفس قاعدتي مؤشري المنضمين والمغادرين، لذا يتطابق المجموع معهما. عدد نهاية الشهر = من انضم حتى نهاية الشهر ولم يغادر بعد. السجلات بلا تاريخ انضمام أو حالة «غادر» بلا تاريخ مغادرة لا تُقدَّر وتُذكر أدناه.",
        "Hires = joining date in the month; exits = relieving date in the month for status Left — the same rules as the Joiners and Exits metrics, so the totals reconcile with them. Month-end headcount = joined by the month end and not yet left. Records without a joining date, or Left without a relieving date, are not estimated and are listed below.")}>
      {!ready ? <div className="py-2">{src.empty("Employee")}</div> : t.months.length === 0 ? <p className="dhr-empty">{tx("الفترة غير صالحة.", "The period is not valid.")}</p> : (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" data-trend-kpis>
            <HrOperationalKpi label={tx("عدد بداية الفترة", "Opening headcount")} value={<span data-trend-opening>{t.openingHeadcount}</span>} source="Employee: joined before period start and not left by then" />
            <HrOperationalKpi label={tx("تعيينات الفترة", "Hires in period")} value={<span data-trend-hires>{t.hires}</span>} tone="success" source="Employee.date_of_joining" />
            <HrOperationalKpi label={tx("حالات خروج الفترة", "Exits in period")} value={<span data-trend-exits>{t.exits}</span>} tone={t.exits ? "warn" : undefined} source="Employee.relieving_date (status Left)" />
            <HrOperationalKpi label={tx("عدد نهاية الفترة", "Closing headcount")} value={<span data-trend-closing>{t.months[t.months.length - 1]!.headcount}</span>} source="Employee: on the books at period end" />
          </div>
          <div className="overflow-x-auto rounded-[var(--dhr-r-sm)] border border-[var(--dhr-sep)]">
            <table className="w-full min-w-[520px] text-[13px]" data-trend-table>
              <caption className="sr-only">{tx("التعيينات وحالات الخروج وعدد نهاية الشهر لكل شهر", "Hires, exits and month-end headcount per month")}</caption>
              <thead><tr><th className="text-start">{tx("الشهر", "Month")}</th><th className="text-start">{tx("تعيينات", "Hires")}</th><th className="text-start">{tx("خروج", "Exits")}</th><th className="text-center">{tx("الصافي", "Net")}</th><th className="text-center">{tx("نهاية الشهر", "Month end")}</th></tr></thead>
              <tbody>{t.months.map((m) => (
                <tr key={m.month} className="border-t" data-trend-month={m.month} data-hires={m.hires} data-exits={m.exits} data-headcount={m.headcount}>
                  <td className="whitespace-nowrap py-1.5" data-no-i18n>{monthLabel(m.month)}</td>
                  <td className="w-[28%]"><span className="flex items-center gap-2"><span className="w-6 shrink-0">{drill("Joiners", m.start, m.end, m.hires)}</span><span className="min-w-0 flex-1">{bar(m.hires, "var(--dhr-emerald)")}</span></span></td>
                  <td className="w-[28%]"><span className="flex items-center gap-2"><span className="w-6 shrink-0">{drill("Exits", m.start, m.end, m.exits)}</span><span className="min-w-0 flex-1">{bar(m.exits, "var(--dhr-warn)")}</span></span></td>
                  <td className="text-center dhr-tnum" data-no-i18n><bdi dir="ltr">{m.net > 0 ? `+${m.net}` : m.net}</bdi></td>
                  <td className="text-center font-semibold dhr-tnum" data-no-i18n>{m.headcount}</td>
                </tr>))}</tbody>
            </table>
          </div>
          {t.truncated && <p className="text-[12px] text-[var(--dhr-muted)]">{tx("تُعرض آخر 36 شهرًا من الفترة فقط.", "Only the last 36 months of the period are shown.")}</p>}
          {(t.undatedJoin > 0 || t.undatedExit > 0) && <p className="text-[12.5px]" data-trend-undated={`${t.undatedJoin}|${t.undatedExit}`}>
            <span className="text-[var(--dhr-muted)]">{tx("غير مؤرخ (مستبعد من الاتجاه):", "Undated (excluded from the trend):")}</span> {tx(`${t.undatedJoin} بلا تاريخ انضمام`, `${t.undatedJoin} without joining date`)} · {tx(`${t.undatedExit} «غادر» بلا تاريخ مغادرة`, `${t.undatedExit} Left without relieving date`)}
          </p>}
          <section className="rounded-[var(--dhr-r-sm)] border border-[var(--dhr-sep)] p-3" aria-label={tx("مطابقة العدد", "Headcount reconciliation")} data-trend-reconcile={rec.balanced ? "balanced" : "unbalanced"}>
            <h3 className="mb-2 text-[13px] font-semibold">{tx("مطابقة عدد اليوم مع مؤشر الموظفين النشطين", "Today's headcount reconciled with Active Headcount")} <bdi dir="ltr" className="font-normal text-[var(--dhr-muted)]" data-no-i18n>({rec.asOf})</bdi></h3>
            <dl className="grid grid-cols-1 gap-x-4 gap-y-1 text-[12.5px] sm:grid-cols-2">
              <div className="flex justify-between gap-2"><dt>{tx("العدد المُعاد بناؤه من التواريخ", "Reconstructed from dates")}</dt><dd className="dhr-tnum font-semibold" data-rec-reconstructed>{rec.reconstructed}</dd></div>
              <div className="flex justify-between gap-2"><dt>{tx("مؤشر الموظفين النشطين (الحالة = نشط)", "Active Headcount metric (status = Active)")}</dt><dd className="dhr-tnum font-semibold" data-rec-active>{rec.active}</dd></div>
              <div className="flex justify-between gap-2"><dt>{tx("+ ضمن العدد وحالتهم غير نشط/موقوف", "+ On the books with status Inactive/Suspended")}</dt><dd className="dhr-tnum">{rec.nonActiveOnBooks}</dd></div>
              <div className="flex justify-between gap-2"><dt>{tx("+ «غادر» بتاريخ مغادرة لاحق", "+ Left with a later relieving date")}</dt><dd className="dhr-tnum">{rec.leavingLater}</dd></div>
              <div className="flex justify-between gap-2"><dt>{tx("− نشط بلا تاريخ انضمام أو بتاريخ لاحق", "− Active without a joining date or joining later")}</dt><dd className="dhr-tnum">{rec.activeNotOnBooks}</dd></div>
              <div className="flex justify-between gap-2"><dt>{tx("النتيجة", "Result")}</dt><dd>{rec.balanced ? tx("متطابق", "Balanced") : tx("غير متطابق", "Not balanced")}</dd></div>
            </dl>
          </section>
        </div>
      )}
    </HrInsightPanel>
  );
}
