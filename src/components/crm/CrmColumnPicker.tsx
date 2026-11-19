import { useEffect, useState } from "react";
import { useL } from "./crmI18n";

export type Col = { key: string; label: string };

/**
 * Shared column settings (frappe-ui ColumnSettings.vue): visibility + ordering, persisted per DocType.
 * Used by every CRM list so Leads, Deals and the directory lists share one implementation.
 */
export function useCrmColumns(doctype: string, defaults: Col[], pool: Col[]) {
  const KEY = `digit-crm:cols:${doctype}`;
  const [state, setState] = useState<{ key: string; keys: string[] | null }>({ key: "", keys: null });
  useEffect(() => {
    let keys: string[] | null = null;
    try { const r = localStorage.getItem(KEY); const parsed: unknown = r ? JSON.parse(r) : null; if (Array.isArray(parsed) && parsed.every((k) => typeof k === "string")) keys = parsed; } catch { /* ignore */ }
    setState({ key: KEY, keys });
  }, [KEY]);
  const colKeys = state.key === KEY ? state.keys : null;
  const cols = colKeys
    ? colKeys.map((k) => pool.find((c) => c.key === k)).filter((c): c is Col => !!c)
    : defaults;
  const save = (k: string[] | null) => { setState({ key: KEY, keys: k }); if (k) localStorage.setItem(KEY, JSON.stringify(k)); else localStorage.removeItem(KEY); };
  return { cols, pool, save, ready: state.key === KEY };
}

export function CrmColumnPicker({ cols, pool, save }: { cols: Col[]; pool: Col[]; save: (k: string[] | null) => void }) {
  const [open, setOpen] = useState(false);
  const { L } = useL();
  const visible = cols.map((c) => c.key);
  const toggle = (k: string, on: boolean) =>
    save(on ? [...visible, k] : visible.length > 1 ? visible.filter((x) => x !== k) : visible);
  const move = (k: string, d: -1 | 1) => {
    const i = visible.indexOf(k); const j = i + d;
    if (i < 0 || j < 0 || j >= visible.length) return;
    const n = [...visible]; [n[i], n[j]] = [n[j]!, n[i]!]; save(n);
  };
  return (
    <div className="relative">
      <button className="crm-input w-auto" aria-label={L("Columns")} onClick={() => setOpen(!open)}>{L("Columns")}</button>
      {open && (
        <div role="dialog" aria-label={L("Columns")} className="absolute end-0 z-30 mt-1 max-h-80 w-72 overflow-auto rounded-lg border border-crm-line bg-crm-surface p-2 shadow-lg">
          {pool.map((c) => {
            const on = visible.includes(c.key);
            return (
              <div key={c.key} className="flex items-center gap-2 px-1 py-0.5 text-sm">
                <input type="checkbox" aria-label={`${L("Column")} ${c.label}`} checked={on} onChange={(e) => toggle(c.key, e.target.checked)} />
                <span className="flex-1 truncate">{L(c.label)}</span>
                {on && <>
                  <button aria-label={`${L("Move up")} ${c.label}`} className="px-1 text-crm-muted" onClick={() => move(c.key, -1)}>↑</button>
                  <button aria-label={`${L("Move down")} ${c.label}`} className="px-1 text-crm-muted" onClick={() => move(c.key, 1)}>↓</button>
                </>}
              </div>
            );
          })}
          <button className="crm-input mt-2 w-full" onClick={() => save(null)}>{L("Reset to default")}</button>
        </div>
      )}
    </div>
  );
}
