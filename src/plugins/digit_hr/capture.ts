/** Standalone files reuse Core validation; never synchronize devices or post attendance. */
// The snapshot ran the import inside adapter.atomic(), which the Final Core adapter does not provide. The HR-owned
// allOrNothing() below gives the same result through public adapter calls only: rows inserted by a failed import are
// removed again, so a partial check-in file never stays half-imported.
import { adapter, type Doc } from '@/lib/adapter';
import { assertScoped, scopedGet } from '@/plugins/digit_hr/compat/scope';
import { autoMap, runImport, validate, type TableSpec } from '@/lib/dataImport';

export function importCheckins(rows: string[][], specs: TableSpec[], fileName: string): Doc {
  if (specs[0]?.meta.name !== 'Employee Checkin' || rows.length < 2) throw new Error('A check-in file with data rows is required');
  const header = rows[0] ?? [];
  const checked = validate(rows.slice(1), autoMap(header, specs), specs, 'Insert New Records');
  if (checked.issues.length) throw new Error(checked.issues.map(i => `${i.row}: ${i.messages.join('; ')}`).join('\n'));
  assertScoped('Data Import', 'create');
  assertScoped('Data Import Log', 'create');
  for (const row of checked.docs) {
    const employee = scopedGet('Employee', String(row.doc['employee'] ?? ''));
    if (!employee) throw new Error('Employee not found or not permitted');
    assertScoped('Employee Checkin', 'create', { ...row.doc, doctype: 'Employee Checkin', name: '', company: employee['company'] } as Doc);
  }
  return allOrNothing(() => {
  const results = runImport(checked.docs, [], specs, 'Insert New Records', false);
  const log = adapter.insertDoc('Data Import', {
    reference_doctype: 'Employee Checkin', import_type: 'Insert New Records', status: 'Success',
    import_file: fileName, submit_after_import: 0, template_options: JSON.stringify({ header }), import_log: JSON.stringify(results),
  });
  for (const result of results) adapter.insertDoc('Data Import Log', {
    data_import: log.name, row_indexes: JSON.stringify([result.row]), success: result.ok ? 1 : 0,
    docname: result.name ?? '', messages: JSON.stringify(result.messages),
  });
  return log;
  });
}
/**
 * Runs `work`; if it throws, removes every record it created in any DocType (rows plus their Version/Comment history),
 * then rethrows — so a failed import leaves the same records as before. Data-level equivalent of the snapshot's
 * adapter.atomic(); unlike a store transaction, adapter observers are notified of the compensating removals.
 */
export function allOrNothing<T>(work: () => T): T {
  const before = new Map(adapter.doctypes().map((dt) => [dt, new Set(adapter.list(dt, { includeLocal: true }).map((d) => d.name))]));
  try { return work(); }
  catch (error) {
    for (const dt of adapter.doctypes()) { const had = before.get(dt); for (const d of adapter.list(dt, { includeLocal: true })) if (!had?.has(d.name)) adapter.remove(dt, d.name); }
    throw error;
  }
}
