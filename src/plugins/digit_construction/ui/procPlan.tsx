/**
 * PRO-01 Procurement plan (proc/plan) and MAT-01 / PRO-EXT-08 Project material position (proc/materials).
 * Both read native Material Request → RFQ → Supplier Quotation → Purchase Order → Purchase Receipt → Purchase Invoice
 * rows and stock ledger rows through domain/procPlan.ts; every figure opens its exact source row. New requests are local
 * drafts of the native form; RFQs / orders are created from the native forms' Create menu, never here.
 * Project (explicit), stage, flag, item and as-of filters live in the URL.
 */
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { Fragment, useState } from "react";
import type { PluginPageProps } from "@/plugins/pages";
import { formatRowAnchor } from "@/lib/rowAnchor";
import { useScopeMetas } from "@/lib/scope";
import { itemForecast, itemLocations, positionByItem, type ItemPositionRow, materialPosition, ordersWithoutRequest, POSITION_MEASURES, type PositionMeasure, type StripSource, procurementPlan, stageCounts, SUPPLY_STAGES, type PlanFlag, type PlanLine, type PositionFlag, type PositionRow, type Ref, type SupplyStage } from "../domain/procPlan";
import { get, projectTitle, today } from "../domain/data";
import { constructionProjects } from "../domain/queues";
import { uomLabel } from "../i18n";
import { AppLink, Bars, BTN, compact, DataTable, DocRef, Empty, Field, Filters, inputCls, Kpi, KpiGrid, NewDoc, Note, PageHeader, Section, useCx, dateTxt, qty, type Col } from "./kit";
import { reportLink } from "./reports";
import { DateInput } from "@/components/form/DateInput";
import { DistributionBar } from "@/components/enterprise/kit/DistributionBar";
import { EntDrawer } from "@/components/enterprise/Surfaces";

const NATIVE = ["Project", "Material Request", "Request for Quotation", "Supplier Quotation", "Purchase Order", "Purchase Receipt", "Purchase Invoice", "Stock Entry", "Stock Ledger Entry", "Item", "Warehouse", "Supplier"];
const STAGE_AR: Record<SupplyStage, string> = { "Draft request": "طلب مسودة", Requested: "مطلوب", "Quotation requested": "طُلب عرض سعر", Quoted: "وصلت عروض", Ordered: "صدر أمر شراء", "Partly received": "مستلم جزئيًا", Received: "مستلم", Invoiced: "مفوتر", Stopped: "متوقف" };
const STAGE_TONE: Record<SupplyStage, string> = { "Draft request": "bg-muted text-muted-foreground", Requested: "bg-primary/10 text-primary", "Quotation requested": "bg-primary/10 text-primary", Quoted: "bg-primary/10 text-primary", Ordered: "bg-warning/15 text-warning", "Partly received": "bg-warning/15 text-warning", Received: "bg-success/15 text-success", Invoiced: "bg-success/15 text-success", Stopped: "bg-muted text-muted-foreground" };
const FLAG: Record<PlanFlag, [string, string]> = {
  NOT_ORDERED_BY_DATE: ["Not ordered by the required date", "لم يصدر أمر شراء حتى تاريخ الحاجة"], DELIVERY_LATE: ["Delivery late", "التوريد متأخر"], RECEIVED_NOT_INVOICED: ["Received, not invoiced", "مستلم ولم يُفوتر"],
  OVER_ORDERED: ["Ordered above the request", "أوامر الشراء أكبر من المطلوب"], QUOTE_OVERDUE: ["Quotations overdue", "عروض الأسعار متأخرة"],
};
const PFLAG: Record<PositionFlag, [string, string, string, string]> = {
  NEGATIVE_BALANCE: ["Issued more than received at site", "المصروف أكثر من المستلم في الموقع", "Check missing receipts or transfers into this warehouse.", "تحقق من استلامات أو تحويلات ناقصة لهذا المستودع."],
  UOM_MISMATCH: ["Unit differs from stock unit", "الوحدة تختلف عن وحدة المخزون", "The order line uses another unit with conversion factor 1; quantities may be wrong.", "سطر الأمر بوحدة أخرى ومعامل تحويل 1؛ قد تكون الكميات خاطئة."],
  UNMATCHED_INVOICE: ["Stock item invoiced without receipt", "صنف مخزني مفوتر بلا استلام", "Invoice line with no purchase order or receipt: the quantity never passed through the site store.", "سطر فاتورة بلا أمر شراء أو استلام: لم تمر الكمية عبر مخزن الموقع."],
  RECEIVED_NOT_INVOICED: ["Received, not invoiced", "مستلم ولم يُفوتر", "Goods are on site but the supplier invoice is not submitted yet; cost is still a commitment.", "المواد في الموقع لكن فاتورة المورد لم تُعتمد بعد؛ وتبقى التكلفة التزامًا."],
};
const Chip = ({ tone, children }: { tone: string; children: React.ReactNode }) => <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium leading-4 ${tone}`} data-no-i18n>{children}</span>;
const refLink = (r: Ref) => <DocRef key={`${r.name}-${r.row}`} doctype={r.doctype} name={r.name} row={formatRowAnchor("items", r.row)} />;
const refList = (rs: Ref[]) => (rs.length ? <div className="flex flex-col gap-0.5">{rs.map(refLink)}</div> : <span className="text-muted-foreground">—</span>);

function useUrl(path: string) {
  const search = useRouterState({ select: (s) => s.location.search as Record<string, unknown> });
  const nav = useNavigate();
  const str = (k: string) => (typeof search[k] === "string" ? String(search[k]) : "");
  const set = (p: Record<string, string>) => void nav({ to: "/plugins/$name/$", params: { name: "digit_construction", _splat: path }, search: Object.fromEntries(Object.entries({ ...search, ...p }).filter(([, v]) => v)) as never, replace: true });
  return { str, set };
}
function ProjectPick({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { t, ar } = useCx();
  return (
    <Field label={t("Project", "المشروع")}>
      <select className={inputCls} value={value} data-plan-filter="project" onChange={(e) => onChange(e.target.value)}>
        <option value="">{t("Select a project…", "اختر مشروعًا…")}</option>
        {constructionProjects().map((p) => <option key={p.name} value={p.name} data-no-i18n>{projectTitle(p, !ar)}</option>)}
      </select>
    </Field>
  );
}

// ---------------------------------------------------------------- PRO-01
export function ProcurementPlanPage(_: PluginPageProps) {
  const { t, ar } = useCx();
  useScopeMetas(NATIVE);
  const { str, set } = useUrl("proc/plan");
  const projects = constructionProjects();
  const project = projects.some((p) => p.name === str("project")) ? str("project") : "";
  const title = t("Procurement plan", "خطة المشتريات");
  const crumbs = [{ label: t("Procurement & materials", "المشتريات والمواد"), to: "dept/proc" }];
  const on = today();
  if (!project) return (
    <div className="w-full min-w-0" data-page="construction-proc-plan">
      <PageHeader title={title} crumbs={crumbs} subtitle={t("Every material request line followed to quotation, order, receipt and invoice.", "كل سطر طلب مواد متتبَّع إلى عرض السعر وأمر الشراء والاستلام والفاتورة.")} />
      <Filters><ProjectPick value="" onChange={(v) => set({ project: v })} /></Filters>
      <Empty>{projects.length ? t("Select a project to see its procurement plan.", "اختر مشروعًا لعرض خطة مشترياته.") : t("No construction projects you can read.", "لا توجد مشاريع مقاولات يمكنك قراءتها.")}</Empty>
    </div>
  );
  const p = get("Project", project);
  const all = procurementPlan(project, on);
  const counts = stageCounts(all);
  const stage = SUPPLY_STAGES.find((s) => s === str("stage"));
  const flag = (Object.keys(FLAG) as PlanFlag[]).find((f) => f === str("flag"));
  const q = str("q").toLowerCase();
  const lines = all.filter((l) => (!stage || l.stage === stage) && (!flag || l.flags.includes(flag)) && (!q || `${l.item_code} ${l.item_name} ${l.mr}`.toLowerCase().includes(q)));
  const queue = all.filter((l) => l.flags.length);
  const direct = ordersWithoutRequest(project);
  const stLabel = (s: SupplyStage) => (ar ? STAGE_AR[s] : s);
  const cols: Col<PlanLine & Record<string, unknown>>[] = [
    { key: "mr", label: t("Request line", "سطر الطلب"), render: (l) => <div><DocRef doctype="Material Request" name={l.mr} row={formatRowAnchor("items", l.mr_row)} /><span className="ms-1 text-xs text-muted-foreground" data-no-i18n>#{l.mr_row}</span></div> },
    { key: "item", label: t("Item", "الصنف"), render: (l) => <div className="min-w-[9rem]"><div data-no-i18n>{l.item_name}</div><div className="text-xs text-muted-foreground" data-no-i18n>{l.item_code}</div></div> },
    { key: "required_by", label: t("Required by", "تاريخ الحاجة"), render: (l) => <span data-no-i18n className={l.flags.includes("NOT_ORDERED_BY_DATE") ? "text-destructive" : ""}>{dateTxt(l.required_by)}</span> },
    { key: "qty", label: t("Requested", "المطلوب"), render: (l) => <span data-no-i18n className="tabular-nums">{qty(l.qty)} {uomLabel(l.uom, ar)}</span>, align: "end" },
    { key: "ordered", label: t("Ordered", "بأوامر شراء"), kind: "num" },
    { key: "received", label: t("Received", "المستلم"), kind: "num" },
    { key: "invoiced", label: t("Invoiced", "المفوتر"), kind: "num" },
    { key: "stage", label: t("Stage", "المرحلة"), render: (l) => <div><Chip tone={STAGE_TONE[l.stage]}>{stLabel(l.stage)}</Chip>{l.next_delivery && <div className="mt-0.5 text-xs text-muted-foreground" data-no-i18n>{t("Delivery", "التوريد")} {dateTxt(l.next_delivery)}</div>}</div> },
    { key: "chain", label: t("RFQ / quotes / orders", "طلبات العروض / العروض / الأوامر"), render: (l) => <div className="flex gap-3 text-xs">{refList(l.rfqs)}{refList(l.quotes)}{refList(l.orders)}</div> },
    { key: "receipts", label: t("Receipts / invoices", "الاستلام / الفواتير"), render: (l) => <div className="flex gap-3 text-xs">{refList(l.receipts)}{refList(l.invoices)}</div> },
    { key: "flags", label: t("Attention", "تنبيه"), render: (l) => (l.flags.length ? <div className="flex max-w-[12rem] flex-wrap gap-1">{l.flags.map((f) => <Chip key={f} tone="bg-warning/15 text-warning">{ar ? FLAG[f][1] : FLAG[f][0]}</Chip>)}</div> : <span className="text-muted-foreground">—</span>) },
  ];
  const company = p?.["company"];
  return (
    <div className="w-full min-w-0" data-page="construction-proc-plan" data-project={project}>
      <PageHeader title={title} crumbs={crumbs}
        subtitle={t("Every material request line of the project followed through its own references to quotation, order, receipt and invoice. Quotation requests and orders are created from the request's native Create menu.", "كل سطر طلب مواد للمشروع متتبَّع عبر مراجعه إلى عرض السعر وأمر الشراء والاستلام والفاتورة. تُنشأ طلبات العروض والأوامر من قائمة «إنشاء» في نموذج الطلب.")}
        actions={<><NewDoc doctype="Material Request" defaults={{ company, material_request_type: "Purchase", schedule_date: on }} label={t("Material request", "طلب مواد")} primary /><AppLink to={`proc/materials?project=${encodeURIComponent(project)}`} className={BTN.secondary}>{t("Material position", "موقف المواد")}</AppLink><AppLink to="proc/comparison" className={BTN.secondary}>{t("Quotation comparison", "مقارنة العروض")}</AppLink></>} />
      <Filters>
        <ProjectPick value={project} onChange={(v) => set({ project: v, stage: "", flag: "" })} />
        <Field label={t("Attention", "تنبيه")}><select className={inputCls} value={flag ?? ""} data-plan-filter="flag" onChange={(e) => set({ flag: e.target.value })}><option value="">{t("All lines", "كل السطور")}</option>{(Object.keys(FLAG) as PlanFlag[]).map((f) => <option key={f} value={f}>{ar ? FLAG[f][1] : FLAG[f][0]}</option>)}</select></Field>
        <Field label={t("Search", "بحث")}><input className={inputCls} defaultValue={str("q")} placeholder={t("Item or request", "الصنف أو الطلب")} onKeyDown={(e) => { if (e.key === "Enter") set({ q: (e.target as HTMLInputElement).value }); }} onBlur={(e) => set({ q: e.target.value })} /></Field>
      </Filters>
      <KpiGrid>
        <Kpi label={t("Request lines", "سطور الطلب")} value={String(all.length)} />
        <Kpi label={t("Waiting for an order", "بانتظار أمر شراء")} value={String(all.filter((l) => l.pending_order > 0 && l.stage !== "Draft request" && l.stage !== "Stopped").length)} tone="warn" />
        <Kpi label={t("Late (order or delivery)", "متأخرة (طلب أو توريد)")} value={String(all.filter((l) => l.flags.includes("NOT_ORDERED_BY_DATE") || l.flags.includes("DELIVERY_LATE")).length)} tone={all.some((l) => l.flags.includes("DELIVERY_LATE") || l.flags.includes("NOT_ORDERED_BY_DATE")) ? "bad" : "good"} />
        <Kpi label={t("Received, not invoiced", "مستلم ولم يُفوتر")} value={String(all.filter((l) => l.flags.includes("RECEIVED_NOT_INVOICED")).length)} />
      </KpiGrid>
      {(() => { const c = stageCounts(all); const g = (ks: SupplyStage[]) => ks.reduce((n, k) => n + c[k], 0); return (
        <DistributionBar title={t("Request lines by stage", "سطور الطلب حسب المرحلة")} segments={[
          { key: "requested", label: t("Requested", "مطلوب"), value: g(["Draft request", "Requested", "Quotation requested", "Quoted"]), hue: "blue" },
          { key: "ordered", label: t("Ordered", "صدر أمر شراء"), value: g(["Ordered", "Partly received"]), hue: "amber" },
          { key: "received", label: t("Received", "مستلم"), value: c.Received, hue: "teal" },
          { key: "invoiced", label: t("Invoiced", "مفوتر"), value: c.Invoiced, hue: "emerald" },
          ...(c.Stopped ? [{ key: "stopped", label: t("Stopped", "متوقف"), value: c.Stopped, hue: "rose" as const }] : []),
        ]} />); })()}
      <Section title={t("Supply stages", "مراحل التوريد")}>
        <div className="mb-2 flex flex-wrap gap-1.5" role="group" aria-label={t("Filter by stage", "تصفية حسب المرحلة")}>
          <button type="button" className={`${BTN.compact} ${!stage ? "border-primary text-primary" : ""}`} aria-pressed={!stage} onClick={() => set({ stage: "" })}>{t("All", "الكل")} <span data-no-i18n>{all.length}</span></button>
          {SUPPLY_STAGES.filter((s) => counts[s]).map((s) => <button key={s} type="button" data-plan-stage={s} aria-pressed={stage === s} className={`${BTN.compact} ${stage === s ? "border-primary text-primary" : ""}`} onClick={() => set({ stage: stage === s ? "" : s })}>{stLabel(s)} <span data-no-i18n>{counts[s]}</span></button>)}
        </div>
        <Bars data={SUPPLY_STAGES.filter((s) => counts[s]).map((s) => ({ label: stLabel(s), value: counts[s] }))} format={(n) => String(n)} empty={t("No request lines", "لا سطور طلب")} />
      </Section>
      {queue.length > 0 && !stage && !flag && <Section title={t("Needs a decision", "تحتاج قرارًا")}>
        <ul className="divide-y divide-border text-sm" data-plan-queue>
          {queue.map((l) => <li key={l.key} className="flex flex-wrap items-center gap-2 py-1.5"><DocRef doctype="Material Request" name={l.mr} row={formatRowAnchor("items", l.mr_row)} /><span data-no-i18n>{l.item_name}</span>{l.flags.map((f) => <Chip key={f} tone="bg-warning/15 text-warning">{ar ? FLAG[f][1] : FLAG[f][0]}</Chip>)}<span className="text-xs text-muted-foreground" data-no-i18n>{t("pending order", "متبقٍ للطلب")} {qty(l.pending_order)} · {t("pending receipt", "متبقٍ للاستلام")} {qty(l.pending_receipt)}</span></li>)}
        </ul>
      </Section>}
      <Section title={t("Request lines and supply", "سطور الطلب والتوريد")}>
        <DataTable<PlanLine & Record<string, unknown>> rows={lines as (PlanLine & Record<string, unknown>)[]} cols={cols} rowKey={(l) => l.key} pageSize={30} empty={all.length ? t("No lines match these filters", "لا سطور مطابقة لهذه المرشحات") : t("This project has no material requests yet.", "لا توجد طلبات مواد لهذا المشروع بعد.")} />
        <p className="mt-2 text-xs text-muted-foreground">{t("Quantities are in stock units. Only documents you may read are counted.", "الكميات بوحدة المخزون. تُحتسب فقط المستندات التي يحق لك قراءتها.")}</p>
      </Section>
      {direct.length > 0 && <Section title={t("Orders without a material request", "أوامر شراء بلا طلب مواد")}>
        <DataTable<(typeof direct)[number] & Record<string, unknown>> rows={direct as ((typeof direct)[number] & Record<string, unknown>)[]} rowKey={(r) => `${r.name}|${r.row}`} empty="—" cols={[
          { key: "name", label: t("Purchase order", "أمر الشراء"), render: (r) => refLink(r) },
          { key: "item_code", label: t("Item", "الصنف"), render: (r) => <span data-no-i18n>{String(get("Item", r.item_code)?.["item_name"] ?? r.item_code)}</span> },
          { key: "party", label: t("Supplier", "المورّد"), render: (r) => <span data-no-i18n>{String(get("Supplier", r.party)?.["supplier_name"] ?? r.party)}</span> },
          { key: "qty", label: t("Ordered", "بأوامر شراء"), kind: "num" }, { key: "received", label: t("Received", "المستلم"), kind: "num" },
          { key: "date", label: t("Delivery", "التوريد"), render: (r) => <span data-no-i18n>{dateTxt(r.date)}</span> },
        ]} />
      </Section>}
    </div>
  );
}

// ---------------------------------------------------------------- MAT-01 / PRO-EXT-08
export function MaterialPositionPage(_: PluginPageProps) {
  const { t, ar } = useCx();
  useScopeMetas(NATIVE);
  const { str, set } = useUrl("proc/materials");
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const projects = constructionProjects();
  const project = projects.some((p) => p.name === str("project")) ? str("project") : "";
  const asOf = /^\d{4}-\d{2}-\d{2}$/.test(str("as_of")) ? str("as_of") : "";
  const title = t("Project material position", "موقف مواد المشروع");
  const crumbs = [{ label: t("Procurement & materials", "المشتريات والمواد"), to: "dept/proc" }];
  const head = (
    <Filters>
      <ProjectPick value={project} onChange={(v) => set({ project: v, item: "" })} />
      <Field label={t("As of (empty = all dates)", "حتى تاريخ (فارغ = كل التواريخ)")}><DateInput className={inputCls} value={asOf} max={today()} data-plan-filter="as_of" onChange={(e) => set({ as_of: e.target.value })} /></Field>
    </Filters>
  );
  if (!project) return (
    <div className="w-full min-w-0" data-page="construction-material-position">
      <PageHeader title={title} crumbs={crumbs} subtitle={t("What was ordered, received, returned, issued and is on hand, by item and warehouse.", "ما طُلب واستُلم وأُرجع وصُرف وما هو متاح، حسب الصنف والمستودع.")} />
      {head}
      <Empty>{projects.length ? t("Select a project to see its materials.", "اختر مشروعًا لعرض مواده.") : t("No construction projects you can read.", "لا توجد مشاريع مقاولات يمكنك قراءتها.")}</Empty>
    </div>
  );
  const pos = materialPosition(project, asOf || undefined);
  const item = str("item");
  const plan = procurementPlan(project);
  const rep = (name: string) => reportLink(name, { project, as_of: asOf || undefined });
  // phase 4 C4-08: one row per item (▸ expands its warehouses) or the original item × warehouse rows; each row has السجل / المواقع / التوقع
  const by = str("by") === "wh" ? "wh" : "item";
  const act = str("act") === "locations" || str("act") === "forecast" ? str("act") : "";
  const history = (code: string) => { set({ item: code, act: "" }); setTimeout(() => document.querySelector("[data-position-flow]")?.scrollIntoView({ block: "start", behavior: "smooth" }), 60); };
  const actions: Col<PositionRow & Record<string, unknown>> = { key: "actions", label: t("Row actions", "إجراءات السطر"), render: (r) => <span className="inline-flex gap-0.5" data-position-actions={r.item_code}>
    <button type="button" className={`${BTN.compact} px-1.5 text-[11px]`} data-position-act="history" onClick={() => history(r.item_code)}>{t("History", "السجل")}</button>
    <button type="button" className={`${BTN.compact} px-1.5 text-[11px]`} data-position-act="locations" onClick={() => set({ item: r.item_code, act: "locations" })}>{t("Locations", "المواقع")}</button>
    <button type="button" className={`${BTN.compact} px-1.5 text-[11px]`} data-position-act="forecast" onClick={() => set({ item: r.item_code, act: "forecast" })}>{t("Forecast", "التوقع")}</button>
  </span> };
  const toggle = (k: string) => setOpen((x) => { const n = new Set(x); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const cols: Col<PositionRow & Record<string, unknown>>[] = [
    ...(by === "item" ? [{ key: "expand", label: "", render: (r: PositionRow & Record<string, unknown>) => <button type="button" className="min-h-8 min-w-8 rounded-md text-base leading-none hover:bg-accent" aria-expanded={open.has(r.key)} aria-label={t(`Warehouses of ${r.item_name}`, `مستودعات ${r.item_name}`)} data-position-expand={r.item_code} onClick={() => toggle(r.key)}><span aria-hidden className={`inline-block transition-transform ${open.has(r.key) ? "rotate-90" : ar ? "rotate-180" : ""}`}>▸</span></button> }] : []),
    { key: "item", label: t("Item", "الصنف"), render: (r) => <button type="button" className="text-start text-primary hover:underline" aria-expanded={item === r.item_code} data-position-item={r.item_code} onClick={() => set({ item: item === r.item_code ? "" : r.item_code })}><div data-no-i18n>{r.item_name}</div><div className="text-xs text-muted-foreground" data-no-i18n>{r.item_code}</div></button> },
    { key: "warehouse", label: t("Warehouse", "المستودع"), render: (r) => { const ws = (r as unknown as ItemPositionRow).warehouses; return by === "item" && ws ? <span data-no-i18n>{ws.length === 1 ? ws[0]!.warehouse : t(`${ws.length} warehouses`, `${ws.length} مستودعات`)}</span> : <span data-no-i18n>{r.warehouse}</span>; } },
    { key: "uom", label: t("Unit", "الوحدة"), render: (r) => <span data-no-i18n>{uomLabel(r.uom, ar)}</span> },
    { key: "received", label: t("Received", "المستلم"), kind: "num" }, { key: "returned", label: t("Returned", "المرتجع"), kind: "num" },
    { key: "issued", label: t("Issued to work", "المصروف للأعمال"), kind: "num" }, { key: "transfers", label: t("Net transfers", "صافي التحويلات"), kind: "num" },
    { key: "on_hand", label: t("On hand", "المتاح"), render: (r) => <span data-no-i18n className={`tabular-nums ${r.on_hand < 0 ? "text-destructive" : ""}`}>{qty(r.on_hand)}</span>, align: "end" },
    { key: "issued_value", label: t("Consumption valuation", "تقييم الاستهلاك"), kind: "money", total: true },
    actions,
  ];
  const byItem = positionByItem(pos.rows);
  const whTable = (r: ItemPositionRow) => <table className="w-full text-xs" data-position-warehouses={r.item_code}><thead><tr className="text-muted-foreground"><th className="py-1 text-start font-semibold">{t("Warehouse", "المستودع")}</th><th className="py-1 text-end font-semibold">{t("Received", "المستلم")}</th><th className="py-1 text-end font-semibold">{t("Returned", "المرتجع")}</th><th className="py-1 text-end font-semibold">{t("Issued to work", "المصروف للأعمال")}</th><th className="py-1 text-end font-semibold">{t("Net transfers", "صافي التحويلات")}</th><th className="py-1 text-end font-semibold">{t("On hand", "المتاح")}</th></tr></thead>
    <tbody>{r.warehouses.map((w) => <tr key={w.key} className="border-t border-border/60" data-position-wh={w.warehouse}><td className="py-1" data-no-i18n>{w.warehouse}</td>{[w.received, w.returned, w.issued, w.transfers].map((v, i) => <td key={i} className="py-1 text-end tabular-nums" data-no-i18n>{qty(v)}</td>)}<td className={`py-1 text-end font-semibold tabular-nums ${w.on_hand < 0 ? "text-destructive" : ""}`} data-no-i18n>{qty(w.on_hand)}</td></tr>)}</tbody></table>;
  const actItem = act && item ? (byItem.find((r) => r.item_code === item) ?? null) : null;
  const projectWh = new Set(pos.rows.map((r) => r.warehouse));
  const locs = actItem && act === "locations" ? itemLocations(item, projectWh, asOf || undefined) : [];
  const fc = actItem && act === "forecast" ? itemForecast(project, item, pos) : null;
  const measure = POSITION_MEASURES.find((x) => x === str("measure"));
  const self = (k: PositionMeasure) => `proc/materials?${new URLSearchParams(Object.entries({ project, as_of: asOf, item, measure: measure === k ? "" : k }).filter(([, v]) => v) as [string, string][]).toString()}`;
  const MEASURE_LABEL: Record<PositionMeasure, string> = { ordered: t("Ordered value", "قيمة أوامر الشراء"), received: t("Received value", "قيمة المستلم"), issued: t("Consumption valuation", "تقييم الاستهلاك"), invoiced: t("Invoiced material cost", "تكلفة المواد المفوترة") };
  const srcCols: Col<StripSource & Record<string, unknown>>[] = [
    { key: "name", label: t("Source document", "المستند المصدر"), render: (r) => <DocRef doctype={r.doctype} name={r.name} row={formatRowAnchor(r.table, r.row)} /> },
    { key: "row", label: t("Row", "السطر"), render: (r) => <span data-no-i18n>#{r.row}</span> },
    { key: "date", label: t("Date", "التاريخ"), render: (r) => <span data-no-i18n>{dateTxt(r.date)}</span> },
    { key: "item_code", label: t("Item", "الصنف"), render: (r) => <span data-no-i18n>{String(get("Item", r.item_code)?.["item_name"] ?? r.item_code)}</span> },
    { key: "qty", label: t("Quantity", "الكمية"), kind: "num" },
    { key: "value", label: t("Value", "القيمة"), kind: "money", total: true },
  ];
  const sel = item ? { lines: plan.filter((l) => l.item_code === item), moves: pos.movements.filter((m) => m.item_code === item) } : null;
  return (
    <div className="w-full min-w-0" data-page="construction-material-position" data-project={project}>
      <PageHeader title={title} crumbs={crumbs}
        subtitle={t("Measures are shown separately on purpose: ordered and received values, the stock-ledger valuation of what was issued, and the invoiced material cost are different things and are never added into one actual.", "تُعرض المقاييس منفصلة عمدًا: قيم الطلب والاستلام، وتقييم المصروف من دفتر المخزون، وتكلفة المواد المفوترة أمور مختلفة ولا تُجمع في رقم فعلي واحد.")}
        actions={<><AppLink to={`proc/plan?project=${encodeURIComponent(project)}`} className={BTN.secondary}>{t("Procurement plan", "خطة المشتريات")}</AppLink><AppLink to={rep("Project Material Movements")} className={BTN.secondary}>{t("Stock movements", "حركات المخزون")}</AppLink></>} />
      {head}
      <p className="mb-2 text-sm" data-no-i18n>{projectTitle(get("Project", project)!, !ar)} · {asOf ? `${t("As of", "حتى")} ${dateTxt(asOf)}` : t("All dates", "كل التواريخ")}</p>
      <KpiGrid>
        <Kpi label={t("Ordered value (stock items)", "قيمة أوامر الشراء (مخزنية)")} value={compact(pos.strips.ordered_value, ar)} hint={t("submitted purchase orders", "أوامر شراء معتمدة")} to={self("ordered")} tone={measure === "ordered" ? "info" : "default"} />
        <Kpi label={t("Received value", "قيمة المستلم")} value={compact(pos.strips.received_value, ar)} hint={t("purchase receipts, net of returns", "الاستلامات بعد المرتجعات")} to={self("received")} tone={measure === "received" ? "info" : "default"} />
        <Kpi label={t("Consumption valuation", "تقييم الاستهلاك")} value={compact(pos.strips.issued_value, ar)} hint={t("stock ledger, not GL cost", "من دفتر المخزون وليس تكلفة دفترية")} to={self("issued")} tone={measure === "issued" ? "info" : "default"} />
        <Kpi label={t("Invoiced material cost", "تكلفة المواد المفوترة")} value={compact(pos.strips.invoiced_cost, ar)} hint={t("submitted purchase invoices", "فواتير المشتريات المعتمدة")} to={self("invoiced")} tone={measure === "invoiced" ? "info" : "default"} />
        <Kpi label={t("Lines on hand", "سطور متاحة")} value={String(pos.strips.on_hand_lines)} />
      </KpiGrid>
      <DistributionBar title={t("Material position", "موقف المواد")} footer={t("Separate measures shown side by side, not one actual.", "مقاييس منفصلة متجاورة، وليست رقمًا فعليًا واحدًا.")} segments={[
        { key: "ordered", label: t("Ordered", "مطلوب شراؤه"), value: pos.strips.ordered_value, display: compact(pos.strips.ordered_value, ar), hue: "blue", to: self("ordered"), active: measure === "ordered" },
        { key: "received", label: t("Received", "مستلم"), value: pos.strips.received_value, display: compact(pos.strips.received_value, ar), hue: "teal", to: self("received"), active: measure === "received" },
        { key: "issued", label: t("Issued", "مصروف"), value: pos.strips.issued_value, display: compact(pos.strips.issued_value, ar), hue: "amber", to: self("issued"), active: measure === "issued" },
        { key: "invoiced", label: t("Invoiced", "مفوتر"), value: pos.strips.invoiced_cost, display: compact(pos.strips.invoiced_cost, ar), hue: "emerald", to: self("invoiced"), active: measure === "invoiced" },
      ]} />
      {measure && <Section id="position-sources" title={<span>{MEASURE_LABEL[measure]} — {t("source rows", "الصفوف المصدر")}</span>} actions={<AppLink to={self(measure)} className={BTN.compact}>{t("Close", "إغلاق")}</AppLink>}>
        <div data-position-sources={measure}>
          <DataTable<StripSource & Record<string, unknown>> rows={pos.sources[measure] as (StripSource & Record<string, unknown>)[]} cols={srcCols} rowKey={(r, i) => `${r.name}|${r.row}|${i}`} empty={t("No source rows for this measure.", "لا توجد صفوف مصدر لهذا المقياس.")} pageSize={30} />
        </div>
      </Section>}
      {pos.exceptions.length > 0 && <Section title={t("Material exceptions", "استثناءات المواد")}>
        <ul className="divide-y divide-border text-sm" data-position-exceptions>
          {pos.exceptions.map((e, i) => <li key={`${e.code}-${e.name}-${e.row}-${i}`} className="flex flex-wrap items-center gap-2 py-1.5">
            <Chip tone={e.code === "NEGATIVE_BALANCE" || e.code === "UNMATCHED_INVOICE" ? "bg-destructive/10 text-destructive" : "bg-warning/15 text-warning"}>{ar ? PFLAG[e.code][1] : PFLAG[e.code][0]}</Chip>
            {e.name ? <DocRef doctype={e.doctype} name={e.name} row={e.row ? formatRowAnchor(e.table || "items", e.row) : undefined} /> : null}
            <span data-no-i18n>{String(get("Item", e.item_code)?.["item_name"] ?? e.item_code)}</span>
            <span className="text-xs text-muted-foreground" data-no-i18n>{qty(e.qty)} · {ar ? PFLAG[e.code][3] : PFLAG[e.code][2]}</span>
          </li>)}
        </ul>
      </Section>}
      <Section title={t("Position by item and warehouse", "الموقف حسب الصنف والمستودع")} actions={<div className="inline-flex rounded-full border border-border p-0.5" role="group" aria-label={t("Rows", "الصفوف")}>
          {(["item", "wh"] as const).map((k) => <button key={k} type="button" aria-pressed={by === k} className={`rounded-full px-3 py-1 text-xs ${by === k ? "bg-primary text-primary-foreground" : "hover:bg-accent"}`} data-position-by={k} onClick={() => set({ by: k === "wh" ? "wh" : "" })}>{k === "item" ? t("By item", "حسب الصنف") : t("Item × warehouse", "الصنف × المستودع")}</button>)}
        </div>}>
        {by === "item"
          ? <DataTable<PositionRow & Record<string, unknown>> rows={byItem as unknown as (PositionRow & Record<string, unknown>)[]} cols={cols} rowKey={(r) => r.key} empty={t("No stock movements for this project yet.", "لا توجد حركات مخزون لهذا المشروع بعد.")}
              expand={{ open: (r) => open.has(r.key), render: (r) => whTable(r as unknown as ItemPositionRow) }} />
          : <DataTable<PositionRow & Record<string, unknown>> rows={pos.rows as (PositionRow & Record<string, unknown>)[]} cols={cols} rowKey={(r) => r.key} empty={t("No stock movements for this project yet.", "لا توجد حركات مخزون لهذا المشروع بعد.")} />}
        <p className="mt-2 text-xs text-muted-foreground">{t("On hand = receipts − returns − issues ± transfers of this project's stock-ledger rows. Select an item to see its flow.", "المتاح = الاستلام − المرتجع − المصروف ± التحويلات من حركات دفتر المخزون لهذا المشروع. اختر صنفًا لعرض مساره.")}</p>
      </Section>
      {sel && <Section title={<span data-no-i18n>{t("Flow of", "مسار")} {String(get("Item", item)?.["item_name"] ?? item)}</span>} actions={<button type="button" className={BTN.compact} onClick={() => set({ item: "" })}>{t("Close", "إغلاق")}</button>}>
        <div className="grid gap-4 lg:grid-cols-2" data-position-flow={item}>
          <div>
            <h3 className="mb-1 text-xs font-semibold text-muted-foreground">{t("Request → order → receipt → invoice", "طلب ← أمر شراء ← استلام ← فاتورة")}</h3>
            {sel.lines.length ? <ul className="space-y-1 text-sm">{sel.lines.map((l) => <li key={l.key} className="flex flex-wrap items-center gap-1.5"><DocRef doctype="Material Request" name={l.mr} row={formatRowAnchor("items", l.mr_row)} /><span aria-hidden>→</span>{l.orders.map(refLink)}{l.orders.length ? <span aria-hidden>→</span> : null}{l.receipts.map(refLink)}{l.receipts.length ? <span aria-hidden>→</span> : null}{l.invoices.map(refLink)}<Chip tone={STAGE_TONE[l.stage]}>{ar ? STAGE_AR[l.stage] : l.stage}</Chip></li>)}</ul> : <p className="text-sm text-muted-foreground">{t("No material request line for this item (ordered directly or moved in).", "لا يوجد سطر طلب مواد لهذا الصنف (طُلب مباشرة أو نُقل).")}</p>}
          </div>
          <div>
            <h3 className="mb-1 text-xs font-semibold text-muted-foreground">{t("Stock ledger", "دفتر المخزون")}</h3>
            <table className="w-full text-xs"><tbody>{sel.moves.map((m) => <Fragment key={m.sle}><tr className="border-b border-border/60"><td className="py-1" data-no-i18n>{dateTxt(m.posting_date)}</td><td className="py-1"><DocRef doctype={m.voucher_type} name={m.voucher_no} row={formatRowAnchor(m.table, m.row)} /></td><td className="py-1" data-no-i18n>{m.warehouse}</td><td className={`py-1 text-end tabular-nums ${m.qty < 0 ? "text-destructive" : ""}`} data-no-i18n>{qty(m.qty)}</td></tr></Fragment>)}</tbody></table>
          </div>
        </div>
      </Section>}
      <EntDrawer open={!!actItem} onOpenChange={(o) => { if (!o) set({ act: "" }); }} id="position-row-action" size="md"
        title={<span data-no-i18n>{act === "locations" ? t("Locations", "المواقع") : t("Forecast", "التوقع")} · {actItem?.item_name ?? item}</span>}
        kicker={<span data-no-i18n>{item} · {uomLabel(actItem?.uom ?? "", ar)}</span>}>
        {act === "locations" && <div data-position-locations={item}>
          <p className="mb-2 text-xs text-muted-foreground">{t("Stock-ledger balance of this item in every warehouse you may read; this project's warehouses first.", "رصيد الصنف من دفتر المخزون في كل مستودع يمكنك قراءته؛ مستودعات هذا المشروع أولًا.")}</p>
          {locs.length ? <table className="w-full text-sm"><thead><tr className="text-xs text-muted-foreground"><th className="py-1 text-start font-semibold">{t("Warehouse", "المستودع")}</th><th className="py-1 text-end font-semibold">{t("Balance", "الرصيد")}</th><th className="py-1 text-end font-semibold">{t("Last movement", "آخر حركة")}</th></tr></thead>
            <tbody>{locs.map((l) => <tr key={l.warehouse} className="border-t border-border/60" data-location={l.warehouse}><td className="py-1.5"><span data-no-i18n>{l.warehouse}</span>{l.project && <span className="ms-2 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] text-primary">{t("this project", "هذا المشروع")}</span>}</td><td className={`py-1.5 text-end font-semibold tabular-nums ${l.qty < 0 ? "text-destructive" : ""}`} data-no-i18n>{qty(l.qty)}</td><td className="py-1.5 text-end text-xs" data-no-i18n>{dateTxt(l.last)}</td></tr>)}</tbody></table>
            : <Empty>{t("No stock-ledger rows for this item.", "لا توجد حركات مخزون لهذا الصنف.")}</Empty>}
        </div>}
        {act === "forecast" && fc && <div data-position-forecast={item}>
          <dl className="grid grid-cols-2 gap-2 text-sm">
            {([["requested", t("Requested (active requests)", "المطلوب (طلبات نشطة)"), fc.requested], ["ordered", t("Ordered", "صدرت به أوامر شراء"), fc.ordered], ["received", t("Received net of returns", "المستلم بعد المرتجع"), fc.received], ["issued", t("Issued to work", "المصروف للأعمال"), fc.issued],
              ["pending_order", t("Still to order", "باقٍ للطلب"), fc.pending_order], ["pending_receipt", t("Still to receive", "باقٍ للاستلام"), fc.pending_receipt], ["on_hand", t("On hand now", "المتاح الآن"), fc.on_hand], ["projected", t("Projected on hand after open orders", "المتاح المتوقع بعد وصول الأوامر المفتوحة"), fc.projected_on_hand]] as [string, string, number][])
              .map(([k, l, v]) => <div key={k} className="rounded-lg border border-border p-2" data-forecast={k}><dt className="text-xs text-muted-foreground">{l}</dt><dd className={`text-base font-semibold tabular-nums ${v < 0 ? "text-destructive" : ""}`} data-no-i18n>{qty(v)}</dd></div>)}
          </dl>
          <p className="mt-3 text-sm" data-forecast="next">{fc.next_delivery ? <>{t("Next expected delivery", "التوريد المتوقع التالي")}: <b data-no-i18n>{dateTxt(fc.next_delivery)}</b></> : t("No open delivery expected.", "لا يوجد توريد مفتوح متوقع.")}</p>
          {fc.late_lines > 0 && <p className="mt-1 text-sm text-destructive" data-forecast="late">{t(`${fc.late_lines} request line(s) late to order or deliver`, `${fc.late_lines} سطر طلب متأخر في الطلب أو التوريد`)}</p>}
          <p className="mt-2 text-xs text-muted-foreground">{t(`From ${fc.lines} material request line(s) and ${fc.direct} direct order line(s). Projected = on hand + still to receive; it is a quantity outlook, not a cost.`, `من ${fc.lines} سطر طلب مواد و${fc.direct} سطر أمر شراء مباشر. المتوقع = المتاح + الباقي للاستلام؛ وهو توقع كميات وليس تكلفة.`)}</p>
          <div className="mt-3"><AppLink to={`proc/plan?project=${encodeURIComponent(project)}`} className={BTN.secondary}>{t("Open the procurement plan", "فتح خطة المشتريات")}</AppLink></div>
        </div>}
      </EntDrawer>
      {!pos.rows.length && !pos.exceptions.length && <Note>{t("Nothing has been received or issued for this project yet.", "لم يُستلم أو يُصرف شيء لهذا المشروع بعد.")}</Note>}
    </div>
  );
}
