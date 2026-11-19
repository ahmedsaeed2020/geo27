import { Link, useNavigate } from "@tanstack/react-router";
import { AccountingHome } from "./FinanceCards";
import { useEffect, useState } from "react";
import { adapter, type Doc } from "@/lib/adapter";
import { cachedMeta } from "@/lib/catalog";
import { canReadType, scopedList } from "@/lib/scope";
import { hasPerm } from "@/lib/session";
import { relTime } from "@/lib/relTime";
import { translateTo, useLang } from "@/i18n";
import { RUNNERS } from "@/lib/reportRunner";
import { ProFrame } from "./ProFrame";
import { financeContext, todayIso } from "./finance";
import { hrefPath, NavText, useNavResolver } from "./ProSidebar";
import { NAV_AR, targetHref, type Department, type NavGroup, type NavItem, type QueueDef } from "./nav";
import { enterContext } from "./navContext";
import { userRoles } from "@/lib/session";
import { resetPersonal, resolveLayout, saveLayout, type DashLayout } from "./dashLayout";
import { EditBar } from "./MainDashboard";
import { DeptDashboard } from "./DashKpis";
import { StockValueNotice } from "./StockValueRecon";
import type { DashId } from "./dashMetrics";

/** All-[Department] directory first; recent work, priorities and the (optional) KPI dashboard stay available below via Customize. */
const DEPT_SECTIONS = ["directory", "recent", "overview", "dashboard"] as const;
const DEPT_LABELS: Record<string, string> = { directory: "Work areas", dashboard: "Dashboard", overview: "Operational priorities and workflow", recent: "Recent work" };
type Kind = "all" | "documents" | "reports" | "pro";
const KINDS: { id: Kind; label: string }[] = [{ id: "all", label: "All types" }, { id: "documents", label: "Documents" }, { id: "reports", label: "Reports" }, { id: "pro", label: "Pro screens" }];
const kindOf = (i: NavItem): Exclude<Kind, "all"> | "tool" => (i.target.kind === "pro" ? "pro" : i.target.kind === "report" ? "reports" : i.target.kind === "doctype" || i.target.kind === "tree" ? "documents" : "tool");

/** Rows of a queue — Core fields only, scoped to what the user may read and to the selected company when the DocType has one. */
export function queueRows(q: QueueDef, company: string): Doc[] | "denied" {
  if (!canReadType(q.doctype)) return "denied";
  const t = todayIso();
  return scopedList(q.doctype).filter((d) => (!company || d["company"] === undefined || d["company"] === company)
    && q.where.every(([k, v]) => String(d[k] ?? (k === "docstatus" ? 0 : "")) === v)
    && (!q.overdue || (Number(d["outstanding_amount"] ?? 0) > 0 && String(d["due_date"] ?? "9999") < t)));
}
const queueFilters = (q: QueueDef) => JSON.stringify(q.where.map(([k, v]) => [k, "=", v]));

function KindIcon({ k }: { k: ReturnType<typeof kindOf> }) {
  const p = { width: 14, height: 14, viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round" as const, "aria-hidden": true };
  if (k === "reports") return <svg {...p}><path d="M3 13V8M8 13V3M13 13V6" /></svg>;
  if (k === "pro") return <svg {...p}><path d="M8 2.5l1.6 3.4 3.7.4-2.8 2.5.8 3.7L8 10.6 4.7 12.5l.8-3.7L2.7 6.3l3.7-.4z" /></svg>;
  if (k === "tool") return <svg {...p}><path d="M3 4h10M3 8h10M3 12h6" /><path d="M12 10.5v3M10.5 12h3" /></svg>;
  return <svg {...p}><rect x="3" y="2.5" width="10" height="11" rx="1.5" /><path d="M5.5 6h5M5.5 8.5h5M5.5 11h3" /></svg>;
}

/** The complete "All [Department]" directory: every native list, filtered queue, report, Pro screen and setup tool of the department, grouped by work area. */
export function DeptWorkspace({ d }: { d: Department }) {
  const r = useNavResolver();
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<Kind>("all");
  const [closed, setClosed] = useState<Record<string, boolean>>({});
  const nav = useNavigate();
  const lang = useLang(); const ar = lang === "ar";
  const [edit, setEdit] = useState(false);
  const [draft, setDraft] = useState<DashLayout | null>(null);
  // Phone: groups start collapsed (accessible accordions); desktop shows every group open.
  // OWN-34: a department with an approved architecture (Accounting) lists its directory by those areas — same entries
  const dir = d.areas ?? d.groups;
  useEffect(() => { if (window.matchMedia("(max-width: 767px)").matches) setClosed(Object.fromEntries(dir.map((g, k) => [g.id ?? g.label, k > 0]))); }, [d.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const dash = `dept:${d.id}`;
  return (
    <ProFrame title={d.all.label} subtitle="Every native document, report and setting of this department, grouped by work area." tabs={false} icon={`/icons/digit/mod/digit-mod-${d.icon}-light.svg`}
      actions={!edit ? <button type="button" className="btn-ghost" onClick={() => setEdit(true)} data-dp-dash-edit>Customize</button> : null}>
      {({ user }) => {
        const resolved = resolveLayout(dash, user, DEPT_SECTIONS);
        const base = resolved.source === "default" ? { ...resolved.layout, hidden: ["dashboard"] } : resolved.layout;
        const layout = draft ?? base; const src = draft ? "draft" : resolved.source;
        const canTeam = user === "Administrator" || userRoles(user).includes("System Manager");
        const show = (id: string) => edit || !layout.hidden.includes(id);
        const ord = (id: string) => 1 + layout.order.indexOf(id);
        const ctx = financeContext();
        const ql = q.trim().toLowerCase();
        const text = (s: string | undefined) => (s ? [s, NAV_AR[s] ?? "", translateTo(s, "ar")].join(" ").toLowerCase() : "");
        const match = (i: NavItem) => (kind === "all" || kindOf(i) === kind) && (!ql || text(i.label).includes(ql) || text(i.hint).includes(ql) || (i.target.kind === "doctype" || i.target.kind === "tree" ? text(i.target.doctype).includes(ql) : i.target.kind === "report" ? text(i.target.report).includes(ql) : false));
        const visible = (i: NavItem) => r.state(i) !== "denied" && match(i);
        const quick = d.quick.filter((x) => { const m = cachedMeta(x); return m && !m.issingle && !m.istable && hasPerm(m, "create"); });
        const create = (dt: string) => { const m = cachedMeta(dt); const app = r.appOf(dt); if (!m || !app) return; const doc = adapter.insert(m); enterContext(d.id, `/app/${app}/${dt.toLowerCase().replace(/[^a-z0-9]+/g, "_")}/${doc.name}`); void nav({ to: "/app/$app/$doctype/$name", params: { app, doctype: dt.toLowerCase().replace(/[^a-z0-9]+/g, "_"), name: doc.name } }); };
        const recent = d.doctypes.filter((x) => { const m = cachedMeta(x); return m && !m.issingle && !m.istable && canReadType(x); })
          .flatMap((x) => scopedList(x).map((doc) => ({ dt: x, doc }))).sort((a, b) => String(b.doc["modified"] ?? "").localeCompare(String(a.doc["modified"] ?? ""))).slice(0, 6);
        const groups = dir.map((g) => ({ ...g, items: g.items.filter(visible) })).filter((g) => g.items.length);
        const work = groups.filter((g) => g.section === "workflow" || g.section === "reports");
        const setup = groups.filter((g) => g.section === "setup" || g.section === "data");
        const total = new Set(d.groups.flatMap((g) => g.items).filter((i) => r.state(i) === "ok").map((i) => `${i.label}|${JSON.stringify(i.target)}`)).size;
        const hidden = d.groups.flatMap((g) => g.items).filter((i) => r.state(i) === "denied").length;
        const isOpen = (g: NavGroup) => !!ql || kind !== "all" || !closed[g.id ?? g.label];
        const card = (g: NavGroup) => {
          const id = g.id ?? g.label; const o = isOpen(g);
          return <section key={id} className="dp-dir-group" data-dp-group={g.label} data-dp-group-id={id}>
            <h3 className="dp-dir-h">
              <button type="button" className="dp-dir-toggle" aria-expanded={o} aria-controls={`dp-dir-${id}`} onClick={() => setClosed((c) => ({ ...c, [id]: o }))}>
                <img src="/icons/digit/ui/digit-ui-chevron-light.svg" alt="" className={`dp-chev ${o ? "dp-chev-open" : ""}`} />
                <span className="flex-1 text-start"><NavText label={g.label} /></span>
                <span className="dp-dir-count" data-no-i18n>{g.items.filter((i) => i.target.kind !== "missing").length}</span>
              </button>
            </h3>
            {o && <ul id={`dp-dir-${id}`} className="dp-dir-list">{g.items.map((i, k) => {
              const st = r.state(i); const h = st === "ok" ? targetHref(i.target, r.appOf) : undefined;
              const m = i.target.kind === "doctype" && !i.target.filters ? cachedMeta(i.target.doctype) : undefined;
              const canNew = !!m && !m.issingle && !m.istable && hasPerm(m, "create") && g.section !== "data";
              const kd = kindOf(i);
              const server = i.target.kind === "report" && !(i.target.report in RUNNERS);
              return <li key={`${i.label}-${k}`} className="dp-dir-item" data-dp-kind={i.target.kind}>
                <span className="dp-dir-ico" data-k={kd}><KindIcon k={kd} /></span>
                <span className="min-w-0 flex-1">
                  {h ? <Link to={h.to as never} params={h.params as never} search={(h.search ?? {}) as never} onClick={() => enterContext(d.id, hrefPath(h))} className="dp-dir-link" data-dp-resource={i.label}><NavText label={i.label} /></Link>
                    : <span className="text-muted-foreground" data-dp-unavailable={i.label}><NavText label={i.label} /> · <NavText label={i.target.kind === "missing" ? "Unavailable in this Core" : "Unavailable"} /></span>}
                  {i.hint && <span className="dp-dir-hint">{ar ? NAV_AR[i.hint] ? <span data-no-i18n>{NAV_AR[i.hint]}</span> : <span>{i.hint}</span> : i.hint}</span>}
                  {i.target.kind === "missing" && <span className="dp-dir-hint">{i.target.reason}</span>}
                </span>
                {i.target.kind === "pro" && <span className="chip bg-primary/10 text-primary" title="Premium enhancement">Pro</span>}
                {i.target.kind === "report" && <span className={`chip ${server ? "bg-muted text-muted-foreground" : "bg-primary/10 text-primary"}`} data-dp-report-run={server ? "server" : "preview"}><NavText label={server ? "Runs on DIGIT server" : "Runs in preview"} /></span>}
                {i.target.kind === "doctype" && i.target.filters && <span className="chip bg-muted text-muted-foreground"><NavText label="Filtered list" /></span>}
                {i.target.kind === "tree" && <span className="chip bg-muted text-muted-foreground"><NavText label="Tree" /></span>}
                {canNew && <button type="button" className="dp-ws-new" onClick={() => create((i.target as { doctype: string }).doctype)} aria-label={`New ${i.label}`}>New</button>}
              </li>; })}</ul>}
          </section>;
        };
        return (
          <div className="dp-ws" data-dp-workspace={d.id} data-dp-directory={d.id} {...(d.areas ? { "data-dp-dir-areas": d.areas.length } : {})} data-dp-dash-order={layout.order.filter((x) => !layout.hidden.includes(x)).join(",")}>
            {/* 1–3. Scope, search, type filters and authorized quick actions */}
            <section className="dp-ws-scope" aria-label="Scope">
              <dl className="dp-ws-ctx">
                <div><dt>Company</dt><dd data-no-i18n>{ctx.company || "—"}</dd></div>
                {ctx.fiscalYear && <div><dt>Fiscal Year</dt><dd data-no-i18n>{ctx.fiscalYear.name}</dd></div>}
                {ctx.currency && <div><dt>Currency</dt><dd data-no-i18n>{ctx.currency}</dd></div>}
                <div><dt>Role</dt><dd data-no-i18n>{r.user === "Administrator" ? "Administrator" : r.roles.filter((x) => !["All", "Guest", "Desk User"].includes(x)).join(", ") || "—"}</dd></div>
                <div><dt><NavText label="resources" /></dt><dd data-no-i18n data-dp-dir-total={total}>{total}</dd></div>
              </dl>
              <input type="search" className="field-input dp-ws-search" placeholder={ar ? NAV_AR["Find in this department"] : "Find in this department"} aria-label="Find in this department" value={q} onChange={(e) => setQ(e.target.value)} data-dp-ws-search />
              <div className="flex flex-wrap gap-1" role="radiogroup" aria-label="Type" data-dp-dir-kinds>
                {KINDS.map((k) => <button key={k.id} type="button" role="radio" aria-checked={kind === k.id} className={`chip ${kind === k.id ? "bg-primary text-primary-foreground" : "bg-muted"}`} onClick={() => setKind(k.id)} data-dp-dir-kind={k.id}><NavText label={k.label} /></button>)}
              </div>
              {quick.length > 0 && <div className="dp-ws-create" aria-label="Quick actions" data-dp-quick><span className="text-xs text-muted-foreground"><NavText label="Quick actions" /></span>
                {quick.map((x) => <button key={x} type="button" className="btn-ghost" onClick={() => create(x)} data-dp-create={x}><span>+</span> <span>{x}</span></button>)}</div>}
              {hidden > 0 && <p className="basis-full text-xs text-muted-foreground" data-dp-hidden><span data-no-i18n>{hidden}</span> <span>items hidden by your permissions</span></p>}
            </section>

            {/* PRO P1 — the finance home (shortcuts, featured bank balance, finance cards) above the Accounting directory */}
            {d.id === "accounting" && <div style={{ order: 0 }}><AccountingHome company={ctx.company} currency={ctx.currency} user={user} ar={ar} /></div>}

            {edit && <EditBar layout={layout} source={src} canTeam={canTeam} labels={DEPT_LABELS} onChange={setDraft} onSave={(scope) => { saveLayout(dash, scope, user, layout); setDraft(null); setEdit(false); }} onReset={() => { resetPersonal(dash, user); setDraft(null); }} onCancel={() => { setDraft(null); setEdit(false); }} />}

            {/* 4–5. Categorized directory */}
            {show("directory") && <div className="grid gap-4" style={{ order: ord("directory") }} data-dp-section="directory">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="dp-ws-h mb-0"><NavText label="Work areas" /></h2>
                <span className="ms-auto flex gap-1">
                  <button type="button" className="btn-ghost text-xs" onClick={() => setClosed({})} data-dp-dir-expand><NavText label="Expand all" /></button>
                  <button type="button" className="btn-ghost text-xs" onClick={() => setClosed(Object.fromEntries(dir.map((g) => [g.id ?? g.label, true])))} data-dp-dir-collapse><NavText label="Collapse all" /></button>
                </span>
              </div>
              {work.length > 0 && <div className="dp-dir-cols">{work.map(card)}</div>}
              {setup.length > 0 && <><h2 className="dp-ws-h mb-0"><NavText label="Setup and data" /></h2><div className="dp-dir-cols">{setup.map(card)}</div></>}
              {!groups.length && <p className="dp-state" data-dp-state="empty">No matching resources</p>}
            </div>}

            {/* 6. Recent work */}
            {show("recent") && <section className="dp-ws-sec" data-dp-recent style={{ order: ord("recent") }}>
              <h2 className="dp-ws-h">Recent work</h2>
              {recent.length === 0 ? <p className="text-sm text-muted-foreground">No recent records</p> : <ul className="dp-card grid gap-1 text-sm">{recent.map(({ dt, doc }) => { const app = r.appOf(dt); return <li key={dt + doc.name} className="flex items-center gap-3">
                <span className="w-40 shrink-0 truncate text-muted-foreground">{dt}</span>
                {app ? <Link to="/app/$app/$doctype/$name" params={{ app, doctype: dt.toLowerCase().replace(/[^a-z0-9]+/g, "_"), name: doc.name }} className="truncate hover:underline" data-no-i18n>{doc.name}</Link> : <span data-no-i18n>{doc.name}</span>}
                <span className="ms-auto text-xs text-muted-foreground" data-no-i18n>{relTime(String(doc["modified"] ?? ""), lang)}</span></li>; })}</ul>}
            </section>}

            {show("overview") && <div className="dp-ws-top" style={{ order: ord("overview") }}>
              <section className="dp-card dp-ws-queues" aria-labelledby={`q-${d.id}`} data-dp-queues>
                <h2 id={`q-${d.id}`} className="dp-ws-h">Operational priorities</h2>
                <ul>{d.queues.map((qd) => {
                  const rows = queueRows(qd, ctx.company);
                  const app = r.appOf(qd.doctype);
                  const href = qd.open ? targetHref(qd.open, r.appOf) : app ? { to: "/app/$app/$doctype", params: { app, doctype: qd.doctype.toLowerCase().replace(/[^a-z0-9]+/g, "_") }, search: { filters: queueFilters(qd) } } : undefined;
                  const n = rows === "denied" ? undefined : rows.length;
                  return <li key={qd.label} className="dp-ws-queue" data-severity={qd.severity} data-dp-queue={qd.label}>
                    <span className="dp-ws-sev" aria-hidden />
                    <span className="flex-1">{qd.label}</span>
                    {rows === "denied" ? <span className="text-xs text-muted-foreground">Not Permitted</span>
                      : n === 0 ? <span className="text-xs text-muted-foreground">Nothing pending</span>
                      : href ? <Link to={href.to as never} params={href.params as never} search={href.search as never} className="dp-ws-count" data-no-i18n>{n}</Link> : <span className="dp-ws-count" data-no-i18n>{n}</span>}
                  </li>; })}</ul>
              </section>
              <section className="dp-card dp-ws-flow" aria-labelledby={`f-${d.id}`}>
                <h2 id={`f-${d.id}`} className="dp-ws-h">{d.flow.length ? "Workflow" : "Finance screens"}</h2>
                {d.flow.length ? <ol className="dp-ws-stages">{d.flow.map((s, k) => {
                  const it: NavItem = { label: s.label, target: { kind: "doctype", doctype: s.doctype } };
                  const st = r.state(it); const h = st === "ok" ? targetHref(it.target, r.appOf) : undefined;
                  const cnt = st === "ok" ? scopedList(s.doctype).filter((x) => !ctx.company || x["company"] === undefined || x["company"] === ctx.company).length : undefined;
                  return <li key={s.label} data-dp-stage={s.doctype}>
                    <span className="dp-ws-step" data-no-i18n>{k + 1}</span>
                    {h ? <Link to={h.to as never} params={h.params as never} className="dp-ws-stage">{s.label}</Link> : <span className="dp-ws-stage text-muted-foreground">{s.label}</span>}
                    <span className="text-xs text-muted-foreground">{st === "denied" ? "Not Permitted" : cnt === undefined ? "" : <><span data-no-i18n>{cnt}</span> <span>records</span></>}</span>
                  </li>; })}</ol>
                  : <div className="dp-ws-cards">{[d.home, ...d.groups.flatMap((g) => g.items)].filter((i) => i.target.kind === "pro").filter((i, k, a) => a.findIndex((x) => x.label === i.label) === k).map((i) => { const h = targetHref(i.target, r.appOf)!; return <Link key={i.label} to={h.to as never} search={(h.search ?? {}) as never} className="dp-ws-pcard" data-dp-entry={h.to}><span className="font-semibold"><NavText label={i.label} /></span>{i.hint && <span className="text-xs text-muted-foreground">{i.hint}</span>}</Link>; })}</div>}
              </section>
            </div>}

            {show("dashboard") && <div style={{ order: ord("dashboard") }}><DeptDashboard id={d.id as DashId} company={ctx.company} currency={ctx.currency} period={layout.period ?? 6} />{d.id === "inventory" && <StockValueNotice company={ctx.company} currency={ctx.currency} className="mt-3" />}</div>}
          </div>
        );
      }}
    </ProFrame>
  );
}
