/**
 * SC-F-09 / CFO profitability source attribution — read-only split of posted GL Entry rows per cost center
 * into income and expense using the native Account root_type. Net contribution = income − expense.
 * Rules (source-backed, advisory only):
 *  - Only submitted, non-cancelled GL rows in the company and date range count.
 *  - Income accounts contribute (credit − debit); Expense accounts contribute (debit − credit).
 *  - Balance-sheet accounts (Asset/Liability/Equity) are excluded from P&L attribution.
 *  - P&L rows with no cost center are never allocated or guessed — they are counted as "unattributed".
 *  - Fail closed: if GL Entry or Account is unreadable for the user, nothing is presented.
 */
import { scopedList } from "@/lib/scope";
import { currentUser } from "@/lib/session";
import { sourceStatus, type SourceStatus } from "./finance";

const n = (v: unknown) => Number(v) || 0;
const r2 = (x: number) => Math.round(x * 100) / 100;

export interface ProfitabilityRow {
  costCenter: string;
  income: number;
  expense: number;
  net: number;      // income − expense
  entries: number;  // P&L GL rows attributed to this cost center
}

export interface ProfitabilityAttribution {
  status: SourceStatus;
  rows: ProfitabilityRow[];
  unattributed: { income: number; expense: number; net: number; entries: number };
  excludedBalanceSheet: number; // GL rows on Asset/Liability/Equity accounts, not part of P&L
}

export function profitabilityAttribution(company: string, from: string, to: string, user = currentUser()): ProfitabilityAttribution {
  const empty = { rows: [], unattributed: { income: 0, expense: 0, net: 0, entries: 0 }, excludedBalanceSheet: 0 };
  const glStatus = sourceStatus("GL Entry", user);
  const acStatus = sourceStatus("Account", user);
  if (glStatus !== "ok" || acStatus !== "ok") return { status: glStatus !== "ok" ? glStatus : acStatus, ...empty };

  const rootType = new Map(
    scopedList("Account", user)
      .filter((a) => !company || !a["company"] || a["company"] === company)
      .map((a) => [a.name, String(a["root_type"] ?? "")]),
  );

  const acc = new Map<string, { income: number; expense: number; entries: number }>();
  const un = { income: 0, expense: 0, entries: 0 };
  let excludedBalanceSheet = 0;

  for (const g of scopedList("GL Entry", user)) {
    if (n(g["is_cancelled"]) || n(g.docstatus) !== 1) continue;
    if (company && g["company"] && g["company"] !== company) continue;
    const posting = String(g["posting_date"] ?? "");
    if (from && posting < from) continue;
    if (to && posting > to) continue;
    const root = rootType.get(String(g["account"] ?? ""));
    if (root !== "Income" && root !== "Expense") { if (root) excludedBalanceSheet += 1; continue; }
    const income = root === "Income" ? n(g["credit"]) - n(g["debit"]) : 0;
    const expense = root === "Expense" ? n(g["debit"]) - n(g["credit"]) : 0;
    const cc = String(g["cost_center"] ?? "");
    if (!cc) { un.income = r2(un.income + income); un.expense = r2(un.expense + expense); un.entries += 1; continue; }
    const a = acc.get(cc) ?? { income: 0, expense: 0, entries: 0 };
    a.income = r2(a.income + income); a.expense = r2(a.expense + expense); a.entries += 1;
    acc.set(cc, a);
  }

  const rows: ProfitabilityRow[] = [...acc.entries()]
    .map(([costCenter, a]) => ({ costCenter, income: a.income, expense: a.expense, net: r2(a.income - a.expense), entries: a.entries }))
    .sort((x, y) => y.net - x.net);

  return { status: "ok", rows, unattributed: { ...un, net: r2(un.income - un.expense) }, excludedBalanceSheet };
}
