/**
 * DIGIT shared Core finance operations (Run11.1 E2, E3, F1, F7, F8/PU13, F9, F10, F11, F18, F19, PU8/PUR-009, SL13).
 *
 * Every figure is read from adapter records at call time and every action writes native vouchers through documentApi
 * (permission-checked, posted by posting.ts) or a Core DocType record; nothing is stored separately. External sending
 * (bank file, e-mail) goes through providers.ts, so it is prepared now and sent once the Administration provider is set.
 */
import { adapter, type Doc } from "@/lib/adapter";
import { cachedMeta } from "@/lib/catalog";
import { currentUser, hasPerm, userRoles } from "@/lib/session";
import { createDraft, saveDocument, submitDocument } from "@/lib/documentApi";
import { CORE_DT } from "./doctypes";
import { controlPolicy, openDisputes, withinTolerance } from "./controls";
import { integrationLogs, queueEmail, sendBankTransfer } from "./providers";

export type Bi = [string, string];
export type Flt = [string, string, string | number | (string | number)[]];
export interface ListDrill { doctype: string; filters: Flt[] }
const n = (v: unknown) => Number(v) || 0;
const s = (v: unknown) => String(v ?? "");
const r2 = (x: number) => Math.round(x * 100) / 100;
const DAY = 864e5;
const at = (d: string) => Date.parse(`${d.slice(0, 10)}T00:00:00Z`);
export const addDays = (d: string, k: number) => new Date(at(d) + k * DAY).toISOString().slice(0, 10);
export const daysBetween = (a: string, b: string) => Math.round((at(b) - at(a)) / DAY);
const sub = (dt: string, company: string) => adapter.list(dt).filter((d) => n(d.docstatus) === 1 && s(d["company"]) === company);
const names = (ds: Doc[]) => ds.map((d) => d.name);
const inDrill = (doctype: string, ds: Doc[]): ListDrill => ({ doctype, filters: [["name", "in", names(ds)]] });

/* ------------------------------------------------------------------ vouchers through documentApi ------------------------------------------------------------------ */
/** Create (and optionally submit) a native voucher through documentApi: create/submit permission, naming and posting apply. */
export function newVoucher(dt: string, values: Record<string, unknown>, opts: { submit?: boolean; user?: string } = {}): { name?: string; errors: string[] } {
  const meta = cachedMeta(dt); if (!meta) return { errors: [`${dt}: the document definition is still loading — try again.`] };
  const user = opts.user ?? currentUser();
  if (!hasPerm(meta, "create", undefined, user)) return { errors: [`No permission to create ${dt}`] };
  const d = createDraft(meta); if (!d.doc) return { errors: d.errors };
  const r = saveDocument(meta, d.doc.name, values, { user }); if (r.errors.length) { adapter.remove(dt, d.doc.name); return { errors: r.errors }; }
  if (opts.submit) { const e = submitDocument(meta, r.name, user); if (e.length) return { name: r.name, errors: e }; }
  return { name: r.name, errors: [] };
}
const can = (dt: string, p: "read" | "write" | "create" | "submit", user = currentUser(), d?: Doc) => { const m = cachedMeta(dt); return m ? hasPerm(m, p, d, user) : user === "Administrator"; };

/* ------------------------------------------------------------------ cash ------------------------------------------------------------------ */
const cashAccounts = (company: string) => adapter.list("Account").filter((a) => s(a["company"]) === company && !n(a["is_group"]) && (a["account_type"] === "Bank" || a["account_type"] === "Cash")).map((a) => a.name);
export function cashBalance(company: string, asOf: string): number {
  const acc = new Set(cashAccounts(company));
  return r2(adapter.list("GL Entry").filter((g) => s(g["company"]) === company && !n(g["is_cancelled"]) && acc.has(s(g["account"])) && s(g["posting_date"]) <= asOf).reduce((t, g) => t + n(g["debit"]) - n(g["credit"]), 0));
}
export type Scenario = "expected" | "conservative" | "optimistic";
export const SCENARIO_LABEL: Record<Scenario, Bi> = { expected: ["Expected", "المتوقع"], conservative: ["Conservative", "متحفظ"], optimistic: ["Optimistic", "متفائل"] };
export interface CashFlowLine { doctype: "Sales Invoice" | "Purchase Invoice" | "Digit Payment Run"; name: string; party: string; date: string; amount: number; basis: Bi }
export interface Forecast { company: string; asOf: string; scenario: Scenario; opening: number; lines: CashFlowLine[]; buckets: { days: 7 | 30 | 90; inflow: number; outflow: number; closing: number; drillIn: ListDrill; drillOut: ListDrill }[]; weeks: { week: number; date: string; closing: number }[]; lowest: { date: string; closing: number } }
/**
 * 7/30/90-day cash forecast: actual cash and bank balance (GL) plus expected receipts minus expected payments.
 * Receipts: open sales invoices at their promised date (Digit Payment Promise) or due date; overdue ones are expected
 * within 7 days (expected), only when ≤ 60 days late and not disputed at 80 % (conservative), or all within 7 days
 * (optimistic). Payments: open purchase invoices not on hold at their due date (overdue → within 7 days) and approved
 * payment runs on their run date.
 */
export function cashForecast(company: string, asOf: string, scenario: Scenario = "expected"): Forecast {
  const lines: CashFlowLine[] = [];
  const promises = new Map(adapter.list(CORE_DT.paymentPromise).filter((p) => p["status"] === "Open").map((p) => [s(p["invoice"]), p]));
  const disputed = new Set(openDisputes({ company }).map((d) => d.invoice));
  for (const si of sub("Sales Invoice", company)) {
    const out = n(si["outstanding_amount"]); if (out <= 0) continue;
    const due = s(si["due_date"]) || s(si["posting_date"]); const late = daysBetween(due, asOf); const pr = promises.get(si.name);
    let date = due; let amount = out; let basis: Bi = ["Due date", "تاريخ الاستحقاق"];
    if (pr && s(pr["promised_date"]) >= asOf) { date = s(pr["promised_date"]); amount = Math.min(out, n(pr["amount"]) || out); basis = ["Customer promise", "وعد العميل بالسداد"]; }
    else if (late > 0) {
      if (scenario === "conservative" && (late > 60 || disputed.has(si.name))) continue;
      date = addDays(asOf, 7); basis = ["Overdue — expected within a week", "متأخرة — متوقعة خلال أسبوع"];
      if (scenario === "conservative") { amount = out * 0.8; basis = ["Overdue — 80 % expected within a week", "متأخرة — 80% متوقعة خلال أسبوع"]; }
    } else if (scenario === "optimistic" && late > -7) date = asOf;
    lines.push({ doctype: "Sales Invoice", name: si.name, party: s(si["customer_name"] || si["customer"]), date, amount: r2(amount), basis });
  }
  const runLines = new Set<string>();
  for (const run of adapter.list(CORE_DT.paymentRun).filter((r) => s(r["company"]) === company && r["status"] === "Approved")) {
    const tot = (run["lines"] as Doc[] | undefined ?? []).filter((l) => !s(l["hold_reason"])).reduce((t, l) => { runLines.add(s(l["purchase_invoice"])); return t + n(l["amount"]); }, 0);
    if (tot) lines.push({ doctype: "Digit Payment Run", name: run.name, party: "", date: s(run["run_date"]) < asOf ? asOf : s(run["run_date"]), amount: -r2(tot), basis: ["Approved payment run", "دفعة سداد معتمدة"] });
  }
  for (const pi of sub("Purchase Invoice", company)) {
    const out = n(pi["outstanding_amount"]); if (out <= 0 || n(pi["on_hold"]) || runLines.has(pi.name)) continue;
    const due = s(pi["due_date"]) || s(pi["posting_date"]);
    lines.push({ doctype: "Purchase Invoice", name: pi.name, party: s(pi["supplier_name"] || pi["supplier"]), date: due < asOf ? addDays(asOf, 7) : due, amount: -r2(out), basis: due < asOf ? ["Overdue — paid within a week", "متأخرة — تُسدد خلال أسبوع"] : ["Due date", "تاريخ الاستحقاق"] });
  }
  const opening = cashBalance(company, asOf);
  const upTo = (k: number) => lines.filter((l) => l.date <= addDays(asOf, k));
  const buckets = ([7, 30, 90] as const).map((days) => {
    const ls = upTo(days); const inflow = r2(ls.filter((l) => l.amount > 0).reduce((t, l) => t + l.amount, 0)); const outflow = r2(-ls.filter((l) => l.amount < 0).reduce((t, l) => t + l.amount, 0));
    const ins = ls.filter((l) => l.doctype === "Sales Invoice").map((l) => l.name); const outs = ls.filter((l) => l.doctype === "Purchase Invoice").map((l) => l.name);
    return { days, inflow, outflow, closing: r2(opening + inflow - outflow), drillIn: { doctype: "Sales Invoice", filters: [["name", "in", ins]] as Flt[] }, drillOut: { doctype: "Purchase Invoice", filters: [["name", "in", outs]] as Flt[] } };
  });
  const weeks = Array.from({ length: 14 }, (_, w) => { const date = addDays(asOf, w * 7); return { week: w, date, closing: r2(opening + lines.filter((l) => l.date <= date).reduce((t, l) => t + l.amount, 0)) }; });
  const lowest = weeks.reduce((a, b) => (b.closing < a.closing ? b : a), weeks[0]!);
  return { company, asOf, scenario, opening, lines: lines.sort((a, b) => a.date.localeCompare(b.date)), buckets, weeks, lowest: { date: lowest.date, closing: lowest.closing } };
}

/* ------------------------------------------------------------------ three-way match / do not pay ------------------------------------------------------------------ */
export interface MatchLine { item: string; ordered: { qty: number; rate: number } | null; received: number | null; billed: { qty: number; rate: number }; priceVarPct: number; qtyVarPct: number; amountVar: number; ok: boolean }
export interface MatchResult { invoice: string; ok: boolean; lines: MatchLine[]; issues: Bi[]; matched: boolean }
/** Three-way match of one purchase invoice against its order and receipt lines within the company's Digit Control Policy tolerances. */
export function threeWayMatch(pi: Doc): MatchResult {
  const p = controlPolicy(s(pi["company"])); const out: MatchLine[] = []; const issues: Bi[] = [];
  for (const it of (pi["items"] as Doc[] | undefined) ?? []) {
    const po = it["purchase_order"] ? (adapter.get("Purchase Order", s(it["purchase_order"]))?.["items"] as Doc[] | undefined ?? []).find((r) => (!!it["po_detail"] && r.name === it["po_detail"]) || r["item_code"] === it["item_code"]) : undefined;
    const pr = it["purchase_receipt"] ? (adapter.get("Purchase Receipt", s(it["purchase_receipt"]))?.["items"] as Doc[] | undefined ?? []).find((r) => (!!it["pr_detail"] && r.name === it["pr_detail"]) || r["item_code"] === it["item_code"]) : undefined;
    const billed = { qty: n(it["qty"]), rate: n(it["rate"]) };
    const ordered = po ? { qty: n(po["qty"]), rate: n(po["rate"]) } : null;
    const received = pr ? n(pr["qty"]) - 0 : null;
    if (!ordered && received === null) continue;
    const base = { qty: received ?? ordered!.qty, rate: ordered?.rate ?? n(pr?.["rate"]) };
    const w = withinTolerance(p, base, billed);
    out.push({ item: s(it["item_code"]), ordered, received, billed, priceVarPct: r2(w.priceVarPct), qtyVarPct: r2(w.qtyVarPct), amountVar: r2(w.amountVar), ok: w.ok });
    if (!w.ok) issues.push([`${s(it["item_code"])}: billed ${billed.qty} × ${billed.rate} vs ${received !== null ? `received ${received}` : `ordered ${ordered!.qty}`} × ${base.rate} (price ${r2(w.priceVarPct)} %, qty ${r2(w.qtyVarPct)} %)`,
      `${s(it["item_code"])}: مفوتر ${billed.qty} × ${billed.rate} مقابل ${received !== null ? `مستلم ${received}` : `مطلوب ${ordered!.qty}`} × ${base.rate} (السعر ${r2(w.priceVarPct)}٪، الكمية ${r2(w.qtyVarPct)}٪)`]);
  }
  return { invoice: pi.name, ok: !issues.length, lines: out, issues, matched: out.length > 0 };
}
/** "Do not pay": a purchase invoice on hold, or outside the three-way match tolerance and not released by an approver. */
export function paymentBlock(pi: Doc, asOf = new Date().toISOString().slice(0, 10)): Bi | null {
  if (n(pi["on_hold"]) && (!s(pi["release_date"]) || s(pi["release_date"]) > asOf)) return [`On hold: ${s(pi["hold_comment"]) || "no reason given"}`, `موقوفة: ${s(pi["hold_comment"]) || "دون سبب"}`];
  if (s(pi["digit_match_released_by"])) return null;
  const m = threeWayMatch(pi); if (!m.ok) return ["Do not pay — outside the three-way match tolerance", "لا تُسدد — خارج حدود المطابقة الثلاثية"];
  if (openDisputes({ invoice: pi.name }).length) return ["Do not pay — the invoice is disputed", "لا تُسدد — الفاتورة عليها نزاع"];
  return null;
}
/** Approver release of a match exception (Accounts Manager, not the invoice owner); recorded on the invoice with a comment. */
export function releaseMatch(piName: string, reason: string, user = currentUser()): { ok: boolean; reason?: Bi } {
  const pi = adapter.get("Purchase Invoice", piName); if (!pi) return { ok: false, reason: ["Invoice not found", "الفاتورة غير موجودة"] };
  if (!userRoles(user).includes("Accounts Manager") && user !== "Administrator") return { ok: false, reason: ["Only an Accounts Manager can release a match exception.", "لا يرفع استثناء المطابقة إلا مدير الحسابات."] };
  if (s(pi["owner"]) === user && user !== "Administrator") return { ok: false, reason: ["The person who entered the invoice cannot release it.", "لا يمكن لمُدخل الفاتورة رفع استثنائها."] };
  if (!reason.trim()) return { ok: false, reason: ["Give the reason for the release.", "اذكر سبب الرفع."] };
  adapter.insertDocQuiet("Purchase Invoice", { ...pi, digit_match_released_by: user, digit_match_release_reason: reason });
  adapter.insertDoc("Comment", { comment_type: "Info", reference_doctype: "Purchase Invoice", reference_name: piName, content: `Three-way match exception released: ${reason}`, comment_email: user });
  return { ok: true };
}

/* ------------------------------------------------------------------ AP processing (F8 / PU13) ------------------------------------------------------------------ */
export interface ApMetrics { invoices: number; touchless: number; touchlessPct: number; avgDays: number; buckets: { label: Bi; count: number; names: string[] }[]; exceptions: { invoice: string; supplier: string; reason: Bi }[]; touchlessNames: string[] }
const editedAfterCreate = (dt: string, name: string) => adapter.list("Version").some((v) => v["ref_doctype"] === dt && v["docname"] === name && /"changed"\s*:\s*\[\s*\[/.test(s(v["data"])));
/** Touchless = created from an order/receipt, within match tolerance, never on hold, not disputed and not edited after creation. Processing days = submission − supplier bill date. */
export function apMetrics(company: string, from: string, to: string): ApMetrics {
  const ps = sub("Purchase Invoice", company).filter((d) => !n(d["is_return"]) && s(d["posting_date"]) >= from && s(d["posting_date"]) <= to);
  const exceptions: ApMetrics["exceptions"] = []; const touch: string[] = []; const days: number[] = []; const bk = [[], [], [], []] as string[][];
  for (const pi of ps) {
    const linked = ((pi["items"] as Doc[] | undefined) ?? []).some((i) => i["purchase_order"] || i["purchase_receipt"]);
    const m = threeWayMatch(pi); const disputed = openDisputes({ invoice: pi.name }).length > 0;
    const reason: Bi | null = !linked ? ["Entered without an order or receipt", "أُدخلت دون أمر شراء أو استلام"] : !m.ok ? ["Outside the match tolerance", "خارج حدود المطابقة"] : n(pi["on_hold"]) ? ["Put on hold", "موقوفة"] : disputed ? ["Disputed", "متنازع عليها"] : editedAfterCreate("Purchase Invoice", pi.name) ? ["Edited by hand after entry", "عُدلت يدويًا بعد الإدخال"] : null;
    if (reason) exceptions.push({ invoice: pi.name, supplier: s(pi["supplier_name"] || pi["supplier"]), reason }); else touch.push(pi.name);
    const start = s(pi["bill_date"]) || s(pi["posting_date"]); const end = s(pi["digit_submitted_on"] || pi["modified"]).slice(0, 10) || s(pi["posting_date"]);
    const d = Math.max(0, daysBetween(start, end < start ? start : end)); days.push(d);
    bk[d <= 2 ? 0 : d <= 7 ? 1 : d <= 14 ? 2 : 3]!.push(pi.name);
  }
  const labels: Bi[] = [["0–2 days", "0–2 يوم"], ["3–7 days", "3–7 أيام"], ["8–14 days", "8–14 يومًا"], ["Over 14 days", "أكثر من 14 يومًا"]];
  return { invoices: ps.length, touchless: touch.length, touchlessPct: ps.length ? r2((touch.length / ps.length) * 100) : 0, avgDays: days.length ? r2(days.reduce((a, b) => a + b, 0) / days.length) : 0,
    buckets: labels.map((label, i) => ({ label, count: bk[i]!.length, names: bk[i]! })), exceptions, touchlessNames: touch };
}

/* ------------------------------------------------------------------ duplicate / unusual bills (F19) ------------------------------------------------------------------ */
export interface BillFlag { invoice: string; supplier: string; kind: "duplicate-no" | "duplicate-amount" | "unusual-rate"; with?: string; reason: Bi }
/** Same supplier and bill number; same supplier and amount within 7 days; or an item rate more than 25 % above the supplier's average of its earlier bills. */
export function billAnomalies(company: string): BillFlag[] {
  const ps = adapter.list("Purchase Invoice").filter((d) => s(d["company"]) === company && n(d.docstatus) !== 2 && !n(d["is_return"])).sort((a, b) => s(a["posting_date"]).localeCompare(s(b["posting_date"])) || a.name.localeCompare(b.name));
  const out: BillFlag[] = []; const seenNo = new Map<string, string>();
  for (const [i, pi] of ps.entries()) {
    const sup = s(pi["supplier"]); const label = s(pi["supplier_name"] || sup);
    const bill = s(pi["bill_no"]).trim().toLowerCase();
    if (bill) { const k = `${sup}|${bill}`; const prev = seenNo.get(k); if (prev) out.push({ invoice: pi.name, supplier: label, kind: "duplicate-no", with: prev, reason: [`Same supplier bill number as ${prev}`, `نفس رقم فاتورة المورد في ${prev}`] }); else seenNo.set(k, pi.name); }
    const amt = n(pi["grand_total"]);
    const twin = ps.slice(0, i).find((q) => q["supplier"] === sup && Math.abs(n(q["grand_total"]) - amt) < 0.01 && amt > 0 && Math.abs(daysBetween(s(q["posting_date"]), s(pi["posting_date"]))) <= 7 && s(q["bill_no"]).trim().toLowerCase() !== bill);
    if (twin) out.push({ invoice: pi.name, supplier: label, kind: "duplicate-amount", with: twin.name, reason: [`Same amount as ${twin.name} within 7 days`, `نفس مبلغ ${twin.name} خلال 7 أيام`] });
    for (const it of (pi["items"] as Doc[] | undefined) ?? []) {
      const hist = ps.slice(0, i).filter((q) => q["supplier"] === sup).flatMap((q) => ((q["items"] as Doc[] | undefined) ?? []).filter((r) => r["item_code"] === it["item_code"]).map((r) => n(r["rate"])));
      if (hist.length < 2) continue; const avg = hist.reduce((a, b) => a + b, 0) / hist.length;
      if (avg > 0 && n(it["rate"]) > avg * 1.25) { out.push({ invoice: pi.name, supplier: label, kind: "unusual-rate", reason: [`${s(it["item_code"])} at ${n(it["rate"])} is ${r2((n(it["rate"]) / avg - 1) * 100)} % above this supplier's average ${r2(avg)}`, `${s(it["item_code"])} بسعر ${n(it["rate"])} أعلى بنسبة ${r2((n(it["rate"]) / avg - 1) * 100)}٪ من متوسط المورد ${r2(avg)}`] }); break; }
    }
  }
  return out;
}

/* ------------------------------------------------------------------ journal cards (F1) ------------------------------------------------------------------ */
export interface JournalCard { id: "sales" | "purchases" | "bank" | "cash" | "misc"; title: Bi; metrics: { label: Bi; count: number; amount: number; drill: ListDrill; tone?: "warn" | "bad" }[] }
export function journalCards(company: string, asOf: string): JournalCard[] {
  const all = (dt: string) => adapter.list(dt).filter((d) => s(d["company"]) === company && n(d.docstatus) !== 2);
  const sum = (ds: Doc[], f: string) => r2(ds.reduce((t, d) => t + n(d[f]), 0));
  const m = (label: Bi, dt: string, ds: Doc[], f: string, tone?: "warn" | "bad") => ({ label, count: ds.length, amount: sum(ds, f), drill: inDrill(dt, ds), ...(tone ? { tone } : {}) });
  const si = all("Sales Invoice"), pi = all("Purchase Invoice"), je = all("Journal Entry"), pe = all("Payment Entry");
  const monthStart = `${asOf.slice(0, 7)}-01`;
  const bankAcc = new Set(adapter.list("Bank Account").filter((b) => s(b["company"]) === company || !b["company"]).map((b) => b.name));
  const bt = adapter.list("Bank Transaction").filter((b) => n(b.docstatus) === 1 && (bankAcc.has(s(b["bank_account"])) || s(b["company"]) === company) && n(b["unallocated_amount"]) > 0);
  return [
    { id: "sales", title: ["Sales", "المبيعات"], metrics: [m(["Drafts", "مسودات"], "Sales Invoice", si.filter((d) => n(d.docstatus) === 0), "grand_total"), m(["Overdue", "متأخرة"], "Sales Invoice", si.filter((d) => n(d.docstatus) === 1 && n(d["outstanding_amount"]) > 0 && s(d["due_date"]) < asOf), "outstanding_amount", "bad")] },
    { id: "purchases", title: ["Purchases", "المشتريات"], metrics: [m(["Drafts", "مسودات"], "Purchase Invoice", pi.filter((d) => n(d.docstatus) === 0), "grand_total"), m(["Due in 7 days", "مستحقة خلال 7 أيام"], "Purchase Invoice", pi.filter((d) => n(d.docstatus) === 1 && n(d["outstanding_amount"]) > 0 && s(d["due_date"]) >= asOf && s(d["due_date"]) <= addDays(asOf, 7)), "outstanding_amount", "warn")] },
    { id: "bank", title: ["Bank", "البنك"], metrics: [{ label: ["Unmatched bank lines", "حركات بنك غير مطابقة"], count: bt.length, amount: r2(bt.reduce((t, b) => t + n(b["unallocated_amount"]), 0)), drill: inDrill("Bank Transaction", bt), tone: "warn" as const }, m(["Payment drafts", "مسودات دفعات"], "Payment Entry", pe.filter((d) => n(d.docstatus) === 0), "paid_amount")] },
    { id: "cash", title: ["Cash", "النقد"], metrics: [m(["Cash entry drafts", "مسودات قيود نقدية"], "Journal Entry", je.filter((d) => n(d.docstatus) === 0 && d["voucher_type"] === "Cash Entry"), "total_debit"), m(["Unallocated receipts", "مقبوضات غير مخصصة"], "Payment Entry", pe.filter((d) => n(d.docstatus) === 1 && n(d["unallocated_amount"]) > 0), "unallocated_amount", "warn")] },
    { id: "misc", title: ["Miscellaneous", "قيود متنوعة"], metrics: [m(["Drafts", "مسودات"], "Journal Entry", je.filter((d) => n(d.docstatus) === 0), "total_debit"), m(["Late (dated before this month)", "متأخرة (قبل هذا الشهر)"], "Journal Entry", je.filter((d) => n(d.docstatus) === 0 && s(d["posting_date"]) < monthStart), "total_debit", "bad")] },
  ];
}

/* ------------------------------------------------------------------ exceptions & risks board (E3) ------------------------------------------------------------------ */
export interface Risk { id: string; area: "payments" | "receivables" | "stock" | "procurement"; severity: "high" | "medium" | "low"; title: Bi; count: number; amount: number; drill: ListDrill }
export function riskBoard(company: string, asOf: string, user = currentUser()): Risk[] {
  const out: Risk[] = [];
  const add = (r: Omit<Risk, "count" | "amount">, ds: Doc[], f?: string) => { if (!can(r.drill.doctype, "read", user)) return; out.push({ ...r, count: ds.length, amount: f ? r2(ds.reduce((t, d) => t + n(d[f]), 0)) : 0 }); };
  const pe = sub("Payment Entry", company).filter((d) => n(d["unallocated_amount"]) > 0);
  add({ id: "pay-unalloc", area: "payments", severity: "medium", title: ["Payments not allocated to invoices", "دفعات غير مخصصة للفواتير"], drill: inDrill("Payment Entry", pe) }, pe, "unallocated_amount");
  const blocked = sub("Purchase Invoice", company).filter((d) => n(d["outstanding_amount"]) > 0 && paymentBlock(d, asOf));
  add({ id: "pay-blocked", area: "payments", severity: "high", title: ["Supplier invoices that must not be paid", "فواتير موردين يجب عدم سدادها"], drill: inDrill("Purchase Invoice", blocked) }, blocked, "outstanding_amount");
  const dupes = billAnomalies(company).filter((f) => f.kind !== "unusual-rate"); const dupDocs = dupes.map((f) => adapter.get("Purchase Invoice", f.invoice)!).filter(Boolean);
  add({ id: "pay-dup", area: "payments", severity: "high", title: ["Possible duplicate supplier bills", "فواتير موردين مكررة محتملة"], drill: inDrill("Purchase Invoice", dupDocs) }, dupDocs, "grand_total");
  const old = sub("Sales Invoice", company).filter((d) => n(d["outstanding_amount"]) > 0 && daysBetween(s(d["due_date"]) || s(d["posting_date"]), asOf) > 90);
  add({ id: "ar-90", area: "receivables", severity: "high", title: ["Receivables more than 90 days late", "ذمم متأخرة أكثر من 90 يومًا"], drill: inDrill("Sales Invoice", old) }, old, "outstanding_amount");
  const broken = adapter.list(CORE_DT.paymentPromise).filter((p) => s(p["company"]) === company && promiseState(p, asOf) === "Broken");
  add({ id: "ar-broken", area: "receivables", severity: "medium", title: ["Broken payment promises", "وعود سداد لم تُنفذ"], drill: inDrill(CORE_DT.paymentPromise, broken) }, broken, "amount");
  const disp = openDisputes({ company }); const dispDocs = disp.map((d) => adapter.get(d.invoice_type, d.invoice)!).filter(Boolean);
  add({ id: "ar-dispute", area: "receivables", severity: "medium", title: ["Open invoice disputes", "نزاعات فواتير مفتوحة"], drill: { doctype: CORE_DT.dispute, filters: [["company", "=", company], ["status", "in", ["Open", "Under Review"]]] } }, dispDocs, "outstanding_amount");
  const wh = new Set(adapter.list("Warehouse").filter((w) => s(w["company"]) === company).map((w) => w.name));
  const neg = adapter.list("Bin").filter((b) => wh.has(s(b["warehouse"])) && n(b["projected_qty"]) < 0);
  add({ id: "stock-short", area: "stock", severity: "high", title: ["Items short after open orders", "أصناف ستنقص بعد الطلبات المفتوحة"], drill: inDrill("Bin", neg) }, neg);
  const exp = adapter.list("Batch").filter((b) => s(b["expiry_date"]) && s(b["expiry_date"]) < asOf && n(b["batch_qty"]) > 0);
  add({ id: "stock-expired", area: "stock", severity: "medium", title: ["Expired batches still in stock", "دفعات منتهية ما زالت في المخزون"], drill: inDrill("Batch", exp) }, exp, "batch_qty");
  const late = sub("Purchase Order", company).filter((d) => n(d["per_received"]) < 100 && !["Closed", "Completed", "On Hold"].includes(s(d["status"])) && s(d["schedule_date"]) && s(d["schedule_date"]) < asOf);
  add({ id: "po-late", area: "procurement", severity: "medium", title: ["Purchase orders past their delivery date", "أوامر شراء تجاوزت تاريخ التوريد"], drill: inDrill("Purchase Order", late) }, late, "grand_total");
  const mm = sub("Purchase Invoice", company).filter((d) => !threeWayMatch(d).ok);
  add({ id: "po-match", area: "procurement", severity: "high", title: ["Three-way match exceptions", "استثناءات المطابقة الثلاثية"], drill: inDrill("Purchase Invoice", mm) }, mm, "grand_total");
  return out;
}

/* ------------------------------------------------------------------ collections: dunning, promises, write-off, statements (F9, F10, SL13) ------------------------------------------------------------------ */
export const DUNNING_LEVELS: { level: 1 | 2 | 3 | 4; from: number; to: number; title: Bi }[] = [
  { level: 1, from: 1, to: 30, title: ["Friendly reminder", "تذكير ودي"] }, { level: 2, from: 31, to: 60, title: ["Firm reminder", "تذكير حازم"] },
  { level: 3, from: 61, to: 90, title: ["Final notice", "إنذار نهائي"] }, { level: 4, from: 91, to: Infinity, title: ["Stop supply / legal follow-up", "إيقاف التوريد / متابعة قانونية"] },
];
export const dunningLevel = (daysLate: number) => DUNNING_LEVELS.find((l) => daysLate >= l.from && daysLate <= l.to)?.level ?? 0;
const DUN_SUBJECT = /^Dunning level (\d)/;
export const lastDunningLevel = (invoice: string) => Math.max(0, ...adapter.list("Communication").filter((c) => c["reference_doctype"] === "Sales Invoice" && c["reference_name"] === invoice).map((c) => Number(s(c["subject"]).match(DUN_SUBJECT)?.[1] ?? 0)));
export type PromiseState = "Open" | "Kept" | "Broken" | "Cancelled";
/** Kept when the invoice outstanding fell by the promised amount (or is settled); broken when the date passed without it. */
export function promiseState(p: Doc, asOf: string): PromiseState {
  if (p["status"] === "Cancelled") return "Cancelled";
  const si = adapter.get("Sales Invoice", s(p["invoice"])); const out = n(si?.["outstanding_amount"]);
  if (!si || out <= 0.005 || out <= n(p["outstanding_at_promise"]) - n(p["amount"]) + 0.005) return "Kept";
  return s(p["promised_date"]) < asOf ? "Broken" : "Open";
}
export function refreshPromises(asOf: string) {
  for (const p of adapter.list(CORE_DT.paymentPromise)) { const st = promiseState(p, asOf); if (st !== p["status"] && p["status"] !== "Cancelled") adapter.update(CORE_DT.paymentPromise, p.name, { status: st }); }
}
export function recordPromise(invoice: string, promisedDate: string, amount: number, note: string, user = currentUser()): { ok: true; name: string } | { ok: false; reason: Bi } {
  const si = adapter.get("Sales Invoice", invoice); if (!si || n(si.docstatus) !== 1) return { ok: false, reason: ["Only a submitted invoice can carry a promise.", "يُسجل الوعد على فاتورة معتمدة فقط."] };
  if (!can(CORE_DT.paymentPromise, "create", user)) return { ok: false, reason: ["You may not record payment promises.", "لا يحق لك تسجيل وعود السداد."] };
  const out = n(si["outstanding_amount"]); if (out <= 0) return { ok: false, reason: ["The invoice is already paid.", "الفاتورة مسددة."] };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(promisedDate)) return { ok: false, reason: ["Enter the promised date.", "أدخل تاريخ الوعد."] };
  if (!(amount > 0) || amount > out + 0.005) return { ok: false, reason: ["The promised amount must be above zero and not more than the outstanding.", "يجب أن يكون المبلغ أكبر من صفر ولا يتجاوز المتبقي."] };
  for (const p of adapter.list(CORE_DT.paymentPromise).filter((x) => x["invoice"] === invoice && x["status"] === "Open")) adapter.update(CORE_DT.paymentPromise, p.name, { status: "Cancelled" });
  const d = adapter.insertDoc(CORE_DT.paymentPromise, { company: s(si["company"]), customer: s(si["customer"]), invoice, promised_date: promisedDate, amount: r2(amount), outstanding_at_promise: out, status: "Open", note, recorded_by: user });
  return { ok: true, name: d.name };
}
export interface CollectionRow { invoice: string; customer: string; customerName: string; outstanding: number; currency: string; due: string; daysLate: number; level: number; lastSent: number; promise?: { name: string; date: string; amount: number; state: PromiseState }; disputed: boolean; next: Bi }
export function collectionRows(company: string, asOf: string): CollectionRow[] {
  const disputed = new Set(openDisputes({ company }).map((d) => d.invoice));
  return sub("Sales Invoice", company).filter((d) => n(d["outstanding_amount"]) > 0 && (s(d["due_date"]) || s(d["posting_date"])) < asOf).map((si) => {
    const due = s(si["due_date"]) || s(si["posting_date"]); const daysLate = daysBetween(due, asOf); const level = dunningLevel(daysLate); const lastSent = lastDunningLevel(si.name);
    const p = adapter.list(CORE_DT.paymentPromise).filter((x) => x["invoice"] === si.name && x["status"] !== "Cancelled").sort((a, b) => s(b["creation"] ?? b.name).localeCompare(s(a["creation"] ?? a.name)))[0];
    const promise = p ? { name: p.name, date: s(p["promised_date"]), amount: n(p["amount"]), state: promiseState(p, asOf) } : undefined;
    const isDisp = disputed.has(si.name);
    const next: Bi = isDisp ? ["Resolve the dispute first", "عالج النزاع أولًا"] : promise?.state === "Open" ? ["Wait for the promised date", "انتظر تاريخ الوعد"] : lastSent >= level ? ["Call the customer", "اتصل بالعميل"] : [`Send: ${DUNNING_LEVELS[level - 1]!.title[0]}`, `أرسل: ${DUNNING_LEVELS[level - 1]!.title[1]}`];
    return { invoice: si.name, customer: s(si["customer"]), customerName: s(si["customer_name"] || si["customer"]), outstanding: n(si["outstanding_amount"]), currency: s(si["currency"]) || "SAR", due, daysLate, level, lastSent, ...(promise ? { promise } : {}), disputed: isDisp, next };
  }).sort((a, b) => b.daysLate - a.daysLate);
}
const customerEmail = (c: string) => { const cu = adapter.get("Customer", c); return s(cu?.["email_id"]) || s(adapter.list("Contact").find((k) => ((k["links"] as Doc[] | undefined) ?? []).some((l) => l["link_name"] === c))?.["email_id"]); };
export const defaultRecipient = customerEmail;
/** Send the dunning letter for the invoice's level (disputed invoices are refused); logged as an e-mail Communication. */
export function sendDunning(invoice: string, to: string, asOf: string, user = currentUser()): { ok: true; level: number } | { ok: false; reason: Bi } {
  const si = adapter.get("Sales Invoice", invoice); if (!si) return { ok: false, reason: ["Invoice not found", "الفاتورة غير موجودة"] };
  if (!can("Sales Invoice", "read", user, si) || !can("Communication", "create", user)) return { ok: false, reason: ["You may not send reminders for this invoice.", "لا يحق لك إرسال تذكير لهذه الفاتورة."] };
  if (openDisputes({ invoice }).length) return { ok: false, reason: ["The invoice is disputed — resolve the dispute before sending a reminder.", "الفاتورة عليها نزاع — عالجه قبل إرسال التذكير."] };
  const level = dunningLevel(daysBetween(s(si["due_date"]) || s(si["posting_date"]), asOf)); if (!level) return { ok: false, reason: ["The invoice is not overdue.", "الفاتورة غير متأخرة."] };
  const L = DUNNING_LEVELS[level - 1]!;
  const r = queueEmail({ to, subject: `Dunning level ${level} — ${L.title[0]} — ${invoice}`, body: `${L.title[1]} / ${L.title[0]}\n${s(si["customer_name"])}\nInvoice ${invoice}, due ${s(si["due_date"])}, outstanding ${n(si["outstanding_amount"]).toFixed(2)} ${s(si["currency"]) || "SAR"}.`, doctype: "Sales Invoice", name: invoice, company: s(si["company"]) });
  return r.ok ? { ok: true, level } : { ok: false, reason: r.reason };
}
export const WRITE_OFF_REASONS: { id: string; label: Bi }[] = [
  { id: "small-balance", label: ["Small balance", "رصيد صغير"] }, { id: "bad-debt", label: ["Uncollectable (bad debt)", "دين معدوم"] },
  { id: "settlement", label: ["Settlement discount", "خصم تسوية"] }, { id: "pricing", label: ["Pricing difference", "فرق تسعير"] },
];
/** Write off the outstanding of a sales invoice to the company write-off account with a reason (Accounts Manager); a submitted Journal Entry. */
export function writeOff(invoice: string, reasonId: string, user = currentUser()): { ok: true; journal: string } | { ok: false; reason: Bi } {
  const si = adapter.get("Sales Invoice", invoice); const reason = WRITE_OFF_REASONS.find((r) => r.id === reasonId);
  if (!si || !reason) return { ok: false, reason: ["Choose the invoice and the reason.", "اختر الفاتورة والسبب."] };
  if (!userRoles(user).includes("Accounts Manager") && user !== "Administrator") return { ok: false, reason: ["Only an Accounts Manager can write off a balance.", "لا يشطب الأرصدة إلا مدير الحسابات."] };
  const co = adapter.get("Company", s(si["company"])); const out = n(si["outstanding_amount"]); if (out <= 0) return { ok: false, reason: ["Nothing left to write off.", "لا يوجد رصيد للشطب."] };
  const woAcc = s(co?.["write_off_account"]) || adapter.list("Account").find((a) => a["company"] === si["company"] && !n(a["is_group"]) && /write off|bad debt/i.test(a.name))?.name || adapter.list("Account").find((a) => a["company"] === si["company"] && !n(a["is_group"]) && a["root_type"] === "Expense")?.name;
  const recv = s(si["debit_to"]) || s(co?.["default_receivable_account"]);
  const cc = s(co?.["cost_center"]) || adapter.list("Cost Center").find((c) => c["company"] === si["company"] && !n(c["is_group"]))?.name || "";
  if (!woAcc || !recv) return { ok: false, reason: ["Set the company write-off and receivable accounts first.", "حدد حسابي الشطب والذمم للشركة أولًا."] };
  const r = newVoucher("Journal Entry", { voucher_type: "Write Off Entry", company: s(si["company"]), posting_date: new Date().toISOString().slice(0, 10), user_remark: `Write-off (${reason.label[0]}) of ${invoice}`, digit_write_off_reason: reason.id,
    accounts: [{ idx: 1, account: woAcc, debit: out, debit_in_account_currency: out, credit: 0, credit_in_account_currency: 0, cost_center: cc },
      { idx: 2, account: recv, debit: 0, debit_in_account_currency: 0, credit: out, credit_in_account_currency: out, party_type: "Customer", party: s(si["customer"]), reference_type: "Sales Invoice", reference_name: invoice, cost_center: cc }],
    total_debit: out, total_credit: out }, { submit: true, user });
  return r.name && !r.errors.length ? { ok: true, journal: r.name } : { ok: false, reason: [r.errors.join("; "), r.errors.join("؛ ")] };
}
export interface StatementLine { date: string; voucherType: string; voucher: string; debit: number; credit: number; balance: number }
/** Customer statement of account from the ledger: opening balance, every posting in the period, running and closing balance. */
export function statementOfAccount(company: string, customer: string, from: string, to: string): { opening: number; lines: StatementLine[]; closing: number; overdue: number } {
  const gl = adapter.list("GL Entry").filter((g) => s(g["company"]) === company && !n(g["is_cancelled"]) && g["party_type"] === "Customer" && g["party"] === customer).sort((a, b) => s(a["posting_date"]).localeCompare(s(b["posting_date"])) || a.name.localeCompare(b.name));
  const opening = r2(gl.filter((g) => s(g["posting_date"]) < from).reduce((t, g) => t + n(g["debit"]) - n(g["credit"]), 0));
  let bal = opening; const lines: StatementLine[] = [];
  for (const g of gl.filter((x) => s(x["posting_date"]) >= from && s(x["posting_date"]) <= to)) { bal = r2(bal + n(g["debit"]) - n(g["credit"])); lines.push({ date: s(g["posting_date"]), voucherType: s(g["voucher_type"]), voucher: s(g["voucher_no"]), debit: n(g["debit"]), credit: n(g["credit"]), balance: bal }); }
  const overdue = r2(sub("Sales Invoice", company).filter((d) => d["customer"] === customer && n(d["outstanding_amount"]) > 0 && (s(d["due_date"]) || s(d["posting_date"])) < to).reduce((t, d) => t + n(d["outstanding_amount"]), 0));
  return { opening, lines, closing: bal, overdue };
}
export function sendStatement(company: string, customer: string, from: string, to: string, recipient: string, ref?: { doctype: string; name: string }, user = currentUser()): { ok: true } | { ok: false; reason: Bi } {
  if (!can("GL Entry", "read", user) || !can("Communication", "create", user)) return { ok: false, reason: ["You may not send customer statements.", "لا يحق لك إرسال كشوف الحساب."] };
  const st = statementOfAccount(company, customer, from, to);
  const body = [`Statement of account ${from} — ${to}`, `Opening ${st.opening.toFixed(2)}`, ...st.lines.map((l) => `${l.date}  ${l.voucher}  ${l.debit ? l.debit.toFixed(2) : ""}  ${l.credit ? l.credit.toFixed(2) : ""}  ${l.balance.toFixed(2)}`), `Closing ${st.closing.toFixed(2)} · overdue ${st.overdue.toFixed(2)}`].join("\n");
  const r = queueEmail({ to: recipient, subject: `Statement of account — ${s(adapter.get("Customer", customer)?.["customer_name"]) || customer} — ${to}`, body, doctype: ref?.doctype ?? "Customer", name: ref?.name ?? customer, company });
  return r.ok ? { ok: true } : { ok: false, reason: r.reason };
}
const FREQ_DAYS: Record<string, number> = { Weekly: 7, Monthly: 30, Quarterly: 91 };
/** Scheduled statements: native Process Statement Of Accounts with auto e-mail; due when the last run is older than its frequency. */
export function dueStatementSchedules(asOf: string): Doc[] {
  return adapter.list("Process Statement Of Accounts").filter((p) => n(p["enable_auto_email"]) && (!s(p["start_date"]) || s(p["start_date"]) <= asOf) && (() => {
    const last = integrationLogs({ engine: "email", doctype: "Process Statement Of Accounts", name: p.name })[0]?.last_attempt.slice(0, 10);
    return !last || daysBetween(last, asOf) >= (FREQ_DAYS[s(p["frequency"])] ?? 30);
  })());
}
export function runStatementSchedules(asOf: string, user = currentUser()): { sent: number; refused: string[] } {
  let sent = 0; const refused: string[] = [];
  for (const p of dueStatementSchedules(asOf)) {
    const days = FREQ_DAYS[s(p["frequency"])] ?? 30; const from = s(p["from_date"]) || addDays(asOf, -days);
    for (const c of (p["customers"] as Doc[] | undefined) ?? []) {
      const to = s(c["billing_email"]) || customerEmail(s(c["customer"]));
      const r = to ? sendStatement(s(p["company"]), s(c["customer"]), from, asOf, to, { doctype: "Process Statement Of Accounts", name: p.name }, user) : { ok: false as const, reason: ["No e-mail", "لا بريد"] as Bi };
      if (r.ok) sent++; else refused.push(`${s(c["customer"])}: ${r.reason[0]}`);
    }
  }
  return { sent, refused };
}

/* ------------------------------------------------------------------ AR/AP netting (F18) ------------------------------------------------------------------ */
export interface NettingPair { customer: string; supplier: string; receivable: number; payable: number; nettable: number; via: "Party Link" | "Same name" }
export function nettingPairs(company: string): NettingPair[] {
  const sis = sub("Sales Invoice", company).filter((d) => n(d["outstanding_amount"]) > 0); const pis = sub("Purchase Invoice", company).filter((d) => n(d["outstanding_amount"]) > 0);
  const ar = new Map<string, number>(); for (const d of sis) ar.set(s(d["customer"]), (ar.get(s(d["customer"])) ?? 0) + n(d["outstanding_amount"]));
  const ap = new Map<string, number>(); for (const d of pis) ap.set(s(d["supplier"]), (ap.get(s(d["supplier"])) ?? 0) + n(d["outstanding_amount"]));
  const pairs = new Map<string, NettingPair>();
  const add = (c: string, sp: string, via: NettingPair["via"]) => { const a = ar.get(c) ?? 0, p = ap.get(sp) ?? 0; if (a > 0 && p > 0 && !pairs.has(`${c}|${sp}`)) pairs.set(`${c}|${sp}`, { customer: c, supplier: sp, receivable: r2(a), payable: r2(p), nettable: r2(Math.min(a, p)), via }); };
  for (const l of adapter.list("Party Link")) { if (l["primary_role"] === "Customer" && l["secondary_role"] === "Supplier") add(s(l["primary_party"]), s(l["secondary_party"]), "Party Link"); if (l["primary_role"] === "Supplier" && l["secondary_role"] === "Customer") add(s(l["secondary_party"]), s(l["primary_party"]), "Party Link"); }
  const supByName = new Map(adapter.list("Supplier").map((x) => [s(x["supplier_name"] || x.name).trim().toLowerCase(), x.name]));
  for (const c of ar.keys()) { const cu = adapter.get("Customer", c); const sp = supByName.get(s(cu?.["customer_name"] || c).trim().toLowerCase()); if (sp) add(c, sp, "Same name"); }
  return [...pairs.values()].sort((a, b) => b.nettable - a.nettable);
}
/** Offset the smaller of the open receivable and payable with one submitted contra Journal Entry, oldest invoices first. */
export function netParty(company: string, customer: string, supplier: string, user = currentUser()): { ok: true; journal: string; amount: number } | { ok: false; reason: Bi } {
  if (!userRoles(user).includes("Accounts Manager") && !userRoles(user).includes("Accounts User") && user !== "Administrator") return { ok: false, reason: ["Only accounts staff can net balances.", "لا يجري المقاصة إلا موظفو الحسابات."] };
  const pair = nettingPairs(company).find((p) => p.customer === customer && p.supplier === supplier); if (!pair) return { ok: false, reason: ["These parties have no open balances on both sides.", "لا توجد أرصدة مفتوحة على الطرفين."] };
  const co = adapter.get("Company", company); const cc = s(co?.["cost_center"]) || adapter.list("Cost Center").find((c) => c["company"] === company && !n(c["is_group"]))?.name || "";
  let left = pair.nettable; const lines: Record<string, unknown>[] = [];
  const take = (dt: "Sales Invoice" | "Purchase Invoice", party: string) => { let rest = pair.nettable; for (const d of sub(dt, company).filter((x) => x[dt === "Sales Invoice" ? "customer" : "supplier"] === party && n(x["outstanding_amount"]) > 0).sort((a, b) => s(a["posting_date"]).localeCompare(s(b["posting_date"])))) {
    if (rest <= 0) break; const amt = r2(Math.min(rest, n(d["outstanding_amount"]))); rest = r2(rest - amt);
    lines.push(dt === "Sales Invoice"
      ? { account: s(d["debit_to"]) || s(co?.["default_receivable_account"]), debit: 0, debit_in_account_currency: 0, credit: amt, credit_in_account_currency: amt, party_type: "Customer", party, reference_type: dt, reference_name: d.name, cost_center: cc }
      : { account: s(d["credit_to"]) || s(co?.["default_payable_account"]), debit: amt, debit_in_account_currency: amt, credit: 0, credit_in_account_currency: 0, party_type: "Supplier", party, reference_type: dt, reference_name: d.name, cost_center: cc });
  } };
  take("Purchase Invoice", supplier); take("Sales Invoice", customer); left = pair.nettable;
  const r = newVoucher("Journal Entry", { voucher_type: "Contra Entry", company, posting_date: new Date().toISOString().slice(0, 10), user_remark: `AR/AP netting ${customer} ↔ ${supplier}`, accounts: lines.map((l, i) => ({ idx: i + 1, ...l })), total_debit: left, total_credit: left }, { submit: true, user });
  return r.name && !r.errors.length ? { ok: true, journal: r.name, amount: left } : { ok: false, reason: [r.errors.join("; "), r.errors.join("؛ ")] };
}

/* ------------------------------------------------------------------ payment run → Saudi bank file (F7) ------------------------------------------------------------------ */
export interface RunProposal { invoice: string; supplier: string; supplierName: string; due: string; amount: number; hold: Bi | null }
export function proposePaymentRun(company: string, payUntil: string, asOf: string): RunProposal[] {
  const inRun = new Set(adapter.list(CORE_DT.paymentRun).filter((r) => r["status"] === "Draft" || r["status"] === "Approved").flatMap((r) => ((r["lines"] as Doc[] | undefined) ?? []).map((l) => s(l["purchase_invoice"]))));
  return sub("Purchase Invoice", company).filter((d) => n(d["outstanding_amount"]) > 0 && (s(d["due_date"]) || s(d["posting_date"])) <= payUntil && !inRun.has(d.name))
    .map((d) => ({ invoice: d.name, supplier: s(d["supplier"]), supplierName: s(d["supplier_name"] || d["supplier"]), due: s(d["due_date"]) || s(d["posting_date"]), amount: n(d["outstanding_amount"]), hold: paymentBlock(d, asOf) }))
    .sort((a, b) => a.due.localeCompare(b.due) || a.invoice.localeCompare(b.invoice));
}
export function createPaymentRun(company: string, payUntil: string, invoices: string[], asOf: string, user = currentUser()): { ok: true; name: string } | { ok: false; reason: Bi } {
  if (!can(CORE_DT.paymentRun, "create", user)) return { ok: false, reason: ["You may not prepare payment runs.", "لا يحق لك إعداد دفعات السداد."] };
  const pick = proposePaymentRun(company, payUntil, asOf).filter((p) => invoices.includes(p.invoice)); if (!pick.length) return { ok: false, reason: ["Select at least one invoice.", "اختر فاتورة واحدة على الأقل."] };
  const lines = pick.map((p, i) => ({ idx: i + 1, purchase_invoice: p.invoice, supplier: p.supplier, due_date: p.due, amount: r2(p.amount), hold_reason: p.hold ? p.hold[0] : "" }));
  const d = adapter.insertDoc(CORE_DT.paymentRun, { company, run_date: asOf, pay_until: payUntil, status: "Draft", prepared_by: user, total: r2(lines.filter((l) => !l.hold_reason).reduce((t, l) => t + l.amount, 0)), lines });
  return { ok: true, name: d.name };
}
/** Approval by an Accounts Manager who did not prepare the run (segregation of duties). */
export function approvePaymentRun(name: string, user = currentUser()): { ok: true } | { ok: false; reason: Bi } {
  const run = adapter.get(CORE_DT.paymentRun, name); if (!run || run["status"] !== "Draft") return { ok: false, reason: ["Only a draft run can be approved.", "تُعتمد الدفعة المسودة فقط."] };
  if (!userRoles(user).includes("Accounts Manager") && user !== "Administrator") return { ok: false, reason: ["Only an Accounts Manager approves payment runs.", "يعتمد دفعات السداد مدير الحسابات فقط."] };
  if (s(run["prepared_by"]) === user && user !== "Administrator") return { ok: false, reason: ["The person who prepared the run cannot approve it.", "لا يعتمد الدفعة من أعدّها."] };
  adapter.update(CORE_DT.paymentRun, name, { status: "Approved", approved_by: user, approved_on: new Date().toISOString().slice(0, 10) });
  return { ok: true };
}
/** Pay an approved run: one submitted Payment Entry per supplier (lines on hold are skipped), then the Saudi bank transfer file through the bank provider. */
/** Native Payment Order (payment_order.json, type Payment Entry) for the payments of one run: the bank instruction document. */
export function paymentOrderFor(company: string, glAccount: string, payments: string[], ref: string): string {
  const coBank = adapter.list("Bank Account").find((b) => b["account"] === glAccount && b["company"] === company) ?? adapter.list("Bank Account").find((b) => b["account"] === glAccount);
  if (!coBank || !payments.length) return "";
  const refs = payments.map((p, i) => { const pe = adapter.get("Payment Entry", p)!; const sup = s(pe["party"]); const supBank = adapter.list("Bank Account").find((b) => b["party_type"] === "Supplier" && b["party"] === sup);
    return { idx: i + 1, reference_doctype: "Payment Entry", reference_name: p, amount: n(pe["paid_amount"]), supplier: sup, mode_of_payment: s(pe["mode_of_payment"]) || "Wire Transfer", bank_account: supBank?.name ?? coBank.name, account: glAccount, payment_reference: ref }; });
  return adapter.insertDoc("Payment Order", { naming_series: "PMO-", company, payment_order_type: "Payment Entry", posting_date: new Date().toISOString().slice(0, 10), company_bank: s(coBank["bank"]), company_bank_account: coBank.name, account: glAccount, references: refs, docstatus: 1 }).name;
}

export function executePaymentRun(name: string, bankAccount: string, user = currentUser()): { ok: true; payments: string[]; refused: { payment: string; reason: Bi }[]; csv: string; paymentOrder: string } | { ok: false; reason: Bi } {
  const run = adapter.get(CORE_DT.paymentRun, name); if (!run || run["status"] !== "Approved") return { ok: false, reason: ["Approve the run before paying it.", "اعتمد الدفعة قبل سدادها."] };
  if (!can("Payment Entry", "submit", user)) return { ok: false, reason: ["You may not submit payments.", "لا يحق لك اعتماد المدفوعات."] };
  const company = s(run["company"]); const co = adapter.get("Company", company);
  const bySup = new Map<string, Doc[]>(); for (const l of ((run["lines"] as Doc[] | undefined) ?? []).filter((x) => !s(x["hold_reason"]))) { const pi = adapter.get("Purchase Invoice", s(l["purchase_invoice"])); if (pi && n(pi["outstanding_amount"]) > 0 && !paymentBlock(pi)) (bySup.get(s(l["supplier"])) ?? bySup.set(s(l["supplier"]), []).get(s(l["supplier"]))!).push(pi); }
  if (!bySup.size) return { ok: false, reason: ["No payable line is left in this run.", "لا يوجد سطر قابل للسداد في هذه الدفعة."] };
  const payments: string[] = []; const errors: string[] = [];
  for (const [sup, pis] of bySup) {
    const amt = r2(pis.reduce((t, p) => t + n(p["outstanding_amount"]), 0));
    const r = newVoucher("Payment Entry", { payment_type: "Pay", company, posting_date: new Date().toISOString().slice(0, 10), party_type: "Supplier", party: sup, party_name: s(pis[0]!["supplier_name"]) || sup,
      paid_from: bankAccount, paid_to: s(pis[0]!["credit_to"]) || s(co?.["default_payable_account"]), paid_amount: amt, received_amount: amt, paid_from_account_currency: s(co?.["default_currency"]) || "SAR", paid_to_account_currency: s(co?.["default_currency"]) || "SAR",
      reference_no: name, reference_date: new Date().toISOString().slice(0, 10), mode_of_payment: "Wire Transfer",
      references: pis.map((p, i) => ({ idx: i + 1, reference_doctype: "Purchase Invoice", reference_name: p.name, total_amount: n(p["grand_total"]), outstanding_amount: n(p["outstanding_amount"]), allocated_amount: n(p["outstanding_amount"]) })) }, { submit: true, user });
    if (r.name && !r.errors.length) payments.push(r.name); else errors.push(`${sup}: ${r.errors.join("; ")}`);
  }
  if (!payments.length) return { ok: false, reason: [errors.join("\n"), errors.join("\n")] };
  const file = sendBankTransfer(company, payments.map((p) => adapter.get("Payment Entry", p)!));
  const lines = ((run["lines"] as Doc[] | undefined) ?? []).map((l) => ({ ...l, payment_entry: payments.find((p) => ((adapter.get("Payment Entry", p)?.["references"] as Doc[] | undefined) ?? []).some((r) => r["reference_name"] === l["purchase_invoice"])) ?? "" }));
  const paymentOrder = paymentOrderFor(company, bankAccount, payments, name);
  adapter.update(CORE_DT.paymentRun, name, { status: "Paid", lines, bank_account: bankAccount, paid_on: new Date().toISOString().slice(0, 10), ...(paymentOrder ? { payment_order: paymentOrder } : {}) });
  return { ok: true, payments, refused: file.refused, csv: file.ok ? file.csv : "", paymentOrder };
}

/* ------------------------------------------------------------------ period close stages (F11) ------------------------------------------------------------------ */
export const CLOSE_STAGES: { stage: 1 | 2 | 3; title: Bi; how: Bi }[] = [
  { stage: 1, title: ["Lock sub-ledgers", "إقفال الدفاتر الفرعية"], how: ["Closes sales, purchasing, payments and stock documents for the period (native Accounting Period); journals stay open for adjustments.", "يقفل مستندات المبيعات والمشتريات والمدفوعات والمخزون للفترة (فترة محاسبية أصلية)؛ تبقى القيود مفتوحة للتسويات."] },
  { stage: 2, title: ["Freeze the general ledger", "تجميد دفتر الأستاذ"], how: ["Every checklist task must be done; sets the company's frozen-until date, so no entry can be posted on or before the period end.", "يجب إنجاز كل مهام القائمة؛ يضبط تاريخ التجميد للشركة فلا يُرحّل أي قيد حتى نهاية الفترة."] },
  { stage: 3, title: ["Close the period", "إقفال الفترة"], how: ["Prepares the native Period Closing Voucher (profit or loss to the closing account) for review and submission.", "يُعد قيد إقفال الفترة الأصلي (الربح أو الخسارة إلى حساب الإقفال) للمراجعة والاعتماد."] },
];
const SUBLEDGER = ["Sales Invoice", "Purchase Invoice", "Payment Entry", "Delivery Note", "Purchase Receipt", "Stock Entry", "Stock Reconciliation"];
export function closeStage(company: string, periodEnd: string): 0 | 1 | 2 | 3 {
  const pcv = adapter.list("Period Closing Voucher").some((p) => p["company"] === company && s(p["period_end_date"]) === periodEnd && n(p.docstatus) !== 2);
  if (pcv) return 3;
  if (s(adapter.get("Company", company)?.["accounts_frozen_till_date"]) >= periodEnd) return 2;
  const ap = adapter.list("Accounting Period").find((p) => p["company"] === company && s(p["end_date"]) === periodEnd);
  return ap && ((ap["closed_documents"] as Doc[] | undefined) ?? []).some((c) => n(c["closed"])) ? 1 : 0;
}
export function advanceClose(company: string, periodEnd: string, user = currentUser()): { ok: true; stage: number; created?: { doctype: string; name: string } } | { ok: false; reason: Bi } {
  if (!userRoles(user).includes("Accounts Manager") && user !== "Administrator") return { ok: false, reason: ["Only an Accounts Manager can lock or close a period.", "لا يقفل الفترة إلا مدير الحسابات."] };
  const stage = closeStage(company, periodEnd); const start = `${periodEnd.slice(0, 7)}-01`;
  if (stage === 0) {
    const ap = adapter.list("Accounting Period").find((p) => p["company"] === company && s(p["end_date"]) === periodEnd);
    const closed_documents = SUBLEDGER.map((dt, i) => ({ idx: i + 1, document_type: dt, closed: 1 }));
    if (ap) adapter.update("Accounting Period", ap.name, { closed_documents });
    else adapter.insertDoc("Accounting Period", { name: `${company} ${periodEnd.slice(0, 7)}`, period_name: `${periodEnd.slice(0, 7)}`, start_date: start, end_date: periodEnd, company, closed_documents });
    return { ok: true, stage: 1 };
  }
  if (stage === 1) {
    const open = adapter.list(CORE_DT.closeTask).filter((t) => t["company"] === company && t["period_end"] === periodEnd && t["status"] !== "Done");
    if (open.length) return { ok: false, reason: [`${open.length} checklist task(s) are not done yet.`, `${open.length} مهمة في القائمة لم تُنجز بعد.`] };
    adapter.update("Company", company, { accounts_frozen_till_date: periodEnd });
    return { ok: true, stage: 2 };
  }
  if (stage === 2) {
    const closing = adapter.list("Account").find((a) => a["company"] === company && !n(a["is_group"]) && a["root_type"] === "Liability" && /retained|profit|أرباح/i.test(a.name)) ?? adapter.list("Account").find((a) => a["company"] === company && !n(a["is_group"]) && a["root_type"] === "Equity");
    const fy = adapter.list("Fiscal Year").find((y) => s(y["year_start_date"]) <= periodEnd && s(y["year_end_date"]) >= periodEnd);
    const d = adapter.insertDoc("Period Closing Voucher", { company, transaction_date: periodEnd, period_start_date: s(fy?.["year_start_date"]) || start, period_end_date: periodEnd, fiscal_year: fy?.name ?? "", closing_account_head: closing?.name ?? "", remarks: `Period close ${periodEnd}`, docstatus: 0 });
    return { ok: true, stage: 3, created: { doctype: "Period Closing Voucher", name: d.name } };
  }
  return { ok: false, reason: ["The period is already closed.", "الفترة مقفلة بالفعل."] };
}
export const attachmentsOf = (dt: string, name: string) => adapter.list("File").filter((f) => f["attached_to_doctype"] === dt && f["attached_to_name"] === name).length;
