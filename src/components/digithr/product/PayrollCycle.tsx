/**
 * Payroll cycle (HR 04.1 Documents & work, owner brief 2026-11-15 §3): pick or start a monthly run, then preflight →
 * salary slips → variance review → submit and post → WPS file → GOSI → salary transfer → provisions → period lock. Each
 * button runs one step of product/payrollActions.ts (permission-checked, period-lock aware, native posting only) and
 * the stage strip reads where the run stands from its own records.
 */
import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { adapter, useStoreVersion, type Doc } from "@/lib/adapter";
import { fmtCurrency } from "@/lib/format";
import { DxPanel } from "@/components/digit/Experience";
import { assertScoped, scopedList } from "@/plugins/digit_hr/compat/scope";
import { useSessionUser } from "@/plugins/digit_hr/compat/session";
import { HR_DOC_SEARCH, hrSearch } from "@/plugins/digit_hr/product/urls";
import { monthEndOf, payrollAccount, preflight, slipsOf } from "@/plugins/digit_hr/product/payroll";
import { cycleState, lockPeriod, makeGosi, makeSlips, makeWps, openVariances, payBank, postAccruals, recordVariances, runPreflight, submitPayroll, type StepResult } from "@/plugins/digit_hr/product/payrollActions";

const s = (v: unknown) => (typeof v === "string" ? v : v == null ? "" : String(v));
const n = (v: unknown) => Number(v) || 0;
const d10 = (v: unknown) => s(v).slice(0, 10);
const list = (dt: string): Doc[] => { try { return scopedList(dt); } catch { return []; } };

export function PayrollCycle({ ar, company }: { ar: boolean; company?: string | undefined }) {
  useStoreVersion(); const user = useSessionUser();
  const t = (en: string, a: string) => (ar ? a : en);
  const runs = useMemo(() => list("Payroll Entry").filter((p) => Number(p.docstatus) !== 2 && (!company || p["company"] === company)).sort((a, b) => d10(b["start_date"]).localeCompare(d10(a["start_date"])) || (Number(a.docstatus) - Number(b.docstatus))).slice(0, 24), [company, user, adapter.version()]); // eslint-disable-line react-hooks/exhaustive-deps
  const [sel, setSel] = useState<string>("");
  const pe = runs.find((r) => r.name === sel) ?? runs.find((r) => Number(r.docstatus) === 0) ?? runs[0];
  const companies = list("Company").map((c) => c.name);
  const [co, setCo] = useState(company ?? companies[0] ?? "");
  const [ym, setYm] = useState(new Date().toISOString().slice(0, 7));
  const done = (r: StepResult) => { if (r.ok) toast.success(t(...r.message)); else toast.error([t(...r.message), ...r.errors.slice(0, 6)].join("\n")); };
  const start = () => {
    try { assertScoped("Payroll Entry", "create", undefined, user); } catch { toast.error(t("You may not create payroll runs.", "لا يحق لك إنشاء مسيرات رواتب.")); return; }
    if (!co || !/^\d{4}-\d{2}$/.test(ym)) return;
    if (list("Payroll Entry").some((p) => p["company"] === co && d10(p["start_date"]).slice(0, 7) === ym && Number(p.docstatus) !== 2 && !p["branch"])) { toast.error(t("A run for this company and month already exists.", "يوجد مسير لهذه الشركة وهذا الشهر.")); return; }
    const cc = list("Cost Center").find((c) => c["company"] === co && /^Main - /.test(c.name))?.name;
    const d = adapter.insertDoc("Payroll Entry", { company: co, title: `${t("Payroll", "رواتب")} ${ym}`, posting_date: monthEndOf(ym), start_date: `${ym}-01`, end_date: monthEndOf(ym), payroll_frequency: "Monthly", currency: "SAR", exchange_rate: 1, payroll_payable_account: payrollAccount(co, "payable"), cost_center: cc });
    setSel(d.name); toast.success(t("Payroll run started as a draft.", "بدأ مسير الرواتب كمسودة."));
  };
  const st = pe ? cycleState(pe.name) : undefined;
  const checks = pe && Number(pe.docstatus) === 0 ? preflight(pe) : [];
  const slips = pe ? slipsOf(pe.name) : [];
  const ov = pe ? openVariances(pe.name) : [];
  const ymOf = pe ? d10(pe["start_date"]).slice(0, 7) : "";
  const wps = () => { if (!pe) return; const r = makeWps(pe.name, user); done(r); if (r.ok && r.text && typeof document !== "undefined") { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob(["\uFEFF" + r.text], { type: "text/csv;charset=utf-8" })); a.download = `WPS-${s(pe["company"]).replace(/[^\w]+/g, "_")}-${ymOf}.csv`; a.click(); URL.revokeObjectURL(a.href); } };
  // visual round R3 §5: the posting toast states the slips and the net pay it posted, with the two next steps
  const posted = (r: StepResult) => {
    if (!pe || !r.ok) { done(r); return; }
    const sl = slipsOf(pe.name).filter((d) => Number(d.docstatus) === 1); const net = Math.round(sl.reduce((a, d) => a + (Number(d["net_pay"]) || 0), 0) * 100) / 100;
    const names = JSON.stringify(sl.map((d) => d.name));
    toast.success(t(`Payroll posted — ${sl.length} slips · ${fmtCurrency(net, "SAR")}`, `رُحّل المسير — ${sl.length} قسيمة · ${fmtCurrency(net, "SAR")}`), {
      ...(sl.length ? { action: { label: t("Print slips", "اطبع القسائم"), onClick: () => { if (typeof window !== "undefined") window.open(`/printview?doctype=${encodeURIComponent("Salary Slip")}&name=${encodeURIComponent(sl[0]!.name)}&names=${encodeURIComponent(names)}`, "_blank", "noopener"); } } } : {}),
      cancel: { label: t("Bank file", "ملف البنك"), onClick: () => wps() },
      duration: 12000,
    });
  };
  const step: Record<string, () => void> = pe ? {
    preflight: () => done(runPreflight(pe.name, user)), slips: () => done(makeSlips(pe.name, user)), variance: () => done(recordVariances(pe.name, user)), post: () => posted(submitPayroll(pe.name, user)),
    wps, gosi: () => done(makeGosi(pe.name, user)), pay: () => done(payBank(pe.name, user)), lock: () => done(lockPeriod(s(pe["company"]), ymOf, user)),
  } : {};
  return (
    <div className="space-y-4" data-hr-payroll-cycle>
      <DxPanel title={t("Payroll cycle", "دورة الرواتب")} subtitle={t("One run at a time: every step reads and writes its own records; posting goes through the ledger engine.", "مسير واحد في كل مرة: كل خطوة تقرأ وتكتب سجلاتها؛ والترحيل عبر محرك الدفاتر.")}
        actions={<div className="flex flex-wrap items-center gap-2 text-sm">
          <select aria-label={t("Company", "الشركة")} className="h-9 rounded-md border border-border bg-card px-2" value={co} onChange={(e) => setCo(e.target.value)} data-no-i18n>{companies.map((c) => <option key={c} value={c}>{c}</option>)}</select>
          <input aria-label={t("Month", "الشهر")} type="month" className="h-9 rounded-md border border-border bg-card px-2" value={ym} onChange={(e) => setYm(e.target.value)} />
          <button type="button" className="btn-primary h-9 px-3 text-sm" onClick={start} data-payroll-start>{t("Start monthly run", "بدء مسير شهري")}</button>
        </div>}>
        {runs.length ? <div className="flex flex-wrap items-center gap-2 text-sm">
          <label className="flex items-center gap-2">{t("Run", "المسير")}
            <select className="h-9 min-w-[16rem] rounded-md border border-border bg-card px-2" value={pe?.name ?? ""} onChange={(e) => setSel(e.target.value)} data-payroll-run-select>
              {runs.map((r) => <option key={r.name} value={r.name} data-no-i18n>{d10(r["start_date"]).slice(0, 7)} · {s(r["title"]) || r.name} · {Number(r.docstatus) === 1 ? t("Submitted", "معتمد") : t("Draft", "مسودة")}</option>)}
            </select></label>
          {pe && <Link to="/app/$app/$doctype/$name" params={{ app: "hrms", doctype: "payroll_entry", name: pe.name }} search={HR_DOC_SEARCH as never} className="text-primary hover:underline">{t("Open the payroll entry", "فتح مسير الرواتب")}</Link>}
        </div> : <p className="text-sm text-muted-foreground">{t("No payroll run yet — start one for a company and month.", "لا يوجد مسير بعد — ابدأ مسيرًا لشركة وشهر.")}</p>}
      </DxPanel>
      {pe && st && <>
        <ol className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-8" aria-label={t("Payroll steps", "خطوات الرواتب")} data-payroll-steps>
          {st.steps.map((x, i) => { const cur = i === st.stage; return (
            <li key={x.key} className={`ek-card flex flex-col gap-2 p-3 ${cur ? "ring-2 ring-primary" : ""}`} data-step={x.key} data-step-state={x.done ? "done" : cur ? "current" : "todo"}>
              <span className="flex items-center gap-2 text-xs text-muted-foreground"><span aria-hidden className={`inline-flex size-5 items-center justify-center rounded-full text-[11px] font-semibold ${x.done ? "bg-success text-success-foreground" : cur ? "bg-primary text-primary-foreground" : "bg-muted"}`}>{x.done ? "✓" : i + 1}</span>{t(x.en, x.ar)}</span>
              {x.ref && <span className="truncate text-xs" data-no-i18n>{x.ref}</span>}
              <button type="button" className={`${cur ? "btn-primary" : "btn-secondary"} mt-auto h-8 px-2 text-xs`} onClick={step[x.key]} disabled={x.key !== "lock" && x.done && x.key !== "preflight"} data-step-run={x.key}>{x.key === "preflight" && x.done ? t("Run again", "إعادة الفحص") : t("Run", "تنفيذ")}</button>
            </li>); })}
        </ol>
        <div className="grid gap-4 lg:grid-cols-3">
          <DxPanel title={t("Run summary", "ملخص المسير")} attrs={{ "data-payroll-summary": pe.name }}>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <dt className="text-muted-foreground">{t("Company", "الشركة")}</dt><dd data-no-i18n>{s(pe["company"])}</dd>
              <dt className="text-muted-foreground">{t("Period", "الفترة")}</dt><dd data-no-i18n>{d10(pe["start_date"])} → {d10(pe["end_date"])}</dd>
              <dt className="text-muted-foreground">{t("Slips", "القسائم")}</dt><dd data-no-i18n>{slips.length}</dd>
              <dt className="text-muted-foreground">{t("Gross pay", "إجمالي الرواتب")}</dt><dd data-no-i18n>{fmtCurrency(slips.reduce((a, d) => a + n(d["gross_pay"]), 0))}</dd>
              <dt className="text-muted-foreground">{t("Net pay", "صافي الرواتب")}</dt><dd data-no-i18n>{fmtCurrency(slips.reduce((a, d) => a + n(d["net_pay"]), 0))}</dd>
              <dt className="text-muted-foreground">{t("Open variances", "فروقات مفتوحة")}</dt><dd>{ov.length ? <Link to="/app/$app/$doctype" params={{ app: "hrms", doctype: "digit_payroll_variance" }} search={hrSearch({ filters: JSON.stringify([["payroll_entry", "=", pe.name], ["variance_status", "!=", "Explained"]]) }) as never} className="text-primary hover:underline" data-no-i18n>{ov.length}</Link> : <span data-no-i18n>0</span>}</dd>
            </dl>
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" className="btn-secondary h-8 px-3 text-xs" onClick={() => done(postAccruals(s(pe["company"]), ymOf, user))} data-payroll-accruals>{t("Post month-end provisions", "ترحيل مخصصات نهاية الشهر")}</button>
              {slips.length > 0 && <Link to="/app/$app/$doctype" params={{ app: "hrms", doctype: "salary_slip" }} search={hrSearch({ filters: JSON.stringify([["payroll_entry", "=", pe.name]]) }) as never} className="btn-secondary inline-flex h-8 items-center px-3 text-xs">{t("Open the slips", "فتح القسائم")}</Link>}
            </div>
          </DxPanel>
          <DxPanel title={t("Preflight checks", "الفحص المسبق")} subtitle={Number(pe.docstatus) === 0 ? t("Blockers stop the run; warnings are reviewed", "المعوقات توقف التشغيل والتنبيهات تُراجع") : t("The run is submitted", "المسير معتمد")} className="lg:col-span-2" flush attrs={{ "data-payroll-preflight": pe.name }}>
            {checks.length ? <ul className="divide-y divide-border text-sm">{checks.map((c) => (
              <li key={c.key} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2" data-check={c.key} data-check-state={c.names.length ? (c.blocking ? "block" : "warn") : "ok"}>
                <span aria-hidden className={`inline-block size-2 rounded-full ${c.names.length ? (c.blocking ? "bg-destructive" : "bg-warning") : "bg-success"}`} />
                <span className="min-w-0 flex-1"><span className="font-medium">{t(...c.title)}</span><span className="block text-xs text-muted-foreground">{t(...c.hint)}</span></span>
                {c.names.length ? <Link to="/app/$app/$doctype" params={{ app: c.doctype.startsWith("DIGIT ") ? "hrms" : c.doctype === "Employee" ? "erpnext" : "hrms", doctype: c.doctype.toLowerCase().replace(/[^a-z0-9]+/g, "_") }} search={hrSearch({ filters: JSON.stringify([["name", "in", c.names.join(",")]]) }) as never} className="chip bg-muted text-primary hover:underline" data-no-i18n>{c.names.length}</Link> : <span className="chip bg-success/15 text-success-text">{t("OK", "سليم")}</span>}
              </li>))}</ul> : <p className="px-3 py-4 text-sm text-muted-foreground">{t("Checks run on draft runs only.", "تُجرى الفحوص على المسيرات المسودة فقط.")}</p>}
          </DxPanel>
        </div>
      </>}
    </div>
  );
}
