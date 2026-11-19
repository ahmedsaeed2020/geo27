import { useTx } from "./HrNav";
import { hrReportMode } from "@/plugins/digit_hr/reportModes";
import { cachedMeta } from "@/lib/catalog";
import { useScopeMetas } from "@/plugins/digit_hr/compat/scope";
import { hasPerm, useSessionUser } from "@/plugins/digit_hr/compat/session";

/**
 * What opening the report actually does for this user in this preview: the report page's own gate (read + report on
 * the reference DocType) first, then computed port vs server-only. Never a static research label.
 */
export function ReportModeBadge({ report, refDoctype }: { report: string; refDoctype?: string }) {
  const { tx } = useTx();
  useSessionUser(); useScopeMetas(refDoctype ? [refDoctype] : []);
  const meta = refDoctype ? cachedMeta(refDoctype) : undefined;
  if (meta && (!hasPerm(meta, "read") || !hasPerm(meta, "report")))
    return <span className="dhr-badge" data-tone="neutral" data-report-mode="denied" title={tx("صفحة التقرير تتطلب صلاحية القراءة والتقرير على مستند المصدر.", "The report page requires read and report permission on its source document.")}>{tx("بلا صلاحية تقرير", "No report permission")}</span>;
  const mode = hrReportMode(report);
  return mode === "computed"
    ? <span className="dhr-badge" data-tone="success" data-report-mode={mode} title={tx("نسخة محلية من منطق التقرير الأصلي على بيانات المعاينة؛ النتيجة المعتمدة تُحسب على الخادم.", "Local port of the source report over preview data; the authoritative result runs on the server.")}>{tx("يُحسب في المعاينة", "Computed in preview")}</span>
    : <span className="dhr-badge" data-tone="neutral" data-report-mode={mode} title={tx("يُنفَّذ على خادم DIGIT؛ المعاينة تعرض سجلات المصدر فقط دون أرصدة أو مجاميع.", "Runs on the DIGIT server; the preview lists source records only, without balances or totals.")}>{tx("يحتاج خادم", "Server-dependent")}</span>;
}
