/**
 * HR round-2 form panels, above native forms while DIGIT HR is the active app: SHL-09 unsaved work kept on this device
 * and offered back after a session expiry or reload, CAS-03 case hold / resume / close / reopen / sub-case with the SLA,
 * HIR-01/02 hire readiness on an accepted offer, ORG-08 position › requisition › opening chain with plain meanings.
 * Every action calls plugins/digit_hr/r10/features/* (scope-checked); the form reads the record back.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { adapter, useStoreVersion, type Doc } from "@/lib/adapter";
import { useSessionUser } from "@/lib/session";
import type { FormPanelProps } from "@/plugins/experienceSlots";
import { QuickLink } from "@/components/enterprise/QuickView";
import NATIVE_MAP from "@/plugins/digit_hr/nativeMap";
import { clearLocalDraft, draftDiff, loadLocalDraft, saveLocalDraft } from "@/plugins/digit_hr/r10/features/platform";
import * as Sv from "@/plugins/digit_hr/r10/features/service";
import { hireReadiness } from "@/plugins/digit_hr/r10/features/talent";
import { CONCEPTS, POS, chainOf } from "@/plugins/digit_hr/r10/features/setup";
import { slaState } from "@/plugins/digit_hr/r9/logic";
import type { ActionResult } from "@/plugins/digit_hr/r10/write";
import { projectWorkforce } from "@/plugins/digit_hr/r10/features/links";
import { canCreateUser, createEmployeeUser, employeeEmail } from "@/plugins/digit_hr/r10/features/native";
import { OWN_CASE_FIELDS, advanceAccounts, editOwnOpenCase, ownCaseEditable, payAdvance, saveConflict } from "@/plugins/digit_hr/r10/features/closing";
import { hasPerm } from "@/lib/session";
import { cachedMeta } from "@/lib/catalog";
import { Button } from "@/components/ui/button";
import { fmtCurrency } from "@/lib/format";
import { useTx } from "./HrNav";

const HR_DOCS = new Set<string>(Object.values(NATIVE_MAP).flat().map((t) => t.doctype));
const s = (v: unknown) => (typeof v === "string" ? v : v == null ? "" : String(v));

function Panel({ id, title, meta, children }: { id: string; title: string; meta?: ReactNode; children: ReactNode }) {
  return <section className="dhr-panel mb-3" data-r10-panel={id} aria-label={title}>
    <div className="dhr-panel-h"><div><h2 className="dhr-panel-t">{title}</h2>{meta ? <div className="dhr-panel-m">{meta}</div> : null}</div></div>
    <div className="dhr-panel-b space-y-3">{children}</div>
  </section>;
}

export function HrR10Panels(props: FormPanelProps) {
  const { meta, doc } = props; const dt = meta.name; const saved = !doc["__islocal"];
  if (!HR_DOCS.has(dt) && dt !== POS && dt !== "Project" && dt !== "Employee") return null;
  return <div className="digit-hr" data-r10-panels>
    <DraftKeeper {...props} />
    {saved && <ConflictWatch {...props} />}
    {saved && dt === Sv.DSC && <OwnCaseEdit doc={doc} />}
    {saved && dt === Sv.DSC && <CasePanel doc={doc} />}
    {saved && dt === "Employee Advance" && <AdvancePay doc={doc} />}
    {saved && dt === "Job Offer" && s(doc["status"]) === "Accepted" && <HirePanel doc={doc} />}
    {saved && (dt === "Job Opening" || dt === "Job Requisition" || dt === POS) && <ConceptPanel dt={dt} doc={doc} />}
    {saved && dt === "Project" && <ProjectWorkforce doc={doc} />}
    {saved && dt === "Employee" && <EmployeeAccount doc={doc} />}
  </div>;
}

/** INT-10 / INT-15: the project's HR side — workers assigned to it (DIGIT Site Worker Assignment) and its labour cost
 *  against the labour budget from the same report runner (HR Labour Cost vs Budget by Project), year to date. */
function ProjectWorkforce({ doc }: { doc: Doc }) {
  const { tx, lang } = useTx(); const ar = lang === "ar"; useStoreVersion(); useSessionUser();
  const pw = projectWorkforce(doc.name, s(doc["company"]), new Date().toISOString().slice(0, 10));
  if (!pw) return null;
  const list = pw.assignments; const row = pw.budget === null ? null : { budget: pw.budget, actual: pw.actual, variance: pw.remaining };
  const money = (v: unknown) => fmtCurrency(Number(v) || 0, "SAR");
  return <section className="dx-card mb-3 p-3" data-r10-project-workforce={doc.name}>
    <div className="mb-2 flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-semibold">{tx("القوى العاملة في المشروع", "Project workforce")} <span className="opacity-60" data-no-i18n>({list.length})</span></h3>
      <Link to="/report/$name" params={{ name: "HR Labour Cost vs Budget by Project" }} search={{ app: "digit_hr" } as never} className="text-xs text-primary hover:underline">{tx("تكلفة العمالة مقابل الميزانية", "Labour cost vs budget")}</Link></div>
    {row ? <p className="mb-2 text-xs text-muted-foreground" data-project-labour>{tx("منذ بداية السنة", "Year to date")}: {tx("الميزانية", "Budget")} <b data-no-i18n>{money(row["budget"])}</b> · {tx("الفعلي", "Actual")} <b data-no-i18n>{money(row["actual"])}</b> · {tx("المتبقي", "Remaining")} <b data-no-i18n>{money(row["variance"])}</b></p> : null}
    {list.length ? <div className="max-h-72 overflow-auto"><table className="w-full text-sm"><tbody>{list.slice(0, 50).map((a) => <tr key={a.name} className="h-10 border-t">
      <td className="px-2"><QuickLink doctype="Employee" name={s(a["employee"])}>{s(a["employee_name"]) || s(a["employee"])}</QuickLink></td>
      <td className="px-2" data-no-i18n>{s(a["role_on_site"])}</td><td className="px-2" data-no-i18n>{s(a["from_date"])} → {s(a["to_date"]) || "…"}</td><td className="px-2">{ar ? ({ Planned: "مخطط", Active: "نشط", Ended: "منتهٍ" } as Record<string, string>)[s(a["status"])] ?? s(a["status"]) : s(a["status"])}</td>
      <td className="px-2"><QuickLink doctype="DIGIT Site Worker Assignment" name={a.name} className="text-xs text-primary hover:underline">{tx("التعيين", "Assignment")}</QuickLink></td></tr>)}</tbody></table></div>
      : <p className="text-xs text-muted-foreground">{tx("لا يوجد عمال معيّنون لهذا المشروع.", "No workers are assigned to this project.")}</p>}
  </section>;
}

/** FR26-0138: an employee without a sign-in account shows Create User (HR managers / system manager), which links a free
 *  account with the same e-mail or creates one with the Employee role; a linked account is shown, never re-created. */
function EmployeeAccount({ doc }: { doc: Doc }) {
  const { tx, lang } = useTx(); const ar = lang === "ar"; useStoreVersion(); const user = useSessionUser();
  const linked = s(doc["user_id"]); const hasUser = !!linked && !!adapter.get("User", linked);
  if (hasUser || !canCreateUser(user) || s(doc["status"] || "Active") !== "Active") return null;
  const email = employeeEmail(doc);
  return <section className="dx-card mb-3 flex flex-wrap items-center justify-between gap-2 p-3" data-r10-employee-account={doc.name}>
    <div><h3 className="text-sm font-semibold">{tx("لا يوجد حساب دخول لهذا الموظف", "This employee has no sign-in account")}</h3>
      <p className="text-xs text-muted-foreground">{email ? <>{tx("سيُستخدم البريد", "The account will use")} <b data-no-i18n>{email}</b></> : tx("أضف البريد الإلكتروني للموظف أولًا.", "Add the employee's e-mail first.")}</p></div>
    <Button size="sm" disabled={!email} data-create-user={doc.name} onClick={() => done(createEmployeeUser(doc.name, user), ar)}>{tx("إنشاء مستخدم", "Create User")}</Button>
  </section>;
}

/** UX-11: the stored record changed after this form opened (another user or tab saved it). The banner names who and
 *  which of your fields collide; "Load saved" takes the stored values for them, "Keep mine" saves over them. */
function ConflictWatch({ meta, doc, dirty, onChange }: FormPanelProps) {
  useStoreVersion(); const { tx } = useTx();
  const opened = useRef<{ name: string; modified: string; values: Record<string, unknown> } | null>(null);
  if (!opened.current || opened.current.name !== doc.name) opened.current = { name: doc.name, modified: s(adapter.get(meta.name, doc.name)?.["modified"]), values: { ...(adapter.get(meta.name, doc.name) ?? doc) } };
  const [kept, setKept] = useState("");
  const stored = adapter.get(meta.name, doc.name);
  const c = dirty ? saveConflict(opened.current.modified, stored, doc as Record<string, unknown>, opened.current.values) : null;
  if (!c || kept === s(stored?.["modified"])) return null;
  return <div className="mb-3 flex flex-wrap items-center gap-3 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm" role="alert" data-r10-conflict>
    <span className="min-w-0 flex-1">{tx(`عدّل ${c.by || "مستخدم آخر"} هذا السجل في ${c.at} بعد فتحك له.`, `${c.by || "Another user"} saved this record at ${c.at} after you opened it.`)}{c.fields.length ? <> {tx("حقول متعارضة:", "Fields changed on both sides:")} <b>{c.fields.slice(0, 6).join(", ")}</b></> : null}</span>
    <button type="button" className="btn-primary h-8 px-3 text-xs" data-r10-conflict-load onClick={() => { if (stored) { onChange(Object.fromEntries((c.fields.length ? c.fields : Object.keys(stored).filter((k) => !k.startsWith("__"))).map((f) => [f, stored[f]]))); opened.current = { name: doc.name, modified: s(stored["modified"]), values: { ...stored } }; } }}>{tx("تحميل المحفوظ", "Load saved")}</button>
    <button type="button" className="btn-secondary h-8 px-3 text-xs" data-r10-conflict-keep onClick={() => setKept(s(stored?.["modified"]))}>{tx("الإبقاء على تعديلاتي", "Keep mine")}</button>
  </div>;
}

/** HR-B3: the employee who raised the case edits it while it is open and nobody is assigned (setting ess_edit_open_case). */
function OwnCaseEdit({ doc }: { doc: Doc }) {
  useStoreVersion(); const { tx, lang } = useTx(); const ar = lang === "ar"; const user = useSessionUser();
  const c = adapter.get(Sv.DSC, doc.name) ?? doc;
  const [v, setV] = useState<Record<string, string>>({});
  if (!ownCaseEditable(c, user)) return null;
  const val = (k: string) => v[k] ?? s(c[k]);
  const input = "h-9 w-full rounded-md border border-border bg-card px-2 text-sm";
  return <Panel id="own-case" title={tx("تعديل حالتي", "Edit my case")} meta={tx("متاح ما دامت الحالة مفتوحة ولم تُسند لأحد.", "Available while the case is open and not assigned.")}>
    <div className="grid gap-2 sm:grid-cols-2">
      <label className="text-xs">{tx("الموضوع", "Subject")}<input className={input} value={val("subject")} onChange={(e) => setV({ ...v, subject: e.target.value })} data-own-case="subject" /></label>
      <label className="text-xs">{tx("الأهمية", "Severity")}<select className={input} value={val("severity")} onChange={(e) => setV({ ...v, severity: e.target.value })} data-own-case="severity">{["Low", "Medium", "High"].map((o) => <option key={o} value={o}>{ar ? ({ Low: "منخفضة", Medium: "متوسطة", High: "عالية" } as Record<string, string>)[o] : o}</option>)}</select></label>
      <label className="text-xs sm:col-span-2">{tx("الوصف", "Description")}<textarea className={`${input} h-20 py-1`} value={val("description")} onChange={(e) => setV({ ...v, description: e.target.value })} data-own-case="description" /></label>
    </div>
    <button type="button" className="btn-primary h-8 px-3 text-xs" disabled={!Object.keys(v).length} data-own-case-save onClick={() => { const patch = Object.fromEntries(Object.entries(v).filter(([k]) => (OWN_CASE_FIELDS as readonly string[]).includes(k))); done(editOwnOpenCase(doc.name, patch, user), ar); setV({}); }}>{tx("حفظ التعديل", "Save changes")}</button>
  </Panel>;
}

/** GAP-10: an approved, unpaid advance is paid from its form as the native Make > Payment does (a bank journal). */
function AdvancePay({ doc }: { doc: Doc }) {
  useStoreVersion(); const { tx, lang } = useTx(); const ar = lang === "ar"; const user = useSessionUser();
  const a = adapter.get("Employee Advance", doc.name) ?? doc;
  const due = (Number(a["advance_amount"]) || 0) - (Number(a["paid_amount"]) || 0);
  const jm = cachedMeta("Journal Entry"); const may = user === "Administrator" || (!!jm && hasPerm(jm, "create", { doctype: "Journal Entry", name: "", company: a["company"] } as Doc, user));
  if (Number(a["docstatus"]) !== 1 || due <= 0 || !may) return null;
  const acc = advanceAccounts(a);
  return <section className="dx-card mb-3 flex flex-wrap items-center justify-between gap-2 p-3" data-r10-advance-pay={doc.name}>
    <div><h3 className="text-sm font-semibold">{tx("سلفة معتمدة بانتظار الصرف", "Approved advance waiting for payment")}</h3>
      <p className="text-xs text-muted-foreground">{tx("المبلغ", "Amount")} <b data-no-i18n>{fmtCurrency(due, "SAR")}</b> · {tx("من", "From")} <b data-no-i18n>{acc.bank}</b> {tx("إلى", "to")} <b data-no-i18n>{acc.advance}</b></p></div>
    <Button size="sm" data-pay-advance={doc.name} onClick={() => done(payAdvance(doc.name, user), ar)}>{tx("صرف السلفة", "Pay advance")}</Button>
  </section>;
}

/** SHL-09: while the form has unsaved changes they are kept on this device (per user and record); after a session
 *  expiry, re-verification or reload the form offers them back with the changed fields named. */
function DraftKeeper({ meta, doc, dirty, canWrite, onChange }: FormPanelProps) {
  const { tx } = useTx(); const user = useSessionUser();
  const name = doc["__islocal"] ? "new" : doc.name;
  const [offer, setOffer] = useState<{ at: string; fields: string[]; values: Record<string, unknown> } | null>(null);
  const checked = useRef(false);
  useEffect(() => {
    if (checked.current || !canWrite) return; checked.current = true;
    const d = loadLocalDraft(user, meta.name, name); if (!d) return;
    const fields = draftDiff(adapter.get(meta.name, name) ?? (name === "new" ? undefined : doc), d.values);
    if (fields.length) setOffer({ at: d.at, fields, values: d.values }); else clearLocalDraft(user, meta.name, name);
  }, [user, meta.name, name, canWrite, doc]);
  useEffect(() => {
    if (!canWrite) return;
    if (!dirty) { if (!offer && checked.current) clearLocalDraft(user, meta.name, name); return; }
    const id = setTimeout(() => saveLocalDraft(user, meta.name, name, doc), 500);
    return () => clearTimeout(id);
  }, [doc, dirty, canWrite, offer, user, meta.name, name]);
  if (!offer) return null;
  const label = (f: string) => s(meta.fields.find((x) => x.fieldname === f)?.label) || f;
  return <div className="mb-3 flex flex-wrap items-center gap-3 rounded-md border border-primary/30 bg-accent px-3 py-2 text-sm" role="status" data-r10-draft>
    <span className="min-w-0 flex-1">{tx(`تغييرات غير محفوظة من ${offer.at.slice(0, 16)} محفوظة على هذا الجهاز: `, `Unsaved changes from ${offer.at.slice(0, 16)} were kept on this device: `)}<b>{offer.fields.slice(0, 6).map(label).join("، ")}{offer.fields.length > 6 ? "…" : ""}</b></span>
    <button type="button" className="btn-primary h-8 px-3 text-xs" onClick={() => { const patch = Object.fromEntries(offer.fields.map((f) => [f, offer.values[f]])); onChange(patch); setOffer(null); toast.success(tx("استُعيدت التغييرات؛ احفظ المستند لتثبيتها.", "Changes restored; save the document to keep them.")); }} data-r10-draft-restore>{tx("استعادة", "Restore")}</button>
    <button type="button" className="btn-secondary h-8 px-3 text-xs" onClick={() => { clearLocalDraft(user, meta.name, name); setOffer(null); }} data-r10-draft-discard>{tx("تجاهل", "Discard")}</button>
  </div>;
}

function done(r: ActionResult, ar: boolean) { if (r.ok) toast.success(ar ? r.message[1] : r.message[0]); else toast.error([ar ? r.message[1] : r.message[0], ...(r.errors ?? []).slice(0, 4)].join("\n")); }

/** CAS-03: hold (the deadline moves by the time on hold), resume, sub-case, close (refused with open tasks), reopen. */
function CasePanel({ doc }: { doc: Doc }) {
  useStoreVersion(); const { tx, lang } = useTx(); const ar = lang === "ar"; const user = useSessionUser();
  const [text, setText] = useState("");
  const c = adapter.get(Sv.DSC, doc.name) ?? doc; const st = s(c["case_status"]);
  const sla = slaState(c, new Date()); const kids = Sv.openChildren(doc.name);
  const closed = st === "Resolved" || st === "Closed"; const held = st === "On Hold";
  const act = (f: () => ActionResult) => { done(f(), ar); setText(""); };
  return <Panel id="case" title={tx("إجراءات الحالة", "Case actions")} meta={<>{tx("الحالة", "Status")}: <b>{st || "—"}</b> · {tx("الالتزام", "SLA")}: <b data-r10-sla>{sla.state}</b>{kids.length ? <> · {tx("مهام وحالات فرعية مفتوحة", "Open tasks and sub-cases")}: <b>{kids.length}</b></> : null}</>}>
    <input className="h-9 w-full rounded-md border border-border bg-card px-2 text-sm" placeholder={tx("السبب أو الملاحظات أو موضوع الحالة الفرعية", "Reason, notes or sub-case subject")} value={text} onChange={(e) => setText(e.target.value)} aria-label={tx("السبب أو الملاحظات", "Reason or notes")} dir="auto" />
    <div className="flex flex-wrap gap-2">
      {!closed && !held && <button type="button" className="btn-secondary h-8 px-3 text-xs" onClick={() => act(() => Sv.pauseCase(doc.name, text || "On hold", user))} data-r10-case="hold">{tx("تعليق", "Put on hold")}</button>}
      {held && <button type="button" className="btn-secondary h-8 px-3 text-xs" onClick={() => act(() => Sv.resumeCase(doc.name, user))} data-r10-case="resume">{tx("استئناف", "Resume")}</button>}
      {!closed && <button type="button" className="btn-secondary h-8 px-3 text-xs" onClick={() => act(() => Sv.addSubCase(doc.name, text || "Sub-case", user))} data-r10-case="sub">{tx("حالة فرعية", "Add sub-case")}</button>}
      {!closed && <button type="button" className="btn-primary h-8 px-3 text-xs" onClick={() => act(() => Sv.closeCase(doc.name, text || "Resolved", user))} data-r10-case="close">{tx("إغلاق", "Close")}</button>}
      {closed && <button type="button" className="btn-secondary h-8 px-3 text-xs" onClick={() => act(() => Sv.reopenCase(doc.name, text || "Reopened", user))} data-r10-case="reopen">{tx("إعادة فتح", "Reopen")}</button>}
    </div>
    {kids.length > 0 && <ul className="flex flex-wrap gap-2 text-xs">{kids.map((k) => <li key={k.name}><QuickLink doctype={s(k.doctype) || Sv.DSC} name={k.name} className="dhr-pill text-primary">{s(k["subject"]) || k.name}</QuickLink></li>)}</ul>}
  </Panel>;
}

/** HIR-01/02: readiness of the accepted offer; the hire itself runs in the onboarding section tool (one place). */
function HirePanel({ doc }: { doc: Doc }) {
  useStoreVersion(); const { tx, lang } = useTx(); const ar = lang === "ar";
  const hired = adapter.list("Employee").find((e) => e["job_applicant"] === doc["job_applicant"] && s(doc["job_applicant"]));
  const rd = hireReadiness(doc.name, { date_of_joining: s(doc["digit_date_of_joining"]) || new Date().toISOString().slice(0, 10) });
  return <Panel id="hire" title={tx("جاهزية التعيين", "Hire readiness")} meta={hired ? <>{tx("عُيّن موظفًا", "Hired as")}: <QuickLink doctype="Employee" name={hired.name} className="text-primary">{s(hired["employee_name"]) || hired.name}</QuickLink></> : tx(`${rd.filter((x) => x.ok).length} من ${rd.length} جاهز`, `${rd.filter((x) => x.ok).length} of ${rd.length} ready`)}>
    {!hired && <><ul className="grid gap-1 text-sm sm:grid-cols-2">{rd.map((x) => <li key={x.key} className="flex items-start gap-2" data-r10-ready={x.ok ? "ok" : "missing"}><span aria-hidden>{x.ok ? "✓" : "•"}</span><span>{ar ? x.ar : x.en}{!x.ok && x.fix ? <span className="block text-xs text-muted-foreground">{x.fix}</span> : null}</span></li>)}</ul>
      <Link to="/digit-hr/s/$section" params={{ section: "02.2" }} search={{ tab: "documents", tool: "hire" } as never} className="btn-primary inline-flex h-8 items-center px-3 text-xs" data-r10-hire>{tx("إتمام التعيين", "Complete the hire")}</Link></>}
  </Panel>;
}

/** ORG-08: what a position, job, requisition and opening are, and this record's place in the chain. */
function ConceptPanel({ dt, doc }: { dt: string; doc: Doc }) {
  useStoreVersion(); const { tx, lang } = useTx(); const ar = lang === "ar";
  const ch = chainOf(dt, doc.name);
  const step = (id: string, d?: string, name?: string) => { const c = CONCEPTS.find((x) => x.id === id)!; return <li key={id} className={`rounded-md border px-3 py-2 ${id === dt ? "border-primary bg-accent" : "border-border"}`} title={ar ? c.ar[1] : c.en[1]} data-r10-chain={id}>
    <span className="block text-xs text-muted-foreground">{ar ? c.ar[0] : c.en[0]}</span>{name ? (d ? <QuickLink doctype={d} name={name} className="text-sm font-semibold text-primary">{name}</QuickLink> : <b className="text-sm" data-no-i18n>{name}</b>) : <span className="text-sm text-muted-foreground">—</span>}</li>; };
  return <Panel id="concepts" title={tx("المنصب والوظيفة والطلب والشاغر", "Position, job, requisition and opening")}>
    <ol className="grid gap-2 sm:grid-cols-4">{step("Designation", undefined, ch.designation)}{step(POS, POS, ch.position)}{step("Job Requisition", "Job Requisition", ch.requisition)}{step("Job Opening", "Job Opening", ch.opening)}</ol>
    <details className="text-xs"><summary className="cursor-pointer text-muted-foreground">{tx("ما الفرق؟", "What is the difference?")}</summary>
      <dl className="mt-2 grid gap-1">{CONCEPTS.map((c) => <div key={c.id}><dt className="inline font-semibold">{ar ? c.ar[0] : c.en[0]}: </dt><dd className="inline">{ar ? c.ar[1] : c.en[1]}</dd></div>)}</dl></details>
  </Panel>;
}
