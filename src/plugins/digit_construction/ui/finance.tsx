/** Financial position (FIN-01..03): per-project receivables, payables, retention, advance and cash, plus receivable aging — all from posted native invoices and payments. */
import { useState } from "react";
import type { PluginPageProps } from "@/plugins/pages";
import { agingBucket, num, sumBy } from "../domain/calc";
import { financialPosition, isSubmitted, list, projectTitle, today } from "../domain/data";
import { constructionProjects } from "../domain/queues";
import { AppLink, Bars, compact, DataTable, Field, Filters, inputCls, Kpi, KpiGrid, PageHeader, PolicyGate, ProjectRef, Section, useCx, type Col, BTN } from "./kit";

type FRow = { [k: string]: unknown; name: string; title: string; revised: number; netCertified: number; invoicedGross: number; collected: number; outstanding: number; retentionHeld: number; advanceOutstanding: number; payInvoiced: number; payOutstanding: number; cashNet: number; certifiedNotInvoiced: number };
const BUCKETS = ["Not due", "1-30", "31-60", "61-90", "90+"] as const;
export function FinancePage(_: PluginPageProps) {
  const { t, ar } = useCx();
  const [company, setCompany] = useState("");
  const ps = constructionProjects({ company: company || undefined });
  const companies = [...new Set(constructionProjects().map((p) => String(p["company"] ?? "")))].filter(Boolean);
  const rows: FRow[] = ps.map((p) => { const f = financialPosition(p.name); return { name: p.name, title: projectTitle(p, !ar), revised: f.revised, netCertified: f.netCertified, invoicedGross: f.invoicedGross, collected: f.collected, outstanding: f.outstanding, retentionHeld: f.retentionHeld, advanceOutstanding: f.advanceOutstanding, payInvoiced: f.payables.invoiced, payOutstanding: f.payables.outstanding, cashNet: f.cashNet, certifiedNotInvoiced: f.certifiedNotInvoiced }; });
  const names = new Set(ps.map((p) => p.name));
  const open = list("Sales Invoice", (s) => isSubmitted(s) && names.has(String(s["project"])) && num(s["outstanding_amount"]) > 0.005);
  const aging = BUCKETS.map((b) => ({ label: b, value: sumBy(open.filter((s) => agingBucket(String(s["due_date"] ?? today()), today()) === b), (s) => num(s["outstanding_amount"])) }));
  const s = (k: keyof FRow) => sumBy(rows, (r) => num(r[k]));
  return (
    <div className="w-full min-w-0" data-page="construction-finance">
      <PageHeader title={t("Financial position", "الموقف المالي")} crumbs={[{ label: t("Financial position & closeout", "الموقف المالي والإغلاق"), to: "dept/fin" }]}
        subtitle={t("Receivables and payables follow the payment ledger of posted invoices; retention and advance follow confirmed certificates. Nothing is posted from this screen.", "الذمم تتبع دفتر المدفوعات للفواتير المرحلة؛ والمحتجزات والمقدمات تتبع الشهادات المؤكدة. لا يُرحَّل شيء من هذه الشاشة.")}
        actions={<><AppLink to="fin/cashflow" className={BTN.secondary}>{t("Weekly cash flow", "التدفق النقدي الأسبوعي")}</AppLink><AppLink to="fin/advances" className={BTN.secondary}>{t("Advances & retention", "السلف والمحتجزات")}</AppLink><AppLink to="reports/Construction%20Cashflow" className={BTN.secondary}>{t("Cashflow", "التدفق النقدي")}</AppLink></>} />
      {companies.length > 1 && <Filters><Field label={t("Company", "الشركة")}><select className={inputCls} value={company} onChange={(e) => setCompany(e.target.value)}><option value="">{t("All", "الكل")}</option>{companies.map((c) => <option key={c} value={c} data-no-i18n>{c}</option>)}</select></Field></Filters>}
      <KpiGrid>
        <Kpi label={t("Invoiced to clients", "المفوتر للعملاء")} value={compact(s("invoicedGross"), ar)} />
        <Kpi label={t("Collected", "المحصّل")} value={compact(s("collected"), ar)} tone="good" />
        <Kpi label={t("Receivable outstanding", "ذمم العملاء")} value={compact(s("outstanding"), ar)} tone="warn" to="reports/Construction%20Receivables%20Aging" />
        <Kpi label={t("Payable outstanding", "ذمم الموردين")} value={compact(s("payOutstanding"), ar)} />
        <Kpi label={t("Retention held by clients", "محتجزات لدى العملاء")} value={compact(s("retentionHeld"), ar)} to="reports/Retention%20and%20Advances" />
        <Kpi label={t("Net cash", "صافي النقد")} value={compact(s("cashNet"), ar)} tone={s("cashNet") < 0 ? "bad" : "good"} />
      </KpiGrid>
      <PolicyGate keys={["P2", "P3"]} />
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-3">
        <div className="min-w-0 lg:col-span-2">
          <Section title={t("By project", "حسب المشروع")}>
            <DataTable rows={rows} empty={t("No projects", "لا مشاريع")} cols={[
              { key: "title", label: t("Project", "المشروع"), render: (r) => <ProjectRef project={r.name} title={r.title} /> },
              { key: "netCertified", label: t("Net certified", "صافي المعتمد"), kind: "money", total: true }, { key: "invoicedGross", label: t("Invoiced", "المفوتر"), kind: "money", total: true },
              { key: "collected", label: t("Collected", "المحصّل"), kind: "money", total: true }, { key: "outstanding", label: t("Receivable", "الذمم المدينة"), kind: "money", total: true },
              { key: "certifiedNotInvoiced", label: t("Certified not invoiced", "معتمد غير مفوتر"), kind: "money", total: true }, { key: "retentionHeld", label: t("Retention", "المحتجزات"), kind: "money", total: true },
              { key: "payOutstanding", label: t("Payable", "الذمم الدائنة"), kind: "money", total: true }, { key: "cashNet", label: t("Net cash", "صافي النقد"), kind: "money", total: true },
            ] as Col<FRow>[]} />
          </Section>
        </div>
        <Section title={t("Receivable aging", "أعمار الذمم المدينة")} actions={<AppLink to="reports/Construction%20Receivables%20Aging">{t("Detail", "التفاصيل")}</AppLink>}>
          <Bars data={aging.map((a) => ({ label: a.label === "Not due" ? t("Not due", "غير مستحق") : t(`${a.label} days`, `${a.label} يوم`), value: a.value, tone: a.label === "Not due" ? "good" as const : a.label === "1-30" ? "warn" as const : "bad" as const, to: "reports/Construction%20Receivables%20Aging" }))} empty={t("Nothing outstanding", "لا مستحقات")} format={(n) => compact(n, ar)} />
        </Section>
      </div>
    </div>
  );
}
