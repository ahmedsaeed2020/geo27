/** Procurement screens: supplier quotation comparison & award (PROC-04/05) and three-way invoice matching PO ↔ receipt ↔ invoice (PROC-08). */
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useState } from "react";
import type { Doc } from "@/lib/adapter";
import type { PluginPageProps } from "@/plugins/pages";
import { num, r2, sumBy } from "../domain/calc";
import { isSubmitted, list, policyDefined, rows } from "../domain/data";
import { projectTitle } from "../domain/data";
import { constructionProjects } from "../domain/queues";
import * as S from "../domain/services";
import { matchingRows, matchTol, type MatchRow } from "../domain/matching";
import { RfqComparison } from "./compare";
import { ActionButton, amount, DataTable, DocRef, Empty, Field, Filters, hasRole, inputCls, Note, PageHeader, PolicyGate, Section, StateBadge, useCx, type Col } from "./kit";

type R = Record<string, unknown>;
export function ComparisonPage(_: PluginPageProps) {
  const { t } = useCx();
  const search = useRouterState({ select: (s) => s.location.search as Record<string, unknown> });
  const nav = useNavigate();
  const rfqs = list("Request for Quotation", (r) => Number(r.docstatus) !== 2).sort((a, b) => String(b["transaction_date"]).localeCompare(String(a["transaction_date"])));
  const allSqs = list("Supplier Quotation", (s) => Number(s.docstatus) !== 2);
  const quoteCount = (rfqName: string) => allSqs.filter((s) => rows(s, "items").some((i) => i["request_for_quotation"] === rfqName)).length;
  // no RFQ in the URL: open the latest construction-project RFQ that already has quotations, else any RFQ with quotations,
  // else the latest RFQ — an empty comparison is never the default while a quoted RFQ exists (all RFQs stay selectable)
  const consProjects = new Set(constructionProjects().map((p) => p.name));
  const isConstruction = (r: Doc) => rows(r, "items").some((i) => consProjects.has(String(i["project"] ?? "")));
  const quoted = rfqs.filter((r) => quoteCount(r.name) > 0);
  const sel = String(search["rfq"] ?? (quoted.find(isConstruction) ?? quoted[0] ?? rfqs[0])?.name ?? "");
  const setSel = (v: string) => void nav({ to: "/plugins/$name/$", params: { name: "digit_construction", _splat: "proc/comparison" }, search: { rfq: v } as never, replace: true });
  const rfq = rfqs.find((r) => r.name === sel);
  const sqs = allSqs.filter((s) => rows(s, "items").some((i) => i["request_for_quotation"] === sel));
  return (
    <div className="w-full min-w-0" data-page="construction-comparison">
      <PageHeader title={t("Quotation comparison", "مقارنة العروض")} crumbs={[{ label: t("Procurement & materials", "المشتريات والمواد"), to: "dept/proc" }]}
        subtitle={t("Native Request for Quotation and Supplier Quotations side by side; awarding creates a native Purchase Order draft that keeps the quotation and material request lines.", "طلب عروض الأسعار وعروض الموردين الأصلية جنباً إلى جنب؛ الترسية تنشئ مسودة أمر شراء أصلي تحتفظ ببنود العرض وطلب المواد.")} />
      {!rfqs.length ? <Empty>{t("No requests for quotation yet", "لا طلبات عروض أسعار بعد")}</Empty> : (
        <>
          <Filters><Field label={t("Request for quotation", "طلب عروض الأسعار")}><select className={inputCls} value={sel} onChange={(e) => setSel(e.target.value)}>{rfqs.map((r) => <option key={r.name} value={r.name} data-no-i18n>{r.name} · {String(r["transaction_date"] ?? "")} · {t(`${quoteCount(r.name)} quotations`, `${quoteCount(r.name)} عروض`)}</option>)}</select></Field></Filters>
          {rfq && <p className="mb-3 text-sm"><DocRef doctype="Request for Quotation" name={rfq.name} /> <StateBadge state={rfq["status"] ?? (isSubmitted(rfq) ? "Submitted" : "Draft")} /> · {t(`${sqs.length} quotations`, `${sqs.length} عروض`)}</p>}
          {!sqs.length ? <Note tone="warn">{t("No supplier quotation references this RFQ yet.", "لا يوجد عرض مورد مرتبط بهذا الطلب بعد.")}</Note> : (
            <Section title={t("Rates by item", "الأسعار حسب الصنف")}>
              <RfqComparison rfq={sel} />
            </Section>
          )}
        </>
      )}
    </div>
  );
}

/** Three-way match rows (moved to domain/matching.ts so the policy register can count P5 variances). */
export { matchingRows, type MatchRow };
export function MatchingPage(_: PluginPageProps) {
  const { t, ar } = useCx();
  const [project, setProject] = useState("");
  const [only, setOnly] = useState(false);
  const all = matchingRows(project || undefined);
  const data = only ? all.filter((r) => r.status.includes("variance") || r.status === "Variance accepted") : all;
  const tv = matchTol(); const tolSet = tv.qtyPct !== null || tv.pricePct !== null;
  const canAccept = hasRole("Digit Procurement Officer");
  const [reason, setReason] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState("");
  return (
    <div className="w-full min-w-0" data-page="construction-matching">
      <PageHeader title={t("Invoice matching", "مطابقة الفواتير")} crumbs={[{ label: t("Procurement & materials", "المشتريات والمواد"), to: "dept/proc" }]}
        subtitle={t("Three-way match of purchase order, purchase receipt and purchase invoice per item — computed from submitted native documents.", "مطابقة ثلاثية لأمر الشراء والاستلام وفاتورة الشراء لكل صنف — محسوبة من المستندات الأصلية المعتمدة.")} />
      <PolicyGate keys={["P5"]} />
      {policyDefined("P5") && <Note>{t("Matching tolerance (P5, Finance values)", "حد السماح في المطابقة (P5، قيم المالية)")}: {tolSet
        ? <span data-no-i18n>{t("quantity", "الكمية")} {tv.qtyPct ?? "—"}% · {t("price", "السعر")} {tv.pricePct ?? "—"}% · {t("cap", "السقف")} {tv.cap === null ? "—" : amount(tv.cap)}</span>
        : t("not set by Finance — variances are reported only, nothing is blocked", "لم تحددها المالية — تُعرض الفروقات للمتابعة فقط ولا يُمنع شيء")}</Note>}
      {msg && <Note>{msg}</Note>}
      <Filters>
        <Field label={t("Project", "المشروع")}><select className={inputCls} value={project} onChange={(e) => setProject(e.target.value)}><option value="">{t("All", "الكل")}</option>{constructionProjects().map((p) => <option key={p.name} value={p.name} data-no-i18n>{projectTitle(p, !ar)}</option>)}</select></Field>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={only} onChange={(e) => setOnly(e.target.checked)} />{t("Variances only", "الفروقات فقط")}</label>
      </Filters>
      <Section title={t(`${data.length} order lines`, `${data.length} بند أمر شراء`)}>
        <DataTable rows={data} empty={t("No submitted purchase orders for these filters", "لا أوامر شراء معتمدة لهذه المرشحات")} cols={[
          { key: "po", label: t("Purchase order", "أمر الشراء"), kind: "doc", doctype: "Purchase Order" }, { key: "supplier", label: t("Supplier", "المورّد"), kind: "doc", doctype: "Supplier" }, { key: "item", label: t("Item", "الصنف"), kind: "doc", doctype: "Item" },
          { key: "ordered", label: t("Ordered", "المطلوب"), kind: "num" }, { key: "received", label: t("Received", "المستلم"), kind: "num" }, { key: "invoiced", label: t("Invoiced", "المفوتر"), kind: "num" },
          { key: "poRate", label: t("PO rate", "سعر الأمر"), kind: "money" }, { key: "invRate", label: t("Invoice rate", "سعر الفاتورة"), kind: "money" },
          { key: "status", label: t("Match", "المطابقة"), render: (r) => <span className={r.status === "Matched" ? "text-success" : r.status.includes("variance") ? "font-medium text-destructive" : "text-muted-foreground"}>{r.status === "Matched" ? t("Matched", "مطابق") : r.status === "Quantity variance" ? t(`Quantity variance ${r.qtyVar}`, `فرق كمية ${r.qtyVar}`) : r.status === "Price variance" ? t(`Price variance ${r.priceVar}`, `فرق سعر ${r.priceVar}`) : r.status === "Open" ? t("Open", "مفتوح") : r.status === "Within tolerance" ? t("Within tolerance", "ضمن حد السماح") : r.status === "Variance accepted" ? t("Variance accepted", "فرق مقبول") : t("Received, not invoiced", "مستلم غير مفوتر")}</span> },
          ...(policyDefined("P5") && canAccept ? [{ key: "accept", label: t("Accept variance", "قبول الفرق"), render: (r: MatchRow) => r.acceptance ? <DocRef doctype="Digit Match Acceptance" name={r.acceptance} /> : r.status.includes("variance") ? (
            <span className="flex items-center gap-1"><input className={inputCls} placeholder={t("Reason", "السبب")} value={reason[r.name] ?? ""} onChange={(e) => setReason({ ...reason, [r.name]: e.target.value })} />
              <ActionButton label={t("Accept", "قبول")} open={false} run={() => S.acceptMatchVariance(r.po, String(r.item), reason[r.name] ?? "")} onDone={(x) => setMsg(x.ok ? t("Variance accepted", "تم قبول الفرق") : "")} /></span>) : "—" }] : []),
          { key: "invoices", label: t("Invoices", "الفواتير"), render: (r) => r.invoices.length ? <span className="flex gap-1">{r.invoices.map((i) => <DocRef key={i} doctype="Purchase Invoice" name={i} />)}</span> : "—" },
        ] as Col<MatchRow>[]} />
        {data.some((r) => r.status.includes("variance")) && !policyDefined("P5") && <p className="mt-2 text-xs text-destructive">{t("Variances cannot be accepted here until the matching tolerance (P5) is decided; correct the invoice or receipt on the native form.", "لا يمكن قبول الفروقات هنا حتى يُحدد حد التفاوت (P5)؛ صحح الفاتورة أو الاستلام من النموذج الأصلي.")}</p>}
      </Section>
    </div>
  );
}
