// @ts-nocheck -- DIGIT Pro/HR apps are switched off in the merged site build; their original /pro/* and /hr/* app routes are not in this route tree (re-enabling the app needs those routes, then remove this line)
/**
 * SC-I-01 Inventory Control Center (/pro/inventory-overview, EC-R1 Phase 6). Physical signals, a warehouse × item-group
 * exposure heatmap, an exception queue of exact native records, posted movement flow with the latest ledger rows, plus the
 * existing item balance, batch/serial, replenishment and inactivity panels. Read-only over native Core stock records
 * (inventoryCommand.ts / inventoryPro.ts); quantities stay per item and UOM, cross-item figures are counts or company value.
 * Warehouse, item group, matrix measure and worklist tab live in the URL so Back restores the same context.
 */
import { DeptOverview, bandFacts } from "./DeptOverview";
import { EntTable } from "@/components/enterprise/kit/EntTable";
import { ChartCard, ContextStrip, GroupedColumns, LINK_CHIP, LinkGroup, money, moneyShort, monthLabel, WorkPanel, type WorkTab } from "@/components/enterprise/kit";
import { kpiFromSignal, proWrap } from "./ProKit";
import { useState, type CSSProperties } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { cachedMeta } from "@/lib/catalog";
import { fmtCurrency } from "@/lib/format";
import { translateTo, useLang } from "@/i18n";
import { linkTitle } from "@/lib/linkTitle";
import { hasPerm } from "@/lib/session";
import { useScopeMetas } from "@/lib/scope";
import { financeContext, slug, sourceStatus, todayIso } from "./finance";
import { ProFrame, SourceState } from "./ProFrame";
import { gapOf, StockValueNotice, withStockGap } from "./StockValueRecon";
import { inventoryOverview } from "./inventoryPro";
import { ReplenishmentAction } from "./ReplenishmentAction";
import { BulkReplenish, usePicks } from "./BulkReplenish";
import { StockExposure } from "./StockExposure";
import { useNavResolver } from "./ProSidebar";
import { targetHref, type NavItem } from "./nav";
import { freshness, roleLabel } from "./command";
import { bi, DrillLink, drillNav, SevDot, sevLabel, SignalCard } from "./CommandUi";
import { balanceDrill, cellKey, INV_TABS, inventorySignals, inventoryWork, invOptions, ledgerDrill, monthLedgerDrill, OTHER, stockMovements, warehouseMatrix, type Cell, type InvFilter, type InvTab, type InvWork } from "./inventoryCommand";

export interface InventorySearch { company?: string | undefined; wh?: string | undefined; ig?: string | undefined; wl?: string | undefined; mx?: string | undefined }

const INV_DTS = ["Warehouse", "Bin", "Stock Ledger Entry", "Item", "Stock Entry", "Stock Reconciliation", "Batch", "Serial No", "Material Request", "Purchase Order", "Purchase Receipt", "Delivery Note", "Company"];
const DT_AR: Record<string, string> = { Item: "صنف", "Purchase Order": "أمر شراء", "Stock Entry": "قيد مخزون", "Purchase Receipt": "إيصال استلام", "Delivery Note": "إذن تسليم", "Stock Reconciliation": "تسوية مخزون", "Sales Invoice": "فاتورة بيع", "Purchase Invoice": "فاتورة شراء" };
const QUICK: { key: string; dt: string; type?: string; en: string; ar: string }[] = [
  { key: "receipt", dt: "Stock Entry", type: "Material Receipt", en: "Receipt", ar: "استلام" },
  { key: "issue", dt: "Stock Entry", type: "Material Issue", en: "Issue", ar: "صرف" },
  { key: "transfer", dt: "Stock Entry", type: "Material Transfer", en: "Transfer", ar: "تحويل" },
  { key: "count", dt: "Stock Reconciliation", en: "Stock count", ar: "جرد" },
];
const REPORTS: NavItem[] = [
  { label: "Stock Balance", target: { kind: "pro", to: "/pro/stock-balance" } },
  { label: "Stock Ledger", target: { kind: "pro", to: "/pro/stock-ledger" } },
  { label: "Warehouses", target: { kind: "pro", to: "/pro/warehouses" } },
  ...["Stock Balance", "Stock Ledger", "Stock Ageing", "Stock Projected Qty", "Warehouse wise Item Balance Age and Value", "Batch-Wise Balance History"].map((report) => ({ label: report, target: { kind: "report" as const, report } })),
];
const REPORT_AR: Record<string, string> = { "Stock Balance": "رصيد المخزون", "Stock Ledger": "دفتر المخزون", Warehouses: "المستودعات" };
const TAB_LABEL: Record<InvTab, [string, string]> = { reorder: ["Below reorder level", "أقل من حد إعادة الطلب"], short: ["Projected below zero", "متوقع أقل من صفر"], late: ["Late receipts", "استلامات متأخرة"], tracking: ["Batch / serial gaps", "نواقص الدفعات / التسلسل"], drafts: ["Unposted entries", "قيود غير مرحّلة"] };
const EMPTY: Record<InvTab, [string, string]> = {
  reorder: ["No item is below its reorder level here.", "لا يوجد صنف أقل من حد إعادة الطلب هنا."],
  short: ["No position has projected quantity below zero.", "لا يوجد رصيد كميته المتوقعة أقل من صفر."],
  late: ["No purchase order line is past its expected date.", "لا يوجد بند أمر شراء تجاوز تاريخه المتوقع."],
  tracking: ["Every posted movement of a tracked item carries its batch / serial numbers.", "كل حركة مرحّلة لصنف متتبَّع تحمل رقم الدفعة / التسلسل."],
  drafts: ["No unposted stock entry.", "لا توجد قيود مخزون غير مرحّلة."],
};
const PRIORITY: InvTab[] = ["short", "reorder", "late", "tracking", "drafts"];
export type Measure = "positions" | "value" | "risk";
const MEASURES: { id: Measure; en: string; ar: string }[] = [{ id: "positions", en: "Positions", ar: "الأرصدة" }, { id: "value", en: "Value", ar: "القيمة" }, { id: "risk", en: "At risk", ar: "المعرّضة" }];
const compact = (v: number) => new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(v);

export function InventoryPro({ search }: { search: InventorySearch }) {
  const nav = useNavigate();
  const r = useNavResolver();
  const ar = useLang() === "ar"; const t = (en: string, a: string) => (ar ? a : en);
  useScopeMetas(INV_DTS);
  const set = (p: Partial<InventorySearch>) => void nav({ to: "/pro/inventory-overview", search: (prev: InventorySearch) => ({ ...prev, ...p }) as never, replace: true });
  return (
    <ProFrame bare title={t("Inventory Control Center", "مركز التحكم بالمخزون")} subtitle={t("Availability, replenishment and traceability — every signal, cell and bar opens the stock records behind it.", "التوفر وإعادة الطلب والتتبع — كل مؤشر وخلية وعمود يفتح سجلات المخزون التي كوّنته.")} tabs={false} doctypes={INV_DTS}>
      {({ user }) => {
        const ctx = financeContext(search.company, user);
        if (!ctx.companies.length) return <SourceState status={sourceStatus("Company", user) === "ok" ? "empty" : "denied"} doctype="Company" />;
        const today = todayIso();
        const opts = invOptions(ctx.company, user);
        // A warehouse / group from another company (or one no longer holding stock) is ignored rather than silently zeroing every figure.
        const f: InvFilter = { warehouse: search.wh && opts.warehouses.includes(search.wh) ? search.wh : undefined, itemGroup: search.ig && opts.groups.includes(search.ig) ? search.ig : undefined };
        const quick = QUICK.filter((q) => { const m = cachedMeta(q.dt); return m && r.appOf(q.dt) && hasPerm(m, "create"); });
        const create = async (q: (typeof QUICK)[number]) => {
          const m = cachedMeta(q.dt); const app = r.appOf(q.dt); if (!m || !app || !hasPerm(m, "create")) return;
          // a local new-… draft (frappe.new_doc) with the purpose preset: the items table is filled on the form, so an
          // empty mandatory table never blocks opening it (saving a draft with no rows validated "Data missing in table Items")
          // loaded on use: documentApi sits above the plugin registry in the module graph (a static import here closes a cycle at startup)
          const { createDraft } = await import("@/lib/documentApi");
          const res = createDraft(m, { mapped: q.dt === "Stock Entry"
            ? { company: ctx.company, stock_entry_type: q.type, purpose: q.type, ...(f.warehouse ? q.type === "Material Receipt" ? { to_warehouse: f.warehouse } : { from_warehouse: f.warehouse } : {}) }
            : { company: ctx.company, purpose: "Stock Reconciliation" } });
          if (!res.doc) { toast.error(res.errors[0] ?? q.dt); return; }
          void nav({ to: "/app/$app/$doctype/$name", params: { app, doctype: slug(q.dt), name: res.doc.name } });
        };
        const signals = inventorySignals(ctx.company, ctx.currency, f, user, today);
        const work = inventoryWork(ctx.company, f, user, today);
        const tab: InvTab = (INV_TABS as string[]).includes(search.wl ?? "") ? (search.wl as InvTab) : PRIORITY.find((x) => work.find((w) => w.tab === x)?.items.length) ?? "reorder";
        const measure: Measure = (["positions", "value", "risk"] as string[]).includes(search.mx ?? "") ? (search.mx as Measure) : "value";
        const ov = inventoryOverview(ctx.company, user);
        const reports = REPORTS.filter((i) => r.state(i) === "ok");
        const extra = [
          { id: "items", label: t("Top items by stock value", "أعلى الأصناف قيمةً"), attrs: { "data-dp-inv-tab": "items" }, content: <>
            <section className="dp-cc-panel" data-dp-items>
              <div className="dp-cc-panel-h"><h2>{t("Top items by stock value", "أعلى الأصناف قيمةً")}</h2><span className="dp-cc-note">{t("Quantity per item in its own stock unit, across company warehouses (Bin).", "الكمية لكل صنف بوحدته، عبر مستودعات الشركة.")}</span></div>
              {ov.items.status !== "ok" ? <div className="dp-cc-panel-b"><SourceState status={ov.items.status} doctype="Item" /></div> :
                !ov.items.byItem.length ? <div className="dp-cc-panel-b"><SourceState status="empty" /></div> :
                <div className="overflow-x-auto"><EntTable id="pro-inventory-groups" wrap><table className="dp-cc-table">
                  <thead><tr><th scope="col">{t("Item", "الصنف")}</th><th scope="col" className="text-end">{t("Actual Qty", "الكمية الفعلية")}</th><th scope="col">{t("UOM", "الوحدة")}</th><th scope="col" className="text-end">{t("Stock Value", "قيمة المخزون")}</th></tr></thead>
                  <tbody>{ov.items.byItem.map((x) => <tr key={x.item}>
                    <td><Link to="/pro/stock-ledger" search={{ company: ctx.company, item: x.item, fs: "drill" } as never} className="font-medium text-primary hover:underline" data-no-i18n data-dp-inv-item={x.item}>{x.item}</Link></td>
                    <td className="text-end tabular-nums" data-no-i18n>{x.qty.toLocaleString("en-US")}</td>
                    <td className="text-xs" data-no-i18n>{x.uom || "—"}</td>
                    <td className="text-end tabular-nums" data-no-i18n>{fmtCurrency(x.value, ctx.currency)}</td>
                  </tr>)}</tbody></table></EntTable></div>}
            </section>
          </> },
          { id: "moves", label: t("Latest stock movements", "أحدث حركات المخزون"), attrs: { "data-dp-inv-tab": "moves" }, content: <Movements company={ctx.company} currency={ctx.currency} user={user} f={f} today={today} binValue={signals.find((s) => s.id === "binvalue")} ar={ar} /> },
          { id: "batches", label: t("Batches and serial numbers", "الدفعات والأرقام التسلسلية"), attrs: { "data-dp-inv-tab": "batches" }, content: <>
          <section className="dp-cc-panel" data-dp-tracking>
            <div className="dp-cc-panel-h"><h2>{t("Batches and serial numbers", "الدفعات والأرقام التسلسلية")}</h2></div>
            <div className="dp-cc-panel-b">
              {ov.tracking.status !== "ok" ? <SourceState status={ov.tracking.status} doctype={sourceStatus("Batch", user) !== "ok" ? "Batch" : "Serial No"} /> : <>
                <dl className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-4 lg:max-w-3xl" data-dp-tracking-totals>
                  <div><dt className="text-muted-foreground">{t("Batches", "الدفعات")}</dt><dd className="text-lg font-semibold tabular-nums" data-no-i18n>{ov.tracking.batches}</dd></div>
                  <div><dt className="text-muted-foreground">{t("Serial numbers", "الأرقام التسلسلية")}</dt><dd className="text-lg font-semibold tabular-nums" data-no-i18n>{ov.tracking.serials}</dd></div>
                  <div><dt className="text-muted-foreground">{t("Expiring within 30 days", "تنتهي خلال 30 يومًا")}</dt><dd className={`text-lg font-semibold tabular-nums ${ov.tracking.expiringSoon ? "text-destructive" : ""}`} data-no-i18n>{ov.tracking.expiringSoon}</dd></div>
                  <div><dt className="text-muted-foreground">{t("Next expiry", "أقرب انتهاء")}</dt><dd className="text-lg font-semibold tabular-nums" data-no-i18n>{ov.tracking.nextExpiry || "—"}</dd></div>
                </dl>
                <p className="mt-2 text-xs text-muted-foreground">{t("Batch and Serial No records for items held in this company's warehouses.", "سجلات الدفعات والأرقام التسلسلية للأصناف المحفوظة في مستودعات هذه الشركة.")}</p>
                <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
                  <Link to="/app/$app/$doctype" params={{ app: "erpnext", doctype: "batch" }} className="dp-chip">{t("Batch", "الدفعات")}</Link>
                  <Link to="/app/$app/$doctype" params={{ app: "erpnext", doctype: "serial_no" }} className="dp-chip">{t("Serial No", "الأرقام التسلسلية")}</Link>
                  <button type="button" className="dp-chip" onClick={() => set({ wl: "tracking" })} data-dp-inv-tracking-gaps>{t("Batch / serial gaps", "نواقص الدفعات / التسلسل")}</button>
                </div></>}
            </div>
          </section>
          </> },
          { id: "exposure", label: t("Stock exposure", "انكشاف المخزون"), attrs: { "data-dp-inv-tab": "exposure" }, content: <StockExposure company={ctx.company} currency={ctx.currency} asOn={today} user={user} /> },
        ];
        const active = extra.some((x) => x.id === search.wl) ? search.wl! : tab;
        return <div className="dp-cc dp-cc-inv" data-dp-screen="INV">
          <DeptOverview dept="inventory" boards={["inventory"]} company={ctx.company} currency={ctx.currency} user={user} ar={ar}
            // stock value, projected shortage and unposted entries are the contract tiles INV.STOCK_VALUE / SHORTAGE / MOVES_DRAFT
            lead={withStockGap(signals, gapOf(ctx.company, user, !!(f.warehouse || f.itemGroup)), ctx.currency).filter((sg) => !["binvalue", "short", "drafts"].includes(sg.id)).map((sg) => kpiFromSignal(sg, ar))}
            context={(question) => <div data-dp-context><ContextStrip icon={<img src="/icons/digit/mod/digit-mod-inventory-light.svg" alt="" className="h-7 w-7" />}
              eyebrow={t("DIGIT Pro · Inventory", "ديجيت برو · المخزون")} title={t("Inventory Control Center", "مركز التحكم بالمخزون")} sub={question}
              facts={[{ label: t("As of", "حتى تاريخ"), value: <bdi data-no-i18n>{today}</bdi> }, { label: t("Last change", "آخر تعديل"), value: <bdi data-no-i18n>{freshness(["Stock Ledger Entry", "Bin", "Stock Entry"], user) || "—"}</bdi> }, { label: t("Role", "الدور"), value: <bdi data-no-i18n>{roleLabel(user)}</bdi> }, ...bandFacts(ar, ctx.currency)]}
              aside={<span className="contents">
                <label className="ek-context-select"><span>{t("Company", "الشركة")}</span><select value={ctx.company} onChange={(e) => set({ company: e.target.value, wh: undefined, ig: undefined, wl: undefined })} data-no-i18n>{ctx.companies.map((c) => <option key={c}>{c}</option>)}</select></label>
                <label className="ek-context-select"><span>{t("Warehouse", "المستودع")}</span><select value={f.warehouse ?? ""} onChange={(e) => set({ wh: e.target.value || undefined })} data-dp-inv-wh>
                  <option value="">{t("All warehouses", "كل المستودعات")}</option>{opts.warehouses.map((w) => <option key={w} value={w} data-no-i18n>{w}</option>)}</select></label>
                <label className="ek-context-select"><span>{t("Item group", "مجموعة الأصناف")}</span><select value={f.itemGroup ?? ""} onChange={(e) => set({ ig: e.target.value || undefined })} data-dp-inv-ig>
                  <option value="">{t("All item groups", "كل المجموعات")}</option>{opts.groups.map((g) => <option key={g} value={g} data-no-i18n>{g}</option>)}</select></label>
              </span>}
              actions={<span className="contents" data-dp-inv-quick>{quick.map((q) => <button key={q.key} type="button" className="ek-context-btn" onClick={() => create(q)} data-dp-quick={q.key} title={q.dt}>+ {ar ? q.ar : q.en}</button>)}
                <Link to="/pro/$dept" params={{ dept: "inventory" }} className="ek-context-btn">{t("Inventory workspace", "مساحة عمل المخزون")}</Link></span>} />
              {(f.warehouse || f.itemGroup) && <p className="mt-2 flex flex-wrap items-center gap-2 text-xs" data-dp-inv-scope>
                <span className="text-muted-foreground">{t("Showing", "المعروض")}:</span>
                {f.warehouse && <button type="button" className={LINK_CHIP} onClick={() => set({ wh: undefined })} aria-label={t("Clear warehouse", "إزالة المستودع")}><bdi data-no-i18n>{f.warehouse}</bdi> ×</button>}
                {f.itemGroup && <button type="button" className={LINK_CHIP} onClick={() => set({ ig: undefined })} aria-label={t("Clear item group", "إزالة مجموعة الأصناف")}><bdi data-no-i18n>{f.itemGroup}</bdi> ×</button>}
              </p>}
              <StockValueNotice company={ctx.company} currency={ctx.currency} className="mt-3" /></div>}
            charts={[<FlowChart key="flow" company={ctx.company} currency={ctx.currency} user={user} f={f} today={today} ar={ar} />]}
            strip={<Heatmap company={ctx.company} currency={ctx.currency} user={user} f={f} measure={measure} ar={ar} onMeasure={(mx) => set({ mx: mx === "value" ? undefined : mx })} onPick={(p) => set(p)} />}
            work={<InvWorklist work={work} tab={tab} active={active} extra={extra} company={ctx.company} user={user} ar={ar} onTab={(wl) => set({ wl })} />}
            links={reports.length > 0 && <LinkGroup id="inv-reports" title={t("Inventory reports", "تقارير المخزون")}>{reports.map((i) => { const h = targetHref(i.target, r.appOf)!;
              const search = i.target.kind === "report" ? { company: ctx.company, to_date: today, ...(f.warehouse ? { warehouse: f.warehouse } : {}) } : { company: ctx.company, ...(f.warehouse ? { warehouse: f.warehouse } : {}), ...(f.itemGroup && i.label === "Stock Balance" ? { item_group: f.itemGroup } : {}) };
              return <Link key={`${i.target.kind}:${i.label}`} to={h.to as never} params={h.params as never} search={search as never} className={LINK_CHIP} data-dp-resource={i.label}>
                {ar && REPORT_AR[i.label] ? REPORT_AR[i.label] : translateTo(i.label, ar ? "ar" : "en")}{i.target.kind === "pro" && <span className="ek-row-meta">· {t("screen", "شاشة")}</span>}</Link>; })}</LinkGroup>} />
        </div>;
      }}
    </ProFrame>
  );
}

/** I3 — warehouse × item-group heatmap. Cell → Stock Balance with the same warehouse + item group; row/column headers set the page filter. */
export function Heatmap({ company, currency, user, f, measure, ar, onMeasure, onPick }: { company: string; currency: string; user: string; f: InvFilter; measure: Measure; ar: boolean; onMeasure: (m: Measure) => void; onPick: (p: Partial<InventorySearch>) => void }) {
  const t = (en: string, a: string) => (ar ? a : en);
  const m = warehouseMatrix(company, user);
  const head = <div className="dp-cc-panel-h"><h2>{t("Warehouse exposure", "انكشاف المستودعات")}</h2>
    <span className="dp-cc-note">{t("Rows are warehouses, columns item groups. A cell opens Stock Balance for that warehouse and group.", "الصفوف مستودعات والأعمدة مجموعات أصناف. الخلية تفتح رصيد المخزون لذلك المستودع والمجموعة.")}</span>
    <div role="radiogroup" aria-label={t("Measure", "المقياس")} className="dp-cc-tabs ms-auto">{MEASURES.map((x) => <button key={x.id} type="button" role="radio" aria-checked={measure === x.id} className="dp-cc-tab" onClick={() => onMeasure(x.id)} data-dp-inv-measure={x.id}>{ar ? x.ar : x.en}</button>)}</div></div>;
  if (m.status !== "ok") return <section className="dp-cc-panel" data-dp-inv-heat>{head}<div className="dp-cc-panel-b"><SourceState status={m.status} doctype="Bin" /></div></section>;
  if (!m.warehouses.length) return <section className="dp-cc-panel" data-dp-inv-heat>{head}<div className="dp-cc-panel-b"><SourceState status="empty" /></div></section>;
  const val = (c: Cell | undefined) => (!c ? 0 : measure === "positions" ? c.positions : measure === "value" ? c.value : c.atRisk);
  const max = Math.max(1, ...Object.values(m.cells).map((c) => Math.abs(val(c))));
  const show = (c: Cell | undefined) => (!c ? "—" : measure === "value" ? compact(c.value) : String(val(c)));
  const sub = (c: Cell | undefined) => (!c ? "" : measure === "positions" ? t(`${c.onHand} on hand`, `${c.onHand} برصيد`) : measure === "value" ? t(`${c.positions} positions`, `${c.positions} رصيد`) : t(`of ${c.positions}`, `من ${c.positions}`));
  const full = (c: Cell) => `${t("Positions", "الأرصدة")}: ${c.positions} · ${t("On hand", "برصيد")}: ${c.onHand} · ${t("Value", "القيمة")}: ${fmtCurrency(c.value, currency)} · ${t("At risk", "المعرّضة")}: ${c.atRisk}`;
  const gName = (g: string) => (g === OTHER ? t("Other / no group", "أخرى / بلا مجموعة") : translateTo(linkTitle("Item Group", g) || g, ar ? "ar" : "en"));
  return <section className="dp-cc-panel" data-dp-inv-heat={measure}>
    {head}
    <div className="overflow-x-auto p-2">
      <table className="dp-inv-heat" data-dash-view="heat" data-tone={measure === "risk" ? "risk" : undefined}>
        <thead><tr>
          <th scope="col" className="dp-inv-heat-corner">{t("Warehouse", "المستودع")}</th>
          {m.groups.map((g) => <th key={g.name} scope="col" aria-selected={f.itemGroup === g.name || undefined}>
            {g.name === OTHER ? <span title={m.otherGroups.join(", ")}>{gName(g.name)}</span> :
              <button type="button" className="dp-inv-heat-h" onClick={() => onPick({ ig: f.itemGroup === g.name ? undefined : g.name })} aria-pressed={f.itemGroup === g.name} data-dp-inv-col={g.name}><bdi data-no-i18n>{g.name}</bdi></button>}</th>)}
          <th scope="col" className="dp-inv-heat-total">{t("Total", "الإجمالي")}</th>
        </tr></thead>
        <tbody>{m.warehouses.map((w) => <tr key={w.name} aria-selected={f.warehouse === w.name || undefined}>
          <th scope="row"><button type="button" className="dp-inv-heat-h" onClick={() => onPick({ wh: f.warehouse === w.name ? undefined : w.name })} aria-pressed={f.warehouse === w.name} data-dp-inv-whrow={w.name}><bdi data-no-i18n>{w.name}</bdi></button></th>
          {m.groups.map((g) => { const c = m.cells[cellKey(w.name, g.name)]; const h = Math.sqrt(Math.min(1, Math.abs(val(c)) / max)); // square-root scale so smaller cells stay distinguishable
            const inner = <><b className="tabular-nums" data-no-i18n>{show(c)}</b><small>{sub(c)}</small></>;
            const style = { "--heat": h.toFixed(3) } as CSSProperties;
            const sel = (f.warehouse === w.name || f.itemGroup === g.name) || undefined;
            return <td key={g.name} data-selected={sel}>{c && g.name !== OTHER
              ? <DrillLink drill={balanceDrill(company, { warehouse: w.name, itemGroup: g.name })} className="dp-inv-cell" title={full(c)} data-dp-inv-cell={`${w.name}|${g.name}`} data-positions={c.positions}><span style={style} className="dp-inv-cell-bg" aria-hidden />{inner}</DrillLink>
              : <span className="dp-inv-cell" data-empty={!c || undefined} title={c ? `${full(c)} — ${t("pooled groups cannot be filtered as one", "لا يمكن تصفية المجموعات المجمّعة معًا")}` : undefined}><span style={style} className="dp-inv-cell-bg" aria-hidden />{inner}</span>}</td>; })}
          <td className="dp-inv-heat-total"><DrillLink drill={balanceDrill(company, { warehouse: w.name })} className="dp-inv-cell" title={full(w.total)} data-dp-inv-rowtotal={w.name} data-positions={w.total.positions}><b className="tabular-nums" data-no-i18n>{show(w.total)}</b><small>{sub(w.total)}</small></DrillLink></td>
        </tr>)}</tbody>
        <tfoot><tr>
          <th scope="row">{t("Total", "الإجمالي")}</th>
          {m.groups.map((g) => <td key={g.name} className="dp-inv-heat-total">{g.name === OTHER ? <span className="dp-inv-cell"><b className="tabular-nums" data-no-i18n>{show(g.total)}</b><small>{sub(g.total)}</small></span> :
            <DrillLink drill={balanceDrill(company, { itemGroup: g.name })} className="dp-inv-cell" title={full(g.total)} data-dp-inv-coltotal={g.name}><b className="tabular-nums" data-no-i18n>{show(g.total)}</b><small>{sub(g.total)}</small></DrillLink>}</td>)}
          <td className="dp-inv-heat-total"><DrillLink drill={balanceDrill(company, {})} className="dp-inv-cell" title={full(m.grand)} data-dp-inv-grand={m.grand.positions}><b className="tabular-nums" data-no-i18n>{show(m.grand)}</b><small>{sub(m.grand)}</small></DrillLink></td>
        </tr></tfoot>
      </table>
    </div>
    <p className="border-t border-border px-4 py-2 text-[11px] text-muted-foreground">{measure === "value"
      ? t(`Bin stock value in ${currency}, the same basis as Stock Balance. Quantities of different items are never added.`, `قيمة الأرصدة بعملة ${currency}، على أساس رصيد المخزون نفسه. لا تُجمع كميات أصناف مختلفة.`)
      : measure === "risk" ? t("At risk = projected quantity below zero, or below the Item Reorder level for that warehouse.", "المعرّضة = كمية متوقعة أقل من صفر، أو أقل من حد إعادة الطلب في الصنف لذلك المستودع.")
      : t("Positions = item × warehouse rows; \"on hand\" counts those with actual quantity above zero. Click a warehouse or group name to focus the page.", "الأرصدة = صفوف صنف × مستودع؛ \"برصيد\" ما كميته الفعلية أكبر من صفر. انقر اسم مستودع أو مجموعة لتركيز الصفحة.")}
      {m.otherGroups.length > 0 && <> {t("Pooled:", "مجمّعة:")} <bdi data-no-i18n>{m.otherGroups.join(", ")}</bdi></>}</p>
  </section>;
}

/** I4 — exception queue: Item, Warehouse, Actual / threshold, Basis, Source records, Next permitted action. */
function InvWorklist({ work, tab, active, extra, company, user, ar, onTab }: { work: InvWork[]; tab: InvTab; active: string; extra: WorkTab[]; company: string; user: string; ar: boolean; onTab: (t: string) => void }) {
  const t = (en: string, a: string) => (ar ? a : en);
  const [all, setAll] = useState(false);
  const q = work.find((w) => w.tab === tab)!;
  const rows = q.items; const shown = all ? rows : rows.slice(0, 8);
  // IN7 / INV-010: below-reorder rows can be picked and turned into Material Request drafts in one action
  const picks = usePicks(tab === "reorder" && q.status === "ok" ? rows : [], company, user);
  const qty = (i: (typeof rows)[number]) => i.actual === null ? <span className="text-muted-foreground">—</span>
    : <bdi className="tabular-nums" data-no-i18n>{i.actual.toLocaleString("en-US")}{i.threshold !== null && <span className="text-muted-foreground"> / {i.threshold.toLocaleString("en-US")}</span>} <small>{i.uom}</small></bdi>;
  const src = (i: (typeof rows)[number]) => i.sources.map((x) => <DrillLink key={`${x.doctype}:${x.name}`} drill={x.drill} className="block text-primary hover:underline" data-dp-inv-src={x.name}><span className="text-[11px] text-muted-foreground">{ar ? DT_AR[x.doctype] ?? x.doctype : x.doctype} · </span><span data-no-i18n>{x.name}</span></DrillLink>);
  const action = (i: (typeof rows)[number]) => <span className="inline-flex items-start gap-1"><span className="text-[11px] text-primary">{bi(ar, i.next)}</span>{i.replenish && !picks.covered.get(i.key) && <ReplenishmentAction company={company} item={i.item} warehouse={i.warehouse} user={user} />}{picks.chip(i.key)}</span>;
  const scopeNote = q.tab === "late" || q.tab === "drafts" ? (q.register ? t("All warehouses", "كل المستودعات") : t("Filtered to the selected warehouse / group", "مصفّاة للمستودع / المجموعة المحددة")) : "";
  const body = <>
    {q.status !== "ok" ? <div className="dp-cc-panel-b"><SourceState status={q.status} /></div> : !rows.length ? <p className="dp-cc-panel-b text-sm text-muted-foreground" data-dp-inv-empty>{bi(ar, EMPTY[tab])}</p> : <>
      {tab === "reorder" && <BulkReplenish picks={picks} company={company} user={user} />}
      <ul className="grid gap-1 p-2 ek-only-sm" data-dp-inv-cards>{shown.map((i) => <li key={i.key} className="dp-cc-exc" data-severity={i.severity} data-dp-inv-row={i.key}>
        {picks.box(i)}<SevDot sev={i.severity} /><span className="min-w-0 flex-1">
          <DrillLink drill={i.drill} className="block font-medium text-primary hover:underline"><span data-no-i18n>{i.itemName}</span></DrillLink>
          <span className="block dp-cc-meta" data-no-i18n>{i.warehouse || "—"}{i.party ? ` · ${i.party}` : ""}</span>
          <span className="block dp-cc-meta">{bi(ar, i.state)}</span>
          <span className="block text-xs">{src(i)}</span>
          {action(i)}</span>
        <span className="shrink-0 text-xs">{qty(i)}</span></li>)}</ul>
      <div className="overflow-x-auto ek-only-md"><EntTable id="pro-inventory-items" wrap><table className="dp-cc-table" data-dp-inv-table>
        <thead><tr><th scope="col">{t("Item", "الصنف")}</th><th scope="col">{t("Warehouse", "المستودع")}</th><th scope="col" className="text-end">{tab === "late" ? t("Received / ordered", "المستلم / المطلوب") : tab === "tracking" ? t("Quantity", "الكمية") : t("Actual / threshold", "الفعلي / الحد")}</th><th scope="col">{t("Basis", "الأساس")}</th><th scope="col">{t("Source records", "السجلات المصدر")}</th><th scope="col">{t("Next action", "الإجراء التالي")}</th></tr></thead>
        <tbody>{shown.map((i) => <tr key={i.key} data-dp-inv-row={i.key} data-severity={i.severity}>
          <td className="min-w-36"><span className="inline-flex items-start gap-1.5">{picks.box(i)}<SevDot sev={i.severity} /><span className="sr-only">{sevLabel(i.severity, ar)}</span>
            <span><DrillLink drill={i.drill} className="font-medium text-primary hover:underline" data-dp-inv-open={i.item}><span data-no-i18n>{i.itemName}</span></DrillLink>
              <span className="block text-[11px] text-muted-foreground" data-no-i18n>{i.item !== i.itemName ? i.item : ""}</span></span></span></td>
          <td className="max-w-44 truncate" data-no-i18n title={i.warehouse}>{i.warehouse || "—"}{i.party && <span className="block text-[11px] text-muted-foreground">{i.party}</span>}</td>
          <td className="whitespace-nowrap text-end">{qty(i)}</td>
          <td className="min-w-44">{bi(ar, i.state)}<span className="block text-[11px] text-muted-foreground">{bi(ar, i.basis)}</span></td>
          <td className="whitespace-nowrap">{src(i)}</td>
          <td className="min-w-40">{action(i)}</td>
        </tr>)}</tbody></table></EntTable></div>
      {rows.length > 8 && <div className="border-t border-border p-2"><button type="button" className="btn-ghost w-full text-xs" aria-expanded={all} onClick={() => setAll((v) => !v)} data-dp-inv-more>{all ? t("Show fewer", "عرض أقل") : `${t("Show all", "عرض الكل")} (${rows.length})`}</button></div>}
    </>}
  </>;
  return <div data-dp-inv-worklist={active}><WorkPanel id="inv-work" title={t("Stock exceptions", "استثناءات المخزون")} height={480}
    sub={scopeNote || undefined}
    actions={q.register && q.status === "ok" ? <DrillLink drill={q.register} className="ek-card-link" data-dp-inv-register={tab}>{t("Open full list", "فتح القائمة كاملة")}</DrillLink> : undefined}
    tabs={[...work.map((w) => ({ id: w.tab, label: bi(ar, TAB_LABEL[w.tab]), count: w.status === "ok" ? w.items.length : undefined, tone: w.items.some((i) => i.severity === "high") ? "risk" as const : w.items.length ? "attention" as const : undefined, attrs: { "data-dp-inv-tab": w.tab }, content: w.tab === tab ? body : null })), ...extra]}
    active={active} onTab={(x) => { setAll(false); onTab(x); }} /></div>;
}

/** I5a — six months of posted stock value in / out (company currency); each bar opens the Stock Ledger for that month. */
function FlowChart({ company, currency, user, f, today, ar }: { company: string; currency: string; user: string; f: InvFilter; today: string; ar: boolean }) {
  const t = (en: string, a: string) => (ar ? a : en);
  const mv = stockMovements(company, f.warehouse, user, today);
  const ms = mv.status === "ok" ? mv.months : [];
  return <ChartCard id="inv-flow" size="md" title={t("Stock value in and out", "قيمة المخزون الداخلة والخارجة")} attrs={{ "data-dp-inv-flow": "" }}
    sub={<>{t("Posted Stock Ledger value in company currency; a bar opens that month's ledger rows.", "قيمة دفتر المخزون المرحّلة بعملة الشركة؛ العمود يفتح صفوف ذلك الشهر.")}{f.itemGroup && <> {t("All item groups — the Stock Ledger has no item group filter.", "كل المجموعات — دفتر المخزون لا يصفّي حسب مجموعة الأصناف.")}</>}</>}
    action={<DrillLink drill={ledgerDrill(company, { warehouse: f.warehouse })} data-dp-inv-ledger>{t("Stock Ledger", "دفتر المخزون")}</DrillLink>}>
    {mv.status !== "ok" ? <SourceState status={mv.status} doctype="Stock Ledger Entry" /> : <GroupedColumns ar={ar} wrap={proWrap} fmt={money(currency)} axisFmt={moneyShort(currency)} height={170}
      groups={ms.map((m) => ({ key: m.month, label: monthLabel(m.month, ar) }))}
      series={[
        { label: t("Incoming value", "القيمة الداخلة"), values: ms.map((m) => m.incoming), drills: ms.map((m) => (m.lines ? monthLedgerDrill(company, f.warehouse, m.month) : undefined)) },
        { label: t("Outgoing value", "القيمة الخارجة"), tone: "attention", values: ms.map((m) => Math.max(0, m.outgoing)), drills: ms.map((m) => (m.lines ? monthLedgerDrill(company, f.warehouse, m.month) : undefined)) },
      ]} />}
  </ChartCard>;
}

/** I5b — latest posted ledger rows and the ledger vs Stock Balance reconciliation for the same warehouse scope. */
function Movements({ company, currency, user, f, today, binValue, ar }: { company: string; currency: string; user: string; f: InvFilter; today: string; binValue: ReturnType<typeof inventorySignals>[number] | undefined; ar: boolean }) {
  const t = (en: string, a: string) => (ar ? a : en);
  const mv = stockMovements(company, f.warehouse, user, today);
  const head = <div className="dp-cc-panel-h"><h2>{t("Latest stock movements", "أحدث حركات المخزون")}</h2>
    <span className="dp-cc-note">{mv.valuation ? <>{t("Valuation method", "طريقة التقييم")}: <bdi data-no-i18n>{mv.valuation}</bdi> ({t("Stock Settings", "إعدادات المخزون")}){mv.valuationOverrides > 0 && <> · <bdi data-no-i18n>{mv.valuationOverrides}</bdi> {t("items override it", "صنف يتجاوزها")}</>}</> : t("Valuation method is not set in Stock Settings", "طريقة التقييم غير محددة في إعدادات المخزون")}</span>
    <DrillLink drill={ledgerDrill(company, { warehouse: f.warehouse })} className="dp-link ms-auto text-xs" data-dp-inv-ledger-all>{t("Open Stock Ledger", "فتح دفتر المخزون")}</DrillLink></div>;
  if (mv.status !== "ok") return <section className="dp-cc-panel" data-dp-recent>{head}<div className="dp-cc-panel-b"><SourceState status={mv.status} doctype="Stock Ledger Entry" /></div></section>;
  // Same warehouse scope on both sides; item group cannot be applied to the ledger, so the comparison is shown only without it.
  const bin = !f.itemGroup && binValue?.status === "ok" ? binValue.value ?? 0 : null;
  const diff = bin === null ? null : Math.round((mv.value - bin) * 100) / 100;
  return <section className="dp-cc-panel" data-dp-recent>
    {head}
    <div className="flex flex-wrap items-center gap-x-5 gap-y-1 border-b border-border px-4 py-2 text-xs" data-dp-inv-recon>
      <span>{t("Posted ledger value", "قيمة الأستاذ المرحّلة")}: <b data-no-i18n data-dp-inv-ledger-value={mv.value}>{fmtCurrency(mv.value, currency)}</b> <span className="text-muted-foreground">(<bdi data-no-i18n>{mv.rows}</bdi> {t("rows", "صفًا")})</span></span>
      {bin !== null && <span>{t("Stock Balance value", "قيمة رصيد المخزون")}: <b data-no-i18n>{fmtCurrency(bin, currency)}</b></span>}
      {diff !== null && Math.abs(diff) >= 0.5 && <span className="chip gap-1 bg-warning/20 text-[11px]" data-dp-inv-recon-diff={diff}>{t("Differ by", "الفرق")} <bdi data-no-i18n>{fmtCurrency(Math.abs(diff), currency)}</bdi> — {t("review before relying on either", "راجعه قبل الاعتماد على أيٍّ منهما")}</span>}
      {diff !== null && Math.abs(diff) < 0.5 && <span className="chip bg-success/15 text-success-text text-[11px]">{t("Ledger and Stock Balance agree", "الأستاذ ورصيد المخزون متطابقان")}</span>}
    </div>
    {!mv.recent.length ? <div className="dp-cc-panel-b"><SourceState status="empty" /></div> :
      <div className="overflow-x-auto"><EntTable id="pro-inventory-moves" wrap><table className="dp-cc-table" data-dp-inv-moves>
        <thead><tr><th scope="col">{t("Posting date", "تاريخ الترحيل")}</th><th scope="col">{t("Item", "الصنف")}</th><th scope="col">{t("Warehouse", "المستودع")}</th><th scope="col" className="text-end">{t("Qty in / out", "الكمية داخل / خارج")}</th><th scope="col" className="text-end">{t("Balance qty", "الرصيد")}</th><th scope="col" className="text-end">{t("Valuation rate", "سعر التقييم")}</th><th scope="col" className="text-end">{t("Value change", "تغير القيمة")}</th><th scope="col">{t("Source voucher", "المستند المصدر")}</th></tr></thead>
        <tbody>{mv.recent.map((x) => <tr key={x.name} data-dp-inv-move={x.name}>
          <td className="whitespace-nowrap tabular-nums" data-no-i18n>{x.date}</td>
          <td><DrillLink drill={ledgerDrill(company, { item: x.item, warehouse: x.warehouse })} className="text-primary hover:underline" data-no-i18n>{x.item}</DrillLink></td>
          <td className="max-w-40 truncate" data-no-i18n title={x.warehouse}>{x.warehouse}</td>
          <td className={`whitespace-nowrap text-end tabular-nums ${x.qty < 0 ? "text-destructive" : ""}`} data-no-i18n>{x.qty > 0 ? "+" : ""}{x.qty.toLocaleString("en-US")} <small className="text-muted-foreground">{x.uom}</small></td>
          <td className="text-end tabular-nums" data-no-i18n>{x.balance === null ? "—" : x.balance.toLocaleString("en-US")}</td>
          <td className="text-end tabular-nums" data-no-i18n>{fmtCurrency(x.rate, currency)}</td>
          <td className={`whitespace-nowrap text-end tabular-nums ${x.value < 0 ? "text-destructive" : ""}`} data-no-i18n>{fmtCurrency(x.value, currency)}</td>
          <td className="whitespace-nowrap"><Link to="/app/$app/$doctype/$name" params={{ app: "erpnext", doctype: slug(x.voucherType), name: x.voucherNo }} className="text-primary hover:underline" data-dp-inv-voucher={x.voucherNo}>
            <span className="text-[11px] text-muted-foreground">{ar ? DT_AR[x.voucherType] ?? x.voucherType : x.voucherType} · </span><span data-no-i18n>{x.voucherNo}</span></Link></td>
        </tr>)}</tbody></table></EntTable></div>}
  </section>;
}
