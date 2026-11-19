import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { DigitHrLayout, useTx } from "@/components/digithr/DigitHrLayout";
import { Native, s, useSources, Chip, type R } from "@/components/digithr/workspaces/shared";
import { Attachments, BackTo, ChangeLog, D, EmployeeRef, Fact, Facts, ProfileGate, ProfileHeader, RelatedTable, optLabel } from "@/components/digithr/Record360Kit";
import { Button } from "@/components/ui/button";
import { adapter, useStoreVersion } from "@/lib/adapter";
import { cachedMeta } from "@/lib/catalog";
import { useScopeMetas } from "@/plugins/digit_hr/compat/scope";
import { hasPerm, useSessionUser } from "@/plugins/digit_hr/compat/session";
import { activeWorkflow, transitionsFor } from "@/lib/workflow";
import { hrApplyWorkflow } from "@/plugins/digit_hr/compat/workflow";
import { t as tr } from "@/i18n";
import { CASE_STAGES, caseClock, caseStage, relatedCases } from "@/plugins/digit_hr/record360Facts";
import { assignCaseToMe, mayAssignToMe, mayResolve, resolveCaseWithNotes } from "@/plugins/digit_hr/caseActions";
import { useUnsavedGuard } from "@/components/digithr/UnsavedGuard";

export const Route = createFileRoute("/digit-hr/cases/$name")({
  head: ({ params }) => ({ meta: [
    { title: `Case 360 — ${params.name} — DIGIT HR` },
    { name: "description", content: "Case 360: an HR service case's stage, service clock, handler, linked grievance, workflow actions, activity and the employee's other cases." },
    { property: "og:title", content: `Case 360 — ${params.name} — DIGIT HR` },
    { property: "og:description", content: "One HR service case from request to resolution." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  component: Case360,
});

const DT = "DIGIT HR Service Case";
const SRC = [DT, "Employee Grievance", "Employee"];
const ACTION: Record<string, [string, string]> = { Assign: ["إسناد", "Assign"], Start: ["بدء المعالجة", "Start work"], Resolve: ["تسجيل الحل", "Resolve"], Reopen: ["إعادة فتح", "Reopen"], Close: ["إغلاق", "Close"] };
const STAGE: Record<string, [string, string]> = { Open: ["مفتوحة", "Open"], Assigned: ["مسندة", "Assigned"], "In Progress": ["قيد المعالجة", "In progress"], Resolved: ["تم الحل", "Resolved"], Closed: ["مغلقة", "Closed"] };
const strip = (v: unknown) => s(v).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();

function Case360() {
  const { name } = Route.useParams();
  const { tx } = useTx();
  useStoreVersion(); const user = useSessionUser(); useScopeMetas(SRC);
  const src = useSources(tx);
  const [err, setErr] = useState<string[]>([]);
  const [done, setDone] = useState("");
  const [notes, setNotes] = useState<string | null>(null);
  const guard = useUnsavedGuard(notes !== null && notes.trim() !== "");
  const title = tx("ملف الحالة 360", "Case 360");
  const crumbs = [{ label: tx("الخدمة الذاتية", "Self-service") }, { label: tx("حالات الخدمة", "Service cases") }, { label: name }];
  const back = <BackTo section="05.3" label={tx("سجل حالات الخدمة", "Service cases register")} attr="case" />;
  const cases = src.rows(DT);
  const c = cases.find((x: R) => s(x.name) === name);
  return (
    <ProfileGate title={title} crumbs={crumbs} back={back} read={src.read(DT)} found={!!c} missingAttr="case">
      {() => {
        const clock = caseClock(c, new Date().toISOString());
        const stage = caseStage(c);
        const meta = cachedMeta(DT);
        const canWrite = !!meta && hasPerm(meta, "write", c);
        const wf = activeWorkflow(DT);
        const actions = wf && canWrite ? transitionsFor(wf, c, user) : [];
        const run = (action: string) => {
          setErr([]); setDone("");
          const errors = hrApplyWorkflow(DT, name, action, user);
          if (errors.length) setErr(errors); else setDone(action);
        };
        // NB-3: an unassigned open case is taken with "Assign to me"; resolving goes through the inline notes form.
        const assignMe = mayAssignToMe(c, user) && !s(c.assigned_to);
        const resolvable = mayResolve(c, user);
        const shownActions = actions.filter((a) => !(a.action === "Assign" && assignMe) && !(a.action === "Resolve" && resolvable));
        const takeIt = () => { setErr([]); setDone(""); try { assignCaseToMe(name, user); setDone("Assign"); } catch (e) { setErr([(e as Error).message]); } };
        const resolve = () => { setErr([]); setDone(""); try { resolveCaseWithNotes(name, notes ?? strip(c.resolution_notes), user); guard.release(); setNotes(null); setDone("Resolve"); } catch (e) { setErr([(e as Error).message]); } };
        // Timeline is part of the record (frappe getdoc): read only after the case itself passed the scoped read.
        const activity = adapter.list("Comment").filter((x) => x["reference_doctype"] === DT && x["reference_name"] === name)
          .sort((a, b) => s(b["creation"] || b["modified"]).localeCompare(s(a["creation"] || a["modified"])));
        const others = relatedCases(cases, c);
        const grievance = s(c.grievance);
        const grievanceRow = grievance ? src.rows("Employee Grievance").find((g: R) => s(g.name) === grievance) : undefined;
        const assignee = s(c.assigned_to);
        const clockChip = clock.kind === "overdue" ? <Chip tone="danger">{tx(`متأخرة ${Math.abs(clock.hours ?? 0)} ساعة`, `Overdue by ${Math.abs(clock.hours ?? 0)} h`)}</Chip>
          : clock.kind === "due_today" ? <Chip tone="warn">{tx("مستحقة اليوم", "Due today")}</Chip>
          : clock.kind === "due_soon" ? <Chip tone="warn">{tx(`مستحقة خلال ${clock.hours} ساعة`, `Due in ${clock.hours} h`)}</Chip>
          : clock.kind === "on_track" ? <Chip>{tx("ضمن المهلة", "On track")}</Chip>
          : clock.kind === "no_due" ? <Chip>{tx("بلا موعد استحقاق", "No due time")}</Chip> : null;
        const subj = s(c.subject) || name;
        return (
          <DigitHrLayout record title={subj} crumbs={crumbs} subtitle={title}>
            {back}
            <ProfileHeader code={name} dt={DT} module="05" attr="case" chips={<><Chip>{optLabel(tx, c.case_status)}</Chip>{s(c.severity) && <Chip tone={["High", "Critical"].includes(s(c.severity)) ? "warn" : undefined}>{tx("الأهمية", "Severity")}: {optLabel(tx, c.severity)}</Chip>}{clockChip}</>}>
              <Facts>
                <Fact label={tx("الموظف", "Employee")} attr="employee"><EmployeeRef id={c.employee} tx={tx} /></Fact>
                <Fact label={tx("الفئة", "Category")}>{optLabel(tx, c.category)}</Fact>
                <Fact label={tx("فُتحت في", "Opened")}><D v={c.opened_on} /></Fact>
                <Fact label={tx("موعد الاستحقاق", "Due")} attr="due"><D v={c.due_at} /></Fact>
                <Fact label={tx("المسند إليه", "Assigned to")} attr="assignee">{assignee ? <span data-no-i18n>{assignee === "Administrator" ? tx("المسؤول", "Administrator") : assignee}</span> : <span className="text-muted-foreground">{tx("غير مسندة", "Unassigned")}</span>}</Fact>
                <Fact label={tx("التظلم المرتبط", "Linked grievance")} attr="grievance">{!grievance ? <span>—</span> : grievanceRow ? <Native dt="Employee Grievance" name={grievance} module="05" className="text-primary hover:underline"><span data-no-i18n>{s(grievanceRow.subject) || grievance}</span></Native> : <span data-out-of-scope="Employee Grievance"><span data-no-i18n>{grievance}</span> <span className="text-xs text-muted-foreground">({src.ready("Employee Grievance") ? tx("خارج نطاق صلاحيتك", "outside your access") : src.v(null, "Employee Grievance")})</span></span>}</Fact>
                <Fact label={tx("الشركة", "Company")}><span data-no-i18n>{s(c.company) || "—"}</span></Fact>
                <Fact label={tx("مرفق خاص", "Private attachment")}>{s(c.private_attachment) ? tx("مرفق", "Attached") : <span className="text-muted-foreground">{tx("لا يوجد", "None")}</span>}</Fact>
              </Facts>
            </ProfileHeader>
            <section className="mb-4" data-case-stage={s(c.case_status)}>
              <h2 className="mb-2 text-sm font-semibold">{tx("مراحل الحالة", "Case stages")}</h2>
              <ol className="flex flex-wrap gap-2 text-sm">
                {CASE_STAGES.map((st, i) => <li key={st} aria-current={i === stage ? "step" : undefined} data-stage={st} data-reached={i <= stage ? "1" : undefined}
                  className={`rounded-full border px-3 py-1 ${i === stage ? "border-[var(--dhr-emerald)] bg-[var(--dhr-canvas)] font-semibold" : i < stage ? "text-foreground" : "text-muted-foreground"}`}>
                  <span aria-hidden>{i < stage ? "✓ " : ""}</span>{tx(...(STAGE[st] ?? [st, st]))}</li>)}
              </ol>
            </section>
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(260px,340px)]">
              <div className="min-w-0">
                <section className="mb-4" data-case-actions={actions.length}>
                  <h2 className="mb-2 text-sm font-semibold">{tx("الإجراء التالي", "Next action")}</h2>
                  {!canWrite ? <p className="text-sm text-muted-foreground" data-case-readonly>{tx("لديك صلاحية العرض فقط لهذه الحالة.", "You can view this case but not act on it.")}</p>
                    : actions.length === 0 ? <p className="text-sm text-muted-foreground">{tx("لا يوجد إجراء متاح لك في هذه المرحلة.", "No action is available to you at this stage.")}</p>
                    : <div className="flex flex-wrap gap-2">{assignMe && <Button className="min-h-10" onClick={takeIt} data-case-assign-me>{tx("إسناد إليّ", "Assign to me")}</Button>}{shownActions.map((a) => <Button key={a.action} variant={a.action === "Reopen" ? "outline" : "default"} className="min-h-10" onClick={() => run(a.action)} data-case-action={a.action}>{tx(...(ACTION[a.action] ?? [a.action, a.action]))}</Button>)}</div>}
                  {resolvable && <div className="mt-3 space-y-2 rounded-[12px] border p-3" data-case-resolve-form>
                    {guard.dialog}
                    <label className="block text-sm font-medium" htmlFor="case-resolution">{tx("ملاحظات الحل (مطلوبة)", "Resolution notes (required)")}</label>
                    <textarea id="case-resolution" className="field-input min-h-20 w-full" value={notes ?? strip(c.resolution_notes)} onChange={(e) => setNotes(e.target.value)} data-case-notes />
                    <Button className="min-h-10" disabled={!(notes ?? strip(c.resolution_notes)).trim()} onClick={resolve} data-case-resolve>{tx("تسجيل الحل", "Resolve")}</Button>
                  </div>}
                  {err.length > 0 && <div role="alert" className="dhr-alert mt-3 text-sm" data-tone="danger" data-case-error>
                    <ul className="list-disc ps-5">{err.map((e) => <li key={e}>{tr(e)}</li>)}</ul>
                    <Native dt={DT} name={name} module="05" className="mt-2 inline-block text-primary underline">{tx("أكمل الحقول المطلوبة في السجل الكامل", "Complete the required fields in the full record")}</Native>
                  </div>}
                  {done && <p role="status" className="mt-3 text-sm" data-case-done={done}>{tx(`تم تنفيذ «${(ACTION[done] ?? [done])[0]}». المرحلة الآن: ${(STAGE[s(c.case_status)] ?? [s(c.case_status)])[0]}.`, `“${(ACTION[done] ?? [done, done])[1]}” done. The case is now ${(STAGE[s(c.case_status)] ?? [s(c.case_status), s(c.case_status)])[1]}.`)}</p>}
                </section>
                <section className="mb-4" data-case-description>
                  <h2 className="mb-2 text-sm font-semibold">{tx("وصف الطلب", "Request")}</h2>
                  <p className="whitespace-pre-wrap rounded-[12px] border p-3 text-sm" data-no-i18n>{strip(c.description) || "—"}</p>
                </section>
                <section className="mb-4" data-case-resolution={s(c.resolution_notes) ? "1" : "0"}>
                  <h2 className="mb-2 text-sm font-semibold">{tx("ملاحظات الحل", "Resolution notes")}</h2>
                  {strip(c.resolution_notes) ? <p className="whitespace-pre-wrap rounded-[12px] border p-3 text-sm" data-no-i18n>{strip(c.resolution_notes)}</p> : <p className="text-sm text-muted-foreground">{tx("لم تُسجَّل ملاحظات حل بعد.", "No resolution notes recorded yet.")}</p>}
                </section>
                <section className="mb-4" data-case-activity={activity.length}>
                  <h2 className="mb-2 text-sm font-semibold">{tx("النشاط", "Activity")}</h2>
                  {activity.length === 0 ? <p className="text-sm text-muted-foreground">{tx("لا يوجد نشاط مسجل بعد.", "No activity recorded yet.")}</p>
                    : <ol className="space-y-2 border-s ps-4 text-sm">{activity.map((a) => <li key={a.name} data-activity={s(a["comment_type"])}>
                        <div className="text-xs text-muted-foreground"><D v={a["creation"] || a["modified"]} /> · <span data-no-i18n>{s(a["comment_email"] || a["owner"]) === "Administrator" ? tx("المسؤول", "Administrator") : s(a["comment_email"] || a["owner"])}</span></div>
                        <div>{s(a["comment_type"]) === "Workflow" ? tx(`نُقلت الحالة إلى «${(STAGE[s(a["content"])] ?? [s(a["content"])])[0]}»`, `Moved to “${(STAGE[s(a["content"])] ?? [s(a["content"]), s(a["content"])])[1]}”`) : <span data-no-i18n>{strip(a["content"])}</span>}</div>
                      </li>)}</ol>}
                </section>
                <section className="mt-4" data-case-files><Attachments dt={DT} name={name} fields={["private_attachment"]} doc={c} module="05" tx={tx} /></section>
                <div className="mt-4"><ChangeLog dt={DT} name={name} tx={tx} /></div>
              </div>
              <aside className="min-w-0" aria-label={tx("حالات أخرى للموظف", "Other cases of this employee")}>
                <RelatedTable title={tx("حالات أخرى للموظف", "Other cases of this employee")} read={src.read(DT)} rows={others} attr="case-others" tx={tx}
                  head={[tx("الحالة", "Case"), tx("المرحلة", "Stage"), tx("فُتحت", "Opened")]}
                  row={(x: R) => <tr key={s(x.name)} className="h-11 border-t" data-other-case={s(x.name)}>
                    <td className="px-3"><Link to="/digit-hr/cases/$name" params={{ name: s(x.name) }} className="text-primary hover:underline"><span data-no-i18n>{s(x.subject) || s(x.name)}</span></Link></td>
                    <td className="px-3">{optLabel(tx, x.case_status)}</td>
                    <td className="px-3 text-xs"><D v={s(x.opened_on).slice(0, 10)} /></td>
                  </tr>} />
              </aside>
            </div>
          </DigitHrLayout>
        );
      }}
    </ProfileGate>
  );
}
