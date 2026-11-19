import { useState } from "react";
import { ArrowUp, ArrowDown, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { adapter, useStoreVersion } from "@/lib/adapter";
import { useL } from "./crmI18n";

/** Settings/HomeActions.vue — FCRM Settings.dropdown_items (CRM Dropdown Item grid), defaults from crm/hooks.py standard_dropdown_items. */
export type DropdownItem = { name1?: string; label: string; type: "Route" | "Separator"; route?: string; open_in_new_window?: number; hidden?: number; is_standard?: number; icon?: string };
export const STANDARD_ITEMS: DropdownItem[] = [
  { name1: "app_selector", label: "Apps", type: "Route", route: "#", is_standard: 1 },
  { name1: "settings", label: "Settings", type: "Route", icon: "settings", route: "#", is_standard: 1 },
  { name1: "login_to_fc", label: "Login to Frappe Cloud", type: "Route", route: "#", is_standard: 1 },
  { name1: "about", label: "About", type: "Route", icon: "info", route: "#", is_standard: 1 },
  { name1: "separator", label: "", type: "Separator", is_standard: 1 },
  { name1: "logout", label: "Log out", type: "Route", icon: "log-out", route: "#", is_standard: 1 },
];
export function dropdownItems(): DropdownItem[] {
  const raw = adapter.get("FCRM Settings", "FCRM Settings")?.["dropdown_items"];
  return Array.isArray(raw) && raw.length ? raw as DropdownItem[] : STANDARD_ITEMS;
}

export function CrmHomeActions() {
  useStoreVersion(); const { L } = useL();
  const [rows, setRows] = useState<DropdownItem[]>(() => structuredClone(dropdownItems()));
  const [dirty, setDirty] = useState(false); const [error, setError] = useState("");
  const edit = (next: DropdownItem[]) => { setRows(next); setDirty(true); };
  const patch = (i: number, p: Partial<DropdownItem>) => edit(rows.map((r, j) => j === i ? { ...r, ...p } : r));
  const move = (i: number, d: number) => { const n = [...rows]; const j = i + d; if (j < 0 || j >= n.length) return; [n[i], n[j]] = [n[j]!, n[i]!]; edit(n); };
  const save = () => {
    const bad = rows.find(r => r.type === "Route" && !r.is_standard && (!r.label || !r.route));
    if (bad) { setError(L("Label and Route are required for Route items")); return; }
    const s = adapter.get("FCRM Settings", "FCRM Settings");
    if (s) adapter.update("FCRM Settings", "FCRM Settings", { dropdown_items: rows }); else adapter.insertDoc("FCRM Settings", { name: "FCRM Settings", dropdown_items: rows });
    setDirty(false); setError("");
  };
  return <div className="space-y-3" data-home-actions>
    <div className="flex items-start gap-2"><p className="flex-1 text-sm text-crm-muted">{L("Configure actions that appear on the home dropdown")}</p>{dirty && <Button onClick={save}>{L("Update")}</Button>}</div>
    <table className="w-full text-sm"><thead className="text-crm-muted border-b border-crm-line"><tr>{["Label", "Type", "Route", "Open in new window", "Hidden", ""].map(h => <th key={h} className="p-1 text-start font-normal">{h && L(h)}</th>)}</tr></thead>
      <tbody>{rows.map((r, i) => <tr key={i} className="border-b border-crm-line">
        <td className="p-1"><input aria-label={L("Label")} className="crm-input" data-no-i18n value={r.label} readOnly={Boolean(r.is_standard)} onChange={e => patch(i, { label: e.target.value })} /></td>
        <td className="p-1"><select aria-label={L("Type")} className="crm-input" value={r.type} disabled={Boolean(r.is_standard)} onChange={e => patch(i, { type: e.target.value as DropdownItem["type"] })}><option value="Route">{L("Route")}</option><option value="Separator">{L("Separator")}</option></select></td>
        <td className="p-1">{r.type === "Route" && <input aria-label={L("Route")} className="crm-input" data-no-i18n value={r.route || ""} readOnly={Boolean(r.is_standard)} onChange={e => patch(i, { route: e.target.value })} />}</td>
        <td className="p-1">{r.type === "Route" && !r.is_standard && <input type="checkbox" aria-label={L("Open in new window")} checked={r.open_in_new_window !== 0} onChange={e => patch(i, { open_in_new_window: e.target.checked ? 1 : 0 })} />}</td>
        <td className="p-1"><input type="checkbox" aria-label={L("Hidden")} checked={Boolean(r.hidden)} onChange={e => patch(i, { hidden: e.target.checked ? 1 : 0 })} /></td>
        <td className="p-1 whitespace-nowrap"><Button size="icon" variant="ghost" title={L("Move up")} onClick={() => move(i, -1)}><ArrowUp /></Button><Button size="icon" variant="ghost" title={L("Move down")} onClick={() => move(i, 1)}><ArrowDown /></Button>{!r.is_standard && <Button size="icon" variant="ghost" title={L("Delete")} onClick={() => edit(rows.filter((_, j) => j !== i))}><Trash2 /></Button>}</td>
      </tr>)}</tbody></table>
    <Button variant="outline" onClick={() => edit([...rows, { label: "", type: "Route", route: "", open_in_new_window: 1, hidden: 0, is_standard: 0 }])}><Plus />{L("Add Row")}</Button>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
  </div>;
}
