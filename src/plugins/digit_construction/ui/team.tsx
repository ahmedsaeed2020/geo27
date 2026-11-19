/**
 * PRJ-TEAM-EXT Project team & responsibilities. Per project: dated memberships (person, role, responsibility scope,
 * primary, status) from the Project's own team table, informational checks, add → validate → review → confirm →
 * read-back, edit, end with a reason (never delete) and the change history from the Project timeline. Across projects
 * (?view=people): who is active where, crew memberships and concurrency checks. Membership grants no permission and
 * assigns no task. URL state: ?project=&view=&person=&role=&status=&scope=&mode=add|edit|end&row=<idx>.
 */
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useState } from "react";
import { notifyError, notifySaved } from "./notify";
import { adapter, type Doc } from "@/lib/adapter";
import { cachedMeta } from "@/lib/catalog";
import { formatRowAnchor } from "@/lib/rowAnchor";
import { useScopeMetas } from "@/lib/scope";
import { hasPerm } from "@/lib/session";
import type { PluginPageProps } from "@/plugins/pages";
import { APP, byProject, projectTitle, today } from "../domain/data";
import { canSeeRecord, restrictedLabel } from "../domain/access";
import { constructionProjects } from "../domain/queues";
import { addAssignment, editAssignment, endAssignment, inputIssues, peopleAllocation, SCOPES, TEAM_STATUSES, TEAM_TABLE, teamChecks, teamHistory, teamOf, teamRoles, type AssignmentInput, type Issue, type Scope, type TeamRow } from "../domain/team";
import { OPTION_AR } from "../schema";
import { AppLink, BTN, DataTable, dateTxt, DocRef, Empty, Field, Filters, inputCls, Kpi, KpiGrid, Note, p360, PageHeader, Section, StateBadge, useCx, type Col } from "./kit";
import { DateInput } from "@/components/form/DateInput";

type Search = Record<string, string | undefined>;
const ROUTE = "team";

function useTeamUrl() {
  const raw = useRouterState({ select: (s) => s.location.search as Record<string, unknown> });
  const nav = useNavigate();
  const q: Search = Object.fromEntries(Object.entries(raw).filter(([, v]) => typeof v === "string" && v !== "").map(([k, v]) => [k, String(v)]));
  const go = (patch: Search, replace = false) => {
    const next = Object.fromEntries(Object.entries({ ...q, ...patch }).filter(([, v]) => v !== undefined && v !== ""));
    void nav({ to: "/plugins/$name/$", params: { name: APP, _splat: ROUTE }, search: next as never, replace });
  };
  return { q, go };
}
const optAr = (v: string, ar: boolean) => (ar ? OPTION_AR[v] ?? v : v);
const msg = (e: Issue, ar: boolean) => (ar ? e.ar : e.en);

export function TeamPage(_: PluginPageProps) {
  const { t, ar } = useCx();
  const { q, go } = useTeamUrl();
  useScopeMetas(["Project", "Task", "Employee", "User", "Digit Crew", "Comment"]);
  const projects = constructionProjects();
  const p = q["project"] ? projects.find((x) => x.name === q["project"]) : undefined;
  const header = (
    <PageHeader title={t("Project team & responsibilities", "فريق المشروع والمسؤوليات")}
      crumbs={[{ label: t("Projects workspace", "مساحة المشاريع"), to: "dept/prj" }, ...(p ? [{ label: projectTitle(p, !ar), to: p360(p.name) }] : [])]}
      subtitle={t("Dated memberships, roles and responsibility scope. Being on the team grants no permission and assigns no task.", "عضويات مؤرخة وأدوار ونطاق مسؤولية. العضوية في الفريق لا تمنح صلاحية ولا تُسند مهمة.")}
      actions={<button type="button" className={BTN.secondary} onClick={() => go({ view: q["view"] === "people" ? undefined : "people", mode: undefined, row: undefined })} data-team-people-toggle>{q["view"] === "people" ? t("Back to project team", "العودة إلى فريق المشروع") : t("People across projects", "الأشخاص عبر المشاريع")}</button>} />
  );
  if (!cachedMeta("Project")) return <div className="w-full min-w-0" data-page="construction-team">{header}<p className="p-6 text-muted-foreground" role="status">{t("Loading…", "جارٍ التحميل…")}</p></div>;
  if (q["view"] === "people") return <div className="w-full min-w-0" data-page="construction-team" data-team-view="people">{header}<PeopleView /></div>;
  if (!p) {
    return (
      <div className="w-full min-w-0" data-page="construction-team">
        {header}
        {q["project"] && <Note tone="bad"><span data-team-denied>{t("This project is not available here: it is not a construction project, or your role cannot read it.", "هذا المشروع غير متاح هنا: ليس مشروع مقاولات أو لا يملك دورك صلاحية قراءته.")}</span></Note>}
        {projects.length
          ? <Section title={t("Select a project", "اختر مشروعاً")}><div className="flex flex-wrap gap-2" data-team-project-picker>{projects.map((x) => <button key={x.name} type="button" className={BTN.secondary} onClick={() => go({ project: x.name })} data-team-pick={x.name}><span data-no-i18n>{projectTitle(x, !ar)}</span></button>)}</div></Section>
          : <Empty>{t("No construction project is available to you.", "لا يوجد مشروع مقاولات متاح لك.")}</Empty>}
      </div>
    );
  }
  return <div className="w-full min-w-0" data-page="construction-team" data-team-project={p.name}>{header}<ProjectTeam p={p} q={q} go={go} /></div>;
}

function ProjectTeam({ p, q, go }: { p: Doc; q: Search; go: (s: Search, replace?: boolean) => void }) {
  const { t, ar } = useCx();
  const meta = cachedMeta("Project");
  const canWrite = !!meta && hasPerm(meta, "write", p);
  const all = teamOf(p);
  const checks = teamChecks(p);
  const person = (q["person"] ?? "").toLowerCase();
  const shown = all.filter((r) => (!person || r.employee.toLowerCase().includes(person) || r.employee_name.toLowerCase().includes(person)) && (!q["role"] || r.role === q["role"]) && (!q["status"] || r.status === q["status"]) && (!q["scope"] || r.scope === q["scope"]));
  const roles = teamRoles();
  const mode = q["mode"]; const rowIdx = Number(q["row"] ?? 0);
  const target = mode === "edit" || mode === "end" ? all.find((r) => r.idx === rowIdx) : undefined;
  const count = (st: string) => all.filter((r) => r.status === st).length;
  const cols: Col<TeamRow & { name: string }>[] = [
    { key: "member", label: t("Member", "العضو"), render: (r) => <span><DocRef doctype="Employee" name={r.employee}><span data-no-i18n>{r.employee_name}</span></DocRef>{canSeeRecord("Employee", r.employee) && <code className="block text-[11px] text-muted-foreground" data-no-i18n>{r.employee}</code>}</span> },
    { key: "role", label: t("Role", "الدور"), render: (r) => <span data-no-i18n>{optAr(r.role, ar)}{r.primary && <span className="ms-1 rounded bg-primary/10 px-1 text-[10px] text-primary" data-team-primary>{t("primary", "أساسي")}</span>}</span> },
    { key: "scope", label: t("Responsibility", "المسؤولية"), render: (r) => <span data-no-i18n>{optAr(r.scope, ar)}{r.work_package && <> · <DocRef doctype="Digit Work Package" name={r.work_package}>{String(adapter.get("Digit Work Package", r.work_package)?.["work_package_name"] ?? r.work_package)}</DocRef></>}{r.task && <> · <DocRef doctype="Task" name={r.task}>{String(adapter.get("Task", r.task)?.["subject"] ?? r.task)}</DocRef></>}</span> },
    { key: "from", label: t("From", "من"), render: (r) => <span data-no-i18n>{dateTxt(r.from)}{!r.from_set && <small className="block text-[10px] text-muted-foreground">{t("project start", "بداية المشروع")}</small>}</span> },
    { key: "to", label: t("To", "إلى"), render: (r) => <span data-no-i18n>{r.to ? dateTxt(r.to) : t("open", "مفتوح")}</span> },
    { key: "status", label: t("Status", "الحالة"), render: (r) => <span data-team-status={r.status}><StateBadge state={r.status} /></span> },
    { key: "user", label: t("User", "المستخدم"), render: (r) => <span className="text-xs" data-no-i18n>{r.user || "—"}</span> },
    { key: "flags", label: t("Checks", "التحقق"), render: (r) => r.flags.length ? <ul className="text-xs text-warning" data-team-flags={r.idx}>{r.flags.map((f, i) => <li key={i}>{msg(f, ar)}</li>)}</ul> : <span className="text-muted-foreground">—</span> },
    { key: "actions", label: t("Actions", "الإجراءات"), render: (r) => <div className="flex flex-wrap gap-1">
      <DocRef doctype="Project" name={p.name} row={formatRowAnchor(TEAM_TABLE, r.idx)} className={BTN.compact}>{t("Row in project", "الصف في المشروع")}</DocRef>
      {canWrite && r.status !== "Ended" && <button type="button" className={BTN.compact} onClick={() => go({ mode: "edit", row: String(r.idx) })} data-team-edit={r.idx}>{t("Edit", "تعديل")}</button>}
      {canWrite && r.status !== "Ended" && <button type="button" className={BTN.compact} onClick={() => go({ mode: "end", row: String(r.idx) })} data-team-end={r.idx}>{t("End", "إنهاء")}</button>}
    </div> },
  ];
  return (
    <>
      <KpiGrid>
        <Kpi label={t("Active members", "الأعضاء النشطون")} value={count("Active")} />
        <Kpi label={t("Upcoming", "قادمون")} value={count("Upcoming")} />
        <Kpi label={t("Ended", "منتهية")} value={count("Ended")} />
        <Kpi label={t("Roles covered", "الأدوار المغطاة")} value={new Set(all.filter((r) => r.status === "Active").map((r) => r.role)).size} hint={t(`of ${roles.length} roles`, `من ${roles.length} أدوار`)} />
        <Kpi label={t("Checks", "التحقق")} value={checks.length} tone={checks.length ? "warn" : "good"} />
      </KpiGrid>
      {checks.length > 0 && <Section title={t("Team checks", "تحقق الفريق")}><ul className="space-y-1 text-sm" data-team-checks>{checks.map((c, i) => <li key={i}>• {msg(c, ar)}</li>)}</ul><p className="mt-2 text-xs text-muted-foreground">{t("Informational: primary, concurrency and coverage rules are not defined by the owner, so nothing is blocked.", "للمعلومية: قواعد العضو الأساسي والتزامن والتغطية غير محددة من المالك، لذا لا يُمنع شيء.")}</p></Section>}
      {canWrite && (mode === "add" || (mode === "edit" && target)) && <AssignmentForm key={`${mode}-${rowIdx}`} p={p} row={mode === "edit" ? target : undefined} onClose={() => go({ mode: undefined, row: undefined })} />}
      {canWrite && mode === "end" && target && <EndForm key={`end-${rowIdx}`} p={p} row={target} onClose={() => go({ mode: undefined, row: undefined })} />}
      {(mode === "edit" || mode === "end") && !target && <Note tone="bad"><span data-team-row-missing>{t("That assignment is no longer on the project (the team changed). Pick it again from the list.", "هذا التعيين لم يعد في المشروع (تغيّر الفريق). اختره مجددًا من القائمة.")}</span></Note>}
      {!canWrite && <Note>{t("You can read this team. Changing it needs write access to the project.", "يمكنك قراءة هذا الفريق. تعديله يحتاج صلاحية كتابة على المشروع.")}</Note>}
      <Section title={t("Team register", "سجل الفريق")} actions={canWrite && mode !== "add" ? <button type="button" className={BTN.primary} onClick={() => go({ mode: "add", row: undefined })} data-team-add>{t("Add member", "إضافة عضو")}</button> : undefined}>
        <Filters>
          <Field label={t("Person", "الشخص")}><input className={inputCls} value={q["person"] ?? ""} onChange={(e) => go({ person: e.target.value || undefined }, true)} placeholder={t("Name or ID", "الاسم أو الرقم")} data-team-filter="person" /></Field>
          <Field label={t("Role", "الدور")}><select className={inputCls} value={q["role"] ?? ""} onChange={(e) => go({ role: e.target.value || undefined }, true)} data-team-filter="role"><option value="">{t("All", "الكل")}</option>{roles.map((r) => <option key={r} value={r}>{optAr(r, ar)}</option>)}</select></Field>
          <Field label={t("Status", "الحالة")}><select className={inputCls} value={q["status"] ?? ""} onChange={(e) => go({ status: e.target.value || undefined }, true)} data-team-filter="status"><option value="">{t("All", "الكل")}</option>{TEAM_STATUSES.map((s) => <option key={s} value={s}>{optAr(s, ar)}</option>)}</select></Field>
          <Field label={t("Responsibility", "المسؤولية")}><select className={inputCls} value={q["scope"] ?? ""} onChange={(e) => go({ scope: e.target.value || undefined }, true)} data-team-filter="scope"><option value="">{t("All", "الكل")}</option>{SCOPES.map((s) => <option key={s} value={s}>{optAr(s, ar)}</option>)}</select></Field>
        </Filters>
        <DataTable rows={shown.map((r) => ({ ...r, name: `${r.idx}` }))} cols={cols} rowKey={(r) => `${r.idx}`} empty={all.length ? t("No assignment matches these filters.", "لا يوجد تعيين يطابق هذه المرشحات.") : t("No team recorded on this project yet.", "لا يوجد فريق مسجل على هذا المشروع بعد.")} />
      </Section>
      <History project={p.name} />
      <p className="mt-2 text-xs text-muted-foreground">{t("Stored on the project's own team table; the native project form shows the same rows. Ending an assignment keeps it as history; task assignees and user permissions do not change.", "يُحفظ في جدول فريق المشروع نفسه؛ ويعرض نموذج المشروع الأصلي الصفوف ذاتها. إنهاء التعيين يبقيه سجلًا تاريخيًا؛ ولا يتغير المكلفون بالمهام أو صلاحيات المستخدمين.")} <AppLink to={p360(p.name)}>{t("Project 360", "مساحة المشروع 360")}</AppLink></p>
    </>
  );
}

function AssignmentForm({ p, row, onClose }: { p: Doc; row: TeamRow | undefined; onClose: () => void }) {
  const { t, ar } = useCx();
  const edit = !!row;
  const [v, setV] = useState<AssignmentInput>(() => row
    ? { employee: row.employee, project_role: row.role, user: row.user, from_date: row.from_set ? row.from : "", to_date: row.to, responsibility: row.scope, work_package: row.work_package, task: row.task, is_primary: row.primary, notes: row.notes }
    : { employee: "", project_role: "", user: "", from_date: today(), to_date: "", responsibility: "Whole Project", work_package: "", task: "", is_primary: false, notes: "" });
  const [base, setBase] = useState(() => String(p["modified"] ?? ""));
  const [stage, setStage] = useState<"edit" | "review">("edit");
  const [issues, setIssues] = useState<Issue[]>([]);
  const [conflict, setConflict] = useState(false);
  const emps = adapter.list("Employee").filter((e) => !p["company"] || !e["company"] || e["company"] === p["company"]).filter((e) => (e["status"] ?? "Active") === "Active" || e.name === v.employee);
  const users = adapter.list("User").filter((u) => !["Guest", "Administrator"].includes(u.name) && Number(u["enabled"] ?? 1) !== 0);
  const wps = byProject("Digit Work Package", p.name), tasks = byProject("Task", p.name);
  const set = (patch: Partial<AssignmentInput>) => { setV({ ...v, ...patch }); setIssues([]); };
  const review = () => {
    const e = inputIssues(p, edit ? { ...v, from_date: v.from_date || row!.from } : v, row?.idx);
    setIssues(e); if (!e.length) setStage("review");
  };
  const save = () => {
    const r = edit ? editAssignment(p.name, row!.idx, row!.employee, v, base) : addAssignment(p.name, v, base);
    if (r.conflict) { setConflict(true); notifyError(msg(r.errors[0]!, ar)); return; }
    if (!r.ok) { setIssues(r.errors); setStage("edit"); notifyError(r.errors.map((e) => msg(e, ar)).join("\n")); return; }
    const back = teamOf(adapter.get("Project", p.name) ?? p).find((x) => x.idx === r.idx);
    notifySaved(r.reused ? t("Already recorded — nothing changed", "مسجل مسبقًا — لم يتغير شيء") : t(`Saved and read back: ${back?.employee_name ?? ""} · ${back?.role ?? ""}`, `حُفظ وأعيدت قراءته: ${back?.employee_name ?? ""} · ${optAr(back?.role ?? "", true)}`));
    onClose();
  };
  const reload = () => { setBase(String(adapter.get("Project", p.name)?.["modified"] ?? "")); setConflict(false); setStage("edit"); };
  const emp = (id: string) => (canSeeRecord("Employee", id) ? String(adapter.get("Employee", id)?.["employee_name"] ?? id) : restrictedLabel(!ar));
  return (
    <Section title={edit ? t("Edit assignment", "تعديل التعيين") : t("Add team member", "إضافة عضو للفريق")}>
      {conflict && <Note tone="bad"><span data-team-conflict>{t("The project was changed by someone else after you opened this form.", "غيّر شخص آخر المشروع بعد أن فتحت هذا النموذج.")}</span> <button type="button" className={`${BTN.compact} ms-2`} onClick={reload} data-team-reload>{t("Reload and review again", "أعد التحميل وراجع مجددًا")}</button></Note>}
      {stage === "edit" && <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); review(); }} data-team-form={edit ? "edit" : "add"}>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t("Employee", "الموظف")}><select className={inputCls} value={v.employee} disabled={edit} onChange={(e) => set({ employee: e.target.value })} data-team-input="employee"><option value="">{t("— choose —", "— اختر —")}</option>{emps.map((e) => <option key={e.name} value={e.name} data-no-i18n>{String(e["employee_name"] ?? e.name)} · {e.name}</option>)}</select></Field>
          <Field label={t("Role", "الدور")}><select className={inputCls} value={v.project_role} disabled={edit} onChange={(e) => set({ project_role: e.target.value })} data-team-input="role"><option value="">{t("— choose —", "— اختر —")}</option>{teamRoles().map((r) => <option key={r} value={r}>{optAr(r, ar)}</option>)}</select></Field>
          <Field label={t("Start date", "تاريخ البداية")}><DateInput className={inputCls} value={v.from_date} disabled={edit && row!.status !== "Upcoming"} onChange={(e) => set({ from_date: e.target.value })} data-team-input="from" /></Field>
          <Field label={t("End date (optional)", "تاريخ النهاية (اختياري)")}><DateInput className={inputCls} value={v.to_date ?? ""} onChange={(e) => set({ to_date: e.target.value })} data-team-input="to" /></Field>
          <Field label={t("Responsibility", "المسؤولية")}><select className={inputCls} value={v.responsibility} onChange={(e) => set({ responsibility: e.target.value as Scope })} data-team-input="scope">{SCOPES.map((s) => <option key={s} value={s}>{optAr(s, ar)}</option>)}</select></Field>
          {v.responsibility === "Work Package" && <Field label={t("Work package", "حزمة العمل")}><select className={inputCls} value={v.work_package ?? ""} onChange={(e) => set({ work_package: e.target.value })} data-team-input="work_package"><option value="">{t("— choose —", "— اختر —")}</option>{wps.map((w) => <option key={w.name} value={w.name} data-no-i18n>{String(w["code"] ?? "")} {String(w["work_package_name"] ?? w.name)}</option>)}</select></Field>}
          {v.responsibility === "Task" && <Field label={t("Task", "المهمة")}><select className={inputCls} value={v.task ?? ""} onChange={(e) => set({ task: e.target.value })} data-team-input="task"><option value="">{t("— choose —", "— اختر —")}</option>{tasks.map((k) => <option key={k.name} value={k.name} data-no-i18n>{String(k["subject"] ?? k.name)}</option>)}</select></Field>}
          <Field label={t("User (optional)", "المستخدم (اختياري)")}><select className={inputCls} value={v.user ?? ""} onChange={(e) => set({ user: e.target.value })} data-team-input="user"><option value="">{t("— none —", "— بلا —")}</option>{users.map((u) => <option key={u.name} value={u.name} data-no-i18n>{u.name}</option>)}</select></Field>
        </div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!v.is_primary} onChange={(e) => set({ is_primary: e.target.checked })} data-team-input="primary" />{t("Primary member for this role", "العضو الأساسي لهذا الدور")}</label>
        <Field label={t("Notes (project responsibility only — not an HR record)", "ملاحظات (مسؤولية المشروع فقط — ليست سجل موارد بشرية)")}><textarea className={`${inputCls} min-h-16`} value={v.notes ?? ""} onChange={(e) => set({ notes: e.target.value })} data-team-input="notes" /></Field>
        {issues.length > 0 && <ul className="space-y-1 text-xs text-destructive" role="alert" data-team-issues>{issues.map((e, i) => <li key={i}>{msg(e, ar)}</li>)}</ul>}
        <div className="flex flex-wrap gap-2">
          <button type="submit" className={BTN.primary} data-team-review>{t("Validate and review", "تحقق وراجع")}</button>
          <button type="button" className={BTN.secondary} onClick={onClose} data-team-cancel>{t("Cancel", "إلغاء")}</button>
        </div>
      </form>}
      {stage === "review" && <div data-team-review-panel>
        <dl className="mb-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          <dt className="text-muted-foreground">{t("Member", "العضو")}</dt><dd data-no-i18n>{emp(v.employee)} · {v.employee}</dd>
          <dt className="text-muted-foreground">{t("Role", "الدور")}</dt><dd data-no-i18n>{optAr(v.project_role, ar)}{v.is_primary ? ` · ${t("primary", "أساسي")}` : ""}</dd>
          <dt className="text-muted-foreground">{t("Period", "الفترة")}</dt><dd data-no-i18n>{dateTxt(v.from_date || row?.from)} → {v.to_date ? dateTxt(v.to_date) : t("open", "مفتوح")}</dd>
          <dt className="text-muted-foreground">{t("Responsibility", "المسؤولية")}</dt><dd data-no-i18n>{optAr(v.responsibility ?? "Whole Project", ar)} {v.responsibility === "Work Package" ? v.work_package : v.responsibility === "Task" ? v.task : ""}</dd>
        </dl>
        <Note>{t("Saving updates the project's team table only. It does not give this person access, assign tasks or change cost, payroll or schedule.", "الحفظ يحدّث جدول فريق المشروع فقط. لا يمنح هذا الشخص صلاحية ولا يُسند مهام ولا يغيّر التكلفة أو الرواتب أو الجدول.")}</Note>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={BTN.primary} onClick={save} disabled={conflict} data-team-confirm>{t("Confirm and save", "تأكيد وحفظ")}</button>
          <button type="button" className={BTN.secondary} onClick={() => setStage("edit")}>{t("Back to editing", "العودة للتعديل")}</button>
        </div>
      </div>}
    </Section>
  );
}

function EndForm({ p, row, onClose }: { p: Doc; row: TeamRow; onClose: () => void }) {
  const { t, ar } = useCx();
  const [end, setEnd] = useState(() => (row.from > today() ? row.from : today()));
  const [reason, setReason] = useState("");
  const [base, setBase] = useState(() => String(p["modified"] ?? ""));
  const [issues, setIssues] = useState<Issue[]>([]);
  const [conflict, setConflict] = useState(false);
  const run = () => {
    const r = endAssignment(p.name, row.idx, row.employee, end, reason, base);
    if (r.conflict) { setConflict(true); setIssues(r.errors); return; }
    if (!r.ok) { setIssues(r.errors); return; }
    notifySaved(t(`Assignment ends on ${end}`, `ينتهي التعيين في ${end}`)); onClose();
  };
  return (
    <Section title={t("End assignment", "إنهاء التعيين")}>
      <p className="mb-2 text-sm" data-no-i18n>{row.employee_name || restrictedLabel(!ar)} · {optAr(row.role, ar)} · {dateTxt(row.from)} → {row.to ? dateTxt(row.to) : t("open", "مفتوح")}</p>
      {conflict && <Note tone="bad"><span data-team-conflict>{t("The project was changed by someone else after you opened this form.", "غيّر شخص آخر المشروع بعد أن فتحت هذا النموذج.")}</span> <button type="button" className={`${BTN.compact} ms-2`} onClick={() => { setBase(String(adapter.get("Project", p.name)?.["modified"] ?? "")); setConflict(false); setIssues([]); }} data-team-reload>{t("Reload", "إعادة التحميل")}</button></Note>}
      <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); run(); }} data-team-form="end">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t("End date", "تاريخ النهاية")}><DateInput className={inputCls} value={end} onChange={(e) => { setEnd(e.target.value); setIssues([]); }} data-team-input="end" /></Field>
          <Field label={t("Reason", "السبب")}><input className={inputCls} value={reason} onChange={(e) => { setReason(e.target.value); setIssues([]); }} data-team-input="reason" /></Field>
        </div>
        {issues.length > 0 && <ul className="space-y-1 text-xs text-destructive" role="alert" data-team-issues>{issues.map((e, i) => <li key={i}>{msg(e, ar)}</li>)}</ul>}
        <p className="text-xs text-muted-foreground">{t("The row stays on the project as history. Task assignees and user permissions do not change.", "يبقى الصف على المشروع كسجل تاريخي. لا يتغير المكلفون بالمهام أو صلاحيات المستخدمين.")}</p>
        <div className="flex flex-wrap gap-2">
          <button type="submit" className={BTN.danger} disabled={conflict} data-team-end-confirm>{t("End assignment", "إنهاء التعيين")}</button>
          <button type="button" className={BTN.secondary} onClick={onClose}>{t("Cancel", "إلغاء")}</button>
        </div>
      </form>
    </Section>
  );
}

/** Arabic display of a stored team history line (the stored comment stays English for the native timeline). */
export function historyAr(content: string): string {
  const keys = Object.keys(OPTION_AR).sort((a, b) => b.length - a.length);
  const seg = (x: string) => { if (x === "primary") return "أساسي"; const k = keys.find((k) => x === k || x.startsWith(`${k} `)); return k ? `${OPTION_AR[k]}${x.slice(k.length)}` : x; };
  const [main = "", reason] = content.split(" — reason: ");
  const m = /^(added |changed row (\d+): |ended row (\d+) on (\S+): )(.*)$/.exec(main);
  if (!m) return content;
  const head = m[1] === "added " ? "أضاف " : m[2] ? `عدّل الصف ${m[2]}: ` : `أنهى الصف ${m[3]} في ${m[4]}: `;
  const body = m[5]!.split(" · ").map((x, i) => (i === 0 ? x : seg(x.replace("project start", "بداية المشروع").replace(/→ open$/, "→ مفتوح")))).join(" · ");
  return `${head}${body}${reason !== undefined ? ` — السبب: ${reason}` : ""}`;
}

function History({ project }: { project: string }) {
  const { t, ar } = useCx();
  const h = teamHistory(project);
  return (
    <Section title={t("Team change history", "سجل تغييرات الفريق")}>
      {!h.length ? <Empty>{t("No team change recorded from this screen yet.", "لم يُسجل أي تغيير على الفريق من هذه الشاشة بعد.")}</Empty>
        : <ul className="divide-y divide-border text-sm" data-team-history>{h.map((e) => <li key={e.name} className="py-2"><div className="text-xs text-muted-foreground" data-no-i18n>{e.at.replace("T", " ").slice(0, 19)} · {e.by}</div><div data-no-i18n>{ar ? historyAr(e.content) : e.content}</div></li>)}</ul>}
    </Section>
  );
}

function PeopleView() {
  const { t, ar } = useCx();
  const { q, go } = useTeamUrl();
  const all = peopleAllocation();
  const shown = q["flagged"] ? all.filter((x) => x.flags.length) : all;
  const ps = new Map(constructionProjects().map((p) => [p.name, p]));
  type R = (typeof all)[number] & { name: string };
  const cols: Col<R>[] = [
    { key: "person", label: t("Person", "الشخص"), render: (r) => <span><DocRef doctype="Employee" name={r.employee}><span data-no-i18n>{r.employee_name}</span></DocRef>{canSeeRecord("Employee", r.employee) && <code className="block text-[11px] text-muted-foreground" data-no-i18n>{r.employee}</code>}</span> },
    { key: "assignments", label: t("Assignments (active and upcoming)", "التعيينات (النشطة والقادمة)"), render: (r) => <ul className="space-y-0.5 text-xs" data-people-rows={r.employee}>{r.rows.map((x) => <li key={`${x.project}-${x.idx}`}><AppLink to={`${ROUTE}?project=${encodeURIComponent(x.project)}`}><span data-no-i18n>{projectTitle(ps.get(x.project), !ar)}</span></AppLink> · <span data-no-i18n>{optAr(x.role, ar)}</span> · <StateBadge state={x.status} /></li>)}</ul> },
    { key: "active", label: t("Active projects", "المشاريع النشطة"), kind: "num", get: (r) => r.activeProjects.length },
    { key: "crews", label: t("Crews", "الطواقم"), render: (r) => r.crews.length ? <ul className="text-xs">{r.crews.map((c) => <li key={c.crew}><DocRef doctype="Digit Crew" name={c.crew}><span data-no-i18n>{String(adapter.get("Digit Crew", c.crew)?.["crew_name"] ?? c.crew)}</span></DocRef></li>)}</ul> : <span className="text-muted-foreground">—</span> },
    { key: "flags", label: t("Checks", "التحقق"), render: (r) => r.flags.length ? <ul className="text-xs" data-people-flags={r.employee}>{r.flags.map((f, i) => <li key={i}>{msg(f, ar)}</li>)}</ul> : <span className="text-muted-foreground">—</span> },
  ];
  return (
    <>
      <KpiGrid>
        <Kpi label={t("People on construction teams", "أشخاص في فرق المقاولات")} value={all.length} />
        <Kpi label={t("On more than one active project", "في أكثر من مشروع نشط")} value={all.filter((x) => x.activeProjects.length > 1).length} tone={all.some((x) => x.activeProjects.length > 1) ? "warn" : "good"} />
        <Kpi label={t("With checks", "لديهم ملاحظات")} value={all.filter((x) => x.flags.length).length} />
      </KpiGrid>
      <Section title={t("People across projects", "الأشخاص عبر المشاريع")}>
        <Filters><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!q["flagged"]} onChange={(e) => go({ flagged: e.target.checked ? "1" : undefined }, true)} data-people-flagged />{t("Only people with checks", "الأشخاص الذين لديهم ملاحظات فقط")}</label></Filters>
        <DataTable rows={shown.map((x) => ({ ...x, name: x.employee }))} cols={cols} rowKey={(r) => r.employee} empty={t("Nobody is on an active or upcoming construction team you can read.", "لا أحد في فريق مقاولات نشط أو قادم يمكنك قراءته.")} />
        <p className="mt-2 text-xs text-muted-foreground">{t("Concurrency is shown, not limited: the owner has not set how many projects one person may hold. Only projects you can read are counted.", "يُعرض التزامن ولا يُقيَّد: لم يحدد المالك عدد المشاريع المسموح للشخص الواحد. تُحتسب المشاريع التي يمكنك قراءتها فقط.")}</p>
      </Section>
    </>
  );
}
