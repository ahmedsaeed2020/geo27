import { Link, useNavigate } from "@tanstack/react-router";
import { EntTable } from "@/components/enterprise/kit/EntTable";
import { DeptPanel } from "./Workspace";
import { Button } from "@/components/ui/button";
import { searchTree, type DirectorySearch } from "./screenSearch";
import { useLang } from "@/i18n";
import type { ReactNode } from "react";
import { Fragment, useState } from "react";
import type { Doc } from "@/lib/adapter";
import { useSessionUser } from "@/lib/session";
import { MessageContent } from "@/components/crm/messageContent";
import { CrmFrame } from "./CrmApp";
import { fmtMoney } from "./wf05";
import {
  dashboardWidgets, kindLabel, salesPersonTree, territoryGaps, territoryTree, timelineOf,
  type PersonNode, type TerritoryNode, type Widget,
} from "./wf06";
import { DeskLink, Empty, Kpi, Num, RefLink, Section } from "./Wave2";
import { linkTitle } from "@/lib/linkTitle";

const fmtDate = (s: string) => { const t = Date.parse(s); return Number.isFinite(t) ? new Date(t).toLocaleDateString(typeof window !== "undefined" && localStorage.getItem("digit-virtual-core:lang") !== "en" ? "ar-SA-u-ca-gregory-nu-latn" : "en-US", { dateStyle: "medium" }) : "—"; };

/* ---------- Sales Teams ---------- */
function PersonRow({ node, depth, user }: { node: PersonNode; depth: number; user: string }) {
  const g = Number(node.doc["is_group"]) === 1;
  const s = node.stats;
  return <>
    <tr data-person={node.doc.name}>
      <td style={{ paddingInlineStart: `${depth * 1.25 + 0.5}rem` }}>
        <DeskLink app="erpnext" dt="Sales Person" name={node.doc.name} />
        {g && <span className="ms-2 text-xs text-muted-foreground">Group</span>}
      </td>
      <td className="text-end"><Num v={s.open} /></td>
      <td className="text-end"><Num v={s.won} /></td>
      <td className="text-end"><Num v={fmtMoney(s.pipeline)} /></td>
      <td className="text-end"><Num v={fmtMoney(s.wonSum)} /></td>
      <td className="text-end">{s.target ? <Num v={`${Math.round((s.achieved / s.target) * 100)}%`} /> : "—"}</td>
    </tr>
    {node.children.map((c) => <PersonRow key={c.doc.name} node={c} depth={depth + 1} user={user} />)}
  </>;
}

export function SalesTeams({ search }: { search: DirectorySearch }) {
  const nav = useNavigate();
  const setSearch = (q: string) => void nav({ to: "/digit-crm/sales-teams", search: { q: q || undefined } });
  return <CrmFrame title="Sales Teams" subtitle="Sales person hierarchy with live pipeline, wins and target achievement.">{(user) => {
    const tree = searchTree(salesPersonTree(user), search.q, (n) => `${n.doc.name} ${n.doc["sales_person_name"] ?? ""}`);
    return <><DeptPanel dept="teams" /><DirectoryFilter search={search} onChange={setSearch} /><Section title="Sales person tree">
      {!tree.length ? <Empty>{search.q ? "No records for these filters." : "No sales persons yet."}</Empty> :
        <div className="overflow-x-auto"><EntTable id="crm-sales-teams" wrap><table className="dp-table w-full text-sm" data-dc="sales-teams"><thead><tr>
          <th>Sales Person</th><th className="text-end">Open</th><th className="text-end">Won</th><th className="text-end">Pipeline</th><th className="text-end">Won Value</th><th className="text-end">Target %</th>
        </tr></thead><tbody>{tree.map((n) => <PersonRow key={n.doc.name} node={n} depth={0} user={user} />)}</tbody></table></EntTable></div>}
      <p className="mt-2 text-xs text-muted-foreground">Credit goes to the deal owner or a sales_team row. Amounts follow the currency rule — mixed currencies are never added without a verified rate.</p>
    </Section></>;
  }}</CrmFrame>;
}

/* ---------- Territories ---------- */
function TerritoryRow({ node, depth, user }: { node: TerritoryNode; depth: number; user: string }) {
  const g = Number(node.doc["is_group"]) === 1;
  const s = node.stats;
  return <>
    <tr data-territory={node.doc.name}>
      <td style={{ paddingInlineStart: `${depth * 1.25 + 0.5}rem` }}><DeskLink app="erpnext" dt="Territory" name={node.doc.name} label={linkTitle("Territory", node.doc.name)} />{g && <span className="ms-2 text-xs text-muted-foreground">Group</span>}</td>
      <td className="text-end"><Num v={s.leads} /></td>
      <td className="text-end"><Num v={s.open} /></td>
      <td className="text-end"><Num v={s.won} /></td>
      <td className="text-end"><Num v={fmtMoney(s.pipeline)} /></td>
    </tr>
    {node.children.map((c) => <TerritoryRow key={c.doc.name} node={c} depth={depth + 1} user={user} />)}
  </>;
}

export function Territories({ search }: { search: DirectorySearch }) {
  const nav = useNavigate();
  const setSearch = (q: string) => void nav({ to: "/digit-crm/territories", search: { q: q || undefined } });
  return <CrmFrame title="Territories" subtitle="Coverage by territory — leads, open deals and pipeline per region.">{(user) => {
    const tree = searchTree(territoryTree(user), search.q, (n) => `${n.doc.name} ${linkTitle("Territory", n.doc.name)}`), gaps = territoryGaps(user).filter((g) => !search.q || `${g.name} ${linkTitle("Territory", g.name)}`.toLocaleLowerCase().includes(search.q.toLocaleLowerCase()));
    return <>
      <DeptPanel dept="territories" />
      <DirectoryFilter search={search} onChange={setSearch} />
      <Section title="Territory tree">
        {!tree.length ? <Empty>{search.q ? "No records for these filters." : "No territories yet."}</Empty> :
          <div className="overflow-x-auto"><EntTable id="crm-territories" wrap><table className="dp-table w-full text-sm" data-dc="territories"><thead><tr>
            <th>Territory</th><th className="text-end">Leads</th><th className="text-end">Open Deals</th><th className="text-end">Won</th><th className="text-end">Pipeline</th>
          </tr></thead><tbody>{tree.map((n) => <TerritoryRow key={n.doc.name} node={n} depth={0} user={user} />)}</tbody></table></EntTable></div>}
      </Section>
      <Section title="Coverage gaps">
        {!gaps.length ? <Empty>{search.q ? "No records for these filters." : "Every leaf territory has leads or open deals."}</Empty> :
          <ul className="list-disc ps-5 text-sm" data-dc="territory-gaps">{gaps.map((g) => <li key={g.name}><DeskLink app="erpnext" dt="Territory" name={g.name} label={linkTitle("Territory", g.name)} />{" — "}<span>no leads, no open deals</span></li>)}</ul>}
      </Section>
    </>;
  }}</CrmFrame>;
}

function DirectoryFilter({ search, onChange }: { search: DirectorySearch; onChange: (q: string) => void }) {
  return <div className="flex flex-wrap items-end gap-3" data-crm-directory-filters>
    <label className="grid gap-1 text-sm"><span>Search</span><input type="search" className="field-input" value={search.q ?? ""} onChange={(e) => onChange(e.target.value)} /></label>
    {search.q && <Button variant="ghost" size="sm" onClick={() => onChange("")}>Clear filters</Button>}
  </div>;
}

/* ---------- Communication Timeline ---------- */
const KIND_ICON: Record<string, string> = { email: "✉", call: "☎", meeting: "◷", note: "✎", task: "✓", system: "•" };

export function TimelineItems({ doctype, name, references }: { doctype: string; name: string; references?: { doctype: string; name: string }[] }) {
  const lang = useLang();
  const user = useSessionUser();
  const refs = references ?? [{ doctype, name }];
  const items = [...new Map(refs.flatMap((r) => timelineOf(r.doctype, r.name, user, true).map((i) => ({ ...i, refDt: r.doctype, refName: r.name }))).map((i) => [i.id, i])).values()]
    .sort((a, b) => b.when.localeCompare(a.when));
  const [only, setOnly] = useState<string>("");
  if (!items.length) return <Empty>No communication logged yet.</Empty>;
  // Chronology grouping: month headers + per-kind filter chips (additive — "All" keeps every entry).
  const kinds = [...new Set(items.map((i) => i.kind))];
  const shown = only ? items.filter((i) => i.kind === only) : items;
  const monthOf = (w: string) => Number.isFinite(Date.parse(w)) ? new Date(w).toLocaleDateString(lang === "ar" ? "ar-SA-u-ca-gregory-nu-latn" : "en-US", { month: "long", year: "numeric" }) : "—";
  return <div>
    {kinds.length > 1 && <div className="mb-3 flex flex-wrap gap-1" role="group" data-dc="timeline-filter">
      <Button size="sm" variant={only ? "outline" : "secondary"} className="h-7 text-xs" aria-pressed={!only} onClick={() => setOnly("")}>{lang === "ar" ? "الكل" : "All"} <span className="tabular-nums">{items.length}</span></Button>
      {kinds.map((k) => <Button key={k} size="sm" variant={only === k ? "secondary" : "outline"} className="h-7 text-xs" aria-pressed={only === k} onClick={() => setOnly(only === k ? "" : k)}>{KIND_ICON[k as keyof typeof KIND_ICON]} {kindLabel(k as never)} <span className="tabular-nums">{items.filter((i) => i.kind === k).length}</span></Button>)}
    </div>}
  <ol className="divide-y divide-border" data-dc="timeline">
    {shown.map((i, n) => <Fragment key={i.id}>{(n === 0 || monthOf(shown[n - 1]?.when ?? "") !== monthOf(i.when)) && <li className="border-b pb-1 pt-2 text-xs font-semibold text-muted-foreground" data-dc="timeline-month" data-no-i18n>{monthOf(i.when)}</li>}<li className="flex gap-3 py-4" data-kind={i.kind}>
      <span aria-hidden className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-sm">{KIND_ICON[i.kind]}</span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2 text-sm">
          <span className="text-xs font-medium text-muted-foreground">{kindLabel(i.kind)}</span>
          <Link to="/app/$app/$doctype/$name" params={{ app: ["Communication", "Email Queue", "Event"].includes(i.dt) ? "frappe" : ["Customer", "Quotation", "Sales Order", "Sales Invoice"].includes(i.dt) ? "erpnext" : "crm", doctype: i.dt.toLowerCase().replace(/[^a-z0-9]+/g, "_"), name: i.name }} className="font-medium text-primary hover:underline" data-no-i18n>{lang === "ar" && i.dt === "CRM Call Log" ? ({ Incoming: "واردة", Outgoing: "صادرة", Call: "مكالمة" }[i.title] ?? i.title) : i.title}</Link>
          <span className="ms-auto text-xs text-muted-foreground" data-no-i18n>{Number.isFinite(Date.parse(i.when)) ? new Date(i.when).toLocaleString(lang === "ar" ? "ar-SA-u-ca-gregory-nu-latn" : "en-US", { dateStyle: "medium", timeStyle: "short" }) : "—"}</span>
        </div>
        {references && <div className="mt-1 text-xs"><RefLink dt={i.refDt} name={i.refName} /></div>}
        {(i.from || i.to) && <div className="text-xs text-muted-foreground" data-no-i18n>{i.from ?? ""}{i.from && i.to ? " → " : ""}{i.to ?? ""}</div>}
        {i.body && <details className="mt-2 text-sm text-muted-foreground"><summary className="cursor-pointer truncate" data-no-i18n>{i.body.replace(/<[^>]*>/g, " ").slice(0, 110)}</summary><div className="mt-2" data-no-i18n><MessageContent value={i.body} /></div></details>}
        {i.status && <span className="mt-1 inline-block rounded bg-muted px-1.5 py-0.5 text-xs">{i.status}</span>}
      </div>
    </li></Fragment>)}
  </ol></div>;
}

export function TimelineSection({ doc, doctype }: { doc: Doc; doctype: string }) {
  return <Section title="Communication timeline"><TimelineItems doctype={doctype} name={doc.name} /></Section>;
}

/* ---------- CRM Dashboards ---------- */
function WidgetCard({ w }: { w: Widget }) {
  const body: ReactNode = w.kind === "kpi"
    ? <Kpi label={w.title} value={w.value} {...(w.hint ? { hint: w.hint } : {})} {...(w.to ? { to: w.to } : {})} />
    : <div className="rounded-lg border bg-card p-4">
        <div className="text-sm text-muted-foreground">{w.title}</div>
        <div className="mt-2 space-y-1.5">{(w.bars ?? []).map((b) => <div key={b.label} className="flex items-center gap-2 text-sm">
          <span className="w-28 truncate" data-no-i18n>{b.label}</span>
          <span className="h-2 rounded bg-primary" style={{ width: `${Math.max(4, (b.value / b.max) * 100)}%` }} />
          <Num v={b.value} />
        </div>)}</div>
      </div>;
  return <div data-widget={w.id}>{body}</div>;
}

export function CrmDashboards() {
  return <CrmFrame title="CRM Dashboards" subtitle="Live widgets computed from current records — nothing stored, nothing stale.">{(user) => {
    const ws = dashboardWidgets(user);
    return <>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" data-dc="crm-dashboards">{ws.filter((w) => w.kind === "kpi").map((w) => <WidgetCard key={w.id} w={w} />)}</div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">{ws.filter((w) => w.kind === "bar").map((w) => <WidgetCard key={w.id} w={w} />)}</div>
      <p className="mt-3 text-xs text-muted-foreground">Editable personal dashboards are available on the main DIGIT Pro dashboard; these widgets always reflect live CRM data.</p>
    </>;
  }}</CrmFrame>;
}

export { Link };
