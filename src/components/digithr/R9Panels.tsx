/**
 * HR R9 form panels (owner-approved R9 features, 2026-11-10), rendered above native forms while DIGIT HR is the active app:
 * APR-01 delegation preview/activate/revoke, APR-02 parallel approval on the three DIGIT submittable DocTypes, POR-03
 * service suggestion + catalog on a new service case, POR-04 bank change decisions, CAS-04 route/escalate, PAY-04 period
 * banner on Salary Slip / Additional Salary, HIR-04 invite actions (off until the owner enables the site flag).
 * Every action calls the ported digit_hr API (src/plugins/digit_hr/r9/actions.ts) and the form reads the record back.
 */
import { useMemo, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { adapter, DocValidationError, type Doc } from "@/lib/adapter";
import { useScopeMetas } from "@/lib/scope";
import { useSessionUser } from "@/lib/session";
import type { FormPanelProps } from "@/plugins/experienceSlots";
import * as A from "@/plugins/digit_hr/r9/actions";
import { can, isHr, ownEmployees, s } from "@/plugins/digit_hr/r9/core";
import { DAD, DBC, DOI, DPA, DPL } from "@/plugins/digit_hr/r9/doctypes";
import { locksFor, matchRule, payrollDates, slaState, SUPPORTED } from "@/plugins/digit_hr/r9/logic";
import { useTx } from "./HrNav";
import { SmartGuidePanel, SMART_GUIDE_DOCTYPES, TourLauncher, TOUR_DOCTYPES } from "./R9Extras";
import { StatusBadge } from "./ui";
import { HR_DOC_SEARCH } from "@/plugins/digit_hr/product/urls";

const DSC = "DIGIT HR Service Case";
const NATIVE = ["Employee", "Company", "Leave Application", "Expense Claim", "Shift Request", "Employee Onboarding", "Salary Slip", "Additional Salary", "DocShare", "User"];
const slugOf = (dt: string) => dt.toLowerCase().replace(/ /g, "_");
const appOf = (dt: string) => (dt.startsWith("DIGIT ") || ["Leave Application", "Expense Claim", "Shift Request", "Employee Onboarding", "Salary Slip", "Additional Salary"].includes(dt) ? "hrms" : "erpnext");

function DocLink({ dt, name }: { dt: string; name: string }) {
  return <Link to="/app/$app/$doctype/$name" search={HR_DOC_SEARCH as never} params={{ app: appOf(dt), doctype: slugOf(dt), name }} className="dhr-link" data-no-i18n>{name}</Link>;
}
function Panel({ id, title, meta, children }: { id: string; title: string; meta?: ReactNode; children: ReactNode }) {
  return <section className="dhr-panel mb-3" data-r9-panel={id} aria-label={title}>
    <div className="dhr-panel-h"><div><h2 className="dhr-panel-t">{title}</h2>{meta ? <div className="dhr-panel-m">{meta}</div> : null}</div></div>
    <div className="dhr-panel-b space-y-3">{children}</div>
  </section>;
}
/** Runs an R9 action: success toast with the read-back record, refusals shown with the source message. */
function run(f: () => unknown, ok: string): boolean {
  try { f(); toast.success(ok); return true; }
  catch (e) { toast.error(e instanceof DocValidationError ? e.errors.join("\n") : String((e as Error).message)); return false; }
}
const btn = "dhr-btn dhr-btn-sm disabled:cursor-not-allowed disabled:opacity-50";
const btnP = `${btn} dhr-btn-primary`;
const input = "w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm";

function users(): Doc[] { return adapter.list("User").filter((u) => Number(u["enabled"] ?? 0) === 1 && s(u["user_type"]) !== "Website User"); }
function UserSelect({ value, onChange, label, allowEmpty }: { value: string; onChange: (v: string) => void; label: string; allowEmpty?: boolean }) {
  const list = useMemo(users, []);
  return <select className={input} aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} data-no-i18n>
    <option value="">{allowEmpty ? "—" : label}</option>
    {list.map((u) => <option key={u.name} value={u.name}>{s(u["full_name"]) || u.name}</option>)}
  </select>;
}

// ------------------------------------------------------------------ APR-01
const SKIP: Record<string, [string, string]> = {
  own_request: ["طلب يخص المفوَّض إليه نفسه (لا اعتماد ذاتي)", "The delegate's own request (no self-approval)"],
  already_shared: ["سبقت مشاركته", "Already shared"],
  delegator_cannot_approve: ["المفوِّض لا يملك اعتماده", "The approver cannot approve it"],
  delegate_cannot_read_employee: ["المفوَّض إليه لا يملك قراءة سجل الموظف (قرار المالك)", "The delegate cannot read the employee record (owner decision)"],
};
function DelegationPanel({ doc }: { doc: Doc }) {
  const { tx } = useTx(); useSessionUser();
  const status = s(doc["delegation_status"]) || "Draft";
  const writable = can(DAD, "write", doc);
  let pv: ReturnType<typeof A.delegationPreview> | null = null; let pvErr = "";
  try { pv = writable && status !== "Revoked" ? A.delegationPreview(doc.name) : null; } catch (e) { pvErr = (e as Error).message; }
  const shared = ((doc["shared"] ?? []) as Doc[]);
  return <Panel id="APR-01" title={tx("تفويض الاعتماد", "Approval delegation")} meta={<StatusBadge value={status} />}>
    {pvErr && <div className="dhr-alert" data-tone="danger" role="alert">{pvErr}</div>}
    {pv && <div className="grid gap-3 md:grid-cols-2" data-r9-preview>
      <div><div className="text-sm font-medium">{tx("سيُشارك مع المفوَّض إليه", "Will be shared with the delegate")} ({pv.would_share.length})</div>
        <ul className="mt-1 space-y-1 text-sm">{pv.would_share.map((r) => <li key={r.doctype + r.name}>{tx(r.doctype, r.doctype)} · <DocLink dt={r.doctype} name={r.name} /> <span className="text-muted-foreground" data-no-i18n>{r.employee_name}</span></li>)}
          {!pv.would_share.length && <li className="text-muted-foreground">{tx("لا توجد طلبات مفتوحة للمشاركة", "No open requests to share")}</li>}</ul></div>
      <div><div className="text-sm font-medium">{tx("مستبعد", "Skipped")} ({pv.skipped.length})</div>
        <ul className="mt-1 space-y-1 text-sm">{pv.skipped.map((r) => <li key={r.doctype + r.name}><DocLink dt={r.doctype} name={r.name} /> — {r.skip ? tx(SKIP[r.skip]![0], SKIP[r.skip]![1]) : ""}</li>)}</ul></div>
    </div>}
    {shared.length > 0 && <div className="text-sm" data-r9-shared>{tx("المشاركات المسجلة", "Recorded shares")}: {shared.map((r, i) => <span key={i} className="me-2"><DocLink dt={s(r["reference_doctype"])} name={s(r["reference_name"])} />{Number(r["revoked"]) ? ` (${tx("أُلغيت", "revoked")})` : ""}</span>)}</div>}
    <div className="flex flex-wrap gap-2">
      <button type="button" className={btnP} disabled={!writable || status === "Revoked"} data-r9-action="delegation.activate"
        onClick={() => run(() => A.delegationActivate(doc.name), tx("تم تفعيل التفويض", "Delegation active"))}>{status === "Active" ? tx("مشاركة الطلبات الجديدة", "Share new requests") : tx("تفعيل", "Activate")}</button>
      <button type="button" className={btn} disabled={!writable || status !== "Active"} data-r9-action="delegation.revoke"
        onClick={() => run(() => A.delegationRevoke(doc.name), tx("أُلغي التفويض", "Delegation revoked"))}>{tx("إلغاء التفويض", "Revoke")}</button>
    </div>
    <p className="text-xs text-muted-foreground">{tx("القرار يُتخذ في المستند الأصلي. سجل المشاركة يُحفظ هنا؛ الصلاحية التي يمنحها يطبقها خادم DIGIT.", "The decision is taken in the native document. The share record is kept here; the access it grants is enforced by the DIGIT server.")}</p>
  </Panel>;
}

// ------------------------------------------------------------------ APR-02
function ApprovalPanel({ doctype, doc }: { doctype: string; doc: Doc }) {
  const { tx } = useTx(); const user = useSessionUser();
  const [rows, setRows] = useState<{ approver: string; substitute: string }[]>([{ approver: "", substitute: "" }]);
  const [rule, setRule] = useState("All"); const [quorum, setQuorum] = useState(1); const [note, setNote] = useState("");
  let st: A.ApprovalStatus | null = null; let err = "";
  try { st = A.approvalStatus(doctype, doc.name); } catch (e) { err = (e as Error).message; }
  if (err) return null;
  const mine = st?.state === "ok" ? st.approvers.find((r) => [r.approver, r.substitute].includes(user)) : undefined;
  return <Panel id="APR-02" title={tx("اعتماد متوازٍ", "Parallel approval")} meta={st?.state === "ok" ? <StatusBadge value={st.approval_status} /> : tx("لا توجد جولة اعتماد", "No approval round")}>
    {st?.state === "ok" && <>
      <div className="text-sm">{tx("القاعدة", "Rule")}: <b data-no-i18n>{st.rule}{st.rule === "Quorum" ? ` (${st.quorum})` : ""}</b> · <DocLink dt={DPA} name={st.round} /></div>
      <table className="w-full text-sm" data-r9-approvers><thead><tr className="text-start text-muted-foreground"><th className="text-start">{tx("المعتمد", "Approver")}</th><th className="text-start">{tx("البديل", "Substitute")}</th><th className="text-start">{tx("القرار", "Decision")}</th><th className="text-start">{tx("بواسطة", "By")}</th></tr></thead>
        <tbody>{st.approvers.map((r, i) => <tr key={i}><td data-no-i18n>{r.approver}</td><td data-no-i18n>{r.substitute || "—"}</td><td><StatusBadge value={r.decision} /></td><td data-no-i18n>{r.decided_by ? `${r.decided_by} · ${r.decided_on ?? ""}` : "—"}</td></tr>)}</tbody></table>
      {mine && mine.decision === "Pending" && st.approval_status === "Pending" && <div className="flex flex-wrap items-end gap-2">
        <label className="min-w-[220px] flex-1 text-sm">{tx("ملاحظة (مطلوبة للرفض)", "Note (required to reject)")}<input className={input} value={note} onChange={(e) => setNote(e.target.value)} /></label>
        <button type="button" className={btnP} data-r9-action="approval.approve" onClick={() => { const round = st!.state === "ok" ? st!.round : ""; if (run(() => A.approvalDecide(round, "Approve", note), tx("سُجل الاعتماد", "Approval recorded"))) setNote(""); }}>{tx("اعتماد", "Approve")}</button>
        <button type="button" className={btn} data-r9-action="approval.reject" onClick={() => { const round = st!.state === "ok" ? st!.round : ""; if (run(() => A.approvalDecide(round, "Reject", note), tx("سُجل الرفض", "Rejection recorded"))) setNote(""); }}>{tx("رفض", "Reject")}</button>
      </div>}
      {st.approval_status === "Pending" && <p className="text-xs text-muted-foreground">{tx("لا يمكن اعتماد المستند حتى تكتمل الجولة.", "The document cannot be submitted until the round is approved.")}</p>}
    </>}
    {st?.state === "no_round" && Number(doc.docstatus ?? 0) === 0 && can(DPA, "create") && can(doctype, "write", doc) && <div className="space-y-2" data-r9-start>
      {rows.map((r, i) => <div key={i} className="grid gap-2 md:grid-cols-[1fr_1fr_auto]">
        <UserSelect label={tx("المعتمد", "Approver")} value={r.approver} onChange={(v) => setRows(rows.map((x, j) => (j === i ? { ...x, approver: v } : x)))} />
        <UserSelect label={tx("البديل (اختياري)", "Substitute (optional)")} allowEmpty value={r.substitute} onChange={(v) => setRows(rows.map((x, j) => (j === i ? { ...x, substitute: v } : x)))} />
        <button type="button" className={btn} aria-label={tx("حذف", "Remove")} disabled={rows.length === 1} onClick={() => setRows(rows.filter((_, j) => j !== i))}>×</button>
      </div>)}
      <div className="flex flex-wrap items-end gap-2">
        <button type="button" className={btn} onClick={() => setRows([...rows, { approver: "", substitute: "" }])}>{tx("إضافة معتمد", "Add approver")}</button>
        <label className="text-sm">{tx("القاعدة", "Rule")}<select className={input} value={rule} onChange={(e) => setRule(e.target.value)} data-no-i18n><option>All</option><option>Any</option><option>Quorum</option></select></label>
        {rule === "Quorum" && <label className="text-sm">{tx("النصاب", "Quorum")}<input type="number" min={1} className={input} value={quorum} onChange={(e) => setQuorum(Number(e.target.value))} /></label>}
        <button type="button" className={btnP} data-r9-action="approval.start" onClick={() => run(() => A.approvalStart(doctype, doc.name, rows.filter((r) => r.approver).map((r) => ({ approver: r.approver, ...(r.substitute ? { substitute: r.substitute } : {}) })), rule, rule === "Quorum" ? quorum : undefined), tx("بدأت جولة الاعتماد", "Approval round started"))}>{tx("إرسال للاعتماد", "Send for approval")}</button>
      </div>
      <p className="text-xs text-muted-foreground">{tx("من يحق له اعتماد هذه المستندات نهائيًا ما زال قرار المالك رقم 9؛ صلاحيات الإرسال لم تتغير.", "Who may submit these documents is still owner decision #9; submit permissions are unchanged.")}</p>
    </div>}
  </Panel>;
}

// ------------------------------------------------------------------ POR-04
function BankPanel({ doc }: { doc: Doc }) {
  const { tx } = useTx(); useSessionUser(); const [note, setNote] = useState("");
  const status = s(doc["request_status"]) || "Draft"; const hr = isHr(); const writable = can(DBC, "write", doc);
  return <Panel id="POR-04" title={tx("طلب تغيير الحساب البنكي", "Bank change request")} meta={<StatusBadge value={status} />}>
    <div className="flex flex-wrap items-end gap-2">
      {status === "Draft" && <button type="button" className={btnP} disabled={!writable} data-r9-action="bank.submit" onClick={() => run(() => A.bankSubmit(doc.name), tx("قُدِّم الطلب", "Request submitted"))}>{tx("تقديم الطلب", "Submit request")}</button>}
      {status === "Submitted" && hr && <>
        <label className="min-w-[220px] flex-1 text-sm">{tx("ملاحظة القرار (مطلوبة للرفض)", "Decision note (required to reject)")}<input className={input} value={note} onChange={(e) => setNote(e.target.value)} /></label>
        <button type="button" className={btnP} data-r9-action="bank.approve" onClick={() => run(() => A.bankDecide(doc.name, "Approve", note), tx("اعتُمد الطلب", "Request approved"))}>{tx("اعتماد", "Approve")}</button>
        <button type="button" className={btn} data-r9-action="bank.reject" onClick={() => run(() => A.bankDecide(doc.name, "Reject", note), tx("رُفض الطلب", "Request rejected"))}>{tx("رفض", "Reject")}</button>
      </>}
      {status === "Approved" && hr && <button type="button" className={btnP} data-r9-action="bank.apply" onClick={() => run(() => A.bankApply(doc.name), tx("طُبّقت البيانات على سجل الموظف", "Applied to the employee record"))}>{tx("تطبيق على سجل الموظف", "Apply to employee")}</button>}
    </div>
    {status === "Applied" && <p className="text-sm">{tx("طُبّق على الموظف", "Applied to employee")} <DocLink dt="Employee" name={s(doc["employee"])} /> · {tx("الحساب السابق", "Previous account")} <span className="dhr-code" data-no-i18n>{s(doc["previous_account_masked"]) || "—"}</span></p>}
    <p className="text-xs text-muted-foreground">{tx("الموظف يقدّم الطلب، وفريق الموارد البشرية (وليس صاحب السجل) يقرر ويطبّق.", "The employee files the request; HR (never about their own record) decides and applies it.")}</p>
  </Panel>;
}

// ------------------------------------------------------------------ POR-03 + CAS-04 on the service case
function ServicePicker({ doc, onChange }: { doc: Doc; onChange: FormPanelProps["onChange"] }) {
  const { tx, lang } = useTx(); const user = useSessionUser();
  const emp = s(doc["employee"]) || ownEmployees(user)[0] || "";
  const who = emp && !ownEmployees(user).includes(emp) ? emp : undefined;
  let cat: ReturnType<typeof A.serviceCatalog> | null = null; let sug: ReturnType<typeof A.serviceClassify> | null = null;
  try { cat = emp ? A.serviceCatalog(who, { ar: lang === "ar" }) : null; } catch { cat = null; }
  try { sug = emp && s(doc["subject"]).trim().length >= 3 ? A.serviceClassify(s(doc["subject"]), who, { ar: lang === "ar" }) : null; } catch { sug = null; }
  if (!cat || cat.state === "not_configured") return null;
  const choose = (svc: A.CatalogService) => onChange({ service_item: svc.service, category: svc.category });
  return <Panel id="POR-03" title={tx("كتالوج الخدمات", "Service catalog")} meta={tx("اختر الخدمة لتُضبط الفئة والأهمية والمهلة عند الحفظ", "Choose a service; category, severity and SLA are set on save")}>
    {sug && sug.suggestions.length > 0 && <div data-r9-suggest><div className="text-sm font-medium">{tx("مقترح من نص الموضوع", "Suggested from the subject")}</div>
      <div className="mt-1 flex flex-wrap gap-2">{sug.suggestions.map((x) => <button type="button" key={x.service} className={s(doc["service_item"]) === x.service ? btnP : btn} onClick={() => choose(x)} data-r9-service={x.service}>{x.title}</button>)}</div></div>}
    {cat.categories.map((c) => <div key={c.category}><div className="text-xs font-medium text-muted-foreground">{c.label}</div>
      <div className="mt-1 flex flex-wrap gap-2">{c.services.map((x) => <button type="button" key={x.service} className={s(doc["service_item"]) === x.service ? btnP : btn} onClick={() => choose(x)} data-r9-service={x.service} title={x.description ?? undefined}>{x.title}{x.sla_hours ? ` · ${x.sla_hours}${tx("س", "h")}` : ""}</button>)}</div></div>)}
    {cat.state === "no_data" && <p className="text-sm text-muted-foreground">{tx("لا توجد خدمات متاحة لهذا الموظف", "No services available for this employee")}</p>}
  </Panel>;
}
const SLA: Record<string, [string, string]> = { no_sla: ["بلا مهلة", "No SLA"], met: ["التُزم بالمهلة", "Met"], breached: ["تجاوز المهلة", "Breached"], paused: ["موقوفة", "Paused"], at_risk: ["معرّضة للتأخر", "At risk"], on_track: ["ضمن المهلة", "On track"] };
function RoutingPanel({ doc }: { doc: Doc }) {
  const { tx } = useTx(); useSessionUser(); const [reason, setReason] = useState("");
  const rule = matchRule(doc); const sla = slaState(doc); const writable = can(DSC, "write", doc);
  const tone = sla.state === "breached" ? "danger" : sla.state === "at_risk" ? "warn" : sla.state === "on_track" || sla.state === "met" ? "success" : "neutral";
  return <Panel id="CAS-04" title={tx("توجيه الحالة والتصعيد", "Case routing and escalation")} meta={<span className="dhr-pill" data-tone={tone} data-r9-sla={sla.state}>{tx(SLA[sla.state]![0], SLA[sla.state]![1])}</span>}>
    <p className="text-sm">{rule ? <>{tx("القاعدة المطابقة", "Matching rule")}: <DocLink dt="DIGIT HR Case Routing Rule" name={rule.name} /> → <span data-no-i18n>{s(rule["assign_to"])}</span>{s(rule["escalate_to"]) ? <> · {tx("التصعيد إلى", "escalates to")} <span data-no-i18n>{s(rule["escalate_to"])}</span></> : null}</> : tx("لا توجد قاعدة توجيه مفعّلة تطابق هذه الحالة", "No enabled routing rule matches this case")}</p>
    <div className="flex flex-wrap items-end gap-2">
      <button type="button" className={btn} disabled={!writable || !rule || s(rule["assign_to"]) === s(doc["assigned_to"])} data-r9-action="case.route" onClick={() => run(() => A.caseRoute(doc.name), tx("وُجّهت الحالة", "Case routed"))}>{tx("توجيه حسب القاعدة", "Route by rule")}</button>
      {(sla.state === "at_risk" || sla.state === "breached") && <>
        <label className="min-w-[220px] flex-1 text-sm">{tx("سبب التصعيد", "Escalation reason")}<input className={input} value={reason} onChange={(e) => setReason(e.target.value)} /></label>
        <button type="button" className={btnP} disabled={!writable || !s(rule?.["escalate_to"])} data-r9-action="case.escalate" onClick={() => { if (run(() => A.caseEscalate(doc.name, reason), tx("صُعّدت الحالة", "Case escalated"))) setReason(""); }}>{tx("تصعيد", "Escalate")}</button>
      </>}
    </div>
  </Panel>;
}

// ------------------------------------------------------------------ PAY-04
function PayrollLockBanner({ doctype, doc }: { doctype: string; doc: Doc }) {
  const { tx } = useTx();
  const [from, to] = payrollDates(doctype, doc); const hit = locksFor(s(doc["company"]), from, to)[0];
  if (!hit) return null;
  return <div className="dhr-alert mb-3" data-tone="warn" role="status" data-r9-panel="PAY-04" data-r9-lock={hit.name}>
    <b>{tx("فترة الرواتب مقفلة", "Payroll period locked")}</b> — <span data-no-i18n>{s(hit["from_date"]).slice(0, 10)} – {s(hit["to_date"]).slice(0, 10)}</span> · <DocLink dt={DPL} name={hit.name} />. {tx("لا يمكن حفظ أو اعتماد أو إلغاء هذا المستند حتى يعيد مدير الموارد البشرية فتح الفترة.", "This document cannot be saved, submitted or cancelled until an HR Manager reopens the period.")}
  </div>;
}

// ------------------------------------------------------------------ HIR-04
function InviteOff() {
  const { tx } = useTx();
  return <div className="dhr-alert" data-tone="info" role="status" data-r9-flag="off">{tx("دعوات الموظفين الجدد غير مفعّلة على هذا الموقع: تفعيلها قرار المالك (مسار وصول جديد لمن ليس لديه حساب). صفحة دعوة الموظف الجديد تعمل على موقع DIGIT.", "Onboarding invites are not enabled on this site: enabling them is the owner's decision (a new access path for people without an account). The joiner's invite page runs on the DIGIT site.")}</div>;
}
function InvitePanel({ doc }: { doc: Doc }) {
  const { tx } = useTx(); useSessionUser(); const on = A.onboardingInvitesEnabled(); const status = s(doc["invite_status"]) || "Active";
  return <Panel id="HIR-04" title={tx("دعوة الموظف الجديد", "Joiner invitation")} meta={<StatusBadge value={status} />}>
    {!on && <InviteOff />}
    <div className="flex flex-wrap gap-2">
      <button type="button" className={btnP} disabled={!on || status !== "Submitted"} data-r9-action="invite.apply" onClick={() => run(() => A.inviteApply(doc.name), tx("طُبّقت البيانات على الموظف", "Applied to the employee"))}>{tx("تطبيق على سجل الموظف", "Apply to employee")}</button>
      <button type="button" className={btn} disabled={!on || ["Applied", "Revoked"].includes(status)} data-r9-action="invite.revoke" onClick={() => run(() => A.inviteRevoke(doc.name), tx("أُلغيت الدعوة", "Invitation revoked"))}>{tx("إلغاء الدعوة", "Revoke")}</button>
    </div>
  </Panel>;
}
function OnboardingInvite({ doc }: { doc: Doc }) {
  const { tx } = useTx(); useSessionUser(); const on = A.onboardingInvitesEnabled(); const [link, setLink] = useState("");
  const last = adapter.list(DOI).filter((x) => s(x["employee_onboarding"]) === doc.name).sort((a, b) => s(b["creation"]).localeCompare(s(a["creation"])))[0];
  return <Panel id="HIR-04" title={tx("دعوة الموظف الجديد لإكمال بياناته", "Invite the joiner to complete their details")} meta={last ? <><DocLink dt={DOI} name={last.name} /> · <StatusBadge value={s(last["invite_status"])} /></> : undefined}>
    {!on && <InviteOff />}
    <button type="button" className={btnP} disabled={!on || Number(doc.docstatus ?? 0) === 2} data-r9-action="invite.create" onClick={() => { try { const r = A.inviteCreate(doc.name); setLink(r.url); toast.success(tx("أُنشئت الدعوة", "Invitation created")); } catch (e) { toast.error((e as Error).message); } }}>{tx("إنشاء دعوة", "Create invitation")}</button>
    {link && <p className="text-sm">{tx("الرابط يظهر مرة واحدة ولا يُحفظ؛ أرسله للموظف بنفسك", "The link is shown once and not stored; send it to the joiner yourself")}: <span className="dhr-code break-all" data-no-i18n>{link}</span></p>}
  </Panel>;
}

/** DIGIT HR native-form panels (R9). Renders nothing for unrelated DocTypes. */
export function HrR9Panels(props: FormPanelProps) {
  const { meta, doc, onChange } = props;
  useScopeMetas(NATIVE);
  const dt = meta.name; const saved = !doc["__islocal"];
  const R9 = [DAD, DBC, DOI, DSC, "Salary Slip", "Additional Salary", "Employee Onboarding", ...SUPPORTED];
  if (!R9.includes(dt) && !SMART_GUIDE_DOCTYPES.has(dt) && !TOUR_DOCTYPES.has(dt)) return null;
  // .digit-hr carries the HR tokens (the native form is outside the HR pages' theme wrapper)
  return <div className="digit-hr" data-r9-panels>
    {TOUR_DOCTYPES.has(dt) && <TourLauncher {...props} />}
    {SMART_GUIDE_DOCTYPES.has(dt) && <SmartGuidePanel {...props} />}
    {saved && dt === DAD && <DelegationPanel doc={doc} />}
    {saved && SUPPORTED.includes(dt) && <ApprovalPanel doctype={dt} doc={doc} />}
    {saved && dt === DBC && <BankPanel doc={doc} />}
    {!saved && dt === DSC && <ServicePicker doc={doc} onChange={onChange} />}
    {saved && dt === DSC && <RoutingPanel doc={doc} />}
    {(dt === "Salary Slip" || dt === "Additional Salary") && <PayrollLockBanner doctype={dt} doc={doc} />}
    {saved && dt === DOI && <InvitePanel doc={doc} />}
    {saved && dt === "Employee Onboarding" && <OnboardingInvite doc={doc} />}
  </div>;
}
