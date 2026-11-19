/**
 * HOME-02 My approvals & tasks: approvals the session user can decide now (shared workflow engine), own documents
 * waiting on another approver, and open ToDo assignments. Decisions carry the document version seen when the inbox was
 * opened; a changed document is refused (stale-write guard) and the row asks for a refresh. Tabs/filters live in the URL.
 */
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useState } from "react";
import { afterSave, notifyError, notifySaved, notifySavedNow } from "./notify";
import { adapter } from "@/lib/adapter";
import { useSessionUser } from "@/lib/session";
import { useScopeMetas } from "@/lib/scope";
import { QUICK_ACTIONS, approvalDoctypes, approvalsFor, quickActionsFor, closeTask, decide, ownActionable, tasksFor, waitingOnOthers, type ApprovalItem, type TaskItem } from "../domain/inbox";
import { APP, get, projectTitle } from "../domain/data";
import { ACTION_AR } from "../workflows";
import { workflowStateLabel } from "../../runtime";
import { DOCTYPE_AR } from "../schema";
import { ChangeLog, QueueSplit } from "@/components/enterprise/kit/QueueSplit";
import { AppLink, BTN, DataTable, DocRef, Empty, Field, Filters, NewDoc, Note, OWN, PageHeader, ProjectRef, Section, StateBadge, dateTxt, inputCls, useCx, type Col } from "./kit";

type Tab = "approvals" | "tasks" | "waiting";
const dtLabel = (dt: string, ar: boolean) => (OWN.has(dt) ? (ar ? DOCTYPE_AR[dt] ?? dt : dt.replace(/^Digit /, "")) : dt);
const pTitle = (p: string, ar: boolean) => { const d = get("Project", p); return d ? projectTitle(d, !ar) : p; };
const stamp = (dt: string, name: string) => String(adapter.get(dt, name)?.["modified"] ?? adapter.get(dt, name)?.["creation"] ?? "");

export function InboxPage() {
  const { t, ar } = useCx();
  const user = useSessionUser();
  // non-admin scoped reads need the native metas (ToDo, Task, Project) loaded first
  useScopeMetas(["ToDo", "Task", "Project", "User", ...approvalDoctypes(), ...QUICK_ACTIONS.map((x) => x.doctype)]);
  const search = useRouterState({ select: (s) => s.location.search as Record<string, unknown> });
  const nav = useNavigate();
  const str = (k: string) => (typeof search[k] === "string" ? String(search[k]) : "");
  const tab: Tab = (["approvals", "tasks", "waiting"] as const).find((x) => x === str("tab")) ?? "approvals";
  const set = (p: Record<string, string>) => void nav({ to: "/plugins/$name/$", params: { name: APP, _splat: "inbox" }, search: Object.fromEntries(Object.entries({ ...search, ...p }).filter(([, v]) => v)) as never, replace: true });
  const approvals = approvalsFor(user), waiting = waitingOnOthers(user), tasks = tasksFor(user), own = ownActionable(user);
  // version of each document when the inbox was opened (or last refreshed); decisions are checked against it
  const snapshot = () => Object.fromEntries([...approvals, ...own].map((r) => [`${r.doctype}|${r.name}`, r.modified]));
  const [seen, setSeen] = useState<Record<string, string>>(snapshot);
  // a row first listed after the inbox opened is taken at its current version
  const seenOf = (r: ApprovalItem) => seen[`${r.doctype}|${r.name}`] ?? r.modified;
  const refresh = () => setSeen(snapshot());

  const quick = quickActionsFor(user);
  const dt = str("doctype"), project = str("project"), q = str("q").toLowerCase();
  const match = (r: { doctype: string; name: string; project: string; title?: string; description?: string }) =>
    (!dt || r.doctype === dt) && (!project || r.project === project) && (!q || `${r.name} ${r.title ?? ""} ${r.description ?? ""}`.toLowerCase().includes(q));
  const rowsA = approvals.filter(match), rowsW = waiting.filter(match), rowsT = tasks.filter(match), rowsO = own.filter(match);
  const all = tab === "tasks" ? tasks : tab === "waiting" ? [...own, ...waiting] : approvals;
  const doctypes = [...new Set(all.map((r) => r.doctype))].sort();
  const projects = [...new Set(all.map((r) => r.project).filter(Boolean))].sort();

  // C4-05 queue → record → next step: the open record (URL `open` = doctype|name) sits beside the list
  const keyOf = (r: { doctype: string; name: string }) => `${r.doctype}|${r.name}`;
  const openKey = str("open");
  const queueRows = tab === "waiting" ? rowsO : rowsA;
  const queueKeys = queueRows.map(keyOf);
  const openItem = openKey ? [...approvals, ...own].find((r) => keyOf(r) === openKey) : undefined;
  const advance = (k: string) => { const i = queueKeys.indexOf(k); const nx = i >= 0 ? queueKeys[i + 1] ?? queueKeys[i - 1] : undefined; set({ open: nx && nx !== k ? nx : "" }); };
  const act = (r: ApprovalItem, action: string) => {
    const field = r.reason_field[action];
    let reason: string | undefined;
    if (field) {
      const v = window.prompt(t(`Reason for "${action}"`, `سبب «${ACTION_AR[action] ?? action}»`), "");
      if (v === null) return;
      if (!v.trim()) { notifyError(t("A reason is required", "السبب مطلوب")); return; }
      reason = v;
    }
    const res = decide(r.doctype, r.name, action, seenOf(r), reason);
    if (res.conflict) { notifyError(t("This document changed after you opened the inbox", "تغيّر هذا المستند بعد فتح صندوق الوارد"), { description: t("Refresh the inbox and review it again before deciding.", "حدّث صندوق الوارد وراجع المستند مجددًا قبل القرار.") }); return; }
    if (!res.ok) { notifyError(t("Action not completed", "لم يكتمل الإجراء"), { description: res.errors.join("\n") }); return; }
    // the decision's own new version is "seen"; if the host's server later refuses the save (record restored), the
    // version seen before the decision applies again so the row is not reported as changed by someone else
    const k = `${r.doctype}|${r.name}`, before = seen[k];
    setSeen((s) => ({ ...s, [k]: stamp(r.doctype, r.name) }));
    if (openKey === k) advance(k);
    afterSave(() => { notifySavedNow(t(`${r.name}: ${action} → ${res.state}`, `${r.name}: ${ACTION_AR[action] ?? action} ← ${workflowStateLabel(r.doctype, String(res.state ?? ""), "ar")}`)); },
      () => { setSeen((s) => { const n = { ...s }; if (before === undefined) delete n[k]; else n[k] = before; return n; }); });
  };

  const common: Col<ApprovalItem & Record<string, unknown>>[] = [
    { key: "name", label: t("Document", "المستند"), render: (r) => <span className="flex flex-col"><DocRef doctype={r.doctype} name={r.name} /><span className="text-[11px] text-muted-foreground">{dtLabel(r.doctype, ar)}</span></span> },
    { key: "title", label: t("Title", "العنوان"), render: (r) => <span data-no-i18n>{r.title}</span> },
    { key: "project", label: t("Project", "المشروع"), render: (r) => (r.project ? <ProjectRef project={r.project} title={pTitle(r.project, ar)} /> : <span className="text-muted-foreground">—</span>) },
    { key: "state", label: t("Status", "الحالة"), render: (r) => <StateBadge state={r.state} /> },
    { key: "age_days", label: t("Waiting (days)", "الانتظار (أيام)"), kind: "num", align: "end" },
  ];
  const colsA: Col<ApprovalItem & Record<string, unknown>>[] = [...common,
    { key: "owner", label: t("Raised by", "أنشأه"), render: (r) => <span className="text-xs" data-no-i18n>{String(get("User", r.owner)?.["full_name"] ?? r.owner)}</span> },
    { key: "act", label: t("Decision", "القرار"), render: (r) => decisionButtons(r) },
  ];
  function decisionButtons(r: ApprovalItem) {
      const stale = seenOf(r) !== r.modified;
      return stale
        ? <span className="flex flex-col gap-1 text-xs text-warning" data-stale-row>{t("Changed since you opened the inbox", "تغيّر منذ فتح صندوق الوارد")}<button type="button" className={BTN.compact} onClick={refresh}>{t("Refresh", "تحديث")}</button></span>
        : <span className="inline-flex flex-wrap gap-1.5" data-inbox-actions={`${r.doctype}|${r.name}`}>{r.actions.map((a) => <button key={a} type="button" className={/Approve|Certify|Confirm|Activate|Review|Accept/.test(a) ? BTN.primary : /Reject|Cancel|Suspend|Return/.test(a) ? BTN.danger : BTN.secondary} onClick={() => act(r, a)}>{ar ? ACTION_AR[a] ?? a : a}</button>)}</span>;
  }
  const recordPane = (r: ApprovalItem) => (
    <div className="grid gap-3" data-inbox-record={keyOf(r)}>
      <div className="grid gap-1 rounded-lg border border-border p-3 text-sm">
        <span className="text-xs text-muted-foreground">{dtLabel(r.doctype, ar)}</span>
        <span className="flex flex-wrap items-center gap-2"><DocRef doctype={r.doctype} name={r.name} /><StateBadge state={r.state} /></span>
        {r.title && r.title !== r.name && <span className="font-medium" data-no-i18n>{r.title}</span>}
        {r.project && <span className="text-xs"><ProjectRef project={r.project} title={pTitle(r.project, ar)} /></span>}
        <span className="text-xs text-muted-foreground">{t("Raised by", "أنشأه")} <bdi data-no-i18n>{String(get("User", r.owner)?.["full_name"] ?? r.owner)}</bdi> · {t("waiting", "ينتظر منذ")} <bdi data-no-i18n>{r.age_days}</bdi> {t("days", "يوم")}</span>
      </div>
      <div><p className="mb-1 text-xs font-semibold">{t("Decision", "القرار")}</p>{decisionButtons(r)}</div>
      <div><p className="mb-1 text-xs font-semibold">{t("Change log", "سجل التعديلات")}</p><ChangeLog doctype={r.doctype} name={r.name} ar={ar} /></div>
    </div>
  );
  const colsW: Col<ApprovalItem & Record<string, unknown>>[] = [...common,
    { key: "act", label: t("Next step", "الخطوة التالية"), render: (r) => <span className="text-xs text-muted-foreground">{t(`${r.actions.join(", ")} by another user`, `${r.actions.map((a) => ACTION_AR[a] ?? a).join("، ")} بواسطة مستخدم آخر`)}</span> },
  ];
  const colsT: Col<TaskItem & Record<string, unknown>>[] = [
    { key: "description", label: t("Assignment", "التكليف"), render: (r) => <span className="flex flex-col"><span data-no-i18n>{r.description || r.name}</span><DocRef doctype="ToDo" name={r.todo} className="text-[11px]" /></span> },
    { key: "name", label: t("Record", "السجل"), render: (r) => r.name ? <span className="flex flex-col"><DocRef doctype={r.doctype} name={r.name} /><span className="text-[11px] text-muted-foreground">{dtLabel(r.doctype, ar)}</span></span> : <span>—</span> },
    { key: "project", label: t("Project", "المشروع"), render: (r) => (r.project ? <ProjectRef project={r.project} title={pTitle(r.project, ar)} /> : <span className="text-muted-foreground">—</span>) },
    { key: "date", label: t("Due", "الاستحقاق"), render: (r) => <span className={r.overdue ? "font-medium text-destructive" : ""} data-no-i18n>{dateTxt(r.date)}{r.overdue ? <span className="ms-1 text-[11px]">({t("overdue", "متأخر")})</span> : null}</span> },
    { key: "priority", label: t("Priority", "الأولوية"), render: (r) => <span>{ar ? { High: "عالية", Medium: "متوسطة", Low: "منخفضة" }[r.priority] ?? r.priority : r.priority}</span> },
    { key: "assigned_by", label: t("Assigned by", "كلّفه"), render: (r) => <span className="text-xs" data-no-i18n>{String(get("User", r.assigned_by)?.["full_name"] ?? r.assigned_by)}</span> },
    { key: "act", label: "", render: (r) => <button type="button" className={BTN.compact} onClick={() => { const e = closeTask(r.todo); if (e.length) notifyError(e.join("\n")); else notifySaved(t("Assignment closed", "أُغلق التكليف")); }}>{t("Mark done", "تم الإنجاز")}</button> },
  ];
  const tabBtn = (k: Tab, en: string, a: string, n: number) => (
    <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => set({ tab: k, doctype: "", project: "", open: "" })} data-inbox-tab={k}
      className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${tab === k ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
      {ar ? a : en} <span className="ms-1 rounded-full bg-muted px-1.5 text-xs" data-no-i18n>{n}</span>
    </button>
  );
  return (
    <div className="w-full min-w-0" data-page="construction-inbox">
      <PageHeader title={t("My approvals & tasks", "اعتماداتي ومهامي")} crumbs={[{ label: t("Management home", "الصفحة الرئيسية للإدارة"), to: "" }]}
        subtitle={t("Decisions you can take now, your documents waiting on another approver, and your open assignments. Approvals are decided here; assignments open their record.", "القرارات المتاحة لك الآن، ومستنداتك التي تنتظر معتمدًا آخر، وتكليفاتك المفتوحة. تُتخذ قرارات الاعتماد هنا، وتفتح التكليفات سجلها.")}
        actions={<><AppLink to="follow-up" className={BTN.secondary}>{t("Decision follow-up", "متابعة القرارات")}</AppLink><button type="button" className={BTN.secondary} onClick={refresh}>{t("Refresh", "تحديث")}</button></>} />
      <div className="mb-3 flex flex-wrap gap-1 border-b border-border" role="tablist" aria-label={t("Inbox", "صندوق الوارد")}>
        {tabBtn("approvals", "Approvals", "اعتمادات", approvals.length)}{tabBtn("tasks", "Assignments", "تكليفات", tasks.length)}{tabBtn("waiting", "My documents", "مستنداتي", own.length + waiting.length)}
      </div>
      <Filters>
        <Field label={t("Document type", "نوع المستند")}><select className={inputCls} value={dt} onChange={(e) => set({ doctype: e.target.value })} data-inbox-doctype><option value="">{t("All", "الكل")}</option>{doctypes.map((d) => <option key={d} value={d}>{dtLabel(d, ar)}</option>)}</select></Field>
        <Field label={t("Project", "المشروع")}><select className={inputCls} value={project} onChange={(e) => set({ project: e.target.value })}><option value="">{t("All", "الكل")}</option>{projects.map((p) => { const d = get("Project", p); return <option key={p} value={p} data-no-i18n>{d ? projectTitle(d, !ar) : p}</option>; })}</select></Field>
        <Field label={t("Search", "بحث")}><input className={inputCls} defaultValue={q} onKeyDown={(e) => { if (e.key === "Enter") set({ q: (e.target as HTMLInputElement).value }); }} onBlur={(e) => set({ q: e.target.value })} placeholder={t("ID or title", "الرقم أو العنوان")} /></Field>
      </Filters>
      {tab === "approvals" && <Section title={t("Waiting for your decision", "بانتظار قرارك")}>
        <QueueSplit ar={ar} keys={queueKeys} open={openKey || undefined} onOpen={(k) => set({ open: k })} onClose={() => set({ open: "" })} attrs={{ "data-inbox-split": openKey ? "open" : "closed" }}
          title={openItem ? <span data-no-i18n>{openItem.name}</span> : openKey ? <span data-no-i18n>{openKey.split("|")[1]}</span> : undefined}
          list={<DataTable<ApprovalItem & Record<string, unknown>> rows={rowsA as (ApprovalItem & Record<string, unknown>)[]} cols={openKey ? colsA.filter((c) => ["name", "title", "state", "age_days"].includes(c.key)) : colsA} rowKey={(r) => `${r.doctype}|${r.name}`} pageSize={20} onRow={(r) => set({ open: keyOf(r) })} activeKey={openKey || undefined} empty={approvals.length ? t("No approvals match these filters", "لا اعتمادات مطابقة لهذه المرشحات") : t("Nothing is waiting for your decision", "لا شيء بانتظار قرارك")} />}>
          {openItem ? recordPane(openItem) : openKey ? <p className="text-sm text-muted-foreground" data-inbox-decided>{t("This document has been decided and left your queue.", "تم البت في هذا المستند وخرج من قائمتك.")}</p> : null}
        </QueueSplit>
        <p className="mt-2 text-xs text-muted-foreground">{t("Only documents you may read and move are listed; a decision follows the document's workflow (roles, segregation of duties, required reasons).", "تظهر فقط المستندات التي يحق لك قراءتها وتحريكها؛ ويتبع القرار سير عمل المستند (الأدوار، فصل المهام، الأسباب المطلوبة).")}</p>
      </Section>}
      {tab === "tasks" && <Section title={t("Your open assignments", "تكليفاتك المفتوحة")}>
        <DataTable<TaskItem & Record<string, unknown>> rows={rowsT as (TaskItem & Record<string, unknown>)[]} cols={colsT} rowKey={(r) => r.todo} pageSize={20} empty={tasks.length ? t("No assignments match these filters", "لا تكليفات مطابقة لهذه المرشحات") : t("You have no open assignments", "لا توجد لديك تكليفات مفتوحة")} />
        <Note>{t("Assignments are ToDo records. Marking one done closes the assignment only; the record itself is changed from its own form.", "التكليفات سجلات مهام. يغلق «تم الإنجاز» التكليف فقط؛ ويُعدّل السجل نفسه من نموذجه.")}</Note>
      </Section>}
      {tab === "waiting" && <Section title={t("Your documents to progress (drafts, returns)", "مستنداتك للمتابعة (مسودات، معادة)")}>
        <DataTable<ApprovalItem & Record<string, unknown>> rows={rowsO as (ApprovalItem & Record<string, unknown>)[]} cols={colsA.filter((c) => c.key !== "owner")} rowKey={(r) => `${r.doctype}|${r.name}`} pageSize={20} empty={t("None of your documents needs an action from you", "لا يحتاج أي من مستنداتك إجراءً منك")} />
      </Section>}
      {tab === "waiting" && <Section title={t("Your documents waiting on another approver", "مستنداتك بانتظار معتمد آخر")}>
        <DataTable<ApprovalItem & Record<string, unknown>> rows={rowsW as (ApprovalItem & Record<string, unknown>)[]} cols={colsW} rowKey={(r) => `${r.doctype}|${r.name}`} pageSize={20} empty={t("None of your documents is waiting on someone else", "لا يوجد من مستنداتك ما ينتظر غيرك")} />
      </Section>}
      {quick.length > 0 && <Section title={t("Quick actions", "إجراءات سريعة")}>
        <div className="flex flex-wrap gap-2" data-inbox-quick>{quick.map((x) => <NewDoc key={x.doctype} doctype={x.doctype} defaults={{}} label={ar ? x.ar : x.en} />)}</div>
        <p className="mt-2 text-xs text-muted-foreground">{t("Only documents your roles may create are offered; each opens a new draft form.", "تظهر فقط المستندات التي تسمح أدوارك بإنشائها؛ ويفتح كل منها نموذج مسودة جديدة.")}</p>
      </Section>}
      {!approvals.length && !tasks.length && !waiting.length && !own.length && <Empty>{t("Your inbox is clear.", "صندوق الوارد فارغ.")}</Empty>}
    </div>
  );
}
