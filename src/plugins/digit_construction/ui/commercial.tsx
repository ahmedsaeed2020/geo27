/** Estimating screens: estimate version review (ET-03/04) and tender → BOQ draft (ET-05). */
import { useNavigate } from "@tanstack/react-router";
import { adapter } from "@/lib/adapter";
import type { PluginPageProps } from "@/plugins/pages";
import { boqBlockers, estimateTotals, lineAmount, num, validityState } from "../domain/calc";
import { list, policyDefined, rows, today } from "../domain/data";
import * as S from "../domain/services";
import { ActionButton, AppLink, DataTable, DocRef, Empty, hasRole, Kpi, KpiGrid, money, Note, PageHeader, PolicyGate, Section, StateBadge, useCx, type Col, BTN } from "./kit";
import { WorkflowActions } from "./workflowActions";

type R = Record<string, unknown>;
export function EstimatePage({ params }: PluginPageProps) {
  const { t } = useCx();
  const nav = useNavigate();
  const id = params["id"] ?? "";
  const e = adapter.get("Digit Estimate Version", id);
  if (!e || !list("Digit Estimate Version", (x) => x.name === id).length) return <div className="p-6"><PageHeader title={t("Estimate not found", "التقدير غير موجود")} crumbs={[{ label: t("Estimating", "التقدير"), to: "dept/et" }]} /><Empty><span data-no-i18n>{id}</span></Empty></div>;
  const tender = adapter.get("Digit Tender", String(e["tender"] ?? ""));
  const lines = rows(e, "lines");
  const tot = estimateTotals(lines);
  const versions = list("Digit Estimate Version", (v) => v["tender"] === e["tender"]).sort((a, b) => num(a["version"]) - num(b["version"]));
  const comps = lines.flatMap((l) => (l["assembly"] ? rows(adapter.get("Digit Assembly", String(l["assembly"])), "components").map((c) => ({ line: l, c, rate: adapter.get("Digit Construction Rate", String(c["rate"])) })) : []));
  const expired = comps.filter((x) => x.rate && validityState(x.rate["valid_until"], today()) === "expired");
  const expiring = comps.filter((x) => x.rate && validityState(x.rate["valid_until"], today()) === "expiring");
  const blockers = boqBlockers(lines);
  const open = (r: { name?: string | undefined }) => r.name && void nav({ to: "/plugins/$name/$", params: { name: "digit_construction", _splat: `estimating/version/${r.name}` } });
  return (
    <div className="w-full min-w-0" data-page="construction-estimate" data-estimate={id}>
      <PageHeader title={t(`Estimate ${e.name} · v${num(e["version"])}`, `التقدير ${e.name} · الإصدار ${num(e["version"])}`)} crumbs={[{ label: t("Estimating & tenders", "التقدير والعطاءات"), to: "dept/et" }]}
        subtitle={<span>{t("Tender", "المنافسة")}: <DocRef doctype="Digit Tender" name={e["tender"]} /> <span data-no-i18n>{String(tender?.["title"] ?? "")}</span></span>}
        actions={<><StateBadge state={e["workflow_state"]} /><WorkflowActions doctype="Digit Estimate Version" name={e.name} />{hasRole("Digit Estimator") && <ActionButton label={t("New revision from this version", "إصدار جديد من هذا الإصدار")} run={() => S.createEstimateVersion(String(e["tender"]), e.name)} onDone={open} open={false} />}<DocRef doctype="Digit Estimate Version" name={e.name} className={BTN.secondary}>{t("Edit on form", "تعديل في النموذج")}</DocRef></>} />
      <KpiGrid>
        <Kpi label={t("Total cost", "إجمالي التكلفة")} value={money(tot.cost)} anchor="estimate-lines" />
        <Kpi label={t("Total selling", "إجمالي البيع")} value={money(tot.selling)} anchor="estimate-lines" />
        <Kpi label={t("Margin", "الهامش")} value={money(tot.margin)} hint={tot.marginPct === null ? "—" : `${tot.marginPct}%`} tone={tot.marginPct !== null && tot.marginPct < 8 ? "warn" : "good"} anchor="estimate-lines" />
        <Kpi label={t("Lines", "البنود")} value={lines.length} hint={t(`${lines.filter((l) => !(num(l["selling_rate"]) > 0)).length} without selling rate`, `${lines.filter((l) => !(num(l["selling_rate"]) > 0)).length} بلا سعر بيع`)} anchor="estimate-lines" />
      </KpiGrid>
      {e["workflow_state"] === "Returned" && e["return_reason"] ? <Note tone="warn">{t("Returned: ", "أُعيد: ")}<span data-no-i18n>{String(e["return_reason"])}</span></Note> : null}
      {expired.length > 0 && <Note tone={policyDefined("P6") ? "warn" : "bad"}>{t(`${expired.length} assembly rate(s) are expired; approval is blocked until policy P6 decides block or override.`, `${expired.length} سعر تجميعة منتهي؛ الاعتماد موقوف حتى تقرر السياسة P6 الحظر أو التجاوز.`)} <span data-no-i18n>{[...new Set(expired.map((x) => x.rate!.name))].join(", ")}</span></Note>}
      {expiring.length > 0 && <Note>{t(`${expiring.length} assembly rate(s) expire within 30 days.`, `${expiring.length} سعر تجميعة ينتهي خلال 30 يوماً.`)}</Note>}
      <PolicyGate keys={expired.length ? ["P6"] : []} />
      <Section id="estimate-lines" title={t("Estimate lines", "بنود التقدير")}>
        <DataTable rows={lines.map((l) => ({ ...l, name: String(l["line_key"]), cost_amount: lineAmount(l["qty"], l["cost_rate"]), selling_amount: lineAmount(l["qty"], l["selling_rate"]) }))} empty={t("No lines", "لا بنود")} cols={[
          { key: "code", label: t("Code", "الرمز") }, { key: "description", label: t("Description", "الوصف") }, { key: "uom", label: t("Unit", "الوحدة") }, { key: "qty", label: t("Qty", "الكمية"), kind: "num" },
          { key: "assembly", label: t("Assembly", "التجميعة"), kind: "doc", doctype: "Digit Assembly" }, { key: "cost_rate", label: t("Cost rate", "سعر التكلفة"), kind: "money" }, { key: "cost_amount", label: t("Cost", "التكلفة"), kind: "money", total: true },
          { key: "selling_rate", label: t("Selling rate", "سعر البيع"), kind: "money", render: (r) => <span className={num(r["selling_rate"]) > 0 ? "" : "font-medium text-destructive"} data-no-i18n>{num(r["selling_rate"]) > 0 ? num(r["selling_rate"]).toFixed(2) : t("missing", "ناقص")}</span> },
          { key: "selling_amount", label: t("Selling", "البيع"), kind: "money", total: true },
        ] as Col<R>[]} />
      </Section>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-2">
        <Section title={t("Versions of this tender", "إصدارات هذه المنافسة")}>
          <DataTable rows={versions as R[]} empty="" cols={[
            { key: "name", label: t("Version", "الإصدار"), render: (r) => <AppLink to={`estimating/version/${encodeURIComponent(String(r["name"]))}`}><span data-no-i18n>{String(r["name"])} · v{num(r["version"])}</span></AppLink> },
            { key: "workflow_state", label: t("Status", "الحالة"), kind: "state" }, { key: "total_cost", label: t("Cost", "التكلفة"), kind: "money" }, { key: "total_selling", label: t("Selling", "البيع"), kind: "money" }, { key: "margin_pct", label: t("Margin", "الهامش"), kind: "pct" },
          ] as Col<R>[]} />
        </Section>
        <Section title={t("Next step: BOQ", "الخطوة التالية: جدول الكميات")}>
          {e["workflow_state"] !== "Approved" ? <p className="text-sm text-muted-foreground">{t("A BOQ is created only from the single approved estimate version of the tender.", "يُنشأ جدول الكميات فقط من الإصدار المعتمد الوحيد للمنافسة.")}</p>
            : blockers.length ? <Note tone="bad"><ul className="list-disc ps-5">{blockers.map((b) => <li key={b} data-no-i18n>{b}</li>)}</ul></Note>
            : <AppLink to={`estimating/tender/${encodeURIComponent(String(e["tender"]))}/boq`} className={BTN.primary}>{t("Review the BOQ draft", "مراجعة مسودة جدول الكميات")}</AppLink>}
        </Section>
      </div>
    </div>
  );
}

export function TenderBoqPage({ params }: PluginPageProps) {
  const { t } = useCx();
  const id = params["id"] ?? "";
  const tender = adapter.get("Digit Tender", id);
  if (!tender || !list("Digit Tender", (x) => x.name === id).length) return <div className="p-6"><PageHeader title={t("Tender not found", "المنافسة غير موجودة")} crumbs={[{ label: t("Estimating & tenders", "التقدير والعطاءات"), to: "dept/et" }]} /><Empty><span data-no-i18n>{id}</span></Empty></div>;
  const approved = list("Digit Estimate Version", (v) => v["tender"] === id && v["workflow_state"] === "Approved");
  const est = approved.length === 1 ? approved[0] : undefined;
  const lines = rows(est, "lines");
  const blockers = est ? boqBlockers(lines) : [];
  const boq = tender["boq"] ? adapter.get("Digit BOQ", String(tender["boq"])) : list("Digit BOQ", (b) => b["tender"] === id)[0];
  const contract = boq ? list("Digit Client Contract", (c) => c["boq"] === boq.name)[0] : undefined;
  const canCreate = hasRole("Digit QS", "Digit Estimator");
  return (
    <div className="w-full min-w-0" data-page="construction-tender-boq" data-tender={id}>
      <PageHeader title={t("Tender → BOQ draft", "من المنافسة إلى جدول الكميات")} crumbs={[{ label: t("Estimating & tenders", "التقدير والعطاءات"), to: "dept/et" }]}
        subtitle={<span><DocRef doctype="Digit Tender" name={id} /> · <span data-no-i18n>{String(tender["title"] ?? "")}</span></span>} actions={<StateBadge state={tender["status"]} />} />
      <ol className="mb-4 grid gap-2 text-sm sm:grid-cols-3" aria-label={t("Steps", "الخطوات")}>
        <li className={`panel px-3 py-2 ${est ? "border-success/50" : ""}`}><div className="text-xs text-muted-foreground">1</div>{t("Single approved estimate", "تقدير معتمد وحيد")}: {est ? <AppLink to={`estimating/version/${encodeURIComponent(est.name)}`}><span data-no-i18n>{est.name}</span></AppLink> : <span className="text-destructive">{approved.length > 1 ? t("more than one", "أكثر من واحد") : t("none", "لا يوجد")}</span>}</li>
        <li className={`panel px-3 py-2 ${boq ? "border-success/50" : ""}`}><div className="text-xs text-muted-foreground">2</div>{t("BOQ", "جدول الكميات")}: {boq ? <><DocRef doctype="Digit BOQ" name={boq.name} /> <StateBadge state={boq["workflow_state"]} /></> : t("not created", "لم يُنشأ")}</li>
        <li className={`panel px-3 py-2 ${contract ? "border-success/50" : ""}`}><div className="text-xs text-muted-foreground">3</div>{t("Client contract", "عقد العميل")}: {contract ? <DocRef doctype="Digit Client Contract" name={contract.name} /> : t("not created", "لم يُنشأ")}</li>
      </ol>
      {!est && <Note tone="bad">{approved.length > 1 ? t("More than one approved estimate version — supersede the older one first.", "يوجد أكثر من إصدار معتمد — اجعل الأقدم ملغى أولاً.") : t("The tender has no approved estimate version yet.", "لا يوجد إصدار تقدير معتمد للمنافسة بعد.")}</Note>}
      {blockers.length > 0 && <Note tone="bad"><div className="font-medium">{t("Lines that block the BOQ", "بنود تمنع إنشاء جدول الكميات")}</div><ul className="list-disc ps-5">{blockers.map((b) => <li key={b} data-no-i18n>{b}</li>)}</ul></Note>}
      {est && (
        <Section title={t("BOQ lines that will be created", "بنود جدول الكميات التي ستُنشأ")} actions={canCreate && !boq ? <ActionButton primary label={t("Create BOQ draft", "إنشاء مسودة جدول الكميات")} disabled={blockers.length > 0} reason={t("Resolve the blocking lines first", "عالج البنود المانعة أولاً")} run={() => S.createBoqFromTender(id)} /> : boq && boq["workflow_state"] === "Approved" && !contract && canCreate ? <ActionButton primary label={t("Create client contract", "إنشاء عقد العميل")} run={() => S.createContractFromBoq(boq.name)} /> : boq ? <WorkflowActions doctype="Digit BOQ" name={boq.name} /> : undefined}>
          <DataTable rows={lines.map((l) => ({ ...l, name: String(l["line_key"]), amount: lineAmount(l["qty"], l["selling_rate"]) }))} empty="" cols={[
            { key: "code", label: t("Code", "الرمز") }, { key: "description", label: t("Description", "الوصف") }, { key: "uom", label: t("Unit", "الوحدة") }, { key: "qty", label: t("Qty", "الكمية"), kind: "num" },
            { key: "selling_rate", label: t("Rate", "السعر"), kind: "money" }, { key: "amount", label: t("Amount", "المبلغ"), kind: "money", total: true },
          ] as Col<R>[]} />
          <p className="mt-2 text-xs text-muted-foreground">{t("BOQ lines keep the estimate line keys, so claims, budgets and cost reports trace back to the priced estimate.", "تحتفظ بنود جدول الكميات بمفاتيح بنود التقدير، فتتتبع المطالبات والموازنات وتقارير التكلفة التقدير المسعّر.")}</p>
        </Section>
      )}
    </div>
  );
}
