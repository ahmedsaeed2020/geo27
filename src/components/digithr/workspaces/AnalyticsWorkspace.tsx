/**
 * Section 06.3 — People analytics & reports hub: every registered HR metric with its live value and drill, and the
 * HR report catalog with each report's source readability and engine, filterable by module. Reports open the native
 * report runner; nothing is pre-computed or stored.
 */
import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useScopeMetas } from "@/plugins/digit_hr/compat/scope";
import { useStoreVersion } from "@/lib/adapter";
import { useSessionUser } from "@/plugins/digit_hr/compat/session";
import { t as tr } from "@/i18n";
import { useTx } from "@/components/digithr/DigitHrLayout";
import { enterHrNative } from "@/components/digithr/HrNav";
import { MetricValue, ScopeBar, useModuleScope } from "@/components/digithr/ModuleScope";
import { WorkTable } from "@/components/digithr/EnterpriseRegister";
import { HR_REPORT_LINKS } from "@/components/digithr/navigation";
import { ReportModeBadge } from "@/components/digithr/ReportModeBadge";
import { HR_METRICS } from "@/plugins/digit_hr/hrMetrics";
import { METRIC_AR } from "@/plugins/digit_hr/metricLabels";
import { MODULES } from "@/plugins/digit_hr/v5/data";
import { useSources, SourceNotice, SourceMark, readSource, stateText, StatRow, Chip } from "./shared";
import { WorkforceTrendPanel } from "./WorkforceTrend";

const PERIOD = new Set(["Joiners", "Exits", "Internal Transfers"]);
type ReportRow = (typeof HR_REPORT_LINKS)[number];

export function AnalyticsWorkspace() {
  const { tx, lang } = useTx();
  useStoreVersion(); useSessionUser();
  const refs = [...new Set(HR_REPORT_LINKS.map((r) => r.ref).filter(Boolean))];
  useScopeMetas(["Employee", ...refs]);
  const src = useSources(tx);
  const scope = useModuleScope(src);
  const [mod, setMod] = useState("");
  const reports = HR_REPORT_LINKS.filter((r) => !mod || r.section.startsWith(`${mod}.`));
  const readable = reports.filter((r) => { const st = readSource(r.ref).state; return st === "READY_WITH_DATA" || st === "READY_EMPTY"; }).length;
  const metrics = Object.keys(HR_METRICS);

  return (
    <div className="space-y-5" data-analytics-workspace>
      <SourceNotice src={src} />
      <ScopeBar scope={scope} tx={tx} period />
      <StatRow items={[
        { label: tx("مؤشرات مسجلة", "Registered metrics"), value: <span data-no-i18n data-metric-count>{metrics.length}</span> },
        { label: tx("تقارير الموارد البشرية", "HR reports"), value: <span data-no-i18n data-report-count>{reports.length}</span> },
        { label: tx("تقارير مصدرها مقروء لك", "Reports whose source you can read"), value: <span data-no-i18n data-report-readable>{readable}</span> },
      ]} />

      <WorkforceTrendPanel scope={scope} src={src} tx={tx} lang={lang} />

      <section className="dhr-card rounded-[14px] p-4" data-metric-catalog>
        <h2 className="font-semibold">{tx("كتالوج المؤشرات", "Metric catalog")}</h2>
        <p className="mb-3 text-xs text-[var(--dhr-muted)]">{tx("كل رقم يفتح السجلات الأصلية التي تكوّنه، بنفس الشركة والفترة.", "Each number opens the native records behind it, with the same company and period.")}</p>
        <WorkTable<string> label="metric-catalog" tx={tx} rows={metrics} rowKey={(l) => l} pageSize={12}
          searchText={(l) => `${l} ${METRIC_AR[l] ?? ""}`}
          cols={[
            { key: "m", ar: "المؤشر", en: "Metric", sort: (l) => tx(METRIC_AR[l] ?? l, l), render: (l) => <span>{tx(METRIC_AR[l] ?? l, l)}</span> },
            { key: "p", ar: "النوع", en: "Kind", render: (l) => <span className="text-xs text-[var(--dhr-muted)]">{PERIOD.has(l) ? tx("ضمن الفترة", "In period") : tx("لحظي", "Point in time")}</span> },
            { key: "v", ar: "القيمة", en: "Value", render: (l) => <span className="font-semibold tabular-nums"><MetricValue label={l} scope={scope} src={src} tx={tx} back="06.3" period={PERIOD.has(l)} /></span> },
          ]} />
      </section>

      <section className="dhr-card rounded-[14px] p-4" data-report-catalog={reports.length}>
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div><h2 className="font-semibold">{tx("كتالوج التقارير", "Report catalog")}</h2>
            <p className="text-xs text-[var(--dhr-muted)]">{tx("تقارير المصدر تقرأ مرشحاتها من نموذج التقرير نفسه، وتُحسب من السجلات الحالية لحظة فتحها (لا توجد نسخة مخزنة).", "Source reports read their filters from the report's own form and compute from current records when opened (no stored snapshot).")}</p></div>
          <label className="dhr-label">{tx("الوحدة", "Module")}
            <select value={mod} onChange={(e) => setMod(e.target.value)} className="mt-1 block min-h-10 w-full md:w-56" data-report-module>
              <option value="">{tx("كل الوحدات", "All modules")}</option>
              {MODULES.map((m) => <option key={m.id} value={m.id}>{tx(m.ar, m.en)}</option>)}
            </select>
          </label>
        </div>
        <WorkTable<ReportRow> label="report-catalog" tx={tx} rows={reports} rowKey={(r) => r.id} pageSize={12}
          searchText={(r) => `${r.id} ${r.report} ${tr(r.report)} ${r.ref}`}
          cols={[
            { key: "r", ar: "التقرير", en: "Report", sort: (r) => r.report, render: (r) => <Link to="/report/$name" params={{ name: r.report }} onClick={() => enterHrNative(r.section)} className="font-medium text-[var(--dhr-emerald)] hover:underline" data-report-link={r.id}>{tr(r.report)}</Link> },
            { key: "s", ar: "القسم", en: "Section", sort: (r) => r.section, render: (r) => <span data-no-i18n className="text-xs">{r.section}</span> },
            { key: "src", ar: "المصدر", en: "Source", render: (r) => <span className="flex flex-wrap items-center gap-2 text-xs"><span>{tr(r.ref)}</span>{(() => { const rd = readSource(r.ref); return rd.state === "READY_WITH_DATA" || rd.state === "READY_EMPTY" ? <Chip><span data-report-source-ok={r.id}>{tx("مقروء", "Readable")}</span></Chip> : <Chip tone="warn"><SourceMark read={rd} tx={tx} /> {stateText(rd.state, tx)}</Chip>; })()}</span> },
            { key: "e", ar: "المحرك", en: "Engine", render: (r) => <ReportModeBadge report={r.report} refDoctype={r.ref} /> },
          ]} />
      </section>
    </div>
  );
}
