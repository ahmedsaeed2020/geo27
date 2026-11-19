/** Parent keys never use display labels; stale/denied selections do not widen a register. */
import type { Doc } from '@/lib/adapter';
export function relatedRows(rows: Doc[], field: string, selected: string, readableParent: Doc | undefined): Doc[] {
  if (!selected) return rows;
  if (!readableParent || readableParent.name !== selected) return [];
  return rows.filter(row => row[field] === selected);
}