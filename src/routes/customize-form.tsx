import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Shell, Loading } from "@/components/Shell";
import { ContextStrip } from "@/components/enterprise/kit/templates";
import { indexQuery, loadMeta, LAYOUT_TYPES, type DocField, type DocTypeMeta } from "@/lib/catalog";
import { adapter, useStoreVersion } from "@/lib/adapter";

export const Route = createFileRoute("/customize-form")({
  validateSearch: (raw: Record<string, unknown>): { doctype?: string } => (typeof raw["doctype"] === "string" ? { doctype: raw["doctype"] } : {}),
  head: () => ({ meta: [
    { title: "Customize Form — Digit Virtual Core" },
    { name: "description", content: "Change labels, visibility, mandatory, order and add fields; saved as Property Setters and Custom Fields." },
    { property: "og:title", content: "Customize Form — Digit Virtual Core" },
    { property: "og:description", content: "Customize any form live; changes export as a DIGIT app." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  component: CustomizeForm,
});

/** Properties Customize Form edits (frappe/custom/doctype/customize_form docfield_properties subset). */
const PROPS: { key: string; type: "Check" | "Data" | "Text" }[] = [
  { key: "label", type: "Data" }, { key: "hidden", type: "Check" }, { key: "reqd", type: "Check" }, { key: "read_only", type: "Check" },
  { key: "in_list_view", type: "Check" }, { key: "depends_on", type: "Data" }, { key: "options", type: "Text" }, { key: "default", type: "Text" },
];
type Row = { fieldname: string; label: string; fieldtype: string; custom: boolean; isNew?: boolean } & Record<string, unknown>;
const norm = (t: string, v: unknown) => (t === "Check" ? (Number(v ?? 0) ? "1" : "0") : String(v ?? ""));

/** Port of customize_form.py save_customization: diffs edits against the source DocType into Property Setters / Custom Fields. */
export function saveCustomization(dt: string, base: DocField[], rows: Row[]): { setters: number; fields: number } {
  let setters = 0, fields = 0;
  const psName = (f: string, p: string) => `${dt}-${f}-${p}`;
  rows.forEach((r, i) => {
    if (r.custom) {
      const name = `${dt}-${r.fieldname}`;
      const data = { dt, fieldname: r.fieldname, label: r.label, fieldtype: r.fieldtype, insert_after: i ? rows[i - 1]!.fieldname : "", ...Object.fromEntries(PROPS.filter((p) => p.key !== "label").map((p) => [p.key, p.type === "Check" ? Number(r[p.key] ?? 0) : r[p.key] ?? ""])) };
      if (adapter.get("Custom Field", name)) adapter.update("Custom Field", name, data); else adapter.insertDoc("Custom Field", { name, ...data });
      fields++; return;
    }
    const b = base.find((x) => x.fieldname === r.fieldname); if (!b) return;
    for (const p of PROPS) {
      const want = norm(p.type, r[p.key]), was = norm(p.type, b[p.key]); const n = psName(r.fieldname, p.key);
      if (want !== was) { const d = { doc_type: dt, doctype_or_field: "DocField", field_name: r.fieldname, property: p.key, property_type: p.type, value: want }; if (adapter.get("Property Setter", n)) adapter.update("Property Setter", n, d); else adapter.insertDoc("Property Setter", { name: n, ...d }); setters++; }
      else if (adapter.get("Property Setter", n)) adapter.remove("Property Setter", n);
    }
  });
  const order = rows.map((r) => r.fieldname); const baseOrder = base.map((f) => f.fieldname ?? "").filter(Boolean);
  const changed = order.filter((n) => baseOrder.includes(n)).join() !== baseOrder.filter((n) => order.includes(n)).join();
  const on = `${dt}-main-field_order`;
  if (changed) { const d = { doc_type: dt, doctype_or_field: "DocType", property: "field_order", property_type: "Data", value: JSON.stringify(order) }; if (adapter.get("Property Setter", on)) adapter.update("Property Setter", on, d); else adapter.insertDoc("Property Setter", { name: on, ...d }); setters++; }
  else if (adapter.get("Property Setter", on)) adapter.remove("Property Setter", on);
  return { setters, fields };
}

function CustomizeForm() {
  const { doctype } = Route.useSearch();
  const nav = useNavigate();
  const idx = useQuery(indexQuery);
  useStoreVersion();
  const [base, setBase] = useState<DocTypeMeta | null>(null);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [nf, setNf] = useState({ label: "", fieldtype: "Data" });
  const entry = idx.data?.find((e) => e.name === doctype);
  useEffect(() => {
    if (!entry || !idx.data || !doctype) return;
    void Promise.all([fetch(`/catalog/${entry.app}/${entry.slug}.json`).then((r) => r.json() as Promise<DocTypeMeta>), loadMeta(idx.data, doctype)]).then(([b, cur]) => {
      setBase(b);
      setRows((cur ?? b).fields.filter((f) => f.fieldname).map((f) => ({ ...f, fieldname: f.fieldname!, label: String(f.label ?? ""), fieldtype: f.fieldtype, custom: !!f["is_custom_field"] || !b.fields.some((x) => x.fieldname === f.fieldname) })));
    });
  }, [entry?.slug, doctype, !!idx.data]);
  if (!idx.data) return <Shell><Loading /></Shell>;
  const set = (i: number, k: string, v: unknown) => setRows(rows!.map((r, j) => (j === i ? { ...r, [k]: v } : r)));
  const move = (i: number, d: number) => { const r = [...rows!]; const j = i + d; if (j < 0 || j >= r.length) return; [r[i], r[j]] = [r[j]!, r[i]!]; setRows(r); };
  const choices = idx.data.filter((e) => !e.istable && !e.source.startsWith("plugin:")).map((e) => e.name).sort();
  return (
    <Shell crumbs={[{ label: "Customize Form" }]}>
      <ContextStrip icon={<img src="/icons/digit/ui/digit-ui-dashboard-dark.svg" alt="" />} eyebrow="DIGIT" title="Customize Form" sub="Change labels, order and visibility of a form's fields without touching the original."
        actions={<button type="button" className="btn-primary" data-band-primary data-cf-save disabled={!rows || !base} onClick={() => { if (!rows || !base) return; const r = saveCustomization(doctype!, base.fields, rows); toast.success("Customizations saved", { description: `${r.setters} · ${r.fields}` }); }}>Update</button>} />
      <div className="ek-card ek-filterbar mt-3 flex flex-wrap items-end gap-3" data-customize-form data-list-filterbar>
        <label className="text-xs"><span className="block text-muted-foreground">Enter Form Type</span>
          <input list="cf-dts" className="field-input w-64" data-cf-doctype defaultValue={doctype ?? ""} data-no-i18n onChange={(e) => { if (choices.includes(e.target.value)) { setRows(null); nav({ to: "/customize-form", search: { doctype: e.target.value } }); } }} />
          <datalist id="cf-dts">{choices.map((c) => <option key={c} value={c} />)}</datalist>
        </label>
        {rows && base && <div className="ms-auto flex gap-2">
          <button type="button" className="btn-ghost" data-cf-reset onClick={() => { for (const p of adapter.list("Property Setter").filter((x) => x["doc_type"] === doctype)) adapter.remove("Property Setter", p.name); setRows(null); setBase(null); toast.success("Reset to defaults"); nav({ to: "/customize-form", search: { doctype: doctype! } }); location.reload(); }}>Reset to defaults</button>
          <Link to="/plugins" className="btn-ghost">Export Customizations</Link>
          
        </div>}
      </div>
      {!doctype && <p className="mt-4 text-sm text-muted-foreground">Select a DocType to customize.</p>}
      {doctype && !rows && <Loading />}
      {rows && <>
        <div className="mt-4 overflow-x-auto rounded-md border border-border">
          <table className="w-full text-xs" data-cf-table>
            <thead className="bg-muted text-start text-muted-foreground"><tr><th className="p-1.5">#</th><th className="p-1.5 text-start">Label</th><th className="p-1.5 text-start">Type</th><th className="p-1.5 text-start">Name</th><th>Hidden</th><th>Mandatory</th><th>Read Only</th><th>In List View</th><th className="text-start">Depends On</th><th className="text-start">Options</th><th className="text-start">Default</th><th /></tr></thead>
            <tbody>{rows.map((r, i) => {
              const layout = LAYOUT_TYPES.has(r.fieldtype);
              return (
                <tr key={r.fieldname} className={`border-t border-border ${layout ? "bg-muted/40" : ""}`} data-cf-row={r.fieldname}>
                  <td className="p-1 text-muted-foreground" data-no-i18n>{i + 1}</td>
                  <td className="p-1"><input className="field-input h-7" aria-label="Label" data-cf-prop="label" value={r.label} onChange={(e) => set(i, "label", e.target.value)} /></td>
                  <td className="p-1" data-no-i18n>{r.fieldtype}{r.custom && <span className="ms-1 chip bg-accent">custom</span>}</td>
                  <td className="p-1 font-mono text-[10px]" data-no-i18n>{r.fieldname}</td>
                  {["hidden", "reqd", "read_only", "in_list_view"].map((k) => <td key={k} className="p-1 text-center"><input type="checkbox" aria-label={k} data-cf-prop={k} checked={!!Number(r[k] ?? 0)} disabled={layout && k !== "hidden"} onChange={(e) => set(i, k, e.target.checked ? 1 : 0)} /></td>)}
                  {["depends_on", "options", "default"].map((k) => <td key={k} className="p-1"><input className="field-input h-7 w-28" aria-label={k} data-cf-prop={k} data-no-i18n value={String(r[k] ?? "")} onChange={(e) => set(i, k, e.target.value)} /></td>)}
                  <td className="whitespace-nowrap p-1"><button type="button" className="btn-ghost px-1" aria-label="Move up" data-cf-up onClick={() => move(i, -1)}>↑</button><button type="button" className="btn-ghost px-1" aria-label="Move down" data-cf-down onClick={() => move(i, 1)}>↓</button></td>
                </tr>
              );
            })}</tbody>
          </table>
        </div>
        <div className="mt-3 flex flex-wrap items-end gap-2" data-cf-add>
          <label className="text-xs"><span className="block text-muted-foreground">Label</span><input className="field-input w-48" data-cf-new-label value={nf.label} onChange={(e) => setNf({ ...nf, label: e.target.value })} /></label>
          <label className="text-xs"><span className="block text-muted-foreground">Type</span><select className="field-input" data-cf-new-type value={nf.fieldtype} onChange={(e) => setNf({ ...nf, fieldtype: e.target.value })}>{["Data", "Int", "Float", "Currency", "Check", "Date", "Select", "Link", "Small Text", "Text"].map((t) => <option key={t} value={t}>{t}</option>)}</select></label>
          <button type="button" className="btn-ghost" disabled={!nf.label} data-cf-new-add onClick={() => { const fn = "custom_" + nf.label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, ""); if (rows.some((r) => r.fieldname === fn)) return; setRows([...rows, { fieldname: fn, label: nf.label, fieldtype: nf.fieldtype, custom: true, isNew: true }]); setNf({ label: "", fieldtype: "Data" }); }}>Add Field</button>
        </div>
      </>}
    </Shell>
  );
}
