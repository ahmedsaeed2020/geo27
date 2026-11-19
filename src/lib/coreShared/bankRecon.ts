/**
 * Bank reconciliation and close position (PRO P2, owner 2026-11-17) — one read model for the Pro bank reconciliation page,
 * the shared bank matching page and the period close page.
 *
 *  - Reconciliation equation per bank ledger account, as the native Bank Reconciliation Tool cards:
 *      رصيد الكشف − الرصيد المسوّى = الفرق
 *    «الرصيد المسوّى» (cleared balance) is the native Bank Reconciliation Statement's calculated statement balance on the
 *    as-of date (book balance less entries the bank has not cleared). «رصيد الكشف» (statement closing balance) is entered on
 *    the native tool in Frappe; here it defaults to the cleared balance plus the statement lines not matched yet (deposits +,
 *    withdrawals −, open amount only), i.e. what the imported bank statement shows. So the difference is exactly the open
 *    statement lines, and it reaches 0 when every line is matched (developer guide P2-01).
 *  - 12-month bank strip per bank account: green when every statement line dated in the month is reconciled, amber when at
 *    least one is still open, grey when the month has no statement line.
 *  - 12-month close strip: green when the month's close checklist is complete (or the ledger is frozen / the period closed),
 *    amber when the close has started (tasks or a locked sub-ledger) but is not complete, grey when nothing has started.
 * Read only: nothing here writes a record.
 */
import { adapter, type Doc } from "@/lib/adapter";
import { RUNNERS } from "@/lib/reportRunner";
import { canReadType, scopedList } from "@/lib/scope";
import { currentUser } from "@/lib/session";
import { CORE_DT } from "./doctypes";
import { closeStage, CLOSE_STAGES } from "./finance";

const n = (v: unknown) => Number(v) || 0;
const s = (v: unknown) => String(v ?? "");
const r2 = (v: number) => Math.round(v * 100) / 100;
const d10 = (v: unknown) => s(v).slice(0, 10);
const CLOSED_BT = ["Reconciled", "Cancelled"];
const todayIso = () => new Date().toISOString().slice(0, 10);

export type ReconStatus = "ok" | "denied" | "empty";
export interface OpenLine { name: string; date: string; bankAccount: string; direction: "deposit" | "withdrawal"; amount: number; unallocated: number; signed: number; description: string }
export interface ReconAccount {
  account: string; currency: string; bankAccounts: string[];
  /** book balance on the as-of date (native BRS «Balance as per books») */
  books: number;
  /** «الرصيد المسوّى»: native BRS calculated bank statement balance */
  cleared: number;
  /** submitted statement lines dated on or before the as-of date */
  lines: number;
  openLines: OpenLine[];
  /** signed open amount of the unmatched lines (deposits +, withdrawals −) */
  openNet: number;
  /** «رصيد الكشف» = cleared + openNet */
  statement: number;
  /** «الفرق» = statement − cleared */
  diff: number;
}
export interface ReconView { status: ReconStatus; asOf: string; rows: ReconAccount[]; withoutLines: string[] }

const btCompany = (t: Doc): string => s(t["company"]) || s(adapter.get("Bank Account", s(t["bank_account"]))?.["company"]);
/** Submitted statement lines of a company (native Bank Transaction). */
export function statementLines(company: string, user = currentUser()): Doc[] {
  return scopedList("Bank Transaction", user).filter((t) => n(t.docstatus) === 1 && (!company || !btCompany(t) || btCompany(t) === company));
}
export function openLine(t: Doc): OpenLine {
  const dep = n(t["deposit"]); const amount = r2(dep || n(t["withdrawal"]));
  const allocated = ((t["payment_entries"] as Doc[] | undefined) ?? []).reduce((a, r) => a + n(r["allocated_amount"]), 0);
  const unallocated = r2(t["unallocated_amount"] != null ? n(t["unallocated_amount"]) : amount - allocated);
  return { name: t.name, date: d10(t["date"]), bankAccount: s(t["bank_account"]), direction: dep ? "deposit" : "withdrawal", amount, unallocated, signed: dep ? unallocated : -unallocated, description: s(t["description"]) };
}
/** A statement line still to be matched: submitted, not reconciled or cancelled, with an open amount. */
export const isOpenLine = (t: Doc) => n(t.docstatus) === 1 && !CLOSED_BT.includes(s(t["status"])) && openLine(t).unallocated > 0.005;

/** P2-01 / P2-05 — the reconciliation equation of every bank ledger account of the company. */
export function reconAccounts(company: string, asOf = todayIso(), user = currentUser()): ReconView {
  if (!canReadType("Bank Transaction", user) || !canReadType("GL Entry", user) || !canReadType("Account", user)) return { status: "denied", asOf, rows: [], withoutLines: [] };
  const accts = scopedList("Account", user).filter((a) => a["company"] === company && !n(a["is_group"]) && s(a["account_type"]) === "Bank");
  if (!accts.length) return { status: "empty", asOf, rows: [], withoutLines: [] };
  const banks = canReadType("Bank Account", user) ? scopedList("Bank Account", user) : [];
  const lines = statementLines(company, user).filter((t) => d10(t["date"]) <= asOf);
  const brs = RUNNERS["Bank Reconciliation Statement"];
  const rows: ReconAccount[] = []; const withoutLines: string[] = [];
  for (const a of accts) {
    const ba = banks.filter((b) => b["account"] === a.name).map((b) => b.name);
    const mine = lines.filter((t) => ba.includes(s(t["bank_account"])));
    if (!mine.length) { withoutLines.push(a.name); continue; }
    const res = brs?.run({ company, account: a.name, report_date: asOf });
    const val = (label: string) => { const v = res?.summary?.find((x) => x.label === label)?.value; return typeof v === "number" ? r2(v) : 0; };
    const cleared = val("Calculated bank statement balance"), books = val("Balance as per books");
    const open = mine.filter(isOpenLine).map(openLine).sort((x, y) => x.date.localeCompare(y.date) || x.name.localeCompare(y.name));
    const openNet = r2(open.reduce((t, l) => t + l.signed, 0));
    const statement = r2(cleared + openNet);
    rows.push({ account: a.name, currency: s(a["account_currency"]) || s(adapter.get("Company", company)?.["default_currency"]) || "SAR", bankAccounts: ba, books, cleared, lines: mine.length, openLines: open, openNet, statement, diff: r2(statement - cleared) });
  }
  rows.sort((x, y) => y.lines - x.lines || x.account.localeCompare(y.account));
  return { status: rows.length ? "ok" : "empty", asOf, rows, withoutLines };
}

/** The n month keys (YYYY-MM) ending with the as-of month, oldest first. */
export function monthKeys(asOf = todayIso(), count = 12): string[] {
  const y = Number(asOf.slice(0, 4)), m = Number(asOf.slice(5, 7)) - 1;
  return Array.from({ length: count }, (_, i) => { const d = new Date(Date.UTC(y, m - (count - 1 - i), 1)); return d.toISOString().slice(0, 7); });
}
export const monthEndOf = (key: string) => new Date(Date.UTC(Number(key.slice(0, 4)), Number(key.slice(5, 7)), 0)).toISOString().slice(0, 10);

export type StripState = "approved" | "draft" | "none";
export interface BankMonth { key: string; state: StripState; lines: number; open: number; openAmount: number }
export interface BankMonthRow { bankAccount: string; account: string; months: BankMonth[] }
/** P2-02 — 12-month reconciliation strip, one row per company bank account. */
export function bankMonths(company: string, asOf = todayIso(), user = currentUser(), count = 12): BankMonthRow[] {
  if (!canReadType("Bank Transaction", user)) return [];
  const keys = monthKeys(asOf, count);
  const lines = statementLines(company, user).filter((t) => d10(t["date"]) <= asOf);
  const own = (canReadType("Bank Account", user) ? scopedList("Bank Account", user) : []).filter((b) => n(b["is_company_account"]) && (!b["company"] || b["company"] === company));
  const names = [...new Set([...own.map((b) => b.name), ...lines.map((t) => s(t["bank_account"])).filter(Boolean)])];
  return names.map((ba) => {
    const mine = lines.filter((t) => s(t["bank_account"]) === ba);
    return { bankAccount: ba, account: s(adapter.get("Bank Account", ba)?.["account"]), months: keys.map((k): BankMonth => {
      const inM = mine.filter((t) => d10(t["date"]).slice(0, 7) === k); const open = inM.filter(isOpenLine);
      return { key: k, state: open.length ? "draft" : inM.length ? "approved" : "none", lines: inM.length, open: open.length, openAmount: r2(open.reduce((t, x) => t + openLine(x).unallocated, 0)) };
    }) };
  }).sort((a, b) => b.months.reduce((t, m) => t + m.lines, 0) - a.months.reduce((t, m) => t + m.lines, 0) || a.bankAccount.localeCompare(b.bankAccount));
}

export interface CloseMonth { key: string; periodEnd: string; state: StripState; stage: number; stages: number; done: number; total: number; blocked: number }
/** P2-02 (close) — 12-month close strip of a company. */
export function closeMonths(company: string, asOf = todayIso(), count = 12): CloseMonth[] {
  const tasks = adapter.list(CORE_DT.closeTask).filter((t) => t["company"] === company);
  return monthKeys(asOf, count).map((k) => {
    const pe = monthEndOf(k); const mine = tasks.filter((t) => s(t["period_end"]) === pe);
    const done = mine.filter((t) => t["status"] === "Done").length, blocked = mine.filter((t) => t["status"] === "Blocked").length;
    const stage = closeStage(company, pe);
    const state: StripState = stage >= 2 || (mine.length > 0 && done === mine.length) ? "approved" : stage >= 1 || mine.length > 0 ? "draft" : "none";
    return { key: k, periodEnd: pe, state, stage, stages: CLOSE_STAGES.length, done, total: mine.length, blocked };
  });
}

export interface CloseCheck { key: "bank" | "drafts"; count: number; amount: number; byType: Record<string, number> }
const DRAFT_TYPES = ["Sales Invoice", "Purchase Invoice", "Payment Entry", "Journal Entry"] as const;
/** P2-04 — live close checks of a period: statement lines still open on the period end, and draft vouchers dated in the period. */
export function closeChecks(company: string, periodEnd: string, user = currentUser()): CloseCheck[] {
  const start = `${periodEnd.slice(0, 7)}-01`;
  const open = canReadType("Bank Transaction", user) ? statementLines(company, user).filter((t) => d10(t["date"]) <= periodEnd && isOpenLine(t)) : [];
  const byType: Record<string, number> = {}; let drafts = 0;
  for (const dt of DRAFT_TYPES) {
    if (!canReadType(dt, user)) continue;
    const c = scopedList(dt, user).filter((d) => d["company"] === company && n(d.docstatus) === 0 && d10(d["posting_date"]) >= start && d10(d["posting_date"]) <= periodEnd).length;
    if (c) byType[dt] = c; drafts += c;
  }
  return [
    { key: "bank", count: open.length, amount: r2(open.reduce((t, x) => t + openLine(x).unallocated, 0)), byType: {} },
    { key: "drafts", count: drafts, amount: 0, byType },
  ];
}
