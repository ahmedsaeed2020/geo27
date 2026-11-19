import { adapter } from '@/lib/adapter';
/** Exact HR casing only: never move shared Enterprise records. Safe on every boot. */
export function migrateHrNames() {
  adapter.batch(() => {
    const RENAMES: ReadonlyArray<readonly [string, string]> = [['DIGIT Integration Log', 'DIGIT HR Integration Log'], ['DIGIT Approval Delegation', 'DIGIT HR Approval Delegation']];
    for (const [oldName, newName] of RENAMES) {
      for (const d of adapter.list(oldName)) {
        if (d.doctype !== oldName) continue;
        const existing = adapter.get(newName, d.name);
        if (existing) continue; // preserve both on collision, never overwrite user data
        adapter.insertDocQuiet(newName, { ...d, doctype: newName });
        adapter.remove(oldName, d.name);
      }
    }
  });
}
