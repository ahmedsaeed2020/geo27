/**
 * Navigation V2 group workspaces (modules/<key>) and the two separate experiences: the technician workspace (field,
 * N53–N58) and the staff-only customer portal preview hub (portal, P01–P08). Every list here is derived from the ONE
 * screen registry (screens.ts) and the shared queues; the workspace switcher only changes ORDER and EMPHASIS — every
 * screen of the group stays listed, so nothing becomes unreachable in any mode.
 */
import { PortalHubPage as PortalPreviewPage } from "./portalPreview";
import { OfflineBand } from "./fieldJourney";
import { sessionTechnician } from "../domain/field";
import type { PluginPageProps } from "@/plugins/pages";
import { DirectoryGroups, type DirItem } from "@/components/digit/Experience";
import { canRead, list } from "../domain/data";
import { FSM_DOCTYPES } from "../schema";
import { FSM_CROSS_LINKS, FSM_EXPERIENCES, FSM_MODULES, FSM_SCREENS, REPORT_AREAS, groupScreens, screenById, screenMode, type FsmScreen, type WorkspaceMode } from "../screens";
import { FSM_REPORTS } from "../domain/reports";
import { QUEUES } from "./queues";
import { WorklistTabs } from "./home";
import { MODE_HINT, MODE_LABEL, useWorkspaceMode } from "./mode";
import { AppLink, BAND, DocRef, DxState, ListRef, PageHeader, numTxt, useFx } from "./kit";

/** Earlier 14-module directory keys keep working (bookmarks): they open the Navigation V2 group that now owns them. */
export const LEGACY_GROUP: Record<string, string> = { intake: "cr", agr: "cr", disp: "ops", parts: "bill", comm: "bill", msg: "set", anl: "rpt", cfg: "set" };
/** Per group: worklists shown first in each workspace mode, and the reports that prove the group's numbers. */
const WS: Record<string, { lists: Record<WorkspaceMode, string[]>; reports: string[] }> = {
  HOME: { lists: { field: ["unscheduled", "overdue"], itm: ["critical", "review"], all: ["critical", "overdue"] }, reports: ["RP09", "RP05", "RP17"] },
  PORT: { lists: { field: ["site-contacts", "asset-changes"], itm: ["asset-changes", "site-contacts"], all: ["asset-changes", "site-contacts"] }, reports: ["RP01", "RP02", "RP16"] },
  CR: { lists: { field: ["requests", "due"], itm: ["to-quote", "decisions"], all: ["requests", "due"] }, reports: ["RP08", "RP09", "RP11", "RP12", "RP15"] },
  OPS: { lists: { field: ["unscheduled", "blocked"], itm: ["workpacks", "unscheduled"], all: ["unscheduled", "blocked"] }, reports: ["RP09", "RP10", "RP11", "RP16"] },
  ITM: { lists: { field: ["evidence", "review"], itm: ["review", "evidence"], all: ["review", "evidence"] }, reports: ["RP02", "RP03", "RP04", "RP17"] },
  DEF: { lists: { field: ["corrective", "retests"], itm: ["critical", "closure"], all: ["critical", "closure"] }, reports: ["RP05", "RP06", "RP07"] },
  BILL: { lists: { field: ["invoice-ready", "handoffs"], itm: ["invoice-ready", "handoffs"], all: ["invoice-ready", "handoffs"] }, reports: ["RP13", "RP14", "RP19", "RP15"] },
  RPT: { lists: { field: [], itm: [], all: [] }, reports: FSM_REPORTS.map((r) => r.id) },
  SET: { lists: { field: ["exceptions", "certifications"], itm: ["templates", "exceptions"], all: ["templates", "exceptions"] }, reports: ["RP18", "RP20"] },
};
const reportMode = (id: string): "field" | "itm" | "both" => { const n = Number(id.slice(2)); return n <= 7 || n === 17 ? "itm" : n === 18 || n === 20 ? "both" : "field"; };
const AREA_ORDER: Record<WorkspaceMode, string[]> = { field: ["ops", "contracts", "finance", "itm", "safety", "server"], itm: ["itm", "safety", "contracts", "ops", "finance", "server"], all: REPORT_AREAS.map((a) => a.key) };

function useItems() {
  const { ar } = useFx();
  const screen = (sc: FsmScreen): DirItem => {
    const label = ar ? sc.label_ar : sc.label; const meta = <span data-no-i18n>{sc.id}</span>;
    if (sc.to.startsWith("doctype:")) {
      const dt = sc.to.slice(8); const single = FSM_DOCTYPES.find((d) => d.name === dt)?.issingle;
      if (single) return { key: sc.id, label, meta, node: (cls, inner) => <DocRef doctype={dt} name={dt} form className={cls}>{inner}</DocRef> };
      return { key: sc.id, label, meta, count: canRead(dt) ? list(dt).length : undefined, node: (cls, inner) => <ListRef doctype={dt} className={cls}>{inner}</ListRef> };
    }
    return { key: sc.id, label, meta, node: (cls, inner) => <AppLink to={sc.to} className={cls}>{inner}</AppLink> };
  };
  const report = (id: string): DirItem => { const r = FSM_REPORTS.find((x) => x.id === id)!; return { key: id, label: ar ? r.title_ar : r.title, meta: <span data-no-i18n>{id}</span>, node: (cls, inner) => <AppLink to={`reports/${id}`} className={cls}>{inner}</AppLink> }; };
  return { screen, report };
}

export function GroupWorkspacePage({ params }: PluginPageProps) {
  const fx = useFx(); const { t, ar } = fx; const mode = useWorkspaceMode(); const { screen, report } = useItems();
  const raw = String(params["key"] ?? "").toLowerCase();
  if (raw === "field") return <FieldHubPage />;
  if (raw === "portal") return <PortalHubPage />;
  const key = (LEGACY_GROUP[raw] ?? raw).toUpperCase();
  const m = FSM_MODULES.find((x) => x.key === key);
  if (!m) return <DxState kind="empty" title={t("Unknown group", "مجموعة غير معروفة")} detail={<span data-no-i18n>{raw}</span>} action={<AppLink to="">{t("Back to My work", "العودة إلى عملي")}</AppLink>} />;
  const ws = WS[m.key]!; const name = ar ? m.label_ar : m.label;
  const own = groupScreens(m.key); const cross = (FSM_CROSS_LINKS[m.key] ?? []).map((id) => screenById(id)!).filter(Boolean);
  const focus = (sc: FsmScreen) => mode === "all" || screenMode(sc.id) === mode || screenMode(sc.id) === "both";
  const lists = ws.lists[mode].filter((k) => QUEUES.some((q) => q.key === k));
  const reports = mode === "all" ? ws.reports : [...ws.reports].sort((a, b) => Number(reportMode(b) === mode) - Number(reportMode(a) === mode));
  const modeName = ar ? MODE_LABEL[mode][1] : MODE_LABEL[mode][0];
  const groups = m.key === "RPT"
    ? AREA_ORDER[mode].map((k) => REPORT_AREAS.find((a) => a.key === k)!).map((a) => ({ key: a.key, title: ar ? a.label_ar : a.label, items: a.reports.map(report) }))
      .concat([{ key: "pages", title: t("Catalogue", "الدليل"), items: own.map(screen) }])
    : mode === "all"
      ? [
        { key: "pages", title: t("Workspaces & queues", "المساحات والطوابير"), items: own.filter((x) => !x.to.startsWith("doctype:") && !x.to.startsWith("reports/")).map(screen) },
        { key: "docs", title: t("Documents", "المستندات"), items: own.filter((x) => x.to.startsWith("doctype:")).map(screen) },
        { key: "rp", title: t("Report views", "عروض التقارير"), items: own.filter((x) => x.to.startsWith("reports/")).map(screen) },
      ]
      : [
        { key: "focus", title: t(`For ${modeName}`, `ضمن مساحة ${modeName}`), items: own.filter(focus).map(screen) },
        { key: "other", title: t("Also in this group", "أيضاً في هذه المجموعة"), items: own.filter((x) => !focus(x)).map(screen) },
      ];
  const extra = [
    ...(m.key === "HOME" ? [{ key: "exp", title: t("Separate experiences", "تجارب منفصلة"), items: FSM_EXPERIENCES.map((x): DirItem => ({ key: x.key, label: ar ? x.label_ar : x.label, node: (cls, inner) => <AppLink to={x.to} className={cls}>{inner}</AppLink> })) }] : []),
    ...(cross.length ? [{ key: "related", title: t("Related in other groups", "ذات صلة في مجموعات أخرى"), items: cross.map(screen) }] : []),
    ...(m.key !== "RPT" ? [{ key: "reports", title: t("Reports for this group", "تقارير هذه المجموعة"), items: reports.map(report) }] : []),
  ];
  const total = own.length + cross.length;
  const first = own.find((x) => x.featured && focus(x) && !x.to.startsWith("doctype:"));
  return (
    <div className="w-full min-w-0" data-page="fsm-group-workspace" data-module-directory={m.key} data-group={m.key} data-mode={mode}>
      <PageHeader title={name} band={{
        question: ar ? m.question_ar : m.question,
        basis: <>{t("Every screen of this group is listed below; the workspace switcher only changes what comes first.", "كل شاشات هذه المجموعة مدرجة أدناه؛ مبدّل مساحة العمل يغيّر ما يظهر أولاً فقط.")} {ar ? MODE_HINT[mode][1] : MODE_HINT[mode][0]}</>,
        meta: [{ label: t("Workspace", "مساحة العمل"), value: modeName }, { label: t("Screens", "الشاشات"), value: <span data-no-i18n>{numTxt(total)}</span> }, { label: t("Reports", "التقارير"), value: <span data-no-i18n>{numTxt(m.key === "RPT" ? FSM_REPORTS.length : reports.length)}</span> }],
        ...(first ? { actions: <AppLink to={first.to} className={BAND.primary}>{ar ? first.label_ar : first.label}</AppLink> } : {}),
      }} />
      {lists.length > 0 && <div data-group-worklists><WorklistTabs defs={lists.map((k) => QUEUES.find((q) => q.key === k)!).filter(Boolean)} fx={fx} /></div>}
      <DirectoryGroups groups={[...groups, ...extra]} />
      <p className="mt-2 text-xs text-muted-foreground">{t("Records stay on the shared DIGIT data; nothing here is a copy. Screen IDs follow the build kit (N01–N88, P01–P08).", "السجلات تبقى على بيانات DIGIT المشتركة؛ لا شيء هنا نسخة. أرقام الشاشات وفق حزمة البناء (N01–N88، P01–P08).")}</p>
    </div>
  );
}

/** Technician workspace (N53–N58): the field experience, separate from the office groups. */
export function FieldHubPage() {
  const fx = useFx(); const { t, ar } = fx; const { screen } = useItems();
  const field = FSM_SCREENS.filter((x) => x.module === "FIELD");
  const lists = ["my-visits", "my-inspections", "my-repairs", "workpacks"].filter((k) => QUEUES.some((q) => q.key === k));
  return (
    <div className="w-full min-w-0" data-page="fsm-field-hub">
      <PageHeader title={t("Technician workspace", "مساحة الفني الميدانية")} band={{
        question: t("What is my field work today, and is everything ready before I go?", "ما عملي الميداني اليوم، وهل كل شيء جاهز قبل أن أذهب؟"),
        basis: t("Visits, inspections, repairs and retests assigned to the technician linked to your user; office users without a technician record see every technician's work. «My day» walks each visit in short steps and can work offline (N57).", "الزيارات والفحوص والإصلاحات وإعادات الفحص المسندة للفني المرتبط بمستخدمك؛ مستخدمو المكتب بلا سجل فني يرون عمل كل الفنيين. «يومي» يمر بكل زيارة بخطوات قصيرة ويعمل دون اتصال (N57)."),
        meta: [{ label: t("Screens", "الشاشات"), value: <span data-no-i18n>N53–N58</span> }],
        actions: <><AppLink to="field/day" className={BAND.primary}>{t("My day", "يومي")}</AppLink><AppLink to="my/visits" className={BAND.secondary}>{t("My visits", "زياراتي")}</AppLink><AppLink to="field/offline" className={BAND.secondary}>{t("Offline queue", "طابور دون اتصال")}</AppLink></>,
      }} />
      <OfflineBand tech={sessionTechnician()?.name ?? ""} />
      <WorklistTabs defs={lists.map((k) => QUEUES.find((q) => q.key === k)!).filter(Boolean)} fx={fx} />
      <DirectoryGroups groups={[{ key: "field", title: t("Technician screens", "شاشات الفني"), items: field.map(screen) }]} />
      <p className="mt-2 text-xs text-muted-foreground">{ar ? "تُفتح السجلات في نماذجها الأصلية؛ لا نسخة منفصلة للفني." : "Records open in their canonical forms; the technician never works on a separate copy."}</p>
    </div>
  );
}

/** Customer portal preview hub (P01–P08): customer-scoped by FSM Portal Grant (ui/portalPreview.tsx). */
export function PortalHubPage() { return <PortalPreviewPage />; }
