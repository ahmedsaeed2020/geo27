/**
 * HR R9 extras on native forms and pages (owner-approved, tracker rows APR-03, SHL-07, CMP-04, SHL-08):
 * - SmartGuidePanel: digit_hr.api.guide.document next to the FULL native form (never instead of it). It only explains:
 *   the native toolbar keeps every save / submit / workflow button.
 * - TourLauncher: digit_hr.api.tours.for_form — step-by-step field walkthrough; never saves or changes the document.
 * - CompensationStatement: digit_hr.api.compensation.statement on Employee 360 (own record or HR roles).
 * - HrReleaseNotes: digit_hr release_notes.json on the shared Help page while DIGIT HR is active.
 */
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import type { Doc } from "@/lib/adapter";
import { useStoreVersion } from "@/lib/adapter";
import { evalDependsSafe } from "@/lib/expr";
import { fmtCurrency } from "@/lib/format";
import { useScopeMetas } from "@/lib/scope";
import { useSessionUser } from "@/lib/session";
import type { FormPanelProps } from "@/plugins/experienceSlots";
import { GUIDED, guideDocument, type Fact, type Guide, type GuideAction } from "@/plugins/digit_hr/r9/guide";
import { forForm, TOUR_DOCTYPES, tourText, type Tour } from "@/plugins/digit_hr/r9/tours";
import { statement, type CompensationStatement as Stmt } from "@/plugins/digit_hr/r9/compensation";
import { releaseNotes } from "@/plugins/digit_hr/r9/releaseNotes";
import { useTx } from "./HrNav";
import { StatusBadge } from "./ui";
import { HR_DOC_SEARCH } from "@/plugins/digit_hr/product/urls";

const slugOf = (dt: string) => dt.toLowerCase().replace(/ /g, "_");
const appOf = (dt: string) => (dt.startsWith("DIGIT ") || /^(Leave|Expense|Shift|Employee (Onboarding|Promotion|Transfer|Advance)|Job (Offer|Applicant)|Attendance Request|Payroll|Salary)/.test(dt) ? "hrms" : "erpnext");
function DocLink({ dt, name }: { dt: string; name: string }) {
  return <Link to="/app/$app/$doctype/$name" search={HR_DOC_SEARCH as never} params={{ app: appOf(dt), doctype: slugOf(dt), name }} className="dhr-link" data-no-i18n>{name}</Link>;
}
const num = (v: unknown) => <span data-no-i18n>{(Number(v) || 0).toLocaleString("en-US", { maximumFractionDigits: 3 })}</span>;
/** Moves focus to a native form field (the Core FormView marks every control with data-field + data-fieldtype). */
function fieldEl(fieldname: string): HTMLElement | null { return document.querySelector<HTMLElement>(`[data-field="${CSS.escape(fieldname)}"][data-fieldtype]`); }
function goToField(fieldname: string) {
  const el = fieldEl(fieldname) ?? document.querySelector<HTMLElement>(`[data-field="${CSS.escape(fieldname)}"]`);
  if (!el) return false;
  el.scrollIntoView({ block: "center", behavior: "smooth" });
  el.querySelector<HTMLElement>("input,select,textarea,button")?.focus({ preventScroll: true });
  return true;
}

// ------------------------------------------------------------------ APR-03 Smart Guide
const WILL_FAIL: Record<string, [string, string]> = {
  missing_fields: ["أكمل الحقول الناقصة أولًا", "Fill the missing fields first"],
  shift_overlap: ["يتداخل مع إسناد وردية نشط", "Overlaps an active shift assignment"],
  effective_date: ["تاريخ السريان لم يحن بعد", "The effective date has not been reached"],
  job_offer_status: ["عرض العمل غير مقبول", "The job offer is not accepted"],
  contract_end: ["انتهى العقد", "The contract has ended"],
};
const ACTION: Record<string, [string, string]> = { save: ["حفظ", "Save"], submit: ["اعتماد", "Submit"], cancel: ["إلغاء", "Cancel"] };
function FactRow({ f, doctype }: { f: Fact; doctype: string }) {
  const { tx } = useTx();
  const tone = f.state === "blocked" ? "danger" : f.state === "warning" ? "warn" : f.state === "server_required" ? "neutral" : "success";
  const rec = (f["record"] as [string, string] | undefined);
  let body: ReactNode;
  switch (f.key) {
    case "leave_balance": body = f.state === "no_allocation"
      ? tx(`لا يوجد تخصيص معتمد يغطي ${String(f["as_of"])}`, `No submitted allocation covers ${String(f["as_of"])}`)
      : <>{tx(`رصيد الإجازة في ${String(f["as_of"])}`, `Leave balance on ${String(f["as_of"])}`)}: <b>{num(f["remaining"])}</b> · {tx("المخصص", "Allocated")} {num(f["allocated"])} · {tx("المأخوذ", "Taken")} {num(f["taken"])} · {tx("بانتظار الاعتماد", "Pending approval")} {num(f["pending_approval"])}</>; break;
    case "leave_approver": body = <>{tx("معتمد الإجازة", "Leave approver")}: <span data-no-i18n>{String(f.value)}</span></>; break;
    case "shift_overlap": { const b = (f["blocking_records"] as string[]) ?? [];
      body = f.state === "ok" ? tx("لا يتداخل مع إسناد وردية نشط", "No overlapping active shift assignment")
        : <>{tx("يتداخل مع إسنادات ورديات نشطة — سيرفض الاعتماد", "Overlaps active shift assignments — approval will be refused")}{b.length ? <>: {b.map((n) => <span key={n} className="me-2"><DocLink dt="Shift Assignment" name={n} /></span>)}</> : null}</>; break; }
    case "effective_date": body = f.state === "ok" ? tx(`تاريخ السريان ${String(f.value)}: يُطبَّق على سجل الموظف عند الاعتماد`, `Effective ${String(f.value)}: applied to the Employee record on submit`)
      : tx(`تاريخ السريان ${String(f.value)} في المستقبل: لا يمكن الاعتماد قبله`, `Effective date ${String(f.value)} is in the future: it cannot be submitted before then`); break;
    case "applicant_status": body = <>{tx("حالة المتقدم", "Applicant status")}: <StatusBadge value={String(f.value)} /> {rec && <DocLink dt={rec[0]} name={rec[1]} />}</>; break;
    case "job_offer_status": body = <>{f.state === "ok" ? tx("عرض العمل مقبول", "Job offer accepted") : tx("التهيئة تحتاج عرض عمل مقبولًا", "Onboarding needs an accepted job offer")}: <StatusBadge value={String(f.value ?? "")} /> {rec && <DocLink dt={rec[0]} name={rec[1]} />}</>; break;
    case "pending_advance_amount": body = <>{tx("مبلغ السلفة المعلّق", "Pending advance amount")}: {num(f.value)}</>; break;
    case "contract_end": body = tx(`ينتهي العقد ${String(f.value)} (${String(f["days_left"])} يومًا)`, `Contract ends ${String(f.value)} (${String(f["days_left"])} days)`); break;
    case "amended_contract": body = <>{tx("العقد المعدَّل", "Amended contract")}: {rec && <DocLink dt={rec[0]} name={rec[1]} />} <StatusBadge value={String(f["contract_status"] ?? "")} /> {f["end_date"] ? tx(`ينتهي ${String(f["end_date"])}`, `ends ${String(f["end_date"])}`) : null}</>; break;
    case "payroll_readiness": body = f.state === "recorded"
      ? <>{tx("آخر فحص جاهزية للمسير", "Latest payroll preflight")}: <StatusBadge value={String(f.value ?? "")} /> <DocLink dt="DIGIT Payroll Preflight" name={String(f["latest_record"])} /></>
      : tx("فحص جاهزية المسير يعمل على خادم DIGIT؛ لا يوجد فحص مسجل بعد", "The payroll preflight runs on the DIGIT server; no recorded check yet"); break;
    default: body = <>{f.key.replace(/_/g, " ")}: <span data-no-i18n>{String(f.value ?? "")}</span></>;
  }
  void doctype;
  return <li className="dhr-alert text-sm" data-tone={tone} data-guide-fact={f.key} data-state={f.state}>{body}</li>;
}
function actionText(a: GuideAction, tx: (ar: string, en: string) => string) {
  return a.action === "workflow" ? <>{a.label} <span className="text-muted-foreground">→ {a.next_state}</span></> : tx(...ACTION[a.action]!);
}
export function SmartGuidePanel({ meta, doc }: FormPanelProps) {
  const { tx } = useTx(); useSessionUser(); useStoreVersion();
  const dt = meta.name; const saved = !doc["__islocal"];
  const childTypes = meta.fields.filter((f) => f.fieldtype === "Table" && f.options).map((f) => f.options!);
  useScopeMetas(useMemo(() => [dt, ...childTypes, "Leave Allocation", "Leave Application", "Shift Assignment", "Job Applicant", "Job Offer", "DIGIT Employment Contract", "DIGIT Payroll Preflight"], [dt, childTypes.join()]));
  let g: Guide | null = null; let err = "";
  try { g = guideDocument(dt, saved ? doc.name : undefined, doc as Record<string, unknown>); } catch (e) { err = (e as Error).message; }
  if (!g) return err ? <section className="dhr-panel mb-3" data-r9-panel="APR-03"><div className="dhr-panel-b text-sm text-muted-foreground">{err}</div></section> : null;
  const missing = g.will_block_save ?? [];
  const ruleNow = g.form_rules.filter((r) => r.required_now && !r.filled);
  return <details className="dhr-panel mb-3" data-r9-panel="APR-03" open aria-label={tx("الدليل الذكي", "Smart guide")}>
    <summary className="dhr-panel-h cursor-pointer list-none [&::-webkit-details-marker]:hidden">
      <div><h2 className="dhr-panel-t">{tx("الدليل الذكي", "Smart guide")}</h2>
        <div className="dhr-panel-m">{missing.length ? tx(`${missing.length} حقل إلزامي ناقص`, `${missing.length} required field(s) missing`) : tx("الحقول الإلزامية مكتملة", "Required fields complete")} · <span data-no-i18n>{g.section}</span></div></div>
    </summary>
    <div className="dhr-panel-b grid gap-3 md:grid-cols-2">
      <div className="space-y-3">
        {g.editable && <div data-guide-missing>
          <div className="text-sm font-medium">{tx("قبل الحفظ", "Before you can save")}</div>
          {missing.length ? <ul className="mt-1 flex flex-wrap gap-1.5">{missing.map((m) => <li key={`${m.table ?? ""}${m.row ?? ""}${m.fieldname}`}>
            <button type="button" className="dhr-btn dhr-btn-sm" onClick={() => goToField(m.table ?? m.fieldname)} data-guide-field={m.fieldname}>{m.label}{m.table ? <span className="text-muted-foreground" data-no-i18n> · #{m.row}</span> : null}</button></li>)}</ul>
            : <p className="mt-1 text-sm text-muted-foreground">{tx("لا توجد حقول إلزامية ناقصة.", "No required field is missing.")}</p>}
          {ruleNow.length > 0 && <p className="mt-2 text-sm" data-guide-rules>{tx("مطلوب الآن بحسب شروط النموذج", "Required now by form rules")}: {ruleNow.map((r) => <button key={r.fieldname} type="button" className="dhr-link me-2" onClick={() => goToField(r.fieldname)}>{r.label}</button>)}</p>}
        </div>}
        <div data-guide-actions>
          <div className="text-sm font-medium">{tx("الخطوات المتاحة لك", "Steps you can take")}</div>
          {g.actions.length ? <ul className="mt-1 space-y-1 text-sm">{g.actions.map((a, i) => <li key={i} data-guide-action={a.action} data-will-fail={a.will_fail ?? ""}>
            {actionText(a, tx)}{a.will_fail ? <span className="ms-2 text-[var(--dhr-danger)]">— {tx(...(WILL_FAIL[a.will_fail] ?? [a.will_fail, a.will_fail]))}</span> : null}</li>)}</ul>
            : <p className="mt-1 text-sm text-muted-foreground">{tx("لا توجد خطوات متاحة لك على هذا المستند.", "No step is available to you on this document.")}</p>}
          <p className="mt-1 text-xs text-muted-foreground">{tx("أزرار الحفظ والاعتماد تبقى في شريط النموذج الأصلي.", "Save and submit stay on the native form toolbar.")}</p>
        </div>
      </div>
      <div className="space-y-2">
        {g.facts.length > 0 && <ul className="space-y-1.5" data-guide-facts>{g.facts.map((f) => <FactRow key={f.key} f={f} doctype={dt} />)}</ul>}
        {g.server_check?.state === "server_required" && <p className="text-xs text-muted-foreground" data-guide-server-check="server_required">{tx("تحقق المستند نفسه على الخادم (التداخل، الرصيد، المعتمد…) يعمل عند الحفظ على خادم DIGIT ولا يُحاكى هنا.", "The document's own server validation (overlaps, balance, approver…) runs when it is saved on the DIGIT server and is not simulated here.")}</p>}
      </div>
    </div>
  </details>;
}

// ------------------------------------------------------------------ SHL-07 guided tours
export function TourLauncher({ meta, doc }: FormPanelProps) {
  const { tx, lang } = useTx(); const ar = lang === "ar"; useSessionUser();
  const dt = meta.name; const saved = !doc["__islocal"];
  const [open, setOpen] = useState<Tour | null>(null); const [i, setI] = useState(0);
  let tours: Tour[] = [];
  try { tours = forForm(dt, saved ? doc.name : undefined).tours; } catch { tours = []; }
  const steps = (open?.steps ?? []).filter((st) => !st.depends_on || evalDependsSafe(st.depends_on, doc as Record<string, unknown>).value);
  const step = steps[Math.min(i, steps.length - 1)];
  const [found, setFound] = useState(true);
  useEffect(() => {
    if (!step) return;
    const el = fieldEl(step.fieldname); setFound(!!el);
    if (!el) return;
    el.setAttribute("data-hr-tour-active", ""); el.scrollIntoView({ block: "center", behavior: "smooth" });
    return () => el.removeAttribute("data-hr-tour-active");
  }, [step?.fieldname, open]);
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(null); };
    window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k);
  }, [open]);
  if (!tours.length) return null;
  return <div className="mb-3 flex flex-wrap items-center gap-2" data-r9-panel="SHL-07">
    <span className="text-sm text-muted-foreground">{tx("جولة إرشادية", "Guided tour")}:</span>
    {tours.map((x) => <button key={x.key} type="button" className="dhr-btn dhr-btn-sm" data-tour={x.key} onClick={() => { setOpen(x); setI(0); }}>{tourText(x.title, ar)}</button>)}
    {open && step && <div role="dialog" aria-modal="false" aria-label={tourText(open.title, ar)} className="digit-hr fixed bottom-4 end-4 z-50 w-[min(92vw,380px)] rounded-lg border border-border bg-card p-4 shadow-lg" data-tour-dialog={open.key}>
      <div className="flex items-start justify-between gap-2">
        <div className="text-xs text-muted-foreground" data-no-i18n>{tourText(open.title, ar)} · {Math.min(i, steps.length - 1) + 1}/{steps.length}</div>
        <button type="button" className="dhr-btn dhr-btn-sm" onClick={() => setOpen(null)} aria-label={tx("إغلاق", "Close")}>×</button>
      </div>
      <h3 className="mt-1 font-semibold" aria-live="polite">{tourText(step.title, ar)}</h3>
      <p className="mt-1 text-sm">{tourText(step.description, ar)}</p>
      {!found && <p className="mt-1 text-xs text-muted-foreground">{tx("هذا الحقل في تبويب آخر من النموذج.", "This field is on another tab of the form.")}</p>}
      <div className="mt-3 flex flex-wrap justify-end gap-2">
        <button type="button" className="dhr-btn dhr-btn-sm" disabled={i === 0} onClick={() => setI((x) => Math.max(0, x - 1))}>{tx("السابق", "Previous")}</button>
        {i < steps.length - 1 ? <button type="button" className="dhr-btn dhr-btn-sm dhr-btn-primary" onClick={() => setI((x) => x + 1)}>{tx("التالي", "Next")}</button>
          : <button type="button" className="dhr-btn dhr-btn-sm dhr-btn-primary" onClick={() => setOpen(null)}>{tx("تم", "Done")}</button>}
      </div>
    </div>}
  </div>;
}
export const SMART_GUIDE_DOCTYPES: ReadonlySet<string> = new Set(Object.keys(GUIDED));
export { TOUR_DOCTYPES };

// ------------------------------------------------------------------ CMP-04 compensation statement
export function CompensationStatement({ employee }: { employee: string }) {
  const { tx } = useTx(); useSessionUser(); useStoreVersion();
  useScopeMetas(useMemo(() => ["Employee", "Salary Structure Assignment", "Salary Slip", "Additional Salary"], []));
  const thisYear = new Date().getFullYear();
  const [year, setYear] = useState(thisYear);
  let st: Stmt | null = null; let err = "";
  try { st = statement(employee, year); } catch (e) { err = (e as Error).message; }
  const denied = (x: { state: string }) => x.state === "denied";
  const money = (v: number, c?: string) => <span data-no-i18n>{fmtCurrency(v, c || undefined)}</span>;
  return <section className="border-b p-3" data-r9-panel="CMP-04" aria-label={tx("بيان التعويضات", "Compensation statement")}>
    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
      <h3 className="text-sm font-semibold">{tx("بيان التعويضات الإجمالي", "Total compensation statement")}</h3>
      <select className="rounded-md border border-border bg-background px-2 py-1 text-sm" aria-label={tx("السنة", "Year")} value={year} onChange={(e) => setYear(Number(e.target.value))} data-no-i18n>
        {[thisYear, thisYear - 1, thisYear - 2].map((y) => <option key={y} value={y}>{y}</option>)}</select>
    </div>
    {!st ? <p className="text-sm text-muted-foreground">{err}</p> : <div className="grid gap-3 md:grid-cols-2">
      <div className="space-y-2 text-sm" data-cmp-section="assignment">
        <div className="font-medium">{tx("الإسناد الحالي", "Current assignment")}</div>
        {denied(st.current_assignment) ? <p className="text-muted-foreground">{tx("لا تملك صلاحية قراءة إسناد الراتب.", "You may not read salary structure assignments.")}</p>
          : st.current_assignment.state === "ok" ? <p><DocLink dt="Salary Structure Assignment" name={st.current_assignment.name} /> · <span data-no-i18n>{st.current_assignment.salary_structure}</span> · {tx("من", "from")} <span data-no-i18n>{st.current_assignment.from_date}</span><br />{tx("الأساسي", "Base")} {money(st.current_assignment.base, st.current_assignment.currency)}{st.current_assignment.variable ? <> · {tx("المتغير", "Variable")} {money(st.current_assignment.variable, st.current_assignment.currency)}</> : null}</p>
          : <p className="text-muted-foreground">{tx("لا يوجد إسناد راتب معتمد.", "No submitted salary assignment.")}</p>}
        <div className="font-medium">{tx("إضافات الراتب", "Additional salary")}</div>
        {denied(st.additional_salary) ? <p className="text-muted-foreground">{tx("لا تملك صلاحية قراءة إضافات الراتب.", "You may not read additional salary.")}</p>
          : st.additional_salary.state === "ok" && st.additional_salary.items.length ? <ul>{st.additional_salary.items.map((x) => <li key={x.type + x.component}>{x.type === "Deduction" ? tx("استقطاع", "Deduction") : tx("استحقاق", "Earning")} · <span data-no-i18n>{x.component}</span>: {money(x.amount)}</li>)}</ul>
          : <p className="text-muted-foreground">{tx("لا توجد إضافات معتمدة في هذه السنة.", "No submitted additional salary this year.")}</p>}
        <p className="text-xs text-muted-foreground" data-cmp-section="employer">{tx("مساهمات صاحب العمل تُحسب من معادلات هيكل الراتب على خادم DIGIT ولا تُقدَّر هنا.", "Employer contributions come from the salary structure formulas on the DIGIT server and are not estimated here.")}</p>
      </div>
      <div className="space-y-2 text-sm" data-cmp-section="slips">
        <div className="font-medium">{tx(`قسائم ${year} المعتمدة`, `Submitted ${year} salary slips`)}</div>
        {denied(st.salary_slips) ? <p className="text-muted-foreground">{tx("لا تملك صلاحية قراءة قسائم الراتب.", "You may not read salary slips.")}</p>
          : st.salary_slips.state === "ok" ? <>
            <p><span data-no-i18n>{st.salary_slips.count}</span> {tx("قسيمة", "slip(s)")} · {tx("الإجمالي", "Gross")} {money(st.salary_slips.gross, st.salary_slips.currency)} · {tx("الاستقطاعات", "Deductions")} {money(st.salary_slips.deductions, st.salary_slips.currency)} · <b>{tx("الصافي", "Net")} {money(st.salary_slips.net, st.salary_slips.currency)}</b></p>
            {st.salary_slips.components.length > 0 && <table className="w-full text-sm"><tbody>{st.salary_slips.components.map((c) => <tr key={c.type + c.component} className="border-t"><td className="py-1">{c.type === "earnings" ? tx("استحقاق", "Earning") : tx("استقطاع", "Deduction")}</td><td data-no-i18n>{c.component}</td><td className="text-end">{money(c.amount, (st!.salary_slips as { currency: string }).currency)}</td></tr>)}</tbody></table>}
          </> : <p className="text-muted-foreground">{tx("لا توجد قسائم معتمدة في هذه السنة.", "No submitted salary slips this year.")}</p>}
      </div>
    </div>}
  </section>;
}

// ------------------------------------------------------------------ SHL-08 release notes
export function HrReleaseNotes() {
  const { tx, lang } = useTx(); const ar = lang === "ar";
  const notes = releaseNotes();
  if (!notes.length) return null;
  return <section className="panel mb-4 p-4" data-help-release-notes="digit_hr" aria-label={tx("ما الجديد في ديجيت للموارد البشرية", "What's new in DIGIT HR")}>
    <h2 className="text-base font-semibold">{tx("ما الجديد في ديجيت للموارد البشرية", "What's new in DIGIT HR")}</h2>
    {notes.map((r) => <div key={r.version} className="mt-3" data-release={r.version}>
      <div className="flex flex-wrap items-center gap-2 text-sm"><b data-no-i18n dir="ltr">{r.version}</b><span className="text-muted-foreground" data-no-i18n dir="ltr">{r.date}</span>
        <span className="rounded border border-border px-1.5 py-0.5 text-xs">{r.status === "candidate" ? tx("مرشح — لم يُنشر على موقع بعد", "Candidate — not yet released on a site") : r.status}</span></div>
      <div className="mt-1 text-sm font-medium" data-no-i18n>{ar ? r.title.ar : r.title.en}</div>
      <ul className="mt-1 list-disc space-y-1 ps-5 text-sm">{r.highlights.map((h, i) => <li key={i} data-no-i18n>{ar ? h.ar : h.en}{h.features?.length ? <span className="ms-1 text-xs text-muted-foreground" dir="ltr">({h.features.join(", ")})</span> : null}</li>)}</ul>
      {r.not_included?.length ? <><div className="mt-2 text-sm font-medium">{tx("غير مشمول", "Not included")}</div>
        <ul className="mt-1 list-disc space-y-1 ps-5 text-sm text-muted-foreground">{r.not_included.map((h, i) => <li key={i} data-no-i18n>{ar ? h.ar : h.en}</li>)}</ul></> : null}
    </div>)}
  </section>;
}
