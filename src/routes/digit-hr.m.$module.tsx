import { createFileRoute, notFound, useNavigate } from "@tanstack/react-router";
import { DigitHrLayout, useTx } from "@/components/digithr/DigitHrLayout";
import { useStoreVersion } from "@/lib/adapter";
import { useSessionUser } from "@/plugins/digit_hr/compat/session";
import { MODULES } from "@/plugins/digit_hr/v5/data";
import { OrgWorkspace } from "@/components/digithr/workspaces/OrgWorkspace";
import { TalentWorkspace } from "@/components/digithr/workspaces/TalentWorkspace";
import { WorkforceWorkspace } from "@/components/digithr/workspaces/WorkforceWorkspace";
import { PayrollWorkspace } from "@/components/digithr/workspaces/PayrollWorkspace";
import { ExperienceWorkspace } from "@/components/digithr/workspaces/ExperienceWorkspace";
import { IntelligenceWorkspace } from "@/components/digithr/workspaces/IntelligenceWorkspace";
import { GovernanceWorkspace } from "@/components/digithr/workspaces/GovernanceWorkspace";
import { ExperienceBlocks } from "@/components/experience/ExperienceBlocks";
import { HrTabs } from "@/components/digithr/home/kit";
import { BandTabsHost } from "@/components/enterprise/kit/templates";
import { OverviewFrame, SectionHeroChips } from "@/components/digithr/product/OverviewFrame";
import { deptSpec } from "@/plugins/digit_hr/product/overview";

type View = "overview" | "room";
type Search = { view?: "room" | undefined; co?: string | undefined };
const str = (v: unknown) => (typeof v === "string" && v ? v : undefined);

export const Route = createFileRoute("/digit-hr/m/$module")({
  validateSearch: (s: Record<string, unknown>): Search => ({ view: s["view"] === "room" ? "room" : undefined, co: str(s["co"]) }),
  loader: ({ params }) => { if (!MODULES.some((m) => m.id === params.module)) throw notFound(); return null; },
  head: ({ params }) => {
    const m = MODULES.find((x) => x.id === params.module);
    const t = m ? `DIGIT HR — ${m.en}` : "DIGIT HR — Module";
    return { meta: [{ title: t }, { name: "description", content: m ? `${m.home}: ${m.composition}` : "DIGIT HR module" }, { property: "og:title", content: t }, { property: "og:description", content: m?.composition ?? "DIGIT HR module" }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] };
  },
  component: ModuleHome,
});

const WORKSPACES: Record<string, (p: { home?: boolean }) => React.ReactElement> = {
  "01": OrgWorkspace,
  "02": TalentWorkspace,
  "03": WorkforceWorkspace,
  "04": PayrollWorkspace,
  "05": ExperienceWorkspace,
  "06": IntelligenceWorkspace,
  "07": GovernanceWorkspace,
};

/**
 * Department home (owner brief 2026-11-15 §2): the department overview — the department's own charts, its key figures,
 * what changed and the decisions waiting, drawn on the shared Dashboard Designer — and, one tab away, the department's
 * earlier control room kept unchanged (its own command header), so nothing that worked before is lost.
 */
function ModuleHome() {
  useStoreVersion(); useSessionUser();
  const { module } = Route.useParams(); const search = Route.useSearch(); const navigate = useNavigate();
  const { tx, lang } = useTx(); const ar = lang === "ar";
  const m = MODULES.find((x) => x.id === module)!;
  const Workspace = WORKSPACES[module] ?? OrgWorkspace;
  const spec = deptSpec(module);
  const view: View = search.view === "room" || !spec ? "room" : "overview";
  const go = (patch: Partial<Search>) => void navigate({ to: "/digit-hr/m/$module", params: { module }, search: { ...search, ...patch }, replace: true });
  const tabs = spec ? <HrTabs<View> idBase="dhr-dept" label={tx("محتوى الإدارة", "Department content")} value={view} onChange={(v) => go({ view: v === "room" ? "room" : undefined })}
    tabs={[{ id: "overview", label: tx("نظرة عامة على الإدارة", "Department overview") }, { id: "room", label: tx(m.ar.includes("الرواتب") ? "غرفة تحكم الرواتب" : "غرفة التحكم", m.en.startsWith("Payroll") ? "Payroll control room" : "Control room") }]} /> : null;
  return (
    <BandTabsHost tabs={tabs}>
      {view === "room" || !spec ? (
        <DigitHrLayout headless title={tx(m.ar, m.en)} crumbs={[{ label: tx(m.ar, m.en) }]}>
          <Workspace home />
          <ExperienceBlocks app="digit_hr" screen={`digit_hr.module.${module}`} />
        </DigitHrLayout>
      ) : (
        <DigitHrLayout title={tx(m.ar, m.en)} crumbs={[{ label: tx(m.ar, m.en) }]} chips={<SectionHeroChips spec={spec} ar={ar} company={search.co} />} subtitle={tx("أرقام الإدارة ورسومها وما تغير والقرارات المنتظرة — كل رقم يفتح السجلات التي يجمعها.", "The department's figures, charts, what changed and the decisions waiting — every figure opens the records it adds up.")}>
          <OverviewFrame dashKey={`dept-${module}`} title={[m.en, m.ar]} spec={spec} ar={ar} company={search.co} onCompany={(c) => go({ co: c })} />
          <ExperienceBlocks app="digit_hr" screen={`digit_hr.module.${module}`} />
        </DigitHrLayout>
      )}
    </BandTabsHost>
  );
}
