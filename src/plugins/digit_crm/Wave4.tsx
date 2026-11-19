import { Button } from "@/components/ui/button";
import { ArrowUpRight } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { adapter, type Doc } from "@/lib/adapter";
import { currentUser } from "@/lib/session";
import { Link, useNavigate } from "@tanstack/react-router";
import { CrmFrame } from "./CrmApp";
import { DeskLink, Empty, Kpi, money, Num, RefLink, Section } from "./Wave2";
import { ownerChoices, userLabel } from "./wf01";
import { dealsIn, drillLabel, drillRecords, isTopic, leadConversion, leadsIn, recordLabel, TOPICS, topicTables, winRate, type RFilter, type Topic } from "./wf04";
import { dealsMoney, fmtMoney, receivablesSafe } from "./wf05";
import { canExportReport, CURRENT_REPORTS, currentReport, isReportRef, refTitle, RESEARCH_GROUPS, RESEARCH_REPORTS, searchCatalog, tableCsv, type ResearchReport } from "./wf12";
import { BOARD_GROUPS, BOARD_INFO } from "./modules";
import { Download, Search } from "lucide-react";
import { DateInput } from "@/components/form/DateInput";

export type ReportSearch = { from?: string | undefined; to?: string | undefined; owner?: string | undefined; cat?: Topic | undefined; drill?: string | undefined; rpt?: string | undefined; view?: "catalog" | undefined; q?: string | undefined };
export function validateReportSearch(s: Record<string, unknown>): ReportSearch {
  const str = (v: unknown) => (typeof v === "string" && v ? v : undefined);
  const date = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined);
  const rpt = str(s["rpt"]);
  return { cat: isTopic(s["cat"]) ? s["cat"] : undefined, from: date(s["from"]), to: date(s["to"]), owner: str(s["owner"]), drill: str(s["drill"]), rpt: rpt && currentReport(rpt) ? rpt : undefined, view: s["view"] === "catalog" ? "catalog" : undefined, q: str(s["q"]) };
}

const fmtCell = (v: number | string | null, col: string) => v === null ? "—" : typeof v === "number" && /^$/.test(col) ? money(v) : String(v);

/** Topic-scoped, URL-backed Reports Center (cat/from/to/owner/drill in the URL → shareable, Back-restorable). */
export function ReportsCenter({ search }: { search: ReportSearch }) {
  const nav = useNavigate();
  const set = (p: Partial<ReportSearch>) => void nav({ to: "/digit-crm/reports", search: { ...search, ...p } as never });
  const topic = search.cat, catalog = search.view === "catalog";
  const t = TOPICS.find((x) => x.id === topic);
  return <CrmFrame title={t ? t.label : "Reports Center"} subtitle={t ? t.hint : "Choose a report topic. Every figure opens the records behind it."}>{(user) => {
    const f: RFilter = { from: search.from, to: search.to, owner: search.owner };
    const deals = dealsIn(user, f), leads = leadsIn(user, f);
    const wr = winRate(deals), lc = leadConversion(leads);
    return <>
      <nav className="flex flex-wrap gap-1" aria-label="Report topics" data-crm-report-topics>
        <button onClick={() => set({ cat: undefined, drill: undefined, view: undefined, rpt: undefined })} aria-pressed={!topic && !catalog} className={`rounded-full border px-3 py-1 text-xs ${!topic && !catalog ? "border-primary bg-primary/10 text-primary" : "border-border"}`}>All topics</button>
        {TOPICS.map((x) => <button key={x.id} data-topic={x.id} onClick={() => set({ cat: x.id, drill: undefined, view: undefined, rpt: undefined })} aria-pressed={topic === x.id && !catalog} className={`rounded-full border px-3 py-1 text-xs ${topic === x.id && !catalog ? "border-primary bg-primary/10 text-primary" : "border-border"}`}>{x.label}</button>)}
        <button data-topic="catalog" onClick={() => set({ view: catalog ? undefined : "catalog", drill: undefined })} aria-pressed={catalog} className={`ms-auto inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs ${catalog ? "border-primary bg-primary/10 text-primary" : "border-border"}`}><Search className="h-3 w-3" /><span>Report catalog</span></button>
      </nav>
      {catalog ? <ReportCatalog q={search.q ?? ""} setQ={(q) => set({ q: q || undefined })} open={(cat, rpt) => set({ cat, rpt, view: undefined, drill: undefined })} /> : <>
      <div className="panel flex flex-wrap items-end gap-3 p-3 text-sm" data-crm-report-filters>
        <label className="grid gap-1"><span className="text-xs text-muted-foreground">From</span><DateInput className="field-input" value={search.from ?? ""} onChange={(e) => set({ from: e.target.value || undefined, drill: undefined })} /></label>
        <label className="grid gap-1"><span className="text-xs text-muted-foreground">To</span><DateInput className="field-input" value={search.to ?? ""} onChange={(e) => set({ to: e.target.value || undefined, drill: undefined })} /></label>
        <label className="grid gap-1"><span className="text-xs text-muted-foreground">Owner</span><select className="field-input" value={search.owner ?? ""} onChange={(e) => set({ owner: e.target.value || undefined, drill: undefined })}><option value="">All</option>{ownerChoices(currentUser()).map((u) => <option key={u.name} value={u.name} data-no-i18n>{userLabel(u.name)}</option>)}</select></label>
        {(search.from || search.to || search.owner) && <button className="btn-ghost" onClick={() => set({ from: undefined, to: undefined, owner: undefined, drill: undefined })}>Clear filters</button>}
        <p className="ms-auto text-xs text-muted-foreground">Date basis: created on · Currency: company default · Your permitted records only</p>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="Opportunities" value={deals.length} /><Kpi label="Win Rate" value={wr === null ? "—" : `${wr}%`} hint="Won ÷ (Won + Lost)" />
        <Kpi label="Leads" value={leads.length} /><Kpi label="Lead Conversion" value={lc === null ? "—" : `${lc}%`} hint="Converted ÷ all leads" />
      </div>
      {!topic ? <ReportsLanding f={f} open={(cat, rpt) => set({ cat, rpt, drill: undefined })} openCatalog={() => set({ view: "catalog", drill: undefined })} />
        : <div className="grid gap-4 lg:grid-cols-2">{topicTables(topic, user, f).map((tb) => <ReportCard key={tb.id} id={tb.id} focus={search.rpt === tb.id}><Section title={<>{tb.title}{tb.rid ? <span data-no-i18n>{` · ${tb.rid}`}</span> : null}</>} right={tb.rows.length > 0 && canExportReport(tb.id, user) ? <button type="button" className="btn-ghost inline-flex items-center gap-1 text-xs" onClick={() => downloadCsv(`crm_${tb.id}.csv`, tableCsv(tb.cols, tb.rows, tb.total))} data-crm-export={tb.id}><Download className="h-3 w-3" /><span>Export CSV</span></button> : null}>
          {tb.note && <p className="mb-2 text-xs text-muted-foreground">{tb.note}</p>}
          {!tb.rows.length ? <Empty>No records for these filters.</Empty> : <div className="overflow-x-auto"><table className="dp-table w-full text-sm" data-crm-report={tb.id}>
            <thead><tr>{tb.cols.map((c, i) => <th key={c} className={i ? "text-end" : "text-start"}>{c}</th>)}</tr></thead>
            <tbody>{tb.rows.map((r) => <tr key={r.key} aria-selected={search.drill === r.drill}>
              <td><Button variant="link" className="h-auto p-0 text-primary text-start" onClick={() => set({ drill: r.drill })} data-drill={r.drill}><span data-no-i18n={recordLabel(tb.id, r.label) ? true : undefined}>{r.label}</span><ArrowUpRight className="ms-1 h-3 w-3" /></Button></td>
              {r.cells.map((c, i) => <td key={i} className="text-end whitespace-nowrap"><Num v={fmtCell(c, tb.cols[i + 1] ?? "")} /></td>)}</tr>)}</tbody>
            {tb.total && <tfoot><tr className="font-semibold"><td>Total</td>{tb.total.map((c, i) => <td key={i} className="text-end whitespace-nowrap"><Num v={fmtCell(c, tb.cols[i + 1] ?? "")} /></td>)}</tr></tfoot>}
          </table></div>}
        </Section></ReportCard>)}</div>}
      {search.drill && <DrillPanel user={user} f={f} drill={search.drill} onClose={() => set({ drill: undefined })} />}
      </>}
    </>;
  }}</CrmFrame>;
}

/** Register that lists every contributor of a single-DocType drill; mixed or other DocTypes get no misleading link. */
const DRILL_REGISTER: Record<string, { to: "/digit-crm/leads" | "/digit-crm/pipeline"; label: string }> = {
  "CRM Lead": { to: "/digit-crm/leads", label: "Open full Leads list" },
  "CRM Deal": { to: "/digit-crm/pipeline", label: "Open full Deals list" },
};

/** Rows shown before "Show all"; totals and status counts always cover every contributing record. */
export const DRILL_ROW_LIMIT = 100;
/** Money columns for single-DocType drills: deal value / weighted value, invoice outstanding — the same formulas the boards use. */
export function drillTotals(rows: { dt: string; name: string; status: string }[]) {
  const types = [...new Set(rows.map((r) => r.dt))];
  const docs = rows.map((r) => adapter.get(r.dt, r.name)).filter((d): d is Doc => Boolean(d));
  const statuses = [...rows.reduce((m, r) => (r.status ? m.set(r.status, (m.get(r.status) ?? 0) + 1) : m), new Map<string, number>())].sort((a, b) => b[1] - a[1]);
  if (types.length === 1 && types[0] === "CRM Deal") return { kind: "deal" as const, value: fmtMoney(dealsMoney(docs)), weighted: fmtMoney(dealsMoney(docs, true)), statuses, cell: (d: Doc | undefined) => (d ? fmtMoney(dealsMoney([d])) : "—") };
  if (types.length === 1 && types[0] === "Sales Invoice") return { kind: "invoice" as const, value: fmtMoney(receivablesSafe(docs).unpaid), weighted: "", statuses, cell: (d: Doc | undefined) => (d ? fmtMoney(receivablesSafe([d]).unpaid) : "—") };
  return { kind: "none" as const, value: "", weighted: "", statuses, cell: () => "" };
}

function DrillPanel({ user, f, drill, onClose }: { user: string; f: RFilter; drill: string; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [all, setAll] = useState(false);
  useEffect(() => { ref.current?.scrollIntoView({ behavior: "instant", block: "start" }); setAll(false); }, [drill]);
  const rows = drillRecords(user, f, drill);
  const types = [...new Set(rows.map((r) => r.dt))];
  const register = types.length === 1 ? DRILL_REGISTER[types[0] ?? ""] : undefined;
  const dl = drillLabel(drill);
  const tot = drillTotals(rows);
  const shown = all ? rows : rows.slice(0, DRILL_ROW_LIMIT);
  return <div ref={ref} className="scroll-mt-24" data-crm-drill-panel={drill}><Section title="Source records" right={<button className="btn-ghost" onClick={onClose}>Close</button>}>
    <p className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground" data-crm-drill-filter={drill}>
      <span title={drill}><span>{dl.label}</span>{dl.value && <>: <bdi className="rounded bg-muted px-1 font-medium text-foreground" data-no-i18n={dl.value === "Not set" || dl.translatable ? undefined : ""}>{dl.value}</bdi></>}</span>
      <span><span>Records</span>: <span data-crm-drill-count><Num v={rows.length} /></span></span>
      {tot.kind === "deal" && <><span><span>Value</span>: <span data-crm-drill-value className="font-medium text-foreground"><Num v={tot.value} /></span></span><span><span>Weighted</span>: <span data-crm-drill-weighted className="font-medium text-foreground"><Num v={tot.weighted} /></span></span></>}
      {tot.kind === "invoice" && <span><span>Outstanding</span>: <span data-crm-drill-value className="font-medium text-foreground"><Num v={tot.value} /></span></span>}
    </p>
    {tot.statuses.length > 1 && <p className="mb-2 flex flex-wrap gap-1 text-xs" data-crm-drill-statuses>{tot.statuses.slice(0, 8).map(([st, n]) => <span key={st} className="rounded border border-border px-1.5 py-0.5" data-crm-drill-status={st}><span>{st}</span> <Num v={n} /></span>)}</p>}
    {!rows.length ? <Empty>No records.</Empty> : <div className="overflow-x-auto"><table className="dp-table w-full text-sm" data-crm-drill><tbody>{shown.map((r) => <tr key={r.dt + r.name}>
      <td><DeskLink app="crm" dt={r.dt} name={r.name} />{r.dt === "CRM Organization" && <Link to="/digit-crm/customers/$org" params={{ org: r.name }} className="ms-2 whitespace-nowrap text-xs text-primary hover:underline" data-crm-drill-c360={r.name}>Customer 360</Link>}</td><td data-no-i18n>{r.title}</td><td>{r.status || "—"}</td>
      {tot.kind !== "none" && <td className="text-end whitespace-nowrap"><Num v={tot.cell(adapter.get(r.dt, r.name))} /></td>}</tr>)}</tbody></table></div>}
    {rows.length > DRILL_ROW_LIMIT && <button type="button" className="mt-2 text-xs text-primary hover:underline" aria-expanded={all} data-crm-drill-toggle onClick={() => setAll((v) => !v)}>{all ? <span>Show fewer</span> : <><span>Show all</span> (<Num v={rows.length} />)</>}</button>}
    {register && <p className="mt-2 text-xs"><Link to={register.to} className="text-primary hover:underline">{register.label}</Link></p>}
  </Section></div>;
}

/** Report card wrapper: a contextual entry (?rpt=) scrolls to and highlights the requested table. */
function ReportCard({ id, focus, children }: { id: string; focus: boolean; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (focus) ref.current?.scrollIntoView({ behavior: "instant", block: "start" }); }, [focus]);
  return <div ref={ref} className={`min-w-0 scroll-mt-24 rounded-lg ${focus ? "ring-2 ring-primary" : ""}`} data-crm-report-card={id} data-focus={focus ? "" : undefined}>{children}</div>;
}
function downloadCsv(name: string, csv: string) {
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" })); const a = document.createElement("a"); a.href = url; a.download = name; a.click(); URL.revokeObjectURL(url);
}
const STATUS_LABEL: Record<ResearchReport["status"], string> = { implemented: "Implemented", "name-pending": "Name pending source registry", dependency: "Dependency" };
/** Searchable catalog: current Reports Center tables + the 65-ID research registry with truthful status. */
function ReportCatalog({ q, setQ, open }: { q: string; setQ: (q: string) => void; open: (cat: Topic, rpt: string) => void }) {
  const [text, setText] = useState(q);
  useEffect(() => setText(q), [q]);
  const res = searchCatalog(q);
  const implemented = res.research.filter((r) => r.status === "implemented").length;
  return <div className="space-y-4" data-crm-report-catalog>
    <form className="panel flex flex-wrap items-center gap-2 p-3" onSubmit={(e) => { e.preventDefault(); setQ(text); }} role="search">
      <Search className="h-4 w-4 text-muted-foreground" aria-hidden />
      <input className="field-input min-w-48 flex-1" value={text} onChange={(e) => setText(e.target.value)} placeholder="Search reports by name, ID, group or source" aria-label="Search reports" data-crm-catalog-search />
      <button type="submit" className="btn-primary">Search</button>{q && <button type="button" className="btn-ghost" onClick={() => setQ("")}>Clear</button>}
    </form>
    <Section title="Current reports" right={<span className="text-xs text-muted-foreground"><Num v={res.current.length} /></span>}>
      {!res.current.length ? <Empty>No matching reports.</Empty> : <div className="overflow-x-auto"><table className="dp-table w-full text-sm" data-crm-catalog="current"><thead><tr><th className="text-start">ID</th><th className="text-start">Report</th><th className="text-start">Topic</th><th className="text-start">Source</th></tr></thead>
        <tbody>{res.current.map((r) => <tr key={r.table}><td data-no-i18n dir="ltr">{r.rid}</td><td><button type="button" className="text-primary hover:underline text-start" onClick={() => open(r.topic, r.table)} data-crm-catalog-open={r.table}>{r.title}</button></td><td>{TOPICS.find((t) => t.id === r.topic)?.label}</td><td data-no-i18n>{r.source}</td></tr>)}</tbody></table></div>}
    </Section>
    <Section title="Research report registry" right={<span className="text-xs text-muted-foreground"><span>Implemented</span>: <Num v={`${implemented} / ${res.research.length}`} /></span>}>
      <p className="mb-2 text-xs text-muted-foreground">65 research IDs (R-001–R-064 and R-039b). The research registry file with the remaining report names is not in this project, so those IDs link to their group's current reports without being claimed as implemented.</p>
      {!res.research.length ? <Empty>No matching reports.</Empty> : <div className="space-y-3">{RESEARCH_GROUPS.map((g) => { const rows = res.research.filter((r) => r.group === g.group); if (!rows.length) return null; return <div key={g.group} className="rounded border border-border" data-crm-research-group={g.group}>
        <div className="flex flex-wrap items-center gap-2 border-b border-border bg-muted/40 px-3 py-2 text-sm"><span className="font-medium">{g.group}</span><span className="text-[11px] text-muted-foreground" data-no-i18n dir="ltr">{g.ids[0]}{g.ids.length > 1 ? `–${g.ids[g.ids.length - 1]}` : ""}</span>
          <span className="ms-auto flex flex-wrap gap-1">{g.related.map((x) => isReportRef(x) ? <button key={x.table} type="button" className="rounded-full border border-border px-2 py-0.5 text-[11px] hover:bg-muted" onClick={() => open(x.topic, x.table)}>{refTitle(x)}</button> : <Link key={x.to} to={x.to as never} search={(x.search ?? {}) as never} className="rounded-full border border-border px-2 py-0.5 text-[11px] hover:bg-muted">{x.label}</Link>)}</span></div>
        <ul className="divide-y divide-border">{rows.map((r) => <li key={r.rid} className="flex flex-wrap items-center gap-2 px-3 py-1.5 text-sm" data-crm-research={r.rid} data-status={r.status}>
          <span className="w-16 text-xs text-muted-foreground" data-no-i18n dir="ltr">{r.rid}</span>
          {r.name ? r.table && currentReport(r.table) ? <button type="button" className="text-primary hover:underline text-start" onClick={() => { const c = currentReport(r.table ?? ""); if (c) open(c.topic, c.table); }}>{r.name}</button> : <span>{r.name}</span> : <span className="text-muted-foreground">—</span>}
          <span className={`ms-auto rounded px-1.5 py-0.5 text-[10px] ${r.status === "implemented" ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>{STATUS_LABEL[r.status]}</span>{r.dependency && <span className="text-[11px] text-muted-foreground">{r.dependency}</span>}
        </li>)}</ul></div>; })}</div>}
    </Section>
  </div>;
}

/** Reports Center landing: topics with their report tables, the ten analytical boards by audience and the research
 *  registry status — every entry opens an existing report table or board (nothing is marked installed or verified). */
function ReportsLanding({ f, open, openCatalog }: { f: RFilter; open: (cat: Topic, rpt?: string) => void; openCatalog: () => void }) {
  const implemented = RESEARCH_REPORTS.filter((r) => r.status === "implemented").length;
  const keep = { ...(f.from ? { from: f.from } : {}), ...(f.to ? { to: f.to } : {}), ...(f.owner ? { owner: f.owner } : {}) };
  return <div className="space-y-5" data-crm-reports-landing>
    <section><h2 className="mb-2 text-sm font-semibold">Report topics</h2><div className="grid gap-3 md:grid-cols-2">{TOPICS.map((x) => { const tables = CURRENT_REPORTS.filter((r) => r.topic === x.id); return <div key={x.id} className="dc-panel" data-topic-card={x.id}>
      <button type="button" onClick={() => open(x.id)} className="group flex w-full items-start gap-2 text-start"><span className="min-w-0 flex-1"><span className="block font-semibold group-hover:text-primary">{x.label}</span><span className="block text-xs text-muted-foreground">{x.hint}</span></span><span className="rounded-full bg-muted px-2 py-0.5 text-xs"><Num v={tables.length} /></span><ArrowUpRight className="h-4 w-4 text-muted-foreground" /></button>
      <ul className="mt-3 grid gap-x-4 gap-y-1 border-t border-border pt-2 sm:grid-cols-2">{tables.map((r) => <li key={r.table}><button type="button" className="flex w-full items-baseline gap-2 text-start text-xs hover:text-primary" onClick={() => open(x.id, r.table)} data-crm-landing-report={r.table}><span className="min-w-10 shrink-0 whitespace-nowrap text-[10px] text-muted-foreground" data-no-i18n dir="ltr">{r.rid}</span><span className="min-w-0 truncate">{r.title}</span></button></li>)}</ul>
    </div>; })}</div></section>
    <section><h2 className="mb-2 text-sm font-semibold">Analytical boards</h2><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">{BOARD_GROUPS.map((g) => <div key={g.label} className="dc-panel" data-crm-board-group={g.label}>
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{g.label}</p>
      <ul className="grid gap-2">{g.boards.map((b) => <li key={b}><Link to="/digit-crm/dashboards" search={{ board: b, ...keep } as never} className="group block" data-crm-landing-board={b}><span className="flex items-center gap-1 text-sm font-medium group-hover:text-primary">{BOARD_INFO[b].title}<ArrowUpRight className="h-3 w-3 text-muted-foreground" /></span><span className="block text-[11px] text-muted-foreground">{BOARD_INFO[b].purpose}</span></Link></li>)}</ul>
    </div>)}</div></section>
    <section className="dc-panel flex flex-wrap items-center gap-3" data-crm-registry-summary><div className="min-w-0 flex-1"><h2 className="text-sm font-semibold">Research report registry</h2><p className="text-xs text-muted-foreground">65 research IDs (R-001–R-064 and R-039b). The research registry file with the remaining report names is not in this project, so those IDs link to their group's current reports without being claimed as implemented.</p></div>
      <span className="text-sm"><span className="text-muted-foreground">Implemented</span>: <strong><Num v={`${implemented} / ${RESEARCH_REPORTS.length}`} /></strong></span><button type="button" className="btn-ghost inline-flex items-center gap-1 text-xs" onClick={openCatalog}><Search className="h-3 w-3" /><span>Report catalog</span></button></section>
  </div>;
}
