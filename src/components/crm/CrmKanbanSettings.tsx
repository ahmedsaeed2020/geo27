import { useState } from "react";
import { Modal } from "./CrmShell";
import { useL } from "./crmI18n";
import type { ViewState } from "./CrmViewBar";

type Col = { key: string; label: string };
/** Card fields from the view's kanban_fields JSON (source CRM View Settings), else the given defaults. */
export function cardKeysOf(v: ViewState, fallback: string[]): string[] { try { if (v.kanban_fields) return JSON.parse(v.kanban_fields); } catch { /* keep defaults */ } return fallback; }

/** Port of KanbanSettings.vue: column field, title field and card fields. */
export function CrmKanbanSettings({ v, set, pool, column, title, cards }: { v: ViewState; set: (p: Partial<ViewState>) => void; pool: Col[]; column: string; title: string; cards: string[] }) {
  const { L } = useL(); const [open, setOpen] = useState(false);
  const sel = (label: string, value: string, on: (x: string) => void) => <label className="block">{L(label)}<select aria-label={L(label)} className="crm-input" value={value} onChange={(e) => on(e.target.value)}>{pool.map((c) => <option key={c.key} value={c.key}>{L(c.label)}</option>)}</select></label>;
  return <>
    <button className="crm-input w-auto" aria-label={L("Kanban Settings")} onClick={() => setOpen(true)}>{L("Kanban Settings")}</button>
    {open && <Modal title={L("Kanban Settings")} onClose={() => setOpen(false)}><div className="space-y-3 text-sm">{sel("Column Field", column, (x) => set({ group_by_field: x }))}{sel("Title Field", title, (x) => set({ title_field: x }))}<fieldset><legend>{L("Fields")}</legend>{pool.map((c) => <label key={c.key} className="me-3 inline-flex items-center gap-1"><input type="checkbox" checked={cards.includes(c.key)} onChange={(e) => set({ kanban_fields: JSON.stringify(e.target.checked ? [...cards, c.key] : cards.filter((k) => k !== c.key)) })} />{L(c.label)}</label>)}</fieldset></div></Modal>}
  </>;
}
