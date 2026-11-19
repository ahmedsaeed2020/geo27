/**
 * EC-R1 Phase 6 — Inventory Control Center selectors (SC-I-01, /pro/inventory-overview). Read-only over native Core stock
 * records through the permission-scoped adapter. Physical quantities and financial values never share a measure:
 * quantities are only shown per item (one stock UOM); cross-item figures are position counts or company-currency values.
 *
 * Bases (each stated next to its figure, each opening a destination built from the same predicate):
 *  - Bin snapshot (positions, Bin stock value, projected < 0) — identical predicate to the Pro Stock Balance register.
 *  - Item Reorder child rows compared with Bin quantities (belowReorder in inventoryPro.ts).
 *  - Open purchase-order lines past their expected date (openPo.ts, same "overdue" band as the Open PO register).
 *  - Posted Stock Ledger Entry rows (stockSources.ts) for movements, trend and traceability — the posting engine is the
 *    only ledger writer; nothing here posts, values or corrects stock.
 * A source the user cannot fully read for the company returns "denied" — never a partial total.
 */
import { adapter, type Doc } from "@/lib/adapter";
import { scopedList } from "@/lib/scope";
import { currentUser } from "@/lib/session";
import { addDays, lastMonths, monthEnd, proDrill, SEV_RANK, type Bi, type Drill, type Severity, type Signal } from "./command";
import { companyScope } from "./closeReview";
import { can, sourceStatus, todayIso, type SourceStatus } from "./finance";
import { belowReorder } from "./inventoryPro";
import { openPurchaseOrders } from "./openPo";
import { stockReadiness } from "./ops";
import { postedStockSources } from "./stockSources";

const n = (v: unknown) => Number(v) || 0;
const r2 = (x: number) => Math.round(x * 100) / 100;
const s = (v: unknown) => String(v ?? "");
const kids = (d: Doc | undefined, f: string) => (d && Array.isArray(d[f]) ? (d[f] as Doc[]) : []);
const DAY = 864e5;
const days = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY);
const count = (k: number, one: Bi, two: Bi, many: Bi): Bi => [k === 1 ? one[0] : many[0].replace("#", String(k)), k === 1 ? one[1] : k === 2 ? two[1] : many[1].replace("#", String(k))];
const positionsOf = (k: number) => count(k, ["1 position", "رصيد واحد"], ["2 positions", "رصيدان"], ["# positions", "# أرصدة"]);
const itemsOf = (k: number) => count(k, ["1 item", "صنف واحد"], ["2 items", "صنفان"], ["# items", "# أصناف"]);

export interface InvFilter { warehouse?: string | undefined; itemGroup?: string | undefined }

/* ---------------- Bin scope (same predicate as the Stock Balance register) ---------------- */
interface BinScope { status: SourceStatus; bins: Doc[]; items: Map<string, Doc>; whCo: Map<string, string> }
export function binScope(company: string, user = currentUser()): BinScope {
  const empty = { bins: [] as Doc[], items: new Map<string, Doc>(), whCo: new Map<string, string>() };
  for (const dt of ["Bin", "Warehouse", "Item"]) { const st = sourceStatus(dt, user); if (st !== "ok") return { status: st, ...empty }; }
  const whDocs = scopedList("Warehouse", user);
  const readableWh = new Set(whDocs.map((w) => w.name));
  if (adapter.list("Warehouse").some((w) => w["company"] === company && !readableWh.has(w.name))) return { status: "denied", ...empty };
  const whCo = new Map(whDocs.map((w) => [w.name, s(w["company"])]));
  const allWhCo = new Map(adapter.list("Warehouse").map((w) => [w.name, s(w["company"])]));
  const readable = scopedList("Bin", user); const ids = new Set(readable.map((b) => b.name));
  if (adapter.list("Bin").some((b) => (s(b["company"]) || allWhCo.get(s(b["warehouse"]))) === company && !ids.has(b.name))) return { status: "denied", ...empty };
  const items = new Map(scopedList("Item", user).map((i) => [i.name, i]));
  return { status: "ok", bins: readable.filter((b) => (s(b["company"]) || whCo.get(s(b["warehouse"]))) === company), items, whCo };
}
const groupOf = (items: Map<string, Doc>, code: unknown) => s(items.get(s(code))?.["item_group"]);
const uomOf = (items: Map<string, Doc>, code: unknown, row?: Doc) => s(items.get(s(code))?.["stock_uom"] || row?.["stock_uom"] || row?.["uom"]);
const inFilter = (sc: BinScope, f: InvFilter) => (b: Doc) => (!f.warehouse || b["warehouse"] === f.warehouse) && (!f.itemGroup || groupOf(sc.items, b["item_code"]) === f.itemGroup);

/** Pro Stock Balance register drill — the same company / warehouse / item group / projected-below-zero predicate. */
export const balanceDrill = (company: string, f: InvFilter, short = false): Drill =>
  proDrill("/pro/stock-balance", { company, warehouse: f.warehouse || undefined, item_group: f.itemGroup || undefined, short: short ? "1" : undefined });
export const ledgerDrill = (company: string, x: { item?: string | undefined; warehouse?: string | undefined; from?: string | undefined; to?: string | undefined }): Drill =>
  proDrill("/pro/stock-ledger", { company, item: x.item || undefined, warehouse: x.warehouse || undefined, from: x.from || undefined, to: x.to || undefined });

/** Warehouses and item groups that hold company Bins, for the header selectors. */
export function invOptions(company: string, user = currentUser()) {
  const sc = binScope(company, user);
  return { status: sc.status, warehouses: [...new Set(sc.bins.map((b) => s(b["warehouse"])))].filter(Boolean).sort(), groups: [...new Set(sc.bins.map((b) => groupOf(sc.items, b["item_code"])))].filter(Boolean).sort() };
}

/* ---------------- I2 physical signals ---------------- */
export function inventorySignals(company: string, currency: string, f: InvFilter, user = currentUser(), today = todayIso()): Signal[] {
  const sc = binScope(company, user);
  const bins = sc.status === "ok" ? sc.bins.filter(inFilter(sc, f)) : [];
  const st = sc.status;
  const scoped: Bi = f.warehouse || f.itemGroup ? ["Selected warehouse / item group", "المستودع / مجموعة الأصناف المحددة"] : ["All company warehouses", "كل مستودعات الشركة"];
  const out: Signal[] = [];
  const onHand = bins.filter((b) => n(b["actual_qty"]) > 0).length;
  const itemCount = new Set(bins.map((b) => s(b["item_code"]))).size;
  out.push({ id: "positions", label: ["Stock positions", "أرصدة المخزون"], status: st, value: st === "ok" ? bins.length : null, money: false, currency, asOf: today, source: "Bin",
    basis: ["Item × warehouse rows in Stock Balance", "صفوف صنف × مستودع في رصيد المخزون"], drill: balanceDrill(company, f),
    note: [`${itemsOf(itemCount)[0]} · ${onHand} with stock on hand · ${scoped[0]}`, `${itemsOf(itemCount)[1]} · ${onHand} بها رصيد فعلي · ${scoped[1]}`] });
  out.push({ id: "binvalue", label: ["Stock value", "قيمة المخزون"], status: st, value: st === "ok" ? r2(bins.reduce((t, b) => t + n(b["stock_value"]), 0)) : null, money: true, currency, asOf: today, source: "Bin.stock_value",
    basis: ["Bin stock value — the same total as Stock Balance", "قيمة الأرصدة — نفس إجمالي رصيد المخزون"], drill: balanceDrill(company, f), note: scoped });
  const short = bins.filter((b) => n(b["projected_qty"]) < 0);
  out.push({ id: "short", label: ["Projected below zero", "متوقع أقل من صفر"], status: st, value: st === "ok" ? short.length : null, money: false, currency, asOf: today, source: "Bin.projected_qty",
    basis: ["Projected quantity below zero after reservations and orders", "الكمية المتوقعة أقل من صفر بعد الحجوزات والطلبات"], drill: balanceDrill(company, f, true),
    note: [`${positionsOf(short.length)[0]} · ${scoped[0]}`, `${positionsOf(short.length)[1]} · ${scoped[1]}`] });
  const reorder = st === "ok" ? belowReorder([...sc.items.values()], sc.bins, sc.whCo, company).filter((r) => (!f.warehouse || r.warehouse === f.warehouse) && (!f.itemGroup || groupOf(sc.items, r.item) === f.itemGroup)) : [];
  out.push({ id: "reorder", label: ["Below reorder level", "أقل من حد إعادة الطلب"], status: st, value: st === "ok" ? reorder.length : null, money: false, currency, asOf: today, source: "Item Reorder · Bin",
    basis: ["Item Reorder level compared with Bin quantity", "مستوى إعادة الطلب في الصنف مقارنةً بالرصيد"],
    drill: { kind: "pro", to: "/pro/inventory-overview", search: { company, wh: f.warehouse || undefined, ig: f.itemGroup || undefined, wl: "reorder" } },
    note: [`${positionsOf(reorder.length)[0]} · ${scoped[0]}`, `${positionsOf(reorder.length)[1]} · ${scoped[1]}`] });
  const po = openPurchaseOrders({ company, band: "overdue" }, user, today);
  const late = po.lines.filter((l) => l.band === "overdue");
  out.push({ id: "late", label: ["Late purchase receipts", "استلامات شراء متأخرة"], status: po.status, value: po.status === "ok" ? late.length : null, money: false, currency, asOf: today, source: "Purchase Order",
    basis: ["Purchase order lines past their expected date, not fully received", "بنود أوامر شراء تجاوزت تاريخها المتوقع ولم تُستلم كاملة"], drill: proDrill("/pro/open-purchase-orders", { company, band: "overdue" }),
    note: [`${late.length === 1 ? "1 line" : `${late.length} lines`} · all warehouses`, `${late.length === 1 ? "بند واحد" : late.length === 2 ? "بندان" : `${late.length} بنود`} · كل المستودعات`] });
  const dSt = companyScope("Stock Entry", company, user);
  const drafts = dSt === "ok" ? scopedList("Stock Entry", user).filter((d) => d["company"] === company && n(d.docstatus) === 0) : [];
  out.push({ id: "drafts", label: ["Unposted stock entries", "قيود مخزون غير مرحّلة"], status: dSt, value: dSt === "ok" ? drafts.length : null, money: false, currency, asOf: today, source: "Stock Entry",
    basis: ["Draft Stock Entries — not yet in the ledger", "حركات مخزون مسودة — لم تدخل الأستاذ بعد"], drill: { kind: "list", doctype: "Stock Entry", filters: [["company", "=", company], ["docstatus", "=", 0]] },
    note: ["All warehouses", "كل المستودعات"] });
  return out;
}

/* ---------------- I3 warehouse × item-group exposure matrix ---------------- */
export interface Cell { positions: number; value: number; atRisk: number; onHand: number }
export interface Matrix { status: SourceStatus; warehouses: { name: string; total: Cell }[]; groups: { name: string; total: Cell }[]; cells: Record<string, Cell>; grand: Cell; otherGroups: string[] }
export const OTHER = "__other__";
export const cellKey = (wh: string, g: string) => `${wh}\u0000${g}`;
const blank = (): Cell => ({ positions: 0, value: 0, atRisk: 0, onHand: 0 });
const add = (c: Cell, b: Doc, risk: boolean) => { c.positions++; c.value = r2(c.value + n(b["stock_value"])); if (risk) c.atRisk++; if (n(b["actual_qty"]) > 0) c.onHand++; };
/** Rows = company warehouses holding Bins; columns = item groups (top `maxCols` by Bin value, the rest pooled as "other").
 * Cell = positions / Bin value / at-risk positions (projected below zero or below reorder level). Every pooled or missing
 * group is listed so nothing is silently dropped. */
export function warehouseMatrix(company: string, user = currentUser(), maxCols = 6): Matrix {
  const sc = binScope(company, user);
  const res: Matrix = { status: sc.status, warehouses: [], groups: [], cells: {}, grand: blank(), otherGroups: [] };
  if (sc.status !== "ok") return res;
  const risk = new Set(belowReorder([...sc.items.values()], sc.bins, sc.whCo, company).map((r) => `${r.item}\u0000${r.warehouse}`));
  const isRisk = (b: Doc) => n(b["projected_qty"]) < 0 || risk.has(`${s(b["item_code"])}\u0000${s(b["warehouse"])}`);
  const byGroup = new Map<string, number>();
  for (const b of sc.bins) { const g = groupOf(sc.items, b["item_code"]); byGroup.set(g, (byGroup.get(g) ?? 0) + Math.abs(n(b["stock_value"]))); }
  const named = [...byGroup].filter(([g]) => g).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([g]) => g);
  const cols = named.slice(0, maxCols); res.otherGroups = named.slice(maxCols);
  const colOf = (g: string) => (cols.includes(g) ? g : OTHER);
  if (res.otherGroups.length || byGroup.has("")) cols.push(OTHER);
  const whT = new Map<string, Cell>(), gT = new Map<string, Cell>();
  for (const b of sc.bins) {
    const wh = s(b["warehouse"]), g = colOf(groupOf(sc.items, b["item_code"])), r = isRisk(b);
    add((res.cells[cellKey(wh, g)] ??= blank()), b, r);
    add(whT.get(wh) ?? (whT.set(wh, blank()), whT.get(wh)!), b, r);
    add(gT.get(g) ?? (gT.set(g, blank()), gT.get(g)!), b, r);
    add(res.grand, b, r);
  }
  res.warehouses = [...whT].sort((a, b) => b[1].value - a[1].value || a[0].localeCompare(b[0])).map(([name, total]) => ({ name, total }));
  res.groups = cols.map((name) => ({ name, total: gT.get(name) ?? blank() }));
  return res;
}

/* ---------------- I4 exception queue ---------------- */
export type InvTab = "reorder" | "short" | "late" | "tracking" | "drafts";
export const INV_TABS: InvTab[] = ["reorder", "short", "late", "tracking", "drafts"];
export interface InvSource { doctype: string; name: string; drill: Drill }
export interface InvItem {
  key: string; severity: Severity; item: string; itemName: string; warehouse: string; uom: string;
  actual: number | null; threshold: number | null; state: Bi; basis: Bi; sources: InvSource[]; next: Bi; drill: Drill;
  /** Supplier or other record value — rendered as record content, never inside translated text. */
  party?: string | undefined;
  replenish?: { requestType: string; qty: number } | undefined;
}
export interface InvWork { tab: InvTab; status: SourceStatus; items: InvItem[]; register?: Drill | undefined; companyWide?: boolean | undefined }
const doc = (doctype: string, name: string): InvSource => ({ doctype, name, drill: { kind: "doc", doctype, name } });
const BLOCK_AR: Record<string, [string, string]> = {
  field: ["حقل ناقص أو غير صحيح في البنود", "صحّح البند في جدول الأصناف"],
  shortage: ["رصيد غير كافٍ في مستودع المصدر", "خفّض الكمية أو اختر مستودعًا آخر أو استلم المخزون أولًا"],
  batch: ["رقم الدفعة مطلوب", "أضف رقم الدفعة / التسلسل على البند"],
  serial: ["الأرقام التسلسلية لا تطابق الكمية", "صحّح الأرقام التسلسلية على البند"],
  permission: ["لا تملك صلاحية الاعتماد", "اطلب من مدير المخزون الاعتماد"],
  state: ["ليست مسودة", "افتح المستند"],
};
/** Arabic labels for native Select values used inside translated text (stored values themselves are never changed). */
export const PURPOSE_AR: Record<string, string> = { "Material Receipt": "استلام مواد", "Material Issue": "صرف مواد", "Material Transfer": "تحويل مواد", "Material Transfer for Manufacture": "تحويل مواد للتصنيع", "Material Consumption for Manufacture": "استهلاك مواد للتصنيع", Manufacture: "تصنيع", Repack: "إعادة تعبئة", "Send to Subcontractor": "إرسال لمقاول باطن", Purchase: "شراء", "Customer Provided": "مقدَّم من العميل" };
const TRACK_VOUCHERS = ["Stock Entry", "Purchase Receipt", "Delivery Note", "Stock Reconciliation", "Sales Invoice", "Purchase Invoice"];

export function inventoryWork(company: string, f: InvFilter, user = currentUser(), today = todayIso()): InvWork[] {
  const sc = binScope(company, user);
  const filt = inFilter(sc, f);
  const name = (code: string) => s(sc.items.get(code)?.["item_name"]) || code;
  const out: InvWork[] = [];

  // Below reorder level — Item Reorder rows vs Bin
  const ro = sc.status === "ok" ? belowReorder([...sc.items.values()], sc.bins, sc.whCo, company).filter((r) => (!f.warehouse || r.warehouse === f.warehouse) && (!f.itemGroup || groupOf(sc.items, r.item) === f.itemGroup)) : [];
  out.push({ tab: "reorder", status: sc.status, items: ro.map((r) => {
    const eligible = ["Purchase", "Material Transfer", "Manufacture"].includes(r.requestType) && r.reorderQty > 0;
    const uom = uomOf(sc.items, r.item);
    return { key: `ro:${r.item}:${r.warehouse}`, severity: r.projected <= 0 || r.actual <= 0 ? "high" : r.projected < r.level / 2 ? "medium" : "low",
      item: r.item, itemName: name(r.item), warehouse: r.warehouse, uom, actual: r.actual, threshold: r.level,
      state: [`Projected ${r.projected} vs reorder level ${r.level}`, `المتوقع ${r.projected} مقابل حد إعادة الطلب ${r.level}`],
      basis: ["Item Reorder row · Bin quantity", "صف إعادة الطلب في الصنف · رصيد المستودع"],
      sources: [doc("Item", r.item)], drill: ledgerDrill(company, { item: r.item, warehouse: r.warehouse }),
      next: eligible ? [`Prepare a draft material request (${r.requestType}, quantity ${r.reorderQty})`, `إعداد طلب مواد مسودة (${PURPOSE_AR[r.requestType] ?? "—"}، الكمية ${r.reorderQty})`] : ["Review the reorder settings on the Item", "راجع إعدادات إعادة الطلب في الصنف"],
      replenish: eligible ? { requestType: r.requestType, qty: r.reorderQty } : undefined } satisfies InvItem;
  }) });

  // Projected below zero — Bin
  const sh = sc.status === "ok" ? sc.bins.filter(filt).filter((b) => n(b["projected_qty"]) < 0).sort((a, b) => n(a["projected_qty"]) - n(b["projected_qty"])) : [];
  out.push({ tab: "short", status: sc.status, register: balanceDrill(company, f, true), items: sh.map((b) => {
    const item = s(b["item_code"]), wh = s(b["warehouse"]), p = n(b["projected_qty"]), res = n(b["reserved_qty"]), ord = n(b["ordered_qty"]);
    return { key: `sh:${b.name}`, severity: n(b["actual_qty"]) <= 0 ? "high" : "medium", item, itemName: name(item), warehouse: wh, uom: uomOf(sc.items, item, b),
      actual: n(b["actual_qty"]), threshold: 0,
      state: [`Projected ${p} · reserved ${res} · ordered ${ord}`, `المتوقع ${p} · المحجوز ${res} · المطلوب ${ord}`],
      basis: ["Bin: actual + ordered − reserved", "الرصيد: الفعلي + المطلوب − المحجوز"], sources: [doc("Item", item)], drill: ledgerDrill(company, { item, warehouse: wh }),
      next: ord > 0 ? ["Follow up the open purchase order", "تابع أمر الشراء المفتوح"] : ["Receive or transfer stock, or review reservations", "استلم أو حوّل مخزونًا، أو راجع الحجوزات"] } satisfies InvItem;
  }) });

  // Late purchase receipts — open PO lines in the overdue band
  const po = openPurchaseOrders({ company, band: "overdue" }, user, today);
  const poDocs = new Map(po.status === "ok" ? scopedList("Purchase Order", user).map((d) => [d.name, d]) : []);
  const whOfLine = (poName: string, item: string) => { const d = poDocs.get(poName); const rows = kids(d, "items").filter((r) => r["item_code"] === item); const w = new Set(rows.map((r) => s(r["warehouse"] || d?.["set_warehouse"]))); return w.size === 1 ? [...w][0]! : ""; };
  const late = po.lines.filter((l) => l.band === "overdue").map((l) => ({ l, wh: whOfLine(l.po, l.item) }))
    .filter(({ l, wh }) => (!f.warehouse || wh === f.warehouse) && (!f.itemGroup || groupOf(sc.items, l.item) === f.itemGroup));
  out.push({ tab: "late", status: po.status, companyWide: !f.warehouse && !f.itemGroup, register: !f.warehouse && !f.itemGroup ? proDrill("/pro/open-purchase-orders", { company, band: "overdue" }) : undefined,
    items: late.map(({ l, wh }) => { const d = days(l.due, today); return { key: `po:${l.po}:${l.item}:${l.due}`, severity: d > 14 ? "high" : "medium", item: l.item, itemName: name(l.item), warehouse: wh, uom: l.uom,
      actual: l.received, threshold: l.qty,
      state: [`${d} days late · ${l.toReceive} still to receive`, `متأخر ${d} يومًا · ${l.toReceive} متبقية للاستلام`], party: l.supplier,
      basis: ["Expected date on the purchase order line", "التاريخ المتوقع في بند أمر الشراء"], sources: [doc("Purchase Order", l.po)], drill: { kind: "doc", doctype: "Purchase Order", name: l.po },
      next: ["Create Purchase Receipt from the order", "إنشاء إيصال استلام من الأمر"] } satisfies InvItem; }) });

  // Untraceable batch / serial — posted movements of tracked items with no identifier on the ledger row or its voucher row
  const led = postedStockSources(company, user);
  let tSt: SourceStatus = led.status;
  const tracked = led.status === "ok" ? led.rows.filter((e) => { const it = sc.items.get(s(e["item_code"])); return !!it && (n(it["has_batch_no"]) || n(it["has_serial_no"])) && n(e["actual_qty"]) !== 0 && (!f.warehouse || e["warehouse"] === f.warehouse) && (!f.itemGroup || s(it["item_group"]) === f.itemGroup); }) : [];
  const vTypes = [...new Set(tracked.map((e) => s(e["voucher_type"])))];
  const vouchers = new Map<string, Doc>();
  for (const vt of vTypes) {
    const st = TRACK_VOUCHERS.includes(vt) ? sourceStatus(vt, user) : "unavailable";
    if (st !== "ok") { tSt = tSt === "ok" ? st : tSt; continue; }
    for (const d of scopedList(vt, user)) vouchers.set(`${vt}\u0000${d.name}`, d);
  }
  const miss = new Map<string, { e: Doc; qty: number; batch: boolean; serial: boolean }>();
  if (tSt === "ok") for (const e of tracked) {
    const it = sc.items.get(s(e["item_code"]))!; const needB = !!n(it["has_batch_no"]), needS = !!n(it["has_serial_no"]);
    const has = (x: Doc | undefined) => !!x && (!!s(x["serial_and_batch_bundle"]) || ((!needB || !!s(x["batch_no"])) && (!needS || !!s(x["serial_no"]))));
    if (has(e)) continue;
    const v = vouchers.get(`${s(e["voucher_type"])}\u0000${s(e["voucher_no"])}`);
    const row = kids(v, "items").find((r) => r["item_code"] === e["item_code"] && [r["warehouse"], r["s_warehouse"], r["t_warehouse"], v?.["set_warehouse"]].includes(e["warehouse"]) && has(r));
    if (row) continue;
    const k = `${s(e["voucher_type"])}\u0000${s(e["voucher_no"])}\u0000${s(e["item_code"])}\u0000${s(e["warehouse"])}`;
    const m = miss.get(k) ?? { e, qty: 0, batch: needB, serial: needS }; m.qty = r2(m.qty + Math.abs(n(e["actual_qty"]))); miss.set(k, m);
  }
  out.push({ tab: "tracking", status: tSt, items: [...miss.values()].map(({ e, qty, batch, serial }) => {
    const item = s(e["item_code"]), vt = s(e["voucher_type"]), vn = s(e["voucher_no"]), wh = s(e["warehouse"]);
    const need: Bi = batch && serial ? ["batch and serial numbers", "رقم الدفعة والأرقام التسلسلية"] : batch ? ["batch number", "رقم الدفعة"] : ["serial numbers", "الأرقام التسلسلية"];
    return { key: `tr:${vt}:${vn}:${item}:${wh}`, severity: "medium", item, itemName: name(item), warehouse: wh, uom: uomOf(sc.items, item, e), actual: qty, threshold: null,
      state: [`Posted ${s(e["posting_date"])} without ${need[0]}`, `مرحّل ${s(e["posting_date"])} بدون ${need[1]}`],
      basis: ["Stock Ledger row and its source document row", "صف الأستاذ وصف المستند المصدر"], sources: [doc(vt, vn)], drill: { kind: "doc", doctype: vt, name: vn },
      next: ["Review Serial / Batch on the source document", "راجع الدفعة / التسلسل في المستند المصدر"] } satisfies InvItem;
  }) });

  // Unposted stock entries — readiness from the native-rule check (never "ready" while a blocker exists)
  const dSt = companyScope("Stock Entry", company, user);
  const drafts = dSt === "ok" ? scopedList("Stock Entry", user).filter((d) => d["company"] === company && n(d.docstatus) === 0).filter((d) => {
    const rows = kids(d, "items");
    const whs = [d["from_warehouse"], d["to_warehouse"], ...rows.flatMap((r) => [r["s_warehouse"], r["t_warehouse"]])].map(s).filter(Boolean);
    return (!f.warehouse || whs.includes(f.warehouse)) && (!f.itemGroup || rows.some((r) => groupOf(sc.items, r["item_code"]) === f.itemGroup));
  }).sort((a, b) => s(a["posting_date"]).localeCompare(s(b["posting_date"]))) : [];
  out.push({ tab: "drafts", status: dSt, register: !f.warehouse && !f.itemGroup ? { kind: "list", doctype: "Stock Entry", filters: [["company", "=", company], ["docstatus", "=", 0]] } : undefined,
    items: drafts.map((d) => {
      const rows = kids(d, "items"); const first = rows[0]; const item = s(first?.["item_code"]);
      const rd = stockReadiness(d, user, can("Stock Entry", "submit", d, user));
      const b = rd.blockers[0]; const old = !!s(d["posting_date"]) && s(d["posting_date"]) < addDays(today, -7);
      const from = s(d["from_warehouse"] || first?.["s_warehouse"]), to = s(d["to_warehouse"] || first?.["t_warehouse"]);
      const purpose = s(d["stock_entry_type"] || d["purpose"]);
      return { key: `se:${d.name}`, severity: b || old ? "medium" : "low", item, itemName: rows.length > 1 ? `${name(item)} +${rows.length - 1}` : name(item), warehouse: from && to ? `${from} → ${to}` : from || to,
        uom: uomOf(sc.items, item, first), actual: null, threshold: null,
        state: b ? [`${purpose} · blocked: ${b.msg}`, `${PURPOSE_AR[purpose] ?? "قيد مخزون"} · محجوب: ${BLOCK_AR[b.kind]?.[0] ?? "يوجد عائق"}`] : rd.unknownStock ? [`${purpose} · source stock could not be checked`, `${PURPOSE_AR[purpose] ?? "قيد مخزون"} · تعذّر التحقق من رصيد المصدر`] : [`${purpose} · no blocker found; native validation runs on submit`, `${PURPOSE_AR[purpose] ?? "قيد مخزون"} · لا عائق ظاهر؛ يتحقق النظام عند الاعتماد`],
        basis: ["Draft Stock Entry with native readiness checks", "قيد مخزون مسودة مع فحوص الجاهزية"], sources: [doc("Stock Entry", d.name)], drill: { kind: "doc", doctype: "Stock Entry", name: d.name },
        next: b ? [b.next, BLOCK_AR[b.kind]?.[1] ?? "افتح المستند"] : ["Open, review and submit", "افتح وراجع واعتمد"] } satisfies InvItem;
    }) });

  for (const w of out) w.items.sort((a, b) => SEV_RANK[a.severity] - SEV_RANK[b.severity]);
  return out;
}

/* ---------------- I5 movements & valuation ---------------- */
export interface MonthFlow { month: string; incoming: number; outgoing: number; lines: number }
export interface Movement { name: string; date: string; item: string; warehouse: string; qty: number; uom: string; balance: number | null; rate: number; value: number; voucherType: string; voucherNo: string }
/** Posted ledger value movement per month (company currency): incoming = rows that add quantity (or add value with no
 * quantity), outgoing = the rest, so incoming − outgoing equals the Stock Ledger value change for the same window. */
export function stockMovements(company: string, warehouse: string | undefined, user = currentUser(), today = todayIso(), k = 6) {
  const src = postedStockSources(company, user);
  const months = lastMonths(today, k);
  const empty = { status: src.status, months: months.map((month) => ({ month, incoming: 0, outgoing: 0, lines: 0 })), recent: [] as Movement[], value: 0, rows: 0, valuation: "", valuationOverrides: 0 };
  if (src.status !== "ok") return empty;
  const items = new Map(scopedList("Item", user).map((i) => [i.name, i]));
  const rows = src.rows.filter((e) => !warehouse || e["warehouse"] === warehouse);
  const flows = new Map(empty.months.map((m) => [m.month, { ...m }]));
  for (const e of rows) {
    const f = flows.get(s(e["posting_date"]).slice(0, 7)); if (!f) continue;
    const q = n(e["actual_qty"]), v = n(e["stock_value_difference"]);
    if (q > 0 || (q === 0 && v > 0)) f.incoming = r2(f.incoming + v); else f.outgoing = r2(f.outgoing - v);
    f.lines++;
  }
  const key = (e: Doc) => s(e["posting_date"]) + s(e["posting_time"]) + s(e["creation"]) + e.name;
  const recent = [...rows].sort((a, b) => key(b).localeCompare(key(a))).slice(0, 8).map((e) => ({
    name: e.name, date: s(e["posting_date"]), item: s(e["item_code"]), warehouse: s(e["warehouse"]), qty: n(e["actual_qty"]), uom: s(items.get(s(e["item_code"]))?.["stock_uom"] || e["stock_uom"]),
    balance: e["qty_after_transaction"] === undefined || e["qty_after_transaction"] === null ? null : n(e["qty_after_transaction"]), rate: n(e["valuation_rate"]), value: r2(n(e["stock_value_difference"])),
    voucherType: s(e["voucher_type"]), voucherNo: s(e["voucher_no"]) }));
  const ss = adapter.get("Stock Settings", "Stock Settings");
  const held = new Set(rows.map((e) => s(e["item_code"])));
  return { status: src.status, months: [...flows.values()], recent, value: r2(rows.reduce((t, e) => t + n(e["stock_value_difference"]), 0)), rows: rows.length,
    valuation: s(ss?.["valuation_method"]), valuationOverrides: [...held].filter((c) => s(items.get(c)?.["valuation_method"])).length };
}
export const monthLedgerDrill = (company: string, warehouse: string | undefined, month: string): Drill => ledgerDrill(company, { warehouse, from: `${month}-01`, to: monthEnd(month) });
