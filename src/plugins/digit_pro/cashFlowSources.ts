/** Read-only source bridge to the existing cash_flow.py port in reportRunner.ts.
 * GL supplies date/book/dimension filtering and amounts; no posting or substitute statement. */
import { scopedList } from '@/lib/scope';
import type { Doc } from '@/lib/adapter';
import type { F } from '@/lib/reportRunner';
import { guardedReport } from './intelligence';

const predicates: Record<string, (account: Doc) => boolean> = {
  'Net Profit/Loss': a => a['root_type'] === 'Income' || a['root_type'] === 'Expense',
  'Net Change in Accounts Receivable': a => a['account_type'] === 'Receivable',
  'Net Change in Accounts Payable': a => a['account_type'] === 'Payable',
  'Net Change in Inventory': a => a['account_type'] === 'Stock',
  'Net Change in Tax and other liabilities': a => a['account_type'] === 'Tax' || (a['root_type'] === 'Liability' && (!a['account_type'] || a['account_type'] === 'Stock Received But Not Billed')),
  'Net Change in Fixed Asset': a => a['account_type'] === 'Fixed Asset',
  'Net Change in Equity': a => a['root_type'] === 'Equity',
};
export function hasCashFlowSources(section: string) { return !!predicates[section]; }
export function cashFlowSources(section: string, filters: F, user: string) {
  const predicate = predicates[section];
  if (!predicate) return { status: 'unavailable' as const, rows: [], total: 0 };
  const ledger = guardedReport('General Ledger', { ...filters, account: '', voucher_no: '', party: '', party_type: '', group_by: '' }, user);
  if (ledger.status !== 'ok') return { status: ledger.status, rows: [], total: 0 };
  const accounts = new Set(scopedList('Account', user).filter(a => a['company'] === filters['company'] && predicate(a)).map(a => a.name));
  const grouped = new Map<string, { account: string; debit: number; credit: number; entries: number }>();
  for (const row of ledger.result?.rows ?? []) {
    if (row.is_total || row['is_group'] || !row['gl_entry'] || !accounts.has(String(row['account']))) continue;
    const account = String(row['account']);
    const value = grouped.get(account) ?? { account, debit: 0, credit: 0, entries: 0 };
    value.debit += Number(row['debit']) || 0; value.credit += Number(row['credit']) || 0; value.entries++;
    grouped.set(account, value);
  }
  const round = (v: number) => Math.round(v * 100) / 100;
  const rows = [...grouped.values()].map(r => ({ ...r, debit: round(r.debit), credit: round(r.credit), contribution: round(r.credit - r.debit) })).sort((a,b) => a.account.localeCompare(b.account));
  return { status: 'ok' as const, rows, total: round(rows.reduce((s,r) => s+r.contribution,0)) };
}