/**
 * Section 06.2 — Workforce planning: Staffing Plan rows against live headcount and open Job Openings (HRMS
 * get_designation_counts semantics, exact company). Facts only; no forecast, cost projection or automatic requisition.
 */
import { Link } from "@tanstack/react-router";
import { useScopeMetas } from "@/plugins/digit_hr/compat/scope";
import { useStoreVersion } from "@/lib/adapter";
import { hasPerm, useSessionUser } from "@/plugins/digit_hr/compat/session";
import { cachedMeta } from "@/lib/catalog";
import { useTx } from "@/components/digithr/DigitHrLayout";
import { ScopeBar, useModuleScope } from "@/components/digithr/ModuleScope";
import { WorkTable } from "@/components/digithr/EnterpriseRegister";
import { Native, Chip, StatRow, arLabel, useSources, SourceNotice, DateRange } from "./shared";
import { plansOn, staffingFacts, type StaffingFact } from "@/plugins/digit_hr/staffingFacts";
import { ScenarioPanel } from "./ScenarioPanel";

const DT = ["Employee", "Staffing Plan", "Job Opening"];

export function PlanningWorkspace() {
  const { tx } = useTx();
  useStoreVersion(); useSessionUser();
  useScopeMetas(DT);
  const src = useSources(tx);
  const scope = useModuleScope(src);
  const today = new Date().toISOString().slice(0, 10);
  const ready = src.ready(...DT) && scope.companyKnown;
  const plans = scope.filter(src.rows("Staffing Plan"));
  const current = plansOn(plans, today);
  const facts = ready ? staffingFacts(current, src.rows("Employee"), src.rows("Job Opening")) : [];
  const sum = (f: (x: StaffingFact) => number) => facts.reduce((a, x) => a + f(x), 0);
  const meta = cachedMeta("Staffing Plan");
  const canCreate = !!meta && hasPerm(meta, "create");
  const state = (x: StaffingFact) => x.state === "over" ? <Chip tone="danger">{tx("فوق الخطة", "Over plan")}</Chip> : x.state === "gap" ? <Chip tone="warn">{tx("فجوة", "Gap")} <span data-no-i18n>{x.remaining}</span></Chip> : <Chip>{tx("مكتمل", "Met")}</Chip>;

  return (
    <div className="space-y-5" data-planning-workspace>
      <SourceNotice src={src} />
      <ScopeBar scope={scope} tx={tx}>
        <div className="flex flex-wrap gap-2">
          {canCreate && <Native dt="Staffing Plan" name="new" module="06" className="dhr-btn dhr-btn-primary inline-flex min-h-10 items-center">{tx("+ خطة توظيف", "+ Staffing plan")}</Native>}
          <Link to="/digit-hr/m/$module" params={{ module: "06" }} className="dhr-btn inline-flex min-h-10 items-center">{tx("مقارنة الخطط على مستوى الوحدة", "Plan-level comparison")}</Link>
        </div>
      </ScopeBar>
      <StatRow items={[
        { label: tx("خطط سارية اليوم", "Plans in effect today"), value: src.v(<span data-plans-current>{current.length}</span>, "Staffing Plan") },
        { label: tx("المناصب المخططة", "Planned positions"), value: src.v(<span data-planned>{sum((x) => x.planned)}</span>, ...DT) },
        { label: tx("الموظفون الفعليون", "Actual headcount"), value: src.v(<span data-actual>{sum((x) => x.actual.length)}</span>, ...DT) },
        { label: tx("وظائف شاغرة مفتوحة", "Open job openings"), value: src.v(<span data-openings>{sum((x) => x.openings.length)}</span>, ...DT) },
        { label: tx("فجوة غير مغطاة", "Uncovered gap"), value: src.v(<span data-gap>{sum((x) => Math.max(0, x.remaining))}</span>, ...DT), tone: facts.some((x) => x.remaining > 0) ? "warn" : undefined },
      ]} />
      <section className="dhr-card rounded-[14px] p-4" data-staffing-facts={facts.length}>
        <h2 className="font-semibold">{tx("الخطة مقابل الواقع حسب المسمى", "Plan vs actual by designation")}</h2>
        <p className="mb-3 text-xs text-[var(--dhr-muted)]">{tx("المخطط من سطر خطة التوظيف؛ الفعلي = موظفون نشطون بنفس المسمى والشركة؛ الفجوة = المخطط − الفعلي − الشواغر المفتوحة.", "Planned from the staffing plan row; actual = active employees with that designation in the company; gap = planned − actual − open openings.")}</p>
        <WorkTable<StaffingFact> label="staffing-facts" tx={tx} rows={facts} rowKey={(x) => `${x.plan}|${x.designation}`} pageSize={12}
          emptyState={ready ? (current.length ? undefined : <span>{tx("لا توجد خطة توظيف سارية اليوم.", "No staffing plan in effect today.")}</span>) : src.empty(...DT)}
          searchText={(x) => `${x.plan} ${x.designation} ${x.department}`}
          groups={[{ id: "over", ar: "فوق الخطة", en: "Over plan", tone: "danger" }, { id: "gap", ar: "فجوة", en: "Gap", tone: "warn" }, { id: "met", ar: "مكتمل", en: "Met" }]}
          groupOf={(x) => x.state}
          cols={[
            { key: "d", ar: "المسمى", en: "Designation", sort: (x) => x.designation, render: (x) => <span data-no-i18n className="font-medium">{tx(arLabel(x.designation), x.designation)}</span> },
            { key: "p", ar: "الخطة", en: "Plan", render: (x) => <Native dt="Staffing Plan" name={x.plan} module="06" className="text-xs hover:underline"><span data-no-i18n>{x.plan}<DateRange className="block text-[var(--dhr-muted)]" from={x.from} to={x.to} /></span></Native> },
            { key: "pl", ar: "المخطط", en: "Planned", sort: (x) => x.planned, render: (x) => <span data-no-i18n className="tabular-nums">{x.planned}</span> },
            { key: "a", ar: "الفعلي", en: "Actual", sort: (x) => x.actual.length, render: (x) => x.actual.length ? <Native dt="Employee" module="06" filters={[["name", "in", x.actual]]} className="tabular-nums hover:underline"><span data-no-i18n data-actual-count={x.designation}>{x.actual.length}</span></Native> : <span data-no-i18n>0</span> },
            { key: "o", ar: "شواغر مفتوحة", en: "Open openings", sort: (x) => x.openings.length, render: (x) => x.openings.length ? <Native dt="Job Opening" module="06" filters={[["name", "in", x.openings]]} className="tabular-nums hover:underline"><span data-no-i18n>{x.openings.length}</span></Native> : <span data-no-i18n>0</span> },
            { key: "s", ar: "الحالة", en: "State", sort: (x) => x.remaining, render: (x) => <span data-staffing-state={x.designation}>{state(x)}</span> },
          ]} />
        <p className="mt-2 text-[11px] text-[var(--dhr-muted)]">{tx("ملاحظة: يحتسب المصدر الشركات التابعة أيضًا؛ هنا تُحتسب الشركة نفسها فقط.", "Note: the source also counts subsidiary companies; this view counts the plan company only.")}</p>
      </section>
      {ready && <ScenarioPanel key={scope.company || "all"} src={src} company={scope.company} companies={scope.companies} tx={tx} />}
    </div>
  );
}
