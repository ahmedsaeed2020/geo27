import { Link, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { DESK_PAGES } from "@/components/pages/registry";
import { indexQuery, reportsQuery, type IndexEntry } from "@/lib/catalog";
import { moduleSidebarsQuery, type SidebarItem } from "@/lib/desk";
import { adapter } from "@/lib/adapter";
import { itemTargets, setCurrentShell, shellForEntity, type EntityKind } from "@/lib/moduleShell";

export interface ActiveEntity { kind: EntityKind | "Workspace"; name: string }

/**
 * One module sidebar (frappe desk sidebar.js): collapsible sections (keep_closed starts closed), the section holding
 * the active entity starts open, and every link resolves to its Desk route. Used by /desk/$sidebar and by list, form
 * and report pages through ContextModuleSidebar, so a user who opens a report from Accounting stays in Accounting.
 */
export function ModuleSidebarNav({ sb, sidebar, title, active, open }: { sb: SidebarItem[]; sidebar: string; title: string; active?: ActiveEntity | undefined; open?: string | undefined }) {
  const reps = useQuery(reportsQuery);
  const idx = useQuery(indexQuery);
  const dt = (n?: string): IndexEntry | undefined => idx.data?.find((d) => d.name === n);
  const activeSection = useMemo(() => {
    if (!active) return undefined;
    let cur: string | undefined;
    for (const i of sb) {
      if (i.type === "Section Break") { cur = i.label; continue; }
      if (!i.child && !i.indent) cur = undefined;
      if (active.kind === "Workspace" ? i.link_type === "Workspace" && i.link_to === active.name : itemTargets(i, active.kind, active.name)) return cur;
    }
    return undefined;
  }, [sb, active]);
  const initial = () => Object.fromEntries(sb.filter((i) => i.type === "Section Break" && i.label).map((i) => [i.label, !!i.keep_closed && i.label !== open && i.label !== activeSection]));
  const [closed, setClosed] = useState<Record<string, boolean>>(initial);
  // a different entity in a closed section opens that section (frappe sidebar highlight_active_item)
  useEffect(() => { if (activeSection) setClosed((c) => (c[activeSection] ? { ...c, [activeSection]: false } : c)); }, [activeSection]);
  const isActive = (i: SidebarItem) => !!active && (active.kind === "Workspace" ? i.link_type === "Workspace" && i.link_to === active.name : itemTargets(i, active.kind, active.name));
  let cur: string | undefined;
  return (
    <nav className="space-y-0.5 text-sm" data-module-sidebar={sidebar}>
      <Link to="/desk/$sidebar" params={{ sidebar }} className="mb-2 block truncate rounded px-2 font-semibold hover:bg-muted" data-module-sidebar-title>{title}</Link>
      {sb.map((i, k) => {
        if (i.type === "Section Break") cur = i.label;
        else if (!i.child && !i.indent) cur = undefined;
        if (i.type !== "Section Break" && cur && closed[cur]) return null;
        if (i.type === "Spacer") return <div key={k} className="h-3" />;
        const pad = { paddingInlineStart: `${0.5 + (i.indent || i.child ? 0.75 : 0)}rem` };
        const on = isActive(i);
        const cls = `block truncate rounded py-1 pe-2 hover:bg-muted ${on ? "bg-accent font-medium text-accent-foreground" : ""}`;
        const aria = on ? { "aria-current": "page" as const } : {};
        if (i.type === "Section Break") {
          const l = i.label!;
          return <button key={k} type="button" data-section={l} aria-expanded={!closed[l]} onClick={() => i.collapsible !== 0 && setClosed((c) => ({ ...c, [l]: !c[l] }))} className="flex w-full items-center justify-between px-2 pt-3 text-start text-[11px] font-semibold uppercase text-muted-foreground"><span>{l}</span>{i.collapsible !== 0 && <span aria-hidden>{closed[l] ? "▸" : "▾"}</span>}</button>;
        }
        if (i.link_type === "URL" && i.url) return <a key={k} href={i.url} style={pad} className={cls}>{i.label}</a>;
        if (i.link_type === "Workspace") return <Link key={k} to="/desk/$sidebar" params={{ sidebar }} search={{ ws: i.link_to! }} style={pad} className={cls} {...aria}>{i.label}</Link>;
        if (i.link_type === "DocType" && dt(i.link_to)) { const e = dt(i.link_to)!; return <Link key={k} to="/app/$app/$doctype" params={{ app: e.app, doctype: e.slug }} style={pad} className={cls} {...aria} data-sidebar-doctype={e.name}>{i.label}</Link>; }
        if (i.link_type === "Page" && i.link_to && DESK_PAGES[i.link_to]) return <Link key={k} to="/page/$name" params={{ name: i.link_to }} style={pad} className={cls} {...aria}>{i.label}</Link>;
        if (i.link_type === "Report" && reps.data?.some((r) => r.name === i.link_to)) return <Link key={k} to="/report/$name" params={{ name: i.link_to! }} style={pad} className={cls} {...aria} data-sidebar-report={i.link_to}>{i.label}</Link>;
        if (i.link_type === "Dashboard" && i.link_to) return <Link key={k} to="/dashboard/$name" params={{ name: i.link_to }} style={pad} className={cls} {...aria}>{i.label}</Link>;
        return <div key={k} style={pad} className={`${cls} text-muted-foreground`} title={`${i.link_type ?? i.type} ${i.link_to ?? ""} — target not resolved in preview`}>{i.label}</div>;
      })}
    </nav>
  );
}

/** The entity a Desk route shows: /report/<name> (Custom Reports resolve to their reference report) and /app/<app>/<doctype>/… */
export function routeEntity(path: string, index: IndexEntry[] | undefined): { kind: EntityKind; name: string; module?: string; app?: string } | null {
  const seg = path.split("/").filter(Boolean).map((s) => { try { return decodeURIComponent(s); } catch { return s; } });
  if (seg[0] === "report" && seg[1]) {
    const custom = adapter.get("Report", seg[1]);
    const base = custom && custom["report_type"] === "Custom Report" && custom["reference_report"] ? String(custom["reference_report"]) : seg[1];
    return { kind: "Report", name: base };
  }
  if (seg[0] === "app" && seg[1] && seg[2]) {
    const e = index?.find((d) => d.app === seg[1] && d.slug === seg[2]);
    return e ? { kind: "DocType", name: e.name, module: e.module, app: e.app } : null;
  }
  if (seg[0] === "page" && seg[1]) return { kind: "Page", name: seg[1] };
  if (seg[0] === "dashboard" && seg[1]) return { kind: "Dashboard", name: seg[1] };
  return null;
}

/** Shell fallback sidebar: the module sidebar for the route's entity (shell_for_route), else `fallback`. */
export function ContextModuleSidebar({ fallback }: { fallback: ReactNode }) {
  const path = useRouterState({ select: (r) => r.location.pathname });
  const msb = useQuery(moduleSidebarsQuery);
  const idx = useQuery(indexQuery);
  const reps = useQuery(reportsQuery);
  const ent = routeEntity(path, idx.data);
  const rep = ent?.kind === "Report" ? reps.data?.find((r) => r.name === ent.name) : undefined;
  const sb = ent && msb.data ? shellForEntity(msb.data, ent.kind, ent.name, rep?.module ?? ent.module, rep?.app ?? ent.app) : undefined;
  useEffect(() => { if (sb) setCurrentShell(sb.name); }, [sb]);
  if (!sb || !ent) return <>{fallback}</>;
  return <ModuleSidebarNav key={`${sb.name}:${ent.kind}:${ent.name}`} sb={sb.items} sidebar={sb.name} title={sb.title} active={ent} />;
}
