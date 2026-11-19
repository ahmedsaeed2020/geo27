/**
 * 04.1 / 04.2 payroll blocks (owner round H3; money moves only through Payroll Entry, Payment Entry and Journal Entry):
 * the 12-month run strip (green = posted), the pay-run summary (five cards, every slip row with an avatar and an edited
 * value above the struck-through original), and the review drawer (employer cost, net, liabilities, files, «اعتماد» /
 * «الإبلاغ عن مشكلة», the cycle timeline). «اعتماد» runs payrollActions.submitPayroll — the native posting step.
 */
import { useMemo, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { adapter, useStoreVersion, type Doc } from "@/lib/adapter";
import { useSessionUser } from "@/lib/session";
import { fmtMonth } from "@/i18n/dates";
import { fmtNumber, riyal } from "@/lib/format";
import { EntDrawer } from "@/components/enterprise/Surfaces";
import { openQuickView } from "@/components/enterprise/QuickView";
import { PeriodStrips } from "@/components/enterprise/kit/CostKit";
import { KpiCard, KpiSlots } from "@/components/enterprise/kit/KpiCard";
import { Avatar, EditedValue } from "@/components/enterprise/kit/PeopleKit";
import { arLabel } from "@/components/digithr/workspaces/shared";
import { canReadType, scopedList } from "@/plugins/digit_hr/compat/scope";
import { deptHue } from "@/plugins/digit_hr/product/people";
import { runReview, runStrip, runSummary, ymOf } from "@/plugins/digit_hr/product/payRun";
import { slipsOf, wpsFile } from "@/plugins/digit_hr/product/payroll";
import { cycleState, submitPayroll } from "@/plugins/digit_hr/product/payrollActions";
import { HR_DOC_SEARCH } from "@/plugins/digit_hr/product/urls";

type Bi = [string, string];
const pick = (ar: boolean, b: Bi) => (ar ? b[1] : b[0]);
const money = (v: number) => riyal(fmtNumber(v, 2));
const nameOf = (ar: boolean, v: string) => (ar ? arLabel(v) : v);
const s = (v: unknown) => (v === null || v === undefined ? "" : String(v));
const peDoc = (name: string) => (n: ReactNode) => <Link to="/app/$app/$doctype/$name" params={{ app: "hrms", doctype: "payroll_entry", name }} search={HR_DOC_SEARCH as never} className="contents">{n}</Link>;
const runsInScope = (company?: string) => { try { return scopedList("Payroll Entry").filter((p) => Number(p.docstatus) !== 2 && (!company || p["company"] === company)).sort((a, b) => s(b["start_date"]).localeCompare(s(a["start_date"])) || a.name.localeCompare(b.name)); } catch { return [] as Doc[]; } };

/* ------------------------------------------------------------------ H3-01 run strip ------------------------------------------------------------------ */
export function RunStripPanel({ ar, on, company }: { ar: boolean; on: string; company?: string | undefined }) {
  useStoreVersion();
  const r = runStrip(on, company);
  if (!r) return <p className="text-sm text-muted-foreground" data-source-state="DENIED">{pick(ar, ["You cannot read payroll runs.", "لا تملك صلاحية قراءة مسيرات الرواتب."])}</p>;
  const stateText = (st: string): Bi => (st === "posted" ? ["posted", "مرحّل"] : st === "submitted" ? ["submitted, not posted", "معتمد غير مرحّل"] : st === "draft" ? ["draft", "مسودة"] : ["no run", "لا يوجد مسير"]);
  return <div data-run-strip={r.rows.length}>
    <PeriodStrips current={on.slice(0, 7)} attrs={{ "data-hr-run-strip": "12" }}
      months={r.months.map((m) => ({ key: m, label: fmtMonth(m, ar).split(" ")[0]!, full: fmtMonth(m, ar) }))}
      rows={r.rows.map((row) => ({ key: row.company, label: <span data-no-i18n>{nameOf(ar, row.company)}</span>, cells: row.cells.map((c) => ({ key: c.ym, state: c.state === "posted" ? "approved" as const : c.state === "none" ? "none" as const : "draft" as const,
        title: `${fmtMonth(c.ym, ar)} — ${pick(ar, stateText(c.state))}${c.run ? ` · ${c.run}` : ""}${c.net ? ` · ${pick(ar, ["net", "الصافي"])} ${fmtNumber(c.net, 0)}` : ""}`, ...(c.run ? { link: peDoc(c.run) } : {}) })) }))}
      legend={{ approved: pick(ar, ["Posted (with its journal)", "مرحّل (بقيده المحاسبي)"]), draft: pick(ar, ["Draft or not posted", "مسودة أو غير مرحّل"]), none: pick(ar, ["No run", "لا يوجد مسير"]) }} />
  </div>;
}

/* ------------------------------------------------------------------ H3-02 pay-run summary ------------------------------------------------------------------ */
export function RunSummaryPanel({ ar, company }: { ar: boolean; on: string; company?: string | undefined }) {
  useStoreVersion();
  const runs = runsInScope(company).filter((p) => slipsOf(p.name).length > 0);
  const [pickRun, setRun] = useState(""); const [all, setAll] = useState(false); const [review, setReview] = useState(false);
  const pe = runs.find((p) => p.name === pickRun) ?? runs[0];
  const sum = useMemo(() => (pe ? runSummary(pe) : null), [pe, adapter.version()]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!canReadType("Salary Slip")) return <p className="text-sm text-muted-foreground" data-source-state="DENIED">{pick(ar, ["You cannot read salary slips.", "لا تملك صلاحية قراءة قسائم الرواتب."])}</p>;
  if (!pe || !sum) return <p className="text-sm text-muted-foreground">{pick(ar, ["No payroll run with salary slips yet.", "لا يوجد مسير رواتب بقسائم بعد."])}</p>;
  const rows = all ? sum.slips : sum.slips.slice(0, 12);
  const edited = sum.slips.filter((l) => l.edited.length).length;
  const cards: { id: string; l: Bi; v: number; icon: "money" | "bank" | "chart" }[] = [
    { id: "structure", l: ["Structure earnings", "المستحقات"], v: sum.structure, icon: "money" }, { id: "other", l: ["Other earnings", "أخرى"], v: sum.other, icon: "chart" },
    { id: "gross", l: ["Gross", "الإجمالي"], v: sum.gross, icon: "money" }, { id: "paid", l: ["Paid", "المدفوع"], v: sum.paid, icon: "bank" }, { id: "remaining", l: ["Remaining", "المتبقي"], v: sum.remaining, icon: "bank" }];
  return <div className="grid gap-3" data-run-summary={pe.name} data-run-net={sum.net}>
    <div className="flex flex-wrap items-center gap-2 text-sm"><span className="font-semibold">{pick(ar, ["Payroll run", "المسير"])}</span>
      <select className="dhr-input h-9 min-w-[16rem]" value={pe.name} onChange={(e) => { setRun(e.target.value); setAll(false); }} data-run-pick>{runs.map((p) => <option key={p.name} value={p.name}>{fmtMonth(ymOf(p), ar)} — {nameOf(ar, s(p["company"]))} ({Number(p.docstatus) === 1 ? pick(ar, ["submitted", "معتمد"]) : pick(ar, ["draft", "مسودة"])})</option>)}</select>
      <button type="button" className="btn-primary h-9 px-3 text-sm" onClick={() => setReview(true)} data-run-review-open>{pick(ar, ["Review the run", "مراجعة المسير"])}</button></div>
    <div className="ek-kpi-grid" style={{ ["--ek-kpi-cols" as string]: 5 }} data-run-cards><KpiSlots lead={false}>{cards.map((c, i) => <KpiCard key={c.id} ar={ar} label={pick(ar, c.l)} value={money(c.v)} icon={c.icon} variant={i === 0 ? "featured" : "standard"} attrs={{ "data-run-card": c.id, "data-value": c.v }} />)}</KpiSlots></div>
    <p className="text-xs text-muted-foreground" data-run-equation><bdi data-no-i18n>{money(sum.structure)} + {money(sum.other)} = {money(sum.gross)}</bdi> · {pick(ar, ["gross − deductions", "الإجمالي − الاستقطاعات"])} <bdi data-no-i18n>{money(sum.deductions)}</bdi> = {pick(ar, ["net", "الصافي"])} <bdi data-no-i18n>{money(sum.net)}</bdi> · {pick(ar, ["net − paid = remaining", "الصافي − المدفوع = المتبقي"])}{edited ? pick(ar, [` · ${edited} slips with edited values`, ` · ${edited} قسيمة بقيم معدّلة`]) : ""}</p>
    <div className="overflow-x-auto"><table className="w-full min-w-[44rem] text-[13px]" data-run-rows={sum.slips.length}>
      <thead><tr className="text-xs text-muted-foreground"><th className="py-1 text-start">{pick(ar, ["Employee", "الموظف"])}</th><th className="text-end">{pick(ar, ["Structure", "المستحقات"])}</th><th className="text-end">{pick(ar, ["Other", "أخرى"])}</th><th className="text-end">{pick(ar, ["Gross", "الإجمالي"])}</th><th className="text-end">{pick(ar, ["Deductions", "الاستقطاعات"])}</th><th className="text-end">{pick(ar, ["Net", "الصافي"])}</th></tr></thead>
      <tbody>{rows.map((l) => <tr key={l.slip} className="h-11 border-t" data-run-row={l.slip} data-edited={l.edited.length || undefined}>
        <td><button type="button" className="inline-flex items-center gap-2 text-start hover:underline" onClick={(ev) => openQuickView({ kind: "doc", doctype: "Salary Slip", name: l.slip }, ev.currentTarget)}><Avatar name={nameOf(ar, l.name)} hue={deptHue(l.dept)} /><span><span className="block font-medium">{nameOf(ar, l.name)}</span><span className="block text-[11px] text-muted-foreground">{nameOf(ar, l.dept)}</span></span></button></td>
        <td className="text-end tabular-nums" data-no-i18n>{fmtNumber(l.structure, 2)}</td><td className="text-end tabular-nums" data-no-i18n>{l.other ? fmtNumber(l.other, 2) : "—"}</td>
        <td className="text-end tabular-nums"><EditedValue now={fmtNumber(l.gross, 2)} was={l.edited.length && Math.abs(l.defaultGross - l.gross) >= 0.01 ? fmtNumber(l.defaultGross, 2) : undefined} why={l.edited.map((x) => `${x.component}: ${fmtNumber(x.default, 2)} → ${fmtNumber(x.amount, 2)}${l.workingDays && l.paymentDays && l.paymentDays < l.workingDays ? ` (${l.paymentDays}/${l.workingDays})` : ""}`).join(" · ")} /></td>
        <td className="text-end tabular-nums" data-no-i18n>{fmtNumber(l.deductions, 2)}</td><td className="text-end font-semibold tabular-nums" data-no-i18n>{fmtNumber(l.net, 2)}</td></tr>)}</tbody>
      <tfoot><tr className="border-t-2 font-bold"><td className="py-2">{pick(ar, [`Total of ${sum.slips.length} slips`, `إجمالي ${sum.slips.length} قسيمة`])}</td><td className="text-end tabular-nums" data-no-i18n data-run-total="structure">{fmtNumber(sum.structure, 2)}</td><td className="text-end tabular-nums" data-no-i18n data-run-total="other">{fmtNumber(sum.other, 2)}</td><td className="text-end tabular-nums" data-no-i18n data-run-total="gross">{fmtNumber(sum.gross, 2)}</td><td className="text-end tabular-nums" data-no-i18n data-run-total="deductions">{fmtNumber(sum.deductions, 2)}</td><td className="text-end tabular-nums" data-no-i18n data-run-total="net">{fmtNumber(sum.net, 2)}</td></tr></tfoot>
    </table></div>
    {sum.slips.length > 12 && <button type="button" className="ek-oc-hidden justify-self-start" onClick={() => setAll((v) => !v)} data-run-all>{all ? pick(ar, ["Show fewer", "عرض أقل"]) : pick(ar, [`${sum.slips.length - 12} not shown — show all`, `${sum.slips.length - 12} غير معروض — عرض الكل`])}</button>}
    <RunReviewDrawer pe={pe} ar={ar} open={review} onOpenChange={setReview} />
  </div>;
}

/* ------------------------------------------------------------------ H3-03 review drawer ------------------------------------------------------------------ */
const download = (name: string, text: string) => { const href = URL.createObjectURL(new Blob(["\ufeff" + text], { type: "text/csv;charset=utf-8" })); const a = document.createElement("a"); a.href = href; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(href), 1000); };
const csv = (rows: Record<string, string | number>[]) => { if (!rows.length) return ""; const keys = Object.keys(rows[0]!); const q = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`; return [keys.map(q).join(","), ...rows.map((r) => keys.map((k) => q(r[k])).join(","))].join("\n"); };
export function RunReviewDrawer({ pe, ar, open, onOpenChange }: { pe: Doc; ar: boolean; open: boolean; onOpenChange: (o: boolean) => void }) {
  useStoreVersion(); const user = useSessionUser();
  const [issue, setIssue] = useState(""); const [asking, setAsking] = useState(false);
  if (!open) return null;
  const sum = runSummary(pe); const rv = runReview(pe, sum); const cyc = cycleState(pe.name);
  const slips = slipsOf(pe.name); const wps = wpsFile(pe, slips);
  const approve = () => { const r = submitPayroll(pe.name, user); if (r.ok) toast.success(pick(ar, r.message)); else toast.error(`${pick(ar, r.message)}${r.errors.length ? `\n${r.errors.join("\n")}` : ""}`); };
  const report = () => { const text = issue.trim(); if (!text) return; adapter.insertDoc("Comment", { comment_type: "Comment", reference_doctype: "Payroll Entry", reference_name: pe.name, content: `${pick(ar, ["Issue reported on the run", "مشكلة مُبلّغ عنها في المسير"])}: ${text}`, owner: user, comment_email: user }); setIssue(""); setAsking(false); toast.success(pick(ar, ["Issue recorded on the payroll run.", "سُجّلت المشكلة على المسير."])); };
  const fig = (k: string, l: Bi, v: number, tone?: string) => <div key={k} className="rounded-xl border p-3" data-review-fig={k} data-tone={tone}><div className="text-xs text-muted-foreground">{pick(ar, l)}</div><div className="mt-1 text-lg font-extrabold tabular-nums" data-no-i18n>{money(v)}</div></div>;
  const submitted = Number(pe.docstatus) === 1;
  return <EntDrawer open={open} onOpenChange={onOpenChange} size="lg" id="payroll-review" kicker={`${fmtMonth(ymOf(pe), ar)} · ${nameOf(ar, s(pe["company"]))}`} title={pick(ar, ["Payroll run review", "مراجعة مسير الرواتب"])}
    footer={<div className="flex w-full flex-wrap items-center gap-2">
      <button type="button" className="btn-primary h-9 px-4" onClick={approve} disabled={submitted} data-review-approve title={submitted ? pick(ar, ["Already submitted and posted.", "معتمد ومرحّل مسبقًا."]) : undefined}>{submitted ? pick(ar, ["Approved ✓", "معتمد ✓"]) : pick(ar, ["Approve", "اعتماد"])}</button>
      <button type="button" className="btn-secondary h-9 px-4" onClick={() => setAsking((v) => !v)} data-review-issue>{pick(ar, ["Report an issue", "الإبلاغ عن مشكلة"])}</button>
      <span className="text-xs text-muted-foreground">{pick(ar, ["Approve runs the native submit and posting of the run (journal entry).", "«اعتماد» ينفذ اعتماد المسير وترحيله الأصلي (قيد يومية)."])}</span>
    </div>}>
    <div className="grid gap-4 text-sm" data-run-review={pe.name}>
      <div className="grid gap-2 sm:grid-cols-3">{fig("cost", ["Employer cost", "تكلفة صاحب العمل"], rv.employerCost)}{fig("net", ["Net salaries", "صافي الرواتب"], rv.net)}{fig("gosi", ["Employer GOSI share", "حصة صاحب العمل في التأمينات"], rv.employerGosi)}</div>
      <p className="text-xs text-muted-foreground"><bdi data-no-i18n>{money(sum.gross)} + {money(rv.employerGosi)} = {money(rv.employerCost)}</bdi> · {pick(ar, ["gross + employer GOSI = employer cost", "الإجمالي + حصة صاحب العمل = تكلفة صاحب العمل"])}{rv.missingNationality ? pick(ar, [` · ${rv.missingNationality} without a known nationality (no GOSI share)`, ` · ${rv.missingNationality} بلا جنسية معروفة (بلا حصة تأمينات)`]) : ""}</p>
      <section><h4 className="mb-1 font-semibold">{pick(ar, ["Liabilities", "الالتزامات"])}</h4><ul className="divide-y rounded-xl border">{rv.liabilities.map((l) => <li key={l.key} className="flex items-center justify-between px-3 py-2" data-review-liability={l.key}><span>{ar ? l.ar : l.en}</span><bdi className="font-bold tabular-nums" data-no-i18n>{money(l.value)}</bdi></li>)}</ul></section>
      <section><h4 className="mb-1 font-semibold">{pick(ar, ["Files", "الملفات"])}</h4><ul className="grid gap-2 sm:grid-cols-3">
        <li className="rounded-xl border p-3" data-review-file="wps"><div className="font-semibold">{pick(ar, ["WPS salary file", "ملف حماية الأجور"])}</div><div className="text-xs text-muted-foreground">{pick(ar, [`${wps.rows.length} rows · ${wps.errors.length} errors`, `${wps.rows.length} صف · ${wps.errors.length} خطأ`])}</div><button type="button" className="mt-2 text-xs text-primary hover:underline" onClick={() => download(`WPS-${pe.name}.csv`, csv(wps.rows))} disabled={!wps.rows.length}>{pick(ar, ["Download", "تنزيل"])}</button></li>
        <li className="rounded-xl border p-3" data-review-file="bank"><div className="font-semibold">{pick(ar, ["Bank transfer list", "كشف التحويل البنكي"])}</div><div className="text-xs text-muted-foreground"><bdi data-no-i18n>{money(wps.total)}</bdi></div><button type="button" className="mt-2 text-xs text-primary hover:underline" onClick={() => download(`BANK-${pe.name}.csv`, csv(wps.rows.map((r) => ({ employee: r["employee"] ?? r["Employee"] ?? "", iban: r["iban"] ?? r["IBAN"] ?? "", amount: r["net"] ?? r["Net Salary"] ?? r["amount"] ?? "" }))))} disabled={!wps.rows.length}>{pick(ar, ["Download", "تنزيل"])}</button></li>
        <li className="rounded-xl border p-3" data-review-file="register"><div className="font-semibold">{pick(ar, ["Payroll register", "سجل الرواتب"])}</div><div className="text-xs text-muted-foreground">{pick(ar, [`${sum.slips.length} slips`, `${sum.slips.length} قسيمة`])}</div><button type="button" className="mt-2 text-xs text-primary hover:underline" onClick={() => download(`REGISTER-${pe.name}.csv`, csv(sum.slips.map((l) => ({ slip: l.slip, employee: l.employee, name: l.name, department: l.dept, gross: l.gross, deductions: l.deductions, net: l.net }))))}>{pick(ar, ["Download", "تنزيل"])}</button></li>
      </ul>{wps.errors.length > 0 && <p className="mt-1 text-xs text-[var(--error)]" data-review-wps-errors={wps.errors.length}>{wps.errors.slice(0, 3).join(" · ")}</p>}</section>
      <section><h4 className="mb-1 font-semibold">{pick(ar, ["Cycle", "دورة المسير"])}</h4><ol className="grid gap-1" data-review-cycle={cyc.stage}>{cyc.steps.map((st, i) => <li key={st.key} className="flex items-center gap-2" data-cycle-step={st.key} data-done={st.done || undefined}>
        <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] font-bold ${st.done ? "bg-[var(--success)] text-[var(--white)]" : i === cyc.stage ? "bg-[var(--amber)] text-[var(--white)]" : "bg-[var(--surface)] text-muted-foreground"}`}>{st.done ? "✓" : i + 1}</span>
        <span className={i === cyc.stage ? "font-semibold" : ""}>{ar ? st.ar : st.en}</span>{st.ref && <button type="button" className="r1-mono-link" onClick={(ev) => openQuickView({ kind: "doc", doctype: st.key === "post" || st.key === "pay" ? "Journal Entry" : st.key === "wps" ? "DIGIT WPS Submission" : st.key === "lock" ? "DIGIT Payroll Period Lock" : "DIGIT Payroll Preflight", name: st.ref! }, ev.currentTarget)} data-no-i18n>{st.ref}</button>}
        {i === cyc.stage && <span className="ms-auto text-xs text-[var(--amber)]">{pick(ar, ["next", "التالي"])}</span>}</li>)}</ol></section>
      {asking && <section className="grid gap-2" data-review-issue-form><label className="text-sm font-semibold" htmlFor="pr-issue">{pick(ar, ["What is wrong with this run?", "ما المشكلة في هذا المسير؟"])}</label><textarea id="pr-issue" className="dhr-input min-h-20 p-2" value={issue} onChange={(e) => setIssue(e.target.value)} /><button type="button" className="btn-secondary h-9 justify-self-start px-4" onClick={report} disabled={!issue.trim()} data-review-issue-send>{pick(ar, ["Record the issue", "تسجيل المشكلة"])}</button></section>}
    </div>
  </EntDrawer>;
}

/* ------------------------------------------------------------------ 04.2 runs to review ------------------------------------------------------------------ */
export function RunReviewList({ ar, company }: { ar: boolean; on: string; company?: string | undefined }) {
  useStoreVersion();
  const runs = runsInScope(company).filter((p) => slipsOf(p.name).length > 0).slice(0, 8);
  const [open, setOpen] = useState<string>("");
  const pe = runs.find((p) => p.name === open);
  if (!runs.length) return <p className="text-sm text-muted-foreground">{pick(ar, ["No payroll run with salary slips yet.", "لا يوجد مسير رواتب بقسائم بعد."])}</p>;
  return <div data-run-review-list={runs.length}>
    <ul className="divide-y rounded-xl border">{runs.map((p) => { const sm = runSummary(p); const st = cycleState(p.name); return <li key={p.name} className="flex flex-wrap items-center gap-3 px-3 py-2" data-run-item={p.name}>
      <span className="min-w-[10rem] font-semibold">{fmtMonth(ymOf(p), ar)}</span><span className="text-muted-foreground" data-no-i18n>{nameOf(ar, s(p["company"]))}</span>
      <span className="r1-chip" data-tone={sm.paid ? "ok" : Number(p.docstatus) === 1 ? "info" : "warn"}>{sm.paid ? pick(ar, ["Paid", "مدفوع"]) : Number(p.docstatus) === 1 ? pick(ar, ["Posted, not paid", "مرحّل غير مدفوع"]) : pick(ar, ["Draft", "مسودة"])}</span>
      <span className="text-xs text-muted-foreground">{pick(ar, [`step ${Math.min(st.stage + 1, st.steps.length)} of ${st.steps.length}`, `الخطوة ${Math.min(st.stage + 1, st.steps.length)} من ${st.steps.length}`])}</span>
      <bdi className="ms-auto font-bold tabular-nums" data-no-i18n>{money(sm.net)}</bdi>
      <button type="button" className="btn-secondary h-8 px-3 text-xs" onClick={() => setOpen(p.name)} data-run-review={p.name}>{pick(ar, ["Review", "مراجعة"])}</button></li>; })}</ul>
    {pe && <RunReviewDrawer pe={pe} ar={ar} open={!!pe} onOpenChange={(o) => { if (!o) setOpen(""); }} />}
  </div>;
}
