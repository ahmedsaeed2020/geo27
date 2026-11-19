/** Cost sheet (CST-02/03): budget → commitments → actuals → ETC → EAC per cost code, with each figure's source documents. */
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { Fragment } from "react";
import type { PluginPageProps } from "@/plugins/pages";
import { formatRowAnchor } from "@/lib/rowAnchor";
import { num, r2 } from "../domain/calc";
import { costBuckets, costPosition, projectTitle, today } from "../domain/data";
import { constructionProjects } from "../domain/queues";
import * as S from "../domain/services";
import { ActionButton, AppLink, BAND, compact, DocRef, Empty, hasRole, Kpi, KpiGrid, money, Note, PageHeader, PolicyGate, Section, StateBadge, useCx, amount, BTN } from "./kit";
import { BandField, bandInput } from "@/components/digit/Experience";
import { reportLink } from "./reports";
import { DateInput } from "@/components/form/DateInput";
import { ProjectCostOverview } from "./costScreens";

export function CostSheetPage(_: PluginPageProps) {
  const { t, ar } = useCx();
  const search = useRouterState({ select: (s) => s.location.search as Record<string, unknown> });
  const nav = useNavigate();
  const projects = constructionProjects();
  // project and cut-off live in the URL (?project=&as_of=), so drill-downs, Back and reload keep the same view
  const asked = typeof search["project"] === "string" ? String(search["project"]) : "";
  const project = asked || projects[0]?.name || "";
  const asOf = typeof search["as_of"] === "string" && /^\d{4}-\d{2}-\d{2}$/.test(String(search["as_of"])) ? String(search["as_of"]) : today();
  // the expanded cost line is kept in ?line= too, so Back from a source row returns to the same open line
  const open = typeof search["line"] === "string" ? String(search["line"]) : null;
  const go = (patch: Record<string, string | undefined>) => void nav({ to: "/plugins/$name/$", params: { name: "digit_construction", _splat: "cost/sheet" }, search: Object.fromEntries(Object.entries({ project, as_of: asOf === today() ? undefined : asOf, line: open ?? undefined, ...patch }).filter(([, v]) => !!v)) as never, replace: true });
  const setOpen = (k: string | null) => go({ line: k ?? undefined });
  if (!projects.length) return <div className="p-6"><PageHeader title={t("Cost sheet", "ورقة التكلفة")} /><Empty>{t("No construction projects", "لا مشاريع مقاولات")}</Empty></div>;
  if (!projects.some((p) => p.name === project)) return <div className="p-6" data-page="construction-cost-sheet"><PageHeader title={t("Cost sheet", "ورقة التكلفة")} crumbs={[{ label: t("Budget & cost", "الموازنة والتكلفة"), to: "dept/cst" }]} /><Note tone="bad"><span>{t("This project is not available here: it is not a construction project, or your role cannot read it.", "هذا المشروع غير متاح هنا: ليس مشروع مقاولات أو أن دورك لا يسمح بقراءته.")}</span> <span data-no-i18n>{project}</span></Note><button type="button" className={BTN.secondary} onClick={() => go({ project: projects[0]!.name })}>{t("Open the first available project", "فتح أول مشروع متاح")}</button></div>;
  const cut = asOf === today() ? undefined : asOf;
  const rep = (name: string, extra: Record<string, string> = {}) => reportLink(name, { project, as_of: cut, ...extra });
  const src = (measure: "Commitment" | "Actual", code?: string) => rep("Project Cost Sources", { measure, ...(code ? { cost_code: code } : {}) });
  const c = costPosition(project, asOf);
  const buckets = costBuckets(project, asOf);
  const cats = [...new Set(c.lines.map((l) => l.category || "—"))];
  const canQS = hasRole("Digit QS");
  const head = [t("Cost code", "رمز التكلفة"), t("Description", "الوصف"), t("Original", "الأصلية"), t("Revisions", "التعديلات"), t("Transfers", "المناقلات"), t("Revised", "المعدلة"), t("Committed", "ملتزم"), t("Actual", "فعلي"), t("ETC", "المتبقي المتوقع"), t("EAC", "المتوقع عند الإنجاز"), t("Variance", "الفرق")];
  const n = (v: number | null) => <td className={`px-1.5 py-1.5 text-end tabular-nums ${v !== null && v < 0 ? "text-destructive" : ""}`} data-no-i18n>{v === null ? "—" : amount(v)}</td>;
  // committed / actual cells open Project Cost Sources for the same project, cost code and cut-off — the rows this cell sums
  const d = (v: number, measure: "Commitment" | "Actual", code?: string) => v
    ? <td className="px-1.5 py-1.5 text-end tabular-nums" data-no-i18n><AppLink to={src(measure, code)} className="text-primary underline-offset-2 hover:underline" title={t("Open the source rows", "فتح سطور المصدر")}><span data-drill={measure === "Commitment" ? "committed" : "actual"}>{amount(v)}</span></AppLink></td>
    : n(v);
  return (
    <div className="w-full min-w-0" data-page="construction-cost-sheet" data-project={project}>
      <PageHeader title={t("Cost sheet", "ورقة التكلفة")} crumbs={[{ label: t("Budget & cost", "الموازنة والتكلفة"), to: "dept/cst" }]}
        subtitle={t("Commitments are open purchase orders and active work orders not yet billed; actuals are submitted purchase invoices and expense journal lines. EAC = actual + ETC.", "الالتزامات هي أوامر الشراء المفتوحة وأوامر العمل غير المفوترة؛ الفعلي هو فواتير الشراء المعتمدة وقيود المصروفات. التكلفة المتوقعة = الفعلي + المتبقي.")}
        band={{ question: t("Where will this project's cost land against its budget?", "أين ستنتهي تكلفة هذا المشروع مقارنة بموازنته؟"),
          basis: t("Budget lines by cost code with revisions, transfers, commitments and actuals up to the cut-off date; committed and actual cells open their source rows.", "بنود الموازنة حسب رمز التكلفة مع التعديلات والمناقلات والالتزامات والفعلي حتى تاريخ القطع؛ خلايا الملتزم والفعلي تفتح سطور مصدرها."),
          controls: <>
            <BandField label={t("Project", "المشروع")}><select className={bandInput} value={project} data-cost-filter="project" onChange={(e) => go({ project: e.target.value, line: undefined })}>{projects.map((p) => <option key={p.name} value={p.name} data-no-i18n>{projectTitle(p, !ar)}</option>)}</select></BandField>
            <BandField label={t("As of", "حتى تاريخ")}><DateInput className={bandInput} value={asOf} max={today()} data-cost-filter="as_of" onChange={(e) => go({ as_of: e.target.value && e.target.value !== today() ? e.target.value : undefined })} /></BandField>
          </>,
          meta: [
            { label: t("Budget", "الموازنة"), value: c.budget ? <span data-no-i18n>{c.budget.name}</span> : t("none approved", "لا موازنة معتمدة") },
            { label: t("Forecast", "التوقع"), value: c.forecast ? <span data-no-i18n>{c.forecast.name} · {String(c.forecast["cutoff_date"] ?? "")}</span> : t("none — ETC = remaining budget", "لا يوجد — المتبقي = باقي الموازنة") },
            { label: t("Cost codes", "رموز التكلفة"), value: <span data-no-i18n>{c.lines.length}</span> },
            { label: t("Currency", "العملة"), value: t("SAR", "ر.س") },
          ],
          actions: <><AppLink to={`project/${encodeURIComponent(project)}?tab=cost`} className={BAND.secondary}>{t("Project 360", "المشروع 360")}</AppLink><AppLink to={`cost/verify?project=${encodeURIComponent(project)}${cut ? `&as_of=${cut}` : ""}`} className={BAND.secondary}>{t("Verify sources", "التحقق من المصادر")}</AppLink>{canQS && <ActionButton label={t("New forecast snapshot", "لقطة توقع جديدة")} run={() => S.createForecast(project)} />}</> }} />
      <KpiGrid cols={6}>
        <Kpi label={t("Revised budget", "الموازنة المعدلة")} value={compact(c.revised, ar)} hint={money(c.revised)} to={rep("Project Cost Report")} />
        <Kpi label={t("Committed", "ملتزم")} value={compact(c.committed, ar)} hint={t("open POs and unbilled work orders", "أوامر شراء مفتوحة وأوامر عمل غير مفوترة")} to={src("Commitment")} />
        <Kpi label={t("Actual", "فعلي")} value={compact(c.actual, ar)} hint={t("submitted invoices and expense lines", "فواتير معتمدة وقيود مصروفات")} to={src("Actual")} />
        <Kpi label={t("EAC", "التكلفة المتوقعة")} value={c.eac === null ? "—" : compact(c.eac, ar)} hint={t("actual + ETC", "الفعلي + المتبقي")} tone={c.variance !== null && c.variance < 0 ? "bad" : "default"} to={rep("Project Cost Report")}
          delta={c.variance === null ? undefined : { text: <span data-no-i18n>{c.variance < 0 ? "▲ " : "▼ "}{compact(Math.abs(c.variance), ar)}</span>, tone: c.variance < 0 ? "bad" : "good", title: t("Variance: revised budget − EAC", "الفرق: الموازنة المعدلة − التكلفة المتوقعة") }} />
        <Kpi label={t("Variance", "الفرق")} value={c.variance === null ? "—" : compact(c.variance, ar)} hint={t("revised budget − EAC", "الموازنة المعدلة − التكلفة المتوقعة")} tone={c.variance !== null && c.variance < 0 ? "bad" : "good"} to={rep("Project Cost Report")} />
        <Kpi label={t("Forecast margin", "الهامش المتوقع")} value={c.marginPct === null || c.marginPct === undefined ? "—" : `${c.marginPct}%`} to={rep("Project Cost Report")} />
      </KpiGrid>
      <PolicyGate keys={["P7"]} />
      <ProjectCostOverview project={project} asOf={cut} />
      {!c.budget && <Note tone="warn">{t("No approved budget for this project. All spend is shown as unallocated.", "لا توجد موازنة معتمدة لهذا المشروع. يظهر كل الإنفاق كغير موزع.")} {canQS && <ActionButton label={t("Create budget", "إنشاء موازنة")} run={() => S.createBudget(project)} />}</Note>}
      {c.budget && <p className="mb-2 text-sm">{t("Budget", "الموازنة")}: <DocRef doctype="Digit Project Cost Budget" name={c.budget.name} /> <StateBadge state={c.budget["workflow_state"]} /> {c.forecast ? <>· {t("Forecast", "التوقع")}: <DocRef doctype="Digit Cost Forecast Snapshot" name={c.forecast.name} /> <span className="text-xs text-muted-foreground" data-no-i18n>{String(c.forecast["cutoff_date"] ?? "")}</span></> : <span className="text-xs text-muted-foreground">· {t("no approved forecast — ETC = remaining budget", "لا توقع معتمد — المتبقي = باقي الموازنة")}</span>}</p>}
      <Section title={t("Cost codes", "رموز التكلفة")}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[52rem] text-xs">
            <thead><tr className="border-b border-border text-xs text-muted-foreground">{head.map((h, i) => <th key={h} scope="col" className={`whitespace-nowrap px-1.5 py-1.5 font-medium ${i > 1 ? "text-end" : "text-start"}`}>{h}</th>)}</tr></thead>
            <tbody>
              {cats.map((cat) => {
                const ls = c.lines.filter((l) => (l.category || "—") === cat);
                return (
                  <Fragment key={cat}>
                    <tr className="bg-muted/50"><td colSpan={head.length} className="px-2 py-1 text-xs font-semibold">{cat}</td></tr>
                    {ls.map((l) => {
                      const src = (buckets.get(l.cost_code)?.sources ?? []);
                      return (
                        <Fragment key={l.line_key}>
                          <tr className="border-b border-border/60 hover:bg-muted/40">
                            <td className="whitespace-nowrap px-1.5 py-1.5"><button type="button" aria-expanded={open === l.line_key} className="text-primary hover:underline" onClick={() => setOpen(open === l.line_key ? null : l.line_key)} data-no-i18n>{l.cost_code}</button></td>
                            <td className="px-1.5 py-1.5" data-no-i18n>{l.description}</td>
                            {n(l.original)}{n(l.revisions)}{n(r2(l.transferIn - l.transferOut))}{n(l.revised)}{d(l.committed, "Commitment", l.cost_code)}{d(l.actual, "Actual", l.cost_code)}{n(l.etc)}{n(l.eac)}{n(l.variance)}
                          </tr>
                          {open === l.line_key && <tr><td colSpan={head.length} className="bg-muted/30 px-6 py-2">{src.length ? <ul className="text-xs">{src.map((s, i) => <li key={i} className="flex gap-3"><span className="w-24">{s.kind === "commitment" ? t("commitment", "التزام") : t("actual", "فعلي")}</span><DocRef doctype={s.doctype} name={s.name} row={formatRowAnchor(s.table, s.row)} /><span className="text-muted-foreground" data-no-i18n>#{s.row} {s.detail}</span><span className="ms-auto tabular-nums" data-no-i18n>{amount(s.amount)}</span></li>)}</ul> : <span className="text-xs text-muted-foreground">{t("No commitments or actuals on this code yet", "لا التزامات أو تكاليف على هذا الرمز بعد")}</span>}</td></tr>}
                        </Fragment>
                      );
                    })}
                  </Fragment>
                );
              })}
              {c.unallocated.map((u) => (
                <tr key={u.code} className="border-b border-border/60 bg-warning/5">
                  <td className="px-2 py-1.5" data-no-i18n>{u.code}</td>
                  <td className="px-2 py-1.5">{t("Not mapped to an approved budget line", "غير مرتبط ببند موازنة معتمد")} — {u.sources.slice(0, 3).map((s, i) => <span key={i} className="me-1"><DocRef doctype={s.doctype} name={s.name} row={formatRowAnchor(s.table, s.row)} /></span>)}</td>
                  {n(0)}{n(0)}{n(0)}{n(0)}{d(u.committed, "Commitment", u.code)}{d(u.actual, "Actual", u.code)}{n(u.committed)}{n(r2(u.actual + u.committed))}{n(r2(-(u.actual + u.committed)))}
                </tr>
              ))}
            </tbody>
            <tfoot><tr className="border-t-2 border-border font-semibold"><td className="px-2 py-1.5" colSpan={2}>{t("Total", "الإجمالي")}</td>{n(c.original)}{n(r2(c.lines.reduce((s, l) => s + l.revisions, 0)))}{n(r2(c.lines.reduce((s, l) => s + l.transferIn - l.transferOut, 0)))}{n(c.revised)}{d(c.committed, "Commitment")}{d(c.actual, "Actual")}{n(c.etc)}{n(c.eac)}{n(c.variance)}</tr></tfoot>
          </table>
        </div>
        {!c.lines.length && !c.unallocated.length && <Empty>{t("No budget lines or spend yet", "لا بنود موازنة أو إنفاق بعد")}</Empty>}
      </Section>
      <p className="text-xs text-muted-foreground">{t(`Contract revenue (revised) ${amount(num(c.revenue))} · margin = (revenue − EAC) ÷ revenue.`, `إيراد العقد (المعدل) ${amount(num(c.revenue))} · الهامش = (الإيراد − التكلفة المتوقعة) ÷ الإيراد.`)}</p>
    </div>
  );
}
