import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { DigitHrLayout, useTx } from "@/components/digithr/DigitHrLayout";
import { useStoreVersion } from "@/lib/adapter";
import { useSessionUser } from "@/plugins/digit_hr/compat/session";
import { MODULES, SECTIONS, REPORTS, SCREENS } from "@/plugins/digit_hr/v5/data";
import { SUITES } from "@/plugins/digit_hr/service";
import NATIVE from "@/plugins/digit_hr/nativeMap";
import { ActionsTab, RelationsTab } from "@/components/digithr/SectionTabs";
import { CaptureImport } from "@/components/digithr/CaptureImport";
import { OrgWorkspace } from "@/components/digithr/workspaces/OrgWorkspace";
import { CandidateRegister } from "@/components/digithr/workspaces/TalentWorkspace";
import { WorkforceWorkspace } from "@/components/digithr/workspaces/WorkforceWorkspace";
import { PayrollWorkspace } from "@/components/digithr/workspaces/PayrollWorkspace";
import { ExperienceWorkspace } from "@/components/digithr/workspaces/ExperienceWorkspace";
import { GovernanceWorkspace } from "@/components/digithr/workspaces/GovernanceWorkspace";
import { PerformanceWorkspace, LearningWorkspace } from "@/components/digithr/workspaces/DevelopmentWorkspace";
import { JobArchitectureWorkspace, ContractsWorkspace, OnboardingWorkspace, PositionsWorkspace, MovementsWorkspace } from "@/components/digithr/workspaces/LifecycleWorkspace";
import { HR_PAGES, HR_REPORT_LINKS } from "@/components/digithr/navigation";
import { HrTabs } from "@/components/digithr/home/kit";
import { BandTabsHost } from "@/components/enterprise/kit/templates";
import { SECTION_PURPOSE, fitLabels, waveLabel } from "@/components/digithr/sectionContext";
import { ServiceWorkspace } from "@/components/digithr/workspaces/ServiceWorkspace";
import { TemplatesWorkspace } from "@/components/digithr/workspaces/TemplatesWorkspace";
import { JobsWorkspace } from "@/components/digithr/workspaces/JobsWorkspace";
import { PrivacyWorkspace } from "@/components/digithr/workspaces/PrivacyWorkspace";
import { LeaveWorkspace } from "@/components/digithr/workspaces/LeaveWorkspace";
import { EmployeeMasterWorkspace } from "@/components/digithr/workspaces/EmployeeMasterWorkspace";
import { ExpensesWorkspace } from "@/components/digithr/workspaces/ExpensesWorkspace";
import { CompensationWorkspace } from "@/components/digithr/workspaces/CompensationWorkspace";
import { PlanningWorkspace } from "@/components/digithr/workspaces/PlanningWorkspace";
import { SuccessionWorkspace } from "@/components/digithr/workspaces/SuccessionWorkspace";
import { CommandCenterWorkspace } from "@/components/digithr/workspaces/CommandCenterWorkspace";
import { AnalyticsWorkspace } from "@/components/digithr/workspaces/AnalyticsWorkspace";
import { DevOnly } from "@/components/DevOnly";
import { OverviewFrame, SectionHeroChips } from "@/components/digithr/product/OverviewFrame";
import { SectionHub } from "@/components/digithr/product/SectionHub";
import { SectionReports } from "@/components/digithr/product/SectionReports";
import { PayrollCycle } from "@/components/digithr/product/PayrollCycle";
import { SectionTools } from "@/components/digithr/product/SectionTools";
import { sectionSpec } from "@/plugins/digit_hr/product/overview";
import { reportsOfSection } from "@/plugins/digit_hr/product/reports";
import { DHPS } from "@/plugins/digit_hr/product/settings";

const TABS = ["overview", "documents", "reports"] as const;
type Tab = (typeof TABS)[number];
/** Earlier tab keys open the tab that now holds their content (actions / relationships → documents & work, planned → full reports). */
const LEGACY_TAB: Record<string, Tab> = { actions: "documents", relations: "documents", planned: "reports" };
type Search = { tab?: Tab | undefined; on?: string | undefined; co?: string | undefined; rpt?: string | undefined; hub_dt?: string | undefined; hub_q?: string | undefined; hub_st?: string | undefined; hub_doc?: string | undefined; hub_v?: string | undefined; hub_g?: string | undefined; tool?: string | undefined };
const str = (v: unknown) => (typeof v === "string" && v ? v : undefined);

export const Route = createFileRoute("/digit-hr/s/$section")({
  validateSearch: (s: Record<string, unknown>): Search => {
    const raw = str(s["tab"]); const tab = raw && (TABS as readonly string[]).includes(raw) ? (raw as Tab) : raw ? LEGACY_TAB[raw] : undefined;
    return { tab: tab === "overview" ? undefined : tab, on: typeof s["on"] === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s["on"]) ? s["on"] : undefined,
      co: str(s["co"]), rpt: str(s["rpt"]), hub_dt: str(s["hub_dt"]), hub_q: str(s["hub_q"]), hub_st: str(s["hub_st"]), hub_doc: str(s["hub_doc"]), hub_v: str(s["hub_v"]), hub_g: str(s["hub_g"]), tool: str(s["tool"]) };
  },
  loader: ({ params }) => { if (!SECTIONS.some((s) => s.id === params.section)) throw notFound(); return null; },
  head: ({ params }) => {
    const s = SECTIONS.find((x) => x.id === params.section);
    const t = s ? `DIGIT HR — ${s.en}` : "DIGIT HR — Section";
    return { meta: [{ title: t }, { name: "description", content: s ? `${s.en}: overview, documents and work, and full reports.` : "DIGIT HR section" }, { property: "og:title", content: t }, { property: "og:description", content: s ? `${s.en} — DIGIT HR section workspace` : "DIGIT HR section workspace" }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] };
  },
  component: SectionWorkspace,
});

/** The section's own working surface (kept from the earlier HR screens), shown first under Documents & work. */
function WorkSurface({ id }: { id: string }) {
  switch (id) {
    case "01.1": return <OrgWorkspace />; case "01.2": return <JobArchitectureWorkspace />; case "01.3": return <PositionsWorkspace />; case "01.4": return <EmployeeMasterWorkspace />; case "01.5": return <MovementsWorkspace />; case "01.6": return <ContractsWorkspace />;
    case "02.1": return <CandidateRegister />; case "02.2": return <OnboardingWorkspace />; case "02.3": return <PerformanceWorkspace />; case "02.4": return <LearningWorkspace />; case "02.5": return <SuccessionWorkspace />;
    case "03.1": return <LeaveWorkspace />; case "03.2": return <WorkforceWorkspace mode="attendance" />; case "03.3": return <WorkforceWorkspace mode="shifts" />;
    case "04.1": return <PayrollWorkspace />; case "04.4": return <CompensationWorkspace />; case "04.5": return <ExpensesWorkspace />;
    case "05.1": case "05.2": return <ExperienceWorkspace />; case "05.3": return <ServiceWorkspace />;
    case "06.1": return <CommandCenterWorkspace />; case "06.2": return <PlanningWorkspace />; case "06.3": return <AnalyticsWorkspace />;
    case "07.1": return <GovernanceWorkspace />; case "07.2": return <PrivacyWorkspace />; case "07.3": return <TemplatesWorkspace />; case "07.4": return <JobsWorkspace />;
    default: return null;
  }
}

/**
 * Section workspace — exactly three in-content tabs under the shared band (owner brief 2026-11-15, as Pro and
 * Construction): Overview (4-layer overview on the Core Dashboard Designer), Documents & work (the section's working
 * surface, the payroll cycle on 04.1, then the Core Document Hub over its native documents with actions and
 * relationships), Full reports (HR report library + native reports with an inline preview). State lives in the URL.
 */
function SectionWorkspace() {
  useStoreVersion(); useSessionUser();
  const { section } = Route.useParams(); const { tx, lang } = useTx(); const ar = lang === "ar";
  const search = Route.useSearch(); const navigate = Route.useNavigate();
  const tab: Tab = search.tab ?? "overview";
  const go = (patch: Record<string, string | undefined>) => void navigate({ search: (prev) => Object.fromEntries(Object.entries({ ...prev, ...patch }).filter(([, v]) => v !== undefined && v !== "")) as Search, replace: !("tab" in patch), resetScroll: "tab" in patch });
  const setTab = (k: string) => go({ tab: k === "overview" ? undefined : k, ...(k !== "documents" ? { tool: undefined, hub_dt: undefined, hub_q: undefined, hub_st: undefined, hub_doc: undefined, hub_v: undefined, hub_g: undefined } : {}) });
  const s = SECTIONS.find((x) => x.id === section);
  if (!s) throw notFound();
  const m = MODULES.find((x) => x.id === s.module);
  if (!m) throw notFound();
  const docs = NATIVE[s.id] ?? []; const docSet = new Set(docs.map((d) => d.doctype));
  const native = REPORTS.filter((r) => HR_REPORT_LINKS.find((x) => x.id === r.id)?.section === s.id || docSet.has(r.ref) || (r.modules.includes(s.module) && docs.length === 0)).map((r) => ({ id: r.id, report: r.report, ref: r.ref }));
  const scr = SCREENS.filter((x) => x.sub === s.ar);
  const live = SUITES.flatMap((x) => x.subs).find((x) => x.id === s.id)?.to;
  const related = HR_PAGES.filter((p) => p.section === s.id && p.to !== live);
  const purpose = SECTION_PURPOSE[s.id];
  const spec = sectionSpec(s.id);
  const label: Record<Tab, string> = { overview: tx("نظرة عامة", "Overview"), documents: tx("المستندات والعمل", "Documents & work"), reports: tx("التقارير الكاملة", "Full reports") };
  const counts: Partial<Record<Tab, number>> = { documents: docs.length, reports: reportsOfSection(s.id).length + native.length };
  const context = (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2" data-section-context={s.id}>
      <Link to="/digit-hr/m/$module" params={{ module: m.id }} className="dhr-back" data-section-back={m.id}>
        <ChevronRight className="hidden h-4 w-4 rtl:block" aria-hidden /><ChevronLeft className="h-4 w-4 rtl:hidden" aria-hidden />{tx(`العودة إلى ${m.ar}`, `Back to ${m.en}`)}
      </Link>
      {related.length > 0 && <nav className="dhr-related" aria-label={tx("صفحات القسم", "Section pages")} data-section-pages={s.id}>
        <span className="text-[12px] text-[var(--dhr-muted)]">{tx("صفحات القسم:", "Section pages:")}</span>
        {related.map((p) => <Link key={p.to} to={p.to as "/digit-hr"} data-section-page={p.to}>{tx(p.ar, p.en)}</Link>)}
      </nav>}
    </div>
  );
  return (
    // ONE STANDARD R2: the section tabs sit directly under the shared band; the back link and section pages follow in the card below
    <BandTabsHost tabs={<HrTabs<Tab> idBase="dhr-sec" label={tx("محتوى القسم", "Section content")} value={tab} onChange={setTab} tabs={TABS.map((k) => ({ id: k, label: label[k], ...(counts[k] !== undefined ? { count: counts[k] } : {}) }))} />}>
    <DigitHrLayout title={tx(s.ar, s.en)} subtitle={purpose ? tx(...purpose) : undefined}
      crumbs={[{ label: tx(m.ar, m.en) }, { label: tx(s.ar, s.en) }]} band={context} chips={<SectionHeroChips spec={spec} ar={ar} company={search.co} />}
      actions={live ? <Link to={live as "/digit-hr"} className="dhr-btn dhr-btn-primary">{tx("فتح واجهة ديجيت", "Open DIGIT workspace")}</Link> : undefined}>
      <div role="tabpanel" id="dhr-sec-panel" aria-labelledby={`dhr-sec-tab-${tab}`} className="min-w-0" data-section-tab={tab}>
        {tab === "overview" && (spec
          ? <OverviewFrame dashKey={s.id} title={[s.en, s.ar]} spec={spec} ar={ar} company={search.co} onCompany={(c) => go({ co: c })} />
          : <p className="dhr-empty">{tx("لا توجد نظرة عامة لهذا القسم.", "This section has no overview.")}</p>)}
        {tab === "documents" && <div className="space-y-5" data-section-documents={s.id}>
          {s.id === "04.1" && <PayrollCycle ar={ar} company={search.co} />}
          {s.id === "03.4" && <CaptureImport tx={tx} />}
          <div data-section-primary={s.id}><WorkSurface id={s.id} /></div>
          <SectionTools section={s.id} ar={ar} tool={search.tool} onTool={(id) => go({ tool: id })} />
          <SectionHub section={s.id} ar={ar} search={search} go={go} company={search.co} extraDoctypes={s.id === "07.1" ? [DHPS, "DIGIT Saudi Rule Set"] : []} />
          <details className="dhr-panel" data-section-actions={s.id}>
            <summary className="dhr-panel-h cursor-pointer"><span className="dhr-panel-t">{tx("الإجراءات والعلاقات", "Actions and relationships")}</span></summary>
            <div className="dhr-panel-b space-y-4"><ActionsTab docs={docs} section={s.id} tx={tx} /><RelationsTab docs={docs} section={s.id} tx={tx} /></div>
          </details>
        </div>}
        {tab === "reports" && <>
          <SectionReports section={s.id} ar={ar} native={native} rpt={search.rpt} onRpt={(r) => go({ rpt: r })} />
          <DevOnly>
            <section className="dhr-panel mt-5" data-section-planned={s.id}>
              <div className="dhr-panel-h"><div className="min-w-0"><h2 className="dhr-panel-t">{tx("الشاشات المخططة", "Planned screens")}</h2><div className="dhr-panel-m">{tx("شاشات سجل المتطلبات (98) لهذا القسم وتصنيف الملاءمة.", "Requirement-register screens (of 98) for this section with their fit-gap classification.")}</div></div></div>
              <div className="overflow-x-auto"><table className="w-full min-w-[640px]">
                <thead><tr><th>{tx("المعرّف", "ID")}</th><th>{tx("الشاشة", "Screen")}</th><th>{tx("الموجة", "Wave")}</th><th>{tx("التصنيف", "Fit-gap")}</th></tr></thead>
                <tbody>{scr.map((x) => (
                  <tr key={x.id} className="border-t" data-screen={x.id}>
                    <td className="whitespace-nowrap"><span className="dhr-code" data-no-i18n>{x.id}</span></td><td>{tx(x.ar, x.en)}</td>
                    <td className="whitespace-nowrap" title={x.wave}>{waveLabel(x.wave, tx)}</td>
                    <td><span className="flex flex-wrap gap-1">{fitLabels(x.fit, tx).map((f) => <span key={f.code} className="dhr-pill" title={f.code} data-fit={f.code}>{f.label}</span>)}</span></td>
                  </tr>))}</tbody>
              </table></div>
            </section>
          </DevOnly>
        </>}
      </div>
    </DigitHrLayout>
    </BandTabsHost>
  );
}
