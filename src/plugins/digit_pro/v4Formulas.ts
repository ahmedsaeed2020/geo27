/**
 * DIGIT Pro V4 dashboard insight formulas (owner master 2026-11-11). One named formula per business question, read from
 * native submitted records through the v4Kit permission-scoped reader; v4Insights.ts maps every V4I id to one of these.
 * Definitions where the source gave none (owner decision "build it"): stated in each formula's comment.
 */
import type { Doc } from "@/lib/adapter";
import { latestStatus, providerConnected, providerFor, zatcaPrepare, STATUS_LABEL, integrationLogs } from "@/lib/coreShared/providers";
import { ksaVatReturn } from "@/lib/coreShared/ksaTax";
import { CORE_DT } from "@/lib/coreShared/doctypes";
import { listDrill, monthsBack } from "./sections";
import { arRegister } from "./aging";
import { shownName,
  addD, base, countOut, optional, dayTxt, days, drafts, groupBy, Hidden, lineAmt, lines, listIn, money, monthOut, n, notReturn, num, out, pct, pro, prevMonth, quarterStart, r2, recs, rows, s, sub, sumOut, t, topOut, ym, yearStart,
  type V4C, type V4Out,
} from "./v4Kit";

type F = (c: V4C) => V4Out;
const asOf = (c: V4C) => c.ctx.asOf;
const thisMonth = (c: V4C) => asOf(c).slice(0, 7);
const since = (f: string, from: string) => (d: Doc) => s(d[f]) >= from;
const share = (a: number, b: number) => (b ? Math.round((a / b) * 1000) / 10 : 0);

/* ---------------- shared sources ---------------- */
const SI = (c: V4C) => sub(c, "Sales Invoice", [], notReturn);
const SIret = (c: V4C) => sub(c, "Sales Invoice", [], (d) => !!n(d["is_return"]));
const PI = (c: V4C) => sub(c, "Purchase Invoice", [], notReturn);
const openSI = (c: V4C) => sub(c, "Sales Invoice", [], (d) => n(d["outstanding_amount"]) > 0);
const openPI = (c: V4C) => sub(c, "Purchase Invoice", [], (d) => n(d["outstanding_amount"]) > 0);
const overdue = (c: V4C, docs: Doc[]) => docs.filter((d) => s(d["due_date"]) && s(d["due_date"]) < asOf(c));
const openSO = (c: V4C) => sub(c, "Sales Order", [], (d) => n(d["per_delivered"]) < 100 && !["Closed", "On Hold", "Completed"].includes(s(d["status"])));
const openPO = (c: V4C) => sub(c, "Purchase Order", [], (d) => n(d["per_received"]) < 100 && !["Closed", "On Hold", "Completed", "Delivered"].includes(s(d["status"])));
const openQuote = (c: V4C) => sub(c, "Quotation", [], (d) => ["Open", "Replied"].includes(s(d["status"])));
const grni = (c: V4C) => sub(c, "Purchase Receipt", [], (d) => notReturn(d) && n(d["per_billed"]) < 100);
const dnUnbilled = (c: V4C) => sub(c, "Delivery Note", [], (d) => notReturn(d) && n(d["per_billed"]) < 100);
const pendingMR = (c: V4C) => sub(c, "Material Request", [], (d) => n(d["per_ordered"]) < 100 && !["Stopped", "Cancelled", "Ordered"].includes(s(d["status"])) && s(d["material_request_type"] || "Purchase") === "Purchase");
const outAmt = (d: Doc) => n(d["outstanding_amount"]) * (n(d["conversion_rate"]) || 1);
const branchOf = (d: Doc, l?: Doc) => s(l?.["cost_center"]) || s(d["cost_center"]) || s(l?.["warehouse"]) || s(d["set_warehouse"]);

function accounts(c: V4C) { return new Map(rows(c, "Account").map((a) => [a.name, a])); }
function gl(c: V4C, pick: (a: Doc | undefined, g: Doc) => boolean, from?: string, to?: string) {
  const A = accounts(c);
  return rows(c, "GL Entry", [], (g) => !n(g["is_cancelled"]) && (!from || s(g["posting_date"]) >= from) && (!to || s(g["posting_date"]) <= to) && pick(A.get(s(g["account"])), g));
}
const dr = (g: Doc) => n(g["debit"]) - n(g["credit"]);
const root = (...r: string[]) => (a: Doc | undefined) => r.includes(s(a?.["root_type"]));
const atype = (...ts: string[]) => (a: Doc | undefined) => ts.includes(s(a?.["account_type"]));
const glDrill = (rs: Doc[], from?: string) => listDrill("GL Entry", [["account", "in", [...new Set(rs.map((g) => s(g["account"])))]], ...(from ? [["posting_date", ">=", from] as [string, string, string]] : [])]);
/** Profit contribution of a P&L ledger line: income credits add, expense debits subtract. */
const pnl = (g: Doc) => -dr(g);
const plRows = (c: V4C, from?: string) => gl(c, root("Income", "Expense"), from);
function whSet(c: V4C) { return new Set(rows(c, "Warehouse").map((w) => w.name)); }
const bins = (c: V4C) => { const w = whSet(c); return rows(c, "Bin", [], (b) => w.has(s(b["warehouse"]))); };
const sle = (c: V4C, from?: string) => rows(c, "Stock Ledger Entry", [], (e) => !n(e["is_cancelled"]) && (!from || s(e["posting_date"]) >= from));
const itemMap = (c: V4C) => new Map(rows(c, "Item").map((i) => [i.name, i]));
function reorderOf(it: Doc | undefined, wh: string) { const r = ((it?.["reorder_levels"] as Doc[] | undefined) ?? []).find((x) => s(x["warehouse"]) === wh); return { level: r ? n(r["warehouse_reorder_level"]) : n(it?.["safety_stock"]), qty: r ? n(r["warehouse_reorder_qty"]) : 0, set: !!r }; }
const valRate = (c: V4C) => { const I = itemMap(c); const B = new Map<string, number>(); for (const b of bins(c)) if (n(b["valuation_rate"])) B.set(s(b["item_code"]), n(b["valuation_rate"])); return (code: string) => n(I.get(code)?.["valuation_rate"]) || B.get(code) || 0; };
const assets = (c: V4C) => sub(c, "Asset");
const nbv = (a: Doc) => (a["value_after_depreciation"] != null ? n(a["value_after_depreciation"]) : n(a["gross_purchase_amount"]));
function schedRows(c: V4C) { const out2: { sch: Doc; row: Doc }[] = []; for (const sch of sub(c, "Asset Depreciation Schedule")) for (const row of lines(sch, "depreciation_schedule")) out2.push({ sch, row }); return out2; }

/* ---------------- cash, ledger, profit ---------------- */
export const cashBank: F = (c) => { const g = gl(c, atype("Bank", "Cash")); const bal = g.reduce((x, e) => x + dr(e), 0);
  const banks = [...new Set(g.map((e) => s(e["account"])))].sort();
  return out(money(c, bal), t(c, `${num(banks.length)} cash and bank accounts`, `${num(banks.length)} حساب نقد وبنك`), pro(c, "/pro/general-ledger", banks.length ? { account: banks.length === 1 ? banks[0]! : JSON.stringify(banks) } : {}), g.length > 0); };
export const netProfitYtd: F = (c) => { const g = plRows(c, yearStart(c)); const A = accounts(c); const inc = g.filter((e) => s(A.get(s(e["account"]))?.["root_type"]) === "Income").reduce((x, e) => x - dr(e), 0);
  const exp = g.filter((e) => s(A.get(s(e["account"]))?.["root_type"]) === "Expense").reduce((x, e) => x + dr(e), 0);
  return out(money(c, inc - exp), t(c, `Income ${money(c, inc)} · expense ${money(c, exp)} · since ${yearStart(c)}`, `الإيراد ${money(c, inc)} · المصروف ${money(c, exp)} · منذ ${yearStart(c)}`), pro(c, "/pro/statements"), g.length > 0); };
function monthlyPnl(c: V4C, mode: "net" | "both"): V4Out {
  const ms = monthsBack(asOf(c), 6); const g = plRows(c, `${ms[0]}-01`); const A = accounts(c); const inc = new Map(ms.map((m) => [m, 0])), exp = new Map(ms.map((m) => [m, 0]));
  for (const e of g) { const m = ym(e, "posting_date"); if (!inc.has(m)) continue; if (s(A.get(s(e["account"]))?.["root_type"]) === "Income") inc.set(m, inc.get(m)! - dr(e)); else exp.set(m, exp.get(m)! + dr(e)); }
  const ti = [...inc.values()].reduce((a, b) => a + b, 0), te = [...exp.values()].reduce((a, b) => a + b, 0);
  const net = ms.map((m) => [m, inc.get(m)! - exp.get(m)!] as const); const best = [...net].sort((a, b) => b[1] - a[1])[0]!;
  const value = mode === "net" ? money(c, ti - te) : `${money(c, ti)} / ${money(c, te)}`;
  return out(value, mode === "net" ? t(c, `6 months · best ${best[0]} ${money(c, best[1])} · this month ${money(c, net[5]![1])}`, `6 أشهر · الأفضل ${best[0]} ${money(c, best[1])} · هذا الشهر ${money(c, net[5]![1])}`)
    : t(c, `Income / expense, 6 months · net ${money(c, ti - te)}`, `الإيراد / المصروف، 6 أشهر · الصافي ${money(c, ti - te)}`), glDrill(g, `${ms[0]}-01`), g.length > 0);
}
export const pnlTrend: F = (c) => monthlyPnl(c, "net");
export const incomeVsExpense: F = (c) => monthlyPnl(c, "both");
export const expenseByAccount: F = (c) => { const g = gl(c, root("Expense"), yearStart(c)); return { ...topOut(c, "GL Entry", groupBy(g, (e) => s(e["account"]), dr, (e) => e.name), { what: ["accounts", "حسابات"] }), drill: glDrill(g, yearStart(c)) }; };
export const glByAccount: F = (c) => { const from = addD(asOf(c), -30); const g = gl(c, () => true, from);
  const r = topOut(c, "GL Entry", groupBy(g, (e) => s(e["account"]), (e) => n(e["debit"]) + n(e["credit"]), (e) => e.name), { what: ["accounts", "حسابات"] });
  return { ...r, detail: r.detail ? `${r.detail} · ${t(c, "last 30 days", "آخر 30 يومًا")}` : "", drill: listDrill("GL Entry", [["posting_date", ">=", from]]) }; };
export const grossMargin: F = (c) => { const from = addD(asOf(c), -365); const g = gl(c, (a) => s(a?.["root_type"]) === "Income" || s(a?.["account_type"]) === "Cost of Goods Sold", from); const A = accounts(c);
  const inc = g.filter((e) => s(A.get(s(e["account"]))?.["root_type"]) === "Income").reduce((x, e) => x - dr(e), 0); const cogs = g.filter((e) => s(A.get(s(e["account"]))?.["account_type"]) === "Cost of Goods Sold").reduce((x, e) => x + dr(e), 0);
  return out(pct(share(inc - cogs, inc)), t(c, `Sales ${money(c, inc)} − cost of goods ${money(c, cogs)} · 12 months`, `المبيعات ${money(c, inc)} − تكلفة البضاعة ${money(c, cogs)} · 12 شهرًا`), glDrill(g, from), inc !== 0); };
export const ccProfit = (low: boolean): F => (c) => { const g = plRows(c, yearStart(c));
  const gs = groupBy(g.filter((e) => !!s(e["cost_center"]) && (!low || !/^Main\b/.test(s(e["cost_center"])))), (e) => s(e["cost_center"]), pnl, (e) => e.name);
  const r = topOut(c, "GL Entry", gs, { low, what: ["cost centers", "مراكز تكلفة"] }); return { ...r, detail: `${r.detail} · ${t(c, "profit since", "الربح منذ")} ${yearStart(c)}`, drill: pro(c, "/pro/cost-centers") }; };
export const bsMovement: F = (c) => { const g = gl(c, root("Asset", "Liability", "Equity"), yearStart(c)); const A = accounts(c); const by = (r: string) => g.filter((e) => s(A.get(s(e["account"]))?.["root_type"]) === r).reduce((x, e) => x + dr(e), 0);
  const as = by("Asset"), li = -by("Liability"), eq = -by("Equity"); return out(money(c, as), t(c, `Assets change · liabilities ${money(c, li)} · equity ${money(c, eq)} since ${yearStart(c)}`, `تغيّر الأصول · الخصوم ${money(c, li)} · حقوق الملكية ${money(c, eq)} منذ ${yearStart(c)}`), pro(c, "/pro/statements", { tab: "bs" }), g.length > 0); };
/** Unusual movement (built): an account whose last-30-day movement exceeds its prior 6-month monthly mean by more than two standard deviations. */
export const unusualAccounts: F = (c) => { const from = addD(asOf(c), -210); const g = gl(c, root("Income", "Expense", "Asset", "Liability"), from); const cut = addD(asOf(c), -30);
  const by = new Map<string, { cur: number; hist: number[] }>(); const months = monthsBack(addD(asOf(c), -31), 6);
  for (const e of g) { const a = s(e["account"]); const x = by.get(a) ?? { cur: 0, hist: months.map(() => 0) }; const v = Math.abs(dr(e)); if (s(e["posting_date"]) >= cut) x.cur += v; else { const i = months.indexOf(ym(e, "posting_date")); if (i >= 0) x.hist[i]! += v; } by.set(a, x); }
  const flagged = [...by].filter(([, x]) => { const m = x.hist.reduce((a, b) => a + b, 0) / x.hist.length; const sd = Math.sqrt(x.hist.reduce((a, b) => a + (b - m) ** 2, 0) / x.hist.length); return x.cur > 0 && x.cur > m + 2 * sd; }).sort((a, b) => b[1].cur - a[1].cur);
  return out(num(flagged.length), flagged[0] ? t(c, `Largest: ${flagged[0][0]} · ${money(c, flagged[0][1].cur)} in 30 days · of ${num(by.size)} accounts`, `الأكبر: ${flagged[0][0]} · ${money(c, flagged[0][1].cur)} خلال 30 يومًا · من ${num(by.size)} حساب`) : t(c, `${num(by.size)} accounts checked`, `فُحص ${num(by.size)} حساب`),
    flagged.length ? listDrill("GL Entry", [["account", "in", flagged.map(([a]) => a)], ["posting_date", ">=", cut]]) : listDrill("GL Entry", [["posting_date", ">=", cut]]), by.size > 0); };
export const dimensionGaps: F = (c) => { const g = gl(c, root("Income", "Expense"), yearStart(c), undefined).filter((e) => !s(e["cost_center"])); return countOut(c, "GL Entry", g, t(c, "income/expense ledger lines without a cost center", "قيود إيراد/مصروف بلا مركز تكلفة")); };

/* ---------------- receivables, payables ---------------- */
export const arTotal: F = (c) => { const d = openSI(c); return sumOut(c, "Sales Invoice", d, outAmt, t(c, `overdue ${money(c, overdue(c, d).reduce((x, y) => x + outAmt(y), 0))}`, `متأخر ${money(c, overdue(c, d).reduce((x, y) => x + outAmt(y), 0))}`)); };
export const apTotal: F = (c) => { const d = openPI(c); return sumOut(c, "Purchase Invoice", d, outAmt, t(c, `overdue ${money(c, overdue(c, d).reduce((x, y) => x + outAmt(y), 0))}`, `متأخر ${money(c, overdue(c, d).reduce((x, y) => x + outAmt(y), 0))}`)); };
export const arOverdue: F = (c) => sumOut(c, "Sales Invoice", overdue(c, openSI(c)), outAmt, t(c, "past due date", "تجاوزت تاريخ الاستحقاق"));
export const apOverdue: F = (c) => sumOut(c, "Purchase Invoice", overdue(c, openPI(c)), outAmt, t(c, "past due date", "تجاوزت تاريخ الاستحقاق"));
export const ageing = (side: "receivable" | "payable"): F => (c) => { c.reads?.add(side === "receivable" ? "Sales Invoice" : "Purchase Invoice"); const reg = arRegister(side, c.ctx.company, asOf(c), c.user, asOf(c)); if (reg.status !== "ok") throw new Hidden(reg.status);
  const open = reg.rows.filter((x) => x.outstanding > 0); const tot = open.reduce((x, r) => x + r.outstanding, 0); const late = open.filter((x) => x.days > 90).reduce((x, r) => x + r.outstanding, 0); const mid = open.filter((x) => x.days > 30 && x.days <= 90).reduce((x, r) => x + r.outstanding, 0);
  return out(money(c, tot), t(c, `31–90 days ${money(c, mid)} · over 90 ${money(c, late)}`, `31–90 يومًا ${money(c, mid)} · أكثر من 90 ${money(c, late)}`), pro(c, side === "receivable" ? "/pro/receivables" : "/pro/payables"), open.length > 0); };
export const overdueCustomers: F = (c) => { const d = overdue(c, openSI(c)); const cs = new Set(d.map((x) => s(x["customer"]))); return out(num(cs.size), t(c, `${money(c, d.reduce((x, y) => x + outAmt(y), 0))} overdue`, `${money(c, d.reduce((x, y) => x + outAmt(y), 0))} متأخرة`), listIn("Sales Invoice", d.map((x) => x.name)), cs.size > 0); };
export const topUnpaidCustomers: F = (c) => topOut(c, "Sales Invoice", groupBy(openSI(c), (d) => s(d["customer_name"]) || s(d["customer"]), outAmt, (d) => d.name), { what: ["customers", "عملاء"] });
export const supplierExposure: F = (c) => topOut(c, "Purchase Invoice", groupBy(openPI(c), (d) => s(d["supplier_name"]) || s(d["supplier"]), outAmt, (d) => d.name), { what: ["suppliers", "موردين"] });
/** Collection trend (built): DSO = open receivables ÷ sales of the last 90 days × 90. */
export const dso: F = (c) => { const ar = openSI(c).reduce((x, d) => x + outAmt(d), 0); const sales = SI(c).filter(since("posting_date", addD(asOf(c), -90))).reduce((x, d) => x + base(d, "grand_total"), 0);
  const v = sales ? r2((ar / sales) * 90) : 0; return out(dayTxt(c, v), t(c, `Open ${money(c, ar)} ÷ 90-day sales ${money(c, sales)} × 90`, `المفتوح ${money(c, ar)} ÷ مبيعات 90 يومًا ${money(c, sales)} × 90`), pro(c, "/pro/receivables"), sales > 0); };
export const receiptsTrend: F = (c) => monthOut(c, "Payment Entry", sub(c, "Payment Entry", [["payment_type", "=", "Receive"]]), "posting_date", (d) => base(d, "received_amount") || n(d["paid_amount"]));
export const cashInOut: F = (c) => { const pe = sub(c, "Payment Entry", [], since("posting_date", addD(asOf(c), -180))); const inn = pe.filter((d) => d["payment_type"] === "Receive").reduce((x, d) => x + (base(d, "received_amount") || n(d["paid_amount"])), 0);
  const o = pe.filter((d) => d["payment_type"] === "Pay").reduce((x, d) => x + (base(d, "paid_amount") || n(d["paid_amount"])), 0);
  return out(money(c, inn - o), t(c, `In ${money(c, inn)} · out ${money(c, o)} · 6 months`, `وارد ${money(c, inn)} · صادر ${money(c, o)} · 6 أشهر`), listIn("Payment Entry", pe.map((d) => d.name)), pe.length > 0); };
export const collectionRisk: F = (c) => { const od = overdue(c, openSI(c)); const rec = sub(c, "Payment Entry", [["payment_type", "=", "Receive"]], since("posting_date", addD(asOf(c), -90))).reduce((x, d) => x + (base(d, "received_amount") || n(d["paid_amount"])), 0);
  return sumOut(c, "Sales Invoice", od, outAmt, t(c, `received in 90 days ${money(c, rec)}`, `المحصّل خلال 90 يومًا ${money(c, rec)}`)); };

/* ---------------- drafts, review, close ---------------- */
export const unpostedEntries: F = (c) => { const je = drafts(c, "Journal Entry"), pe = drafts(c, "Payment Entry"); const big = je.length >= pe.length ? "Journal Entry" : "Payment Entry";
  return out(num(je.length + pe.length), t(c, `Journal ${num(je.length)} · payments ${num(pe.length)}`, `قيود ${num(je.length)} · مدفوعات ${num(pe.length)}`), listDrill(big, [["docstatus", "=", 0]]), je.length + pe.length > 0); };
export const closeReadiness: F = (c) => { const dts = ["Journal Entry", "Payment Entry", "Sales Invoice", "Purchase Invoice"] as const; const per = dts.map((d) => [d, drafts(c, d).length] as const); const total = per.reduce((x, [, k]) => x + k, 0);
  const pcv = sub(c, "Period Closing Voucher").length; const bt = sub(c, "Bank Transaction", [], (d) => s(d["status"]) === "Unreconciled").length;
  return out(num(total + bt), t(c, `Blocking drafts ${num(total)} · unreconciled bank lines ${num(bt)} · closing vouchers ${num(pcv)}`, `مسودات معلّقة ${num(total)} · حركات بنكية غير مطابقة ${num(bt)} · قيود إقفال ${num(pcv)}`), pro(c, "/pro/period-control"), true); };
export const bankUnreconciled: F = (c) => { const bt = sub(c, "Bank Transaction"); const u = bt.filter((d) => s(d["status"]) === "Unreconciled");
  return sumOut(c, "Bank Transaction", u, (d) => n(d["deposit"]) + n(d["withdrawal"]), t(c, `of ${num(bt.length)} bank lines`, `من ${num(bt.length)} حركة بنكية`)); };
export const bankReconStatus: F = (c) => { const bt = sub(c, "Bank Transaction"); const u = bt.filter((d) => s(d["status"]) === "Unreconciled").length;
  return out(pct(share(bt.length - u, bt.length)), t(c, `${num(bt.length - u)} reconciled · ${num(u)} open`, `${num(bt.length - u)} مطابقة · ${num(u)} مفتوحة`), pro(c, "/pro/bank-reconciliation"), bt.length > 0); };
/** Manual journal risk (built): submitted manual journals of 90 days without a remark or of SAR 50,000 and more. */
export const manualJournalRisk: F = (c) => { const je = sub(c, "Journal Entry", [], (d) => s(d["voucher_type"] || "Journal Entry") === "Journal Entry" && s(d["posting_date"]) >= addD(asOf(c), -90) && (!s(d["user_remark"]).trim() || n(d["total_debit"]) >= 50000));
  return sumOut(c, "Journal Entry", je, (d) => n(d["total_debit"]), t(c, "no remark or ≥ 50,000 · 90 days", "بلا بيان أو ≥ 50,000 · 90 يومًا")); };
export const financeExceptions: F = (c) => { const a = overdue(c, openSI(c)).length, b = sub(c, "Bank Transaction", [], (d) => s(d["status"]) === "Unreconciled").length;
  const old = (dt: string) => drafts(c, dt, (d) => days(s(d["posting_date"] || d["creation"]), asOf(c)) > 7).length; const dd = old("Journal Entry") + old("Payment Entry");
  const gaps = gl(c, root("Income", "Expense"), yearStart(c)).filter((e) => !s(e["cost_center"])).length;
  return out(num(a + b + dd + gaps), t(c, `Overdue invoices ${a} · bank ${b} · old drafts ${dd} · dimension gaps ${gaps}`, `فواتير متأخرة ${a} · بنك ${b} · مسودات قديمة ${dd} · فجوات أبعاد ${gaps}`), pro(c, "/pro/audit"), true); };

/* ---------------- VAT and e-invoicing ---------------- */
const vatRet = (c: V4C, from: string) => { SI(c); PI(c); return ksaVatReturn(c.ctx.company, from, asOf(c), c.user); };
export const vatPosition: F = (c) => { const v = vatRet(c, quarterStart(c)); return out(money(c, v.netDue), t(c, `Output ${money(c, v.outputVat)} − input ${money(c, v.inputVat)} · since ${quarterStart(c)}`, `المخرجات ${money(c, v.outputVat)} − المدخلات ${money(c, v.inputVat)} · منذ ${quarterStart(c)}`), pro(c, "/pro/vat"), v.outputVat !== 0 || v.inputVat !== 0); };
export const vatOutIn: F = (c) => { const v = vatRet(c, yearStart(c)); return out(`${money(c, v.outputVat)} / ${money(c, v.inputVat)}`, t(c, `Output / input VAT since ${yearStart(c)} · net ${money(c, v.netDue)}`, `ضريبة المخرجات / المدخلات منذ ${yearStart(c)} · الصافي ${money(c, v.netDue)}`), pro(c, "/pro/vat"), v.outputVat !== 0 || v.inputVat !== 0); };
export const purchaseVat: F = (c) => { const p = PI(c).filter(since("posting_date", quarterStart(c))); const noTax = p.filter((d) => !lines(d, "taxes").length);
  return sumOut(c, "Purchase Invoice", p, (d) => base(d, "total_taxes_and_charges"), t(c, `input VAT · ${num(noTax.length)} without VAT rows`, `ضريبة مدخلات · ${num(noTax.length)} بلا ضريبة`)); };
const taxRate = (d: Doc) => lines(d, "taxes").reduce((x, r) => x + n(r["rate"]), 0);
export const taxableVsExempt: F = (c) => { const si = SI(c).filter(since("posting_date", yearStart(c))); const tx = si.filter((d) => taxRate(d) > 0 && n(d["total_taxes_and_charges"]) > 0); const ex = si.filter((d) => !tx.includes(d));
  return out(`${money(c, tx.reduce((x, d) => x + base(d, "net_total"), 0))} / ${money(c, ex.reduce((x, d) => x + base(d, "net_total"), 0))}`, t(c, `Taxable / exempt or zero-rated · ${num(tx.length)} / ${num(ex.length)} invoices`, `خاضعة / معفاة أو صفرية · ${num(tx.length)} / ${num(ex.length)} فاتورة`), listIn("Sales Invoice", ex.length ? ex.map((d) => d.name) : tx.map((d) => d.name)), si.length > 0); };
export const missingTaxData: F = (c) => { const used = new Set(SI(c).map((d) => s(d["customer"]))); const cus = rows(c, "Customer", [], (d) => used.has(d.name) && !s(d["tax_id"]).trim() && s(d["customer_type"]) !== "Individual");
  const usedS = new Set(PI(c).map((d) => s(d["supplier"]))); const sup = rows(c, "Supplier", [], (d) => usedS.has(d.name) && !s(d["tax_id"]).trim());
  const noTpl = SI(c).filter((d) => !lines(d, "taxes").length).length;
  return out(num(cus.length + sup.length + noTpl), t(c, `Customers ${cus.length} · suppliers ${sup.length} without VAT number · invoices without VAT ${noTpl}`, `عملاء ${cus.length} · موردون ${sup.length} بلا رقم ضريبي · فواتير بلا ضريبة ${noTpl}`), cus.length ? listIn("Customer", cus.map((d) => d.name)) : listIn("Supplier", sup.map((d) => d.name)), true); };
export const zatcaLink: F = (c) => { rows(c, CORE_DT.provider); const p = providerFor("zatca"); const on = providerConnected("zatca"); const logs = integrationLogs({ engine: "zatca" });
  return out(on ? t(c, "Connected", "متصل") : t(c, "Not connected — invoices are prepared only", "غير متصل — تُجهَّز الفواتير فقط"), t(c, `Provider: ${p.provider.replace(/\s*\(.*?\)\s*/g, " ").trim() || "—"} · ${num(logs.length)} hand-overs logged`, `المزوّد: ${/fatoora|zatca/i.test(p.provider) ? "بوابة فاتورة" : p.provider || "—"} · ${num(logs.length)} عملية مسجّلة`), listDrill(CORE_DT.provider, []), true); };
export const zatcaIssued: F = (c) => { const si = SI(c).filter(since("posting_date", quarterStart(c))); const sent = si.filter((d) => latestStatus("zatca", "Sales Invoice", d.name) !== "Not sent").length;
  return countOut(c, "Sales Invoice", si, t(c, `${num(sent)} handed to e-invoicing · since ${quarterStart(c)}`, `${num(sent)} سُلّمت للفوترة الإلكترونية · منذ ${quarterStart(c)}`)); };
export const zatcaReview: F = (c) => { const bad = sub(c, "Sales Invoice").filter((d) => !zatcaPrepare(d).ok); return countOut(c, "Sales Invoice", bad, t(c, "fail the e-invoice checks (VAT number, submission)", "لا تجتاز فحوص الفاتورة الإلكترونية (الرقم الضريبي، الاعتماد)")); };
export const zatcaReadiness: F = (c) => { const si = sub(c, "Sales Invoice"); const okN = si.filter((d) => zatcaPrepare(d).ok); const std = okN.filter((d) => zatcaPrepare(d).kind === "standard").length;
  return out(pct(share(okN.length, si.length)), t(c, `${num(okN.length)} of ${num(si.length)} ready · standard ${std} · simplified ${okN.length - std}`, `${num(okN.length)} من ${num(si.length)} جاهزة · قياسية ${std} · مبسطة ${okN.length - std}`), listIn("Sales Invoice", okN.map((d) => d.name)), si.length > 0); };
/** Safe wording: the status shown is the provider-confirmed state only (never "accepted" before the provider says so). */
export const zatcaWording: F = (c) => { SI(c); const logs = integrationLogs({ engine: "zatca" }); const last = logs[0]; const waiting = logs.filter((l) => l.status === "Awaiting Provider" || l.status === "Prepared").length;
  return out(t(c, (STATUS_LABEL[last?.status ?? "Not sent"])[0], (STATUS_LABEL[last?.status ?? "Not sent"])[1]), t(c, `${num(waiting)} waiting for the provider · latest ${last?.reference_name ?? "—"}`, `${num(waiting)} بانتظار المزوّد · الأحدث ${last?.reference_name ?? "—"}`), listDrill(CORE_DT.integrationLog, [["engine", "=", "zatca"]]), true); };
export const taxExceptions: F = missingTaxData;

/* ---------------- selling ---------------- */
const siMonth = (c: V4C, m: string) => SI(c).filter((d) => ym(d, "posting_date") === m);
export const salesMonth: F = (c) => { const cur = siMonth(c, thisMonth(c)), last = siMonth(c, prevMonth(c)); const lv = last.reduce((x, d) => x + base(d, "grand_total"), 0);
  return sumOut(c, "Sales Invoice", cur, (d) => base(d, "grand_total"), t(c, `last month ${money(c, lv)}`, `الشهر الماضي ${money(c, lv)}`), cur.length ? undefined : listIn("Sales Invoice", last.map((d) => d.name))); };
export const salesTrend: F = (c) => monthOut(c, "Sales Invoice", SI(c), "posting_date", (d) => base(d, "grand_total"));
export const seasonality: F = (c) => { const r = monthOut(c, "Sales Invoice", SI(c), "posting_date", (d) => base(d, "grand_total"), { months: 12 }); return { ...r, detail: `${t(c, "12 months", "12 شهرًا")} · ${r.detail}` }; };
const siLines = (c: V4C, from = addD(asOf(c), -365)) => SI(c).filter(since("posting_date", from)).flatMap((d) => lines(d).map((l) => ({ d, l })));
export const salesByItemGroup: F = (c) => topOut(c, "Sales Invoice", groupBy(siLines(c), (x) => s(x.l["item_group"]), (x) => lineAmt(x.d, x.l), (x) => x.d.name), { what: ["item groups", "فئات أصناف"] });
export const salesByTerritory: F = (c) => topOut(c, "Sales Invoice", groupBy(SI(c).filter(since("posting_date", addD(asOf(c), -365))), (d) => s(d["territory"]), (d) => base(d, "grand_total"), (d) => d.name), { what: ["territories", "مناطق"] });
export const salesByBranch: F = (c) => topOut(c, "Sales Invoice", groupBy(SI(c).filter(since("posting_date", addD(asOf(c), -365))), (d) => s(d["cost_center"]) || null, (d) => base(d, "grand_total"), (d) => d.name), { what: ["branches", "فروع"] });
export const salesByCustomerGroup: F = (c) => { const cg = new Map(rows(c, "Customer").map((x) => [x.name, s(x["customer_group"])])); return topOut(c, "Sales Invoice", groupBy(SI(c), (d) => cg.get(s(d["customer"])) || null, (d) => base(d, "grand_total"), (d) => d.name), { what: ["segments", "شرائح"] }); };
const team = (d: Doc) => { const tm = lines(d, "sales_team"); const tot = tm.reduce((x, r) => x + n(r["allocated_percentage"]), 0); return tm.map((r) => ({ p: s(r["sales_person"]), w: tot ? n(r["allocated_percentage"]) / tot : 1 / tm.length })); };
export const salesByPerson: F = (c) => topOut(c, "Sales Invoice", groupBy(SI(c).flatMap((d) => team(d).map((x) => ({ d, ...x }))), (x) => x.p, (x) => base(x.d, "grand_total") * x.w, (x) => x.d.name), { what: ["sales people", "مندوبين"] });
export const personByItem: F = (c) => topOut(c, "Sales Invoice", groupBy(siLines(c).flatMap((x) => team(x.d).map((m) => ({ ...x, ...m }))), (x) => `${x.p} · ${s(x.l["item_name"]) || s(x.l["item_code"])}`, (x) => lineAmt(x.d, x.l) * x.w, (x) => x.d.name), { what: ["pairs", "أزواج"] });
export const branchByProduct: F = (c) => topOut(c, "Sales Invoice", groupBy(siLines(c).filter((x) => branchOf(x.d, x.l)), (x) => `${branchOf(x.d, x.l)} · ${s(x.l["item_group"])}`, (x) => lineAmt(x.d, x.l), (x) => x.d.name), { what: ["pairs", "أزواج"] });
export const bestSellerMonth: F = (c) => { const ms = monthsBack(asOf(c), 12).reverse(); const m = ms.find((x) => siMonth(c, x).length) ?? thisMonth(c);
  const r = topOut(c, "Sales Invoice", groupBy(siMonth(c, m).flatMap((d) => lines(d).map((l) => ({ d, l }))), (x) => s(x.l["item_name"]) || s(x.l["item_code"]), (x) => lineAmt(x.d, x.l), (x) => x.d.name), { what: ["items", "أصناف"] }); return { ...r, detail: `${m} · ${r.detail}` }; };
const itemMargin = (c: V4C) => { const vr = valRate(c); const g = new Map<string, { sale: number; cost: number; names: string[] }>();
  for (const { d, l } of siLines(c)) { const k = s(l["item_name"]) || s(l["item_code"]); const x = g.get(k) ?? { sale: 0, cost: 0, names: [] }; x.sale += lineAmt(d, l); x.cost += n(l["stock_qty"] ?? l["qty"]) * (n(l["incoming_rate"]) || vr(s(l["item_code"]))); x.names.push(d.name); g.set(k, x); }
  return [...g].filter(([, x]) => x.sale > 0).map(([k, x]) => ({ k, m: share(x.sale - x.cost, x.sale), gp: x.sale - x.cost, names: x.names })); };
export const marginItem = (low: boolean): F => (c) => { const ms = itemMargin(c).sort((a, b) => (low ? a.m - b.m : b.m - a.m) || a.k.localeCompare(b.k)); const x = ms[0];
  return x ? out(pct(x.m), t(c, `${shownName(c, x.k)} · gross profit ${money(c, x.gp)} · ${num(ms.length)} items · 12 months`, `${shownName(c, x.k)} · مجمل الربح ${money(c, x.gp)} · ${num(ms.length)} صنف · 12 شهرًا`), listIn("Sales Invoice", x.names), true) : out("0%", "", listIn("Sales Invoice", []), false); };
export const customerProfit: F = (c) => { const vr = valRate(c); return topOut(c, "Sales Invoice", groupBy(siLines(c), (x) => s(x.d["customer_name"]) || s(x.d["customer"]), (x) => lineAmt(x.d, x.l) - n(x.l["stock_qty"] ?? x.l["qty"]) * (n(x.l["incoming_rate"]) || vr(s(x.l["item_code"]))), (x) => x.d.name), { what: ["customers", "عملاء"] }); };
export const marginTrend: F = (c) => { const vr = valRate(c); const ms = monthsBack(asOf(c), 6); const by = new Map(ms.map((m) => [m, { s: 0, c: 0 }])); const names: string[] = [];
  for (const { d, l } of siLines(c, `${ms[0]}-01`)) { const x = by.get(ym(d, "posting_date")); if (!x) continue; x.s += lineAmt(d, l); x.c += n(l["stock_qty"] ?? l["qty"]) * (n(l["incoming_rate"]) || vr(s(l["item_code"]))); names.push(d.name); }
  const tot = [...by.values()].reduce((a, b) => ({ s: a.s + b.s, c: a.c + b.c }), { s: 0, c: 0 }); const lastM = [...by].reverse().find(([, x]) => x.s > 0);
  return out(pct(share(tot.s - tot.c, tot.s)), t(c, `6 months · latest ${lastM ? `${lastM[0]} ${pct(share(lastM[1].s - lastM[1].c, lastM[1].s))}` : "—"}`, `6 أشهر · الأحدث ${lastM ? `${lastM[0]} ${pct(share(lastM[1].s - lastM[1].c, lastM[1].s))}` : "—"}`), listIn("Sales Invoice", names), tot.s > 0); };
export const itemGroupTrend: F = (c) => { const a = addD(asOf(c), -90), b = addD(asOf(c), -180); const cur = new Map<string, number>(), prev = new Map<string, number>(); const names = new Map<string, string[]>();
  for (const { d, l } of siLines(c, b)) { const k = s(l["item_group"]); const tgt = s(d["posting_date"]) >= a ? cur : prev; tgt.set(k, (tgt.get(k) ?? 0) + lineAmt(d, l)); if (tgt === cur) names.set(k, [...(names.get(k) ?? []), d.name]); }
  const ch = [...new Set([...cur.keys(), ...prev.keys()])].map((k) => ({ k, d: (cur.get(k) ?? 0) - (prev.get(k) ?? 0) })).sort((x, y) => Math.abs(y.d) - Math.abs(x.d)); const x = ch[0];
  return x ? out(`${x.d >= 0 ? "+" : ""}${money(c, x.d)}`, t(c, `${shownName(c, x.k)}: last 90 days vs the 90 before · ${num(ch.length)} groups`, `${shownName(c, x.k)}: آخر 90 يومًا مقابل التسعين السابقة · ${num(ch.length)} فئة`), listIn("Sales Invoice", names.get(x.k) ?? []), true) : out(money(c, 0), "", listIn("Sales Invoice", []), false); };
export const openQuotes: F = (c) => sumOut(c, "Quotation", openQuote(c), (d) => base(d, "grand_total"));
export const quoteExpiry: F = (c) => { const q = openQuote(c).filter((d) => s(d["valid_till"]) && s(d["valid_till"]) <= addD(asOf(c), 7)); const past = q.filter((d) => s(d["valid_till"]) < asOf(c)).length;
  return sumOut(c, "Quotation", q, (d) => base(d, "grand_total"), t(c, `${num(past)} already expired · rest within 7 days`, `${num(past)} منتهية · والباقي خلال 7 أيام`)); };
/** Conversion (built): quotations of 12 months that became orders ÷ all submitted quotations of 12 months. */
export const quoteConversion: F = (c) => { const q = sub(c, "Quotation", [], since("transaction_date", addD(asOf(c), -365))); const won = q.filter((d) => ["Ordered", "Partially Ordered"].includes(s(d["status"])));
  return out(pct(share(won.length, q.length)), t(c, `${num(won.length)} ordered of ${num(q.length)} quotations · 12 months`, `${num(won.length)} تحوّلت لأوامر من ${num(q.length)} عرض · 12 شهرًا`), listIn("Quotation", won.map((d) => d.name)), q.length > 0); };
export const openOrders: F = (c) => sumOut(c, "Sales Order", openSO(c), (d) => base(d, "grand_total") * (1 - n(d["per_delivered"]) / 100), t(c, "value still to deliver", "قيمة لم تُسلّم بعد"));
export const ordersByDelivery: F = (c) => { const o = openSO(c); const late = o.filter((d) => s(d["delivery_date"]) && s(d["delivery_date"]) < asOf(c)); const week = o.filter((d) => s(d["delivery_date"]) >= asOf(c) && s(d["delivery_date"]) <= addD(asOf(c), 7));
  return out(num(late.length), t(c, `late · due this week ${num(week.length)} · later ${num(o.length - late.length - week.length)}`, `متأخرة · تستحق هذا الأسبوع ${num(week.length)} · لاحقًا ${num(o.length - late.length - week.length)}`), listIn("Sales Order", (late.length ? late : o).map((d) => d.name)), o.length > 0); };
export const deliveredNotBilled: F = (c) => sumOut(c, "Delivery Note", dnUnbilled(c), (d) => base(d, "grand_total") * (1 - n(d["per_billed"]) / 100));
export const returnsByItem: F = (c) => { const dn = sub(c, "Delivery Note", [], (d) => !!n(d["is_return"])); const all = [...dn.flatMap((d) => lines(d).map((l) => ({ dt: "Delivery Note", d, l }))), ...SIret(c).flatMap((d) => lines(d).map((l) => ({ dt: "Sales Invoice", d, l })))];
  const r = topOut(c, "Delivery Note", groupBy(all, (x) => s(x.l["item_name"]) || s(x.l["item_code"]), (x) => Math.abs(n(x.l["qty"])), (x) => x.d.name), { money: false, what: ["items", "أصناف"] });
  return { ...r, drill: dn.length ? listIn("Delivery Note", dn.map((d) => d.name)) : listIn("Sales Invoice", SIret(c).map((d) => d.name)) }; };
export const creditNotesByCustomer: F = (c) => topOut(c, "Sales Invoice", groupBy(SIret(c), (d) => s(d["customer_name"]) || s(d["customer"]), (d) => Math.abs(base(d, "grand_total")), (d) => d.name), { what: ["customers", "عملاء"] });
const firstSale = (c: V4C) => { const m = new Map<string, string>(); for (const d of SI(c)) { const k = s(d["customer"]); const p = s(d["posting_date"]); if (!m.has(k) || p < m.get(k)!) m.set(k, p); } return m; };
/** Repeat purchase (built): customers with two or more invoices in 12 months ÷ customers with any. */
export const repeatPurchase: F = (c) => { const si = SI(c).filter(since("posting_date", addD(asOf(c), -365))); const by = new Map<string, number>(); for (const d of si) by.set(s(d["customer"]), (by.get(s(d["customer"])) ?? 0) + 1);
  const rep = [...by].filter(([, k]) => k >= 2).map(([x]) => x); return out(pct(share(rep.length, by.size)), t(c, `${num(rep.length)} of ${num(by.size)} customers bought twice or more · 12 months`, `${num(rep.length)} من ${num(by.size)} عميل اشترى مرتين أو أكثر · 12 شهرًا`), listIn("Sales Invoice", si.filter((d) => rep.includes(s(d["customer"]))).map((d) => d.name)), by.size > 0); };
/** New vs repeat (built): a customer is new when the first submitted invoice is within 90 days. */
export const newVsRepeat: F = (c) => { const f = firstSale(c); const from = addD(asOf(c), -90); const active = new Set(SI(c).filter(since("posting_date", from)).map((d) => s(d["customer"]))); const nw = [...active].filter((x) => (f.get(x) ?? "") >= from);
  return out(`${num(nw.length)} / ${num(active.size - nw.length)}`, t(c, "New / repeat customers buying in the last 90 days", "عملاء جدد / متكرّرون اشتروا خلال 90 يومًا"), listIn("Sales Invoice", SI(c).filter((d) => nw.includes(s(d["customer"])) && s(d["posting_date"]) >= from).map((d) => d.name)), active.size > 0); };
/** Discount leakage (built): (price-list rate − sold rate) × qty plus document discounts, 90 days. */
export const discountLeakage: F = (c) => { const si = SI(c).filter(since("posting_date", addD(asOf(c), -90))); let lost = 0, list = 0; const names: string[] = [];
  for (const d of si) { let dl = base(d, "discount_amount"); for (const l of lines(d)) { const pl = n(l["price_list_rate"]) * n(l["qty"]); list += pl; dl += Math.max(0, pl - n(l["amount"])) * (n(d["conversion_rate"]) || 1); } lost += dl; if (dl > 0) names.push(d.name); }
  return out(money(c, lost), t(c, `${pct(share(lost, list))} of list value · ${num(names.length)} invoices · 90 days`, `${pct(share(lost, list))} من قيمة قائمة الأسعار · ${num(names.length)} فاتورة · 90 يومًا`), listIn("Sales Invoice", names), si.length > 0); };
/** Price override risk (built): sold lines more than 10% below the price list, or below the item's cost. */
export const priceOverride: F = (c) => { const vr = valRate(c); const hit = siLines(c, addD(asOf(c), -90)).filter(({ l }) => (n(l["price_list_rate"]) > 0 && n(l["rate"]) < n(l["price_list_rate"]) * 0.9) || (vr(s(l["item_code"])) > 0 && n(l["rate"]) < vr(s(l["item_code"]))));
  return out(num(hit.length), t(c, `lines >10% below the price list or below cost · ${num(new Set(hit.map((x) => x.d.name)).size)} invoices`, `بنود أقل من قائمة الأسعار بأكثر من 10% أو أقل من التكلفة · ${num(new Set(hit.map((x) => x.d.name)).size)} فاتورة`), listIn("Sales Invoice", hit.map((x) => x.d.name)), true); };
/** Sales by payment terms (built): invoices grouped by credit days (due − posting date). */
export const salesByTerms: F = (c) => { const b = (d: Doc) => { const k = days(s(d["posting_date"]), s(d["due_date"] || d["posting_date"])); return k <= 0 ? t(c, "Cash", "نقدي") : k <= 30 ? t(c, "1–30 days", "1–30 يومًا") : k <= 60 ? t(c, "31–60 days", "31–60 يومًا") : t(c, "Over 60 days", "أكثر من 60 يومًا"); };
  return topOut(c, "Sales Invoice", groupBy(SI(c), b, (d) => base(d, "grand_total"), (d) => d.name), { what: ["terms", "شروط"] }); };
/** High-value deals (built): orders and invoices of 12 months at or above twice the median value. */
export const highValueDeals: F = (c) => { const so = sub(c, "Sales Order", [], since("transaction_date", addD(asOf(c), -365))); const v = so.map((d) => base(d, "grand_total")).sort((a, b) => a - b); const med = v.length ? v[Math.floor(v.length / 2)]! : 0;
  const big = so.filter((d) => base(d, "grand_total") >= med * 2 && med > 0); return sumOut(c, "Sales Order", big, (d) => base(d, "grand_total"), t(c, `≥ 2× the median order ${money(c, med)}`, `≥ ضعف وسيط الأوامر ${money(c, med)}`)); };
export const salesExceptions: F = (c) => { const a = drafts(c, "Sales Invoice", (d) => days(s(d["posting_date"] || d["creation"]), asOf(c)) > 7).length; const b = openSO(c).filter((d) => s(d["delivery_date"]) < asOf(c)).length;
  const q = openQuote(c).filter((d) => s(d["valid_till"]) && s(d["valid_till"]) < asOf(c)).length; const dn = dnUnbilled(c).filter((d) => days(s(d["posting_date"]), asOf(c)) > 30).length;
  return out(num(a + b + q + dn), t(c, `Old invoice drafts ${a} · late orders ${b} · expired quotations ${q} · unbilled deliveries >30 days ${dn}`, `مسودات فواتير قديمة ${a} · أوامر متأخرة ${b} · عروض منتهية ${q} · تسليمات غير مفوترة >30 يومًا ${dn}`), pro(c, "/pro/order-fulfilment"), true); };
export const topCustomers: F = (c) => topOut(c, "Sales Invoice", groupBy(SI(c).filter(since("posting_date", addD(asOf(c), -365))), (d) => s(d["customer_name"]) || s(d["customer"]), (d) => base(d, "grand_total"), (d) => d.name), { what: ["customers", "عملاء"] });
export const revenueByDept: F = salesByBranch;

/* ---------------- purchasing ---------------- */
const piMonth = (c: V4C, m: string) => PI(c).filter((d) => ym(d, "posting_date") === m);
export const spendMonth: F = (c) => { const cur = piMonth(c, thisMonth(c)), last = piMonth(c, prevMonth(c)); return sumOut(c, "Purchase Invoice", cur, (d) => base(d, "grand_total"), t(c, `last month ${money(c, last.reduce((x, d) => x + base(d, "grand_total"), 0))}`, `الشهر الماضي ${money(c, last.reduce((x, d) => x + base(d, "grand_total"), 0))}`)); };
export const spendTrend: F = (c) => { const r = monthOut(c, "Purchase Order", sub(c, "Purchase Order"), "transaction_date", (d) => base(d, "grand_total")); const sq = sub(c, "Supplier Quotation", [], since("transaction_date", `${monthsBack(asOf(c), 6)[0]}-01`)).reduce((x, d) => x + base(d, "grand_total"), 0);
  return { ...r, detail: `${r.detail} · ${t(c, "offered", "المعروض")} ${money(c, sq)}` }; };
const piLines = (c: V4C) => PI(c).filter(since("posting_date", addD(asOf(c), -365))).flatMap((d) => lines(d).map((l) => ({ d, l })));
export const spendBySupplier: F = (c) => topOut(c, "Purchase Invoice", groupBy(PI(c).filter(since("posting_date", addD(asOf(c), -365))), (d) => s(d["supplier_name"]) || s(d["supplier"]), (d) => base(d, "grand_total"), (d) => d.name), { what: ["suppliers", "موردين"] });
export const spendByCategory: F = (c) => topOut(c, "Purchase Invoice", groupBy(piLines(c), (x) => s(x.l["item_group"]) || null, (x) => lineAmt(x.d, x.l), (x) => x.d.name), { what: ["categories", "فئات"] });
/** Branch of a purchase line: its own cost center/warehouse, else the warehouse of the receipt or order it was billed from. */
export const spendByBranch: F = (c) => { const pr = new Map(sub(c, "Purchase Receipt").map((d) => [d.name, d])); const po = new Map(sub(c, "Purchase Order").map((d) => [d.name, d]));
  const br = (d: Doc, l: Doc) => branchOf(d, l) || s(pr.get(s(l["purchase_receipt"]))?.["set_warehouse"]) || s(po.get(s(l["purchase_order"]))?.["set_warehouse"]) || null;
  return topOut(c, "Purchase Invoice", groupBy(piLines(c), (x) => br(x.d, x.l), (x) => lineAmt(x.d, x.l), (x) => x.d.name), { what: ["branches", "فروع"] }); };
export const spendByDept: F = (c) => { const g = gl(c, root("Expense"), yearStart(c)).filter((e) => s(e["voucher_type"]) === "Purchase Invoice" || s(e["voucher_type"]) === "Journal Entry");
  return { ...topOut(c, "GL Entry", groupBy(g, (e) => s(e["cost_center"]) || null, dr, (e) => e.name), { what: ["cost centers", "مراكز تكلفة"] }), drill: pro(c, "/pro/cost-centers") }; };
export const openPOs: F = (c) => sumOut(c, "Purchase Order", openPO(c), (d) => base(d, "grand_total") * (1 - n(d["per_received"]) / 100), t(c, "value still to receive", "قيمة لم تُستلم بعد"));
export const latePOs: F = (c) => sumOut(c, "Purchase Order", openPO(c).filter((d) => s(d["schedule_date"]) && s(d["schedule_date"]) < asOf(c)), (d) => base(d, "grand_total"), t(c, "past the required-by date", "تجاوزت تاريخ الطلب"));
export const lateBySupplier: F = (c) => topOut(c, "Purchase Order", groupBy(openPO(c).filter((d) => s(d["schedule_date"]) < asOf(c)), (d) => s(d["supplier_name"]) || s(d["supplier"]), () => 1, (d) => d.name), { money: false, fmt: (v) => num(v), what: ["suppliers", "موردين"] });
/** Supplier reliability (built): receipt lines posted on or before their order's required-by date ÷ all receipt lines with an order, 12 months. */
export const supplierReliability: F = (c) => { const po = new Map(sub(c, "Purchase Order").map((d) => [d.name, d])); let ok = 0, all = 0; const names: string[] = [];
  for (const pr of sub(c, "Purchase Receipt", [], (d) => notReturn(d) && s(d["posting_date"]) >= addD(asOf(c), -365))) for (const l of lines(pr)) { const o = po.get(s(l["purchase_order"])); if (!o) continue; all++; names.push(pr.name); if (s(pr["posting_date"]) <= s(l["schedule_date"] || o["schedule_date"])) ok++; }
  return out(pct(share(ok, all)), t(c, `${num(ok)} of ${num(all)} receipt lines on time`, `${num(ok)} من ${num(all)} بند استلام في الموعد`), listIn("Purchase Receipt", names), all > 0); };
export const receivedNotBilled: F = (c) => sumOut(c, "Purchase Receipt", grni(c), (d) => base(d, "grand_total") * (1 - n(d["per_billed"]) / 100));
export const pendingRequests: F = (c) => countOut(c, "Material Request", pendingMR(c), t(c, `oldest ${pendingMR(c).map((d) => s(d["transaction_date"])).sort()[0] ?? "—"}`, `الأقدم ${pendingMR(c).map((d) => s(d["transaction_date"])).sort()[0] ?? "—"}`));
/** Supplier quote response rate (built): suppliers asked in a submitted RFQ who answered with a Supplier Quotation ÷ suppliers asked, 12 months. */
export const quoteResponse: F = (c) => { const rfq = sub(c, "Request for Quotation", [], since("transaction_date", addD(asOf(c), -365))); const asked = rfq.flatMap((r) => lines(r, "suppliers").map((x) => ({ r: r.name, sup: s(x["supplier"]) })));
  const sq = rows(c, "Supplier Quotation", [], (d) => Number(d.docstatus) !== 2); const ans = asked.filter((a) => sq.some((q) => s(q["supplier"]) === a.sup && lines(q).some((l) => s(l["request_for_quotation"]) === a.r || !l["request_for_quotation"])));
  return out(pct(share(ans.length, asked.length)), t(c, `${num(ans.length)} of ${num(asked.length)} invitations answered`, `${num(ans.length)} من ${num(asked.length)} دعوة تمت الإجابة عليها`), listIn("Request for Quotation", rfq.map((d) => d.name)), asked.length > 0); };
const offers = (c: V4C) => { const m = new Map<string, { sup: string; rate: number; doc: string }[]>();
  for (const q of rows(c, "Supplier Quotation", [], (d) => Number(d.docstatus) !== 2)) for (const l of lines(q)) { const k = s(l["item_name"]) || s(l["item_code"]); m.set(k, [...(m.get(k) ?? []), { sup: s(q["supplier"]), rate: n(l["rate"]), doc: q.name }]); } return m; };
export const quoteComparison: F = (c) => { const sp = [...offers(c)].map(([k, o]) => { const sups = new Set(o.map((x) => x.sup)); const r = o.map((x) => x.rate).filter((x) => x > 0); return { k, n: sups.size, spread: r.length > 1 ? share(Math.max(...r) - Math.min(...r), Math.min(...r)) : 0, docs: o.map((x) => x.doc) }; }).filter((x) => x.n >= 2).sort((a, b) => b.spread - a.spread);
  return out(num(sp.length), sp[0] ? t(c, `items with 2+ supplier offers · widest gap ${sp[0].k} ${pct(sp[0].spread)}`, `أصناف بعرضين أو أكثر · أكبر فرق ${sp[0].k} ${pct(sp[0].spread)}`) : t(c, "items with 2+ supplier offers", "أصناف بعرضين أو أكثر"), listIn("Supplier Quotation", sp.flatMap((x) => x.docs)), sp.length > 0); };
const poLines = (c: V4C) => sub(c, "Purchase Order", [], since("transaction_date", addD(asOf(c), -365))).flatMap((d) => lines(d).map((l) => ({ d, l })));
/** Price review across suppliers (built): items bought from 2+ suppliers in 12 months; widest rate gap between suppliers. */
export const priceAcrossSuppliers: F = (c) => { const m = new Map<string, Map<string, number>>(); const docs = new Map<string, string[]>();
  for (const { d, l } of poLines(c)) { const k = s(l["item_name"]) || s(l["item_code"]); const x = m.get(k) ?? new Map(); x.set(s(d["supplier"]), n(l["rate"])); m.set(k, x); docs.set(k, [...(docs.get(k) ?? []), d.name]); }
  const multi = [...m].filter(([, x]) => x.size >= 2).map(([k, x]) => { const r = [...x.values()]; return { k, g: share(Math.max(...r) - Math.min(...r), Math.min(...r) || 1) }; }).sort((a, b) => b.g - a.g);
  return out(num(multi.length), multi[0] ? t(c, `items from 2+ suppliers · widest gap ${shownName(c, multi[0].k)} ${pct(multi[0].g)}`, `أصناف من موردَين أو أكثر · أكبر فرق ${shownName(c, multi[0].k)} ${pct(multi[0].g)}`) : t(c, `${num(m.size)} items bought · each from one supplier`, `${num(m.size)} صنف مشترى · كلٌّ من مورد واحد`), listIn("Purchase Order", multi.length ? multi.flatMap((x) => docs.get(x.k) ?? []) : [...docs.values()].flat()), m.size > 0); };
const supplierCount = (c: V4C) => { const m = new Map<string, { sups: Set<string>; v: number; docs: string[] }>(); for (const { d, l } of poLines(c)) { const k = s(l["item_name"]) || s(l["item_code"]); const x = m.get(k) ?? { sups: new Set(), v: 0, docs: [] }; x.sups.add(s(d["supplier"])); x.v += lineAmt(d, l); x.docs.push(d.name); m.set(k, x); } return m; };
export const singleSupplierItems: F = (c) => { const m = supplierCount(c); const one = [...m].filter(([, x]) => x.sups.size === 1).sort((a, b) => b[1].v - a[1].v);
  return out(num(one.length), one[0] ? t(c, `of ${num(m.size)} items · largest ${one[0][0]} ${money(c, one[0][1].v)}`, `من ${num(m.size)} صنف · الأكبر ${one[0][0]} ${money(c, one[0][1].v)}`) : "", listIn("Purchase Order", one.flatMap(([, x]) => x.docs)), m.size > 0); };
export const singleSourceRisk: F = (c) => { const m = supplierCount(c); const tot = [...m.values()].reduce((a, x) => a + x.v, 0); const one = [...m.values()].filter((x) => x.sups.size === 1); const v = one.reduce((a, x) => a + x.v, 0);
  return out(pct(share(v, tot)), t(c, `${money(c, v)} of ${money(c, tot)} ordered from a single supplier · 12 months`, `${money(c, v)} من ${money(c, tot)} من مورد وحيد · 12 شهرًا`), listIn("Purchase Order", one.flatMap((x) => x.docs)), tot > 0); };
/** Supplier price increases (built): latest order rate above the previous order rate for the same supplier and item. */
export const supplierPriceUp: F = (c) => { const m = new Map<string, { date: string; rate: number; doc: string }[]>(); for (const { d, l } of poLines(c)) { const k = `${s(d["supplier_name"]) || s(d["supplier"])} · ${s(l["item_name"]) || s(l["item_code"])}`; m.set(k, [...(m.get(k) ?? []), { date: s(d["transaction_date"]), rate: n(l["rate"]), doc: d.name }]); }
  const up = [...m].map(([k, xs]) => { const o = xs.sort((a, b) => a.date.localeCompare(b.date)); const a = o[o.length - 2], b = o[o.length - 1]!; return a && a.rate > 0 && b.rate > a.rate ? { k, p: share(b.rate - a.rate, a.rate), docs: [a.doc, b.doc] } : null; }).filter((x): x is { k: string; p: number; docs: string[] } => !!x).sort((a, b) => b.p - a.p);
  return out(num(up.length), up[0] ? t(c, `largest +${pct(up[0].p)} · ${up[0].k}`, `الأكبر +${pct(up[0].p)} · ${up[0].k}`) : t(c, `${num(m.size)} supplier-item prices tracked`, `${num(m.size)} سعر مورد-صنف متابع`), listIn("Purchase Order", up.flatMap((x) => x.docs)), m.size > 0); };
/** Purchase price variance (built): (invoiced rate − buying price-list rate) × qty, 12 months. */
export const purchasePriceVariance: F = (c) => { const pl = new Map<string, number>(); for (const p of rows(c, "Item Price", [], (d) => !!n(d["buying"]))) pl.set(s(p["item_code"]), n(p["price_list_rate"]));
  let v = 0; const names: string[] = []; for (const { d, l } of piLines(c)) { const ref = pl.get(s(l["item_code"])); if (!ref) continue; const dv = (n(l["rate"]) - ref) * n(l["qty"]); if (dv !== 0) { v += dv; names.push(d.name); } }
  return out(`${v >= 0 ? "+" : ""}${money(c, v)}`, t(c, `vs buying price list · ${num(new Set(names).size)} invoices · 12 months`, `مقابل قائمة أسعار الشراء · ${num(new Set(names).size)} فاتورة · 12 شهرًا`), listIn("Purchase Invoice", names), true); };
/** Matching differences (built): invoice lines whose rate differs from their order line or whose qty exceeds the order qty. */
export const matchDiffs: F = (c) => { const po = new Map<string, Doc>(); for (const d of sub(c, "Purchase Order")) for (const l of lines(d)) po.set(`${d.name}|${s(l["item_code"])}`, l); const bad: string[] = []; let checked = 0;
  for (const d of PI(c)) for (const l of lines(d)) { const o = po.get(`${s(l["purchase_order"])}|${s(l["item_code"])}`); if (!o) continue; checked++; if (Math.abs(n(l["rate"]) - n(o["rate"])) > 0.005 || n(l["qty"]) > n(o["qty"])) bad.push(d.name); }
  return out(num(bad.length), t(c, `of ${num(checked)} invoice lines linked to an order`, `من ${num(checked)} بند فاتورة مرتبط بأمر شراء`), listIn("Purchase Invoice", bad), true); };
/** New suppliers (built): first submitted order or invoice within 90 days. */
export const newSuppliers: F = (c) => { const f = new Map<string, string>(); for (const d of [...sub(c, "Purchase Order"), ...PI(c)]) { const k = s(d["supplier"]); const p = s(d["transaction_date"] || d["posting_date"]); if (!f.has(k) || p < f.get(k)!) f.set(k, p); }
  const nw = [...f].filter(([, p]) => p >= addD(asOf(c), -90)).map(([k]) => k); return out(num(nw.length), t(c, `of ${num(f.size)} active suppliers · first order in 90 days`, `من ${num(f.size)} مورد نشط · أول أمر خلال 90 يومًا`), listIn("Supplier", nw), f.size > 0); };
/** Urgent purchases (built): orders needed within two days of being raised. */
export const urgentPurchases: F = (c) => sumOut(c, "Purchase Order", sub(c, "Purchase Order", [], (d) => !!s(d["schedule_date"]) && days(s(d["transaction_date"]), s(d["schedule_date"])) <= 2), (d) => base(d, "grand_total"), t(c, "required within 2 days of ordering", "مطلوبة خلال يومين من الطلب"));
/** Approval bottlenecks (built): purchasing drafts waiting more than three days. */
export const approvalBottlenecks: F = (c) => { const dts = ["Material Request", "Purchase Order", "Purchase Invoice"]; const w = dts.flatMap((dt) => drafts(c, dt, (d) => days(s(d["transaction_date"] || d["posting_date"] || d["creation"]), asOf(c)) > 3).map((d) => ({ dt, d })));
  const oldest = w.map((x) => days(s(x.d["transaction_date"] || x.d["posting_date"] || x.d["creation"]), asOf(c))).sort((a, b) => b - a)[0] ?? 0; const big = dts.map((dt) => [dt, w.filter((x) => x.dt === dt).length] as const).sort((a, b) => b[1] - a[1])[0]!;
  return out(num(w.length), t(c, `waiting > 3 days · oldest ${num(oldest)} days`, `تنتظر أكثر من 3 أيام · الأقدم ${num(oldest)} يوم`), listIn(big[0], w.filter((x) => x.dt === big[0]).map((x) => x.d.name)), true); };
/** Order cycle time (built): average days from order date to the first receipt against it, 12 months. */
export const poCycle: F = (c) => { const po = new Map(sub(c, "Purchase Order").map((d) => [d.name, d])); const first = new Map<string, string>();
  for (const pr of sub(c, "Purchase Receipt", [], notReturn)) for (const l of lines(pr)) { const k = s(l["purchase_order"]); if (po.has(k) && (!first.has(k) || s(pr["posting_date"]) < first.get(k)!)) first.set(k, s(pr["posting_date"])); }
  const ds = [...first].map(([k, d]) => days(s(po.get(k)!["transaction_date"]), d)); const avg = ds.length ? ds.reduce((a, b) => a + b, 0) / ds.length : 0;
  return out(dayTxt(c, r2(avg)), t(c, `${num(ds.length)} orders received · longest ${num(Math.max(0, ...ds))} days`, `${num(ds.length)} أمر مستلم · الأطول ${num(Math.max(0, ...ds))} يوم`), listIn("Purchase Order", [...first.keys()]), ds.length > 0); };
export const landedCost: F = (c) => { const lcv = rows(c, "Landed Cost Voucher", [], (d) => Number(d.docstatus) !== 2); const posted = lcv.filter((d) => Number(d.docstatus) === 1).reduce((x, d) => x + n(d["total_taxes_and_charges"]), 0); const pending = lcv.filter((d) => Number(d.docstatus) === 0).reduce((x, d) => x + n(d["total_taxes_and_charges"]), 0);
  const rec = lcv.flatMap((d) => lines(d, "purchase_receipts")).reduce((x, r) => x + n(r["grand_total"]), 0);
  return out(money(c, posted + pending), t(c, `${pct(share(posted + pending, rec))} on top of receipts ${money(c, rec)} · posted ${money(c, posted)} · pending ${money(c, pending)}`, `${pct(share(posted + pending, rec))} فوق استلامات ${money(c, rec)} · مُرحّل ${money(c, posted)} · معلّق ${money(c, pending)}`), listIn("Landed Cost Voucher", lcv.map((d) => d.name)), lcv.length > 0); };
export const purchaseReturns: F = (c) => { const pr = sub(c, "Purchase Receipt", [], (d) => !!n(d["is_return"])); const pi = sub(c, "Purchase Invoice", [], (d) => !!n(d["is_return"]));
  return sumOut(c, pr.length >= pi.length ? "Purchase Receipt" : "Purchase Invoice", [...pr, ...pi], (d) => Math.abs(base(d, "grand_total")), t(c, `receipts ${pr.length} · debit notes ${pi.length}`, `استلامات ${pr.length} · إشعارات مدينة ${pi.length}`), listIn(pr.length >= pi.length ? "Purchase Receipt" : "Purchase Invoice", (pr.length >= pi.length ? pr : pi).map((d) => d.name))); };
export const blanketUse: F = (c) => { const bo = sub(c, "Blanket Order"); let q = 0, o = 0; for (const d of bo) for (const l of lines(d)) { q += n(l["qty"]); o += n(l["ordered_qty"]); }
  return out(pct(share(o, q)), t(c, `${num(o)} of ${num(q)} agreed units ordered · ${num(bo.length)} agreements`, `${num(o)} من ${num(q)} وحدة متفق عليها طُلبت · ${num(bo.length)} اتفاقية`), listIn("Blanket Order", bo.map((d) => d.name)), bo.length > 0); };
export const budgetVsActual: F = (c) => { const bud = sub(c, "Budget"); let plan = 0; const pairs: { cc: string; acc: string }[] = []; for (const b of bud) for (const l of lines(b, "accounts")) { plan += n(l["budget_amount"]); pairs.push({ cc: s(b["cost_center"]), acc: s(l["account"]) }); }
  const act = gl(c, () => true, yearStart(c)).filter((e) => pairs.some((p) => p.acc === s(e["account"]) && (!p.cc || p.cc === s(e["cost_center"])))).reduce((x, e) => x + dr(e), 0);
  return out(pct(share(act, plan)), t(c, `Actual ${money(c, act)} of budget ${money(c, plan)} · ${num(bud.length)} budgets`, `الفعلي ${money(c, act)} من الموازنة ${money(c, plan)} · ${num(bud.length)} موازنة`), listIn("Budget", bud.map((d) => d.name)), plan > 0); };
export const purchasingExceptions: F = (c) => { const a = openPO(c).filter((d) => s(d["schedule_date"]) < asOf(c)).length; const b = grni(c).filter((d) => days(s(d["posting_date"]), asOf(c)) > 30).length; const m = pendingMR(c).filter((d) => days(s(d["transaction_date"]), asOf(c)) > 14).length; const p = drafts(c, "Purchase Invoice").length;
  return out(num(a + b + m + p), t(c, `Late orders ${a} · unbilled receipts >30 days ${b} · requests >14 days ${m} · invoice drafts ${p}`, `أوامر متأخرة ${a} · استلامات غير مفوترة >30 يومًا ${b} · طلبات >14 يومًا ${m} · مسودات فواتير ${p}`), pro(c, "/pro/open-purchase-orders"), true); };
export const topSuppliers: F = spendBySupplier;

/* ---------------- inventory ---------------- */
/** Stock value as the Stock Balance report states it: posted Stock Ledger value up to the as-of date in the company's
 *  warehouses (Enterprise Visual Round 1 X05 — the card equals the report; the Bin snapshot stays on the register page). */
const ledgerValue = (c: V4C) => { const w = whSet(c); return sle(c).filter((e) => w.has(s(e["warehouse"])) && s(e["posting_date"]) <= asOf(c)).reduce((x, e) => x + n(e["stock_value_difference"]), 0); };
export const stockValue: F = (c) => { const b = bins(c); const v = ledgerValue(c); const items = new Set(b.filter((r) => n(r["actual_qty"]) > 0).map((r) => s(r["item_code"])));
  return out(money(c, v), t(c, `${num(items.size)} items in stock · ${num(new Set(b.map((r) => s(r["warehouse"]))).size)} warehouses`, `${num(items.size)} صنف بالمخزون · ${num(new Set(b.map((r) => s(r["warehouse"]))).size)} مستودع`), pro(c, "/pro/stock-value-reconciliation"), b.length > 0 || v !== 0); };
export const valueByWarehouse: F = (c) => ({ ...topOut(c, "Bin", groupBy(bins(c), (b) => s(b["warehouse"]), (b) => n(b["stock_value"]), (b) => b.name), { what: ["warehouses", "مستودعات"] }) });
export const warehouseShare: F = (c) => { const r = valueByWarehouse(c); return { ...r, detail: `${t(c, "share of stock value", "حصة من قيمة المخزون")} · ${r.detail}` }; };
const short = (c: V4C) => { const I = itemMap(c); return bins(c).filter((b) => { const ro = reorderOf(I.get(s(b["item_code"])), s(b["warehouse"])); return n(b["projected_qty"]) < 0 || (ro.level > 0 && n(b["projected_qty"]) < ro.level); }); };
export const belowReorder: F = (c) => countOut(c, "Bin", short(c), t(c, "projected below the reorder level or safety stock", "المتوقع أقل من حد إعادة الطلب أو مخزون الأمان"));
export const reorderSuggest: F = (c) => { const I = itemMap(c); const sh = short(c); const q = sh.reduce((x, b) => { const ro = reorderOf(I.get(s(b["item_code"])), s(b["warehouse"])); return x + Math.max(ro.qty, ro.level - n(b["projected_qty"])); }, 0);
  return out(num(sh.length), t(c, `suggested quantity ${num(q)}`, `الكمية المقترحة ${num(q)}`), pro(c, "/pro/stock-balance", { view: "reorder" }), sh.length > 0); };
export const noReorderLevel: F = (c) => { const it = rows(c, "Item", [], (d) => !!n(d["is_stock_item"]) && !n(d["disabled"]) && !((d["reorder_levels"] as Doc[] | undefined)?.length)); return countOut(c, "Item", it, t(c, "stock items without a reorder level", "أصناف مخزنية بلا حد إعادة طلب")); };
export const negativeRisk: F = (c) => { const b = bins(c).filter((r) => n(r["projected_qty"]) < 0 || n(r["actual_qty"]) < 0); return countOut(c, "Bin", b, t(c, `actual below zero ${b.filter((r) => n(r["actual_qty"]) < 0).length}`, `فعلي أقل من صفر ${b.filter((r) => n(r["actual_qty"]) < 0).length}`)); };
const outflow = (c: V4C, from: string) => sle(c, from).filter((e) => n(e["actual_qty"]) < 0 && s(e["voucher_type"]) !== "Stock Reconciliation");
export const fastMoving: F = (c) => { const I = itemMap(c); return topOut(c, "Stock Ledger Entry", groupBy(outflow(c, addD(asOf(c), -90)), (e) => s(I.get(s(e["item_code"]))?.["item_name"]) || s(e["item_code"]), (e) => -n(e["actual_qty"]), (e) => e.name), { money: false, fmt: (v) => num(v), what: ["items moved", "أصناف متحركة"] }); };
const lastMove = (c: V4C) => { const m = new Map<string, string>(); for (const e of sle(c)) { const k = `${s(e["item_code"])}|${s(e["warehouse"])}`; if (n(e["actual_qty"]) < 0 && s(e["posting_date"]) > (m.get(k) ?? "")) m.set(k, s(e["posting_date"])); } return m; };
const idle = (c: V4C, d: number) => { const lm = lastMove(c); const cut = addD(asOf(c), -d); return bins(c).filter((b) => n(b["actual_qty"]) > 0 && (lm.get(`${s(b["item_code"])}|${s(b["warehouse"])}`) ?? "") < cut); };
export const slowMoving: F = (c) => sumOut(c, "Bin", idle(c, 90), (b) => n(b["stock_value"]), t(c, "in stock, no issue for 90 days", "بالمخزون بلا صرف 90 يومًا"));
export const deadStock: F = (c) => sumOut(c, "Bin", idle(c, 180), (b) => n(b["stock_value"]), t(c, "in stock, no issue for 180 days", "بالمخزون بلا صرف 180 يومًا"));
/** Overstock (built): on hand above twice the last 90 days' issues (and above the reorder quantity). */
export const overstock: F = (c) => { const I = itemMap(c); const use = new Map<string, number>(); for (const e of outflow(c, addD(asOf(c), -90))) { const k = `${s(e["item_code"])}|${s(e["warehouse"])}`; use.set(k, (use.get(k) ?? 0) - n(e["actual_qty"])); }
  const b = bins(c).filter((r) => { const u = use.get(`${s(r["item_code"])}|${s(r["warehouse"])}`) ?? 0; const ro = reorderOf(I.get(s(r["item_code"])), s(r["warehouse"])); return n(r["actual_qty"]) > Math.max(2 * u, ro.qty) && u > 0; });
  return sumOut(c, "Bin", b, (r) => n(r["stock_value"]), t(c, "above 2× the 90-day issues", "أكثر من ضعف صرف 90 يومًا")); };
/** Stock-out risk (built): projected at or below zero, or days of cover below the item lead time. */
export const stockoutRisk: F = (c) => { const I = itemMap(c); const use = new Map<string, number>(); for (const e of outflow(c, addD(asOf(c), -90))) use.set(s(e["item_code"]), (use.get(s(e["item_code"])) ?? 0) - n(e["actual_qty"]));
  const b = bins(c).filter((r) => { const u = (use.get(s(r["item_code"])) ?? 0) / 90; const lt = n(I.get(s(r["item_code"]))?.["lead_time_days"]); return n(r["projected_qty"]) <= 0 && n(r["ordered_qty"]) <= 0 || (u > 0 && lt > 0 && n(r["projected_qty"]) / u < lt); });
  return countOut(c, "Bin", b, t(c, "projected ≤ 0 or cover shorter than lead time", "المتوقع ≤ صفر أو التغطية أقصر من مدة التوريد")); };
export const moveByBranch: F = (c) => topOut(c, "Stock Ledger Entry", groupBy(outflow(c, addD(asOf(c), -90)), (e) => s(e["warehouse"]), (e) => -n(e["actual_qty"]), (e) => e.name), { money: false, fmt: (v) => num(v), what: ["warehouses", "مستودعات"] });
/** Stock ageing (built): stock value of item-warehouse positions whose last receipt is older than 90 days. */
export const stockAgeing: F = (c) => { const lr = new Map<string, string>(); for (const e of sle(c)) if (n(e["actual_qty"]) > 0) { const k = `${s(e["item_code"])}|${s(e["warehouse"])}`; if (s(e["posting_date"]) > (lr.get(k) ?? "")) lr.set(k, s(e["posting_date"])); }
  const b = bins(c).filter((r) => n(r["actual_qty"]) > 0); const old = b.filter((r) => (lr.get(`${s(r["item_code"])}|${s(r["warehouse"])}`) ?? "") < addD(asOf(c), -90)); const tot = b.reduce((x, r) => x + n(r["stock_value"]), 0); const ov = old.reduce((x, r) => x + n(r["stock_value"]), 0);
  return out(money(c, ov), t(c, `${pct(share(ov, tot))} of stock value last received over 90 days ago`, `${pct(share(ov, tot))} من قيمة المخزون آخر استلام لها قبل أكثر من 90 يومًا`), listIn("Bin", old.map((r) => r.name)), b.length > 0); };
export const batchExpiry: F = (c) => { const b = rows(c, "Batch", [], (d) => !n(d["disabled"]) && !!s(d["expiry_date"]) && s(d["expiry_date"]) <= addD(asOf(c), 90)); const past = b.filter((d) => s(d["expiry_date"]) < asOf(c)).length;
  return countOut(c, "Batch", b, t(c, `expire within 90 days · already expired ${past}`, `تنتهي خلال 90 يومًا · منتهية ${past}`)); };
export const serialExceptions: F = (c) => { const sn = rows(c, "Serial No"); const bad = sn.filter((d) => (s(d["status"]) === "Active" && !s(d["warehouse"])) || ["Expired", "Inactive"].includes(s(d["status"]))); return countOut(c, "Serial No", bad, t(c, `of ${num(sn.length)} serial numbers`, `من ${num(sn.length)} رقم تسلسلي`), listIn("Serial No", bad.map((d) => d.name), [])); };
export const reconVariance: F = (c) => { const sr = sub(c, "Stock Reconciliation"); const p = drafts(c, "Stock Reconciliation").length; return sumOut(c, "Stock Reconciliation", sr, (d) => n(d["difference_amount"]), t(c, `${p} counts pending`, `${p} جرد معلّق`)); };
export const adjustmentValue: F = (c) => { const g = gl(c, atype("Stock Adjustment"), yearStart(c)); return out(money(c, g.reduce((x, e) => x + dr(e), 0)), t(c, `stock adjustment ledger since ${yearStart(c)} · ${recs(c, g.length)}`, `قيود تسوية المخزون منذ ${yearStart(c)} · ${recs(c, g.length)}`), glDrill(g, yearStart(c)), g.length > 0); };
const inTransit = (c: V4C) => sub(c, "Stock Entry", [], (d) => !!n(d["add_to_transit"]) && n(d["per_transferred"]) < 100);
export const pendingTransfers: F = (c) => sumOut(c, "Stock Entry", inTransit(c), (d) => n(d["total_outgoing_value"]), t(c, "in transit, awaiting receipt", "في الطريق بانتظار الاستلام"));
export const transferDelays: F = (c) => countOut(c, "Stock Entry", inTransit(c).filter((d) => days(s(d["posting_date"]), asOf(c)) > 3), t(c, "in transit for more than 3 days", "في الطريق أكثر من 3 أيام"));
export const stockMoves: F = (c) => { const se = sub(c, "Stock Entry", [], since("posting_date", addD(asOf(c), -90))); const by = (p: string) => se.filter((d) => s(d["purpose"]) === p).length;
  return countOut(c, "Stock Entry", se, t(c, `receipts ${by("Material Receipt")} · issues ${by("Material Issue")} · transfers ${by("Material Transfer")} · 90 days`, `استلام ${by("Material Receipt")} · صرف ${by("Material Issue")} · تحويل ${by("Material Transfer")} · 90 يومًا`)); };
export const pendingCounts: F = (c) => { const se = drafts(c, "Stock Entry"), sr = drafts(c, "Stock Reconciliation"); return out(num(se.length + sr.length), t(c, `stock entries ${se.length} · counts ${sr.length} not posted`, `حركات ${se.length} · جرد ${sr.length} غير مرحّلة`), listDrill(se.length >= sr.length ? "Stock Entry" : "Stock Reconciliation", [["docstatus", "=", 0]]), se.length + sr.length > 0); };
export const receiptToStock: F = (c) => { const d = drafts(c, "Purchase Receipt"); const old = d.map((x) => days(s(x["posting_date"] || x["creation"]), asOf(c))).sort((a, b) => b - a)[0] ?? 0; return countOut(c, "Purchase Receipt", d, t(c, `receipts not yet in stock · oldest ${num(old)} days`, `استلامات لم تدخل المخزون · الأقدم ${num(old)} يوم`)); };
/** Short-delivery risk (built): open order lines whose undelivered qty exceeds the projected qty in their warehouse. */
export const shortDelivery: F = (c) => { const B = new Map(bins(c).map((b) => [`${s(b["item_code"])}|${s(b["warehouse"])}`, n(b["actual_qty"])])); const hit: string[] = [];
  for (const so of openSO(c)) for (const l of lines(so)) { const pend = n(l["qty"]) - n(l["delivered_qty"]); const wh = s(l["warehouse"]) || s(so["set_warehouse"]); if (pend > 0 && (B.get(`${s(l["item_code"])}|${wh}`) ?? 0) < pend) hit.push(so.name); }
  return out(num(new Set(hit).size), t(c, `orders with lines short of stock · ${num(hit.length)} lines`, `أوامر ببنود يفوق مطلوبها المتاح · ${num(hit.length)} بند`), listIn("Sales Order", hit), true); };
export const topValueItems: F = (c) => { const I = itemMap(c); return topOut(c, "Bin", groupBy(bins(c), (b) => s(I.get(s(b["item_code"]))?.["item_name"]) || s(b["item_code"]), (b) => n(b["stock_value"]), (b) => b.name), { what: ["items", "أصناف"] }); };
const cogs = (c: V4C, from: string) => sle(c, from).filter((e) => ["Delivery Note", "Sales Invoice"].includes(s(e["voucher_type"])) || (s(e["voucher_type"]) === "Stock Entry" && n(e["actual_qty"]) < 0)).reduce((x, e) => x - Math.min(0, n(e["stock_value_difference"])), 0);
export const turnover: F = (c) => { const sv = ledgerValue(c); const cg = cogs(c, addD(asOf(c), -365)); return out(`${num(sv ? cg / sv : 0, 2)}×`, t(c, `issued cost ${money(c, cg)} (12 months) ÷ stock value ${money(c, sv)}`, `تكلفة المنصرف ${money(c, cg)} (12 شهرًا) ÷ قيمة المخزون ${money(c, sv)}`), pro(c, "/pro/stock-ledger"), sv > 0); };
export const daysOfStock: F = (c) => { const sv = ledgerValue(c); const cg = cogs(c, addD(asOf(c), -90)); const v = cg ? (sv / (cg / 90)) : 0; return out(dayTxt(c, r2(v)), t(c, `stock value ÷ daily issued cost (90 days ${money(c, cg)})`, `قيمة المخزون ÷ التكلفة اليومية للمنصرف (90 يومًا ${money(c, cg)})`), pro(c, "/pro/stock-balance"), cg > 0); };
export const topTurnoverItems: F = (c) => { const I = itemMap(c); const sv = new Map<string, number>(); for (const b of bins(c)) sv.set(s(b["item_code"]), (sv.get(s(b["item_code"])) ?? 0) + n(b["stock_value"])); const iss = new Map<string, number>(); const names = new Map<string, string[]>();
  for (const e of outflow(c, addD(asOf(c), -365))) { const k = s(e["item_code"]); iss.set(k, (iss.get(k) ?? 0) - n(e["stock_value_difference"])); names.set(k, [...(names.get(k) ?? []), e.name]); }
  const r = [...iss].map(([k, v]) => ({ k, x: v / (sv.get(k) || 1) })).filter((x) => x.x > 0).sort((a, b) => b.x - a.x); const top = r[0];
  return top ? out(`${num(top.x, 2)}×`, t(c, `${s(I.get(top.k)?.["item_name"]) || top.k} · ${num(r.length)} items moved · 12 months`, `${s(I.get(top.k)?.["item_name"]) || top.k} · ${num(r.length)} صنف متحرك · 12 شهرًا`), listIn("Stock Ledger Entry", names.get(top.k) ?? []), true) : out("0×", "", listIn("Stock Ledger Entry", []), false); };
/** Margin vs stock value (built): gross margin of 12 months ÷ current stock value (GMROI). */
export const marginVsStock: F = (c) => { const vr = valRate(c); const gp = siLines(c).reduce((x, { d, l }) => x + lineAmt(d, l) - n(l["stock_qty"] ?? l["qty"]) * (n(l["incoming_rate"]) || vr(s(l["item_code"]))), 0); const sv = bins(c).reduce((x, b) => x + n(b["stock_value"]), 0);
  return out(`${num(sv ? gp / sv : 0, 2)}×`, t(c, `gross margin ${money(c, gp)} (12 months) ÷ stock value ${money(c, sv)}`, `مجمل الربح ${money(c, gp)} (12 شهرًا) ÷ قيمة المخزون ${money(c, sv)}`), pro(c, "/pro/sales-analytics"), sv > 0); };
/** ABC (built): items ranked by 12-month issued value; A = first 80%, B = next 15%, C = rest. */
export const abc: F = (c) => { const v = new Map<string, number>(); for (const e of outflow(c, addD(asOf(c), -365))) v.set(s(e["item_code"]), (v.get(s(e["item_code"])) ?? 0) - n(e["stock_value_difference"])); const r = [...v].filter(([, x]) => x > 0).sort((a, b) => b[1] - a[1]); const tot = r.reduce((x, [, y]) => x + y, 0);
  let cum = 0; const cls = { A: [] as string[], B: [] as string[], C: [] as string[] }; for (const [k, x] of r) { const before = cum; cum += x; (before < tot * 0.8 ? cls.A : before < tot * 0.95 ? cls.B : cls.C).push(k); }
  return out(`A ${cls.A.length} · B ${cls.B.length} · C ${cls.C.length}`, t(c, `items by 12-month issued value ${money(c, tot)}`, `الأصناف حسب قيمة المنصرف 12 شهرًا ${money(c, tot)}`), listIn("Item", cls.A), r.length > 0); };
export const valuationChange: F = (c) => { const e = sle(c, addD(asOf(c), -30)); return out(money(c, e.reduce((x, r) => x + n(r["stock_value_difference"]), 0)), t(c, `stock value change, 30 days · ${recs(c, e.length)}`, `تغيّر قيمة المخزون، 30 يومًا · ${recs(c, e.length)}`), listIn("Stock Ledger Entry", e.map((r) => r.name)), e.length > 0); };
export const damagedReturned: F = (c) => { const dn = sub(c, "Delivery Note", [], (d) => !!n(d["is_return"])); const pr = sub(c, "Purchase Receipt", [], (d) => !!n(d["is_return"])); const iss = sub(c, "Stock Entry", [["purpose", "=", "Material Issue"]], (d) => /damag|scrap|تالف/i.test(s(d["remarks"]) + s(d["stock_entry_type"])));
  return out(num(dn.length + pr.length + iss.length), t(c, `customer returns ${dn.length} · returns to suppliers ${pr.length} · damage issues ${iss.length}`, `مرتجعات عملاء ${dn.length} · مرتجعات للموردين ${pr.length} · صرف تالف ${iss.length}`), listIn(dn.length ? "Delivery Note" : "Purchase Receipt", (dn.length ? dn : pr).map((d) => d.name)), true); };
export const inventoryExceptions: F = (c) => { const a = bins(c).filter((r) => n(r["projected_qty"]) < 0).length; const b = rows(c, "Batch", [], (d) => !!s(d["expiry_date"]) && s(d["expiry_date"]) < asOf(c)).length; const p = drafts(c, "Stock Reconciliation").length + drafts(c, "Stock Entry").length; const tr = inTransit(c).filter((d) => days(s(d["posting_date"]), asOf(c)) > 3).length;
  return out(num(a + b + p + tr), t(c, `Negative projected ${a} · expired batches ${b} · unposted ${p} · late transfers ${tr}`, `متوقع سالب ${a} · دفعات منتهية ${b} · غير مرحّل ${p} · تحويلات متأخرة ${tr}`), pro(c, "/pro/stock-balance"), true); };

/* ---------------- assets ---------------- */
export const assetCount: F = (c) => { const a = assets(c); const by = (st: string) => a.filter((x) => s(x["status"]) === st).length; return countOut(c, "Asset", a, t(c, `in use ${a.length - by("Sold") - by("Scrapped")} · fully depreciated ${by("Fully Depreciated")} · drafts ${drafts(c, "Asset").length}`, `قيد الاستخدام ${a.length - by("Sold") - by("Scrapped")} · مستهلكة بالكامل ${by("Fully Depreciated")} · مسودات ${drafts(c, "Asset").length}`)); };
export const assetNbv: F = (c) => { const a = assets(c).filter((x) => !["Sold", "Scrapped"].includes(s(x["status"]))); const g = a.reduce((x, y) => x + n(y["gross_purchase_amount"]), 0); return sumOut(c, "Asset", a, nbv, t(c, `gross ${money(c, g)}`, `الإجمالي ${money(c, g)}`)); };
export const assetValueAnalysis: F = (c) => { const a = assets(c).filter((x) => !["Sold", "Scrapped"].includes(s(x["status"]))); const g = a.reduce((x, y) => x + n(y["gross_purchase_amount"]), 0), v = a.reduce((x, y) => x + nbv(y), 0);
  return out(pct(share(g - v, g)), t(c, `depreciated · gross ${money(c, g)} · book value ${money(c, v)}`, `مستهلك · الإجمالي ${money(c, g)} · القيمة الدفترية ${money(c, v)}`), listIn("Asset", a.map((x) => x.name)), g > 0); };
export const assetAdditions: F = (c) => sumOut(c, "Asset", assets(c).filter(since("purchase_date", yearStart(c))), (a) => n(a["gross_purchase_amount"]), t(c, `bought since ${yearStart(c)}`, `مشتراة منذ ${yearStart(c)}`));
export const byCategory: F = (c) => topOut(c, "Asset", groupBy(assets(c), (a) => s(a["asset_category"]) || null, nbv, (a) => a.name), { what: ["categories", "فئات"] });
export const byLocation: F = (c) => topOut(c, "Asset", groupBy(assets(c), (a) => s(a["location"]) || null, nbv, (a) => a.name), { what: ["locations", "مواقع"] });
export const byCostCenter: F = (c) => topOut(c, "Asset", groupBy(assets(c), (a) => s(a["department"]) || s(a["cost_center"]) || null, nbv, (a) => a.name), { what: ["cost centers", "مراكز تكلفة"] });
const dueRows = (c: V4C) => schedRows(c).filter(({ row }) => s(row["schedule_date"]) <= asOf(c) && !s(row["journal_entry"]));
export const depreciationDue: F = (c) => { const r = dueRows(c); return out(money(c, r.reduce((x, y) => x + n(y.row["depreciation_amount"]), 0)), t(c, `${num(r.length)} schedule rows due, not posted · ${num(new Set(r.map((x) => s(x.sch["asset"]))).size)} assets`, `${num(r.length)} قسط مستحق غير مُرحّل · ${num(new Set(r.map((x) => s(x.sch["asset"]))).size)} أصل`), pro(c, "/pro/depreciation"), r.length > 0); };
export const depreciationPosted: F = (c) => { const r = schedRows(c).filter(({ row }) => !!s(row["journal_entry"]) && s(row["schedule_date"]) >= addD(asOf(c), -31)); const je = sub(c, "Journal Entry", [["voucher_type", "=", "Depreciation Entry"]], since("posting_date", `${thisMonth(c)}-01`));
  return out(money(c, r.reduce((x, y) => x + n(y.row["depreciation_amount"]), 0)), t(c, `${num(r.length)} rows posted in the last month · depreciation journals this month ${je.length}`, `${num(r.length)} قسط مُرحّل خلال الشهر الأخير · قيود إهلاك هذا الشهر ${je.length}`), listIn("Journal Entry", r.map((x) => s(x.row["journal_entry"]))), r.length > 0); };
export const scheduleCheck: F = (c) => { const sch = sub(c, "Asset Depreciation Schedule"); const bad = sch.filter((d) => { const rs = lines(d, "depreciation_schedule"); const tot = rs.reduce((x, r) => x + n(r["depreciation_amount"]), 0); const dep = n(d["net_purchase_amount"]) - n(d["opening_accumulated_depreciation"]) - n(d["expected_value_after_useful_life"]); return rs.length && Math.abs(tot - dep) > 1; });
  const fut = sch.reduce((x, d) => x + lines(d, "depreciation_schedule").filter((r) => s(r["schedule_date"]) > asOf(c)).length, 0);
  return out(num(bad.length), t(c, `schedules whose rows differ from the depreciable amount · ${num(sch.length)} schedules · ${num(fut)} future rows`, `جداول تختلف أقساطها عن القيمة القابلة للإهلاك · ${num(sch.length)} جدول · ${num(fut)} قسط مستقبلي`), listIn("Asset Depreciation Schedule", (bad.length ? bad : sch).map((d) => d.name)), sch.length > 0); };
const mLogs = (c: V4C) => rows(c, "Asset Maintenance Log", [], (d) => Number(d.docstatus) !== 2 && !["Completed", "Cancelled"].includes(s(d["maintenance_status"])));
const openRepairs = (c: V4C) => rows(c, "Asset Repair", [], (d) => Number(d.docstatus) !== 2 && s(d["repair_status"]) === "Pending");
export const maintenanceNeeded: F = (c) => { const l = mLogs(c).filter((d) => s(d["due_date"]) <= addD(asOf(c), 30)); const r = openRepairs(c); return out(num(new Set([...l.map((d) => s(d["asset_name"])), ...r.map((d) => s(d["asset"]))]).size), t(c, `assets · maintenance due in 30 days ${l.length} · open repairs ${r.length}`, `أصول · صيانة خلال 30 يومًا ${l.length} · إصلاحات مفتوحة ${r.length}`), listIn("Asset Maintenance Log", l.map((d) => d.name)), l.length + r.length > 0); };
export const maintenanceDue: F = (c) => countOut(c, "Asset Maintenance Log", mLogs(c).filter((d) => s(d["due_date"]) >= asOf(c) && s(d["due_date"]) <= addD(asOf(c), 30)), t(c, "due in the next 30 days", "مستحقة خلال 30 يومًا"));
export const maintenanceOverdue: F = (c) => countOut(c, "Asset Maintenance Log", mLogs(c).filter((d) => s(d["due_date"]) < asOf(c)), t(c, "past their due date", "تجاوزت تاريخ الاستحقاق"));
export const repairsOpen: F = (c) => sumOut(c, "Asset Repair", openRepairs(c), (d) => n(d["repair_cost"]), t(c, "estimated cost", "التكلفة التقديرية"));
/** Downtime (built): days between failure and completion of asset repairs (open repairs count to today), 12 months. */
export const downtime: F = (c) => { const r = rows(c, "Asset Repair", [], (d) => Number(d.docstatus) !== 2 && s(d["failure_date"]) >= addD(asOf(c), -365)); const by = groupBy(r, (d) => s(d["asset_name"]) || s(d["asset"]), (d) => Math.max(0, days(s(d["failure_date"]), s(d["completion_date"]) || asOf(c))), (d) => d.name);
  const res = topOut(c, "Asset Repair", by, { fmt: (v) => dayTxt(c, v), what: ["assets", "أصول"] }); const tot = by.reduce((x, g) => x + g.v, 0); return { ...res, value: dayTxt(c, tot) }; };
const custody = (c: V4C) => new Set(optional(c, CORE_DT.assetCustody, () => rows(c, CORE_DT.assetCustody, [], (d) => s(d["status"]) === "Approved" && !s(d["to_date"]))).map((d) => s(d["asset"])));
export const noCustodian: F = (c) => { const cu = custody(c); return countOut(c, "Asset", assets(c).filter((a) => !s(a["custodian"]) && !cu.has(a.name) && !["Sold", "Scrapped"].includes(s(a["status"]))), t(c, "no custodian or approved custody", "بلا عهدة أو عهدة معتمدة")); };
export const noLocation: F = (c) => countOut(c, "Asset", assets(c).filter((a) => !s(a["location"])), t(c, `of ${num(assets(c).length)} assets`, `من ${num(assets(c).length)} أصل`));
export const pendingMoves: F = (c) => { const d = drafts(c, "Asset Movement"); const recent = sub(c, "Asset Movement", [], since("transaction_date", addD(asOf(c), -90))).length; return countOut(c, "Asset Movement", d, t(c, `drafts · moved in 90 days ${recent}`, `مسودات · نُقلت خلال 90 يومًا ${recent}`)); };
/** Disposal candidates (built): fully depreciated, or a repair cost above half the book value. */
export const disposalCandidates: F = (c) => { const rep = new Map<string, number>(); for (const r of rows(c, "Asset Repair", [], (d) => Number(d.docstatus) !== 2)) rep.set(s(r["asset"]), (rep.get(s(r["asset"])) ?? 0) + n(r["repair_cost"]));
  const a = assets(c).filter((x) => !["Sold", "Scrapped"].includes(s(x["status"])) && (s(x["status"]) === "Fully Depreciated" || n(x["is_fully_depreciated"]) === 1 || (rep.get(x.name) ?? 0) > nbv(x) * 0.5)); return countOut(c, "Asset", a, t(c, "fully depreciated or repairs above half the book value", "مستهلكة بالكامل أو إصلاحات تفوق نصف القيمة الدفترية"), pro(c, "/pro/asset-disposal")); };
export const fullyDepreciated: F = (c) => countOut(c, "Asset", assets(c).filter((a) => s(a["status"]) === "Fully Depreciated" || !!n(a["is_fully_depreciated"])), t(c, `of ${num(assets(c).length)} assets`, `من ${num(assets(c).length)} أصل`));
export const disposals: F = (c) => { const a = assets(c).filter((x) => ["Sold", "Scrapped"].includes(s(x["status"]))); return sumOut(c, "Asset", a, (x) => n(x["gross_purchase_amount"]), t(c, `sold ${a.filter((x) => s(x["status"]) === "Sold").length} · scrapped ${a.filter((x) => s(x["status"]) === "Scrapped").length}`, `مباعة ${a.filter((x) => s(x["status"]) === "Sold").length} · مخرّدة ${a.filter((x) => s(x["status"]) === "Scrapped").length}`), pro(c, "/pro/asset-disposal")); };
export const assetSales: F = (c) => { const si = SI(c).filter((d) => lines(d).some((l) => !!n(l["is_fixed_asset"]) || !!s(l["asset"]))); const sold = assets(c).filter((x) => s(x["status"]) === "Sold").length;
  return sumOut(c, "Sales Invoice", si, (d) => base(d, "grand_total"), t(c, `assets sold ${sold}`, `أصول مباعة ${sold}`), si.length ? undefined : pro(c, "/pro/asset-disposal")); };
/** Insurance and warranty (built): assets with no insurance end date, or insurance ending within 60 days. */
export const insurance: F = (c) => { const a = assets(c).filter((x) => !["Sold", "Scrapped"].includes(s(x["status"]))); const miss = a.filter((x) => !s(x["insurance_end_date"])); const soon = a.filter((x) => s(x["insurance_end_date"]) && s(x["insurance_end_date"]) <= addD(asOf(c), 60));
  return out(num(miss.length + soon.length), t(c, `no insurance recorded ${miss.length} · ending within 60 days ${soon.length}`, `بلا تأمين مسجّل ${miss.length} · ينتهي خلال 60 يومًا ${soon.length}`), listIn("Asset", [...soon, ...miss].map((x) => x.name)), a.length > 0); };
export const pendingCapitalization: F = (c) => { const a = drafts(c, "Asset"); const cap = drafts(c, "Asset Capitalization").length; return sumOut(c, "Asset", a, (x) => n(x["gross_purchase_amount"]) || n(x["net_purchase_amount"]), t(c, `draft assets · capitalizations ${cap}`, `أصول مسودة · رسملات ${cap}`)); };
export const cwip: F = (c) => { const g = gl(c, atype("Capital Work in Progress")); const bal = g.reduce((x, e) => x + dr(e), 0); const a = drafts(c, "Asset"); const v = a.reduce((x, y) => x + (n(y["gross_purchase_amount"]) || n(y["net_purchase_amount"])), 0);
  return out(money(c, bal + v), t(c, `work in progress ledger ${money(c, bal)} · assets not yet in use ${num(a.length)} (${money(c, v)})`, `قيود أعمال تحت التنفيذ ${money(c, bal)} · أصول لم تدخل الخدمة ${num(a.length)} (${money(c, v)})`), listIn("Asset", a.map((x) => x.name), [["docstatus", "=", 0]]), true); };
export const valueAdjust: F = (c) => { const ava = sub(c, "Asset Value Adjustment"); const imp = optional(c, CORE_DT.assetImpairment, () => sub(c, CORE_DT.assetImpairment));
  const v = ava.reduce((x, d) => x + n(d["difference_amount"]), 0) - imp.reduce((x, d) => x + n(d["impairment_loss"]), 0);
  return out(money(c, v), t(c, `value adjustments ${ava.length} · impairments ${imp.length}`, `تعديلات قيمة ${ava.length} · اضمحلال ${imp.length}`), imp.length && !ava.length ? listIn(CORE_DT.assetImpairment, imp.map((d) => d.name)) : listIn("Asset Value Adjustment", ava.map((d) => d.name)), ava.length + imp.length > 0); };
export const repairCostByAsset: F = (c) => topOut(c, "Asset Repair", groupBy(rows(c, "Asset Repair", [], (d) => Number(d.docstatus) !== 2), (d) => s(d["asset_name"]) || s(d["asset"]), (d) => n(d["repair_cost"]), (d) => d.name), { what: ["assets", "أصول"] });
export const repairCostByCategory: F = (c) => { const cat = new Map(assets(c).map((a) => [a.name, s(a["asset_category"])])); return topOut(c, "Asset Repair", groupBy(rows(c, "Asset Repair", [], (d) => Number(d.docstatus) !== 2), (d) => cat.get(s(d["asset"])) || null, (d) => n(d["repair_cost"]), (d) => d.name), { what: ["categories", "فئات"] }); };
export const assetAge: F = (c) => { const a = assets(c).filter((x) => s(x["available_for_use_date"] || x["purchase_date"])); const yrs = a.map((x) => days(s(x["available_for_use_date"] || x["purchase_date"]), asOf(c)) / 365); const avg = yrs.length ? yrs.reduce((x, y) => x + y, 0) / yrs.length : 0;
  return out(c.ar ? `${num(avg, 1)} سنة` : `${num(avg, 1)} years`, t(c, `average age · oldest ${num(Math.max(0, ...yrs), 1)} years · ${num(a.length)} assets`, `متوسط العمر · الأقدم ${num(Math.max(0, ...yrs), 1)} سنة · ${num(a.length)} أصل`), listIn("Asset", a.map((x) => x.name)), a.length > 0); };
export const byBranchAssets: F = (c) => topOut(c, "Asset", groupBy(assets(c), (a) => s(a["cost_center"]) || null, () => 1, (a) => a.name), { money: false, fmt: (v) => num(v), what: ["branches", "فروع"] });
export const registerCompleteness: F = (c) => { const a = assets(c); const cu = custody(c); const full = a.filter((x) => s(x["asset_category"]) && s(x["location"]) && s(x["cost_center"]) && (s(x["custodian"]) || cu.has(x.name)));
  return out(pct(share(full.length, a.length)), t(c, `${num(full.length)} of ${num(a.length)} have category, location, cost center and custodian`, `${num(full.length)} من ${num(a.length)} لديها فئة وموقع ومركز تكلفة وعهدة`), listIn("Asset", a.filter((x) => !full.includes(x)).map((x) => x.name)), a.length > 0); };
export const assetEntryExceptions: F = (c) => { const sch = new Set(sub(c, "Asset Depreciation Schedule").map((d) => s(d["asset"]))); const a = assets(c).filter((x) => !!n(x["calculate_depreciation"]) && !sch.has(x.name));
  const regGross = assets(c).filter((x) => !["Sold", "Scrapped"].includes(s(x["status"]))).reduce((x, y) => x + n(y["gross_purchase_amount"]), 0); const fa = gl(c, atype("Fixed Asset")).reduce((x, e) => x + dr(e), 0);
  return out(num(a.length), t(c, `depreciating assets without a schedule · ledger fixed assets ${money(c, fa)} vs register ${money(c, regGross)}`, `أصول تُهلك بلا جدول · الأصول الثابتة بالدفتر ${money(c, fa)} مقابل السجل ${money(c, regGross)}`), listIn("Asset", a.map((x) => x.name)), true); };
export const assetExceptions: F = (c) => { const a = dueRows(c).length, r = openRepairs(c).length, m = assets(c).filter((x) => !s(x["location"])).length, cu = custody(c), nc = assets(c).filter((x) => !s(x["custodian"]) && !cu.has(x.name)).length, d = drafts(c, "Asset").length;
  return out(num(a + r + m + nc + d), t(c, `Due depreciation ${a} · open repairs ${r} · no location ${m} · no custodian ${nc} · drafts ${d}`, `إهلاك مستحق ${a} · إصلاحات مفتوحة ${r} · بلا موقع ${m} · بلا عهدة ${nc} · مسودات ${d}`), pro(c, "/pro/asset-register"), true); };
export const stockShortage: F = belowReorder;

/* ---------------- V4R formulas with no V4I line (owner register V4R-T.TEMPLATE_USE, V4R-I.CAPACITY) ---------------- */
/** Tax template use: submitted sales and purchase invoices grouped by their Sales / Purchase Taxes and Charges Template;
 *  the most used template leads, invoices carrying no template are counted beside it. Drill: that template's invoices. */
export const taxTemplateUse: F = (c) => {
  const si = SI(c); const pi = optional(c, "Purchase Invoice", () => PI(c));
  const g = groupBy([...si.map((d) => ["Sales Invoice", d] as const), ...pi.map((d) => ["Purchase Invoice", d] as const)], ([, d]) => s(d["taxes_and_charges"]) || null, () => 1, ([, d]) => d.name);
  const none = [...si, ...pi].filter((d) => !s(d["taxes_and_charges"])).length;
  const r = topOut(c, "Sales Invoice", g, { fmt: (v) => recs(c, v), what: ["templates", "قوالب"] });
  const top = g.sort((a, b) => b.v - a.v)[0]; const inSi = top ? top.names.filter((x) => si.some((d) => d.name === x)) : [];
  return { ...r, detail: `${r.detail} · ${t(c, `${none} without a template`, `${none} بلا قالب`)}`, drill: inSi.length ? listIn("Sales Invoice", inSi) : listIn("Purchase Invoice", top?.names ?? []) };
};
/** Warehouse capacity use: stock on hand (Bin actual qty, negatives as zero) ÷ the capacity recorded in the Core
 *  Digit Warehouse Capacity record; the fullest warehouse leads and warehouses above their alert level are counted. */
export const warehouseCapacity: F = (c) => {
  const caps = rows(c, CORE_DT.warehouseCapacity, [], (d) => n(d["capacity_qty"]) > 0); const b = bins(c);
  const onHand = new Map<string, number>(); for (const x of b) onHand.set(s(x["warehouse"]), (onHand.get(s(x["warehouse"])) ?? 0) + Math.max(0, n(x["actual_qty"])));
  const use = caps.map((d) => ({ w: s(d["warehouse"]), pct: share(onHand.get(s(d["warehouse"])) ?? 0, n(d["capacity_qty"])), alert: n(d["alert_pct"]) || 85 })).sort((a, z) => z.pct - a.pct || a.w.localeCompare(z.w));
  const top = use[0];
  if (!top) return out("—", t(c, "No warehouse capacity recorded", "لا توجد سعة مسجلة للمستودعات"), listDrill(CORE_DT.warehouseCapacity, []), false);
  const over = use.filter((u) => u.pct >= u.alert).length;
  return out(pct(top.pct), t(c, `Fullest: ${shownName(c, top.w)} · ${over} above the alert level · ${use.length} warehouses measured`, `الأعلى امتلاءً: ${shownName(c, top.w)} · ${over} فوق حد التنبيه · ${use.length} مستودعات مقاسة`),
    listIn("Bin", b.filter((x) => s(x["warehouse"]) === top.w).map((x) => x.name), [["warehouse", "=", top.w]]));
};
