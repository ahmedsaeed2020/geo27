import { Link, useNavigate } from "@tanstack/react-router";
import { assertPerm, currentUser, hasPerm, useSessionUser, type PType } from "@/lib/session";
import { directoryRows, assertDirectoryAction } from "./dirAccess";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { adapter, useStoreVersion, type Doc } from "@/lib/adapter";
import { indexQuery, loadMeta, type DocTypeMeta } from "@/lib/catalog";
import { CRM_DIR, DIR_COLUMNS, DIR_KANBAN, seedCrmDirectory, timeAgo, type CrmDirKind, type LayoutSection } from "@/lib/crm";
import { useDevMode } from "@/lib/mode";
import { DevOnly } from "@/components/DevOnly";
import { dval, useL } from "./crmI18n";
import { CrmShell, Modal } from "./CrmShell";
import { LayoutRenderer, useCrm } from "./useCrm";
import { CrmViewBar, applyView, groupRows, useCrmView, withSelectDefaults, type ViewType } from "./CrmViewBar";
import { useColWidths } from "./useColWidths";
import { CrmColumnPicker, useCrmColumns } from "./CrmColumnPicker";
import { CrmListTools } from "./CrmListTools";
import { KanbanBoard, KanbanColumn, KanbanCard, KanbanMore, useKanbanLimits } from "@/components/kanban";
import { CrmPager, usePage } from "./CrmPager";
import { fieldTitle } from "@/lib/linkTitle";
import { Button } from "@/components/ui/button";
import { listInsights } from "./listExt";
import { useActiveExperience } from "@/plugins/theme";

function useDirMeta(doctype: string): DocTypeMeta | null {
  const idx = useQuery(indexQuery);
  const [meta, setMeta] = useState<DocTypeMeta | null>(null);
  useEffect(() => {
    if (!idx.data) return;
    let on = true;
    loadMeta(idx.data, doctype).then((m) => { if (on) setMeta(m as DocTypeMeta); });
    return () => { on = false; };
  }, [idx.data, doctype]);
  return meta;
}

/**
 * Reconstructs pages/Contacts.vue, Organizations.vue, CallLogs.vue, Notes.vue and Tasks.vue:
 * list / group-by / kanban views (router `/<x>/view/:viewType`), quick + advanced filters, sort,
 * column picker (ColumnSettings.vue), saved views, row selection with bulk actions (ListBulkActions.vue:
 * Edit, Delete, Assign To, Clear Assignment, Export) and the quick-entry create modal.
 */
export function CrmDirList({ kind, initial }: { kind: CrmDirKind; initial?: ViewType }) {
  const user = useSessionUser();
  const b = useCrm();
  const cfg = CRM_DIR[kind];
  const Insights = listInsights(useActiveExperience(), cfg.doctype);
  const meta = useDirMeta(cfg.doctype);
  const [vs, setVs] = useCrmView(cfg.doctype, initial);
  const [ks, setKs] = useState(false);
  const [creating, setCreating] = useState(false);
  useEffect(() => { const h = (e: Event) => { if ((e as CustomEvent<string>).detail === cfg.doctype) setCreating(true); }; window.addEventListener("crm-create", h); return () => window.removeEventListener("crm-create", h); }, [cfg.doctype]);
  // Final Core: the CRM directory seed runs where the directory is first opened (insert-if-missing, see src/lib/crm.ts)
  const [seeded, setSeeded] = useState(false);
  useEffect(() => { if (b && !seeded) { seedCrmDirectory(); setSeeded(true); } }, [b, seeded]);
  const [editing, setEditing] = useState<Doc | null>(null);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const { L, fmt, lang } = useL();
  const cw = useColWidths(cfg.doctype);
  const dev = useDevMode();
  const ver = useStoreVersion();
  const metaCols0 = (meta?.fields ?? []).filter((f) => f.fieldname && f.label && !["Section Break", "Column Break", "Tab Break", "Table", "HTML"].includes(f.fieldtype)).map((f) => ({ key: String(f.fieldname), label: String(f.label) }));
  const pool0 = [...DIR_COLUMNS[kind], ...metaCols0.filter((m) => !DIR_COLUMNS[kind].some((c) => c.key === m.key))];
  const { cols, save: saveCols } = useCrmColumns(cfg.doctype, DIR_COLUMNS[kind], pool0);
  const header = (
    <>
      <span className="text-lg font-semibold">{L(cfg.label)}</span>
      <div className="ms-auto flex gap-2">
        <CrmListTools doctype={cfg.doctype} />
        <Button className="crm-btn-solid" onClick={() => setCreating(true)} disabled={!b || !meta || !hasPerm(meta, "create", undefined, user)}>+ {L("Create")}</Button>
      </div>
    </>
  );
  /** Permitted rows and the filtered/sorted view over all of them; recomputed only when records, user, meta or view change. */
  const vsKey = JSON.stringify(vs);
  const all = useMemo(() => meta ? withSelectDefaults(meta.fields, directoryRows(meta, adapter.list(cfg.doctype), user)) : [], [meta, ver, user, cfg.doctype]);
  const rows = useMemo(() => meta ? applyView(all, vs) : [], [all, vsKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const pg = usePage(rows.length);
  const kanban = useKanbanLimits();
  if (!b || !meta) return <CrmShell header={header}><p className="p-6 text-crm-muted">…</p></CrmShell>;
  const pageRows = pg.slice(rows);
  const pool = pool0;
  const kanbanField = vs.group_by_field && vs.type === "kanban" ? vs.group_by_field : DIR_KANBAN[kind] ?? cols[1]?.key ?? "name";
  const titleKey = vs.title_field || cols[0]?.key || "name";
  let cardKeys: string[] = cols.slice(1, 3).map((c) => c.key); try { if (vs.kanban_fields) cardKeys = JSON.parse(vs.kanban_fields); } catch { /* keep default card fields */ }
  const open = (r: Doc) => setEditing(r);
  const toggle = (n: string) => { const x = new Set(sel); if (x.has(n)) x.delete(n); else x.add(n); setSel(x); };
  /** Source ListView: the header checkbox selects the rows on the current page; "Select all (N)" extends to every match. */
  const allSel = pageRows.length > 0 && pageRows.every((r) => sel.has(r.name));
  const bulk = (a: string) => {
    const names = all.filter(r => sel.has(r.name)).map(r => r.name);
    const action: PType = a === "delete" ? "delete" : a === "export" ? "export" : "write";
    try { assertDirectoryAction(meta, names.map(n => adapter.get(cfg.doctype, n)).filter((r): r is Doc => Boolean(r)), action, user); }
    catch { toast.error(L("Not permitted")); return; }
    if (a === "delete") { if (!window.confirm(fmt("Are you sure you want to delete {0} items?", names.length))) return; names.forEach((n) => adapter.remove(cfg.doctype, n)); }
    if (a === "edit") { const f = window.prompt(L("Field"), cols[1]?.key ?? ""); if (!f) return; const v = window.prompt(L("Value")) ?? ""; names.forEach((n) => adapter.update(cfg.doctype, n, { [f]: v })); }
    if (a === "assign") { const u = window.prompt(L("Assign To"), currentUser()); if (!u) return; names.forEach((n) => adapter.insertDoc("ToDo", { allocated_to: u, reference_type: cfg.doctype, reference_name: n, status: "Open", description: n })); names.forEach((n) => adapter.update(cfg.doctype, n, { _assign: JSON.stringify([u]) })); }
    if (a === "unassign") names.forEach((n) => adapter.update(cfg.doctype, n, { _assign: "[]" }));
    if (a === "export") {
      const data = all.filter((r) => sel.has(r.name));
      const csv = [cols.map((c) => c.label).join(","), ...data.map((r) => cols.map((c) => JSON.stringify(String(r[c.key] ?? ""))).join(","))].join("\n");
      const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" })); const el = document.createElement("a"); el.href = url; el.download = `${cfg.doctype}.csv`; el.click(); URL.revokeObjectURL(url);
    }
    setSel(new Set());
  };
  const types: ViewType[] = ["list", "group_by", "kanban"];
  return (
    <CrmShell header={header}>
      {Insights && <div className="px-4 pt-3" data-crm-list-insights><Insights /></div>}
      <CrmViewBar dt={cfg.doctype} v={vs} set={setVs} fields={cols} types={types} />
      <div className="flex flex-wrap items-center gap-2 px-5 pb-2 text-sm">
        {vs.type === "kanban" && (
          <label className="flex items-center gap-1 text-crm-muted">{L("Column field")}
            <select aria-label="Kanban column field" className="crm-input w-auto" value={kanbanField} onChange={(e) => setVs({ group_by_field: e.target.value })}>{pool.map((c) => <option key={c.key} value={c.key}>{L(c.label)}</option>)}</select>
          </label>
        )}
        {vs.type === "kanban" && <button className="crm-input w-auto" aria-label={L("Kanban Settings")} onClick={() => setKs(true)}>{L("Kanban Settings")}</button>}
        {ks && <Modal title={L("Kanban Settings")} onClose={() => setKs(false)}><div className="space-y-3 text-sm"><label className="block">{L("Column Field")}<select aria-label={L("Column Field")} className="crm-input" value={kanbanField} onChange={(e) => setVs({ group_by_field: e.target.value })}>{pool.map((c) => <option key={c.key} value={c.key}>{L(c.label)}</option>)}</select></label><label className="block">{L("Title Field")}<select aria-label={L("Title Field")} className="crm-input" value={titleKey} onChange={(e) => setVs({ title_field: e.target.value })}>{pool.map((c) => <option key={c.key} value={c.key}>{L(c.label)}</option>)}</select></label><fieldset><legend>{L("Fields")}</legend>{pool.map((c) => <label key={c.key} className="me-3 inline-flex items-center gap-1"><input type="checkbox" checked={cardKeys.includes(c.key)} onChange={(e) => setVs({ kanban_fields: JSON.stringify(e.target.checked ? [...cardKeys, c.key] : cardKeys.filter((k) => k !== c.key)) })} />{L(c.label)}</label>)}</fieldset></div></Modal>}
        <div className="ms-auto"><CrmColumnPicker cols={cols} pool={pool} save={saveCols} /></div>
      </div>
      {sel.size > 0 && (
        <div role="toolbar" aria-label={L("Bulk actions")} className="mx-5 mb-2 flex flex-wrap items-center gap-2 rounded-lg bg-crm-dark px-3 py-1.5 text-sm text-crm-surface">
          <span>{sel.size} {L("selected")}</span>
          {[["edit", "Edit"], ["delete", "Delete"], ["assign", "Assign To"], ["unassign", "Clear Assignment"], ["export", "Export"]].map(([a, l]) => a && l ? <Button key={a} variant="ghost" className="rounded px-2 py-0.5 hover:bg-crm-ink/20" onClick={() => bulk(a)}>{L(l)}</Button> : null)}
          {sel.size < rows.length && <button className="ms-auto rounded px-2 py-0.5 underline" data-crm-select-all-matching onClick={() => setSel(new Set(rows.map((r) => r.name)))}>{L("Select all")} <span dir="ltr" data-no-i18n>({rows.length.toLocaleString("en-US")})</span></button>}
          <button className={`${sel.size < rows.length ? "" : "ms-auto "}rounded px-2 py-0.5`} onClick={() => setSel(new Set())}>{L("Unselect all")}</button>
        </div>
      )}
      {vs.type === "kanban" ? (
        <KanbanBoard className="mx-5 mb-5">
          {groupRows(rows, kanbanField).map(([g, grp]) => (
            <KanbanColumn key={g} title={dv(fieldTitle(cfg.doctype, meta.fields, kanbanField, g), lang)} count={grp.length} aria-label={`Kanban column ${g}`}>
              {grp.slice(0, kanban.limit(g)).map((r) => (
                <KanbanCard key={r.name}>
                  <Button variant="link" className="h-auto max-w-full justify-start whitespace-normal p-0 text-start text-sm" onClick={() => open(r)} data-no-i18n>{fieldTitle(cfg.doctype, meta.fields, titleKey, r[titleKey]) || r.name}</Button>
                  {cardKeys.map((k) => pool.find((c) => c.key === k)).filter((c): c is { key: string; label: string } => !!c).map((c) => <div key={c.key} className="text-xs text-muted-foreground" data-no-i18n>{dv(fieldTitle(cfg.doctype, meta.fields, c.key, r[c.key]), lang)}</div>)}
                </KanbanCard>
              ))}
              <KanbanMore shown={kanban.limit(g)} total={grp.length} onMore={() => kanban.more(g)} lang={lang} />
            </KanbanColumn>
          ))}
        </KanbanBoard>
      ) : (
      <div data-crm-register className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="border-y border-crm-line text-start text-crm-muted"><tr>
          <th className="w-8 px-3"><input type="checkbox" aria-label={L("Select all")} checked={allSel} onChange={() => { const x = new Set(sel); for (const r of pageRows) { if (allSel) x.delete(r.name); else x.add(r.name); } setSel(x); }} /></th>
          {cols.map((c) => <th key={c.key} {...cw.th(c.key)} className="relative px-5 py-2 text-start font-normal">{L(c.label)}{cw.handle(c.key)}</th>)}</tr></thead>
        {(vs.type === "group_by" ? groupRows(pageRows, vs.group_by_field) : [["", pageRows] as const]).map(([g, grp]) => (
        <tbody key={g}>
          {vs.type === "group_by" && <tr className="bg-crm-sidebar"><td colSpan={cols.length + 1} className="px-5 py-1.5 font-medium"><span data-no-i18n>{dv(fieldTitle(cfg.doctype, meta.fields, vs.group_by_field, g), lang)}</span> <span className="text-crm-muted">{grp.length}</span></td></tr>}
          {grp.map((r) => (
            <tr key={r.name} data-row={r.name} className="border-b border-crm-line hover:bg-crm-hover">
              <td className="px-3"><input type="checkbox" aria-label={`Select ${r.name}`} checked={sel.has(r.name)} onChange={() => toggle(r.name)} /></td>
              {cols.map((c, i) => (
                <td key={c.key} className="px-5 py-2" data-no-i18n>
                  <DirCell kind={kind} col={c.key} r={r} first={i === 0} lang={lang} onOpen={() => open(r)} meta={meta} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        ))}
        {!rows.length && <tbody><tr><td className="px-5 py-6 text-crm-muted" colSpan={cols.length + 1}>{L(`No ${cfg.label} Found`)}</td></tr></tbody>}
      </table>
      </div>
      )}
      {vs.type === "kanban" ? <div className="px-5 py-2 text-xs text-crm-muted" data-crm-kanban-total><span dir="ltr" data-no-i18n>{rows.length.toLocaleString("en-US")}</span> {L("of")} <span dir="ltr" data-no-i18n>{all.length.toLocaleString("en-US")}</span></div>
        : <CrmPager p={pg} lang={lang} />}
      {rows.length !== all.length && vs.type !== "kanban" && <div className="px-5 pb-2 text-xs text-crm-muted" data-crm-filtered-of><span dir="ltr" data-no-i18n>{rows.length.toLocaleString("en-US")}</span> {L("of")} <span dir="ltr" data-no-i18n>{all.length.toLocaleString("en-US")}</span></div>}
      {creating && <DirQuickEntry kind={kind} meta={meta} onClose={() => setCreating(false)} />}
      {editing && <DirQuickEntry kind={kind} meta={meta} existing={editing} onClose={() => setEditing(null)} />}
      {dev && <p className="px-5 pb-3 text-[11px] text-crm-muted">Bulk assign writes local ToDo records; server-side assignment rules are not executed.</p>}
    </CrmShell>
  );
}

/** Display-only translation of record values (cities, statuses) without touching stored data. */
function dv(v: unknown, lang: string): string { return dval(v, lang); }

function DirCell({ kind, col, r, first, lang, onOpen, meta }: { kind: CrmDirKind; col: string; r: Doc; first: boolean; lang: string; onOpen: () => void; meta: DocTypeMeta }) {
  const v = r[col];
  const content: React.ReactNode = col === "modified" || col === "creation" ? <span className="text-crm-muted">{timeAgo(v)}</span>
    : col === "annual_revenue" ? Number(v ?? 0).toLocaleString()
    : col === "duration" ? `${Math.floor(Number(v ?? 0) / 60)}m ${Number(v ?? 0) % 60}s`
    : col === "reference_docname" && v ? <RefLink r={r} />
    : dv(fieldTitle(CRM_DIR[kind].doctype, meta.fields, col, v), lang);
  if (!first) return content;
  if (!CRM_DIR[kind].detail) return <button className="font-medium hover:underline" onClick={onOpen}>{content || r.name}</button>;
  if (kind === "contact") return <Link to="/app/$app/$doctype/$name" params={{ app: "frappe", doctype: "contact", name: r.name }} className="font-medium hover:underline">{content || r.name}</Link>;
  return <Link to="/digit-crm/customers/$org" params={{ org: r.name }} className="font-medium hover:underline">{content || r.name}</Link>;
}

function RefLink({ r }: { r: Doc }) {
  const lead = r["reference_doctype"] === "CRM Lead"; const n = String(r["reference_docname"]);
  return <Link to={lead ? "/digit-crm/leads/$leadId" : "/digit-crm/deals/$dealId"} params={lead ? { leadId: n } : { dealId: n }} className="underline">{n}</Link>;
}

/** ContactModal.vue / OrganizationModal.vue / CallLogModal.vue rendering the "<DocType>-Quick Entry" layout. */
function DirQuickEntry({ kind, meta, onClose, existing }: { kind: CrmDirKind; meta: DocTypeMeta; onClose: () => void; existing?: Doc }) {
  const b = useCrm();
  const cfg = CRM_DIR[kind];
  const srcLayout = b?.layouts[`${cfg.doctype}-Quick Entry`]?.layout;
  // NoteModal.vue / TaskModal.vue have no Quick Entry layout: their fields are the list columns.
  const layout = srcLayout ?? [{ name: "main", label: "", fields: DIR_COLUMNS[kind].map((c) => c.key).filter((k) => k !== "modified" && k !== "owner" && k !== "creation") } as unknown as LayoutSection];
  const [doc, setDoc] = useState<Doc>(existing ?? { name: "", doctype: cfg.doctype });
  const { L, fmt } = useL();
  const [dirty, setDirty] = useState(false);
  const [err, setErr] = useState("");
  const guardedClose = () => { if (dirty && !window.confirm(L("You have unsaved changes. Discard them?"))) return; onClose(); };
  const nav = useNavigate();
  if (!b) return null;
  const create = () => {
    try { assertPerm(meta, existing ? "write" : "create", existing ? adapter.get(cfg.doctype, existing.name) : doc); }
    catch { setErr(L("Not permitted")); return; }
    const missing = meta.fields.filter((f) => f.reqd && f.fieldname && f.fieldname !== "naming_series" && !doc[f.fieldname]).map((f) => f.label);
    if (missing.length) return setErr(fmt("Missing: {0}", missing.join("، ")));
    if (existing) { const { name: _n0, doctype: _d0, ...upd } = doc; adapter.update(cfg.doctype, existing.name, upd); return onClose(); }
    const { name: _n, doctype: _d, ...rest } = doc;
    if (kind === "contact" && !rest["full_name"]) rest["full_name"] = [rest["first_name"], rest["last_name"]].filter(Boolean).join(" ");
    const created = adapter.insertDoc(cfg.doctype, rest);
    onClose();
    if (kind === "contact") nav({ to: "/app/$app/$doctype/$name", params: { app: "frappe", doctype: "contact", name: created.name } });
    else if (kind === "organization") nav({ to: "/digit-crm/customers/$org", params: { org: created.name } });
  };
  return (
    <Modal title={existing ? `${L("Edit")} ${L(cfg.single)}` : fmt("Create {0}", L(cfg.single))} onClose={guardedClose}>
      <LayoutRenderer layout={layout} meta={meta} doc={doc} b={b} onChange={(k, v) => { setDoc({ ...doc, [k]: v }); setDirty(true); }} />
      {err && <p className="mt-3 text-sm text-destructive">{err}</p>}
      <DevOnly><p className="mt-3 text-[11px] text-crm-muted">Layout: {cfg.doctype}-Quick Entry (crm/install.py). Naming series and server validation are not executed in this preview.</p></DevOnly>
      <div className="mt-4 flex justify-end"><button className="crm-btn-solid" onClick={create}>{L(existing ? "Save" : "Create")}</button></div>
    </Modal>
  );
}
