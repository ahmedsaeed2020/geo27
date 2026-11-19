/**
 * EC-R1 Enterprise Command Centers — read-only selectors for Executive Home (/pro/dashboard) and Finance Operations
 * (/pro/finance). Every figure is a sum or count of Core-owned fields reached through the permission-scoped adapter
 * (src/lib/scope.ts), reusing the existing as-of AR/AP register (aging.ts), AP due windows (apCalendar.ts), open PO
 * lines (openPo.ts), bank/payment exceptions (financeExceptions.ts) and close blockers (closeReview.ts).
 *
 * Phase 1 primitive: every signal, exception and work item carries a `Drill` — the exact destination plus the same
 * predicate (company, as-of/date window, segment) that produced the figure, so the destination rows reconcile with it.
 * Nothing is posted, allocated or stored here. Mixed currencies are never summed; missing sources are never zero.
 */
import { adapter, type Doc } from "@/lib/adapter";
import { scopedList } from "@/lib/scope";
import { currentUser, userRoles } from "@/lib/session";
import { arRegister, type ArRow, type Side } from "./aging";
import { DUE_BANDS, dueBandOf, type DueBand } from "./apCalendar";
import { openPurchaseOrders, type OpenPoLine } from "./openPo";
import { financeExceptions } from "./financeExceptions";
import { closeBlockers, companyScope, type Blocker } from "./closeReview";
import { FINANCE_DOCTYPES, sourceStatus, todayIso, type SourceStatus } from "./finance";

/* ---------------- Phase 1: decision-to-source descriptor ---------------- */
/** day/month of an ISO date for comparison labels (dates display dd/mm everywhere, visual round R3) */
const dm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
export type Filter = [string, string, string | number | (string | number)[]];
export type Drill =
  | { kind: "pro"; to: string; search: Record<string, string | undefined> }
  | { kind: "list"; doctype: string; filters: Filter[] }
  | { kind: "doc"; doctype: string; name: string }
  | { kind: "report"; name: string; filters: Record<string, string> };
/** [English, Arabic] label pair — rendered with the active language, never translated from stored data. */
export type Bi = [string, string];
export type Status = SourceStatus | "empty";
export type Severity = "high" | "medium" | "low";
export const SEV_RANK: Record<Severity, number> = { high: 0, medium: 1, low: 2 };
/** Pro register drill: company + exact predicate + `fs=drill` so URL filters win over any saved default view. */
export const proDrill = (to: string, search: Record<string, string | undefined>): Drill => ({ kind: "pro", to, search: { ...search, fs: "drill" } });

const n = (v: unknown) => Number(v) || 0;
const r2 = (x: number) => Math.round(x * 100) / 100;
const s = (v: unknown) => String(v ?? "");
const DAY = 864e5;
const at = (d: string) => Date.parse(`${d}T00:00:00Z`);
export const addDays = (d: string, k: number) => new Date(at(d) + k * DAY).toISOString().slice(0, 10);
export const monthEnd = (ym: string) => { const [y, m] = ym.split("-").map(Number) as [number, number]; return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10); };
export function lastMonths(today: string, k = 6): string[] {
  const [y, m] = today.split("-").map(Number) as [number, number];
  return Array.from({ length: k }, (_, i) => new Date(Date.UTC(y, m - 1 - (k - 1 - i), 1)).toISOString().slice(0, 7));
}
/** Month-to-date window and the same day-span of the previous month (clipped to its length) — an equal-basis comparison. */
export function mtdWindows(today: string): { cur: { from: string; to: string }; prev: { from: string; to: string } } {
  const ym = today.slice(0, 7); const day = Number(today.slice(8, 10));
  const [y, m] = ym.split("-").map(Number) as [number, number];
  const pym = new Date(Date.UTC(y, m - 2, 1)).toISOString().slice(0, 7); const pend = monthEnd(pym);
  const pday = Math.min(day, Number(pend.slice(8, 10)));
  return { cur: { from: `${ym}-01`, to: today }, prev: { from: `${pym}-01`, to: `${pym}-${String(pday).padStart(2, "0")}` } };
}
export function delta(current: number, base: number): { amount: number; percent: number | null } {
  return { amount: r2(current - base), percent: base === 0 ? null : Math.round(((current - base) / Math.abs(base)) * 1000) / 10 };
}
const worst = (...xs: SourceStatus[]): SourceStatus => xs.find((x) => x === "denied") ?? xs.find((x) => x === "unavailable") ?? "ok";
type Totals = { currency: string; amount: number }[];
function byCurrency<T>(rows: T[], cur: (r: T) => string, amt: (r: T) => number): Totals {
  const m = new Map<string, number>(); for (const r of rows) m.set(cur(r), r2((m.get(cur(r)) ?? 0) + amt(r)));
  return [...m].map(([currency, amount]) => ({ currency, amount })).sort((a, b) => b.amount - a.amount);
}

/* ---------------- Executive signals (E2) ---------------- */
export interface Signal {
  id: string; label: Bi; status: Status; value: number | null; money: boolean; currency: string; count?: number;
  asOf: string; basis: Bi; source: string; drill: Drill;
  delta?: { amount: number; percent: number | null; base: number; label: Bi };
  spark?: { label: string; value: number }[]; note?: Bi;
}

function cashSignal(company: string, currency: string, user: string, today: string): Signal {
  const st = worst(companyScope("GL Entry", company, user), sourceStatus("Account", user));
  const base = { id: "cash", label: ["Confirmed bank balance", "الرصيد البنكي المؤكد"] as Bi, money: true, currency, asOf: today, source: "GL Entry · Bank/Cash accounts",
    basis: ["Posted ledger balance of Bank and Cash accounts", "رصيد الأستاذ المرحّل لحسابات البنك والنقد"] as Bi, drill: { kind: "pro", to: "/pro/finance-intelligence", search: { company, area: "cash" } } as Drill };
  if (st !== "ok") return { ...base, status: st, value: null };
  const accts = new Set(scopedList("Account", user).filter((a) => a["company"] === company && !n(a["is_group"]) && ["Bank", "Cash"].includes(s(a["account_type"]))).map((a) => a.name));
  if (!accts.size) return { ...base, status: "empty", value: null };
  const gl = scopedList("GL Entry", user).filter((g) => g["company"] === company && !n(g["is_cancelled"]) && accts.has(s(g["account"])));
  const at = (d: string) => r2(gl.filter((g) => s(g["posting_date"]) <= d).reduce((t, g) => t + n(g["debit"]) - n(g["credit"]), 0));
  const months = lastMonths(today); const value = at(today);
  const prevEnd = addDays(`${today.slice(0, 7)}-01`, -1); const b = at(prevEnd);
  // owner notes B-04: the card opens the General Ledger on exactly these accounts for this month, whose closing balance is this value
  const drill: Drill = { kind: "pro", to: "/pro/general-ledger", search: { company, account: JSON.stringify([...accts].sort()), from_date: `${today.slice(0, 7)}-01`, to_date: today, from: "finance" } };
  return { ...base, drill, status: "ok", value, count: accts.size, delta: { ...delta(value, b), base: b, label: ["since month start", "منذ بداية الشهر"] },
    spark: months.map((m, i) => ({ label: m, value: at(i === months.length - 1 ? today : monthEnd(m)) })) };
}

/** Posted Bank/Cash ledger balance at a date (company scope fails closed when any company GL row is unreadable). */
export function cashPosition(company: string, user: string, asOf: string): { status: Status; value: number | null; accounts: number } {
  const st = worst(companyScope("GL Entry", company, user), sourceStatus("Account", user));
  if (st !== "ok") return { status: st, value: null, accounts: 0 };
  const accts = new Set(scopedList("Account", user).filter((a) => a["company"] === company && !n(a["is_group"]) && ["Bank", "Cash"].includes(s(a["account_type"]))).map((a) => a.name));
  if (!accts.size) return { status: "empty", value: null, accounts: 0 };
  const v = scopedList("GL Entry", user).filter((g) => g["company"] === company && !n(g["is_cancelled"]) && accts.has(s(g["account"])) && s(g["posting_date"]) <= asOf).reduce((t, g) => t + n(g["debit"]) - n(g["credit"]), 0);
  return { status: "ok", value: r2(v), accounts: accts.size };
}

/** One bank or cash ledger account in Cash & Banks (OWN-14): posted balance, last-30-day movements, its Bank Accounts and their unreconciled bank lines. */
export interface CashAccountRow { account: string; type: "Bank" | "Cash"; balance: number; inflow30: number; outflow30: number; lastDate: string; bankAccounts: string[]; unreconciled: number | null }
export function cashAccounts(company: string, user: string, asOf: string): { status: Status; rows: CashAccountRow[] } {
  const st = worst(companyScope("GL Entry", company, user), sourceStatus("Account", user));
  if (st !== "ok") return { status: st, rows: [] };
  const accts = scopedList("Account", user).filter((a) => a["company"] === company && !n(a["is_group"]) && ["Bank", "Cash"].includes(s(a["account_type"])));
  if (!accts.length) return { status: "empty", rows: [] };
  const from = new Date(`${asOf}T00:00:00Z`); from.setUTCDate(from.getUTCDate() - 30); const from30 = from.toISOString().slice(0, 10);
  const gl = scopedList("GL Entry", user).filter((g) => g["company"] === company && !n(g["is_cancelled"]) && s(g["posting_date"]) <= asOf);
  const bankOk = sourceStatus("Bank Account", user) === "ok"; const btOk = sourceStatus("Bank Transaction", user) === "ok";
  const banks = bankOk ? scopedList("Bank Account", user).filter((b) => !b["company"] || b["company"] === company) : [];
  const bts = btOk ? scopedList("Bank Transaction", user).filter((t) => n(t["docstatus"]) === 1 && s(t["status"]) !== "Reconciled" && s(t["status"]) !== "Cancelled") : [];
  const rows = accts.map((a): CashAccountRow => {
    const mine = gl.filter((g) => g["account"] === a.name);
    const recent = mine.filter((g) => s(g["posting_date"]) > from30);
    const ba = banks.filter((b) => b["account"] === a.name).map((b) => b.name);
    return { account: a.name, type: s(a["account_type"]) === "Cash" ? "Cash" : "Bank", balance: r2(mine.reduce((t, g) => t + n(g["debit"]) - n(g["credit"]), 0)),
      inflow30: r2(recent.reduce((t, g) => t + n(g["debit"]), 0)), outflow30: r2(recent.reduce((t, g) => t + n(g["credit"]), 0)),
      lastDate: mine.reduce((d, g) => (s(g["posting_date"]) > d ? s(g["posting_date"]) : d), ""), bankAccounts: ba,
      unreconciled: btOk && bankOk ? bts.filter((t) => ba.includes(s(t["bank_account"]))).length : null };
  });
  return { status: "ok", rows: rows.sort((x, y) => Math.abs(y.balance) - Math.abs(x.balance) || x.account.localeCompare(y.account)) };
}

function openSignal(side: Side, company: string, currency: string, user: string, today: string): Signal {
  const reg = arRegister(side, company, today, user, today);
  const recv = side === "receivable";
  const base = { id: recv ? "receivable" : "payable", label: (recv ? ["Receivables outstanding", "الذمم المدينة القائمة"] : ["Payables outstanding", "الذمم الدائنة القائمة"]) as Bi, money: true, currency, asOf: reg.asOf,
    source: `${reg.doctype}.outstanding_amount (as-of)`, basis: (recv ? ["Open invoice balances as of today, same method as Accounts Receivable", "أرصدة الفواتير المفتوحة حتى اليوم بنفس طريقة تقرير الذمم المدينة"] : ["Open invoice balances as of today, same method as Accounts Payable", "أرصدة الفواتير المفتوحة حتى اليوم بنفس طريقة تقرير الذمم الدائنة"]) as Bi,
    drill: proDrill(recv ? "/pro/receivables" : "/pro/payables", { company }) };
  // A company headline must not present a partly readable invoice set as complete: fail closed (the register itself stays row-scoped).
  const scope = reg.status === "ok" ? companyScope(reg.doctype, company, user) : reg.status;
  if (scope !== "ok") return { ...base, status: scope, value: null };
  const inCur = (rows: ArRow[]) => rows.filter((r) => !currency || !r.currency || r.currency === currency);
  const rows = inCur(reg.rows); const other = reg.rows.length - rows.length;
  const sum = (rs: ArRow[]) => r2(rs.reduce((t, r) => t + r.outstanding, 0));
  const value = sum(rows);
  const months = lastMonths(today);
  const hist = (asOf: string) => { const h = arRegister(side, company, asOf, user, today); return h.status === "ok" ? sum(inCur(h.rows)) : null; };
  const prevEnd = addDays(`${today.slice(0, 7)}-01`, -1); const b = hist(prevEnd);
  const spark = months.map((m, i) => ({ label: m, value: i === months.length - 1 ? value : hist(monthEnd(m)) }));
  return { ...base, status: rows.length ? "ok" : "empty", value: rows.length ? value : null, count: rows.filter((r) => r.outstanding > 0).length,
    ...(b !== null ? { delta: { ...delta(value, b), base: b, label: ["vs end of last month", "مقارنة بنهاية الشهر الماضي"] as Bi } } : {}),
    ...(spark.every((x) => x.value !== null) ? { spark: spark as { label: string; value: number }[] } : {}),
    ...(other ? { note: [`${other} invoices in other currencies not included`, `${other} فواتير بعملات أخرى غير مشمولة`] as Bi } : {}) };
}

/** Invoiced sales use the company-currency base amount; returns are separate and never netted silently. */
export const siAmount = (d: Doc) => n(d["base_grand_total"]) || n(d["grand_total"]);
function invoicedSignal(company: string, currency: string, user: string, today: string): Signal {
  const st = companyScope("Sales Invoice", company, user);
  const w = mtdWindows(today);
  const base = { id: "invoiced", label: ["Invoiced this month", "المفوتر هذا الشهر"] as Bi, money: true, currency, asOf: today, source: "Sales Invoice.base_grand_total by posting_date",
    basis: ["Submitted non-return sales invoices, month to date (invoiced, not recognised revenue)", "فواتير مبيعات معتمدة غير مرتجعة من بداية الشهر (مفوتر وليس إيرادًا معترفًا به)"] as Bi,
    drill: { kind: "list", doctype: "Sales Invoice", filters: [["docstatus", "=", 1], ["is_return", "=", 0], ["company", "=", company], ["posting_date", ">=", w.cur.from], ["posting_date", "<=", w.cur.to]] } as Drill };
  if (st !== "ok") return { ...base, status: st, value: null };
  const si = scopedList("Sales Invoice", user).filter((d) => n(d.docstatus) === 1 && d["company"] === company);
  const sales = si.filter((d) => !n(d["is_return"])); const rets = si.filter((d) => n(d["is_return"]));
  const inW = (rows: Doc[], f: string, t: string) => rows.filter((d) => s(d["posting_date"]) >= f && s(d["posting_date"]) <= t);
  const cur = inW(sales, w.cur.from, w.cur.to); const value = r2(cur.reduce((t, d) => t + siAmount(d), 0));
  const b = r2(inW(sales, w.prev.from, w.prev.to).reduce((t, d) => t + siAmount(d), 0));
  const ret = r2(Math.abs(inW(rets, w.cur.from, w.cur.to).reduce((t, d) => t + siAmount(d), 0)));
  return { ...base, status: "ok", value, count: cur.length, delta: { ...delta(value, b), base: b, label: [`vs ${dm(w.prev.from)}–${dm(w.prev.to)}`, `مقارنة بـ ${dm(w.prev.from)}–${dm(w.prev.to)}`] },
    spark: lastMonths(today).map((m) => ({ label: m, value: r2(sales.filter((d) => s(d["posting_date"]).slice(0, 7) === m).reduce((t, d) => t + siAmount(d), 0)) })),
    ...(ret ? { note: [`Returns this month ${ret.toLocaleString("en-US")} shown separately`, `مرتجعات هذا الشهر ${ret.toLocaleString("en-US")} معروضة منفصلة`] as Bi } : {}) };
}

function stockSignal(company: string, currency: string, user: string, today: string): Signal {
  // Enterprise Visual Round 1 X05: the card states the Stock Balance report figure — the posted Stock Ledger value of the
  // company's warehouses up to today; the Bin snapshot stays on the stock balance register with its discrepancy notice
  const st = worst(sourceStatus("Stock Ledger Entry", user), sourceStatus("Bin", user), sourceStatus("Warehouse", user));
  const base = { id: "stock", label: ["Stock value", "قيمة المخزون"] as Bi, money: true, currency, asOf: today, source: "Stock Ledger Entry.stock_value_difference",
    basis: ["Posted stock ledger value — the Stock Balance report total", "قيمة دفتر المخزون المرحّلة — إجمالي تقرير رصيد المخزون"] as Bi, drill: proDrill("/pro/stock-balance", { company }) };
  if (st !== "ok") return { ...base, status: st, value: null };
  const whs = new Set(scopedList("Warehouse", user).filter((w) => w["company"] === company).map((w) => w.name));
  const sle = scopedList("Stock Ledger Entry", user).filter((e) => whs.has(s(e["warehouse"])) && !n(e["is_cancelled"]) && s(e["posting_date"]) <= today);
  const held = scopedList("Bin", user).filter((b) => whs.has(s(b["warehouse"])) && n(b["actual_qty"]) > 0);
  return { ...base, status: sle.length ? "ok" : "empty", value: sle.length ? r2(sle.reduce((t, e) => t + n(e["stock_value_difference"]), 0)) : null, count: held.length };
}

export function execSignals(company: string, currency: string, user = currentUser(), today = todayIso()): Signal[] {
  return [cashSignal(company, currency, user, today), openSignal("receivable", company, currency, user, today), openSignal("payable", company, currency, user, today), invoicedSignal(company, currency, user, today), stockSignal(company, currency, user, today)];
}

/* ---------------- Ranked management exceptions (E3 sidebar) ---------------- */
export interface Exception { id: string; domain: Bi; label: Bi; detail: Bi; severity: Severity; status: SourceStatus; count: number; unit: Bi; totals: Totals; commitment?: boolean; drill: Drill; dest: Bi }

function apRows(company: string, user: string, today: string) {
  const reg = arRegister("payable", company, today, user, today);
  return { reg, liab: reg.rows.filter((r) => r.outstanding > 0) };
}
function depRows(company: string, user: string) {
  const st = sourceStatus("Asset Depreciation Schedule", user);
  const rows = st === "ok" ? scopedList("Asset Depreciation Schedule", user).filter((d) => n(d.docstatus) === 1 && (!d["company"] || d["company"] === company))
    .flatMap((d) => (Array.isArray(d["depreciation_schedule"]) ? (d["depreciation_schedule"] as Doc[]) : []).filter((r) => !r["journal_entry"]).map((r) => ({ schedule: d.name, asset: s(d["asset"]), date: s(r["schedule_date"]), amount: n(r["depreciation_amount"]), currency: s(d["currency"]) }))) : [];
  return { st, rows };
}

export function execExceptions(company: string, currency: string, user = currentUser(), today = todayIso()): Exception[] {
  const out: Exception[] = [];
  const ar = arRegister("receivable", company, today, user, today);
  const arOver = ar.rows.filter((r) => r.outstanding > 0 && r.days > 0);
  out.push({ id: "ar_overdue", domain: ["Receivables", "الذمم المدينة"], label: ["Overdue receivables", "ذمم مدينة متأخرة"], detail: [`${arOver.filter((r) => r.days > 90).length} over 90 days`, `${arOver.filter((r) => r.days > 90).length} أكثر من 90 يومًا`],
    severity: arOver.some((r) => r.days > 90) ? "high" : "medium", status: ar.status, count: arOver.length, unit: ["invoices", "فواتير"], totals: byCurrency(arOver, (r) => r.currency, (r) => r.outstanding),
    drill: proDrill("/pro/receivables", { company, overdue: "1" }), dest: ["Receivables · overdue", "الذمم المدينة · المتأخرة"] });
  const { reg: ap, liab } = apRows(company, user, today);
  const apOver = liab.filter((r) => dueBandOf(r.due, ap.asOf) === "overdue"); const apWeek = liab.filter((r) => dueBandOf(r.due, ap.asOf) === "w1");
  out.push({ id: "ap_overdue", domain: ["Payables", "الذمم الدائنة"], label: ["Overdue supplier invoices", "فواتير موردين متأخرة"], detail: [`${apOver.filter((r) => r.onHold).length} on hold`, `${apOver.filter((r) => r.onHold).length} موقوفة`],
    severity: apOver.length ? "high" : "low", status: ap.status, count: apOver.length, unit: ["invoices", "فواتير"], totals: byCurrency(apOver, (r) => r.currency, (r) => r.outstanding),
    drill: proDrill("/pro/payables", { company, due_band: "overdue" }), dest: ["Payables · overdue", "الذمم الدائنة · المتأخرة"] });
  out.push({ id: "ap_week", domain: ["Payables", "الذمم الدائنة"], label: ["Supplier invoices due this week", "فواتير موردين مستحقة هذا الأسبوع"], detail: [`${ap.asOf} … ${addDays(ap.asOf, 6)}`, `${ap.asOf} … ${addDays(ap.asOf, 6)}`],
    severity: "medium", status: ap.status, count: apWeek.length, unit: ["invoices", "فواتير"], totals: byCurrency(apWeek, (r) => r.currency, (r) => r.outstanding),
    drill: proDrill("/pro/payables", { company, due_band: "w1" }), dest: ["Payables · week 1", "الذمم الدائنة · الأسبوع 1"] });
  const po = openPurchaseOrders({ company, band: "overdue" }, user, today);
  out.push({ id: "po_late", domain: ["Purchasing", "المشتريات"], label: ["Late purchase-order lines", "بنود أوامر شراء متأخرة"], detail: [`${new Set(po.lines.map((l) => l.po)).size} orders · commitment, not a payable`, `${new Set(po.lines.map((l) => l.po)).size} أوامر · التزام وليس ذمة دائنة`],
    severity: po.lines.length ? "medium" : "low", status: po.status, count: po.lines.length, unit: ["lines", "بنود"], totals: byCurrency(po.lines, (l) => l.currency, (l) => l.toBill), commitment: true,
    drill: proDrill("/pro/open-purchase-orders", { company, band: "overdue" }), dest: ["Open purchase orders · overdue", "أوامر الشراء المفتوحة · المتأخرة"] });
  const bst = worst(sourceStatus("Bin", user), sourceStatus("Warehouse", user));
  const whs = bst === "ok" ? new Set(scopedList("Warehouse", user).filter((w) => w["company"] === company).map((w) => w.name)) : new Set<string>();
  const short = bst === "ok" ? scopedList("Bin", user).filter((b) => whs.has(s(b["warehouse"])) && n(b["projected_qty"]) < 0) : [];
  out.push({ id: "stock_short", domain: ["Inventory", "المخزون"], label: ["Projected stock below zero", "مخزون متوقع أقل من صفر"], detail: ["Item–warehouse pairs", "أزواج صنف–مستودع"],
    severity: short.length ? "high" : "low", status: bst, count: short.length, unit: ["items", "أصناف"], totals: [], drill: proDrill("/pro/stock-balance", { company, short: "1" }), dest: ["Stock balance · short", "رصيد المخزون · العجز"] });
  const dep = depRows(company, user); const soon = addDays(today, 30); const due = dep.rows.filter((r) => r.date && r.date <= soon);
  out.push({ id: "dep_due", domain: ["Fixed assets", "الأصول الثابتة"], label: ["Depreciation due (30 days)", "إهلاك مستحق (30 يومًا)"], detail: ["Scheduled, not yet booked — not posted GL", "مجدول ولم يُقيَّد بعد — ليس قيدًا مرحّلًا"],
    severity: due.some((r) => r.date < today) ? "medium" : "low", status: dep.st, count: due.length, unit: ["rows", "صفوف"], totals: byCurrency(due, (r) => r.currency || currency, (r) => r.amount),
    drill: { kind: "pro", to: "/pro/depreciation", search: { company, state: "unbooked", to: soon } }, dest: ["Depreciation · unbooked", "الإهلاك · غير المقيّد"] });
  const jst = sourceStatus("Journal Entry", user);
  const je = jst === "ok" ? scopedList("Journal Entry", user).filter((d) => n(d.docstatus) === 0 && d["company"] === company) : [];
  const unbal = je.filter((d) => Math.abs(n(d["total_debit"]) - n(d["total_credit"])) > 0.005);
  out.push({ id: "je_draft", domain: ["Accounting", "المحاسبة"], label: ["Draft journal entries", "قيود يومية مسودة"], detail: [`${unbal.length} unbalanced`, `${unbal.length} غير متوازنة`],
    severity: unbal.length ? "high" : je.length ? "medium" : "low", status: jst, count: je.length, unit: ["entries", "قيود"], totals: [],
    drill: { kind: "list", doctype: "Journal Entry", filters: [["docstatus", "=", 0], ["company", "=", company]] }, dest: ["Journal Entry · drafts", "القيد اليومي · المسودات"] });
  const fx = financeExceptions(company, "", today, user);
  out.push({ id: "bank_unrec", domain: ["Cash & bank", "النقد والبنوك"], label: ["Unreconciled bank lines", "حركات بنكية غير مسوّاة"], detail: [`${fx.payments.length} unallocated payments`, `${fx.payments.length} دفعات غير مخصصة`],
    severity: fx.bank.length ? "medium" : "low", status: fx.bankStatus, count: fx.bank.length, unit: ["lines", "حركات"], totals: byCurrency(fx.bank, (r) => r.currency, (r) => r.amount),
    drill: { kind: "pro", to: "/pro/bank-reconciliation", search: { company } }, dest: ["Bank reconciliation", "التسوية البنكية"] });
  return rankExceptions(out);
}
/** Open items first by severity, then by size; clear and restricted items keep their place below so nothing is hidden. */
export function rankExceptions(xs: Exception[]): Exception[] {
  const open = (e: Exception) => e.status === "ok" && e.count > 0;
  const size = (e: Exception) => e.totals.reduce((t, x) => t + Math.abs(x.amount), 0);
  return [...xs].sort((a, b) => Number(open(b)) - Number(open(a)) || SEV_RANK[a.severity] - SEV_RANK[b.severity] || size(b) - size(a) || b.count - a.count);
}

/* ---------------- Executive worklist (E4/E5) ---------------- */
export type WorkTab = "decide" | "soon";
export interface WorkItem { key: string; tab: WorkTab; severity: Severity; domain: Bi; issue: Bi; doctype: string; name: string; party: string; date: string; days: number | null; amount: number | null; currency: string; drill: Drill }

export function execWorklist(company: string, currency: string, user = currentUser(), today = todayIso()): { items: WorkItem[]; restricted: string[] } {
  const items: WorkItem[] = []; const restricted: string[] = [];
  const ar = arRegister("receivable", company, today, user, today);
  if (ar.status !== "ok") restricted.push("Sales Invoice");
  for (const r of ar.rows.filter((x) => x.outstanding > 0)) {
    const doc: Drill = { kind: "doc", doctype: "Sales Invoice", name: r.name };
    if (r.days > 0) items.push({ key: `si:${r.name}`, tab: "decide", severity: r.days > 90 ? "high" : r.days > 30 ? "medium" : "low", domain: ["Receivables", "الذمم المدينة"], issue: [`Overdue ${r.days} days`, `متأخرة ${r.days} يومًا`], doctype: "Sales Invoice", name: r.name, party: r.partyName, date: r.due, days: r.days, amount: r.outstanding, currency: r.currency || currency, drill: doc });
    else if (r.due && r.due <= addDays(today, 6)) items.push({ key: `si:${r.name}`, tab: "soon", severity: "low", domain: ["Receivables", "الذمم المدينة"], issue: ["Due within 7 days", "تستحق خلال 7 أيام"], doctype: "Sales Invoice", name: r.name, party: r.partyName, date: r.due, days: r.days, amount: r.outstanding, currency: r.currency || currency, drill: doc });
  }
  const { reg: ap, liab } = apRows(company, user, today);
  if (ap.status !== "ok") restricted.push("Purchase Invoice");
  for (const r of liab) {
    const band = dueBandOf(r.due, ap.asOf); const doc: Drill = { kind: "doc", doctype: "Purchase Invoice", name: r.name };
    if (band === "overdue") items.push({ key: `pi:${r.name}`, tab: "decide", severity: r.days > 30 ? "high" : "medium", domain: ["Payables", "الذمم الدائنة"], issue: r.onHold ? [`Overdue ${r.days} days · on hold`, `متأخرة ${r.days} يومًا · موقوفة`] : [`Overdue ${r.days} days`, `متأخرة ${r.days} يومًا`], doctype: "Purchase Invoice", name: r.name, party: r.partyName, date: r.due, days: r.days, amount: r.outstanding, currency: r.currency || currency, drill: doc });
    else if (band === "w1") items.push({ key: `pi:${r.name}`, tab: "soon", severity: "medium", domain: ["Payables", "الذمم الدائنة"], issue: ["Due this week", "تستحق هذا الأسبوع"], doctype: "Purchase Invoice", name: r.name, party: r.partyName, date: r.due, days: r.days, amount: r.outstanding, currency: r.currency || currency, drill: doc });
  }
  const po = openPurchaseOrders({ company }, user, today);
  if (po.status !== "ok") restricted.push("Purchase Order");
  const byPo = new Map<string, OpenPoLine[]>(); for (const l of po.lines.filter((x) => x.band === "overdue" || x.band === "week")) byPo.set(l.po, [...(byPo.get(l.po) ?? []), l]);
  for (const [name, ls] of byPo) {
    const late = ls.filter((l) => l.band === "overdue"); const first = [...ls].sort((a, b) => a.due.localeCompare(b.due))[0]!;
    const days = Math.round((at(today) - at(first.due)) / DAY); const cur = first.currency;
    items.push({ key: `po:${name}`, tab: late.length ? "decide" : "soon", severity: late.length ? (days > 14 ? "high" : "medium") : "low", domain: ["Purchasing", "المشتريات"],
      issue: late.length ? [`${late.length} lines late ${days} days · commitment`, `${late.length} بنود متأخرة ${days} يومًا · التزام`] : [`${ls.length} lines expected this week`, `${ls.length} بنود متوقعة هذا الأسبوع`],
      doctype: "Purchase Order", name, party: first.supplier, date: first.due, days: late.length ? days : null, amount: r2(ls.filter((l) => l.currency === cur).reduce((t, l) => t + l.toBill, 0)), currency: cur, drill: { kind: "doc", doctype: "Purchase Order", name } });
  }
  const dep = depRows(company, user); if (dep.st !== "ok") restricted.push("Asset Depreciation Schedule");
  for (const r of dep.rows.filter((x) => x.date && x.date <= addDays(today, 30))) {
    const late = r.date < today;
    items.push({ key: `dep:${r.schedule}:${r.date}`, tab: late ? "decide" : "soon", severity: late ? "medium" : "low", domain: ["Fixed assets", "الأصول الثابتة"], issue: late ? ["Scheduled depreciation not booked", "إهلاك مجدول لم يُقيَّد"] : ["Depreciation scheduled", "إهلاك مجدول"],
      doctype: "Asset", name: r.asset, party: r.schedule, date: r.date, days: late ? Math.round((at(today) - at(r.date)) / DAY) : null, amount: r2(r.amount), currency: r.currency || currency, drill: { kind: "doc", doctype: "Asset", name: r.asset } });
  }
  const jst = sourceStatus("Journal Entry", user); if (jst !== "ok") restricted.push("Journal Entry");
  for (const d of jst === "ok" ? scopedList("Journal Entry", user).filter((x) => n(x.docstatus) === 0 && x["company"] === company) : []) {
    const diff = r2(n(d["total_debit"]) - n(d["total_credit"])); if (Math.abs(diff) <= 0.005) continue;
    items.push({ key: `je:${d.name}`, tab: "decide", severity: "high", domain: ["Accounting", "المحاسبة"], issue: ["Draft journal entry is unbalanced", "قيد يومي مسودة غير متوازن"], doctype: "Journal Entry", name: d.name, party: "", date: s(d["posting_date"]), days: null, amount: diff, currency, drill: { kind: "doc", doctype: "Journal Entry", name: d.name } });
  }
  items.sort((a, b) => SEV_RANK[a.severity] - SEV_RANK[b.severity] || (b.days ?? -1) - (a.days ?? -1) || a.date.localeCompare(b.date) || a.name.localeCompare(b.name));
  return { items, restricted };
}

/* ---------------- Liquidity timing (E4 side): AR overdue by age vs AP due by week — separate bases ---------------- */
export interface TimingBar { key: string; label: Bi; amount: number; count: number; drill: Drill }
export interface Timing { status: SourceStatus; bars: TimingBar[]; total: number; other: number }
const AGE_AR: Bi[] = [["1–30 days", "1–30 يومًا"], ["31–60 days", "31–60 يومًا"], ["61–90 days", "61–90 يومًا"], ["Over 90 days", "أكثر من 90 يومًا"]];
const BAND_BI: Record<DueBand, Bi> = { overdue: ["Overdue", "متأخرة"], w1: ["Week 1", "الأسبوع 1"], w2: ["Week 2", "الأسبوع 2"], w3: ["Week 3", "الأسبوع 3"], w4: ["Week 4", "الأسبوع 4"], later: ["Later", "لاحقًا"] };
export function liquidityTiming(company: string, currency: string, user = currentUser(), today = todayIso()): { collect: Timing; pay: Timing } {
  const ar = arRegister("receivable", company, today, user, today);
  const arIn = ar.rows.filter((r) => r.outstanding > 0 && r.days > 0 && (!currency || !r.currency || r.currency === currency));
  const collect: Timing = { status: ar.status, other: ar.rows.filter((r) => r.outstanding > 0 && r.days > 0).length - arIn.length, bars: [1, 2, 3, 4].map((b) => { const rs = arIn.filter((r) => r.bucket === b); return { key: `ar:${b}`, label: AGE_AR[b - 1]!, amount: r2(rs.reduce((t, r) => t + r.outstanding, 0)), count: rs.length, drill: proDrill("/pro/receivables", { company, bucket: String(b) }) }; }), total: 0 };
  collect.total = r2(collect.bars.reduce((t, b) => t + b.amount, 0));
  const { reg: ap, liab } = apRows(company, user, today);
  const apIn = liab.filter((r) => !currency || !r.currency || r.currency === currency);
  const pay: Timing = { status: ap.status, other: liab.length - apIn.length, bars: DUE_BANDS.map((band) => { const rs = apIn.filter((r) => dueBandOf(r.due, ap.asOf) === band); return { key: `ap:${band}`, label: BAND_BI[band], amount: r2(rs.reduce((t, r) => t + r.outstanding, 0)), count: rs.length, drill: proDrill("/pro/payables", { company, due_band: band }) }; }), total: 0 };
  pay.total = r2(pay.bars.reduce((t, b) => t + b.amount, 0));
  return { collect, pay };
}

/* ---------------- Finance Operations work queue (SC-F-01 F2/F3) ---------------- */
export const FIN_TABS = ["collect", "pay", "bank", "drafts", "close", "tasks"] as const;
export type FinTab = (typeof FIN_TABS)[number];
/** Legacy `kind` links (pre-EC) keep working by mapping to the new tab. */
export const LEGACY_KIND: Record<string, FinTab> = { overdue_si: "collect", overdue_pi: "pay", unbalanced_je: "drafts", draft_je: "drafts", draft_pe: "drafts", todo: "tasks" };
export const finTabOf = (v: string | undefined): FinTab | undefined => (v && (FIN_TABS as readonly string[]).includes(v) ? (v as FinTab) : v ? LEGACY_KIND[v] : undefined);
export interface FinItem { key: string; tab: FinTab; severity: Severity; doctype: string; name: string; label?: Bi; party: string; date: string; days: number | null; amount: number | null; currency: string; state: Bi; action?: "receive" | "pay" | "reconcile" | undefined; target: Drill; reference?: { doctype: string; name: string } | undefined; totals?: Totals }
export interface FinQueue { tab: FinTab; status: SourceStatus; items: FinItem[]; register?: Drill | undefined; totals: Totals }
export interface FinanceOps { period: { from: string; to: string }; queues: FinQueue[] }

export function financeOps(company: string, currency: string, fiscalStart: string | undefined, user = currentUser(), today = todayIso()): FinanceOps {
  const from = fiscalStart && fiscalStart <= today ? fiscalStart : `${today.slice(0, 4)}-01-01`;
  const queues: FinQueue[] = [];
  const ar = arRegister("receivable", company, today, user, today);
  const collect = ar.rows.filter((r) => r.outstanding > 0 && r.days > 0).sort((a, b) => b.days - a.days || b.outstanding - a.outstanding)
    .map<FinItem>((r) => ({ key: `Sales Invoice|${r.name}`, tab: "collect", severity: r.days > 90 ? "high" : r.days > 30 ? "medium" : "low", doctype: "Sales Invoice", name: r.name, party: r.partyName, date: r.due, days: r.days, amount: r.outstanding, currency: r.currency || currency,
      state: r.status === "Partly paid" ? [`Partly paid · ${r.days} days overdue`, `مدفوعة جزئيًا · متأخرة ${r.days} يومًا`] : [`${r.days} days overdue`, `متأخرة ${r.days} يومًا`], action: "receive", target: { kind: "doc", doctype: "Sales Invoice", name: r.name } }));
  queues.push({ tab: "collect", status: ar.status, items: collect, register: proDrill("/pro/receivables", { company, overdue: "1" }), totals: byCurrency(collect, (i) => i.currency, (i) => i.amount ?? 0) });
  const { reg: ap, liab } = apRows(company, user, today);
  const pay = liab.filter((r) => ["overdue", "w1"].includes(dueBandOf(r.due, ap.asOf))).sort((a, b) => a.due.localeCompare(b.due) || b.outstanding - a.outstanding)
    .map<FinItem>((r) => { const over = dueBandOf(r.due, ap.asOf) === "overdue"; return { key: `Purchase Invoice|${r.name}`, tab: "pay", severity: r.onHold ? "medium" : over ? (r.days > 30 ? "high" : "medium") : "low", doctype: "Purchase Invoice", name: r.name, party: r.partyName, date: r.due, days: over ? r.days : null, amount: r.outstanding, currency: r.currency || currency,
      state: r.onHold ? ["On hold — payment blocked", "موقوفة — السداد محظور"] : over ? [`${r.days} days overdue`, `متأخرة ${r.days} يومًا`] : [`Due ${r.due}`, `تستحق ${r.due}`], action: r.onHold ? undefined : "pay", target: { kind: "doc", doctype: "Purchase Invoice", name: r.name } }; });
  queues.push({ tab: "pay", status: ap.status, items: pay, register: proDrill("/pro/payables", { company, due_band: "overdue" }), totals: byCurrency(pay, (i) => i.currency, (i) => i.amount ?? 0) });
  const fx = financeExceptions(company, "", today, user);
  const bank = [
    ...fx.bank.map<FinItem>((b) => { const age = Math.round((at(today) - at(b.date)) / DAY); return { key: `Bank Transaction|${b.name}`, tab: "bank", severity: age > 30 ? "high" : "medium", doctype: "Bank Transaction", name: b.name, party: b.party, date: b.date, days: age, amount: b.amount, currency: b.currency || currency, state: [`Unreconciled ${b.direction}`, b.direction === "deposit" ? "إيداع غير مسوّى" : "سحب غير مسوّى"], action: "reconcile", target: { kind: "pro", to: "/pro/bank-reconciliation", search: { company, sel: b.name } } }; }),
    ...fx.payments.map<FinItem>((p) => ({ key: `Payment Entry|${p.name}`, tab: "bank", severity: "low", doctype: "Payment Entry", name: p.name, party: p.party, date: p.date, days: null, amount: p.amount, currency: p.currency || currency, state: ["Posted payment not allocated", "دفعة مرحّلة غير مخصصة"], target: { kind: "doc", doctype: "Payment Entry", name: p.name } })),
  ];
  queues.push({ tab: "bank", status: worst(fx.bankStatus, fx.paymentStatus), items: bank, register: { kind: "pro", to: "/pro/bank-reconciliation", search: { company } }, totals: byCurrency(bank, (i) => i.currency, (i) => i.amount ?? 0) });
  const jst = sourceStatus("Journal Entry", user), pst = sourceStatus("Payment Entry", user);
  const drafts = [
    ...(jst === "ok" ? scopedList("Journal Entry", user).filter((d) => n(d.docstatus) === 0 && d["company"] === company) : []).map<FinItem>((d) => { const diff = r2(n(d["total_debit"]) - n(d["total_credit"])); const unb = Math.abs(diff) > 0.005; return { key: `Journal Entry|${d.name}`, tab: "drafts", severity: unb ? "high" : "medium", doctype: "Journal Entry", name: d.name, party: s(d["title"] || d["voucher_type"]), date: s(d["posting_date"]), days: null, amount: unb ? diff : r2(n(d["total_debit"])), currency, state: unb ? ["Unbalanced draft — cannot submit", "مسودة غير متوازنة — لا يمكن اعتمادها"] : ["Draft — review and submit", "مسودة — راجع واعتمد"], target: { kind: "doc", doctype: "Journal Entry", name: d.name } }; }),
    ...(pst === "ok" ? scopedList("Payment Entry", user).filter((d) => n(d.docstatus) === 0 && d["company"] === company) : []).map<FinItem>((d) => ({ key: `Payment Entry|${d.name}`, tab: "drafts", severity: "low", doctype: "Payment Entry", name: d.name, party: s(d["party"]), date: s(d["posting_date"]), days: null, amount: r2(n(d["paid_amount"])), currency: s(d["paid_from_account_currency"]) || currency, state: ["Draft payment — review and submit", "دفعة مسودة — راجع واعتمد"], target: { kind: "doc", doctype: "Payment Entry", name: d.name } })),
  ].sort((a, b) => SEV_RANK[a.severity] - SEV_RANK[b.severity] || a.date.localeCompare(b.date));
  queues.push({ tab: "drafts", status: worst(jst, pst), items: drafts, register: { kind: "list", doctype: "Journal Entry", filters: [["docstatus", "=", 0], ["company", "=", company]] }, totals: [] });
  const blockers = closeBlockers(company, from, today, user, today);
  const periodRoute: Drill = { kind: "pro", to: "/pro/period-control", search: { company, from_date: from, to_date: today } };
  const close = blockers.filter((b) => b.status === "ok" && b.count > 0).map<FinItem>((b) => ({ key: `close|${b.id}`, tab: "close", severity: b.group === "ledger" ? "high" : "medium", doctype: "", name: b.id, label: b.label, party: "", date: "", days: null, amount: null, currency, totals: b.totals,
    state: [`${b.count} to review`, `${b.count} للمراجعة`], target: blockerDrill(b, periodRoute) }));
  const restricted = blockers.filter((b) => b.status !== "ok").length;
  queues.push({ tab: "close", status: close.length || restricted < blockers.length ? "ok" : (blockers[0]?.status ?? "ok"), items: close, register: periodRoute, totals: [] });
  const tst = sourceStatus("ToDo", user);
  const tasks = (tst === "ok" ? scopedList("ToDo", user).filter((d) => d["status"] === "Open" && d["allocated_to"] === user && FINANCE_DOCTYPES.includes(s(d["reference_type"]))) : [])
    .map<FinItem>((d) => ({ key: `ToDo|${d.name}`, tab: "tasks", severity: s(d["date"]) && s(d["date"]) < today ? "medium" : "low", doctype: "ToDo", name: d.name, party: s(d["description"]).replace(/<[^>]+>/g, "").slice(0, 80), date: s(d["date"]), days: null, amount: null, currency, state: ["Assigned to me", "مُسندة إليّ"], target: { kind: "doc", doctype: s(d["reference_type"]), name: s(d["reference_name"]) }, reference: { doctype: s(d["reference_type"]), name: s(d["reference_name"]) } }));
  queues.push({ tab: "tasks", status: tst, items: tasks, totals: [] });
  return { period: { from, to: today }, queues };
}
/** A blocker opens the same records it counted: list/route targets as-is; on-page anchors open Period Control for the same period. */
export function blockerDrill(b: Blocker, periodRoute: Drill): Drill {
  const t = b.target;
  if (t.kind === "list") return { kind: "list", doctype: t.doctype, filters: t.filters as Filter[] };
  if (t.kind === "route") return { kind: "pro", to: t.to, search: t.search };
  return periodRoute;
}

/** Finance operational cards (F2) — derived from the same queues, so a card total equals its tab and its drill. */
export interface OpsCard { id: FinTab; label: Bi; status: SourceStatus; count: number; totals: Totals; sub?: Bi; severity: Severity; drill: Drill }
export function opsCards(ops: FinanceOps, company: string, user = currentUser(), today = todayIso()): OpsCard[] {
  const q = (t: FinTab) => ops.queues.find((x) => x.tab === t)!;
  const collect = q("collect"), pay = q("pay"), bank = q("bank"), drafts = q("drafts"), close = q("close");
  const over = pay.items.filter((i) => i.days !== null); const week = pay.items.filter((i) => i.days === null);
  const je = drafts.items.filter((i) => i.doctype === "Journal Entry"); const unb = je.filter((i) => i.severity === "high");
  const bt = bank.items.filter((i) => i.doctype === "Bank Transaction");
  void user; void today;
  return [
    { id: "collect", label: ["Overdue receivables", "ذمم مدينة متأخرة"], status: collect.status, count: collect.items.length, totals: collect.totals, severity: collect.items.some((i) => i.severity === "high") ? "high" : collect.items.length ? "medium" : "low", sub: [`${collect.items.filter((i) => (i.days ?? 0) > 90).length} over 90 days`, `${collect.items.filter((i) => (i.days ?? 0) > 90).length} أكثر من 90 يومًا`], drill: collect.register! },
    { id: "pay", label: ["Supplier invoices overdue", "فواتير موردين متأخرة"], status: pay.status, count: over.length, totals: byCurrency(over, (i) => i.currency, (i) => i.amount ?? 0), severity: over.length ? "high" : "low", sub: [`${week.length} more due this week`, `${week.length} أخرى تستحق هذا الأسبوع`], drill: proDrill("/pro/payables", { company, due_band: "overdue" }) },
    { id: "bank", label: ["Unreconciled bank lines", "حركات بنكية غير مسوّاة"], status: bank.status, count: bt.length, totals: byCurrency(bt, (i) => i.currency, (i) => i.amount ?? 0), severity: bt.some((i) => i.severity === "high") ? "high" : bt.length ? "medium" : "low", sub: [`${bank.items.length - bt.length} unallocated payments`, `${bank.items.length - bt.length} دفعات غير مخصصة`], drill: bank.register! },
    { id: "drafts", label: ["Draft journal entries", "قيود يومية مسودة"], status: drafts.status, count: je.length, totals: [], severity: unb.length ? "high" : je.length ? "medium" : "low", sub: [`${unb.length} unbalanced`, `${unb.length} غير متوازنة`], drill: drafts.register! },
    { id: "close", label: ["Close blockers", "عوائق الإقفال"], status: close.status, count: close.items.length, totals: [], severity: close.items.some((i) => i.severity === "high") ? "high" : close.items.length ? "medium" : "low", sub: [`${ops.period.from} … ${ops.period.to}`, `${ops.period.from} … ${ops.period.to}`], drill: close.register! },
  ];
}

/** Role label for the context bar — the simulated session's roles, never granting anything. */
export const roleLabel = (user: string) => (user === "Administrator" ? "Administrator" : userRoles(user).filter((x) => !["All", "Guest", "Desk User"].includes(x)).slice(0, 3).join(" · ") || "—");
/** Latest modification timestamp across the given source DocTypes (data freshness, not a real-time claim). */
export function freshness(doctypes: string[], user = currentUser()): string {
  // Synthetic records can carry future timestamps; freshness never claims a time later than now.
  let max = ""; const now = new Date().toISOString().replace("T", " ").slice(0, 19);
  for (const dt of doctypes) if (sourceStatus(dt, user) === "ok") for (const d of scopedList(dt, user)) { const m = s(d["modified"]).replace("T", " "); if (m > max && m <= now) max = m; }
  return max.slice(0, 16);
}
export const COMMAND_DOCTYPES = ["Sales Invoice", "Purchase Invoice", "GL Entry", "Account", "Bin", "Warehouse", "Purchase Order", "Purchase Receipt", "Asset", "Asset Depreciation Schedule", "Journal Entry", "Payment Entry", "Bank Transaction", "Bank Account", "Period Closing Voucher", "ToDo", "Item", "Stock Ledger Entry", "Accounting Dimension", "Cost Center", "Project", "Fiscal Year"];
export { adapter };
