/** Read-only Fixed Assets projections. Canonical records and parent-scoped children only. */
import type { Doc } from '@/lib/adapter';
import { scopedList } from '@/lib/scope';
import { sourceStatus } from './finance';
export const ASSET_SOURCES = ['Asset', 'Asset Category', 'Location', 'Asset Depreciation Schedule', 'Asset Movement', 'Asset Movement Item', 'Asset Maintenance', 'Asset Maintenance Log', 'Asset Repair', 'Asset Capitalization', 'Asset Value Adjustment', 'Finance Book', 'Employee', 'Purchase Receipt', 'Purchase Invoice', 'Journal Entry', 'GL Entry'];
const text = (v: unknown) => String(v ?? '');
const number = (v: unknown): number | undefined => v === undefined || v === null || v === '' || !Number.isFinite(Number(v)) ? undefined : Number(v);
const children = (d: Doc, key: string) => Array.isArray(d[key]) ? d[key] as Record<string, unknown>[] : [];
export type AssetScope = { company: string; asof: string; book?: string | undefined };
export type AssetData = Record<string, Doc[]>;
export type AssetIssue = { kind: string; asset: Doc; dt: string; name: string; date: string; amount?: number | undefined; reason: string; action: string };
export function projectAssets(data: AssetData, scope: AssetScope) {
  const all = (data['Asset'] ?? []).filter(a => a['company'] === scope.company && Number(a.docstatus) !== 2 && (!a['purchase_date'] || text(a['purchase_date']) <= scope.asof) && (!scope.book || a['default_finance_book'] === scope.book || children(a, 'finance_books').some(b => b['finance_book'] === scope.book)));
  const byName = new Map(all.map(a => [a.name, a]));
  const financial = (a: Doc) => {
    const b = scope.book ? children(a, 'finance_books').find(b => b['finance_book'] === scope.book) : undefined;
    const cost = number(a['net_purchase_amount'] ?? a['gross_purchase_amount']);
    const book = number(scope.book ? b?.['value_after_depreciation'] : a['value_after_depreciation']);
    return { cost, book, accumulated: cost !== undefined && book !== undefined ? cost - book : undefined };
  };
  const schedules = (data['Asset Depreciation Schedule'] ?? []).filter(d => Number(d.docstatus) === 1 && byName.has(text(d['asset'])) && d['company'] === scope.company && (!scope.book || d['finance_book'] === scope.book));
  const dep = schedules.flatMap(s => children(s, 'depreciation_schedule').filter(r => r['schedule_date'] && number(r['depreciation_amount']) !== undefined).map(r => ({ asset: byName.get(text(s['asset'])), schedule: s.name, date: text(r['schedule_date']), amount: Number(r['depreciation_amount']), je: text(r['journal_entry']), book: text(s['finance_book']) }))).filter(r => r.asset);
  const due = dep.filter(r => !r.je && r.date <= scope.asof);
  const issues: AssetIssue[] = [];
  for (const r of due) if (r.asset) issues.push({ kind: 'depreciation', asset: r.asset, dt: 'Asset', name: r.asset.name, date: r.date, amount: r.amount, reason: 'Due, not booked', action: 'Depreciation Review' });
  for (const a of all) {
    if (Number(a.docstatus) === 0) issues.push({ kind: 'drafts', asset: a, dt: 'Asset', name: a.name, date: text(a['purchase_date']), reason: 'Draft asset awaiting completion', action: 'Open asset' });
    if (Number(a.docstatus) === 1 && !['Sold', 'Scrapped', 'Capitalized'].includes(text(a['status'])) && (!a['location'] || !a['custodian'])) issues.push({ kind: 'custody', asset: a, dt: 'Asset', name: a.name, date: text(a['purchase_date']), reason: !a['location'] ? 'Location not assigned' : 'Custodian not assigned', action: 'Open asset' });
  }
  const repairs = (data['Asset Repair'] ?? []).filter(d => byName.has(text(d['asset'])) && d['company'] === scope.company);
  for (const r of repairs.filter(r => r['repair_status'] === 'Pending' && Number(r.docstatus) !== 2)) {
    const asset = byName.get(text(r['asset'])); if (asset) issues.push({ kind: 'repairs', asset, dt: 'Asset Repair', name: r.name, date: text(r['failure_date']).slice(0,10), amount: number(r['total_repair_cost']), reason: 'Repair pending completion', action: 'Open repair' });
  }
  const plans = (data['Asset Maintenance'] ?? []).filter(d => byName.has(text(d['asset_name'])) && d['company'] === scope.company);
  const planMap = new Map(plans.map(p => [p.name, p]));
  const logs = (data['Asset Maintenance Log'] ?? []).filter(d => planMap.has(text(d['asset_maintenance'])));
  for (const l of logs.filter(l => l['due_date'] && text(l['due_date']) < scope.asof && !['Completed', 'Cancelled'].includes(text(l['maintenance_status'])))) {
    const p = planMap.get(text(l['asset_maintenance'])); const asset = p ? byName.get(text(p['asset_name'])) : undefined;
    if (asset) issues.push({ kind: 'maintenance', asset, dt: 'Asset Maintenance Log', name: l.name, date: text(l['due_date']), reason: 'Maintenance overdue', action: 'Open maintenance log' });
  }
  const movements = (data['Asset Movement'] ?? []).filter(d => d['company'] === scope.company && children(d, 'assets').some(r => byName.has(text(r['asset']))));
  for (const m of movements.filter(m => Number(m.docstatus) === 0)) {
    const asset = byName.get(text(children(m, 'assets').find(r => byName.has(text(r['asset'])))?.['asset']));
    if (asset) issues.push({ kind: 'movements', asset, dt: 'Asset Movement', name: m.name, date: text(m['transaction_date']).slice(0,10), reason: 'Draft movement awaiting review', action: 'Open movement' });
  }
  const sum = (key: 'cost' | 'book' | 'accumulated') => all.length && all.some(a => financial(a)[key] === undefined) ? undefined : all.reduce((t,a) => t + (financial(a)[key] ?? 0),0);
  const categories = [...new Set(all.map(a => text(a['asset_category'])))].map(category => { const assets = all.filter(a => text(a['asset_category']) === category); return { category, count: assets.length, book: assets.some(a => financial(a).book === undefined) ? undefined : assets.reduce((t,a) => t + (financial(a).book ?? 0),0) }; }).sort((a,b) => (b.book ?? 0)-(a.book ?? 0));
  const statuses = [...new Set(all.map(a => text(a['status'] || 'Draft')))].map(status => ({ status, count: all.filter(a => text(a['status'] || 'Draft') === status).length }));
  const months = [...new Set(dep.map(r => r.date.slice(0,7)))].filter(m => m <= scope.asof.slice(0,7)).sort().slice(-6);
  const trend = months.map(month => ({ month, scheduled: dep.filter(r => r.date.startsWith(month)).reduce((t,r)=>t+r.amount,0), linked: dep.filter(r => r.date.startsWith(month) && r.je).reduce((t,r)=>t+r.amount,0) }));
  const activity = [...movements.map(d => ({ dt:'Asset Movement', doc:d, date:text(d['transaction_date']).slice(0,10) })), ...repairs.map(d=>({ dt:'Asset Repair', doc:d, date:text(d['failure_date']).slice(0,10) })), ...all.map(d=>({ dt:'Asset', doc:d, date:text(d['purchase_date']) }))].filter(r=>r.date && r.date<=scope.asof).sort((a,b)=>b.date.localeCompare(a.date)).slice(0,8);
  return { all, financial, dep, due, issues: issues.sort((a,b)=>a.date.localeCompare(b.date)), cost:sum('cost'), book:sum('book'), accumulated:sum('accumulated'), categories, statuses, trend, activity, underMaintenance:all.filter(a=>a['status']==='In Maintenance').length, missingCustody:issues.filter(i=>i.kind==='custody').length };
}
export function assetWorkspace(scope: AssetScope, user: string) {
  const states = Object.fromEntries(ASSET_SOURCES.map(dt=>[dt,sourceStatus(dt,user)]));
  const data = Object.fromEntries(ASSET_SOURCES.map(dt=>[dt,states[dt]==='ok'?scopedList(dt,user):[]]));
  return { ...projectAssets(data,scope), states, data };
}
