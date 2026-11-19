/**
 * BOQ revision comparison (ET): any two BOQs of one project, line by line (domain/boq.ts compareBoqs). Read only —
 * every quantity opens the exact BOQ row (?row=items:idx); revisions are made with the BOQ form (Duplicate / Amend) and
 * approved through the BOQ workflow. URL state (?project=&base=&target=&only=) keeps the view across reload and Back.
 */
import { useNavigate, useRouterState } from "@tanstack/react-router";
import type { Doc } from "@/lib/adapter";
import { fmtNumber } from "@/lib/format";
import { formatRowAnchor } from "@/lib/rowAnchor";
import type { PluginPageProps } from "@/plugins/pages";
import { compareBoqs, defaultBase, projectBoqs, type BoqDiffLine, type BoqLineStatus } from "../domain/boq";
import { APP, projectTitle } from "../domain/data";
import { constructionProjects } from "../domain/queues";
import { uomLabel } from "../i18n";
import { OPTION_AR } from "../schema";
import { ActionButton, amount, DocRef, Empty, Field, Filters, inputCls, Kpi, KpiGrid, ListRef, Note, PageHeader, Section, StateBadge, useCx, BTN } from "./kit";
import { createBoqRevision } from "../domain/services";
import { hasPerm } from "@/lib/session";
import { cachedMeta } from "@/lib/catalog";

const STATUS_AR: Record<BoqLineStatus, string> = { Added: "مضاف", Removed: "محذوف", Changed: "معدّل", Unchanged: "بلا تغيير" };
const STATUS_TONE: Record<BoqLineStatus, string> = { Added: "bg-success/15 text-success", Removed: "bg-destructive/10 text-destructive", Changed: "bg-warning/15 text-warning", Unchanged: "bg-muted text-muted-foreground" };
const qtyFmt = (v: number) => fmtNumber(v, Number.isInteger(v) ? 0 : 3);
const signed = (v: number, f: (x: number) => string) => (v > 0 ? `+${f(v)}` : v < 0 ? `−${f(-v)}` : "0");

export function BoqComparePage(_: PluginPageProps) {
  const { t, ar } = useCx();
  const search = useRouterState({ select: (s) => s.location.search as Record<string, unknown> });
  const nav = useNavigate();
  const val = (k: string) => (typeof search[k] === "string" ? String(search[k]) : "");
  const projects = constructionProjects();
  const project = val("project");
  const go = (patch: Record<string, string | undefined>) => void nav({ to: "/plugins/$name/$", params: { name: APP, _splat: "estimating/boq-compare" }, search: Object.fromEntries(Object.entries({ project, base: val("base") || undefined, target: val("target") || undefined, only: val("only") || undefined, ...patch }).filter(([, v]) => !!v)) as never, replace: true });
  const header = <PageHeader title={t("BOQ revision comparison", "مقارنة مراجعات جدول الكميات")} crumbs={[{ label: t("Estimating workspace", "مساحة التقدير"), to: "dept/et" }, ...(project ? [{ label: t("Project 360", "المشروع 360"), to: `project/${encodeURIComponent(project)}?tab=contracts` }] : [])]}
    subtitle={t("Quantity, rate and amount changes between two bills of quantities of the same project.", "تغيرات الكمية والسعر والمبلغ بين جدولي كميات للمشروع نفسه.")} />;

  if (!project || !projects.some((p) => p.name === project)) {
    return (
      <div className="w-full min-w-0" data-page="construction-boq-compare">
        {header}
        {project && <Note tone="bad"><span>{t("This project is not available here: it is not a construction project, or your role cannot read it.", "هذا المشروع غير متاح هنا: ليس مشروع مقاولات أو أن دورك لا يسمح بقراءته.")}</span> <span data-no-i18n>{project}</span></Note>}
        {projects.length
          ? <Section title={t("Select a project", "اختر مشروعاً")}><div className="flex flex-wrap gap-2" data-boq-project-picker>{projects.map((p) => <button key={p.name} type="button" className={BTN.secondary} data-pick-project={p.name} onClick={() => go({ project: p.name, base: undefined, target: undefined })}><span data-no-i18n>{projectTitle(p, !ar)}</span></button>)}</div></Section>
          : <Empty>{t("No construction project is available to you.", "لا يوجد مشروع مقاولات متاح لك.")}</Empty>}
      </div>
    );
  }
  const boqs = projectBoqs(project);
  const asked = (k: string) => { const v = val(k); return v ? boqs.find((b) => b.name === v) : undefined; };
  const badTarget = !!val("target") && !asked("target"), badBase = !!val("base") && !asked("base");
  const target = asked("target") ?? (badTarget ? undefined : boqs[0]);
  const base = asked("base") ?? (badBase || !target ? undefined : defaultBase(target, boqs));
  const label = (b: Doc) => `${b.name} · ${t("rev.", "مراجعة")} ${String(b["revision"] ?? 0)} · ${ar ? OPTION_AR[String(b["workflow_state"] ?? "")] ?? String(b["workflow_state"] ?? "") : String(b["workflow_state"] ?? "")}`;
  const picker = (k: "base" | "target", v: Doc | undefined, title: string) => (
    <Field label={title}><select className={inputCls} value={v?.name ?? ""} data-boq-filter={k} onChange={(e) => go({ [k]: e.target.value })}>
      {!v && <option value="">{t("Select a BOQ", "اختر جدول كميات")}</option>}
      {boqs.map((b) => <option key={b.name} value={b.name} data-no-i18n>{label(b)}</option>)}
    </select></Field>
  );

  return (
    <div className="w-full min-w-0" data-page="construction-boq-compare">
      {header}
      <Filters>
        <Field label={t("Project", "المشروع")}><select className={inputCls} value={project} data-boq-filter="project" onChange={(e) => go({ project: e.target.value, base: undefined, target: undefined })}>{projects.map((p) => <option key={p.name} value={p.name} data-no-i18n>{projectTitle(p, !ar)}</option>)}</select></Field>
        {boqs.length > 1 && picker("base", base, t("Compare from (base)", "المقارنة من (الأساس)"))}
        {boqs.length > 1 && picker("target", target, t("To (revision)", "إلى (المراجعة)"))}
        {/* DEC-043: the latest approved BOQ is copied as the next revision draft (idempotent service) */}
        {boqs[0]?.["workflow_state"] === "Approved" && !!cachedMeta("Digit BOQ") && hasPerm(cachedMeta("Digit BOQ")!, "create") && <div className="flex min-h-9 items-end" data-boq-create-revision><ActionButton label={t("Create revision", "إنشاء مراجعة")} run={() => createBoqRevision(boqs[0]!.name)} /></div>}
        {boqs.length > 1 && <label className="flex min-h-9 items-center gap-2 text-sm"><input type="checkbox" checked={val("only") === "changes"} data-boq-filter="only" onChange={(e) => go({ only: e.target.checked ? "changes" : undefined })} />{t("Changed lines only", "البنود المتغيرة فقط")}</label>}
      </Filters>
      {(badBase || badTarget) && <Note tone="bad">{t("A selected BOQ does not belong to this project or cannot be read.", "جدول كميات مختار لا يخص هذا المشروع أو لا يمكن قراءته.")} <span data-no-i18n>{[badBase ? val("base") : "", badTarget ? val("target") : ""].filter(Boolean).join(", ")}</span></Note>}
      {boqs.length < 2
        ? <Section title={t("Bills of quantities of this project", "جداول كميات هذا المشروع")} actions={<ListRef doctype="Digit BOQ" filters={[["project", "=", project]]}>{t("List", "القائمة")}</ListRef>}>
            <Note tone="info">{t("A comparison needs two BOQs of the project. Make a revision from the BOQ form (Duplicate, or Amend after cancelling), set its revision number and base revision, then come back here.", "تحتاج المقارنة إلى جدولي كميات للمشروع. أنشئ مراجعة من نموذج جدول الكميات (نسخ، أو تعديل بعد الإلغاء)، وحدد رقم المراجعة والمراجعة الأساسية، ثم عد إلى هنا.")}</Note>
            {boqs.length ? <ul className="mt-2 text-sm" role="list">{boqs.map((b) => <li key={b.name} className="flex items-center gap-2"><DocRef doctype="Digit BOQ" name={b.name} /><StateBadge state={b["workflow_state"]} /><span className="text-muted-foreground" data-no-i18n>{amount(Number(b["total_amount"] ?? 0))}</span></li>)}</ul> : <Empty>{t("No BOQ for this project yet", "لا يوجد جدول كميات لهذا المشروع بعد")}</Empty>}
          </Section>
        : !base || !target ? <Note tone="warn">{t("Select both BOQs to compare.", "اختر جدولي الكميات للمقارنة.")}</Note>
        : base.name === target.name ? <Note tone="warn">{t("Choose two different BOQs.", "اختر جدولي كميات مختلفين.")}</Note>
        : <Comparison base={base} target={target} only={val("only") === "changes"} />}
    </div>
  );
}

function Comparison({ base, target, only }: { base: Doc; target: Doc; only: boolean }) {
  const { t, ar } = useCx();
  const c = compareBoqs(base, target);
  const shown = only ? c.lines.filter((l) => l.status !== "Unchanged") : c.lines;
  const cell = (doc: Doc, s: BoqDiffLine["base"], v: (x: NonNullable<BoqDiffLine["base"]>) => string, hot: boolean) =>
    s ? <DocRef doctype="Digit BOQ" name={doc.name} row={formatRowAnchor("items", s.idx)} className={`tabular-nums hover:underline ${hot ? "font-semibold text-foreground" : "text-primary"}`}><span data-no-i18n>{v(s)}</span></DocRef> : <span className="text-muted-foreground">—</span>;
  const th = (x: string, end = true) => <th scope="col" className={`whitespace-nowrap px-1.5 py-1.5 font-medium ${end ? "text-end" : "text-start"}`}>{x}</th>;
  return (
    <>
      <KpiGrid>
        <Kpi label={t("Base total", "إجمالي الأساس")} value={amount(c.totals.base)} hint={<span data-no-i18n>{base.name}</span>} />
        <Kpi label={t("Revision total", "إجمالي المراجعة")} value={amount(c.totals.target)} hint={<span data-no-i18n>{target.name}</span>} />
        <Kpi label={t("Change", "الفرق")} value={<bdi dir="ltr" data-no-i18n>{signed(c.totals.delta, amount)}</bdi>} tone={c.totals.delta > 0 ? "warn" : c.totals.delta < 0 ? "good" : "default"} />
        <Kpi label={t("Changed lines", "بنود معدلة")} value={c.counts.Changed} tone={c.counts.Changed ? "warn" : "default"} />
        <Kpi label={t("Added / removed", "مضافة / محذوفة")} value={<span data-no-i18n>{`${c.counts.Added} / ${c.counts.Removed}`}</span>} />
      </KpiGrid>
      <Section title={t("Line comparison", "مقارنة البنود")} actions={<><DocRef doctype="Digit BOQ" name={base.name} /> <span aria-hidden>→</span> <DocRef doctype="Digit BOQ" name={target.name} /></>}>
        {shown.length ? <div className="overflow-x-auto">
          <table className="w-full min-w-[56rem] text-xs" data-boq-compare>
            <thead>
              <tr className="border-b border-border text-muted-foreground">{th(t("Code", "الرمز"), false)}{th(t("Description", "الوصف"), false)}{th(t("Change", "التغيير"), false)}
                {th(t("Base qty", "كمية الأساس"))}{th(t("Revision qty", "كمية المراجعة"))}{th(t("Base rate", "سعر الأساس"))}{th(t("Revision rate", "سعر المراجعة"))}{th(t("Base amount", "مبلغ الأساس"))}{th(t("Revision amount", "مبلغ المراجعة"))}{th(t("Δ amount", "فرق المبلغ"))}</tr>
            </thead>
            <tbody>
              {shown.map((l, i) => (
                <tr key={`${l.key}-${i}`} className="border-b border-border/60" data-boq-line={l.status}>
                  <td className="whitespace-nowrap px-1.5 py-1.5 font-mono" data-no-i18n>{l.code || "—"}</td>
                  <td className="px-1.5 py-1.5"><span data-no-i18n>{l.description}</span> <span className="text-muted-foreground" data-no-i18n>{uomLabel(l.uom, ar)}</span>{l.matched === "code" && <span className="ms-1 text-[11px] text-muted-foreground">{t("(matched by code)", "(مطابق بالرمز)")}</span>}</td>
                  <td className="px-1.5 py-1.5"><span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_TONE[l.status]}`}>{ar ? STATUS_AR[l.status] : l.status}</span></td>
                  <td className="px-1.5 py-1.5 text-end">{cell(base, l.base, (s) => qtyFmt(s.qty), false)}</td>
                  <td className="px-1.5 py-1.5 text-end">{cell(target, l.target, (s) => qtyFmt(s.qty), l.changed.includes("qty"))}</td>
                  <td className="px-1.5 py-1.5 text-end">{cell(base, l.base, (s) => amount(s.rate), false)}</td>
                  <td className="px-1.5 py-1.5 text-end">{cell(target, l.target, (s) => amount(s.rate), l.changed.includes("rate"))}</td>
                  <td className="px-1.5 py-1.5 text-end tabular-nums" data-no-i18n>{l.base ? amount(l.base.amount) : "—"}</td>
                  <td className="px-1.5 py-1.5 text-end tabular-nums" data-no-i18n>{l.target ? amount(l.target.amount) : "—"}</td>
                  <td className={`px-1.5 py-1.5 text-end font-semibold tabular-nums ${l.da > 0 ? "text-warning" : l.da < 0 ? "text-success" : "text-muted-foreground"}`} data-no-i18n><bdi dir="ltr">{signed(l.da, amount)}</bdi></td>
                </tr>
              ))}
            </tbody>
            <tfoot><tr className="border-t-2 border-border font-semibold"><td colSpan={7} className="px-1.5 py-1.5">{t("Total", "الإجمالي")}</td>
              <td className="px-1.5 py-1.5 text-end tabular-nums" data-no-i18n>{amount(c.totals.base)}</td><td className="px-1.5 py-1.5 text-end tabular-nums" data-no-i18n>{amount(c.totals.target)}</td><td className="px-1.5 py-1.5 text-end tabular-nums" data-no-i18n><bdi dir="ltr">{signed(c.totals.delta, amount)}</bdi></td></tr></tfoot>
          </table>
        </div> : <Empty>{t("The two BOQs have identical lines.", "جدولا الكميات متطابقان في البنود.")}</Empty>}
      </Section>
    </>
  );
}
