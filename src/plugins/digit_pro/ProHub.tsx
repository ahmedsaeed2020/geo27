// @ts-nocheck -- DIGIT Pro/HR apps are switched off in the merged site build; their original /pro/* and /hr/* app routes are not in this route tree (re-enabling the app needs those routes, then remove this line)
/**
 * DIGIT Pro Documents & work hub — binds the Core native document hub (src/components/hub/DocumentHub.tsx) to a Pro
 * section workspace: entries from hubs.ts (workspace navigation + native Workspace cards + department setup), quick
 * counters evaluated with the section KPI engine (evalKpi), Pro permission states (useNavResolver) and Pro links that
 * record the section as the destination's context, so breadcrumbs, the highlighted page and Back return here with the
 * same hub state (hub_* URL keys).
 */
import { childParents, reverseLinksQuery } from "@/lib/relations";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { adapter } from "@/lib/adapter";
import { indexQuery, reportsQuery, workspacesQuery } from "@/lib/catalog";
import { buildHub, customReportEntries, makeHubIndex, treeViewsQuery, type HubEntry } from "@/lib/hub";
import { canReadType } from "@/lib/scope";
import { DocumentHub, type HubLink, type HubState, type QuickTile } from "@/components/hub/DocumentHub";
import { enterContext } from "./navContext";
import { slug, type NavItem, type ProRoute, type SectionPage } from "./nav";
import { HUBS, hubEntries } from "./hubs";
import { placementIds } from "./run11";
import { evalKpi, type SectionCtx } from "./sections";
import { can } from "./finance";
import { NavText, useNavResolver } from "./ProSidebar";
import type { SectionSearch } from "./SectionLink";
import { piApprovals } from "./piApprovals";

/** Generated ledger rows are never created by hand (placement contract: "generated/ledger entries never free-created"). */
const LEDGERS = new Set(["GL Entry", "Stock Ledger Entry", "Payment Ledger Entry"]);

const toNavItem = (e: HubEntry): NavItem | null => {
  const t = e.target;
  if (t.kind === "doctype") return { label: e.label, target: { kind: "doctype", doctype: t.doctype, ...(t.filters ? { filters: t.filters as [string, string, string][] } : {}) } };
  if (t.kind === "tree") return { label: e.label, target: { kind: "tree", doctype: t.doctype } };
  if (t.kind === "report") return { label: e.label, target: { kind: "report", report: t.report } };
  if (t.kind === "page") return { label: e.label, target: { kind: "page", page: t.page } };
  try { const a = JSON.parse(t.key) as { to: ProRoute; search?: Record<string, string> }; return { label: e.label, target: { kind: "pro", to: a.to, ...(a.search && Object.keys(a.search).length ? { search: a.search } : {}) } }; } catch { return null; }
};

export function ProDocumentHub({ page, ctx, user, ar, search, afterQuick }: { page: SectionPage; ctx: SectionCtx; user: string; ar: boolean; search: SectionSearch; afterQuick?: ReactNode }) {
  const nav = useNavigate();
  const idx = useQuery(indexQuery); const reps = useQuery(reportsQuery); const wsq = useQuery(workspacesQuery); const trees = useQuery(treeViewsQuery); const rev = useQuery(reverseLinksQuery);
  const r = useNavResolver();
  const hub = HUBS[page.id];
  if (!hub) return <>{afterQuick}</>;
  if (!idx.data || !reps.data || !wsq.data || !trees.data) return <><p className="text-sm text-muted-foreground" role="status" data-hub-loading>{ar ? "جارٍ تحميل مستندات مساحة العمل…" : "Loading workspace documents…"}</p>{afterQuick}</>;
  const appOf = (dt: string) => idx.data!.find((e) => e.name === dt)?.app;
  const ix = makeHubIndex(idx.data, reps.data, trees.data, { childList: (c) => childParents(c, rev.data?.doctypes).length > 0 });
  const base = hubEntries(page, hub, wsq.data);
  const first = buildHub(base, ix);
  const custom = customReportEntries(first.doctypes, base.flatMap((e) => (e.target.kind === "report" ? [e.target.report] : [])));
  const model = custom.length ? buildHub([...base, ...custom], ix) : first;

  const quick: QuickTile[] = hub.quick(ctx).map((k) => {
    const res = evalKpi(k, ctx, user);
    const status = res.status === "denied" || res.status === "unavailable" ? res.status : res.count ? "ok" : "empty";
    return { id: k.id, label: k.label, hint: k.hint, doctype: k.doctype, status, count: res.count, filters: k.filters, tone: k.tone, canCreate: status !== "denied" && status !== "unavailable" && can(k.doctype, "create", undefined, user) && !!appOf(k.doctype) };
  });

  const access = (e: HubEntry) => {
    // a saved custom report is readable when its reference DocType is (Report records carry no role list of their own here)
    if (e.group === "custom-reports" && e.target.kind === "report") { const ref = String(adapter.get("Report", e.target.report)?.["ref_doctype"] ?? ""); return !ref || canReadType(ref, user) ? "ok" as const : "denied" as const; }
    const ni = toNavItem(e); if (!ni) return "unavailable" as const;
    return r.state(ni);
  };
  const state: HubState = { dt: search.hub_dt, q: search.hub_q, st: search.hub_st, doc: search.hub_doc };
  const onState = (p: Partial<HubState>) => void nav({
    to: "/pro/$dept/$section", params: { dept: page.dept, section: page.slug }, replace: true, resetScroll: false,
    search: ((prev: SectionSearch) => {
      const next: SectionSearch = { ...prev };
      if ("dt" in p) next.hub_dt = p.dt; if ("q" in p) next.hub_q = p.q; if ("st" in p) next.hub_st = p.st; if ("doc" in p) next.hub_doc = p.doc;
      return next;
    }) as never,
  });
  const go = (path: string) => enterContext(page.dept, path, page.slug);
  const link = (to: HubLink, children: ReactNode, attrs: Record<string, string> = {}) => {
    if (to.kind === "list" || to.kind === "new" || to.kind === "doc") {
      const app = appOf(to.doctype) ?? "erpnext"; const s = slug(to.doctype);
      if (to.kind === "list") {
        const sp: Record<string, string> = {}; if (to.filters?.length) sp["filters"] = JSON.stringify(to.filters); if (to.view) sp["view"] = to.view;
        return <Link to="/app/$app/$doctype" params={{ app, doctype: s }} search={sp as never} onClick={() => go(`/app/${app}/${s}`)} {...attrs}>{children}</Link>;
      }
      const name = to.kind === "new" ? "new" : to.name;
      return <Link to="/app/$app/$doctype/$name" params={{ app, doctype: s, name }} onClick={() => go(`/app/${app}/${s}/${name}`)} {...attrs}>{children}</Link>;
    }
    if (to.kind === "report") return <Link to="/report/$name" params={{ name: to.report }} search={{ company: ctx.company } as never} onClick={() => go(`/report/${to.report}`)} {...attrs}>{children}</Link>;
    if (to.kind === "page") return <Link to="/page/$name" params={{ name: to.page }} onClick={() => go(`/page/${to.page}`)} {...attrs}>{children}</Link>;
    if (to.kind === "print") return <Link to="/printview" search={{ doctype: to.doctype, name: to.name } as never} onClick={() => go("/printview")} {...attrs}>{children}</Link>;
    try { const a = JSON.parse(to.key) as { to: string; search?: Record<string, string> }; return <Link to={a.to as never} search={({ company: ctx.company, ...(a.search ?? {}) }) as never} onClick={() => go(a.to)} {...attrs}>{children}</Link>; } catch { return <span {...attrs}>{children}</span>; }
  };
  const reportsLink = <Link to="/pro/$dept/$section" params={{ dept: page.dept, section: page.slug }} search={((prev: SectionSearch) => ({ ...prev, tab: "reports" })) as never} className="text-primary hover:underline" data-hub-goto-reports>{ar ? "كل تقارير مساحة العمل ←" : "All reports of this workspace →"}</Link>;
  return (
    <DocumentHub ar={ar} model={model} quick={quick} registers={hub.registers.filter((d) => !!appOf(d))} company={ctx.company} user={user}
      state={state} onState={onState} link={link} access={access}
      canCreate={(dt) => !LEDGERS.has(dt) && !!appOf(dt) && can(dt, "create", undefined, user) && (user === "Administrator" || canReadType(dt, user))}
      label={(t) => <NavText label={t} />} reportsLink={reportsLink} afterQuick={afterQuick} approvals={piApprovals(ar, user)}
      entryTag={(e) => (e.target.kind === "doctype" && !e.target.filters) || e.target.kind === "tree" ? placementIds(page.id, `hub:${e.target.doctype}`) : undefined} />
  );
}
