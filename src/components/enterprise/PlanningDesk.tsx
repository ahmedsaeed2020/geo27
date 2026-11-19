/**
 * DIGIT Enterprise shared planning and analysis screens (Part B): demand forecast (CF-09), wave / batch picking (CF-10),
 * cross-dock plan (CF-12), close bottlenecks + sign-off (CF-18), visual query studio (CF-19) and emissions (CF-06).
 * Logic lives in src/lib/coreShared (stockPlanning.ts, closeControls.ts, queryStudio.ts, emissions.ts).
 */
import { useMemo, useState } from "react";
import { DateInput } from "@/components/form/DateInput";
import { translateTo } from "@/i18n";
import { toast } from "sonner";
import { adapter, useStoreVersion } from "@/lib/adapter";
import { cachedMeta, ensureMetas } from "@/lib/catalog";
import { canReadType, useScopeMetas } from "@/lib/scope";
import { hasPerm, useSessionUser } from "@/lib/session";
import * as SP from "@/lib/coreShared/stockPlanning";
import * as CL from "@/lib/coreShared/closeControls";
import * as QS from "@/lib/coreShared/queryStudio";
import * as EM from "@/lib/coreShared/emissions";
import { CORE_DT } from "@/lib/coreShared/doctypes";
import { Columns, Donut, RankedBars, Spark } from "./kit/charts";
import { PageBlocks, pageDashboard } from "@/components/dashboards/PageBlocks";
import { CustomizeButton } from "./kit/templates";
import { EntFrame } from "./Surfaces";
import { NewDocLink, TableExport, Bar, CompanySelect, Denied, DocLink, Field, Kpi, ListLink, Table, money, pick, today, tr, useCompany, useT } from "./FinanceDesk";

const s = (v: unknown) => String(v ?? "");
const n = (v: unknown) => Number(v) || 0;

/* ------------------------------------------------------------------ CF-09 demand forecast ------------------------------------------------------------------ */
export function DemandForecastPage() {
  const ver = useStoreVersion(); const { ar, t } = useT(); const c = useCompany(); const user = useSessionUser();
  useScopeMetas(["Item", "Warehouse", "Stock Ledger Entry", "Material Request", "Purchase Order", "Sales Order"]);
  const [qty, setQty] = useState<Record<string, number>>({}); const [sel, setSel] = useState<Record<string, boolean>>({}); const [onlySuggest, setOnly] = useState(true);
  const all = useMemo(() => SP.forecastRows(c.company), [c.company, ver]);
  if (!canReadType("Stock Ledger Entry")) return <Denied />;
  const rows = all.filter((r) => !onlySuggest || r.suggest > 0); const key = (r: SP.ForecastRow) => `${r.item}\u0000${r.warehouse}`;
  const mr = cachedMeta("Material Request"); const canMr = !!mr && hasPerm(mr, "create", undefined, user);
  const create = () => { const picks = all.filter((r) => sel[key(r)]).map((r) => ({ item: r.item, warehouse: r.warehouse, qty: qty[key(r)] ?? r.suggest })); const res = SP.requestFromForecast(c.company, picks, user);
    if (res.ok) { setSel({}); toast.success(t(`Draft material request ${res.name} prepared.`, `جُهز طلب المواد ${res.name}.`)); } else toast.error(pick(ar, res.reason)); };
  return <div className="space-y-3" data-forecast-page={all.length}>
    <Bar><CompanySelect c={c} /><label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={onlySuggest} onChange={(e) => setOnly(e.target.checked)} data-forecast-only />{t("Only items to reorder", "الأصناف المطلوب إعادة طلبها فقط")}</label>
      {canMr && <button type="button" className="btn-primary" disabled={!Object.values(sel).some(Boolean)} data-forecast-create onClick={create}>{t("Create material request", "إنشاء طلب مواد")}</button>}</Bar>
    <div className="flex flex-wrap gap-2"><Kpi id="fc-items" label={t("Items forecast", "أصناف متنبأ بها")} value={String(all.length)} /><Kpi id="fc-reorder" label={t("To reorder now", "إعادة طلب الآن")} value={String(all.filter((r) => r.suggest > 0).length)} {...(all.some((r) => r.suggest > 0) ? { tone: "bad" } : {})} /></div>
    <EntFrame id="forecast-rows" title={t("Demand forecast and replenishment", "التنبؤ بالطلب وإعادة التزويد")} note={t("Next month's demand by smoothing 12 months of outflow; safety stock for 95 % service over the lead time; the suggestion brings the projected quantity back above the reorder point plus one month.", "طلب الشهر القادم بتمهيد صرف 12 شهرًا؛ مخزون أمان لمستوى خدمة 95٪ خلال مهلة التوريد؛ والاقتراح يعيد الكمية المتوقعة فوق نقطة إعادة الطلب زائد شهر.")}>
      {rows.length ? <div className="max-h-[32rem] overflow-auto"><Table id="forecast-table" head={["", t("Item", "الصنف"), t("Warehouse", "المستودع"), t("12 months", "12 شهرًا"), t("Forecast / month", "التنبؤ / شهر"), t("Reorder point", "نقطة إعادة الطلب"), t("Projected", "المتوقع"), t("Suggest", "المقترح")]}>
        {rows.map((r) => <tr key={key(r)} className={tr} data-forecast-row={r.item} title={pick(ar, r.why)}>
          <td className="p-2"><input type="checkbox" disabled={!r.suggest && !qty[key(r)]} checked={!!sel[key(r)]} onChange={(e) => setSel({ ...sel, [key(r)]: e.target.checked })} /></td>
          <td className="p-2 text-xs"><DocLink dt="Item" name={r.item}>{r.itemName}</DocLink></td><td className="p-2 text-xs" data-no-i18n>{r.warehouse}</td>
          <td className="p-2 w-28"><Spark values={r.history.map((h) => h.qty)} height={22} /></td><td className="p-2 tabular-nums" data-no-i18n>{r.forecast}</td><td className="p-2 tabular-nums" data-no-i18n>{r.reorderPoint}</td>
          <td className={`p-2 tabular-nums ${r.projected < r.reorderPoint ? "text-destructive" : ""}`} data-no-i18n>{r.projected}</td>
          <td className="p-2"><input type="number" min={0} className="field-input w-20" value={qty[key(r)] ?? r.suggest} onChange={(e) => setQty({ ...qty, [key(r)]: Number(e.target.value) })} /></td></tr>)}
      </Table></div> : <p className="text-sm text-muted-foreground" data-forecast-empty>{t("Nothing to reorder: every projected quantity is above its reorder point.", "لا شيء لإعادة طلبه: كل الكميات المتوقعة فوق نقطة إعادة الطلب.")}</p>}
    </EntFrame>
  </div>;
}

/* ------------------------------------------------------------------ CF-10 wave picking ------------------------------------------------------------------ */
export function WavePickingPage() {
  useStoreVersion(); const { ar, t } = useT(); const c = useCompany(); const user = useSessionUser();
  useScopeMetas(["Sales Order", "Pick List", "Item", "Warehouse"]);
  const [days, setDays] = useState(7); const [cur, setCur] = useState(""); const [off, setOff] = useState<Record<string, boolean>>({});
  if (!canReadType("Sales Order")) return <Denied />;
  const ws = SP.waves(c.company, days); const w = ws.find((x) => x.key === cur) ?? ws[0];
  const pl = cachedMeta("Pick List"); const canPick = !!pl && hasPerm(pl, "create", undefined, user);
  const open = adapter.list("Pick List").filter((p) => s(p["company"]) === c.company && n(p.docstatus) === 0).slice(0, 8);
  const make = () => { if (!w) return; const r = SP.pickWave(c.company, w.lines.filter((l) => !off[l.orderItem]), user); if (r.ok) toast.success(t(`Batch pick list ${r.name} prepared.`, `جُهزت قائمة الانتقاء ${r.name}.`)); else toast.error(pick(ar, r.reason)); };
  return <div className="space-y-3" data-wave-page={ws.length}>
    <Bar><CompanySelect c={c} /><button type="button" className="btn-primary" data-band-primary data-wave-pick disabled={!w || !canPick} title={!canPick ? t("Your role may not create pick lists", "لا يسمح دورك بإنشاء قوائم الانتقاء") : !w ? t("No wave is due in this window", "لا توجد موجة مستحقة في هذه المدة") : undefined} onClick={make}>{t("Create batch pick list", "إنشاء قائمة انتقاء مجمعة")}</button><Field label={t("Due within", "مستحق خلال")}><select className="field-input" value={days} onChange={(e) => setDays(Number(e.target.value))} data-wave-days>{[1, 3, 7, 14].map((d) => <option key={d} value={d}>{ar ? `${d} يوم` : `${d} days`}</option>)}</select></Field></Bar>
    <div className="flex flex-wrap gap-2" data-wave-kpis>
      <Kpi id="wave-count" label={t("Picking waves", "موجات الانتقاء")} value={String(ws.length)} />
      <Kpi id="wave-lines" label={t("Order lines due", "سطور طلبات مستحقة")} value={String(ws.reduce((a, x) => a + x.lines.length, 0))} />
      <Kpi id="wave-orders" label={t("Orders to pick", "طلبات للانتقاء")} value={String(ws.reduce((a, x) => a + x.orders, 0))} />
      <Kpi id="wave-drafts" label={t("Draft pick lists", "قوائم انتقاء مسودة")} value={String(open.length)} />
    </div>
    <div className="grid gap-3 lg:grid-cols-2">
      <EntFrame id="wave-list" title={t("Picking waves", "موجات الانتقاء")} note={t("Order lines to deliver, grouped by warehouse and day; one batch pick list picks each item once for all orders of the wave.", "سطور الطلبات المطلوب تسليمها مجمعة حسب المستودع واليوم؛ قائمة انتقاء واحدة تنتقي كل صنف مرة واحدة لكل طلبات الموجة.")}>
        {ws.length ? <ul className="space-y-1" data-wave-list>{ws.map((x) => <li key={x.key}><button type="button" data-wave={x.key} onClick={() => { setCur(x.key); setOff({}); }} className={`w-full rounded-md border border-border p-2 text-start text-sm ${w?.key === x.key ? "bg-muted" : ""}`}>
          <span className="block font-medium" data-no-i18n>{x.warehouse} · {x.due}</span><span className="text-xs text-muted-foreground">{ar ? `${x.orders} طلب · ${x.lines.length} سطر · ${x.items.length} صنف` : `${x.orders} orders · ${x.lines.length} lines · ${x.items.length} items`}</span></button></li>)}</ul>
          : <p className="text-sm text-muted-foreground" data-wave-empty>{t("No order lines are due in this window.", "لا توجد سطور طلبات مستحقة في هذه الفترة.")}</p>}
        {open.length > 0 && <p className="mt-3 text-xs text-muted-foreground">{t("Draft pick lists", "قوائم انتقاء مسودة")}: {open.map((p) => <span key={p.name} className="me-2"><DocLink dt="Pick List" name={p.name} /></span>)}</p>}
      </EntFrame>
      <EntFrame id="wave-lines" title={w ? <span data-no-i18n>{w.warehouse} · {w.due}</span> : t("Wave", "الموجة")}>
        {w ? <><div className="mb-2 flex flex-wrap gap-1 text-xs" data-wave-items>{w.items.map((i) => <span key={i.item} className="ek-chip" data-no-i18n>{i.item} × {i.qty}</span>)}</div>
          <div className="max-h-[24rem] overflow-auto"><Table id="wave-line-rows" head={["", t("Order", "الطلب"), t("Customer", "العميل"), t("Item", "الصنف"), t("Qty", "الكمية"), t("In stock", "المتوفر")]}>
            {w.lines.map((l) => <tr key={l.orderItem} className={tr} data-wave-line={l.orderItem}><td className="p-2"><input type="checkbox" checked={!off[l.orderItem]} onChange={(e) => setOff({ ...off, [l.orderItem]: !e.target.checked })} /></td>
              <td className="p-2 text-xs"><DocLink dt="Sales Order" name={l.order} /></td><td className="p-2 text-xs" data-no-i18n>{s(adapter.get("Customer", l.customer)?.["customer_name"]) || l.customer}</td><td className="p-2 text-xs" data-no-i18n>{l.itemName}</td>
              <td className="p-2 tabular-nums" data-no-i18n>{l.qty}</td><td className={`p-2 tabular-nums ${l.available < l.qty ? "text-destructive" : ""}`} data-no-i18n>{l.available}</td></tr>)}
          </Table></div></> : <p className="text-sm text-muted-foreground">{t("Choose a wave.", "اختر موجة.")}</p>}
      </EntFrame>
    </div>
  </div>;
}

/* ------------------------------------------------------------------ CF-12 cross-dock ------------------------------------------------------------------ */
export function CrossDockPanel({ company }: { company: string }) {
  useStoreVersion(); const { ar, t } = useT(); const user = useSessionUser();
  const plan = SP.crossDockPlan(company); const pl = cachedMeta("Pick List"); const canPick = !!pl && hasPerm(pl, "create", undefined, user);
  return <EntFrame id="cross-dock" title={t("Cross-dock plan", "خطة العبور المباشر")} note={t("Inbound order lines matched to waiting customer orders that stock cannot cover: received goods go straight to dispatch.", "سطور الشراء الواردة مطابقة لطلبات العملاء المنتظرة التي لا يغطيها المخزون: تذهب البضاعة المستلمة مباشرة إلى الشحن.")}>
    {plan.length ? <div className="max-h-[24rem] overflow-auto"><Table id="cross-dock-rows" head={[t("Inbound", "الوارد"), t("Expected", "المتوقع"), t("Item", "الصنف"), t("For order", "للطلب"), t("Due", "الاستحقاق"), t("Qty", "الكمية"), ""]}>
      {plan.map((x, i) => <tr key={`${x.poItem}-${x.orderItem}-${i}`} className={tr} data-cross-dock={x.order} data-ready={x.ready ? 1 : 0}><td className="p-2 text-xs"><DocLink dt="Purchase Order" name={x.po} /></td><td className="p-2 tabular-nums" data-no-i18n>{x.expected}</td>
        <td className="p-2 text-xs"><DocLink dt="Item" name={x.item}>{s(adapter.get("Item", x.item)?.["item_name"]) || x.item}</DocLink></td><td className="p-2 text-xs"><DocLink dt="Sales Order" name={x.order} /></td><td className="p-2 tabular-nums" data-no-i18n>{x.due}</td><td className="p-2 tabular-nums" data-no-i18n>{x.qty}</td>
        <td className="p-2">{x.ready ? (canPick && <button type="button" className="btn-ghost" data-cross-dock-dispatch={x.order} onClick={() => { const r = SP.dispatchCrossDock(company, x, user); if (r.ok) toast.success(t(`Pick list ${r.name} prepared from the dock.`, `جُهزت قائمة الانتقاء ${r.name} من الرصيف.`)); else toast.error(pick(ar, r.reason)); }}>{t("Dispatch from dock", "شحن من الرصيف")}</button>)
          : <span className="ent-qv-status ent-qv-tone-draft">{t("Awaiting receipt", "بانتظار الاستلام")}</span>}</td></tr>)}
    </Table></div> : <p className="text-sm text-muted-foreground" data-cross-dock-empty>{t("No inbound goods are needed straight for a waiting order.", "لا توجد بضاعة واردة مطلوبة مباشرة لطلب منتظر.")}</p>}
  </EntFrame>;
}

/* ------------------------------------------------------------------ CF-18 close bottlenecks + sign-off ------------------------------------------------------------------ */
export function CloseOutlookPanel({ company, periodEnd }: { company: string; periodEnd: string }) {
  useStoreVersion(); const { ar, t } = useT(); const user = useSessionUser(); const [note, setNote] = useState(""); const [reason, setReason] = useState("");
  const o = CL.closeOutlook(company, periodEnd, today()); const signed = o.signedOff && o.signedOff["status"] === "Signed" ? o.signedOff : undefined;
  return <div className="grid gap-3 lg:grid-cols-2" data-close-outlook>
    <EntFrame id="close-bottlenecks" title={t("Where the close is stuck", "أين يتعثر الإقفال")} note={pick(ar, o.why)}>
      <div className="mb-2 flex flex-wrap gap-2"><Kpi id="close-overdue" label={t("Overdue tasks", "مهام متأخرة")} value={String(o.overdue.length)} {...(o.overdue.length ? { tone: "bad" } : {})} /><Kpi id="close-blocked" label={t("Blocked", "متوقفة")} value={String(o.blocked.length)} /><Kpi id="close-finish" label={t("Projected finish", "الإنجاز المتوقع")} value={o.projectedFinish} /></div>
      {o.byOwner.length ? <Table id="close-owners" head={[t("Owner", "المسؤول"), t("Open", "مفتوحة"), t("Overdue", "متأخرة"), t("Days late", "أيام التأخير")]}>
        {o.byOwner.map((b) => <tr key={b.owner} className={tr} data-close-owner={b.owner}><td className="p-2 text-xs" data-no-i18n>{b.owner}</td><td className="p-2 tabular-nums" data-no-i18n>{b.open}</td><td className="p-2 tabular-nums" data-no-i18n>{b.overdue}</td><td className="p-2 tabular-nums" data-no-i18n>{b.daysLate}</td></tr>)}
      </Table> : <p className="text-sm text-muted-foreground">{t("Every close task is done.", "كل مهام الإقفال منجزة.")}</p>}
    </EntFrame>
    <EntFrame id="close-signoff" title={t("Close sign-off", "اعتماد الإقفال")} note={t("An Accounts Manager who did none of the tasks signs the period off once every task is done and the ledger is frozen.", "يعتمد الفترة مدير حسابات لم ينفذ أيًا من المهام بعد إنجاز كل المهام وتجميد الدفتر.")}>
      {signed ? <div className="space-y-2 text-sm" data-close-signed={signed.name}><p>{t("Signed off by", "اعتمده")} <bdi data-no-i18n>{s(signed["signed_by"])}</bdi> · <bdi data-no-i18n>{s(signed["signed_on"])}</bdi></p>
        {s(signed["note"]) && <p className="text-xs text-muted-foreground" data-no-i18n>{s(signed["note"])}</p>}
        <div className="flex flex-wrap gap-2"><input className="field-input" placeholder={t("Reason to reopen", "سبب إعادة الفتح")} value={reason} onChange={(e) => setReason(e.target.value)} />
          <button type="button" className="btn-ghost" data-close-reopen onClick={() => { const r = CL.reopenClose(signed.name, reason, user); if (r.ok) toast.success(t("Close reopened.", "أعيد فتح الإقفال.")); else toast.error(pick(ar, r.reason)); }}>{t("Reopen", "إعادة فتح")}</button></div></div>
        : <div className="space-y-2"><p className="text-sm">{ar ? `${o.done} من ${o.total} مهمة منجزة` : `${o.done} of ${o.total} tasks done`}</p><textarea className="field-input h-16 w-full" placeholder={t("Sign-off note", "ملاحظة الاعتماد")} value={note} onChange={(e) => setNote(e.target.value)} />
          <button type="button" className="btn-primary" data-close-sign onClick={() => { const r = CL.signOffClose(company, periodEnd, note, user); if (r.ok) toast.success(t("The close is signed off.", "اعتُمد الإقفال.")); else toast.error(pick(ar, r.reason)); }}>{t("Sign off the close", "اعتماد الإقفال")}</button></div>}
    </EntFrame>
  </div>;
}

/* ------------------------------------------------------------------ CF-19 query studio ------------------------------------------------------------------ */
const STUDIO_TYPES = ["Sales Invoice", "Purchase Invoice", "Sales Order", "Purchase Order", "Payment Entry", "Journal Entry", "Delivery Note", "Purchase Receipt", "Stock Entry", "Customer", "Supplier", "Item", "Employee", "Asset", "Quotation", "Issue"];
export function QueryStudioPage() {
  useStoreVersion(); const { ar, t } = useT(); const user = useSessionUser();
  const [dt, setDt] = useState("Sales Invoice"); const [cols, setCols] = useState<string[]>([]); const [group, setGroup] = useState(""); const [agg, setAgg] = useState<QS.Agg>("sum"); const [aggField, setAggField] = useState("");
  const [filters, setFilters] = useState<{ field: string; op: string; value: string }[]>([]); const [title, setTitle] = useState("");
  useScopeMetas([dt]); const meta = cachedMeta(dt);
  if (meta) void ensureMetas(meta.fields.filter((f) => f.fieldtype === "Link" && f.options).map((f) => s(f.options)).slice(0, 12));
  const fields = QS.studioFields(dt, user); const numeric = fields.filter((f) => ["Currency", "Float", "Int", "Percent"].includes(f.fieldtype));
  const q: QS.StudioQuery = { doctype: dt, columns: cols, filters: filters.filter((f) => f.field), groupBy: group ? [group] : [], aggregates: group ? [agg === "count" || !aggField ? { fn: "count" } : { fn: agg, field: aggField }] : [], desc: true, limit: 200 };
  const res = meta ? QS.runStudio(q, user) : null; const lastNum = res && res.columns.length >= 2 ? res.columns[res.columns.length - 1]! : null;
  const label = (k: string) => fields.find((f) => f.key === k)?.label ?? k;
  return <div className="space-y-3" data-query-studio>
    <Bar>{res && res.rows.length > 0 && <TableExport id="studio-rows" name={title || "query"}>{t("Export the results", "تصدير النتائج")}</TableExport>}
      <Field label={t("Records", "السجلات")}><select className="field-input" value={dt} onChange={(e) => { setDt(e.target.value); setCols([]); setGroup(""); setAggField(""); setFilters([]); }} data-studio-doctype>{STUDIO_TYPES.filter((x) => canReadType(x, user)).map((x) => <option key={x} value={x}>{x}</option>)}</select></Field>
      <Field label={t("Group by", "التجميع حسب")}><select className="field-input" value={group} onChange={(e) => setGroup(e.target.value)} data-studio-group><option value="">{t("No grouping", "بلا تجميع")}</option>{fields.filter((f) => ["Link", "Select", "Data", "Date"].includes(f.fieldtype) && f.key !== "name").map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}</select></Field>
      {group && <><Field label={t("Total", "الإجمالي")}><select className="field-input" value={agg} onChange={(e) => setAgg(e.target.value as QS.Agg)} data-studio-agg>{(["count", "sum", "avg", "min", "max"] as QS.Agg[]).map((a) => <option key={a} value={a}>{ar ? { count: "العدد", sum: "المجموع", avg: "المتوسط", min: "الأدنى", max: "الأعلى" }[a] : a}</option>)}</select></Field>
        {agg !== "count" && <Field label={t("Of", "لـ")}><select className="field-input" value={aggField} onChange={(e) => setAggField(e.target.value)} data-studio-aggfield><option value="">—</option>{numeric.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}</select></Field>}</>}
    </Bar>
    <div className="flex flex-wrap gap-2" data-studio-kpis>
      <Kpi id="studio-rows" label={t("Records matched", "سجلات مطابقة")} value={String(res?.total ?? 0)} />
      <Kpi id="studio-fields" label={t("Fields you may use", "حقول متاحة لك")} value={String(fields.length)} />
      <Kpi id="studio-filters" label={t("Filters applied", "عوامل التصفية المطبقة")} value={String(filters.filter((f) => f.field).length)} />
      <Kpi id="studio-saved" label={t("Saved studio reports", "تقارير الاستوديو المحفوظة")} value={String(adapter.list("Report").filter((r) => /"digit_query"/.test(String(r["json"] ?? ""))).length)} />
    </div>
    <div className="grid gap-3 lg:grid-cols-3">
      <EntFrame id="studio-fields" title={t("Fields", "الحقول")} note={t("Fields of linked records (›) come from the record they point to, only when you may read it.", "حقول السجلات المرتبطة (›) تأتي من السجل المشار إليه، فقط إذا كان يحق لك قراءته.")}>
        <div className="max-h-[22rem] space-y-1 overflow-auto text-xs" data-studio-field-list>{fields.map((f) => <label key={f.key} className="flex items-center gap-1"><input type="checkbox" checked={cols.includes(f.key)} disabled={!!group} onChange={(e) => setCols(e.target.checked ? [...cols, f.key] : cols.filter((c) => c !== f.key))} data-studio-col={f.key} />{f.label}</label>)}</div>
        <div className="mt-3 space-y-1 border-t border-border pt-2" data-studio-filters>
          <p className="text-xs font-semibold">{t("Filters", "المرشحات")}</p>
          {filters.map((f, i) => <div key={i} className="flex gap-1"><select className="field-input w-28" value={f.field} onChange={(e) => setFilters(filters.map((x, j) => (j === i ? { ...x, field: e.target.value } : x)))}><option value="">—</option>{fields.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}</select>
            <select className="field-input w-16" value={f.op} onChange={(e) => setFilters(filters.map((x, j) => (j === i ? { ...x, op: e.target.value } : x)))}>{["=", "!=", ">", "<", ">=", "<=", "like"].map((o) => <option key={o} value={o}>{o}</option>)}</select>
            <input className="field-input w-24" value={f.value} onChange={(e) => setFilters(filters.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))} data-no-i18n /></div>)}
          <button type="button" className="btn-ghost" onClick={() => setFilters([...filters, { field: "", op: "=", value: "" }])} data-studio-add-filter>{t("Add filter", "إضافة مرشح")}</button>
        </div>
      </EntFrame>
      <div className="space-y-3 lg:col-span-2">
        {res?.error ? <EntFrame id="studio-error" title={t("Cannot run", "تعذر التشغيل")}><p className="text-sm text-destructive">{pick(ar, res.error)}</p></EntFrame> : res && <>
          {group && lastNum && res.rows.length > 0 && <EntFrame id="studio-chart" title={`${lastNum.label} · ${label(group)}`}><Columns ar={ar} data={res.rows.slice(0, 12).map((r) => ({ key: s(r[group]), label: s(r[group]), value: n(r[lastNum.key]) }))} /></EntFrame>}
          <EntFrame id="studio-result" title={t("Result", "النتيجة")} actions={<span className="flex gap-1"><input className="field-input w-40" placeholder={t("Report name", "اسم التقرير")} value={title} onChange={(e) => setTitle(e.target.value)} data-studio-title />
            <button type="button" className="btn-primary" data-studio-save onClick={() => { const r = QS.saveStudio(q, title, user); if (r.ok) toast.success(t(`Saved as report ${r.name}.`, `حُفظ كتقرير ${r.name}.`)); else toast.error(pick(ar, r.reason)); }}>{t("Save as report", "حفظ كتقرير")}</button></span>}>
            <div className="max-h-[26rem] overflow-auto"><Table id="studio-rows" head={res.columns.map((c) => c.label)}>
              {res.rows.map((r, i) => <tr key={i} className={tr} data-studio-row={i}>{res.columns.map((c) => <td key={c.key} className="p-2 text-xs tabular-nums" data-no-i18n>{c.fieldtype === "Currency" ? money(n(r[c.key]), "SAR") : s(r[c.key])}</td>)}</tr>)}
            </Table></div>
          </EntFrame></>}
      </div>
    </div>
  </div>;
}

/* ------------------------------------------------------------------ CF-06 emissions ------------------------------------------------------------------ */
export function SustainabilityPage() {
  useStoreVersion(); const { ar, t } = useT(); const c = useCompany(); const user = useSessionUser();
  useScopeMetas(["Purchase Invoice", "Journal Entry", "Item", "Account", CORE_DT.emissionFactor]);
  const year = today().slice(0, 4); const [from, setFrom] = useState(`${year}-01-01`); const [to, setTo] = useState(today());
  if (!canReadType("Purchase Invoice")) return <Denied />;
  const e = EM.emissions(c.company, from, to); const efMeta = cachedMeta(CORE_DT.emissionFactor);
  // units and month labels in the reader's language; sample factor names ("Purchased goods — <group>") read through the dictionary
  const kgFmt = (v: number) => `${Math.round(v).toLocaleString("en-US")} ${ar ? "كجم" : "kg"}`;
  const monthLbl = (m: string) => new Date(`${m}-01T00:00:00`).toLocaleDateString(ar ? "ar-SA-u-ca-gregory-nu-latn" : "en-GB", { month: "short", year: "2-digit" });
  const srcLbl = (l: string) => { if (!ar) return l; const m = /^Purchased goods — (.+)$/.exec(l); return m ? `سلع مشتراة — ${translateTo(m[1]!, "ar")}` : translateTo(l, "ar"); };
  return <div className="space-y-3" data-sustainability>
    <Bar><CompanySelect c={c} />{efMeta && hasPerm(efMeta, "create", undefined, user) && <NewDocLink dt={CORE_DT.emissionFactor} data-em-factor-new>{t("Add an emission factor", "إضافة معامل انبعاث")}</NewDocLink>}<CustomizeButton ar={ar} /><Field label={t("From", "من")}><DateInput className="field-input" value={from} onChange={(x) => setFrom(x.target.value)} /></Field><Field label={t("To", "إلى")}><DateInput className="field-input" value={to} onChange={(x) => setTo(x.target.value)} /></Field></Bar>
    {e.samples > 0 && <p className="ek-card p-2 text-xs" data-emission-samples={e.samples}>{t(`${e.samples} sample factor(s) are in use: figures are illustrative until Administration enters the factors of your approved methodology.`, `يُستخدم ${e.samples} معامل تجريبي: الأرقام توضيحية حتى تُدخل الإدارة معاملات منهجيتكم المعتمدة.`)} <ListLink drill={{ doctype: CORE_DT.emissionFactor, filters: [] }}>{t("Emission factors", "معاملات الانبعاثات")}</ListLink></p>}
    <PageBlocks def={SUS_DASH()} company={c.company} nodes={{
      kpis: <div className="flex flex-wrap gap-2" data-em-kpis>
        <Kpi id="em-coverage" label={t("Spend covered by a factor", "الإنفاق المغطى بمعامل")} value={`${e.coverage}%`} {...(e.coverage < 60 ? { tone: "bad" } : {})} />
        <Kpi id="em-covered" label={t("Spend with a factor", "إنفاق له معامل")} value={money(e.covered, "SAR")} />
        <Kpi id="em-sources" label={t("Emission sources", "مصادر الانبعاث")} value={String(e.byCategory.length)} />
        <Kpi id="em-suppliers" label={t("Suppliers with emissions", "موردون لهم انبعاثات")} value={String(e.bySupplier.length)} />
        <Kpi id="em-unfactored" label={t("Categories without a factor", "فئات بلا معامل")} value={String(e.unfactored.length)} {...(e.unfactored.length ? { tone: "warn" } : {})} />
      </div>,
      month: <EntFrame id="em-month" title={t("Emissions by month", "الانبعاثات حسب الشهر")}><Columns ar={ar} fmt={kgFmt} data={e.byMonth.map((m) => ({ key: m.month, label: monthLbl(m.month), value: m.kg }))} /></EntFrame>,
      scope: <EntFrame id="em-scope" title={t("Emissions by scope", "الانبعاثات حسب النطاق")} note={t("Centre: estimated total for the period.", "المنتصف: الإجمالي المقدر للفترة.")}><Donut ar={ar} fmt={kgFmt} centerLabel={t("kg CO2e", "كجم مكافئ CO2")} data={(["Scope 1", "Scope 2", "Scope 3"] as const).map((sc) => ({ key: sc, label: ar ? sc.replace("Scope", "النطاق") : sc, value: e.byScope[sc] ?? 0 }))} /></EntFrame>,
      category: <EntFrame id="em-category" title={t("Largest sources", "أكبر المصادر")}><RankedBars ar={ar} fmt={kgFmt} data={e.byCategory.map((x) => ({ key: x.label, label: srcLbl(x.label), value: x.kg }))} /></EntFrame>,
      supplier: <EntFrame id="em-supplier" title={t("By supplier", "حسب المورد")}><RankedBars ar={ar} fmt={kgFmt} data={e.bySupplier.map((x) => ({ key: x.supplier, label: s(adapter.get("Supplier", x.supplier)?.["supplier_name"]) || x.supplier, value: x.kg }))} /></EntFrame>,
      unfactored: <EntFrame id="em-unfactored" title={t("Spend without a factor", "إنفاق بلا معامل")} note={t("Add a factor for these to raise coverage.", "أضف معاملًا لهذه لرفع التغطية.")}>{e.unfactored.length ? <Table id="em-unfactored-rows" head={[t("Category", "الفئة"), t("Spend", "الإنفاق")]}>{e.unfactored.slice(0, 8).map((x) => <tr key={x.label} className={tr}><td className="p-2 text-xs" data-no-i18n>{srcLbl(x.label)}</td><td className="p-2 tabular-nums" data-no-i18n>{money(x.spend, "SAR")}</td></tr>)}</Table>
          : <p className="text-sm text-muted-foreground">{t("All spend has a factor.", "كل الإنفاق له معامل.")}</p>}</EntFrame>,
    }} />
  </div>;
}

/** Sustainability as a page dashboard (owner 2026-11-13: every Part B page to the standard — blocks users adjust in place). */
const SUS_DASH = () => pageDashboard("enterprise", "sustainability", ["Sustainability & emissions", "الاستدامة والانبعاثات"], [
  { id: "kpis", title: ["Coverage of the estimate", "تغطية التقدير"], meaning: ["How much of the period's spend has an emission factor, and how many sources and suppliers the estimate covers.", "نسبة إنفاق الفترة التي لها معامل انبعاث، وعدد المصادر والموردين المشمولين بالتقدير."] },
  { id: "month", title: ["Emissions by month", "الانبعاثات حسب الشهر"], w: 8 },
  { id: "scope", title: ["Emissions by scope", "الانبعاثات حسب النطاق"], w: 4, meaning: ["Scope 1 direct, Scope 2 purchased energy, Scope 3 purchased goods and services; the centre is the period's total.", "النطاق 1 مباشر، والنطاق 2 طاقة مشتراة، والنطاق 3 سلع وخدمات مشتراة؛ والمنتصف إجمالي الفترة."] },
  { id: "category", title: ["Largest sources", "أكبر المصادر"], w: 6 },
  { id: "supplier", title: ["By supplier", "حسب المورد"], w: 6 },
  { id: "unfactored", title: ["Spend without a factor", "إنفاق بلا معامل"], meaning: ["Add a factor for these to raise coverage.", "أضف معاملًا لهذه لرفع التغطية."] },
]);
