/**
 * Owner notes C-07 activities, tasks, meetings and calls (/digit-crm/activities) on the Enterprise RecordList — the same
 * style as the lead list: saved-view tabs per kind and time, chips, type icon tiles, overdue red / today amber rows, owner
 * avatars, a calendar view coloured by type, bulk reschedule (tasks) and the shared quick view. Rows come only from
 * activityDesk.activityRows; task writes go through wf01 / salesDesk.
 */
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { leadTitle } from "./leadDesk";
import { useState } from "react";
import { toast } from "sonner";
import { useLang } from "@/i18n";
import { adapter } from "@/lib/adapter";
import { EntDialog } from "@/components/enterprise/Surfaces";
import { peekRow } from "@/components/enterprise/QuickView";
import { RecordList, SplitButton, type RlBulk, type RlChip, type RlColumn, type RlField, type RlRowAction, type RlView } from "@/components/enterprise/kit/RecordList";
import { Pill } from "@/components/enterprise/kit/RecordFrame";
import { KpiRow, type KpiItem } from "@/components/enterprise/kit/templates";
import { CrmFrame, TaskDialog } from "./CrmApp";
import { DeptPanel } from "./Workspace";
import { completeTask } from "./wf01";
import { bulkReschedule, shiftDue } from "./salesDesk";
import { ACT_HUE, ACT_ICON, ACT_KINDS, ACT_LABEL, activityRows, activityStrip, BUCKET_LABEL, BUCKET_TONE, ACT_BUCKETS, type ActKind, type ActRow } from "./activityDesk";
import { OwnerTag, personLabel, tx } from "./CrmRecordParts";
import { LEAD_HUE_VAR } from "./leadCard";
import { linkTitle } from "@/lib/linkTitle";
import { KindTile } from "./activityTile";
export { KindTile } from "./activityTile";

const s = (v: unknown) => String(v ?? "");
const kindLabel = (k: ActKind, ar: boolean) => ACT_LABEL[k][ar ? 1 : 0];
const HUE_VAR: Record<string, string> = { ...LEAD_HUE_VAR, coral: "var(--coral)" };
const fmtWhen = (v: string, ar: boolean) => { const d = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/.exec(v); if (!d) return "—"; const h = d[4] ? ` ${d[4]}:${d[5]}` : ""; return `${d[3]}/${d[2]}/${d[1]}${h}`; };
const refTitle = (r: ActRow) => (r.refDt === "CRM Deal" ? linkTitle("CRM Organization", adapter.get("CRM Deal", r.refName)?.["organization"]) || r.refName : r.refDt === "CRM Lead" ? (() => { const l = adapter.get("CRM Lead", r.refName); return l ? leadTitle(l) : r.refName; })() : r.refName);

/** Legacy ?kind=Task|Note|Call opens the matching saved view. */
export function ActivityListPage({ kind }: { kind?: "Task" | "Note" | "Call" | undefined }) {
  const ar = useLang() === "ar";
  return <CrmFrame title={tx(ar, "Activities", "الأنشطة")} subtitle={tx(ar, "Tasks, meetings, calls, notes and messages across leads and deals — click a row for the quick view.", "المهام والاجتماعات والمكالمات والملاحظات والرسائل على العملاء والصفقات — انقر الصف للعرض السريع.")}>
    {(user) => <Body user={user} ar={ar} first={kind === "Task" ? "task" : kind === "Note" ? "note" : kind === "Call" ? "call" : undefined} />}</CrmFrame>;
}

function Body({ user, ar, first }: { user: string; ar: boolean; first?: string | undefined }) {
  const nav = useNavigate();
  const q = useSearch({ strict: false }) as { view?: string | undefined };
  const view = q.view ?? first;
  const rows = activityRows(user);
  const [resched, setResched] = useState<string[] | null>(null);
  const [newTask, setNewTask] = useState(false);
  const now = new Date(); const week = Date.now() - 7 * 864e5;
  const inWeek = (r: ActRow) => { const t = Date.parse(r.when.replace(" ", "T")); return Number.isFinite(t) && t >= week && t <= Date.now(); };
  const views: RlView<ActRow>[] = [
    { key: "all", label: tx(ar, "All activities", "كل الأنشطة"), test: () => true },
    { key: "mine", label: tx(ar, "Mine", "أنشطتي"), test: (r) => r.owner === user },
    { key: "task", label: tx(ar, "Tasks", "المهام"), test: (r) => r.kind === "task" },
    { key: "meeting", label: tx(ar, "Meetings", "الاجتماعات"), test: (r) => r.kind === "meeting" },
    { key: "call", label: tx(ar, "Call centre", "مركز الاتصال"), test: (r) => r.kind === "call" },
    { key: "note", label: tx(ar, "Notes", "الملاحظات"), test: (r) => r.kind === "note" },
    { key: "message", label: tx(ar, "Email & WhatsApp", "البريد وواتساب"), test: (r) => r.kind === "email" || r.kind === "whatsapp" },
    { key: "overdue", label: tx(ar, "Overdue", "المتأخرة"), test: (r) => r.bucket === "overdue" },
  ];
  const owners = [...new Set(rows.map((r) => r.owner))].map((o) => ({ value: o, label: o ? personLabel(o, ar) || o : tx(ar, "No owner", "بدون مالك") }));
  const kindOpts = ACT_KINDS.map((k) => ({ value: k, label: kindLabel(k, ar) }));
  const bucketOpts = ACT_BUCKETS.map((k) => ({ value: k, label: BUCKET_LABEL[k][ar ? 1 : 0] }));
  const relOpts = [["CRM Lead", tx(ar, "Lead", "عميل محتمل")], ["CRM Deal", tx(ar, "Deal", "صفقة")], ["", tx(ar, "Not linked", "غير مرتبط")]].map(([value, label]) => ({ value: value!, label: label! }));
  const chips: RlChip<ActRow>[] = [
    { key: "kind", label: tx(ar, "Type", "النوع"), get: (r) => r.kind, options: kindOpts },
    { key: "bucket", label: tx(ar, "When", "التوقيت"), get: (r) => r.bucket, options: bucketOpts },
    { key: "owner", label: tx(ar, "Owner", "المالك"), get: (r) => r.owner, options: owners },
    { key: "ref", label: tx(ar, "Linked to", "مرتبط بـ"), get: (r) => r.refDt, options: relOpts, more: true },
  ];
  const fields: RlField<ActRow>[] = [
    { key: "title", label: tx(ar, "Title", "العنوان"), type: "text", get: (r) => r.title }, { key: "kind", label: tx(ar, "Type", "النوع"), type: "select", get: (r) => r.kind, options: kindOpts },
    { key: "bucket", label: tx(ar, "When", "التوقيت"), type: "select", get: (r) => r.bucket, options: bucketOpts }, { key: "owner", label: tx(ar, "Owner", "المالك"), type: "select", get: (r) => r.owner, options: owners },
    { key: "day", label: tx(ar, "Date", "التاريخ"), type: "date", get: (r) => r.day }, { key: "ref", label: tx(ar, "Linked record", "السجل المرتبط"), type: "text", get: (r) => `${refTitle(r)} ${r.refName}` },
  ];
  const columns: RlColumn<ActRow>[] = [
    { key: "title", label: tx(ar, "Activity", "النشاط"), fixed: true, minWidth: 230, sortValue: (r) => r.title, filterValue: (r) => r.title,
      render: (r) => <span className="ek-rl-name"><KindTile k={r.kind} ar={ar} /><span className="min-w-0"><span className="block truncate font-semibold" data-no-i18n>{r.title}</span><small className="ek-rl-sub">{kindLabel(r.kind, ar)}</small></span></span> },
    { key: "when", label: tx(ar, "When", "الموعد"), sortValue: (r) => r.when || "0", render: (r) => <span className="block whitespace-nowrap" data-when-bucket={r.bucket}><bdi dir="ltr" className="text-xs tabular-nums" data-no-i18n>{fmtWhen(r.when, ar)}</bdi>{(r.bucket === "overdue" || r.bucket === "today") && <> <Pill tone={BUCKET_TONE[r.bucket] === "bad" ? "bad" : "warn"}>{BUCKET_LABEL[r.bucket][ar ? 1 : 0]}</Pill></>}</span> },
    { key: "bucket", label: tx(ar, "Status", "الحالة"), sortValue: (r) => ACT_BUCKETS.indexOf(r.bucket), filterValue: (r) => r.bucket, filterOptions: bucketOpts, render: (r) => <Pill tone={BUCKET_TONE[r.bucket] === "neutral" ? "neutral" : BUCKET_TONE[r.bucket] as "bad" | "warn" | "info" | "ok"} attrs={{ "data-act-bucket": r.bucket }}>{BUCKET_LABEL[r.bucket][ar ? 1 : 0]}</Pill> },
    { key: "ref", label: tx(ar, "Linked to", "مرتبط بـ"), minWidth: 170, sortValue: (r) => refTitle(r), filterValue: (r) => `${refTitle(r)} ${r.refName}`,
      render: (r) => r.refDt === "CRM Deal" ? <Link to="/digit-crm/deals/$dealId" params={{ dealId: r.refName }} className="block truncate text-primary hover:underline" data-no-i18n>{refTitle(r)}</Link> : r.refDt === "CRM Lead" ? <Link to="/digit-crm/leads/$leadId" params={{ leadId: r.refName }} className="block truncate text-primary hover:underline" data-no-i18n>{refTitle(r)}</Link> : <span className="ek-rl-sub">—</span> },
    { key: "owner", label: tx(ar, "Owner", "المالك"), sortValue: (r) => personLabel(r.owner, ar), filterValue: (r) => r.owner, filterOptions: owners, render: (r) => <OwnerTag user={r.owner} ar={ar} /> },
    { key: "kind", label: tx(ar, "Type", "النوع"), defaultHidden: true, sortValue: (r) => r.kind, filterValue: (r) => r.kind, filterOptions: kindOpts, render: (r) => <span>{kindLabel(r.kind, ar)}</span> },
  ];
  const openTask = (r: ActRow) => r.kind === "task" && (r.bucket === "overdue" || r.bucket === "today" || r.bucket === "upcoming" || r.bucket === "undated");
  const rowActions: RlRowAction<ActRow>[] = [
    { key: "done", label: tx(ar, "Mark done", "إنهاء"), icon: "✓", hidden: (r) => !openTask(r), run: (r) => { const x = completeTask(r.name, user); if (x.ok) toast.success(tx(ar, "Task completed", "اكتملت المهمة")); else toast.error(Object.values(x.errors)[0]); } },
    { key: "tomorrow", label: tx(ar, "Move to tomorrow", "تأجيل ليوم"), icon: "↻", hidden: (r) => !openTask(r), run: (r) => { const x = bulkReschedule([r.name], shiftDue(r.when, 1), user); if (x.moved.length) toast.success(tx(ar, "Moved by one day", "أُجّلت يومًا")); else toast.error(x.refused[0]?.error ?? ""); } },
  ];
  const tasksOf = (keys: string[]) => keys.map((k) => rows.find((r) => r.key === k)).filter((r): r is ActRow => !!r && openTask(r)).map((r) => r.name);
  const bulk: RlBulk[] = [
    { key: "reschedule", label: tx(ar, "Reschedule", "إعادة الجدولة"), run: (keys) => { const t = tasksOf(keys); if (!t.length) { toast.error(tx(ar, "Only open tasks can be rescheduled", "إعادة الجدولة للمهام المفتوحة فقط")); return; } setResched(t); } },
    { key: "done", label: tx(ar, "Mark done", "إنهاء"), run: (keys) => { const t = tasksOf(keys); let n = 0; for (const k of t) if (completeTask(k, user).ok) n++; toast.success(tx(ar, `${n} completed · ${keys.length - n} skipped (not open tasks)`, `اكتمل ${n} · تُخطّي ${keys.length - n} (ليست مهام مفتوحة)`)); } },
  ];
  const by = (k: ActKind) => rows.filter((r) => r.kind === k);
  const v = (key: string) => (n: React.ReactNode) => <Link to="/digit-crm/activities" search={{ view: key } as never} className="contents">{n}</Link>;
  const doneWeek = rows.filter((r) => r.kind === "task" && r.bucket === "done" && r.doc && inWeek({ ...r, when: s(r.doc["modified"] || r.when) })).length;
  const kpis: KpiItem[] = [
    { id: "a:today", label: tx(ar, "Due today", "مستحقة اليوم"), value: String(rows.filter((r) => r.bucket === "today").length), tone: "attention", wrap: v("all") },
    { id: "a:overdue", label: tx(ar, "Overdue", "متأخرة"), value: String(rows.filter((r) => r.bucket === "overdue").length), tone: "risk", wrap: v("overdue") },
    { id: "a:tasks", label: tx(ar, "Open tasks", "مهام مفتوحة"), value: String(by("task").filter(openTask).length), sub: tx(ar, `${doneWeek} done in the last 7 days`, `${doneWeek} أُنجزت خلال 7 أيام`), tone: "info", wrap: v("task") },
    { id: "a:meetings", label: tx(ar, "Meetings ahead", "اجتماعات قادمة"), value: String(by("meeting").filter((r) => r.bucket === "today" || r.bucket === "upcoming").length), sub: tx(ar, `${by("meeting").length} in total`, `${by("meeting").length} إجمالًا`), wrap: v("meeting") },
    { id: "a:calls", label: tx(ar, "Calls (7 days)", "مكالمات (7 أيام)"), value: String(by("call").filter(inWeek).length), sub: tx(ar, `${by("call").length} logged`, `${by("call").length} مسجّلة`), tone: "good", wrap: v("call") },
    { id: "a:notes", label: tx(ar, "Notes & messages", "ملاحظات ورسائل"), value: String(by("note").length + by("email").length + by("whatsapp").length), wrap: v("note") },
  ];
  return <>
    <DeptPanel dept="activities" />
    <KpiRow id="crm:activities" ar={ar} items={kpis} />
    <RecordList<ActRow> key={view ?? "all"} id="digit_crm:activities" doctype="CRM Task" ar={ar} rows={rows} rowKey={(r) => r.key} views={views} chips={chips} fields={fields} columns={columns} defaultView={view}
      title={<>{tx(ar, "Activities", "الأنشطة")} <bdi className="ek-sc-n tabular-nums" data-no-i18n>{rows.length}</bdi></>}
      actions={<SplitButton ar={ar} label={<>+ {tx(ar, "New task", "مهمة جديدة")}</>} onClick={() => setNewTask(true)} attrs={{ "data-act-new": "" }}
        items={[{ key: "follow", label: tx(ar, "Follow-up centre", "مركز المتابعات"), run: () => void nav({ to: "/digit-crm/follow-ups" }) },
          { key: "tasks", label: tx(ar, "Classic task list", "قائمة المهام الكلاسيكية"), run: () => void nav({ to: "/digit-crm/follow-ups" }) },
          { key: "calls", label: tx(ar, "Classic call logs", "سجلات المكالمات الكلاسيكية"), run: () => void nav({ to: "/digit-crm/activities" }) },
          { key: "events", label: tx(ar, "Classic calendar events", "الأحداث الكلاسيكية"), run: () => void nav({ to: "/app/$app/$doctype", params: { app: "frappe", doctype: "event" } }) }]} />}
      strip={{ tabs: (xs) => activityStrip(xs), of: (r) => r.bucket }} search={(r) => `${r.title} ${refTitle(r)} ${r.refName} ${r.name}`}
      rowActions={rowActions} bulk={bulk} tone={(r) => (r.bucket === "overdue" ? "bad" : r.bucket === "today" ? "warn" : undefined)}
      calendar={{ date: (r) => r.day, label: (r) => <><span aria-hidden>{ACT_ICON[r.kind]}</span> <bdi data-no-i18n>{r.title}</bdi></>, hue: (r) => HUE_VAR[ACT_HUE[r.kind]] ?? "var(--blue)",
        legend: ACT_KINDS.map((k) => ({ key: k, label: kindLabel(k, ar), hue: HUE_VAR[ACT_HUE[k]] ?? "var(--blue)" })) }}
      groups={[{ key: "kind", label: tx(ar, "Type", "النوع"), of: (r) => r.kind, labelOf: (x) => kindLabel(x as ActKind, ar) }, { key: "owner", label: tx(ar, "Owner", "المالك"), of: (r) => r.owner, labelOf: (x) => (x && x !== "—" ? personLabel(x, ar) || x : tx(ar, "No owner", "بدون مالك")) }, { key: "ref", label: tx(ar, "Linked record", "السجل المرتبط"), of: (r) => r.refName, labelOf: (x) => { const r = rows.find((y) => y.refName === x); return r ? refTitle(r) : x; } }]}
      onOpen={(r, _keys, el) => peekRow(r.doctype, r.name, rows.filter((x) => x.doctype === r.doctype).map((x) => x.name), el)}
      empty={{ title: tx(ar, "No activities yet", "لا توجد أنشطة بعد"), hint: tx(ar, "Schedule a task or log a call on a lead or deal.", "جدول مهمة أو سجّل مكالمة على عميل أو صفقة."), action: <button type="button" className="btn-primary" onClick={() => setNewTask(true)}>{tx(ar, "New task", "مهمة جديدة")}</button> }} />
    {resched && <RescheduleDialog names={resched} user={user} ar={ar} first={rows.find((r) => r.name === resched[0])?.when} onClose={() => setResched(null)} />}
    {newTask && <TaskDialog user={user} onClose={() => setNewTask(false)} />}
  </>;
}

function RescheduleDialog({ names, user, ar, first, onClose }: { names: string[]; user: string; ar: boolean; first?: string | undefined; onClose: () => void }) {
  const [due, setDue] = useState(() => shiftDue(first, 1));
  const run = (when: string) => {
    const r = bulkReschedule(names, when, user);
    if (r.moved.length) toast.success(tx(ar, `${r.moved.length} task(s) rescheduled`, `أُعيدت جدولة ${r.moved.length} مهمة`), { description: when.replace("T", " ") });
    if (r.refused.length) toast.error(tx(ar, `${r.refused.length} refused`, `رُفض ${r.refused.length}`), { description: r.refused.map((x) => `${x.name}: ${x.error}`).join(" · ") });
    onClose();
  };
  return <EntDialog open onOpenChange={(o) => { if (!o) onClose(); }} id="crm-act-reschedule" size="sm" title={tx(ar, "Reschedule tasks", "إعادة جدولة المهام")} kicker={<span><bdi data-no-i18n>{names.length}</bdi> {tx(ar, "selected", "محدد")}</span>}
    footer={<><button type="button" className="btn-ghost" onClick={onClose}>{tx(ar, "Cancel", "إلغاء")}</button><button type="button" className="btn-primary" disabled={!due} onClick={() => run(due)} data-act-resched-save>{tx(ar, "Save", "حفظ")}</button></>}>
    <div className="mb-3 flex flex-wrap gap-2">{[1, 3, 7].map((n) => <button key={n} type="button" className="ek-focus-chip" onClick={() => run(shiftDue(undefined, n))} data-act-resched-quick={n}>{ar ? (n === 1 ? "بعد يوم" : `بعد ${n} أيام`) : `+${n} day${n === 1 ? "" : "s"}`}</button>)}</div>
    <label className="grid gap-1 text-sm"><span className="text-muted-foreground">{tx(ar, "Or pick the new due date and time", "أو اختر الموعد الجديد")}</span><input dir="ltr" type="datetime-local" className="field-input" value={due} onChange={(e) => setDue(e.target.value)} data-act-resched-due /></label>
  </EntDialog>;
}
