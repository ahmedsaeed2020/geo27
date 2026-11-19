import { Link, useNavigate } from "@tanstack/react-router";
import { currentUser, filterReadable, hasPerm, useSessionUser } from "@/lib/session";
import { memo, useEffect, useMemo, useState } from "react";
import { adapter, useStoreVersion, type Doc } from "@/lib/adapter";
import { CRM, LIST_COLUMNS, timeAgo, type CrmKind } from "@/lib/crm";
import { CrmShell, Badge, Modal, StatusDot } from "./CrmShell";
import { LayoutRenderer, statusColor, useCrm, type CrmBundle } from "./useCrm";
import { dval, useL } from "./crmI18n";
import { CrmViewBar, applyView, groupRows, useCrmView } from "./CrmViewBar";
import { CrmLostReason } from "./CrmLostReason";
import { useDevMode } from "@/lib/mode";
import { CrmBulkActions } from "./CrmBulkActions";
import { useColWidths } from "./useColWidths";
import { CrmColumnPicker, useCrmColumns } from "./CrmColumnPicker";
import { CrmListTools } from "./CrmListTools";
import { listExtension, listInsights } from "./listExt";
import { useActiveExperience } from "@/plugins/theme";
import { useSearch } from "@tanstack/react-router";
import { StatusStrip } from "@/components/enterprise/StatusStrip";
import { inStripTab, stripTabs } from "@/lib/statusStrip";

/** Reconstructs pages/Leads.vue and pages/Deals.vue: list (default) and kanban view types from router `/leads/view/:viewType`. */
import { CrmKanbanSettings, cardKeysOf } from "./CrmKanbanSettings";
import { KanbanBoard, KanbanColumn, KanbanCard, KanbanMore, useKanbanLimits } from "@/components/kanban";
import { canMoveKanban, moveKanban } from "@/lib/kanbanMove";
import { toast } from "sonner";
import { CrmPager, usePage } from "./CrmPager";
import { fieldTitle } from "@/lib/linkTitle";

/** App-owned register cells read related records (activity, duplicates, response time), so they re-render only when
 *  records, language, session user or the row change — not on selection, column-load or frame re-renders of the page. */
const ExtCell = memo(function ExtCell({ ext, k, r }: { ext: NonNullable<ReturnType<typeof listExtension>>; k: string; r: Doc; ver: number; lang: string; user: string }) {
  return <>{ext.cell(k, r)}</>;
});

export function CrmListPage({ kind, initial }: { kind: CrmKind; initial?: "list" | "group_by" | "kanban" }) {
  const b = useCrm();
  const cfg = CRM[kind];
  const [vs, setVs] = useCrmView(cfg.doctype, initial);
  const cw = useColWidths(cfg.doctype);
  const { lang } = useL();
  const view = vs.type;
  const [creating, setCreating] = useState(false);
  const [createStage, setCreateStage] = useState<string | undefined>();
  useEffect(() => { const h = (e: Event) => { if ((e as CustomEvent<string>).detail === cfg.doctype) setCreating(true); }; window.addEventListener("crm-create", h); return () => window.removeEventListener("crm-create", h); }, [cfg.doctype]);
  const [lost, setLost] = useState<{ doc: Doc; status: string } | null>(null);
  const [selection, setSelection] = useState<string[]>([]);
  const { L } = useL();
  const experience = useActiveExperience();
  const ext = listExtension(experience, cfg.doctype);
  const Insights = listInsights(experience, cfg.doctype);
  const search = useSearch({ strict: false }) as Record<string, unknown>;
  const hl = ext ? String(search["hl"] ?? "") : "";
  const navHl = useNavigate();
  const setHl = (id: string) => void navHl({ to: ".", replace: true, search: (p: Record<string, unknown>) => { const n = { ...p }; delete n["pg"]; if (id) n["hl"] = id; else delete n["hl"]; return n; } });
  const [inspect, setInspect] = useState<string | null>(null);
  const [dense, setDense] = useState(true);
  const xl = (s: string) => (ext ? ext.t(s, lang) : s);
  const header = (
    <>
      <span className="text-lg font-semibold">{L(cfg.label)}</span>
      <div className="ms-auto flex gap-2">
        <CrmListTools doctype={cfg.doctype} />
        <button className="crm-btn-solid" onClick={() => setCreating(true)} disabled={!b}>+ {L("Create")}</button>
      </div>
    </>
  );
  const metaCols = (b ? (kind === "lead" ? b.lead : b.deal).fields : [])
    .filter((f) => f.fieldname && f.label && !["Section Break", "Column Break", "Tab Break", "Table", "HTML"].includes(f.fieldtype))
    .map((f) => ({ key: String(f.fieldname), label: String(f.label) }));
  const basePool = [...LIST_COLUMNS[kind], ...metaCols.filter((m) => !LIST_COLUMNS[kind].some((c) => c.key === m.key))];
  const pool = ext ? [...ext.columns.map((c) => ({ key: c.key, label: xl(c.label) })), ...basePool] : basePool;
  const defaults = ext ? ext.defaultCols.map((k) => pool.find((c) => c.key === k)).filter((c): c is { key: string; label: string } => !!c) : LIST_COLUMNS[kind];
  const { cols, save: saveCols, ready: columnsReady } = useCrmColumns(ext ? `${cfg.doctype}:digit_crm` : cfg.doctype, defaults, pool);
  const kanban = useKanbanLimits();
  /** Matching rows and highlight counts cover every permitted record; recomputed only when records, user, view or highlight change. */
  const ver = useStoreVersion(), sessionUser = useSessionUser(), vsKey = JSON.stringify(vs);
  // Enterprise status strip (Round 1 §6): the state tab lives in the address (?st=), counted with the same rule that filters
  const stTab = typeof search["st"] === "string" ? String(search["st"]) : undefined;
  const setSt = (k: string | undefined) => void navHl({ to: ".", replace: true, search: (p: Record<string, unknown>) => { const n = { ...p }; delete n["pg"]; if (k) n["st"] = k; else delete n["st"]; return n; } });
  const allRows = useMemo(() => b ? (() => { const vr = applyView(filterReadable(kind === "lead" ? b.lead : b.deal, adapter.list(cfg.doctype)), vs); return { vr, rows: ext && hl ? vr.filter((r) => ext.matches(hl, r)) : vr }; })() : { vr: [] as Doc[], rows: [] as Doc[] }, [b, kind, ver, sessionUser, vsKey, hl, ext]); // eslint-disable-line react-hooks/exhaustive-deps
  const memoHighlights = useMemo(() => (ext ? ext.highlights(allRows.vr) : []), [ext, allRows.vr]);
  const pg = usePage(stTab && b ? allRows.rows.filter((r) => inStripTab((kind === "lead" ? b.lead : b.deal) as never, r, stTab)).length : allRows.rows.length);
  if (!b) return <CrmShell header={header}><p className="p-6 text-crm-muted">Loading…</p></CrmShell>;
  const meta = kind === "lead" ? b.lead : b.deal;
  const viewRows = allRows.vr;
  const stripTabsCrm = stripTabs(meta as never, allRows.rows);
  const rows = stTab ? allRows.rows.filter((r) => inStripTab(meta as never, r, stTab)) : allRows.rows;
  const pageRows = pg.slice(rows);
  const highlights = memoHighlights;
  const inspected = ext && inspect ? adapter.get(cfg.doctype, inspect) : undefined;
  const colField = vs.group_by_field || "status"; const titleKey = vs.title_field || (kind === "lead" ? "lead_name" : "organization");
  const cardKeys = cardKeysOf(vs, ["email"]);
  const statuses = colField === "status" ? Object.keys(kind === "lead" ? b.defaults.lead_statuses : b.defaults.deal_statuses) : groupRows(rows, colField).map(([g]) => g);
  const inCol = (r: Doc, s: string) => (String(r[colField] ?? "") || "(empty)") === s;
  const move = (doc: Doc, stage: string) => {
    if (!canMoveKanban(meta, doc, colField, stage)) { toast.error(L("Not permitted")); return; }
    const config = kind === "lead" ? b.defaults.lead_statuses : b.defaults.deal_statuses;
    if (colField === "status" && config[stage]?.type === "Lost") { setLost({ doc, status: stage }); return; }
    const error = moveKanban(meta, doc, colField, stage); if (error) toast.error(L(error));
  };
  return (
    <CrmShell header={header}>
      {Insights && <div className="px-4 pt-3" data-crm-list-insights><Insights /></div>}
      <CrmViewBar dt={cfg.doctype} v={vs} set={setVs} fields={cols} types={["list", "group_by", "kanban"]} />
      <div className="flex items-center gap-2 px-5 pb-2">
        {view === "kanban" && <CrmKanbanSettings v={vs} set={setVs} pool={pool} column={colField} title={titleKey} cards={cardKeys} />}
        {ext && view !== "kanban" && <button type="button" className="rounded border border-crm-line px-2 py-1 text-xs" aria-pressed={dense} onClick={() => setDense(!dense)}>{xl(dense ? "Comfortable" : "Compact")}</button>}
        <div className="ms-auto"><CrmColumnPicker cols={cols} pool={pool} save={saveCols} /></div>
      </div>
      {ext && <div className="flex flex-wrap gap-2 px-5 pb-3" data-dc-highlights>
        {highlights.map((h) => <button key={h.id} type="button" data-dc-hl={h.id} aria-pressed={hl === h.id} onClick={() => setHl(hl === h.id ? "" : h.id)} className={`flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs ${hl === h.id ? "border-crm-ink bg-crm-hover font-medium" : "border-crm-line hover:bg-crm-hover"}`} style={{ borderInlineStartWidth: 3, borderInlineStartColor: `var(--status-${h.tone ?? "gray"})` }}><span>{xl(h.label)}</span><span className="text-sm font-semibold" dir="ltr" data-no-i18n>{h.count}</span></button>)}
        {hl && <button type="button" className="text-xs text-crm-muted underline" onClick={() => setHl("")}>{xl("Clear")}</button>}
      </div>}
      {view !== "kanban" && <div className="px-5" data-crm-strip><StatusStrip tabs={stripTabsCrm} active={stTab} ar={lang === "ar"} onPick={setSt} /></div>}
      {selection.length > 0 && <CrmBulkActions dt={cfg.doctype} names={selection} columns={LIST_COLUMNS[kind]} onDone={() => setSelection([])} />}
      {selection.length > 0 && selection.length < rows.length && <div className="px-5 pb-2 text-xs"><button type="button" className="text-crm-ink underline" data-crm-select-all-matching onClick={() => setSelection(rows.map((r) => r.name))}>{L("Select all")} <span dir="ltr" data-no-i18n>({rows.length.toLocaleString("en-US")})</span></button></div>}
      {view !== "kanban" ? (
        <div data-crm-register className="flex flex-col md:flex-row"><div className="min-w-0 flex-1 overflow-x-auto">
        <table className={`w-full ${ext && dense ? "text-xs" : "text-sm"}`} data-crm-columns-ready={columnsReady ? "true" : "false"}>
          <thead className="border-y border-crm-line text-left text-crm-muted"><tr><th className="px-3"><input type="checkbox" aria-label={L("Select all")} checked={pageRows.length > 0 && pageRows.every(r => selection.includes(r.name))} onChange={e => { const page = new Set(pageRows.map(r => r.name)); setSelection(e.target.checked ? [...new Set([...selection, ...page])] : selection.filter(n => !page.has(n))); }} /></th>{cols.map((c) => <th key={c.key} {...cw.th(c.key)} className={`relative py-2 font-normal ${ext ? "px-2" : "px-5"}`}>{c.label}{cw.handle(c.key)}</th>)}{ext && <th className="px-3 py-2 font-normal">{xl("Actions")}</th>}</tr></thead>
          {(view === "group_by" ? groupRows(pageRows, vs.group_by_field) : [["", pageRows] as const]).map(([g, grp]) => (
          <tbody key={g}>
            {view === "group_by" && <tr className="bg-crm-sidebar"><td colSpan={cols.length + (ext ? 2 : 1)} className="px-5 py-1.5 font-medium">{g} <span className="text-crm-muted">{grp.length}</span></td></tr>}
            {grp.map((r) => (
              <tr key={r.name} data-row={r.name} onClick={ext ? (e) => { if (!(e.target as HTMLElement).closest("a,button,input")) setInspect(r.name); } : undefined} className={`border-b border-crm-line hover:bg-crm-hover ${ext ? "cursor-pointer" : ""} ${inspect === r.name ? "bg-crm-hover" : ""}`}>
                <td className="px-3"><input type="checkbox" aria-label={`${L("Select")} ${r.name}`} checked={selection.includes(r.name)} onChange={e => setSelection(e.target.checked ? [...selection, r.name] : selection.filter(n => n !== r.name))} /></td>
                {cols.map((c, i) => (
                  <td key={c.key} className={`${ext ? "px-2" : "px-5"} ${ext && dense ? "py-1.5" : "py-2.5"}`}>
                    {ext && c.key.startsWith("x_") ? <ExtCell ext={ext} k={c.key} r={r} ver={ver} lang={lang} user={sessionUser} /> : <Cell kind={kind} c={c.key} r={r} b={b} first={i === 0 && !(ext && cols.some((x) => x.key.startsWith("x_")))} />}
                  </td>
                ))}
                {ext && <td className="px-3 py-1.5"><ext.Actions row={r} /></td>}
              </tr>
            ))}
          </tbody>
          ))}
        </table>
        {rows.length === 0 && <p className="px-5 py-6 text-sm text-crm-muted">{L("No results")}</p>}
        </div>
        {ext && inspected && <ext.Inspector row={inspected} onClose={() => setInspect(null)} />}
        </div>
      ) : (
        <KanbanBoard className="mx-5 mb-5">
          {statuses.map((s) => { const group = rows.filter((r) => inCol(r, s)), shown = kanban.limit(s); return (
            <KanbanColumn key={s} data-kanban-status={s} title={s} count={group.length} indicator={<StatusDot color={statusColor(b, kind, s)} />} summary={ext?.kanbanSummary?.(group)} onCreate={hasPerm(meta, "create") && colField === "status" ? () => { setCreateStage(s); setCreating(true); } : undefined} createLabel={`${L("Create")} ${s}`} onDragOver={e => { const name = e.dataTransfer.getData("text/plain"); const doc = adapter.get(cfg.doctype, name); if (!doc || canMoveKanban(meta, doc, colField, s)) e.preventDefault(); }} onDrop={e => { e.preventDefault(); const doc = rows.find((r) => r.name === e.dataTransfer.getData("text/plain")); if (doc) move(doc, s); }}>
              {group.slice(0, shown).map((r) => <KanbanCard key={r.name} draggable={canMoveKanban(meta, r, colField)} onDragStart={e => e.dataTransfer.setData("text/plain", r.name)}>
                <Link to={kind === "lead" ? "/digit-crm/leads/$leadId" : "/digit-crm/deals/$dealId"} params={kind === "lead" ? { leadId: r.name } : { dealId: r.name }} className="block font-semibold text-primary hover:underline" data-no-i18n>{dval(fieldTitle(cfg.doctype, meta.fields, titleKey, r[titleKey]) || r.name, lang)}</Link>
                <div className="mb-2 text-[11px] text-muted-foreground" data-no-i18n>{r.name}</div>
                {cardKeys.filter((k) => r[k] && !k.startsWith("x_")).map((k) => <div key={k} className="mb-1 text-xs text-muted-foreground" data-no-i18n>{dval(fieldTitle(cfg.doctype, meta.fields, k, r[k]), lang)}</div>)}
                {ext?.KanbanContent && <ext.KanbanContent row={r} />}
                {canMoveKanban(meta, r, colField) && <select aria-label={lang === "ar" ? `نقل المرحلة ${r.name}` : `Move stage ${r.name}`} className="field-input mt-2 text-xs" value={String(r[colField] ?? "")} onChange={e => move(r, e.target.value)}>{statuses.map((stage) => <option key={stage} value={stage} disabled={!canMoveKanban(meta, r, colField, stage)}>{stage}</option>)}</select>}
              </KanbanCard>)}
              <KanbanMore shown={shown} total={group.length} onMore={() => kanban.more(s)} lang={lang} />
              {!group.length && <p className="py-4 text-center text-xs text-muted-foreground">{L("No results")}</p>}
            </KanbanColumn>
          ); })}
        </KanbanBoard>
      )}
      {view !== "kanban" ? <CrmPager p={pg} lang={lang} /> : <div className="px-5 py-2 text-xs text-crm-muted" data-crm-kanban-total><span dir="ltr" data-no-i18n>{rows.length.toLocaleString("en-US")}</span></div>}
      {creating && <QuickEntry kind={kind} b={b} stage={createStage} onClose={() => { setCreating(false); setCreateStage(undefined); }} />}
      {lost && <CrmLostReason doc={lost.doc} status={lost.status} onClose={() => setLost(null)} />}
    </CrmShell>
  );
}

function Cell({ kind, c, r, b, first }: { kind: CrmKind; c: string; r: Doc; b: CrmBundle; first: boolean }) {
  const v = r[c];
  const { lang } = useL();
  const content = c === "status" ? <Badge tone={statusColor(b, kind, v)}><StatusDot color={statusColor(b, kind, v)} />{String(v ?? "")}</Badge>
    : c === "modified" ? <span className="text-crm-muted">{timeAgo(v)}</span>
    : c === "_assign" ? <span className="text-crm-muted">{String(r[CRM[kind].owner] ?? "")}</span>
    : c === "annual_revenue" ? Number(v ?? 0).toLocaleString()
    : <span data-no-i18n>{dval(fieldTitle(CRM[kind].doctype, (kind === "lead" ? b.lead : b.deal).fields, c, v), lang)}</span>;
  if (!first) return content;
  return <Link to={kind === "lead" ? "/digit-crm/leads/$leadId" : "/digit-crm/deals/$dealId"} params={kind === "lead" ? { leadId: r.name } : { dealId: r.name }} className="font-medium hover:underline">{content || r.name}</Link>;
}

/** Modals/LeadModal.vue / DealModal.vue rendering the "<DocType>-Quick Entry" layout from crm/install.py. */
function QuickEntry({ kind, b, stage, onClose }: { kind: CrmKind; b: CrmBundle; stage?: string | undefined; onClose: () => void }) {
  const cfg = CRM[kind];
  const meta = kind === "lead" ? b.lead : b.deal;
  const layout = b.layouts[`${cfg.doctype}-Quick Entry`]?.layout ?? [];
  const firstStatus = Object.keys(kind === "lead" ? b.defaults.lead_statuses : b.defaults.deal_statuses)[0];
  const [doc, setDoc] = useState<Doc>({ name: "", doctype: cfg.doctype, status: stage ?? firstStatus, [cfg.owner]: currentUser() });
  const [dirty, setDirty] = useState(false);
  const [err, setErr] = useState("");
  const { L: Lq } = useL();
  const guardedClose = () => { if (dirty && !window.confirm(Lq("You have unsaved changes. Discard them?"))) return; onClose(); };
  const nav = useNavigate();
  const dev = useDevMode();
  const create = () => {
    const missing = meta.fields.filter((f) => f.reqd && f.fieldname && f.fieldname !== "naming_series" && !doc[f.fieldname]).map((f) => f.label);
    if (missing.length) return setErr(`Missing: ${missing.join(", ")}`);
    const lead_name = kind === "lead" ? [doc["first_name"], doc["last_name"]].filter(Boolean).join(" ") : undefined;
    const { name: _n, doctype: _d, ...rest } = doc;
    const created = adapter.insertDoc(cfg.doctype, { ...rest, ...(lead_name ? { lead_name } : {}), converted: 0 });
    onClose();
    nav(kind === "lead" ? { to: "/digit-crm/leads/$leadId", params: { leadId: created.name } } : { to: "/digit-crm/deals/$dealId", params: { dealId: created.name } });
  };
  return (
    <Modal title={`Create ${cfg.single}`} onClose={guardedClose}>
      <LayoutRenderer layout={layout} meta={meta} doc={doc} b={b} onChange={(k, v) => { setDoc({ ...doc, [k]: v }); setDirty(true); }} />
      {err && <p className="mt-3 text-sm text-destructive">{err}</p>}
      {dev && <p className="mt-3 text-[11px] text-crm-muted">Layout: {cfg.doctype}-Quick Entry (crm/install.py). Naming series and server validation are not executed in this preview.</p>}
      <div className="mt-4 flex justify-end"><button className="crm-btn-solid" onClick={create}>Create</button></div>
    </Modal>
  );
}
