/**
 * NB-3 record change log over Core Version records (adapter logVersion: { created } or { changed: [field, old, new][] }).
 * Only scalar business fields are shown; internal fields (leading underscore, modified, docstatus bookkeeping) are skipped.
 * The preview's Version rows do not carry the acting user, so callers must not present an author.
 */
type Row = Record<string, unknown>;
const s = (v: unknown) => (v == null ? "" : String(v));
const SKIP = new Set(["modified", "modified_by", "creation", "owner", "idx", "__islocal", "__unsaved", "naming_series"]);

export type Change = { field: string; from: string; to: string };
export type ChangeEntry = { version: string; at: string; created: boolean; changes: Change[] };

export function changeEntries(versions: Row[], dt: string, name: string): ChangeEntry[] {
  const out: ChangeEntry[] = [];
  for (const v of versions) {
    if (s(v["ref_doctype"]) !== dt || s(v["docname"]) !== name) continue;
    let data: { created?: boolean; changed?: unknown[] } = {};
    try { data = JSON.parse(s(v["data"]) || "{}"); } catch { continue; }
    const changes = (Array.isArray(data.changed) ? data.changed : [])
      .filter((c): c is [string, unknown, unknown] => Array.isArray(c) && c.length === 3 && typeof c[0] === "string")
      .filter(([f]) => !f.startsWith("_") && !SKIP.has(f))
      .map(([field, from, to]) => ({ field, from: s(from), to: s(to) }));
    if (!data.created && !changes.length) continue;
    out.push({ version: s(v["name"]), at: s(v["creation"]), created: !!data.created, changes });
  }
  return out.sort((a, b) => b.at.localeCompare(a.at) || b.version.localeCompare(a.version));
}
