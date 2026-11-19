/**
 * Section 06.1 — HR command center: one tile per HR module with its registered headline metrics (same populations as
 * the module homes and drill pages), plus an attention list ranking the action metrics that currently have records.
 * Company and period travel with every link. NB-2: opens with an index of role dashboards (Mission Control, HR desk,
 * Team, Me, Payroll control room, Workforce analytics) so 06.1 points to the existing homes instead of duplicating them;
 * availability is a presentation hint from the same identity/role checks the destinations use, which still enforce scope.
 */
import { Link } from "@tanstack/react-router";
import { canReadType, useScopeMetas } from "@/plugins/digit_hr/compat/scope";
import { currentEmployeeId, isHrAdmin, teamOf } from "@/plugins/digit_hr/compat/employeeIdentity";
import { Pill } from "@/components/digithr/home/kit";
import { useStoreVersion } from "@/lib/adapter";
import { useSessionUser } from "@/plugins/digit_hr/compat/session";
import { useTx } from "@/components/digithr/DigitHrLayout";
import { MetricValue, ScopeBar, useModuleScope } from "@/components/digithr/ModuleScope";
import { MetricLink, metricReturn, commandScope } from "@/components/digithr/MetricLink";
import { hrMetric } from "@/plugins/digit_hr/hrMetrics";
import { METRIC_AR } from "@/plugins/digit_hr/metricLabels";
import { MODULES } from "@/plugins/digit_hr/v5/data";
import { useSources, SourceNotice } from "./shared";

type Tile = { module: string; metrics: { label: string; period?: boolean }[] };
export const COMMAND_TILES: Tile[] = [
  { module: "01", metrics: [{ label: "Active Headcount" }, { label: "Pending Employment Changes" }, { label: "Organization Exceptions" }] },
  { module: "02", metrics: [{ label: "Open Vacancies" }, { label: "Interviews Due" }, { label: "Appraisals To Complete" }] },
  { module: "03", metrics: [{ label: "Pending Leave" }, { label: "On Leave Today" }, { label: "Overtime Pending" }] },
  { module: "04", metrics: [{ label: "Payroll Batches" }, { label: "Claims Awaiting Approval" }, { label: "Open Employee Advances" }] },
  { module: "05", metrics: [{ label: "Team Approvals" }, { label: "Expiring Documents" }, { label: "Open onboarding" }] },
  { module: "06", metrics: [{ label: "Joiners", period: true }, { label: "Exits", period: true }, { label: "Internal Transfers", period: true }] },
  { module: "07", metrics: [{ label: "Employees Without User Link" }, { label: "Incomplete records" }] },
];
/** Metrics that represent work waiting for someone (ranked in the attention list). */
export const ACTION_METRICS = ["Pending Approvals", "Team Approvals", "Pending Leave", "Claims Awaiting Approval", "Interviews Due", "Interview Feedback Awaited", "Appraisals To Complete", "Expiring Documents", "Pending Employment Changes", "Open onboarding", "Organization Exceptions"];

type Need = "hr" | "team" | "me" | "payroll" | "workforce";
type RoleDash = { id: string; ar: string; en: string; forAr: string; forEn: string; to: string; params?: Record<string, string>; search?: Record<string, string>; need: Need };
export const ROLE_DASHBOARDS: RoleDash[] = [
  { id: "mission", ar: "مركز القيادة", en: "Mission Control", forAr: "القيادة التنفيذية ومدير الموارد البشرية: الحقائق الرئيسية عبر الوحدات وما يحتاج انتباهًا.", forEn: "Executives and the CHRO: headline facts across modules and what needs attention.", to: "/digit-hr", need: "hr" },
  { id: "hrdesk", ar: "مكتب الموارد البشرية", en: "HR desk", forAr: "فريق الموارد البشرية: الطلبات والخدمات المفتوحة لكل الموظفين.", forEn: "The HR team: open requests and services across employees.", to: "/digit-hr/m/$module", params: { module: "05" }, search: { lens: "hr" }, need: "hr" },
  { id: "team", ar: "فريقي", en: "My team", forAr: "المدير المباشر: موافقات الفريق والحضور والإجازات.", forEn: "Line managers: team approvals, attendance and leave.", to: "/digit-hr/m/$module", params: { module: "05" }, search: { lens: "team" }, need: "team" },
  { id: "me", ar: "مساحتي", en: "My workspace", forAr: "الموظف: رصيده وطلباته ومستنداته.", forEn: "Employees: own balances, requests and documents.", to: "/digit-hr/m/$module", params: { module: "05" }, search: { lens: "me" }, need: "me" },
  { id: "payroll", ar: "غرفة تحكم الرواتب", en: "Payroll control room", forAr: "مسؤول الرواتب: الدورات والتحقق قبل الاعتماد.", forEn: "Payroll officers: cycles and pre-approval checks.", to: "/digit-hr/m/$module", params: { module: "04" }, need: "payroll" },
  { id: "analytics", ar: "تحليلات القوى العاملة", en: "Workforce analytics", forAr: "المحللون والقيادة: المؤشرات والتقارير المسجلة.", forEn: "Analysts and leadership: registered metrics and reports.", to: "/digit-hr/s/$section", params: { section: "06.3" }, need: "workforce" },
];

/** Same checks the destinations use to offer content (ExperienceWorkspace lenses, scoped reads). */
export function roleDashAvailability(need: Need): boolean {
  const admin = isHrAdmin(); const me = currentEmployeeId();
  if (need === "hr") return admin;
  if (need === "team") return admin || (!!me && teamOf(me).size > 0);
  if (need === "me") return !!me;
  // Payroll room = payroll cycle readers (an employee reading only their own slip is not a payroll officer).
  if (need === "payroll") return canReadType("Payroll Entry");
  // Workforce analytics = HR or people leaders with a team (the page applies the reader's scope).
  return admin || (!!me && teamOf(me).size > 0);
}

function RoleDashboards({ tx }: { tx: (ar: string, en: string) => string }) {
  return (
    <section className="dhr-card rounded-[14px] p-4" data-role-dashboards>
      <h2 className="font-semibold">{tx("لوحات القيادة حسب الدور", "Dashboards by role")}</h2>
      <p className="mb-3 text-xs text-[var(--dhr-muted)]">{tx("كل لوحة تفتح الصفحة القائمة لذلك الدور؛ الإتاحة تقديرية وتطبّق الصفحة نطاق صلاحياتك.", "Each dashboard opens the existing page for that role; availability is a hint and the page applies your permission scope.")}</p>
      <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{ROLE_DASHBOARDS.map((d) => { const ok = roleDashAvailability(d.need); const body = (
        <>
          <span className="flex items-center justify-between gap-2"><span className="font-medium">{tx(d.ar, d.en)}</span><Pill tone={ok ? "success" : "neutral"}>{ok ? tx("متاحة لك", "Available to you") : tx("غير متاحة لدورك", "Not for your role")}</Pill></span>
          <span className="mt-1 block text-[12.5px] text-[var(--dhr-muted)]">{tx(d.forAr, d.forEn)}</span>
        </>);
        return <li key={d.id} data-role-dash={d.id} data-available={ok ? "1" : "0"}>{ok
          ? <Link to={d.to as "/digit-hr"} params={d.params as never} search={(d.search ?? {}) as never} className="block min-h-11 rounded-[10px] border border-[var(--dhr-border)] p-3 hover:border-[var(--dhr-emerald)]">{body}</Link>
          : <div className="block min-h-11 rounded-[10px] border border-dashed border-[var(--dhr-border)] p-3 opacity-75" aria-disabled="true">{body}</div>}</li>; })}</ul>
    </section>
  );
}

export function CommandCenterWorkspace() {
  const { tx } = useTx();
  useStoreVersion(); useSessionUser();
  useScopeMetas(["Employee"]);
  const src = useSources(tx);
  const scope = useModuleScope(src);
  const name = (l: string) => tx(METRIC_AR[l] ?? l, l);
  const attention = scope.companyKnown && src.ready("Employee")
    ? ACTION_METRICS.map((l) => ({ l, v: hrMetric(l, scope.coCtx).value })).filter((x): x is { l: string; v: number } => typeof x.v === "number" && x.v > 0).sort((a, b) => b.v - a.v)
    : [];

  return (
    <div className="space-y-5" data-command-center>
      <SourceNotice src={src} />
      <ScopeBar scope={scope} tx={tx} period />
      <RoleDashboards tx={tx} />
      <section className="dhr-card rounded-[14px] p-4" data-attention={attention.length}>
        <h2 className="font-semibold">{tx("ما يحتاج انتباهًا الآن", "What needs attention now")}</h2>
        <p className="mb-3 text-xs text-[var(--dhr-muted)]">{tx("مؤشرات العمل المنتظر مرتبة حسب العدد؛ تظهر فقط المؤشرات التي لها سجلات ضمن نطاقك.", "Waiting-work metrics ranked by count; only metrics with records in your scope appear.")}</p>
        {attention.length ? <ol className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{attention.map((x, i) => (
          <li key={x.l}><MetricLink label={x.l} back="06.1" className="flex min-h-11 items-center justify-between gap-2 rounded-[10px] border border-[var(--dhr-border)] p-3 hover:border-[var(--dhr-emerald)]">
            <span className="text-sm"><span className="me-2 text-xs text-[var(--dhr-muted)]" data-no-i18n>{i + 1}</span>{name(x.l)}</span>
            <strong className="tabular-nums" data-attention-value={x.l} data-no-i18n>{x.v}</strong>
          </MetricLink></li>))}</ol>
          : <p className="text-sm text-[var(--dhr-muted)]">{scope.companyKnown ? tx("لا يوجد عمل منتظر ضمن نطاقك.", "No waiting work in your scope.") : null}</p>}
      </section>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {COMMAND_TILES.map((t) => { const m = MODULES.find((x) => x.id === t.module); return (
          <section key={t.module} className="dhr-card rounded-[14px] p-4" data-command-tile={t.module}>
            <div className="mb-2 flex items-center justify-between gap-2">
              <h3 className="font-semibold">{m ? tx(m.ar, m.en) : t.module}</h3>
              <Link {...metricReturn(t.module)} search={commandScope(scope.company ? { company: scope.company } : {})} data-open-module={t.module} className="text-xs text-[var(--dhr-emerald)] hover:underline">{tx("فتح الوحدة", "Open module")}</Link>
            </div>
            <dl className="divide-y text-sm">{t.metrics.map((x) => (
              <div key={x.label} className="flex min-h-10 items-center justify-between gap-2 py-1.5">
                <dt>{name(x.label)}</dt>
                <dd className="font-semibold tabular-nums"><MetricValue label={x.label} scope={scope} src={src} tx={tx} back="06.1" period={!!x.period} /></dd>
              </div>))}</dl>
          </section>); })}
      </div>
    </div>
  );
}
