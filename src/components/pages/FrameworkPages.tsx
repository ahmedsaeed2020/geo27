import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { adapter, useStoreVersion, type Doc } from "@/lib/adapter";
import { dashboardsQuery, LAYOUT_TYPES, TABLE_TYPES, workspacesQuery } from "@/lib/catalog";
import { DoctypeSelect, DocLink, PageField, Tag, Toolbar, btnCls, inputCls, primaryCls, useMeta } from "./kit";
import { DateInput } from "@/components/form/DateInput";
import { DevOnly } from "@/components/DevOnly";
import { useLang } from "@/i18n";

const PERMS = ["read", "write", "create", "delete", "submit", "cancel", "amend", "report", "export", "import", "share", "print", "email"] as const;

/** frappe/core/page/permission_manager — Document Type / Role filters, permission rule table, Add a New Rule, Restore. */
export function PermissionManager() {
  useStoreVersion();
  const [dt, setDt] = useState("Sales Order");
  const [role, setRole] = useState("");
  const meta = useMeta(dt);
  const custom = adapter.list("Custom DocPerm").filter((p) => p["parent"] === dt);
  const base = custom.length ? custom : (meta?.permissions ?? []).map((p, i) => ({ ...p, name: `std-${i}` }) as Doc);
  const rows = base.filter((p) => !role || p["role"] === role);
  const materialize = () => {
    if (custom.length || !meta) return;
    meta.permissions.forEach((p) => adapter.insertDoc("Custom DocPerm", { ...p, parent: dt, permlevel: p["permlevel"] ?? 0 }));
  };
  const toggle = (r: Doc, k: string) => {
    if (!custom.length) { materialize(); return; }
    adapter.update("Custom DocPerm", r.name, { [k]: r[k] ? 0 : 1 });
  };
  const roles = [...new Set((meta?.permissions ?? []).map((p) => String(p["role"])))];
  const ar = useLang() === "ar";
  return (
    <div>
      <Toolbar>
        <PageField label="Document Type"><DoctypeSelect value={dt} onChange={setDt} /></PageField>
        <PageField label="Role"><select className={inputCls} value={role} onChange={(e) => setRole(e.target.value)}><option value="">{ar ? "كل الأدوار" : "All roles"}</option>{roles.map((r) => <option key={r} value={r}>{r}</option>)}</select></PageField>
        <button className={btnCls} disabled={!meta} onClick={() => { const r = window.prompt(ar ? "الدور للقاعدة الجديدة" : "Role for new rule"); if (r) { materialize(); adapter.insertDoc("Custom DocPerm", { parent: dt, role: r, permlevel: 0, read: 1 }); } }}>Add A New Rule</button>
        <button className={btnCls} disabled={!custom.length} onClick={() => custom.forEach((c) => adapter.remove("Custom DocPerm", c.name))}>Restore Original Permissions</button>
        <Tag kind="simulated">edits stored as Custom DocPerm in this browser</Tag>
      </Toolbar>
      {!meta ? <p className="text-sm text-muted-foreground">{ar ? "اختر نوع المستند." : "Select a Document Type."}</p> : (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-muted text-left text-xs text-muted-foreground"><tr><th className="p-2">Role</th><th className="p-2">Level</th>{PERMS.map((p) => <th key={p} className="p-2 capitalize">{p}</th>)}</tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.name} className="border-t">
                  <td className="p-2 font-medium">{String(r["role"])}</td><td className="p-2">{String(r["permlevel"] ?? 0)}</td>
                  {PERMS.map((p) => <td key={p} className="p-2"><input type="checkbox" aria-label={`${r["role"]} ${p}`} checked={!!r[p]} onChange={() => toggle(r, p)} disabled={p === "submit" && !meta.is_submittable} /></td>)}
                </tr>
              ))}
              {!rows.length && <tr><td className="p-3 text-muted-foreground" colSpan={PERMS.length + 2}>No permission rules defined in source for this DocType.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
      <DevOnly><p className="mt-3 text-xs text-muted-foreground">Source rules come from the DocType JSON <code>permissions</code>. The first edit copies them into Custom DocPerm (as DIGIT does). Rules are enforced in list, form, link search and reports through src/lib/session.ts (use Switch User in the avatar menu).</p></DevOnly>
    </div>
  );
}

/** frappe/desk/page/backups — list of backup files with download links + "Download Files Backup" / "Set Number of Backups". */
export function Backups() {
  return (
    <div className="space-y-4">
      <Toolbar>
        <button className={btnCls} disabled title="Server-dependent">Download Files Backup</button>
        <button className={btnCls} disabled title="Server-dependent">Get Backup Encryption Key</button>
        <Link to="/settings" search={{} as never} className={btnCls}>Set Number of Backups (System Settings)</Link>
        <Tag kind="server">backups are files on the site server</Tag>
      </Toolbar>
      <div className="rounded-md border">
        <table className="w-full text-sm"><thead className="bg-muted text-left text-xs text-muted-foreground"><tr><th className="p-2">Date</th><th className="p-2">File</th><th className="p-2">Size</th></tr></thead>
          <tbody><tr><td colSpan={3} className="p-4 text-muted-foreground">No backup files — this synthetic preview has no site directory (<code>get_context</code> lists files from <code>private/backups</code>).</td></tr></tbody></table>
      </div>
    </div>
  );
}

const CONTROLS = ["Data", "Int", "Float", "Currency", "Percent", "Check", "Select", "Date", "Datetime", "Time", "Link", "Small Text", "Text Editor", "Code", "Color", "Rating", "Password", "Attach", "Signature", "Barcode", "Geolocation", "Duration", "Autocomplete", "Phone", "JSON", "HTML Editor", "Markdown Editor", "Table MultiSelect", "Icon", "Button"];
/** frappe/core/page/component_explorer — gallery of form controls. */
export function ComponentExplorer() {
  const [vals, setVals] = useState<Record<string, string>>({});
  const native: Record<string, string> = { Int: "number", Float: "number", Currency: "number", Percent: "number", Date: "date", Datetime: "datetime-local", Time: "time", Color: "color", Password: "password", Phone: "tel" };
  return (
    <div className="grid gap-3 md:grid-cols-3">
      {CONTROLS.map((c) => (
        <div key={c} className="panel p-3">
          <div className="mb-1 text-xs font-medium">{c}</div>
          {c === "Check" ? <input type="checkbox" aria-label={c} />
            : c === "Select" ? <select className={inputCls}><option value="Option 1">Option 1</option><option value="Option 2">Option 2</option></select>
            : c === "Button" ? <button className={btnCls}>Button</button>
            : c === "Rating" ? <div className="text-lg">{[1, 2, 3, 4, 5].map((i) => <button key={i} onClick={() => setVals({ ...vals, [c]: String(i) })} className={Number(vals[c] ?? 0) >= i ? "text-primary" : "text-muted-foreground"}>★</button>)}</div>
            : ["Small Text", "Text Editor", "Code", "JSON", "HTML Editor", "Markdown Editor"].includes(c) ? <textarea className={`${inputCls} w-full ${c === "Code" || c === "JSON" ? "font-mono" : ""}`} rows={2} />
            : ["Attach", "Signature", "Geolocation", "Barcode"].includes(c) ? <div className="rounded border border-dashed p-2 text-xs text-muted-foreground">{c} control — upload/device capture is server- or device-dependent</div>
            : <input type={native[c] ?? "text"} className={`${inputCls} w-full`} value={vals[c] ?? ""} onChange={(e) => setVals({ ...vals, [c]: e.target.value })} />}
        </div>
      ))}
    </div>
  );
}

/** frappe/desk/page/dashboard_view — Dashboard selector with charts and number cards. */
export function DashboardView() {
  const d = useQuery(dashboardsQuery);
  const names = Object.keys(d.data ?? {}).sort();
  const [sel, setSel] = useState("");
  const cur = d.data?.[sel || names[0] || ""];
  const def = cur as unknown as { charts?: { chart: string; width?: string }[]; cards?: { card: string }[] } | undefined;
  return (
    <div>
      <Toolbar>
        <PageField label="Dashboard"><select className={inputCls} value={sel || names[0] || ""} onChange={(e) => setSel(e.target.value)}>{names.map((n) => <option key={n} value={n}>{n}</option>)}</select></PageField>
        <Link to="/desk/$sidebar" params={{ sidebar: "Selling" }} className={btnCls}>Open computed workspace charts</Link>
        <Tag kind="server">chart data from Dashboard Chart sources needs server queries</Tag>
      </Toolbar>
      {!cur ? <p className="text-sm text-muted-foreground">No dashboards in catalog.</p> : (
        <>
          <h3 className="mb-2 text-sm font-semibold">Number Cards</h3>
          <div className="mb-4 grid gap-3 md:grid-cols-4">{(def?.cards ?? []).map((c) => <div key={c.card} className="panel p-3"><div className="text-xs text-muted-foreground">{c.card}</div><div className="text-xl font-semibold">—</div></div>)}{!def?.cards?.length && <p className="text-xs text-muted-foreground">No cards.</p>}</div>
          <h3 className="mb-2 text-sm font-semibold">Charts</h3>
          <div className="grid gap-3 md:grid-cols-2">{(def?.charts ?? []).map((c) => <div key={c.chart} className={`panel h-40 p-3 ${c.width === "Full" ? "md:col-span-2" : ""}`}><div className="text-sm font-medium">{c.chart}</div><div className="mt-6 text-xs text-muted-foreground">Chart frame reconstructed; series computed on workspace pages where locally computable.</div></div>)}</div>
        </>
      )}
    </div>
  );
}

/** frappe/desk/page/desktop — the Desk home grid; the launcher route is its reconstruction. */
export function DesktopPage() {
  return <p className="text-sm">The Desktop page is reconstructed as the launcher. <Link to="/" className="text-primary hover:underline">Open Desktop →</Link></p>;
}

/** frappe/desk/page/workspace_restore — list workspaces with local edits and restore them. */
export function WorkspaceRestore() {
  useStoreVersion();
  const ws = useQuery(workspacesQuery);
  const edited = adapter.list("Workspace");
  return (
    <div>
      <p className="mb-3 text-sm text-muted-foreground">Workspaces edited by users can be restored to their standard (source JSON) version.</p>
      <div className="rounded-md border"><table className="w-full text-sm"><thead className="bg-muted text-left text-xs text-muted-foreground"><tr><th className="p-2">Workspace</th><th className="p-2">Module</th><th className="p-2">State</th><th className="p-2"></th></tr></thead>
        <tbody>{(ws.data ?? []).slice(0, 60).map((w) => { const e = edited.find((x) => x.name === w.name); return (
          <tr key={w.name} className="border-t"><td className="p-2">{w.name}</td><td className="p-2 text-muted-foreground">{w.module}</td><td className="p-2">{e ? "Edited locally" : "Standard"}</td>
            <td className="p-2"><button className={btnCls} disabled={!e} onClick={() => e && adapter.remove("Workspace", e.name)}>Restore</button></td></tr>); })}</tbody></table></div>
      <p className="mt-2 text-xs"><Tag kind="simulated">restoring removes the local Workspace record</Tag></p>
    </div>
  );
}

/** frappe/printing/page/print — print preview of a document with the Standard format. */
export function PrintPage() {
  useStoreVersion();
  const [dt, setDt] = useState("Sales Order");
  const meta = useMeta(dt);
  const docs = adapter.list(dt);
  const [name, setName] = useState("");
  const doc = docs.find((d) => d.name === name) ?? docs[0];
  return (
    <div>
      <Toolbar>
        <PageField label="Document Type"><DoctypeSelect value={dt} onChange={(v) => { setDt(v); setName(""); }} /></PageField>
        <PageField label="Document"><select className={inputCls} value={doc?.name ?? ""} onChange={(e) => setName(e.target.value)}>{docs.map((d) => <option data-no-i18n key={d.name} value={d.name}>{d.name}</option>)}</select></PageField>
        <PageField label="Print Format"><select className={inputCls}><option value="Standard">Standard</option>{adapter.list("Print Format").filter((p) => p["doc_type"] === dt).map((p) => <option data-no-i18n key={p.name} value={p.name}>{p.name}</option>)}</select></PageField>
        <button className={btnCls} onClick={() => window.print()}>Print</button>
        <button className={btnCls} disabled title="PDF generation runs wkhtmltopdf/Chrome on server">PDF</button>
        <Tag kind="server">PDF</Tag>
      </Toolbar>
      {!meta || !doc ? <p className="text-sm text-muted-foreground">No document of this type in the shared store.</p> : <PrintSheet meta={meta} doc={doc} />}
    </div>
  );
}

export function PrintSheet({ meta, doc, fields }: { meta: NonNullable<ReturnType<typeof useMeta>>; doc: Doc; fields?: string[] }) {
  const list = (fields ? fields.map((f) => meta.fields.find((x) => x.fieldname === f)).filter(Boolean) : meta.fields.filter((f) => !f.hidden && !f['print_hide'] && !LAYOUT_TYPES.has(f.fieldtype) && doc[f.fieldname ?? ""] !== undefined && doc[f.fieldname ?? ""] !== "")) as typeof meta.fields;
  return (
    <div className="mx-auto max-w-3xl rounded-md border bg-card p-8 shadow-sm">
      <div className="mb-6 flex items-baseline justify-between border-b pb-3"><h2 className="text-xl font-semibold">{meta.name}</h2><span className="font-mono text-sm">{doc.name}</span></div>
      <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
        {list.filter((f) => !TABLE_TYPES.has(f.fieldtype)).map((f) => <div key={f.fieldname}><div className="text-xs text-muted-foreground">{f.label}</div><div>{String(doc[f.fieldname!] ?? "")}</div></div>)}
      </div>
      {list.filter((f) => TABLE_TYPES.has(f.fieldtype)).map((f) => { const rows = (doc[f.fieldname!] as Record<string, unknown>[]) ?? []; const cols = Object.keys(rows[0] ?? {}).filter((k) => !["idx", "name", "doctype"].includes(k)).slice(0, 6); return (
        <div key={f.fieldname} className="mt-5"><div className="mb-1 text-xs font-semibold">{f.label}</div>
          <table className="w-full border text-xs"><thead className="bg-muted"><tr><th className="p-1">#</th>{cols.map((c) => <th key={c} className="p-1 text-left">{c}</th>)}</tr></thead>
            <tbody>{rows.map((r, i) => <tr key={i} className="border-t"><td className="p-1">{i + 1}</td>{cols.map((c) => <td key={c} className="p-1">{String(r[c] ?? "")}</td>)}</tr>)}</tbody></table></div>); })}
    </div>
  );
}

/** frappe/printing/page/print_format_builder — pick DocType, arrange fields, save Print Format. */
export function PrintFormatBuilder() {
  useStoreVersion();
  const [dt, setDt] = useState("Sales Order");
  const meta = useMeta(dt);
  const [picked, setPicked] = useState<string[]>([]);
  const fields = (meta?.fields ?? []).filter((f) => f.fieldname && !LAYOUT_TYPES.has(f.fieldtype));
  const sample = adapter.list(dt)[0];
  const move = (i: number, d: number) => { const a = [...picked]; const [x] = a.splice(i, 1); a.splice(i + d, 0, x!); setPicked(a); };
  const save = () => { const n = window.prompt("Print Format name", `${dt} Custom`); if (n) adapter.insertDoc("Print Format", { name: n, doc_type: dt, standard: "No", print_format_builder: 1, format_data: JSON.stringify(picked.map((fieldname) => ({ fieldname }))) }); };
  return (
    <div>
      <Toolbar>
        <PageField label="DocType"><DoctypeSelect value={dt} onChange={(v) => { setDt(v); setPicked([]); }} /></PageField>
        <button className={primaryCls} disabled={!picked.length} onClick={save}>Save</button>
        <span className="text-xs text-muted-foreground">Saved formats: {adapter.list("Print Format").filter((p) => p["doc_type"] === dt).length}</span>
        <Tag kind="simulated">saved as Print Format in this browser</Tag>
      </Toolbar>
      <div className="grid gap-4 md:grid-cols-[260px_1fr]">
        <div className="panel max-h-[600px] overflow-auto p-2">
          <div className="mb-1 text-xs font-semibold">Fields</div>
          {fields.map((f) => <label key={f.fieldname} className="flex items-center gap-2 py-0.5 text-sm"><input type="checkbox" checked={picked.includes(f.fieldname!)} onChange={(e) => setPicked(e.target.checked ? [...picked, f.fieldname!] : picked.filter((x) => x !== f.fieldname))} />{f.label || f.fieldname}</label>)}
        </div>
        <div>
          <div className="mb-2 flex flex-wrap gap-1">{picked.map((p, i) => <span key={p} className="flex items-center gap-1 rounded bg-muted px-2 py-0.5 text-xs">{p}<button disabled={!i} onClick={() => move(i, -1)}>←</button><button disabled={i === picked.length - 1} onClick={() => move(i, 1)}>→</button></span>)}</div>
          {meta && sample ? <PrintSheet meta={meta} doc={sample} fields={picked} /> : <p className="text-sm text-muted-foreground">No sample record to preview.</p>}
        </div>
      </div>
    </div>
  );
}

/** frappe/desk/page/setup_wizard — slides: Language → Region → User → Organization; completion is server-side. */
export function SetupWizard() {
  const slides = [
    { title: "Welcome", fields: [["language", "Your Language"]] },
    { title: "Region", fields: [["country", "Your Country"], ["timezone", "Time Zone"], ["currency", "Currency"]] },
    { title: "Let's set up your account", fields: [["full_name", "Full Name"], ["email", "Email Address"]] },
    { title: "Setup your organization", fields: [["company_name", "Company Name"], ["company_abbr", "Company Abbreviation"], ["fy_start_date", "Financial Year Begins On"]] },
  ];
  const [i, setI] = useState(0);
  const [v, setV] = useState<Record<string, string>>({ language: "English", country: "Saudi Arabia", timezone: "Asia/Riyadh", currency: "SAR" });
  const [done, setDone] = useState(false);
  const s = slides[i]!;
  return (
    <div className="mx-auto max-w-md panel p-6">
      <div className="mb-4 flex gap-1">{slides.map((_, k) => <div key={k} className={`h-1 flex-1 rounded ${k <= i ? "bg-primary" : "bg-muted"}`} />)}</div>
      {done ? <div className="space-y-2 text-sm"><p className="font-semibold">Setup data captured.</p><p className="text-muted-foreground">Running <code>setup_complete</code> (creating company, fiscal year, defaults) happens on the server.</p><Tag kind="server">setup_complete</Tag></div> : (
        <>
          <h3 className="mb-3 text-lg font-semibold">{s.title}</h3>
          <div className="space-y-3">{s.fields.map(([k, l]) => <PageField key={k} label={l!}>{k === "fy_start_date" ? <DateInput className={inputCls} value={v[k!] ?? ""} onChange={(e) => setV({ ...v, [k!]: e.target.value })} /> : <input className={inputCls} type="text" value={v[k!] ?? ""} onChange={(e) => setV({ ...v, [k!]: e.target.value })} />}</PageField>)}</div>
          <div className="mt-5 flex justify-between"><button className={btnCls} disabled={!i} onClick={() => setI(i - 1)}>Previous</button>
            {i < slides.length - 1 ? <button className={primaryCls} onClick={() => setI(i + 1)}>Next</button> : <button className={primaryCls} onClick={() => setDone(true)}>Complete Setup</button>}</div>
        </>
      )}
    </div>
  );
}

/** frappe/workflow/page/workflow_builder — states and transitions for a DocType; saves a Workflow record. */
export function WorkflowBuilder() {
  useStoreVersion();
  const [dt, setDt] = useState("Leave Application");
  const existing = adapter.list("Workflow").find((w) => w["document_type"] === dt);
  const [states, setStates] = useState<{ state: string; doc_status: string; allow_edit: string }[]>([{ state: "Draft", doc_status: "0", allow_edit: "All" }, { state: "Approved", doc_status: "1", allow_edit: "System Manager" }]);
  const [trans, setTrans] = useState<{ state: string; action: string; next_state: string; allowed: string }[]>([{ state: "Draft", action: "Approve", next_state: "Approved", allowed: "System Manager" }]);
  const names = states.map((s) => s.state);
  const save = () => { const data = { name: `${dt} Workflow`, workflow_name: `${dt} Workflow`, document_type: dt, is_active: 1, states, transitions: trans }; if (existing) adapter.update("Workflow", existing.name, data); else adapter.insertDoc("Workflow", data); };
  return (
    <div>
      <Toolbar>
        <PageField label="Document Type"><DoctypeSelect value={dt} onChange={setDt} /></PageField>
        <button className={primaryCls} onClick={save}>{existing ? "Update" : "Save"} Workflow</button>
        {existing && <DocLink doctype="Workflow" name={existing.name}>Open {existing.name}</DocLink>}
        <Tag kind="simulated">no Workflow JSON in sources; transitions are not enforced</Tag>
      </Toolbar>
      <div className="mb-5 flex flex-wrap items-center gap-2">{states.map((s, k) => <span key={k} className="flex items-center gap-2"><span className="rounded-md border bg-card px-3 py-2 text-sm shadow-sm">{s.state}<span className="ml-2 text-[10px] text-muted-foreground">docstatus {s.doc_status}</span></span>{k < states.length - 1 && <span className="text-muted-foreground">→</span>}</span>)}</div>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="panel p-3"><div className="mb-2 text-sm font-semibold">States</div>
          {states.map((s, k) => <div key={k} className="mb-1 flex gap-1"><input className={inputCls} value={s.state} onChange={(e) => setStates(states.map((x, j) => j === k ? { ...x, state: e.target.value } : x))} /><select className={inputCls} value={s.doc_status} onChange={(e) => setStates(states.map((x, j) => j === k ? { ...x, doc_status: e.target.value } : x))}><option value="0">0</option><option value="1">1</option><option value="2">2</option></select><input className={inputCls} value={s.allow_edit} onChange={(e) => setStates(states.map((x, j) => j === k ? { ...x, allow_edit: e.target.value } : x))} /></div>)}
          <button className={btnCls} onClick={() => setStates([...states, { state: `State ${states.length + 1}`, doc_status: "0", allow_edit: "All" }])}>Add State</button></div>
        <div className="panel p-3"><div className="mb-2 text-sm font-semibold">Transitions</div>
          {trans.map((t, k) => <div key={k} className="mb-1 flex gap-1">{(["state", "action", "next_state", "allowed"] as const).map((f) => f === "state" || f === "next_state" ? <select key={f} className={inputCls} value={t[f]} onChange={(e) => setTrans(trans.map((x, j) => j === k ? { ...x, [f]: e.target.value } : x))}>{names.map((n) => <option key={n} value={n}>{n}</option>)}</select> : <input key={f} className={`${inputCls} w-24`} value={t[f]} onChange={(e) => setTrans(trans.map((x, j) => j === k ? { ...x, [f]: e.target.value } : x))} />)}</div>)}
          <button className={btnCls} onClick={() => setTrans([...trans, { state: names[0] ?? "", action: "Action", next_state: names[1] ?? "", allowed: "All" }])}>Add Transition</button></div>
      </div>
    </div>
  );
}
