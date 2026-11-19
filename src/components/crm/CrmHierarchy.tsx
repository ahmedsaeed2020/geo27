import { useMemo, useState } from "react";
import { Plus, Trash2, ChevronDown, ChevronRight, CornerLeftUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { adapter, useStoreVersion } from "@/lib/adapter";
import { addUsers, buildTree, canDrop, candidates, enrich, filterTree, hierarchyEnabled, removeNode, reparent, DOCTYPE, type HNode } from "@/lib/crmHierarchy";
import { useL } from "./crmI18n";

function UserPicker({ parent, placed, onAdd, onCancel }: { parent: HNode | null; placed: Set<string>; onAdd: (u: string[]) => void; onCancel: () => void }) {
  const { L } = useL(); const [sel, setSel] = useState<string[]>([]);
  const list = candidates(parent, placed);
  return <div role="dialog" aria-label={L("Add Users")} className="border border-crm-line rounded p-2 space-y-1 bg-background">
    {list.length ? list.map(u => <label key={u.name} className="flex gap-2 text-sm"><input type="checkbox" checked={sel.includes(u.name)} onChange={e => setSel(e.target.checked ? [...sel, u.name] : sel.filter(s => s !== u.name))} /><span data-no-i18n>{String(u["full_name"] || u.name)}</span></label>) : <p className="text-xs text-crm-muted">{L("No users in hierarchy")}</p>}
    <div className="flex gap-2"><Button size="sm" disabled={!sel.length} onClick={() => onAdd(sel)}>{L("Add")} ({sel.length})</Button><Button size="sm" variant="ghost" onClick={onCancel}>{L("Cancel")}</Button></div>
  </div>;
}

export function CrmHierarchy() {
  useStoreVersion(); const { L } = useL();
  const [search, setSearch] = useState(""); const [role, setRole] = useState("All");
  const [adding, setAdding] = useState<string | null>(null); const [msg, setMsg] = useState("");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set()); const [drag, setDrag] = useState<HNode | null>(null);
  const [removing, setRemoving] = useState<HNode | null>(null);
  const enabled = hierarchyEnabled();
  const nodes = enrich(adapter.list(DOCTYPE)); const tree = buildTree(nodes);
  const visible = filterTree(tree, search, role); const placed = useMemo(() => new Set(nodes.map(n => n.user)), [nodes]);
  const setEnabled = (v: boolean) => { if (!v && !window.confirm(L("Disable Sales Hierarchy") + "?")) return; const s = adapter.get("FCRM Settings", "FCRM Settings"); if (s) adapter.update("FCRM Settings", s.name, { enable_sales_hierarchy: v ? 1 : 0 }); else adapter.insertDoc("FCRM Settings", { name: "FCRM Settings", enable_sales_hierarchy: v ? 1 : 0 }); setMsg(L(v ? "Sales hierarchy enabled" : "Sales hierarchy disabled")); };
  const doAdd = (parent: HNode | null, users: string[]) => { const r = addUsers(parent, users); setMsg(r.error ? r.error : L(r.added === 1 ? "User added to hierarchy" : "Users added to hierarchy")); setAdding(null); };
  const find = (list: HNode[], name: string): HNode | undefined => { for (const n of list) { if (n.name === name) return n; const c = find(n.children, name); if (c) return c; } return undefined; };
  const row = (n: HNode, depth: number): React.ReactNode => <div key={n.name} role="treeitem" aria-expanded={n.children.length ? !collapsed.has(n.name) : undefined}>
    <div draggable onDragStart={() => setDrag(find(tree, n.name) || n)} onDragEnd={() => setDrag(null)} onDragOver={e => { if (canDrop(drag || undefined, n)) e.preventDefault(); }} onDrop={e => { e.preventDefault(); if (drag && canDrop(drag, n) && drag.reports_to !== n.name) { reparent(drag.name, n.name); setMsg(L("Updated reports to")); } setDrag(null); }}
      className="flex items-center gap-2 border-b border-crm-line h-8 text-sm" style={{ paddingInlineStart: depth * 28 }}>
      <button className="w-4" aria-label={L("Toggle")} onClick={() => setCollapsed(s => { const c = new Set(s); if (c.has(n.name)) c.delete(n.name); else c.add(n.name); return c; })}>{n.children.length ? (collapsed.has(n.name) ? <ChevronRight className="size-3 rtl:rotate-180" /> : <ChevronDown className="size-3" />) : null}</button>
      <span className="flex-1 truncate" data-no-i18n>{n.full_name}</span>
      <span className="text-crm-muted text-xs">{L(n.role)}</span>{!n.enabled && <span className="text-xs text-crm-muted">{L("disabled")}</span>}
      {n.role === "Sales Manager" && <Button size="icon" variant="ghost" title={L("Add direct reports")} onClick={() => setAdding(n.name)}><Plus /></Button>}
      {n.reports_to && <Button size="icon" variant="ghost" title={L("Move to top level")} onClick={() => { reparent(n.name, ""); setMsg(L("Updated reports to")); }}><CornerLeftUp /></Button>}
      <Button size="icon" variant="ghost" title={L("Delete")} onClick={() => setRemoving(n)}><Trash2 /></Button>
    </div>
    {adding === n.name && <div style={{ paddingInlineStart: (depth + 1) * 28 }}><UserPicker parent={n} placed={placed} onAdd={u => doAdd(n, u)} onCancel={() => setAdding(null)} /></div>}
    {!collapsed.has(n.name) && n.children.map(c => row(c, depth + 1))}
  </div>;
  const removeChildren = removing ? nodes.filter(n => n.reports_to === removing.name).length : 0;
  const doRemove = (mode: "simple" | "reassign" | "cascade") => { if (removing) removeNode(nodes, removing, mode); setRemoving(null); setMsg(L("Removed from hierarchy.")); };
  return <div className="space-y-4" data-hierarchy>
    <div className="flex items-start gap-2"><div className="flex-1"><h2 className="font-semibold">{L("Sales Hierarchy")}</h2><p className="text-sm text-crm-muted">{L("Restrict visibility of Leads and Deals based on a reporting tree.")}</p></div>
      {enabled && <><Button variant="outline" onClick={() => setEnabled(false)}>{L("Disable")}</Button><Button onClick={() => setAdding("")}><Plus />{L("Add User")}</Button></>}</div>
    {msg && <p role="status" className="text-sm text-crm-muted" data-no-i18n>{msg}</p>}
    {!enabled ? <div className="border border-crm-line rounded p-4 flex items-center gap-3"><div className="flex-1"><p className="font-medium">{L("Enable Sales Hierarchy")}</p><p className="text-sm text-crm-muted">{L("Restrict visibility using a reporting tree")}</p></div><Button onClick={() => setEnabled(true)}>{L("Enable")}</Button></div> : <>
      <div className="flex gap-2"><input className="crm-input flex-1" placeholder={L("Search users")} aria-label={L("Search users")} value={search} onChange={e => setSearch(e.target.value)} /><select className="crm-input w-40" aria-label={L("Role")} value={role} onChange={e => setRole(e.target.value)}>{["All", "Sales Manager", "Sales User"].map(r => <option key={r} value={r}>{L(r)}</option>)}</select></div>
      {adding === "" && <UserPicker parent={null} placed={placed} onAdd={u => doAdd(null, u)} onCancel={() => setAdding(null)} />}
      {visible.length ? <div role="tree" aria-label={L("Sales Hierarchy")}>{visible.map(n => row(n, 0))}</div> : <div className="text-center py-6"><p className="font-medium">{L(search || role !== "All" ? "No matching users" : "No users in hierarchy")}</p><p className="text-sm text-crm-muted">{L(search || role !== "All" ? "No users match the current filter." : "Add one to get started.")}</p></div>}
    </>}
    {removing && <div role="alertdialog" aria-label={L("Delete")} className="border border-crm-line rounded p-3 space-y-2"><p className="text-sm">{L(removeChildren ? "What should happen to their direct reports?" : "Are you sure you want to remove this user from the hierarchy?")} <b data-no-i18n>{removing.full_name}</b></p>
      <div className="flex gap-2 flex-wrap">{removeChildren ? <><Button variant="destructive" onClick={() => doRemove("cascade")}>{L("Unlink & Delete Users")} ({removeChildren + 1})</Button><Button variant="outline" onClick={() => doRemove("reassign")}>{L("Delete Only User")}</Button></> : <Button variant="destructive" onClick={() => doRemove("simple")}>{L("Delete")}</Button>}<Button variant="ghost" onClick={() => setRemoving(null)}>{L("Cancel")}</Button></div></div>}
  </div>;
}
