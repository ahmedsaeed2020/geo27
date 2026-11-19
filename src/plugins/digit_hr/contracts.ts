/** Contract amendments are linked review records, never automatic contract/payroll mutations. */
import { adapter, type Doc } from '@/lib/adapter';
import { cachedMeta } from '@/lib/catalog';
import { assertScoped, scopedGet, scopedList } from '@/plugins/digit_hr/compat/scope';
import { insertHrDraft, listWithDrafts, scopedListWithDrafts } from '@/plugins/digit_hr/compat/drafts';

export function amendmentsForEmployee(employee: string): Doc[] {
  const contracts = new Set(scopedList('DIGIT Employment Contract').filter(d => d['employee'] === employee).map(d => d.name));
  // unfinished (unsaved) reviews stay visible so the 360 page reopens them instead of starting a duplicate
  return scopedListWithDrafts('DIGIT Contract Amendment').filter(d => contracts.has(String(d['contract'] ?? '')));
}

export function contractAmendmentDraft(contractName: string): Doc {
  const contract = scopedGet('DIGIT Employment Contract', contractName);
  const meta = cachedMeta('DIGIT Contract Amendment');
  if (!contract || !meta || Number(contract.docstatus) === 2 || ['Terminated', 'Expired'].includes(String(contract['contract_status']))) throw new Error('Contract unavailable or closed');
  const employee = scopedGet('Employee', String(contract['employee'] ?? ''));
  if (!employee) throw new Error('Employee unavailable or not permitted');
  const fields = { contract: contractName, employee_name: employee['employee_name'] };
  assertScoped(meta.name, 'create', { name: '', doctype: meta.name, ...fields });
  // An unfinished review is reopened; submitted history remains separately visible.
  const existing = listWithDrafts(meta.name).find(d => d['contract'] === contractName && Number(d.docstatus) === 0);
  if (existing) {
    const visible = scopedGet(meta.name, existing.name);
    if (!visible) throw new Error('Existing amendment not permitted');
    return visible;
  }
  return insertHrDraft(meta, fields);
}