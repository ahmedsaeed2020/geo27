/**
 * EC-R1 Phase 5 — Procurement Command Center selectors (SC-P-01, /pro/purchasing-overview). Read-only over native Core
 * buying records through the permission-scoped adapter. Purchase commitments are never payables: open PO value comes from
 * Purchase Order lines (to receive / not yet invoiced), payables from posted Purchase Invoices. The six sourcing-to-pay
 * stages keep their own bases and are never added. Every stage, chip, row and bar opens the exact records behind it.
 */
import type { Doc } from "@/lib/adapter";
import { scopedList } from "@/lib/scope";
import { currentUser } from "@/lib/session";
import { arRegister } from "./aging";
import { companyScope } from "./closeReview";
import { addDays, proDrill, SEV_RANK, type Bi, type Drill, type Severity, type Status } from "./command";
import { todayIso, type SourceStatus } from "./finance";
import { openPurchaseOrders, type OpenPoLine } from "./openPo";
import { unbilled } from "./unbilled";

const n = (v: unknown) => Number(v) || 0;
const r2 = (x: number) => Math.round(x * 100) / 100;
const s = (v: unknown) => String(v ?? "");
const DAY = 864e5;
const days = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY);
const items = (d: Doc): Record<string, unknown>[] => (Array.isArray(d["items"]) ? d["items"] : []);
type Totals = { currency: string; amount: number }[];
function sumBy<T>(rows: T[], cur: (r: T) => string, amt: (r: T) => number): Totals {
  const m = new Map<string, number>(); for (const r of rows) m.set(cur(r), r2((m.get(cur(r)) ?? 0) + amt(r)));
  return [...m].filter(([, a]) => a !== 0).map(([currency, amount]) => ({ currency, amount })).sort((a, b) => b.amount - a.amount);
}
const plural = (k: number, en: [string, string], ar: [string, string, string]): Bi => [k === 1 ? `1 ${en[0]}` : `${k} ${en[1]}`, k === 1 ? `${ar[0]} واحد` : k === 2 ? ar[1] : `${k} ${ar[2]}`];
const linesOf = (k: number) => plural(k, ["line", "lines"], ["بند", "بندان", "بنود"]);
export const MR_OPEN = ["Pending", "Partially Ordered"];
export const PO_TO_RECEIVE = ["To Receive and Bill", "To Receive"];
const supplierName = (d: Doc) => s(d["supplier_name"] || d["supplier"]);

/** Submitted, open purchase Material Requests in the company. */
function openRequests(company: string, user: string) {
  const st = companyScope("Material Request", company, user);
  return { status: st, rows: st === "ok" ? scopedList("Material Request", user).filter((d) => d["company"] === company && n(d.docstatus) === 1 && s(d["material_request_type"]) === "Purchase" && MR_OPEN.includes(s(d["status"]))) : [] };
}
/** Submitted RFQs and which of them have at least one submitted Supplier Quotation linked through items.request_for_quotation. */
function rfqs(company: string, user: string) {
  const st = companyScope("Request for Quotation", company, user);
  const sqSt = companyScope("Supplier Quotation", company, user);
  const rows = st === "ok" ? scopedList("Request for Quotation", user).filter((d) => d["company"] === company && n(d.docstatus) === 1) : [];
  const answered = new Set<string>();
  if (sqSt === "ok") for (const q of scopedList("Supplier Quotation", user)) if (q["company"] === company && n(q.docstatus) === 1) for (const it of items(q)) if (it["request_for_quotation"]) answered.add(s(it["request_for_quotation"]));
  return { status: st, responses: sqSt, rows, waiting: rows.filter((d) => !answered.has(d.name)) };
}
/** Submitted Supplier Quotations not yet ordered (status Submitted). */
function openQuotes(company: string, user: string) {
  const st = companyScope("Supplier Quotation", company, user);
  return { status: st, rows: st === "ok" ? scopedList("Supplier Quotation", user).filter((d) => d["company"] === company && n(d.docstatus) === 1 && s(d["status"]) === "Submitted") : [] };
}
/** Open PO lines (same selector as the Open Purchase Orders register) — fail closed on partial company readability. */
function poLines(company: string, user: string, today: string) {
  const st = companyScope("Purchase Order", company, user);
  if (st !== "ok") return { status: st, lines: [] as OpenPoLine[] };
  const r = openPurchaseOrders({ company }, user, today);
  return { status: r.status, lines: r.lines };
}

export interface PipeStage { id: "requests" | "rfq" | "quotes" | "orders" | "receipts" | "invoices"; label: Bi; measure: Bi; status: Status; count: number; unit: Bi; totals: Totals; qty?: number | undefined; sub?: Bi | undefined; subTone?: "warn" | undefined; drill: Drill; next: Bi }

export function procurementPipe(company: string, user = currentUser(), today = todayIso()): PipeStage[] {
  const out: PipeStage[] = [];
  const mr = openRequests(company, user);
  const mrLines = mr.rows.flatMap((d) => items(d).filter((it) => n(it["qty"]) - n(it["ordered_qty"]) > 0));
  const overdueMr = mr.rows.filter((d) => s(d["schedule_date"]) && s(d["schedule_date"]) < today).length;
  out.push({ id: "requests", label: ["Purchase requests", "احتياجات الشراء"], measure: ["Requests still to source (quantity, no value)", "طلبات لم تُورَّد بعد (كمية بدون قيمة)"], status: mr.status, count: mr.rows.length, unit: ["open requests", "طلبات مفتوحة"], totals: [], qty: mrLines.length,
    sub: overdueMr ? [`${overdueMr} past required date`, `${overdueMr} تجاوزت تاريخ الحاجة`] : undefined, subTone: overdueMr ? "warn" : undefined,
    drill: { kind: "list", doctype: "Material Request", filters: [["docstatus", "=", 1], ["material_request_type", "=", "Purchase"], ["status", "in", MR_OPEN], ["company", "=", company]] }, next: ["Create RFQ or Purchase Order", "إنشاء طلب عروض أو أمر شراء"] });
  const rq = rfqs(company, user);
  out.push({ id: "rfq", label: ["Requests for quotation", "طلبات العروض"], measure: ["Submitted RFQs", "طلبات عروض معتمدة"], status: rq.status, count: rq.rows.length, unit: ["sent", "مرسلة"], totals: [],
    sub: rq.responses === "ok" && rq.waiting.length ? [`${rq.waiting.length} without a supplier quotation yet`, `${rq.waiting.length} دون عرض مورد حتى الآن`] : undefined, subTone: rq.waiting.length ? "warn" : undefined,
    drill: { kind: "list", doctype: "Request for Quotation", filters: [["docstatus", "=", 1], ["company", "=", company]] }, next: ["Record Supplier Quotation", "تسجيل عرض المورد"] });
  const sq = openQuotes(company, user);
  const expSq = sq.rows.filter((d) => s(d["valid_till"]) && s(d["valid_till"]) <= addDays(today, 7)).length;
  out.push({ id: "quotes", label: ["Supplier quotations", "عروض الموردين"], measure: ["Offers not yet ordered, by currency", "عروض لم تتحول لأوامر، حسب العملة"], status: sq.status, count: sq.rows.length, unit: ["to compare", "للمقارنة"], totals: sumBy(sq.rows, (d) => s(d["currency"]), (d) => n(d["grand_total"])),
    sub: expSq ? [`${expSq} expire within 7 days or have expired`, `${expSq} تنتهي خلال 7 أيام أو منتهية`] : undefined, subTone: expSq ? "warn" : undefined,
    drill: { kind: "list", doctype: "Supplier Quotation", filters: [["docstatus", "=", 1], ["status", "=", "Submitted"], ["company", "=", company]] }, next: ["Compare and create Purchase Order", "قارن وأنشئ أمر شراء"] });
  const po = poLines(company, user, today);
  const recvLines = po.lines.filter((l) => PO_TO_RECEIVE.includes(l.status) && l.toReceive > 0);
  const poCount = po.status === "ok" ? new Set(po.lines.filter((l) => PO_TO_RECEIVE.includes(l.status)).map((l) => l.po)).size : 0;
  const late = recvLines.filter((l) => l.overdue);
  out.push({ id: "orders", label: ["Purchase orders", "أوامر الشراء"], measure: ["Order value still to receive, by order currency", "قيمة الأوامر المتبقية للاستلام، بعملة الأمر"], status: po.status, count: poCount, unit: ["to receive", "للاستلام"],
    totals: sumBy(recvLines, (l) => l.currency, (l) => (l.qty ? l.amount * (l.toReceive / l.qty) : 0)),
    sub: late.length ? [`${linesOf(late.length)[0]} past expected delivery`, `${linesOf(late.length)[1]} تجاوزت موعد التوريد`] : undefined, subTone: late.length ? "warn" : undefined,
    drill: { kind: "list", doctype: "Purchase Order", filters: [["docstatus", "=", 1], ["status", "in", PO_TO_RECEIVE], ["company", "=", company]] }, next: ["Create Purchase Receipt", "إنشاء إيصال استلام"] });
  const ub = unbilled("buying", company, "", today, user);
  const unsure = ub.lines.filter((l) => l.uncertain).length;
  out.push({ id: "receipts", label: ["Received", "الاستلام"], measure: ["Received quantity not yet invoiced (no value)", "كمية مستلمة لم تُفوتر بعد (بدون قيمة)"], status: ub.status, count: new Set(ub.lines.map((l) => l.source)).size, unit: ["receipts", "إيصالات"], totals: [], qty: ub.lines.length,
    sub: unsure ? [`${unsure} lines need link review`, `${unsure} بنود تحتاج مراجعة الربط`] : undefined, subTone: unsure ? "warn" : undefined,
    drill: { kind: "pro", to: "/pro/received-not-billed", search: { company } }, next: ["Create Purchase Invoice", "إنشاء فاتورة شراء"] });
  const ap = arRegister("payable", company, today, user, today);
  const apSt = ap.status === "ok" ? companyScope("Purchase Invoice", company, user) : ap.status;
  const rows = apSt === "ok" ? ap.rows : [];
  const over = rows.filter((r) => r.outstanding > 0 && r.days > 0).length, held = rows.filter((r) => r.onHold).length;
  out.push({ id: "invoices", label: ["Purchase invoices", "فواتير الشراء"], measure: ["Supplier payables as of today, net of debit notes", "مستحقات الموردين حتى اليوم بعد خصم الإشعارات المدينة"], status: apSt, count: rows.length, unit: ["open items", "بنود مفتوحة"],
    totals: sumBy(rows, (r) => r.currency, (r) => r.outstanding),
    sub: over || held ? [[over ? `${over} overdue` : "", held ? `${held} on hold` : ""].filter(Boolean).join(" · "), [over ? `${over} متأخرة` : "", held ? `${held} موقوفة` : ""].filter(Boolean).join(" · ")] : undefined, subTone: over ? "warn" : undefined,
    drill: proDrill("/pro/payables", { company }), next: ["Create Payment Entry", "إنشاء سند دفع"] });
  return out;
}

export interface Chip { id: string; label: Bi; status: Status; count: number; totals: Totals; tone?: "warn" | "bad" | undefined; drill: Drill; note?: Bi | undefined }
/** P3 — commitment and exception strip. Open PO value is a commitment (order currency), never added to payables. */
export function procurementChips(company: string, user = currentUser(), today = todayIso()): Chip[] {
  const po = poLines(company, user, today);
  const late = po.lines.filter((l) => l.overdue);
  const ub = unbilled("buying", company, "", today, user);
  const sq = openQuotes(company, user);
  const unsure = ub.lines.filter((l) => l.uncertain).length;
  return [
    { id: "commitment", label: ["Open PO value not yet invoiced", "قيمة أوامر الشراء غير المفوترة"], status: po.status, count: new Set(po.lines.map((l) => l.po)).size, totals: sumBy(po.lines, (l) => l.currency, (l) => l.toBill), drill: proDrill("/pro/open-purchase-orders", { company }), note: ["Commitment, not a liability", "التزام وليس مديونية"] },
    { id: "late", label: ["Lines past expected delivery", "بنود تجاوزت موعد التوريد"], status: po.status, count: late.length, totals: [], tone: late.length ? "bad" : undefined, drill: proDrill("/pro/open-purchase-orders", { company, band: "overdue" }) },
    { id: "grni", label: ["Received, not invoiced", "مستلم غير مفوتر"], status: ub.status, count: ub.lines.length, totals: [], tone: ub.lines.length ? "warn" : undefined, drill: { kind: "pro", to: "/pro/received-not-billed", search: { company } }, note: ["Lines, quantity only", "بنود، كمية فقط"] },
    { id: "quotes", label: ["Supplier quotations to decide", "عروض موردين بانتظار القرار"], status: sq.status, count: sq.rows.length, totals: [], drill: { kind: "list", doctype: "Supplier Quotation", filters: [["docstatus", "=", 1], ["status", "=", "Submitted"], ["company", "=", company]] } },
    { id: "links", label: ["Invoice links to review", "روابط فواتير للمراجعة"], status: ub.status, count: unsure, totals: [], tone: unsure ? "warn" : undefined, drill: { kind: "pro", to: "/pro/received-not-billed", search: { company, review: "1" } }, note: ["Receipt lines whose invoice link is not exact", "بنود استلام ربط فاتورتها غير دقيق"] },
  ];
}

export type ProcTab = "sourcing" | "late" | "receipts" | "quotes" | "pay";
export const PROC_TABS: ProcTab[] = ["sourcing", "late", "receipts", "quotes", "pay"];
export interface ProcItem { key: string; tab: ProcTab; severity: Severity; doctype: string; name: string; party: string; due: string; age: number | null; progress: string; currency: string; amount: number | null; state: Bi; next: Bi; drill: Drill }
export interface ProcWork { tab: ProcTab; status: SourceStatus; items: ProcItem[]; register?: Drill | undefined }

export function procurementWork(company: string, currency: string, user = currentUser(), today = todayIso()): ProcWork[] {
  const out: ProcWork[] = [];
  const mr = openRequests(company, user);
  out.push({ tab: "sourcing", status: mr.status, register: { kind: "list", doctype: "Material Request", filters: [["docstatus", "=", 1], ["material_request_type", "=", "Purchase"], ["status", "in", MR_OPEN], ["company", "=", company]] },
    items: mr.rows.map<ProcItem>((d) => { const due = s(d["schedule_date"]); const age = due ? days(due, today) : null; const open = items(d).filter((it) => n(it["qty"]) - n(it["ordered_qty"]) > 0);
      return { key: `Material Request|${d.name}`, tab: "sourcing", severity: age !== null && age > 0 ? (age > 14 ? "high" : "medium") : "low", doctype: "Material Request", name: d.name, party: "", due, age,
        progress: open.slice(0, 2).map((it) => `${s(it["item_code"])} ${r2(n(it["qty"]) - n(it["ordered_qty"]))} ${s(it["uom"] || it["stock_uom"])}`).join(" · ") + (open.length > 2 ? ` +${open.length - 2}` : ""), currency, amount: null,
        state: age !== null && age > 0 ? [`Required ${age} days ago, ${s(d["status"])}`, `مطلوب منذ ${age} يومًا، ${s(d["status"]) === "Pending" ? "معلّق" : "مطلوب جزئيًا"}`] : [`Required by ${due || "—"}`, `مطلوب بحلول ${due || "—"}`], next: ["Create RFQ or Purchase Order", "إنشاء طلب عروض أو أمر شراء"], drill: { kind: "doc", doctype: "Material Request", name: d.name } }; })
      .sort((a, b) => SEV_RANK[a.severity] - SEV_RANK[b.severity] || a.due.localeCompare(b.due)) });
  const po = poLines(company, user, today);
  const byPo = new Map<string, OpenPoLine[]>(); for (const l of po.lines.filter((x) => x.overdue)) byPo.set(l.po, [...(byPo.get(l.po) ?? []), l]);
  out.push({ tab: "late", status: po.status, register: proDrill("/pro/open-purchase-orders", { company, band: "overdue" }),
    items: [...byPo].map<ProcItem>(([name, ls]) => { const due = ls.map((l) => l.due).sort()[0]!; const age = days(due, today);
      return { key: `Purchase Order|${name}`, tab: "late", severity: age > 14 ? "high" : "medium", doctype: "Purchase Order", name, party: ls[0]!.supplier, due, age,
        progress: ls.slice(0, 2).map((l) => `${l.item} ${l.received}/${l.qty} ${l.uom}`).join(" · ") + (ls.length > 2 ? ` +${ls.length - 2}` : ""), currency: ls[0]!.currency, amount: r2(ls.reduce((t, l) => t + (l.qty ? l.amount * (l.toReceive / l.qty) : 0), 0)),
        state: [`${linesOf(ls.length)[0]} ${age} days late`, `${linesOf(ls.length)[1]} متأخرة ${age} يومًا`], next: ["Create Purchase Receipt or follow up supplier", "أنشئ إيصال استلام أو تابع المورد"], drill: { kind: "doc", doctype: "Purchase Order", name } }; })
      .sort((a, b) => (b.age ?? 0) - (a.age ?? 0)) });
  const ub = unbilled("buying", company, "", today, user);
  const byPr = new Map<string, typeof ub.lines>(); for (const l of ub.lines) byPr.set(l.source, [...(byPr.get(l.source) ?? []), l]);
  out.push({ tab: "receipts", status: ub.status, register: { kind: "pro", to: "/pro/received-not-billed", search: { company } },
    items: [...byPr].map<ProcItem>(([name, ls]) => { const age = days(ls[0]!.date, today); const unsure = ls.some((l) => l.uncertain);
      return { key: `Purchase Receipt|${name}`, tab: "receipts", severity: unsure || age > 30 ? "medium" : "low", doctype: "Purchase Receipt", name, party: ls[0]!.party, due: ls[0]!.date, age,
        progress: ls.slice(0, 2).map((l) => `${l.item} ${l.remaining} ${l.uom}`).join(" · ") + (ls.length > 2 ? ` +${ls.length - 2}` : ""), currency, amount: null,
        state: unsure ? [`${linesOf(ls.length)[0]} · invoice link needs review`, `${linesOf(ls.length)[1]} · ربط الفاتورة يحتاج مراجعة`] : [`${linesOf(ls.length)[0]} received ${age} days ago, not invoiced`, `${linesOf(ls.length)[1]} استُلمت منذ ${age} يومًا ولم تُفوتر`], next: ["Create Purchase Invoice", "إنشاء فاتورة شراء"], drill: { kind: "doc", doctype: "Purchase Receipt", name } }; })
      .sort((a, b) => (b.age ?? 0) - (a.age ?? 0)) });
  const sq = openQuotes(company, user);
  out.push({ tab: "quotes", status: sq.status, register: { kind: "list", doctype: "Supplier Quotation", filters: [["docstatus", "=", 1], ["status", "=", "Submitted"], ["company", "=", company]] },
    items: sq.rows.map<ProcItem>((d) => { const vt = s(d["valid_till"]); const expired = !!vt && vt < today;
      return { key: `Supplier Quotation|${d.name}`, tab: "quotes", severity: expired ? "medium" : "low", doctype: "Supplier Quotation", name: d.name, party: supplierName(d), due: vt, age: vt ? days(vt, today) : null,
        progress: items(d).slice(0, 2).map((it) => `${s(it["item_code"])} ${n(it["qty"])} @ ${n(it["rate"])}`).join(" · ") + (items(d).length > 2 ? ` +${items(d).length - 2}` : ""), currency: s(d["currency"]) || currency, amount: r2(n(d["grand_total"])),
        state: expired ? [`Expired ${days(vt, today)} days ago`, `منتهي منذ ${days(vt, today)} يومًا`] : vt ? [`Valid until ${vt}`, `ساري حتى ${vt}`] : ["No validity date", "بلا تاريخ صلاحية"], next: ["Compare and create Purchase Order", "قارن وأنشئ أمر شراء"], drill: { kind: "doc", doctype: "Supplier Quotation", name: d.name } }; })
      .sort((a, b) => (a.due || "9999").localeCompare(b.due || "9999")) });
  const ap = arRegister("payable", company, today, user, today);
  const soon = addDays(today, 7);
  out.push({ tab: "pay", status: ap.status, register: proDrill("/pro/payables", { company }),
    items: ap.rows.filter((r) => r.outstanding > 0 && r.due && r.due <= soon).map<ProcItem>((r) => ({ key: `Purchase Invoice|${r.name}`, tab: "pay", severity: r.onHold ? "low" : r.days > 30 ? "high" : r.days > 0 ? "medium" : "low", doctype: "Purchase Invoice", name: r.name, party: r.partyName, due: r.due, age: r.days,
      progress: r.orders.length ? r.orders.slice(0, 2).join(" · ") : "", currency: r.currency || currency, amount: r.outstanding,
      state: r.onHold ? [`On hold${r.releaseDate ? ` until ${r.releaseDate}` : ""}`, `موقوفة${r.releaseDate ? ` حتى ${r.releaseDate}` : ""}`] : r.days > 0 ? [`${r.days} days overdue`, `متأخرة ${r.days} يومًا`] : [`Due ${r.due}`, `تستحق ${r.due}`],
      next: r.onHold ? ["Review hold before paying", "راجع الإيقاف قبل الدفع"] : ["Create Payment Entry", "إنشاء سند دفع"], drill: { kind: "doc", doctype: "Purchase Invoice", name: r.name } }))
      .sort((a, b) => SEV_RANK[a.severity] - SEV_RANK[b.severity] || a.due.localeCompare(b.due)) });
  return out;
}

/** P5 — late PO lines by supplier; each bar opens the Open Purchase Orders register for that supplier's late lines. */
export function lateBySupplier(company: string, user = currentUser(), today = todayIso()) {
  const po = poLines(company, user, today);
  const m = new Map<string, { supplier: string; lines: number; orders: Set<string>; worst: number }>();
  for (const l of po.lines.filter((x) => x.overdue)) { const x = m.get(l.supplier) ?? { supplier: l.supplier, lines: 0, orders: new Set<string>(), worst: 0 }; x.lines++; x.orders.add(l.po); x.worst = Math.max(x.worst, days(l.due, today)); m.set(l.supplier, x); }
  return { status: po.status, rows: [...m.values()].map((x) => ({ supplier: x.supplier, lines: x.lines, orders: x.orders.size, worst: x.worst, drill: proDrill("/pro/open-purchase-orders", { company, supplier: x.supplier, band: "overdue" }) })).sort((a, b) => b.lines - a.lines || b.worst - a.worst) };
}

export interface ThreeWay { po: string; supplier: string; item: string; uom: string; currency: string; due: string; overdue: boolean; ordered: number; received: number; receivedPct: number; amount: number; billed: number; billedPct: number; receipts: string[]; invoices: string[]; flag: "over_received" | "over_billed" | "billed_ahead" | null }
/** P7 — PO ordered vs PR received vs PI billed per open PO line. Flags use only same-basis fields: received vs ordered quantity and billed vs line amount; billed ahead of receipt compares the two percentages. Advisory only — nothing is blocked. */
export function threeWay(company: string, user = currentUser(), today = todayIso()) {
  const po = poLines(company, user, today);
  const pct = (a: number, b: number) => (b ? Math.round((a / b) * 1000) / 10 : 0);
  const rows = po.lines.map<ThreeWay>((l) => { const receivedPct = pct(l.received, l.qty), billedPct = pct(l.billed, l.amount);
    return { po: l.po, supplier: l.supplier, item: l.item, uom: l.uom, currency: l.currency, due: l.due, overdue: l.overdue, ordered: l.qty, received: l.received, receivedPct, amount: l.amount, billed: l.billed, billedPct, receipts: l.receipts, invoices: l.invoices,
      flag: l.received > l.qty ? "over_received" : l.billed > l.amount ? "over_billed" : billedPct > receivedPct + 0.05 ? "billed_ahead" : null }; });
  rows.sort((a, b) => Number(!!b.flag) - Number(!!a.flag) || Number(b.overdue) - Number(a.overdue) || a.due.localeCompare(b.due));
  return { status: po.status, rows, flagged: rows.filter((r) => r.flag).length };
}
