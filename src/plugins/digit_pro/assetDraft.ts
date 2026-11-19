/** Asset-context draft prefills only; validation and lifecycle effects remain native. */
import { adapter, type Doc } from '@/lib/adapter';
import { newChildRow } from '@/lib/documentApi';
import { cachedMeta } from '@/lib/catalog';
import { scopedGet, scopedList } from '@/lib/scope';
import { can } from './finance';

export function assetDraftContext(dt: string, company: string, user: string, asset?: string) {
 const source = asset ? scopedGet('Asset', asset, user) : undefined;
 if (asset && (!source || source['company'] !== company)) return undefined;
 if (source && dt !== 'Asset' && (Number(source.docstatus) !== 1 || ['Sold','Scrapped','Capitalized','Cancelled'].includes(String(source['status'])))) return undefined;
 const prefill: Record<string, unknown> = { company };
 if (source) {
  if (dt === 'Asset Movement') {
   const childMeta = cachedMeta('Asset Movement Item');
   if (!childMeta) return undefined;
   prefill['transaction_date'] = new Date().toISOString().slice(0,19).replace('T',' ');
   prefill['assets'] = [{ ...newChildRow(childMeta, { name: '', doctype: 'Asset Movement', company }, 'assets', 1, user), asset: source.name, company,
    asset_name: source['asset_name'], source_location: source['location'] ?? '', from_employee: source['custodian'] ?? '' }];
   // Destination and purpose must be chosen on the native form.
  } else prefill[dt === 'Asset Maintenance' ? 'asset_name' : 'asset'] = source.name;
 }
 const proposed: Doc = { doctype: dt, name: '', ...prefill };
 if (!cachedMeta(dt) || !can(dt, 'create', proposed, user)) return undefined;
 return prefill;
}

export function existingAssetMaintenance(asset: string, user: string) {
 return scopedList('Asset Maintenance', user).find(p => p['asset_name'] === asset);
}

export function createAssetDraft(dt: string, company: string, user: string, asset?: string): Doc | undefined {
 const prefill = assetDraftContext(dt, company, user, asset);
 const meta = cachedMeta(dt);
 if (!prefill || !meta) return undefined;
 if (dt === 'Asset Maintenance' && asset) {
  const existing = existingAssetMaintenance(asset, user);
  if (existing) return existing;
  // The native plan has a unique asset link. Never clone an unreadable plan.
  if (adapter.list(dt).some(p => p['asset_name'] === asset)) return undefined;
 }
 const doc = adapter.insert(meta);
 try {
  adapter.update(dt, doc.name, prefill);
  return adapter.get(dt, doc.name);
 } catch (error) {
  adapter.remove(dt, doc.name);
  throw error;
 }
}