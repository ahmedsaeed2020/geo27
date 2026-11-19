import { Link } from "@tanstack/react-router";
import { useQuery, queryOptions } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { indexQuery, loadMeta, LAYOUT_TYPES, TABLE_TYPES, type DocTypeMeta } from "@/lib/catalog";
import { adapter, useStoreVersion } from "@/lib/adapter";
import { gsAll, gsSave } from "@/lib/globalSearchConfig";

/**
 * DocType Settings modal (spec §2). Data comes from public/catalog/doctype_settings.json (scripts/extract-settings.py)
 * and DocType meta; edits are stored as adapter records (Single Settings docs, Workflow, Print Format, User Permission,
 * Notification, Email Template, Document Naming Rule, Custom DocPerm) so every view reads the same data.
 */
interface SettingField { settings: string; fieldname: string; label?: string; fieldtype: string; options?: string; description?: string; default?: string }
interface DtSettings { print_formats: { name: string; type: string; source: string }[]; notifications: { name: string; event?: string; subject?: string; source: string }[]; naming_series: string[]; settings: SettingField[] }
const settingsQuery = queryOptions({ queryKey: ["dt-settings"], queryFn: async () => (await (await fetch("/catalog/doctype_settings.json")).json()).doctypes as Record<string, DtSettings>, staleTime: Infinity, enabled: typeof window !== "undefined" });

export const SECTIONS = [
  ["Document", ["General", "Naming", "Workflow", "Print Formats"]],
  ["Permissions", ["Roles", "User Permissions"]],
  ["Communication", ["Notifications", "Email Templates"]],
  ["Data", ["Global Search"]],
] as const;
type Sec = (typeof SECTIONS)[number][1][number];

export function DocTypeSettings({ meta, initial = "General", onClose }: { meta: DocTypeMeta; initial?: Sec; onClose: () => void }) {
  const [sec, setSec] = useState<Sec>(initial);
  const { data } = useQuery(settingsQuery);
  useStoreVersion();
  const ds: DtSettings = data?.[meta.name] ?? { print_formats: [], notifications: [], naming_series: [], settings: [] };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/30 p-4" role="dialog" aria-label={`${meta.name} Settings`} data-doctype-settings>
      <div className="flex h-[85vh] w-full max-w-5xl overflow-hidden rounded-lg bg-card shadow-xl">
        <nav className="w-56 shrink-0 overflow-auto border-e border-border bg-muted/40 p-3 text-sm">
          <div className="mb-3 font-semibold">{meta.name}</div>
          {SECTIONS.map(([g, items]) => (
            <div key={g} className="mb-3">
              <div className="px-2 pb-1 text-[11px] font-semibold uppercase text-muted-foreground">{g}</div>
              {items.map((i) => <button key={i} type="button" data-section={i} onClick={() => setSec(i)} className={`block w-full rounded px-2 py-1.5 text-start ${sec === i ? "bg-card font-medium shadow-sm" : "hover:bg-card/60"}`}>{i}</button>)}
            </div>
          ))}
        </nav>
        <div className="min-w-0 flex-1 overflow-auto p-5">
          <div className="mb-4 flex items-center"><h2 className="text-lg font-semibold">{sec}</h2><button type="button" className="btn-ghost ms-auto" aria-label="Close" onClick={onClose}>✕</button></div>
          {sec === "General" && <General meta={meta} fields={ds.settings} />}
          {sec === "Naming" && <Naming meta={meta} series={ds.naming_series} />}
          {sec === "Workflow" && <RecordList dt="Workflow" filter={(d) => d["document_type"] === meta.name} title={(d) => String(d["workflow_name"] ?? d.name)} empty="No Workflow found" newLabel="New Workflow" create={() => ({ workflow_name: `${meta.name} Approval`, document_type: meta.name, is_active: 0, workflow_state_field: "workflow_state" })} />}
          {sec === "Print Formats" && <PrintFormats meta={meta} source={ds.print_formats} />}
          {sec === "Roles" && <Roles meta={meta} />}
          {sec === "User Permissions" && <RecordList dt="User Permission" search filter={(d) => d["allow"] === meta.name} title={(d) => `${String(d["user"])} → ${String(d["for_value"])}`} empty="No user permissions yet" newLabel="+ Add" create={() => ({ user: "Administrator", allow: meta.name, for_value: adapter.list(meta.name)[0]?.name ?? "", apply_to_all_doctypes: 1 })} />}
          {sec === "Notifications" && <RecordList dt="Notification" extra={ds.notifications.map((n) => ({ name: n.name, sub: `${n.event ?? ""} · ${n.source}` }))} filter={(d) => d["document_type"] === meta.name} title={(d) => String(d["subject"] ?? d.name)} empty="No Notifications found" newLabel="+ New" create={() => ({ subject: `New ${meta.name}`, document_type: meta.name, event: "New", channel: "System Notification", enabled: 1 })} />}
          {sec === "Email Templates" && <RecordList dt="Email Template" filter={(d) => !d["reference_doctype"] || d["reference_doctype"] === meta.name} title={(d) => String(d["subject"] ?? d.name)} empty="No Email Templates found" newLabel="+ New" create={() => ({ name: `${meta.name} Template ${adapter.list("Email Template").length + 1}`, subject: `${meta.name} {{ name }}`, reference_doctype: meta.name, response: "" })} />}
          {sec === "Global Search" && <GlobalSearchCfg meta={meta} />}
        </div>
      </div>
    </div>
  );
}

function General({ meta, fields }: { meta: DocTypeMeta; fields: SettingField[] }) {
  const { data: idx } = useQuery(indexQuery);
  const [ready, setReady] = useState(0);
  const groups = [...new Set(fields.map((f) => f.settings))];
  useEffect(() => { if (idx) Promise.all(groups.map((g) => loadMeta(idx, g).then((m) => m && adapter.ensureSeed(m)))).then(() => setReady((x) => x + 1)); }, [idx, groups.join()]); // eslint-disable-line
  if (!fields.length) return <p className="text-sm text-muted-foreground">No settings found for this DocType</p>;
  return (
    <div data-ready={ready}>
      <p className="mb-3 text-sm text-muted-foreground"><span>Settings from across the system that apply to this DocType</span>: <span>{meta.name}</span></p>
      {groups.map((g) => {
        const e = idx?.find((d) => d.name === g); const doc = adapter.get(g, g);
        return (
          <details key={g} open className="mb-3 rounded-lg border border-border" data-settings-group={g}>
            <summary className="cursor-pointer px-3 py-2 font-medium">{e ? <Link to="/app/$app/$doctype/$name" params={{ app: e.app, doctype: e.slug, name: g }} className="hover:underline">{g} ↗</Link> : g}</summary>
            <div className="space-y-3 border-t border-border p-3">
              {fields.filter((f) => f.settings === g).map((f) => {
                const v = doc?.[f.fieldname] ?? f.default ?? "";
                const set = (x: unknown) => { if (!adapter.get(g, g)) adapter.insertDoc(g, { name: g }); adapter.update(g, g, { [f.fieldname]: x }); toast("Saved"); };
                return (
                  <div key={f.fieldname} className="flex items-start gap-3" data-setting={f.fieldname}>
                    <div className="min-w-0 flex-1"><div className="text-sm">{f.label ?? f.fieldname}</div>{f.description && <div className="text-[11px] text-muted-foreground">{f.description}</div>}</div>
                    {f.fieldtype === "Check" ? <input type="checkbox" role="switch" aria-label={f.label} checked={!!Number(v)} onChange={(e) => set(e.target.checked ? 1 : 0)} />
                      : f.fieldtype === "Select" ? <select className="field-input w-48" aria-label={f.label} value={String(v)} onChange={(e) => set(e.target.value)}>{(f.options ?? "").split("\n").map((o) => <option key={o} value={o}>{o}</option>)}</select>
                      : <input className="field-input w-48" aria-label={f.label} type={/Int|Float|Currency|Percent/.test(f.fieldtype) ? "number" : "text"} defaultValue={String(v)} onBlur={(e) => e.target.value !== String(v) && set(/Int|Float|Currency|Percent/.test(f.fieldtype) ? Number(e.target.value) : e.target.value)} />}
                  </div>
                );
              })}
            </div>
          </details>
        );
      })}
    </div>
  );
}

export function seriesPreview(s: string) {
  const d = new Date(); const y = String(d.getFullYear());
  let out = s.replace(/\.YYYY\./g, y).replace(/\.YY\./g, y.slice(2)).replace(/\.MM\./g, String(d.getMonth() + 1).padStart(2, "0")).replace(/\.DD\./g, String(d.getDate()).padStart(2, "0"));
  out = /#+/.test(out) ? out.replace(/\.?(#+)/, (_, h: string) => "1".padStart(h.length, "0")) : out.replace(/\.$/, "") + "00001";
  return out.replace(/\.(?=\d)/g, "");
}

function Naming({ meta, series }: { meta: DocTypeMeta; series: string[] }) {
  const key = `digit-virtual-core:naming:${meta.name}`;
  const [st, setSt] = useState<{ extra: string[]; def: string }>(() => { try { return JSON.parse(localStorage.getItem(key) ?? "") as { extra: string[]; def: string }; } catch { return { extra: [], def: series[0] ?? "" }; } });
  const [add, setAdd] = useState(false); const [nv, setNv] = useState(""); const [roles, setRoles] = useState("System Manager");
  const save = (n: typeof st) => { setSt(n); localStorage.setItem(key, JSON.stringify(n)); };
  const all = [...series, ...st.extra];
  const rules = adapter.list("Document Naming Rule").filter((r) => r["document_type"] === meta.name).sort((a, b) => Number(b["priority"] ?? 0) - Number(a["priority"] ?? 0));
  return (
    <div>
      <div className="mb-2 flex items-center"><h3 className="font-semibold">Naming Series</h3><button type="button" className="btn-ghost ms-auto" onClick={() => setAdd(true)}>+ Add Series</button></div>
      <table className="w-full text-sm" data-naming-series><thead className="text-xs text-muted-foreground"><tr><th className="w-8" /><th className="text-start">Series</th><th className="text-start">Preview</th></tr></thead>
        <tbody>{all.map((s) => (
          <tr key={s} className="border-t border-border">
            <td><button type="button" aria-label="Set as default" title="Default" className={st.def === s ? "text-warning" : "text-muted-foreground"} onClick={() => { save({ ...st, def: s }); toast("Default updated"); }}>{st.def === s ? "★" : "☆"}</button></td>
            <td className="font-mono" data-no-i18n>{s}</td><td className="font-mono" data-no-i18n>{seriesPreview(s)}</td>
          </tr>))}
          {!all.length && <tr><td colSpan={3} className="py-3 text-center text-muted-foreground">{meta.autoname ? <><span>Naming:</span> <span data-no-i18n>{meta.autoname}</span></> : "No naming series"}</td></tr>}
        </tbody></table>
      {add && (
        <div className="mt-3 space-y-2 rounded-lg border border-border p-3" role="dialog" aria-label="Add Series">
          <label className="block text-sm">Series <span className="text-destructive">*</span><input className="field-input mt-1 font-mono" value={nv} onChange={(e) => setNv(e.target.value)} placeholder="ACC-SINV-.YYYY.-" /></label>
          <p className="text-[11px] text-muted-foreground"><span>Example:</span> <span data-no-i18n>ACC-SINV-.YYYY.- → {seriesPreview("ACC-SINV-.YYYY.-")}</span></p>
          <label className="block text-sm">Roles for configuring series<input className="field-input mt-1" value={roles} onChange={(e) => setRoles(e.target.value)} /></label>
          <div className="flex gap-2"><button type="button" className="btn-primary" disabled={!nv.trim()} onClick={() => { save({ ...st, extra: [...st.extra, nv.trim()] }); setNv(""); setAdd(false); toast("Saved"); }}>Save</button><button type="button" className="btn-ghost" onClick={() => setAdd(false)}>Cancel</button></div>
        </div>
      )}
      <div className="mb-2 mt-6 flex items-center"><h3 className="font-semibold">Naming Rules</h3><button type="button" className="btn-ghost ms-auto" onClick={() => adapter.insertDoc("Document Naming Rule", { document_type: meta.name, prefix: `${meta.name.split(" ").map((w) => w[0]).join("")}-`, prefix_digits: 5, priority: rules.length + 1, conditions: [] })}>New</button></div>
      {rules.map((r) => <div key={r.name} className="flex gap-3 border-t border-border py-1.5 text-sm"><span className="chip bg-muted" data-no-i18n>{String(r["priority"])}</span><span className="font-mono" data-no-i18n>{String(r["prefix"])}</span></div>)}
      {!rules.length && <p className="py-3 text-center text-sm text-muted-foreground">No rules found</p>}
    </div>
  );
}

function RecordList({ dt, filter, title, empty, newLabel, create, search, extra = [] }: { dt: string; filter: (d: Record<string, unknown>) => boolean; title: (d: Record<string, unknown> & { name: string }) => string; empty: string; newLabel: string; create: () => Record<string, unknown>; search?: boolean; extra?: { name: string; sub: string }[] }) {
  const [q, setQ] = useState("");
  const rows = adapter.list(dt).filter(filter).filter((d) => !q || title(d).toLowerCase().includes(q.toLowerCase()));
  return (
    <div data-record-list={dt}>
      <div className="mb-3 flex gap-2">{search && <input className="field-input w-64" placeholder="Search" aria-label="Search" value={q} onChange={(e) => setQ(e.target.value)} />}<button type="button" className="btn-primary ms-auto" onClick={() => { adapter.insertDoc(dt, create()); toast("Saved"); }}>{newLabel}</button></div>
      {extra.map((e) => <div key={e.name} className="border-t border-border py-2 text-sm"><div data-no-i18n>{e.name}</div><div className="font-mono text-[10px] text-muted-foreground" data-no-i18n>{e.sub}</div></div>)}
      {rows.map((d) => <div key={d.name} className="border-t border-border py-2 text-sm" data-no-i18n>{title(d)}</div>)}
      {!rows.length && !extra.length && <p className="py-8 text-center text-sm text-muted-foreground">{empty}</p>}
    </div>
  );
}

function PrintFormats({ meta, source }: { meta: DocTypeMeta; source: DtSettings["print_formats"] }) {
  const key = `digit-virtual-core:print-default:${meta.name}`;
  const [def, setDef] = useState(() => localStorage.getItem(key) ?? "Standard");
  const custom = adapter.list("Print Format").filter((p) => p["doc_type"] === meta.name);
  const cards = [{ name: "Standard", sub: "Standard" }, ...source.map((p) => ({ name: p.name, sub: p.type })), ...custom.map((p) => ({ name: p.name, sub: String(p["print_format_type"] ?? "Jinja") }))];
  return (
    <div>
      <div className="mb-3 flex"><button type="button" className="btn-primary ms-auto" onClick={() => adapter.insertDoc("Print Format", { name: `${meta.name} Format ${custom.length + 1}`, doc_type: meta.name, print_format_type: "Jinja", standard: "No" })}>+ New</button></div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4" data-print-formats>
        {cards.map((c) => (
          <button key={c.name} type="button" data-print-format={c.name} onClick={() => { setDef(c.name); localStorage.setItem(key, c.name); toast("Default updated"); }} className={`rounded-lg border p-2 text-start text-sm ${def === c.name ? "border-primary ring-1 ring-primary" : "border-border"}`}>
            <div className="mb-2 aspect-[3/4] rounded bg-muted p-2"><div className="h-2 w-1/2 rounded bg-foreground/20" /><div className="mt-2 space-y-1">{[1, 2, 3, 4, 5].map((i) => <div key={i} className="h-1 rounded bg-foreground/10" />)}</div></div>
            <div className="flex items-center gap-1"><span className="truncate" data-no-i18n>{c.name}</span>{def === c.name && <span className="chip ms-auto bg-primary/15 text-primary">Default</span>}</div>
            <div className="text-[10px] text-muted-foreground">{c.sub}</div>
          </button>
        ))}
      </div>
    </div>
  );
}

const PERMS = ["read", "write", "create", "delete", "submit", "cancel", "amend"] as const;
function Roles({ meta }: { meta: DocTypeMeta }) {
  const key = `digit-virtual-core:perms:${meta.name}`;
  type P = Record<string, unknown> & { role: string; permlevel?: number };
  const [rows, setRows] = useState<P[]>(() => { try { return JSON.parse(localStorage.getItem(key) ?? "") as P[]; } catch { return (meta.permissions as P[]).map((p) => ({ ...p })); } });
  const [adding, setAdding] = useState(false);
  const save = (n: P[]) => { setRows(n); localStorage.setItem(key, JSON.stringify(n)); };
  const roles = adapter.list("Role").map((r) => r.name);
  return (
    <div>
      <div className="mb-3 flex items-center gap-3"><Link to="/app/$app/$doctype" params={{ app: "frappe", doctype: "custom_docperm" }} className="text-sm text-primary hover:underline"><span>Open Role Permissions Manager</span> ↗</Link><button type="button" className="btn-primary ms-auto" onClick={() => setAdding(true)}>+ Add role</button></div>
      {adding && <div className="mb-3 flex gap-2"><input list="dts-roles" className="field-input w-64" aria-label="Role" id="dts-role" placeholder="Role" /><datalist id="dts-roles">{roles.map((r) => <option key={r} value={r} />)}</datalist><button type="button" className="btn-ghost" onClick={() => { const v = (document.getElementById("dts-role") as HTMLInputElement).value.trim(); if (v) save([...rows, { role: v, permlevel: 0, read: 1 }]); setAdding(false); }}>Add</button></div>}
      <table className="w-full text-sm" data-roles-matrix>
        <thead className="text-xs text-muted-foreground"><tr><th className="text-start">Role</th><th>Level</th>{PERMS.map((p) => <th key={p} className="capitalize">{p[0]!.toUpperCase() + p.slice(1)}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => (
          <tr key={i} className="border-t border-border">
            <td className="py-1.5">{r.role}</td><td className="text-center" data-no-i18n>{r.permlevel ?? 0}</td>
            {PERMS.map((p) => <td key={p} className="text-center"><button type="button" aria-label={`${r.role} ${p}`} data-perm={`${i}:${p}`} data-on={r[p] ? 1 : 0} onClick={() => save(rows.map((x, j) => (j === i ? { ...x, [p]: x[p] ? 0 : 1 } : x)))} className={r[p] ? "text-success" : "text-muted-foreground/40"}>{r[p] ? "✓" : "·"}</button></td>)}
          </tr>))}</tbody>
      </table>
    </div>
  );
}

function GlobalSearchCfg({ meta }: { meta: DocTypeMeta }) {
  const all = gsAll();
  const fields = meta.fields.filter((f) => f.fieldname && !LAYOUT_TYPES.has(f.fieldtype) && !TABLE_TYPES.has(f.fieldtype));
  const [inc, setInc] = useState(all.doctypes[meta.name]?.include ?? true);
  const [sel, setSel] = useState<string[]>(all.doctypes[meta.name]?.fields ?? fields.filter((f) => f["in_global_search"]).map((f) => f.fieldname!));
  const [q, setQ] = useState("");
  const [prio, setPrio] = useState(false);
  const [order, setOrder] = useState<string[]>(all.priority.length ? all.priority : [meta.name]);
  return (
    <div data-global-search-cfg>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" role="switch" checked={inc} onChange={(e) => setInc(e.target.checked)} aria-label="Include in global search" /><span>Include in global search</span>: <span>{meta.name}</span></label>
      <div className="mb-2 mt-4 flex items-center gap-2"><h3 className="font-semibold">Configure fields</h3><input className="field-input ms-auto w-56" placeholder="Search fields" aria-label="Search fields" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      <div className="grid grid-cols-3 gap-1 text-sm">
        {fields.filter((f) => !q || (f.label ?? f.fieldname!).toLowerCase().includes(q.toLowerCase())).map((f) => <label key={f.fieldname} className="flex items-center gap-1.5"><input type="checkbox" checked={sel.includes(f.fieldname!)} onChange={(e) => setSel(e.target.checked ? [...sel, f.fieldname!] : sel.filter((x) => x !== f.fieldname))} />{f.label ?? f.fieldname}</label>)}
      </div>
      <div className="mt-4 flex gap-2">
        <button type="button" className="btn-ghost" onClick={() => setPrio(!prio)}>Manage priority</button>
        <button type="button" className="btn-primary ms-auto" onClick={() => { const a = gsAll(); a.doctypes[meta.name] = { include: inc, fields: sel }; a.priority = order; gsSave(a); toast("Global search updated"); }}>Save</button>
      </div>
      {prio && <ol className="mt-3 space-y-1 text-sm">{(order.includes(meta.name) ? order : [...order, meta.name]).map((d, i, arr) => <li key={d} className="flex items-center gap-2"><span data-no-i18n>{i + 1}.</span><span>{d}</span>{i > 0 && <button type="button" className="btn-ghost px-1 py-0" aria-label="Move up" onClick={() => { const n = [...arr]; [n[i - 1], n[i]] = [n[i]!, n[i - 1]!]; setOrder(n); }}>↑</button>}</li>)}</ol>}
    </div>
  );
}
