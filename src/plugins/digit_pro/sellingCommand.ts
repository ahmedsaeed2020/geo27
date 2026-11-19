/**
 * EC-R1 Phase 4 — Selling Command Center selectors (SC-S-01, /pro/selling-overview). Read-only over native Core selling
 * records through the permission-scoped adapter. The quote-to-cash rail shows five stages that measure different things
 * (open quotation value, order value awaiting delivery, delivered quantity not yet invoiced, invoiced this month, open
 * receivables); they are never added into one funnel. Every stage, worklist row and customer opens its exact source.
 */
import type { Doc } from "@/lib/adapter";
import { scopedList } from "@/lib/scope";
import { currentUser } from "@/lib/session";
import { arRegister } from "./aging";
import { companyScope } from "./closeReview";
import { addDays, lastMonths, monthEnd, mtdWindows, proDrill, siAmount, SEV_RANK, type Bi, type Drill, type Filter, type Severity, type Status } from "./command";
import { sourceStatus, todayIso, type SourceStatus } from "./finance";
import { salesBacklog } from "./operationalPriorities";
import { unbilled } from "./unbilled";

const n = (v: unknown) => Number(v) || 0;
const r2 = (x: number) => Math.round(x * 100) / 100;
const s = (v: unknown) => String(v ?? "");
const DAY = 864e5;
const days = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY);
type Totals = { currency: string; amount: number }[];
function byCurrency(rows: Doc[], amt: (d: Doc) => number, cur: (d: Doc) => string = (d) => s(d["currency"])): Totals {
  const m = new Map<string, number>(); for (const d of rows) m.set(cur(d), r2((m.get(cur(d)) ?? 0) + amt(d)));
  return [...m].map(([currency, amount]) => ({ currency, amount })).sort((a, b) => b.amount - a.amount);
}
export const OPEN_QUOTE = ["Open", "Replied", "Partially Ordered"];
export const TO_DELIVER = ["To Deliver and Bill", "To Deliver"];
/** Count phrases with singular/plural forms in both languages ("1 line", "بند واحد"). */
const lines = (k: number): Bi => [k === 1 ? "1 line" : `${k} lines`, k === 1 ? "بند واحد" : k === 2 ? "بندان" : `${k} بنود`];
const orders = (k: number): Bi => [k === 1 ? "1 order" : `${k} orders`, k === 1 ? "أمر واحد" : k === 2 ? "أمران" : `${k} أوامر`];
const returnsOf = (k: number): Bi => [k === 1 ? "1 return" : `${k} returns`, k === 1 ? "مرتجع واحد" : k === 2 ? "مرتجعان" : `${k} مرتجعات`];
const partyName = (d: Doc) => s(d["customer_name"] || d["party_name"] || d["customer"]);

export interface RailStage { id: "quotes" | "orders" | "delivery" | "billing" | "collection"; label: Bi; measure: Bi; status: Status; count: number; unit: Bi; totals: Totals; qty?: number | undefined; sub?: Bi | undefined; subTone?: "warn" | undefined; drill: Drill; next: Bi }

export function sellingRail(company: string, currency: string, user = currentUser(), today = todayIso()): RailStage[] {
  const out: RailStage[] = [];
  const qSt = companyScope("Quotation", company, user);
  const qs = qSt === "ok" ? scopedList("Quotation", user).filter((d) => d["company"] === company && n(d.docstatus) === 1 && OPEN_QUOTE.includes(s(d["status"]))) : [];
  const exp = qs.filter((d) => s(d["valid_till"]) && s(d["valid_till"]) <= addDays(today, 7));
  out.push({ id: "quotes", label: ["Quotations", "عروض الأسعار"], measure: ["Open quotation value", "قيمة العروض المفتوحة"], status: qSt, count: qs.length, unit: ["open", "مفتوحة"], totals: byCurrency(qs, (d) => n(d["grand_total"])),
    sub: exp.length ? [`${exp.length} expire within 7 days or have expired`, `${exp.length} تنتهي خلال 7 أيام أو منتهية`] : undefined, subTone: exp.length ? "warn" : undefined,
    drill: { kind: "list", doctype: "Quotation", filters: [["docstatus", "=", 1], ["status", "in", OPEN_QUOTE], ["company", "=", company]] }, next: ["Convert to Sales Order", "تحويل إلى أمر بيع"] });
  const oSt = companyScope("Sales Order", company, user);
  const allSo = oSt === "ok" ? scopedList("Sales Order", user) : [];
  const so = allSo.filter((d) => d["company"] === company && n(d.docstatus) === 1 && TO_DELIVER.includes(s(d["status"])));
  const late = oSt === "ok" ? salesBacklog(allSo, company, today) : [];
  out.push({ id: "orders", label: ["Sales orders", "أوامر البيع"], measure: ["Order value awaiting delivery", "قيمة الأوامر بانتظار التسليم"], status: oSt, count: so.length, unit: ["to deliver", "للتسليم"], totals: byCurrency(so, (d) => n(d["grand_total"])),
    sub: late.length ? (() => { const L = lines(late.length), O = orders(new Set(late.map((l) => l.order)).size); return [`${L[0]} past delivery date on ${O[0]}`, `${L[1]} تجاوزت تاريخ التسليم في ${O[1]}`] as Bi; })() : undefined, subTone: late.length ? "warn" : undefined,
    drill: { kind: "list", doctype: "Sales Order", filters: [["docstatus", "=", 1], ["status", "in", TO_DELIVER], ["company", "=", company]] }, next: ["Create Delivery Note", "إنشاء إذن تسليم"] });
  const ub = unbilled("selling", company, "", today, user);
  const notes = new Set(ub.lines.map((l) => l.source));
  out.push({ id: "delivery", label: ["Delivered", "التسليم"], measure: ["Delivered quantity not yet invoiced (no value)", "كمية مسلّمة لم تُفوتر بعد (بدون قيمة)"], status: ub.status, count: notes.size, unit: ["delivery notes", "أذون تسليم"], totals: [], qty: ub.lines.length,
    sub: ub.lines.length ? (() => { const L = lines(ub.lines.length), u = ub.lines.filter((l) => l.uncertain).length; return (u ? [`${L[0]} · ${u} need link review`, `${L[1]} · ${u} تحتاج مراجعة الربط`] : [`${L[0]} to invoice`, `${L[1]} للفوترة`]) as Bi; })() : undefined, subTone: ub.lines.some((l) => l.uncertain) ? "warn" : undefined,
    drill: { kind: "pro", to: "/pro/delivered-not-billed", search: { company } }, next: ["Create Sales Invoice", "إنشاء فاتورة بيع"] });
  const iSt = companyScope("Sales Invoice", company, user);
  const w = mtdWindows(today);
  const si = iSt === "ok" ? scopedList("Sales Invoice", user).filter((d) => d["company"] === company && n(d.docstatus) === 1 && s(d["posting_date"]) >= w.cur.from && s(d["posting_date"]) <= w.cur.to) : [];
  const sales = si.filter((d) => !n(d["is_return"])); const rets = si.filter((d) => n(d["is_return"]));
  out.push({ id: "billing", label: ["Invoiced", "الفوترة"], measure: ["Invoiced this month (company currency)", "المفوتر هذا الشهر (عملة الشركة)"], status: iSt, count: sales.length, unit: ["invoices", "فواتير"], totals: sales.length ? [{ currency, amount: r2(sales.reduce((t, d) => t + siAmount(d), 0)) }] : [],
    sub: rets.length ? (() => { const R = returnsOf(rets.length), v = Math.abs(r2(rets.reduce((t, d) => t + siAmount(d), 0))).toLocaleString("en-US"); return [`${R[0]} ${v} shown separately`, `${R[1]} ${v} معروضة منفصلة`] as Bi; })() : undefined,
    drill: { kind: "list", doctype: "Sales Invoice", filters: [["docstatus", "=", 1], ["is_return", "=", 0], ["company", "=", company], ["posting_date", ">=", w.cur.from], ["posting_date", "<=", w.cur.to]] as Filter[] }, next: ["Record payment", "تسجيل دفعة"] });
  const ar = arRegister("receivable", company, today, user, today);
  const arSt = ar.status === "ok" ? companyScope("Sales Invoice", company, user) : ar.status;
  // Same rows as the Receivables register it opens: open invoices net of credit notes and unallocated credits.
  const open = arSt === "ok" ? ar.rows : [];
  const over = open.filter((r) => r.outstanding > 0 && r.days > 0), credits = open.filter((r) => r.outstanding < 0).length;
  out.push({ id: "collection", label: ["Collection", "التحصيل"], measure: ["Open receivables as of today, net of credits", "الذمم المفتوحة حتى اليوم بعد خصم الأرصدة الدائنة"], status: arSt, count: open.length, unit: ["open items", "بنود مفتوحة"],
    totals: byCurrency(open as unknown as Doc[], (r) => n(r["outstanding"]), (r) => s(r["currency"]) || currency),
    sub: over.length || credits ? [[over.length ? `${over.length} overdue` : "", credits ? (credits === 1 ? "1 credit" : `${credits} credits`) : ""].filter(Boolean).join(" · "), [over.length ? `${over.length} متأخرة` : "", credits ? (credits === 1 ? "رصيد دائن واحد" : `${credits} أرصدة دائنة`) : ""].filter(Boolean).join(" · ")] : undefined, subTone: over.length ? "warn" : undefined,
    drill: proDrill("/pro/receivables", { company }), next: ["Follow up the customer", "متابعة العميل"] });
  return out;
}

export type SellTab = "quotes" | "late" | "unbilled" | "collect" | "returns";
export const SELL_TABS: SellTab[] = ["quotes", "late", "unbilled", "collect", "returns"];
export interface SellItem { key: string; tab: SellTab; severity: Severity; doctype: string; name: string; party: string; date: string; age: number | null; value: string; currency: string; amount: number | null; state: Bi; next: Bi; drill: Drill }
export interface SellWork { tab: SellTab; status: SourceStatus; items: SellItem[]; register?: Drill | undefined }

export function sellingWork(company: string, currency: string, user = currentUser(), today = todayIso()): SellWork[] {
  const out: SellWork[] = [];
  const qSt = companyScope("Quotation", company, user);
  const quotes = (qSt === "ok" ? scopedList("Quotation", user) : []).filter((d) => d["company"] === company && n(d.docstatus) === 1 && OPEN_QUOTE.includes(s(d["status"])) && s(d["valid_till"]) && s(d["valid_till"]) <= addDays(today, 7))
    .map<SellItem>((d) => { const vt = s(d["valid_till"]); const expired = vt < today; return { key: `Quotation|${d.name}`, tab: "quotes", severity: expired ? "medium" : "low", doctype: "Quotation", name: d.name, party: partyName(d), date: vt, age: days(vt, today), value: "", currency: s(d["currency"]) || currency, amount: r2(n(d["grand_total"])),
      state: expired ? [`Expired ${days(vt, today)} days ago, still open`, `منتهي منذ ${days(vt, today)} يومًا وما زال مفتوحًا`] : [`Valid until ${vt}`, `ساري حتى ${vt}`], next: expired ? ["Extend validity or mark lost", "مدّد الصلاحية أو سجّله مفقودًا"] : ["Convert to Sales Order", "تحويل إلى أمر بيع"], drill: { kind: "doc", doctype: "Quotation", name: d.name } }; })
    .sort((a, b) => a.date.localeCompare(b.date));
  out.push({ tab: "quotes", status: qSt, items: quotes, register: { kind: "list", doctype: "Quotation", filters: [["docstatus", "=", 1], ["status", "in", OPEN_QUOTE], ["company", "=", company]] } });
  const oSt = companyScope("Sales Order", company, user);
  const allSo = oSt === "ok" ? scopedList("Sales Order", user) : [];
  const backlog = oSt === "ok" ? salesBacklog(allSo, company, today) : [];
  const byOrder = new Map<string, typeof backlog>(); for (const l of backlog) byOrder.set(l.order, [...(byOrder.get(l.order) ?? []), l]);
  const late = [...byOrder].map<SellItem>(([order, ls]) => { const d = allSo.find((x) => x.name === order); const due = ls[0]!.due; const age = days(due, today); return { key: `Sales Order|${order}`, tab: "late", severity: age > 14 ? "high" : "medium", doctype: "Sales Order", name: order, party: d ? partyName(d) : ls[0]!.customer, date: due, age,
    value: ls.map((l) => `${l.item} ${l.remaining} ${l.uom}`).slice(0, 2).join(" · ") + (ls.length > 2 ? ` +${ls.length - 2}` : ""), currency: s(d?.["currency"]) || currency, amount: d ? r2(n(d["grand_total"])) : null,
    state: [`${lines(ls.length)[0]} ${age} days past delivery date`, `${lines(ls.length)[1]} متأخرة ${age} يومًا عن تاريخ التسليم`], next: ["Create Delivery Note", "إنشاء إذن تسليم"], drill: { kind: "doc", doctype: "Sales Order", name: order } }; })
    .sort((a, b) => (b.age ?? 0) - (a.age ?? 0));
  out.push({ tab: "late", status: oSt, items: late, register: { kind: "list", doctype: "Sales Order", filters: [["docstatus", "=", 1], ["status", "in", TO_DELIVER], ["company", "=", company]] } });
  const ub = unbilled("selling", company, "", today, user);
  const byDn = new Map<string, typeof ub.lines>(); for (const l of ub.lines) byDn.set(l.source, [...(byDn.get(l.source) ?? []), l]);
  const unb = [...byDn].map<SellItem>(([dn, ls]) => { const age = days(ls[0]!.date, today); const unsure = ls.some((l) => l.uncertain); return { key: `Delivery Note|${dn}`, tab: "unbilled", severity: unsure ? "medium" : age > 30 ? "medium" : "low", doctype: "Delivery Note", name: dn, party: ls[0]!.party, date: ls[0]!.date, age,
    value: ls.map((l) => `${l.item} ${l.remaining} ${l.uom}`).slice(0, 2).join(" · ") + (ls.length > 2 ? ` +${ls.length - 2}` : ""), currency, amount: null,
    state: unsure ? [`${lines(ls.length)[0]} · invoice link needs review`, `${lines(ls.length)[1]} · ربط الفاتورة يحتاج مراجعة`] : [`${lines(ls.length)[0]} delivered ${age} days ago, not invoiced`, `${lines(ls.length)[1]} سُلّمت منذ ${age} يومًا ولم تُفوتر`], next: ["Create Sales Invoice", "إنشاء فاتورة بيع"], drill: { kind: "doc", doctype: "Delivery Note", name: dn } }; })
    .sort((a, b) => (b.age ?? 0) - (a.age ?? 0));
  out.push({ tab: "unbilled", status: ub.status, items: unb, register: { kind: "pro", to: "/pro/delivered-not-billed", search: { company } } });
  const ar = arRegister("receivable", company, today, user, today);
  const collect = ar.rows.filter((r) => r.outstanding > 0 && r.days > 0).sort((a, b) => b.days - a.days)
    .map<SellItem>((r) => ({ key: `Sales Invoice|${r.name}`, tab: "collect", severity: r.days > 90 ? "high" : r.days > 30 ? "medium" : "low", doctype: "Sales Invoice", name: r.name, party: r.partyName, date: r.due, age: r.days, value: "", currency: r.currency || currency, amount: r.outstanding,
      state: [`${r.days} days overdue`, `متأخرة ${r.days} يومًا`], next: ["Record payment or follow up", "سجّل دفعة أو تابع العميل"], drill: { kind: "doc", doctype: "Sales Invoice", name: r.name } }));
  out.push({ tab: "collect", status: ar.status, items: collect, register: proDrill("/pro/receivables", { company, overdue: "1" }) });
  const rs: SellItem[] = [];
  let rSt: SourceStatus = "ok";
  for (const dt of ["Sales Invoice", "Delivery Note"] as const) {
    const st = sourceStatus(dt, user); if (st !== "ok") { rSt = st; continue; }
    for (const d of scopedList(dt, user).filter((x) => x["company"] === company && n(x.docstatus) === 0 && n(x["is_return"]))) {
      const date = s(d["posting_date"]);
      rs.push({ key: `${dt}|${d.name}`, tab: "returns", severity: date && days(date, today) > 7 ? "medium" : "low", doctype: dt, name: d.name, party: partyName(d), date, age: date ? days(date, today) : null, value: s(d["return_against"]), currency: s(d["currency"]) || currency, amount: r2(n(d["grand_total"])),
        state: [`Draft return against ${s(d["return_against"]) || "—"}`, `مرتجع مسودة مقابل ${s(d["return_against"]) || "—"}`], next: ["Review and submit", "راجع واعتمد"], drill: { kind: "doc", doctype: dt, name: d.name } });
    }
  }
  rs.sort((a, b) => SEV_RANK[a.severity] - SEV_RANK[b.severity] || a.date.localeCompare(b.date));
  out.push({ tab: "returns", status: rSt, items: rs, register: { kind: "list", doctype: "Sales Invoice", filters: [["docstatus", "=", 0], ["is_return", "=", 1], ["company", "=", company]] } });
  return out;
}

/** Customer concentration of net open receivables (company currency). Shares are of the net company-currency total; other currencies are disclosed, not converted. */
export function customerConcentration(company: string, currency: string, user = currentUser(), today = todayIso()) {
  const ar = arRegister("receivable", company, today, user, today);
  const st = ar.status === "ok" ? companyScope("Sales Invoice", company, user) : ar.status;
  if (st !== "ok") return { status: st, rows: [] as { customer: string; name: string; amount: number; share: number; invoices: number; overdue: number }[], total: 0, others: 0, other: 0 };
  // Net per customer (credits included) so each bar equals the customer's rows in the Receivables register it opens.
  const rows = ar.rows.filter((r) => !r.currency || r.currency === currency);
  const by = new Map<string, { customer: string; name: string; amount: number; invoices: number; overdue: number }>();
  for (const r of rows) { const x = by.get(r.party) ?? { customer: r.party, name: r.partyName, amount: 0, invoices: 0, overdue: 0 }; x.amount = r2(x.amount + r.outstanding); x.invoices += 1; if (r.days > 0 && r.outstanding > 0) x.overdue = r2(x.overdue + r.outstanding); by.set(r.party, x); }
  const total = r2(rows.reduce((t, r) => t + r.outstanding, 0));
  const all = [...by.values()].filter((x) => x.amount > 0).sort((a, b) => b.amount - a.amount);
  const top = all.slice(0, 5).map((x) => ({ ...x, share: total > 0 ? Math.round((x.amount / total) * 1000) / 10 : 0 }));
  return { status: "ok" as const, rows: top, total, others: r2(all.slice(5).reduce((t, x) => t + x.amount, 0)), other: ar.rows.length - rows.length };
}

export interface SellMonth { month: string; from: string; to: string; invoiced: number; invoices: number; returns: number; returnCount: number; booked: number; orders: number }
/** Six-month quote-to-cash trend in company currency: invoiced (non-return) and returns from Sales Invoice, orders booked from Sales Order. Three separate bases. */
export function sellingTrend(company: string, user = currentUser(), today = todayIso(), k = 6): { status: SourceStatus; orderStatus: SourceStatus; months: SellMonth[] } {
  const status = companyScope("Sales Invoice", company, user), orderStatus = companyScope("Sales Order", company, user);
  const months = lastMonths(today, k).map<SellMonth>((m) => ({ month: m, from: `${m}-01`, to: monthEnd(m) < today ? monthEnd(m) : today, invoiced: 0, invoices: 0, returns: 0, returnCount: 0, booked: 0, orders: 0 }));
  const at = (date: string) => months.find((x) => date >= x.from && date <= x.to);
  if (status === "ok") for (const d of scopedList("Sales Invoice", user)) {
    if (d["company"] !== company || n(d.docstatus) !== 1) continue;
    const m = at(s(d["posting_date"])); if (!m) continue;
    if (n(d["is_return"])) { m.returns = r2(m.returns + Math.abs(siAmount(d))); m.returnCount++; } else { m.invoiced = r2(m.invoiced + siAmount(d)); m.invoices++; }
  }
  if (orderStatus === "ok") for (const d of scopedList("Sales Order", user)) {
    if (d["company"] !== company || n(d.docstatus) !== 1) continue;
    const m = at(s(d["transaction_date"])); if (!m) continue;
    m.booked = r2(m.booked + (n(d["base_grand_total"]) || n(d["grand_total"]))); m.orders++;
  }
  return { status, orderStatus, months };
}
export const monthDrill = (doctype: "Sales Invoice" | "Sales Order", company: string, m: { from: string; to: string }, returns = false): Drill => doctype === "Sales Order"
  ? { kind: "list", doctype, filters: [["docstatus", "=", 1], ["company", "=", company], ["transaction_date", ">=", m.from], ["transaction_date", "<=", m.to]] }
  : { kind: "list", doctype, filters: [["docstatus", "=", 1], ["is_return", "=", returns ? 1 : 0], ["company", "=", company], ["posting_date", ">=", m.from], ["posting_date", "<=", m.to]] };
