/**
 * RPT-MGT-04 Decision follow-up (Run 6). Workflow decisions taken on construction documents (from the workflow log)
 * and, separately, the follow-up assignments explicitly linked to each decision. A follow-up is added as a native ToDo
 * on the decided document; nothing here edits the document or the decision. No response-time target is shown because
 * none is defined (owner decision OD-27). Filters, tab and selection live in the URL so Back restores them.
 */
import { BandTabsHost } from "@/components/enterprise/kit/templates";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import { notifyError, notifySaved } from "./notify";
import { adapter } from "@/lib/adapter";
import { cachedMeta } from "@/lib/catalog";
import { useScopeMetas } from "@/lib/scope";
import { hasPerm, useSessionUser } from "@/lib/session";
import { BandField, bandInput } from "@/components/digit/Experience";
import { decisionEvents, followUpSummary, type DecisionEvent, type FollowUp } from "../domain/followup";
import { addFollowUp, assignableUsers, closeFollowUp } from "../domain/followupActions";
import { approvalDoctypes } from "../domain/inbox";
import { projectTitle, get } from "../domain/data";
import { constructionProjects } from "../domain/queues";
import { DECISIONS } from "../reportsGap";
import { DOCTYPE_AR } from "../schema";
import { ACTION_AR } from "../workflows";
import { actionVerb, verbText } from "@/lib/approvalPath";
import { ChangeLog, QueueSplit } from "@/components/enterprise/kit/QueueSplit";
import { AppLink, BAND, BTN, DataTable, DocRef, Field, inputCls, Kpi, KpiGrid, Note, PageHeader, ProjectRef, Section, StateBadge, dateTxt, useCx, type Col } from "./kit";
import { reportLink } from "./reports";
import { DateInput } from "@/components/form/DateInput";

const APP = "digit_construction";
const FU_TONE: Record<string, string> = { "No follow-up": "bg-muted text-muted-foreground", Open: "bg-primary/10 text-primary", "Past due": "bg-destructive/10 text-destructive", Closed: "bg-success/15 text-success" };
const FU_AR: Record<string, string> = { "No follow-up": "لا متابعة", Open: "مفتوحة", "Past due": "تجاوزت تاريخ الاستحقاق", Closed: "مغلقة" };
const PRI_AR: Record<string, string> = { Low: "منخفضة", Medium: "متوسطة", High: "مرتفعة" };
const Chip = ({ tone, children, attr }: { tone: string; children: ReactNode; attr?: string }) => <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium leading-4 ${tone}`} data-fu-state={attr} data-no-i18n>{children}</span>;
const userName = (u: string) => String(adapter.get("User", u)?.["full_name"] ?? u);
const isDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);
type View = "decisions" | "followups";
type FuRow = FollowUp & { event: DecisionEvent } & Record<string, unknown>;

export function FollowUpPage() {
  const { t, ar } = useCx();
  const user = useSessionUser();
  useScopeMetas(["ToDo", "Comment", "User", "Project", ...approvalDoctypes()]);
  const search = useRouterState({ select: (s) => s.location.search as Record<string, unknown> });
  const nav = useNavigate();
  const str = (k: string) => (typeof search[k] === "string" ? String(search[k]) : "");
  const set = (p: Record<string, string>) => void nav({ to: "/plugins/$name/$", params: { name: APP, _splat: "follow-up" }, search: Object.fromEntries(Object.entries({ ...search, ...p }).filter(([, v]) => v)) as never, replace: true });
  const projects = constructionProjects();
  const project = projects.some((p) => p.name === str("project")) ? str("project") : "";
  const from = isDate(str("from")) ? str("from") : "", to = isDate(str("to")) ? str("to") : "";
  const action = DECISIONS.has(str("decision")) ? str("decision") : "";
  const doctype = approvalDoctypes().includes(str("doctype")) ? str("doctype") : "";
  const view: View = str("view") === "followups" ? "followups" : "decisions";
  const only = str("d");
  const [form, setForm] = useState<{ key: string; allocated_to: string; date: string; priority: "Low" | "Medium" | "High"; description: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [, bump] = useState(0);

  const events = decisionEvents({ project: project || undefined, from: from || undefined, to: to || undefined, action: action || undefined, document_type: doctype || undefined }, undefined, user);
  const sum = followUpSummary(events);
  const toMeta = cachedMeta("ToDo");
  const canAdd = !!toMeta && hasPerm(toMeta, "create", undefined, user);
  const dtLabel = (dt: string) => (ar ? DOCTYPE_AR[dt] ?? dt : dt.replace(/^Digit /, ""));
  // decisions read with the shared trail verbs (اعتمد، رفض، أعاد، طلب تعديل …); an action without one keeps its own name
  const actLabel = (a: string) => a.split(" / ").map((x) => { const k = actionVerb(x); return k ? verbText(k, ar) : ar ? ACTION_AR[x] ?? x : x; }).join(" / ");
  const pTitle = (p: string) => { const d = get("Project", p); return d ? projectTitle(d, !ar) : p; };
  const title = t("Decision follow-up", "متابعة القرارات");
  const fuRows: FuRow[] = events.flatMap((e) => e.followups.map((f) => ({ ...f, event: e }))).filter((f) => !only || f.decision === only)
    .sort((a, b) => Number(b.past_due) - Number(a.past_due) || (a.status === "Open" ? 0 : 1) - (b.status === "Open" ? 0 : 1) || (a.date || "9999").localeCompare(b.date || "9999"));
  const sel = form ? events.find((e) => e.key === form.key) : undefined;
  const openEv = str("open") ? events.find((e) => e.key === str("open")) : undefined;

  const submit = () => {
    if (!form || busy) return;
    if (!form.allocated_to) { notifyError(t("Choose who follows up", "اختر المكلّف بالمتابعة")); return; }
    if (!form.description.trim()) { notifyError(t("Describe the follow-up action", "صف إجراء المتابعة")); return; }
    setBusy(true);
    try {
      const r = addFollowUp(form.key, { allocated_to: form.allocated_to, description: form.description, date: form.date || undefined, priority: form.priority }, user);
      if (!r.ok) { notifyError(t("Follow-up not added", "لم تُضف المتابعة"), { description: r.errors.join("\n") }); return; }
      notifySaved(t("Follow-up assigned", "أُسندت المتابعة"), { description: r.name });
      setForm(null); bump((n) => n + 1);
    } finally { setBusy(false); }
  };
  const close = (f: FollowUp) => {
    const errs = closeFollowUp(f.todo, user);
    if (errs.length) notifyError(t("Not closed", "لم تُغلق"), { description: errs.join("\n") }); else { notifySaved(t("Follow-up closed", "أُغلقت المتابعة"), { description: f.todo }); bump((n) => n + 1); }
  };

  const docCell = (e: DecisionEvent) => (
    <div className="min-w-[11rem] max-w-[18rem] whitespace-normal">
      <div className="text-xs text-muted-foreground" data-no-i18n>{dtLabel(e.doctype)}</div>
      <DocRef doctype={e.doctype} name={e.name} />
      {e.title && e.title !== e.name && <div className="text-xs text-muted-foreground" data-no-i18n>{e.title}</div>}
    </div>
  );
  const colsD: Col<DecisionEvent & Record<string, unknown>>[] = [
    { key: "decided_on", label: t("Decided on", "تاريخ القرار"), render: (e) => <span data-no-i18n>{dateTxt(e.decided_on)}</span> },
    { key: "action", label: t("Decision", "القرار"), render: (e) => <div><span className="font-medium" data-no-i18n data-decision={e.action}>{actLabel(e.action)}</span>{e.action_basis === "Ambiguous" && <div className="text-[11px] text-warning">{t("The log stores only the resulting state", "السجل يحفظ الحالة الناتجة فقط")}</div>}</div> },
    { key: "doc", label: t("Document", "المستند"), render: docCell },
    { key: "project", label: t("Project", "المشروع"), render: (e) => <ProjectRef project={e.project} title={pTitle(e.project)} /> },
    { key: "move", label: t("From → to", "من ← إلى"), render: (e) => <span className="inline-flex flex-wrap items-center gap-1">{e.from_state ? <StateBadge state={e.from_state} /> : <span className="text-muted-foreground">?</span>}<span aria-hidden>{ar ? "←" : "→"}</span><StateBadge state={e.to_state} /></span> },
    { key: "decided_by", label: t("Decided by", "متخذ القرار"), render: (e) => <span data-no-i18n>{userName(e.decided_by)}</span> },
    { key: "current_state", label: t("Current state", "الحالة الحالية"), render: (e) => <StateBadge state={e.current_state} /> },
    { key: "reason", label: t("Reason on document (current)", "السبب في المستند (الحالي)"), render: (e) => e.reason ? <span className="block max-w-[16rem] whitespace-normal text-xs" data-no-i18n>{e.reason}</span> : <span className="text-muted-foreground">—</span> },
    { key: "fu", label: t("Follow-up", "المتابعة"), render: (e) => (
      <div className="flex flex-col items-start gap-0.5">
        <Chip tone={FU_TONE[e.followup_state] ?? ""} attr={e.followup_state}>{ar ? FU_AR[e.followup_state] : e.followup_state}</Chip>
        {e.followups.length > 0 && <button type="button" className="text-xs text-primary underline-offset-2 hover:underline" data-fu-open={e.key} onClick={() => { setForm(null); set({ view: "followups", d: e.key }); }}>
          <span data-no-i18n>{e.followups.length}</span> {t("linked", "مرتبطة")}{e.open_followups ? <> · <span data-no-i18n>{e.open_followups}</span> {t("open", "مفتوحة")}</> : null}</button>}
        {e.other_open > 0 && <span className="text-[11px] text-muted-foreground"><span data-no-i18n>{e.other_open}</span> {t("other open assignments on the document (not linked)", "تكليفات مفتوحة أخرى على المستند (غير مرتبطة)")}</span>}
      </div>) },
    { key: "act", label: "", render: (e) => canAdd ? <button type="button" className={BTN.compact} data-fu-add={e.key} aria-expanded={form?.key === e.key} onClick={() => setForm({ key: e.key, allocated_to: "", date: "", priority: "Medium", description: "" })}>{t("Add follow-up", "إضافة متابعة")}</button> : null },
  ];
  const colsF: Col<FuRow>[] = [
    { key: "date", label: t("Due date", "تاريخ الاستحقاق"), render: (f) => <span data-no-i18n>{f.date ? dateTxt(f.date) : "—"}</span> },
    { key: "status", label: t("Status", "الحالة"), render: (f) => { const s = f.past_due ? "Past due" : f.status === "Open" ? "Open" : "Closed"; return <Chip tone={FU_TONE[s] ?? ""} attr={s}>{ar ? FU_AR[s] : s}</Chip>; } },
    { key: "description", label: t("Follow-up action", "إجراء المتابعة"), render: (f) => f.description !== null ? <span className="block max-w-[20rem] whitespace-normal" data-no-i18n>{f.description || "—"}</span> : <span className="text-xs text-muted-foreground">{t("Visible to the assignee and the assigner only", "يظهر للمكلّف ومن أسنده فقط")}</span> },
    { key: "allocated_to", label: t("Assigned to", "مسند إلى"), render: (f) => <span data-no-i18n>{userName(f.allocated_to)}</span> },
    { key: "priority", label: t("Priority", "الأولوية"), render: (f) => <span data-no-i18n>{ar ? PRI_AR[f.priority] ?? f.priority : f.priority}</span> },
    { key: "decision", label: t("Decision", "القرار"), render: (f) => <div><span className="font-medium" data-no-i18n>{actLabel(f.event.action)}</span> <span className="text-xs text-muted-foreground" data-no-i18n>{dateTxt(f.event.decided_on)}</span>{docCell(f.event)}</div> },
    { key: "assigned_by", label: t("Assigned by", "أسندها"), render: (f) => <span data-no-i18n>{userName(f.assigned_by)}</span> },
    { key: "act", label: "", render: (f) => <div className="flex flex-wrap items-center gap-1"><DocRef doctype="ToDo" name={f.todo} className="text-xs" />{f.status === "Open" && (f.allocated_to === user || f.assigned_by === user || user === "Administrator") && <button type="button" className={BTN.compact} data-fu-close={f.todo} onClick={() => close(f)}>{t("Close", "إغلاق")}</button>}</div> },
  ];
  const tab = (k: View, en: string, a: string, n: number) => (
    <button key={k} type="button" role="tab" aria-selected={view === k} data-fu-view={k} onClick={() => { setForm(null); set({ view: k === "decisions" ? "" : k, d: "" }); }}
      className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${view === k ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
      {ar ? a : en} <span className="ms-1 rounded-full bg-muted px-1.5 text-xs" data-no-i18n>{n}</span>
    </button>
  );
  const rep = reportLink("Decision Follow-up", { project: project || undefined, from_date: from || undefined, to_date: to || undefined, decision: action || undefined, document_type: doctype || undefined });

  const sectionTabs = (
      <div className="mb-3 flex flex-wrap gap-1 border-b border-border" role="tablist" aria-label={title}>
        {tab("decisions", "Decisions", "القرارات", events.length)}{tab("followups", "Follow-ups", "المتابعات", events.reduce((n, e) => n + e.followups.length, 0))}
      </div>
  );
  return (
    <BandTabsHost tabs={sectionTabs}>
    <div className="w-full min-w-0" data-page="construction-follow-up">
      <PageHeader title={title} crumbs={[{ label: t("My approvals & tasks", "اعتماداتي ومهامي"), to: "inbox" }]}
        subtitle={t("Decisions are read from the workflow log of each document; a follow-up is an assignment explicitly linked to one decision.", "تُقرأ القرارات من سجل سير العمل لكل مستند؛ والمتابعة تكليف مرتبط صراحة بقرار واحد.")}
        band={{ question: t("Which decisions still have follow-up work open?", "ما القرارات التي ما زالت متابعتها مفتوحة؟"),
          basis: t("Approve, reject, return, certify and review decisions on construction documents you can read. No response-time target is defined, so nothing is marked late except a follow-up past its own due date.", "قرارات الاعتماد والرفض والإعادة والاعتماد الفني والمراجعة على مستندات المقاولات التي يحق لك قراءتها. لم يُحدد زمن استجابة مستهدف، فلا يُعد شيء متأخرًا إلا متابعة تجاوزت تاريخ استحقاقها."),
          controls: <>
            <BandField label={t("Project", "المشروع")}><select className={bandInput} value={project} data-fu-filter="project" onChange={(e) => set({ project: e.target.value, d: "" })}><option value="">{t("All construction projects", "كل مشاريع المقاولات")}</option>{projects.map((p) => <option key={p.name} value={p.name} data-no-i18n>{projectTitle(p, !ar)}</option>)}</select></BandField>
            <BandField label={t("From", "من")}><DateInput className={bandInput} value={from} data-fu-filter="from" onChange={(e) => set({ from: e.target.value, d: "" })} /></BandField>
            <BandField label={t("To", "إلى")}><DateInput className={bandInput} value={to} data-fu-filter="to" onChange={(e) => set({ to: e.target.value, d: "" })} /></BandField>
            <BandField label={t("Decision", "القرار")}><select className={bandInput} value={action} data-fu-filter="decision" onChange={(e) => set({ decision: e.target.value, d: "" })}><option value="">{t("All", "الكل")}</option>{[...DECISIONS].map((a) => <option key={a} value={a}>{ar ? ACTION_AR[a] ?? a : a}</option>)}</select></BandField>
            <BandField label={t("Document type", "نوع المستند")}><select className={bandInput} value={doctype} data-fu-filter="doctype" onChange={(e) => set({ doctype: e.target.value, d: "" })}><option value="">{t("All", "الكل")}</option>{approvalDoctypes().map((d) => <option key={d} value={d} data-no-i18n>{dtLabel(d)}</option>)}</select></BandField>
          </>,
          meta: [
            { label: t("Decisions", "القرارات"), value: <span data-no-i18n>{sum.decisions}</span> },
            { label: t("Period", "الفترة"), value: from || to ? <span data-no-i18n>{from ? dateTxt(from) : "…"} – {to ? dateTxt(to) : "…"}</span> : t("All dates", "كل التواريخ") },
            { label: t("Source", "المصدر"), value: t("Workflow log + linked assignments", "سجل سير العمل + التكليفات المرتبطة") },
          ],
          actions: <><AppLink to={rep} className={BAND.secondary}>{t("Open as report", "فتح كتقرير")}</AppLink><AppLink to={reportLink("Approval Aging", { project: project || undefined })} className={BAND.secondary}>{t("Waiting for a decision", "بانتظار قرار")}</AppLink><AppLink to="inbox" className={BAND.secondary}>{t("My approvals & tasks", "اعتماداتي ومهامي")}</AppLink></> }} />
      <KpiGrid cols={6}>
        <Kpi label={t("Decisions", "القرارات")} value={String(sum.decisions)} hint={Object.entries(sum.by_action).map(([a, n]) => `${actLabel(a)} ${n}`).join(" · ") || "—"} anchor="fu-table" />
        <Kpi label={t("With a linked follow-up", "لها متابعة مرتبطة")} value={String(sum.with_followup)} tone="info" anchor="fu-table" />
        <Kpi label={t("Without a follow-up", "بلا متابعة")} value={String(sum.without_followup)} hint={t("not a breach — no follow-up rule is defined", "ليس مخالفة — لا توجد قاعدة متابعة محددة")} />
        <Kpi label={t("Open follow-ups", "متابعات مفتوحة")} value={String(sum.open)} tone={sum.open ? "warn" : "good"} to={`follow-up?${new URLSearchParams({ ...Object.fromEntries(Object.entries({ project, from, to, decision: action, doctype }).filter(([, v]) => v)), view: "followups" }).toString()}`} />
        <Kpi label={t("Past their due date", "تجاوزت تاريخ الاستحقاق")} value={String(sum.past_due)} tone={sum.past_due ? "bad" : "good"} hint={t("by the assignment's own due date", "حسب تاريخ استحقاق التكليف نفسه")} />
        <Kpi label={t("Closed follow-ups", "متابعات مغلقة")} value={String(sum.closed)} tone="good" />
      </KpiGrid>
      {view === "decisions" && <Section id="fu-table" title={t("Decisions", "القرارات")}>
        {/* C4-05: the decision opens beside the list (record, its follow-ups, change log) with «الخطوة التالية» */}
        <QueueSplit ar={ar} keys={events.map((e) => e.key)} open={openEv?.key ?? (str("open") || undefined)} onOpen={(k) => set({ open: k })} onClose={() => set({ open: "" })} attrs={{ "data-fu-split": openEv ? "open" : "closed" }}
          title={openEv ? <span data-no-i18n>{openEv.name}</span> : undefined}
          list={<DataTable<DecisionEvent & Record<string, unknown>> rows={events as (DecisionEvent & Record<string, unknown>)[]} cols={openEv ? colsD.filter((c) => ["decided_on", "action", "doc", "fu"].includes(c.key)) : colsD} rowKey={(e) => e.key} pageSize={25} onRow={(e) => set({ open: e.key })} activeKey={openEv?.key}
            empty={t("No decisions recorded in the workflow log for these filters.", "لا قرارات مسجلة في سجل سير العمل لهذه المرشحات.")} />}>
          {openEv && <div className="grid gap-3" data-fu-record={openEv.key}>
            <div className="grid gap-1 rounded-lg border border-border p-3 text-sm">
              {docCell(openEv)}
              <span className="flex flex-wrap items-center gap-1.5"><b data-no-i18n>{actLabel(openEv.action)}</b>{openEv.from_state && <StateBadge state={openEv.from_state} />}<span aria-hidden>{ar ? "←" : "→"}</span><StateBadge state={openEv.to_state} /></span>
              <span className="text-xs text-muted-foreground"><bdi data-no-i18n>{userName(openEv.decided_by)}</bdi> · <bdi data-no-i18n>{dateTxt(openEv.decided_on)}</bdi>{openEv.project ? <> · <ProjectRef project={openEv.project} title={pTitle(openEv.project)} /></> : null}</span>
              {openEv.reason && <span className="text-xs" data-no-i18n>{openEv.reason}</span>}
            </div>
            <div><p className="mb-1 text-xs font-semibold">{t("Follow-ups", "المتابعات")} <span className="text-muted-foreground" data-no-i18n>({openEv.followups.length})</span></p>
              {openEv.followups.length ? <ul className="grid gap-1 text-xs">{openEv.followups.map((f) => <li key={f.todo} className="flex flex-wrap items-center gap-1.5 rounded-md border border-border px-2 py-1"><Chip tone={FU_TONE[f.past_due ? "Past due" : f.status === "Open" ? "Open" : "Closed"] ?? ""}>{ar ? FU_AR[f.past_due ? "Past due" : f.status === "Open" ? "Open" : "Closed"] : f.status}</Chip><span data-no-i18n>{f.description || "—"}</span><span className="text-muted-foreground" data-no-i18n>{userName(f.allocated_to)}{f.date ? ` · ${dateTxt(f.date)}` : ""}</span>{f.status === "Open" && (f.allocated_to === user || f.assigned_by === user || user === "Administrator") && <button type="button" className={BTN.compact} onClick={() => close(f)}>{t("Close", "إغلاق")}</button>}</li>)}</ul>
                : <p className="text-xs text-muted-foreground">{t("No follow-up yet.", "لا متابعة بعد.")}</p>}
              {canAdd && <button type="button" className={`${BTN.compact} mt-1.5`} data-fu-add-pane={openEv.key} onClick={() => setForm({ key: openEv.key, allocated_to: "", date: "", priority: "Medium", description: "" })}>{t("Add follow-up", "إضافة متابعة")}</button>}</div>
            <div><p className="mb-1 text-xs font-semibold">{t("Change log", "سجل التعديلات")}</p><ChangeLog doctype={openEv.doctype} name={openEv.name} ar={ar} /></div>
          </div>}
        </QueueSplit>
        {form && sel && <div className="mt-3 rounded-md border border-primary/40 bg-primary/5 p-3" data-fu-form={form.key}>
          <h3 className="mb-2 text-sm font-semibold" data-no-i18n>{t("Add follow-up", "إضافة متابعة")} — {actLabel(sel.action)} · {dtLabel(sel.doctype)} {sel.name} · {dateTxt(sel.decided_on)}</h3>
          <div className="grid gap-3 md:grid-cols-3">
            <Field label={t("Assign to", "إسناد إلى")}><select className={inputCls} value={form.allocated_to} data-fu-assignee onChange={(e) => setForm({ ...form, allocated_to: e.target.value })}>
              <option value="">{t("Choose…", "اختر…")}</option>{assignableUsers(sel.doctype, sel.name).map((u) => <option key={u} value={u} data-no-i18n>{userName(u)}</option>)}</select></Field>
            <Field label={t("Due date (optional)", "تاريخ الاستحقاق (اختياري)")}><DateInput className={inputCls} value={form.date} data-fu-date onChange={(e) => setForm({ ...form, date: e.target.value })} /></Field>
            <Field label={t("Priority", "الأولوية")}><select className={inputCls} value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value as typeof form.priority })}>{(["Low", "Medium", "High"] as const).map((p) => <option key={p} value={p}>{ar ? PRI_AR[p] : p}</option>)}</select></Field>
            <div className="md:col-span-3"><Field label={t("Follow-up action", "إجراء المتابعة")}><textarea className={`${inputCls} min-h-16`} value={form.description} data-fu-text onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field></div>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">{t("Only users who can read this document are listed. The follow-up appears in the assignee's approvals & tasks; the document and the decision are not changed.", "تظهر فقط أسماء من يحق لهم قراءة هذا المستند. تظهر المتابعة في اعتمادات ومهام المكلّف؛ ولا يتغير المستند ولا القرار.")}</p>
          <div className="mt-2 flex gap-2"><button type="button" className={BTN.primary} disabled={busy} data-fu-submit onClick={submit}>{t("Assign follow-up", "إسناد المتابعة")}</button><button type="button" className={BTN.secondary} onClick={() => setForm(null)}>{t("Cancel", "إلغاء")}</button></div>
        </div>}
        {!canAdd && <p className="mt-2 text-xs text-muted-foreground">{t("Your role can view decisions but cannot create assignments.", "يمكن لدورك عرض القرارات دون إنشاء تكليفات.")}</p>}
      </Section>}
      {view === "followups" && <Section id="fu-table" title={t("Follow-ups linked to decisions", "المتابعات المرتبطة بالقرارات")}
        actions={only ? <button type="button" className={BTN.secondary} onClick={() => set({ d: "" })}>{t("Show all follow-ups", "عرض كل المتابعات")}</button> : undefined}>
        {only && <Note>{t("Showing the follow-ups of one decision.", "تُعرض متابعات قرار واحد.")} <span data-no-i18n>{only}</span></Note>}
        <DataTable<FuRow> rows={fuRows} cols={colsF} rowKey={(f) => f.todo} pageSize={25} empty={t("No follow-up is linked to these decisions.", "لا متابعة مرتبطة بهذه القرارات.")} />
      </Section>}
    </div>
    </BandTabsHost>
  );
}
