/**
 * RXP-02 / SC-F-10 close blockers (CFO-CLOSE). Grouped, source-backed counts for one company and period, each with the
 * exact destination that lists the same records. Advisory only: nothing is closed, locked, posted or certified, and no
 * readiness percentage is derived — a blocker type is either clear, open, not permitted or unavailable.
 */
import { adapter } from "@/lib/adapter";
import { scopedList } from "@/lib/scope";
import { arRegister, CREDIT_SEGMENT, currencyTotals } from "./aging";
import { bankLines, classifyBankLines } from "./bank";
import { closingDrafts } from "./periods";
import { dimensionReview } from "./dimensionReviewData";
import { exceptionCurrencyTotals, financeExceptions } from "./financeExceptions";
import { guardedReport } from "./intelligence";
import { sourceStatus, todayIso, type SourceStatus } from "./finance";

export type BlockerGroup = "drafts" | "bank" | "open" | "ledger";
export type BlockerTarget =
  | { kind: "anchor"; id: string }
  | { kind: "list"; doctype: string; filters: unknown[] }
  | { kind: "route"; to: "/pro/receivables" | "/pro/payables" | "/pro/bank-reconciliation" | "/pro/trial-balance"; search: Record<string, string | undefined> };
export interface Blocker { id: string; group: BlockerGroup; label: [string, string]; status: SourceStatus; count: number; totals: { currency: string; amount: number }[]; target: BlockerTarget }

export const CLOSE_DRAFT_TYPES = ["Journal Entry", "Payment Entry", "Sales Invoice", "Purchase Invoice"] as const;
const DRAFT_AR: Record<string, string> = { "Journal Entry": "قيود يومية مسودة", "Payment Entry": "قيود دفع مسودة", "Sales Invoice": "فواتير مبيعات مسودة", "Purchase Invoice": "فواتير مشتريات مسودة" };
export const CLOSE_SOURCES = ["Period Closing Voucher", "Bank Transaction", "Bank Account", "GL Entry"];

/** Bank lines dated in the period (inclusive) — the same predicate Bank Reconciliation applies to `from_date`/`to_date`. */
export const inPeriod = (date: string, from?: string, to?: string) => !!date && (!from || date >= from) && (!to || date <= to);

/** A count over a partly visible source would read as "clear" when it is not: if any record of the company in a source
 *  DocType is unreadable for this user, the blocker fails closed ("denied") instead of showing a partial count. */
export function companyScope(dt: string, company: string, user: string): SourceStatus {
  const st = sourceStatus(dt, user); if (st !== "ok") return st;
  const readable = new Set(scopedList(dt, user).map((d) => d.name));
  return adapter.list(dt).some((d) => d["company"] === company && !readable.has(d.name)) ? "denied" : "ok";
}
const worst = (...xs: SourceStatus[]): SourceStatus => xs.find((x) => x === "denied") ?? xs.find((x) => x === "unavailable") ?? "ok";

export function closeBlockers(company: string, from: string, to: string, user: string, today = todayIso()): Blocker[] {
  const out: Blocker[] = [];
  for (const dt of CLOSE_DRAFT_TYPES) {
    const st = companyScope(dt, company, user);
    out.push({ id: `draft:${dt}`, group: "drafts", label: [`Draft ${dt}`, DRAFT_AR[dt]!], status: st, count: st === "ok" ? closingDrafts(scopedList(dt, user), company, from, to).length : 0, totals: [],
      target: { kind: "list", doctype: dt, filters: [["company", "=", company], ["docstatus", "=", "0"], ["posting_date", ">=", from], ["posting_date", "<=", to]] } });
  }
  const fx = financeExceptions(company, from, to, user);
  const btSt = companyScope("Bank Transaction", company, user);
  const bankSt = worst(fx.bankStatus, btSt), paySt = worst(fx.paymentStatus, companyScope("Payment Entry", company, user));
  out.push({ id: "bank:unreconciled", group: "bank", label: ["Unreconciled bank amounts", "مبالغ بنكية غير مسوّاة"], status: bankSt, count: bankSt === "ok" ? fx.bank.length : 0, totals: exceptionCurrencyTotals(fx.bank), target: { kind: "anchor", id: "dp-close-exceptions" } });
  const inconsistent = btSt === "ok"
    ? classifyBankLines(bankLines(scopedList("Bank Transaction", user), company).filter((l) => inPeriod(l.date, from, to)), [], [], today, false).filter((c) => c.ex === "inconsistent")
    : [];
  out.push({ id: "bank:inconsistent", group: "bank", label: ["Marked reconciled, amount unallocated", "مسوّاة شكليًا ومبلغها غير مخصص"], status: btSt, count: inconsistent.length,
    totals: [...new Set(inconsistent.map((c) => String(c.line.doc["currency"] || "")))].map((currency) => ({ currency, amount: Math.round(inconsistent.filter((c) => String(c.line.doc["currency"] || "") === currency).reduce((s, c) => s + c.line.unallocated, 0) * 100) / 100 })),
    target: { kind: "route", to: "/pro/bank-reconciliation", search: { company, ex: "inconsistent", from_date: from, to_date: to } } });
  out.push({ id: "payment:unallocated", group: "bank", label: ["Unallocated posted payments", "دفعات مرحّلة غير مخصصة"], status: paySt, count: paySt === "ok" ? fx.payments.length : 0, totals: exceptionCurrencyTotals(fx.payments), target: { kind: "anchor", id: "dp-close-exceptions" } });
  for (const side of ["receivable", "payable"] as const) {
    const r = arRegister(side, company, to, user, today);
    const st = worst(r.status, companyScope(side === "receivable" ? "Sales Invoice" : "Purchase Invoice", company, user));
    const credits = st === "ok" ? r.rows.filter((x) => x.bucket === CREDIT_SEGMENT) : [];
    out.push({ id: `credit:${side}`, group: "open", label: side === "receivable" ? ["Unallocated customer credits", "أرصدة دائنة غير مخصصة للعملاء"] : ["Unallocated supplier debits", "أرصدة مدينة غير مخصصة للموردين"], status: st,
      count: credits.length, totals: currencyTotals(credits).map(({ currency, amount }) => ({ currency, amount })),
      target: { kind: "route", to: side === "receivable" ? "/pro/receivables" : "/pro/payables", search: { company, as_of: to, bucket: String(CREDIT_SEGMENT), fs: "drill" } } });
  }
  const dims = dimensionReview(company, from, to, user);
  out.push({ id: "ledger:dimensions", group: "ledger", label: ["Missing mandatory dimensions", "أبعاد إلزامية مفقودة"], status: dims.status, count: dims.exceptions.length, totals: [], target: { kind: "anchor", id: "dp-close-dimensions" } });
  const tb = guardedReport("Trial Balance", { company, from_date: from, to_date: to }, user);
  out.push({ id: "ledger:trial-balance", group: "ledger", label: ["Trial Balance checks failing", "فحوص ميزان مراجعة غير ناجحة"], status: tb.status, count: tb.status === "ok" ? (tb.result?.checks ?? []).filter((c) => !c.ok).length : 0, totals: [],
    target: { kind: "route", to: "/pro/trial-balance", search: { company, from_date: from, to_date: to } } });
  const pSt = companyScope("Period Closing Voucher", company, user);
  const pending = pSt === "ok" ? scopedList("Period Closing Voucher", user).filter((p) => p["company"] === company && Number(p.docstatus) === 1 && !!p["gle_processing_status"] && p["gle_processing_status"] !== "Completed") : [];
  out.push({ id: "ledger:pcv", group: "ledger", label: ["Closing vouchers not fully posted", "قيود إقفال لم تكتمل معالجتها"], status: pSt, count: pending.length, totals: [], target: { kind: "anchor", id: "dp-close-closings" } });
  return out;
}

export function blockerSummary(bs: Blocker[]): { open: number; clear: number; restricted: number } {
  return { open: bs.filter((b) => b.status === "ok" && b.count > 0).length, clear: bs.filter((b) => b.status === "ok" && !b.count).length, restricted: bs.filter((b) => b.status !== "ok").length };
}
