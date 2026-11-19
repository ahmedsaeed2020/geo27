/** Shared read-only source boundary for Pro stock exposure and movement drills. */
import { adapter, type Doc } from '@/lib/adapter';
import { scopedList } from '@/lib/scope';
import { sourceStatus, type SourceStatus } from './finance';

export function selectPostedStock(ledger: Doc[], warehouses: Doc[], company?: string) {
  const owners = new Map(warehouses.map(w => [w.name, String(w['company'] || '')]));
  return ledger.filter(e => {
    const owner = owners.get(String(e['warehouse'] || ''));
    return Number(e.docstatus) === 1 && !Number(e['is_cancelled']) && !!owner
      && (!company || owner === company) && (!e['company'] || e['company'] === owner);
  });
}

export function postedStockSources(company: string | undefined, user: string) {
  let status: SourceStatus = 'ok';
  for (const dt of ['Stock Ledger Entry', 'Warehouse', 'Item']) {
    const st = sourceStatus(dt, user);
    if (st !== 'ok') { status = st; break; }
  }
  if (status !== 'ok') return { status, rows: [] as Doc[], warehouses: [] as Doc[] };
  const warehouses = scopedList('Warehouse', user);
  const readable = scopedList('Stock Ledger Entry', user);
  const ids = new Set(readable.map(d => d.name));
  const owners = new Set(adapter.list('Warehouse').filter(w => !company || w['company'] === company).map(w => w.name));
  const warehouseIds = new Set(warehouses.map(w => w.name));
  const items = new Set(scopedList('Item', user).map(d => d.name));
  // Never label a partially readable movement set as the complete company value.
  if (adapter.list('Stock Ledger Entry').some(e => owners.has(String(e['warehouse']))
    && (!ids.has(e.name) || !warehouseIds.has(String(e['warehouse'])) || !items.has(String(e['item_code'])))))
    return { status: 'denied' as const, rows: [] as Doc[], warehouses: [] as Doc[] };
  return { status, rows: selectPostedStock(readable, warehouses, company), warehouses };
}