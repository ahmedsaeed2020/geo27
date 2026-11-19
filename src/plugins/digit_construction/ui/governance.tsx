/**
 * FIN-06 Reporting governance & audit (Run 6, read-only). Report register, source availability with raw latest change,
 * the stored permission matrix of the construction roles, an on-demand live run of every report for the session user,
 * and the change log of governance records. Freshness thresholds, field masking and export policy are not set here:
 * they wait on the owner's report-governance decision. Tab lives in the URL so Back restores it.
 */
import { BandTabsHost } from "@/components/enterprise/kit/templates";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useState } from "react";
import { cachedMeta } from "@/lib/catalog";
import { translateTo } from "@/i18n";
import { useScopeMetas } from "@/lib/scope";
import { useSessionUser } from "@/lib/session";
import type { PluginPageProps } from "@/plugins/pages";
import { AUDITED_DOCTYPES, GOVERNANCE_ROLES, auditTrail, liveCheck, permissionCell, reportRegister, sourceAvailability, type AuditEntry, type LiveCheck, type ReportEntry, type SourceInfo } from "../domain/governance";
import { CONSTRUCTION_NAV } from "../index";
import { DOCTYPE_AR } from "../schema";
import { isFrappeHost } from "../domain/host";
import { ROLE_AR } from "./layoutEditor";
import { AppLink, BAND, BTN, DataTable, DocRef, Kpi, KpiGrid, ListRef, Note, PageHeader, Section, useCx, type Col } from "./kit";
import { REPORT_DEPT, reportLink, reportTitle } from "./reports";

const APP = "digit_construction";
type View = "reports" | "sources" | "permissions" | "audit";
const VIEWS: View[] = ["reports", "sources", "permissions", "audit"];
const CHECK_TONE: Record<LiveCheck["status"], string> = { OK: "bg-success/15 text-success", EMPTY: "bg-muted text-muted-foreground", DENIED: "bg-warning/15 text-warning", ERROR: "bg-destructive/10 text-destructive" };
const CHECK_AR: Record<LiveCheck["status"], string> = { OK: "يعمل", EMPTY: "يعمل بلا صفوف", DENIED: "غير مسموح", ERROR: "خطأ" };
const stamp = (v: string | null) => (v ? v.replace("T", " ").slice(0, 16) : "—");

export function GovernancePage(_: PluginPageProps) {
  const { t, ar } = useCx();
  const user = useSessionUser();
  const register = reportRegister(user);
  const allSources = [...new Set(register.flatMap((r) => r.sources))];
  useScopeMetas([...allSources, ...AUDITED_DOCTYPES, "Version"]);
  const search = useRouterState({ select: (s) => s.location.search as Record<string, unknown> });
  const nav = useNavigate();
  const view: View = VIEWS.find((v) => v === search["view"]) ?? "reports";
  const set = (p: Record<string, string>) => void nav({ to: "/plugins/$name/$", params: { name: APP, _splat: "governance" }, search: Object.fromEntries(Object.entries({ ...search, ...p }).filter(([, v]) => v)) as never, replace: true });
  const [checks, setChecks] = useState<Record<string, LiveCheck> | null>(null);
  const [checkedAt, setCheckedAt] = useState("");
  const sources = sourceAvailability(user);
  const audit = auditTrail(100, user);
  const dtLabel = (dt: string) => (ar ? DOCTYPE_AR[dt] ?? translateTo(dt, "ar") : dt);
  const deptLabel = (k: string | undefined) => { const g = CONSTRUCTION_NAV.find((x) => x.key === k); return g ? (ar ? g.label_ar ?? g.label : g.label) : "—"; };
  const fieldLabel = (dt: string, f: string) => { const l = cachedMeta(dt)?.fields.find((x) => x.fieldname === f)?.label ?? f; return ar ? translateTo(l, "ar") : l; };
  const runAll = () => { const out: Record<string, LiveCheck> = {}; for (const r of register) out[r.name] = liveCheck(r.name); setChecks(out); setCheckedAt(new Date().toISOString()); };
  const counts = checks ? Object.values(checks).reduce((m, c) => ({ ...m, [c.status]: (m[c.status] ?? 0) + 1 }), {} as Record<string, number>) : null;
  const readable = sources.filter((s) => s.readable).length;
  const title = t("Reporting governance & audit", "حوكمة التقارير والتدقيق");

  const colsR: Col<ReportEntry & Record<string, unknown>>[] = [
    { key: "name", label: t("Report", "التقرير"), render: (r) => <AppLink to={reportLink(r.name)}><span data-no-i18n>{reportTitle(r.name, ar)}</span></AppLink> },
    { key: "dept", label: t("Module", "الوحدة"), render: (r) => <span>{REPORT_DEPT[r.name] ? deptLabel(REPORT_DEPT[r.name]![0]) : t("Row-level operational", "تشغيلي على مستوى السطر")}</span> },
    { key: "ref", label: t("Source", "المصدر"), render: (r) => <span data-no-i18n>{dtLabel(r.ref_doctype)}</span> },
    { key: "sources", label: t("Related sources", "مصادر مرتبطة"), render: (r) => <span className="block max-w-[18rem] whitespace-normal text-xs text-muted-foreground" data-no-i18n>{r.sources.slice(1).map(dtLabel).join("، ") || "—"}</span> },
    { key: "project_required", label: t("Needs a project", "يتطلب مشروعًا"), render: (r) => <span>{r.project_required ? t("Yes", "نعم") : t("No", "لا")}</span> },
    { key: "server", label: t("DIGIT server", "الخادم الفعلي"), render: (r) => <span className="text-xs">{r.server === "SCRIPT_REPORT_STUB" ? t("Python port pending", "بانتظار نقله إلى الخادم") : "—"}</span> },
    { key: "check", label: t("Live check", "الفحص الحي"), render: (r) => { const c = checks?.[r.name]; if (!c) return <span className="text-xs text-muted-foreground">{t("not run", "لم يُشغّل")}</span>;
      return <span className="inline-flex flex-col items-start" data-gov-check={c.status}><span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${CHECK_TONE[c.status]}`}>{ar ? CHECK_AR[c.status] : c.status === "EMPTY" ? "Runs, no rows" : c.status === "OK" ? "Runs" : c.status === "DENIED" ? "Not permitted" : "Error"}</span>
        {(c.status === "OK" || c.status === "EMPTY") && <span className="text-[11px] text-muted-foreground"><span data-no-i18n>{c.rows}</span> {t("rows", "صف")} · <span data-no-i18n>{c.ms}</span> {t("ms", "ملّي ث")}</span>}
        {c.error && <span className="text-[11px] text-destructive" data-no-i18n>{c.error}</span>}</span>; } },
  ];
  const colsS: Col<SourceInfo & Record<string, unknown>>[] = [
    { key: "doctype", label: t("Source", "المصدر"), render: (s) => s.readable ? <ListRef doctype={s.doctype}><span data-no-i18n>{dtLabel(s.doctype)}</span></ListRef> : <span data-no-i18n>{dtLabel(s.doctype)}</span> },
    { key: "owned", label: t("Owner", "المالك"), render: (s) => <span className="text-xs">{s.owned ? t("DIGIT Construction", "ديجيت للمقاولات") : t("DIGIT / DIGIT (native)", "النظام الأساسي (أصلي)")}</span> },
    { key: "readable", label: t("You can read", "يحق لك القراءة"), render: (s) => <span className={s.readable ? "text-success" : "text-warning"} data-gov-readable={s.readable ? 1 : 0}>{s.readable ? t("Yes", "نعم") : t("No", "لا")}</span> },
    { key: "records", label: t("Records you can read", "السجلات المتاحة لك"), render: (s) => <span data-no-i18n>{s.records ?? "—"}</span> },
    { key: "latest", label: t("Latest change (raw)", "آخر تغيير (كما هو)"), render: (s) => <span className="text-xs" data-no-i18n>{stamp(s.latest)}{s.latest_by ? ` · ${s.latest_by}` : ""}</span> },
    { key: "reports", label: t("Used by reports", "تستخدمه التقارير"), render: (s) => <span title={s.reports.join(", ")} data-no-i18n>{s.reports.length}</span> },
  ];
  const permRows = allSources.map((dt) => ({ dt }));
  const sectionTabs = (
      <div className="mb-3 flex flex-wrap gap-1 border-b border-border" role="tablist" aria-label={title}>
        {([["reports", "Reports", "التقارير", register.length], ["sources", "Sources & freshness", "المصادر والحداثة", sources.length], ["permissions", "Permission matrix", "مصفوفة الصلاحيات", allSources.length], ["audit", "Audit trail", "سجل التدقيق", audit.length]] as const).map(([k, en, a, n]) => (
          <button key={k} type="button" role="tab" aria-selected={view === k} data-gov-view={k} onClick={() => set({ view: k === "reports" ? "" : k })}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${view === k ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>{ar ? a : en} <span className="ms-1 rounded-full bg-muted px-1.5 text-xs" data-no-i18n>{n}</span></button>))}
      </div>
  );
  return (
    <BandTabsHost tabs={sectionTabs}>
    <div className="w-full min-w-0" data-page="construction-governance">
      <PageHeader title={title} crumbs={[{ label: t("Report centre", "مركز التقارير"), to: "reports" }]}
        subtitle={t("Read-only view of how reports run, which sources they read and who may see them.", "عرض للقراءة فقط لطريقة تشغيل التقارير ومصادرها ومن يحق له رؤيتها.")}
        band={{ question: t("Can every report be run, and who may see its sources?", "هل يمكن تشغيل كل تقرير، ومن يحق له رؤية مصادره؟"),
          basis: t("Reports compute live over the records you may read. Latest changes are raw timestamps: no freshness threshold, field masking or export policy is defined yet.", "تُحتسب التقارير لحظيًا على السجلات التي يحق لك قراءتها. آخر التغييرات تواريخ كما هي: لم تُحدد بعد عتبة حداثة أو إخفاء حقول أو سياسة تصدير."),
          meta: [
            { label: t("Reports", "التقارير"), value: <span data-no-i18n>{register.length}</span> },
            { label: t("Sources", "المصادر"), value: <span data-no-i18n>{sources.length}</span> },
            { label: t("Live check", "الفحص الحي"), value: checkedAt ? <span data-no-i18n>{stamp(checkedAt)}</span> : t("not run", "لم يُشغّل") },
          ],
          actions: <><button type="button" className={BAND.primary} data-gov-run onClick={() => { runAll(); set({ view: "" }); }}>{t("Run live check", "تشغيل الفحص الحي")}</button><AppLink to="reports" className={BAND.secondary}>{t("Report centre", "مركز التقارير")}</AppLink><AppLink to="settings/policies" className={BAND.secondary}>{t("Policy decisions", "قرارات السياسات")}</AppLink></> }} />
      <KpiGrid cols={4}>
        <Kpi label={t("Reports registered", "التقارير المسجلة")} value={String(register.length)} hint={isFrappeHost() ? t("computed in these screens from this site's records", "تُحسب في هذه الشاشات من سجلات هذا الموقع") : t("all run in the Virtual Core", "كلها تعمل في النواة الافتراضية")} anchor="gov-table" />
        <Kpi label={t("Sources you can read", "مصادر يحق لك قراءتها")} value={`${readable} / ${sources.length}`} tone={readable === sources.length ? "good" : "warn"} />
        <Kpi label={t("Live check", "الفحص الحي")} value={counts ? `${(counts["OK"] ?? 0) + (counts["EMPTY"] ?? 0)} / ${register.length}` : "—"} tone={!counts ? "default" : counts["ERROR"] ? "bad" : counts["DENIED"] ? "warn" : "good"}
          hint={counts ? `${t("errors", "أخطاء")} ${counts["ERROR"] ?? 0} · ${t("not permitted", "غير مسموح")} ${counts["DENIED"] ?? 0}` : t("press Run live check", "اضغط تشغيل الفحص الحي")} />
        <Kpi label={t("Audit entries", "قيود التدقيق")} value={String(audit.length)} hint={t("changes to policies, settings, published layouts and print outputs", "تغييرات السياسات والإعدادات واللوحات المنشورة والمخرجات المطبوعة")} />
      </KpiGrid>
      {view === "reports" && <Section id="gov-table" title={t("Report register", "سجل التقارير")}>
        <DataTable<ReportEntry & Record<string, unknown>> rows={register as (ReportEntry & Record<string, unknown>)[]} cols={colsR} rowKey={(r) => r.name} pageSize={100} empty={t("No reports", "لا تقارير")} />
        <p className="mt-2 text-xs text-muted-foreground">{isFrappeHost() ? t("Every report runs in these screens as a read model over the records you may read on this site. DIGIT Script Report versions are not part of the package yet.", "يعمل كل تقرير في هذه الشاشات كنموذج قراءة على السجلات التي يحق لك قراءتها على هذا الموقع. ولا تتضمن الحزمة بعدُ نسخًا منها كتقارير برمجية في DIGIT.") : t("Every report runs here as a read model over the records you may read. On a DIGIT server each is a Script Report that refuses to run until its Python port is tested on staging.", "يعمل كل تقرير هنا كنموذج قراءة على السجلات التي يحق لك قراءتها. وعلى الخادم الفعلي كل تقرير هو تقرير برمجي يرفض التشغيل حتى يُختبر نقله إلى الخادم على بيئة الاختبار.")}</p>
      </Section>}
      {view === "sources" && <Section title={t("Source availability & latest change", "إتاحة المصادر وآخر تغيير")}>
        <DataTable<SourceInfo & Record<string, unknown>> rows={sources as (SourceInfo & Record<string, unknown>)[]} cols={colsS} rowKey={(s) => s.doctype} pageSize={100} empty={t("No sources", "لا مصادر")} />
        <p className="mt-2 text-xs text-muted-foreground">{t("Sources you cannot read show no count or date. No source is marked stale because no freshness threshold is defined.", "المصادر التي لا يحق لك قراءتها لا يظهر لها عدد ولا تاريخ. ولا يوصف أي مصدر بأنه قديم لعدم تحديد عتبة حداثة.")}</p>
      </Section>}
      {view === "permissions" && <Section title={t("Permission matrix (stored rules)", "مصفوفة الصلاحيات (القواعد المخزنة)")}>
        <div className="overflow-x-auto"><table className="w-full min-w-[52rem] text-sm" data-gov-matrix>
          <thead><tr className="text-xs text-muted-foreground"><th className="sticky start-0 bg-card px-2 py-1.5 text-start font-medium">{t("Source", "المصدر")}</th>{GOVERNANCE_ROLES.map((r) => <th key={r} className="px-2 py-1.5 text-center font-medium" data-no-i18n>{ar ? ROLE_AR[r] ?? translateTo(r, "ar") : r}</th>)}</tr></thead>
          <tbody>{permRows.map(({ dt }) => <tr key={dt} className="border-t border-border"><td className="sticky start-0 bg-card px-2 py-1.5" data-no-i18n>{dtLabel(dt)}</td>
            {GOVERNANCE_ROLES.map((r) => { const v = permissionCell(dt, r); return <td key={r} className={`px-2 py-1.5 text-center font-mono text-xs ${v ? "" : "text-muted-foreground"}`} data-no-i18n>{v ? (ar ? v.replace("own", "مالك") : v) : "·"}</td>; })}</tr>)}</tbody>
        </table></div>
        <p className="mt-2 text-xs text-muted-foreground">{t("r read · w write · c create · s submit · e export · p print · own = only records the user created. Company and project limits come from User Permissions on top of these rules.", "r قراءة · w كتابة · c إنشاء · s ترحيل · e تصدير · p طباعة · مالك = السجلات التي أنشأها المستخدم فقط. وتُضاف حدود الشركة والمشروع من أذونات المستخدم فوق هذه القواعد.")}</p>
      </Section>}
      {view === "audit" && <Section title={t("Audit trail", "سجل التدقيق")}>
        <DataTable<AuditEntry & Record<string, unknown>> rows={audit as (AuditEntry & Record<string, unknown>)[]} rowKey={(e) => e.version} pageSize={50}
          cols={[
            { key: "at", label: t("When", "متى"), render: (e) => <span className="text-xs" data-no-i18n>{stamp(e.at)}</span> },
            { key: "doc", label: t("Record", "السجل"), render: (e) => <div><div className="text-xs text-muted-foreground" data-no-i18n>{dtLabel(e.doctype)}</div><DocRef doctype={e.doctype} name={e.docname} /></div> },
            { key: "changes", label: t("Change", "التغيير"), render: (e) => e.created ? <span>{t("Created", "أُنشئ")}</span> : <ul className="max-w-[26rem] space-y-0.5 whitespace-normal text-xs">{e.changes.slice(0, 6).map(([f, a, b]) => <li key={f}><span>{fieldLabel(e.doctype, f)}</span>: <span data-no-i18n>{typeof a === "object" ? "…" : String(a ?? "—")} {ar ? "←" : "→"} {typeof b === "object" ? "…" : String(b ?? "—")}</span></li>)}</ul> },
            { key: "by", label: t("By", "بواسطة"), render: (e) => <span className="text-xs" data-no-i18n>{e.by || "—"}</span> },
          ]}
          empty={t("No governance record has changed yet in this workspace.", "لم يتغير أي سجل حوكمة بعد في مساحة العمل هذه.")} />
      </Section>}
      <Note>{t("Freshness thresholds, field masking and export restrictions are not set here: they wait on the owner's report-governance decision.", "لا تُضبط هنا عتبات الحداثة وإخفاء الحقول وقيود التصدير: فهي بانتظار قرار المالك بشأن حوكمة التقارير.")}</Note>
    </div>
    </BandTabsHost>
  );
}
