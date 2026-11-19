/**
 * Guided setup and data completeness (shared Enterprise screen, engine src/lib/coreShared/setupGuide.ts). The go-live
 * checklist of the selected company — each step done from the records that exist, with the screen that completes it — and
 * the master-data completeness checks, each opening exactly the incomplete records in the same-screen side panel.
 */
import { Link } from "@tanstack/react-router";
import { useStoreVersion } from "@/lib/adapter";
import { useScopeMetas } from "@/lib/scope";
import { completenessChecks, completenessPct, setupSteps, type SetupStep } from "@/lib/coreShared/setupGuide";
import { Meter } from "@/components/enterprise/kit";
import { EntFrame } from "./Surfaces";
import { Bar, CompanySelect, Kpi, ListLink, Table, tr, useCompany, useT } from "./FinanceDesk";
import { openQuickView } from "./QuickView";
const slugFor = (dt: string) => dt.toLowerCase().replace(/[^a-z0-9]+/g, "_");

const DTS = ["Company", "Fiscal Year", "Account", "Sales Taxes and Charges Template", "Purchase Taxes and Charges Template", "Bank Account", "Warehouse", "Item", "Item Price", "Customer", "Supplier", "User", "Digit Print Branding"];

function StepAction({ st, primary }: { st: SetupStep; primary?: boolean }) {
  const { t, ar } = useT(); const label = primary ? `${t("Complete next step", "أكمل الخطوة التالية")}: ${ar ? st.label[1] : st.label[0]}` : st.done ? t("Review", "مراجعة") : t("Complete", "إكمال");
  const cls = primary ? "btn-primary" : st.done ? "btn-ghost text-xs" : "btn-secondary text-xs";
  const o = st.open;
  if (o.kind === "list") return <ListLink drill={o.drill} className={cls} data-setup-open={st.id}>{label}</ListLink>;
  if (o.kind === "new") return <Link to="/app/$app/$doctype/$name" params={{ app: "erpnext", doctype: slugFor(o.doctype), name: "new" }} className={cls} data-setup-open={st.id}>{label}</Link>;
  if (o.kind === "doc") return <Link to="/app/$app/$doctype/$name" params={{ app: "erpnext", doctype: slugFor(o.doctype), name: o.name }} className={cls} data-setup-open={st.id}>{label}</Link>;
  return <a href={`${o.to}${o.search ? `?${new URLSearchParams(o.search).toString()}` : ""}`} className={cls} data-setup-open={st.id}>{label}</a>;
}

export function SetupGuidePage() {
  useStoreVersion(); useScopeMetas(DTS);
  const { ar, t } = useT(); const c = useCompany();
  const steps = setupSteps(c.company, c.user).filter((s) => s.readable);
  const checks = completenessChecks(c.user).filter((x) => x.readable);
  const done = steps.filter((s) => s.done).length;
  const issues = checks.reduce((a, x) => a + x.missing, 0); const records = checks.reduce((a, x) => a + x.total, 0);
  const pct = records ? Math.round(((records - issues) / records) * 100) : 100;
  const next = steps.find((s) => !s.done);
  return <div className="space-y-3" data-setup-guide={c.company} data-setup-done={done} data-setup-steps={steps.length}>
    <Bar><CompanySelect c={c} />{next && <span data-setup-next={next.id} data-band-primary><StepAction st={next} primary /></span>}</Bar>
    <div className="flex flex-wrap gap-2">
      <Kpi id="setup-progress" label={t("Setup steps done", "خطوات الإعداد المكتملة")} value={`${done} / ${steps.length}`} tone={done === steps.length ? "ok" : "warn"} sub={t("Each step is done from the records that exist.", "تكتمل كل خطوة من السجلات الموجودة.")} />
      <Kpi id="setup-complete" label={t("Master data complete", "اكتمال البيانات الأساسية")} value={`${pct}%`} tone={pct >= 90 ? "ok" : pct >= 60 ? "warn" : "bad"} sub={t("Records with everything a tax invoice or payment needs.", "سجلات فيها كل ما تحتاجه الفاتورة الضريبية أو الدفع.")} />
      <Kpi id="setup-issues" label={t("Records to complete", "سجلات تحتاج إكمالًا")} value={String(issues)} {...(issues ? { tone: "bad" } : { tone: "ok" })} />
    </div>
    <div className="grid gap-3 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
      <EntFrame id="setup-steps" title={t("Go-live steps", "خطوات التشغيل")} note={t("In the order an implementer completes them; each opens the screen that finishes it.", "بالترتيب الذي يكملها به المنفّذ؛ كل خطوة تفتح الشاشة التي تكملها.")}>
        <ol className="grid gap-2" data-setup-list>
          {steps.map((st, i) => <li key={st.id} className="ek-card flex items-start gap-3 p-3" data-setup-step={st.id} data-done={st.done ? "1" : "0"}>
            <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-bold ${st.done ? "bg-primary text-primary-foreground" : "border border-border text-muted-foreground"}`} aria-hidden>{st.done ? "✓" : i + 1}</span>
            <div className="min-w-0 flex-1"><b className="block text-sm">{ar ? st.label[1] : st.label[0]}</b>
              <span className="block text-xs text-muted-foreground">{ar ? st.why[1] : st.why[0]}</span>
              <span className={`mt-1 block text-xs ${st.done ? "text-muted-foreground" : "font-medium"}`} data-setup-detail>{ar ? st.detail[1] : st.detail[0]}</span></div>
            <StepAction st={st} />
          </li>)}
        </ol>
      </EntFrame>
      <EntFrame id="setup-completeness" title={t("Data completeness", "اكتمال البيانات")} note={t("Master data a Saudi tax invoice, payment or stock move needs. Each count opens exactly the records to complete.", "البيانات الأساسية التي تحتاجها الفاتورة الضريبية أو الدفع أو حركة المخزون. كل عدد يفتح السجلات التي تحتاج إكمالًا بالضبط.")}>
        <Table id="setup-checks" head={[t("Check", "الفحص"), t("Complete", "مكتمل"), t("To complete", "يحتاج إكمالًا")]}>
          {checks.map((x) => { const p = completenessPct(x); return <tr key={x.id} className={tr} data-setup-check={x.id} data-missing={x.missing}>
            <td className="p-2"><b className="block text-sm">{ar ? x.label[1] : x.label[0]}</b><span className="block text-xs text-muted-foreground">{ar ? x.why[1] : x.why[0]}</span></td>
            <td className="w-40 p-2"><Meter value={p} tone={p >= 90 ? "good" : p >= 60 ? "attention" : "risk"} showPct size="sm" /><span className="text-[11px] text-muted-foreground tabular-nums" data-no-i18n>{t(`${x.total - x.missing} of ${x.total}`, `${x.total - x.missing} من ${x.total}`)}</span></td>
            <td className="p-2">{x.missing ? <button type="button" className="text-primary hover:underline tabular-nums" data-setup-drill={x.id}
              onClick={(e) => openQuickView({ kind: "list", doctype: x.doctype, filters: x.drill.filters as never, title: ar ? x.label[1] : x.label[0] }, e.currentTarget)}>{x.missing}</button> : <span className="text-xs text-muted-foreground">{t("All complete", "مكتمل")}</span>}</td>
          </tr>; })}
        </Table>
      </EntFrame>
    </div>
  </div>;
}
