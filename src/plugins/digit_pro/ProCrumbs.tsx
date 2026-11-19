// @ts-nocheck -- DIGIT Pro/HR apps are switched off in the merged site build; their original /pro/* and /hr/* app routes are not in this route tree (re-enabling the app needs those routes, then remove this line)
/**
 * DIGIT Pro breadcrumbs + source-aware Back: DIGIT Pro / Context / Section workspace (linked) / DocType / Document.
 * The context, section and highlighted item come from the same route resolver as the sidebar (useProLocation), so the
 * heading, menu and breadcrumb can never disagree. When the document's canonical owner differs from the working
 * context (e.g. a Sales Invoice opened from Accounting › Receivables) an "Owner" chip names it.
 * Back returns to the page this entry was opened from (same filters, sort, rows; browser Back when it is the previous
 * entry, so scroll is restored), else to the canonical parent for direct deep links. Logic in ./navContext.ts.
 */
import { Link, useRouter } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";
import { indexQuery } from "@/lib/catalog";
import { deptById } from "./nav";
import { areaOf, canonicalParent, classify, enterContext, entryKey, labelOf, originOf, recordOrigins, type Origin } from "./navContext";
import { NavText, useProLocation } from "./ProSidebar";
import { isHomeCandidate, setPinnedHome, usePinnedHome } from "./roleHome";
import { useSessionUser } from "@/lib/session";

let originsOn = false;
/** Install the per-history-entry origin + context recorder once (works in Standard Desk too, so context exists when switching). */
export function useOriginRecorder() {
  const router = useRouter();
  useEffect(() => { if (!originsOn) { originsOn = true; recordOrigins(router); } }, [router]);
}

export function ProCrumbs({ crumbs }: { crumbs: { label: string; to?: ReactNode }[] }) {
  const { res, ctx, loc } = useProLocation();
  const router = useRouter();
  const idx = useQuery(indexQuery);
  const [origin, setOrigin] = useState<Origin | undefined>(undefined);
  const [rtl, setRtl] = useState(false);
  useEffect(() => {
    setRtl(document.documentElement.dir === "rtl");
    setOrigin(originOf(loc)); const t = setTimeout(() => setOrigin(originOf(router.state.location)), 0); return () => clearTimeout(t);
  }, [loc.href, entryKey(loc)]); // eslint-disable-line react-hooks/exhaustive-deps
  const dtName = (slug: string) => idx.data?.find((e) => e.slug === slug)?.name ?? slug.replace(/_/g, " ");
  const c = classify(loc.pathname);
  const oc = origin ? classify(origin.path) : undefined;
  // Business section workspace that hosts this location (linked, so a native document always leads back to its section page).
  const page = res.page;
  const area = page ? undefined : res.where === "section" ? ctx.sections.find((s) => s.id === res.section)?.label : res.where ? undefined : areaOf(ctx.id, loc.pathname, loc.search as Record<string, unknown>);
  const go = (href: string, index: number) => { const cur = (router.state.location.state as { __TSR_index?: number } | undefined)?.__TSR_index ?? 0; if (index === cur - 1) router.history.back(); else void router.navigate({ href }); };
  const home = ctx.home.target.kind === "pro" ? ctx.home.target : undefined;
  const owner = res.owner && (c.kind === "form" || c.kind === "list") ? deptById(res.owner) : undefined;

  const all: ReactNode[] = [<Link key="app" to="/pro/home" className="hover:underline" data-dp-crumb-home>DIGIT Pro</Link>];
  if (res.where === "home" || !home) all.push(<span key="ctx" data-dp-crumb-ctx={ctx.id}><NavText label={ctx.label} /></span>);
  else all.push(<Link key="ctx" to={home.to as never} search={(home.search ?? {}) as never} className="hover:underline" data-dp-crumb-ctx={ctx.id} data-dp-crumb-dept={ctx.kind === "department" ? ctx.id : undefined}><NavText label={ctx.label} /></Link>);
  if (c.kind === "dept") all.push(<span key="all"><NavText label={deptById(c.id)?.all.label ?? ""} /></span>);
  else if (c.kind === "section" && page) all.push(<span key="page" data-dp-crumb-area data-dp-crumb-section={page.id}><NavText label={page.label} /></span>);
  else if (page) all.push(<Link key="page" to="/pro/$dept/$section" params={{ dept: page.dept, section: page.slug }} className="hover:underline" data-dp-crumb-area data-dp-crumb-section={page.id} onClick={() => enterContext(page.dept, `/pro/${page.dept}/${page.slug}`, page.slug)}><NavText label={page.label} /></Link>);
  else if (area) all.push(<span key="area" data-dp-crumb-area><NavText label={area} /></span>);
  if (c.kind === "dept" || c.kind === "section") { /* the directory / section label is already the last crumb */ }
  else if (c.kind === "form") {
    const fromList = oc?.kind === "list" && oc.slug === c.slug ? origin : undefined;
    all.push(fromList ? <a key="dt" href={fromList.href} onClick={(e) => { e.preventDefault(); go(fromList.href, fromList.index); }} className="hover:underline" data-dp-crumb-list>{dtName(c.slug)}</a>
      : <Link key="dt" to="/app/$app/$doctype" params={{ app: c.app, doctype: c.slug }} className="hover:underline" data-dp-crumb-list>{dtName(c.slug)}</Link>);
    all.push(<bdi key="doc" data-no-i18n data-dp-crumb-doc>{decodeURIComponent(c.name)}</bdi>);
  } else if (c.kind === "list") { const lf = res.leaf ?? res.item; all.push(<span key="dt">{res.where === "section" && lf?.target.kind === "doctype" && lf.target.filters ? <NavText label={lf.label} /> : dtName(c.slug)}</span>); }
  else if (c.kind === "report" && (res.leaf ?? res.item)?.target.kind !== "core") all.push(<span key="lbl">{labelOf(loc.pathname, dtName)}</span>);
  else if (c.kind === "pro") { const lf = res.leaf ?? res.item; all.push(<span key="lbl"><NavText label={lf && res.where !== "all" && res.where !== "directory" && lf.label !== page?.label ? lf.label : labelOf(loc.pathname, dtName)} /></span>); }
  // a shared Core page the Pro menu places (bank matching, query studio …): its menu label is the last crumb
  else if ((res.leaf ?? res.item)?.target.kind === "core") { const lf = (res.leaf ?? res.item)!; if (lf.label !== page?.label) all.push(<span key="lbl" data-dp-crumb-core><NavText label={lf.label} /></span>); }
  else crumbs.slice(1).filter((x) => x.label !== "DIGIT Pro").forEach((x, i) => all.push(<span key={`c${i}`}>{x.to ?? x.label}</span>));

  const fallback = origin ? undefined : canonicalParent(loc.pathname, ctx.id);
  const arrow = <span aria-hidden>{rtl ? "→" : "←"}</span>;
  const back = origin
    ? <a href={origin.href} className="btn-ghost ms-auto py-0.5 text-xs" data-dp-back={origin.path} onClick={(e) => { e.preventDefault(); go(origin.href, origin.index); }}>
        {arrow} <span>Back to</span> {oc?.kind === "form" ? <span data-no-i18n>{labelOf(origin.path, dtName)}</span> : oc?.kind === "pro" || oc?.kind === "dept" || oc?.kind === "section" ? <NavText label={labelOf(origin.path, dtName)} /> : <span>{labelOf(origin.path, dtName)}</span>}</a>
    : fallback ? <Link to={fallback.to as never} params={fallback.params as never} className="btn-ghost ms-auto py-0.5 text-xs" data-dp-back={fallback.path}>{arrow} <span>Back to</span> <NavText label={labelOf(fallback.path, dtName)} /></Link>
    : null;
  return <nav aria-label="Breadcrumb" data-dp-crumbs className="flex flex-wrap items-center gap-2 px-6 pt-4 text-sm text-muted-foreground">
    {all.map((n, i) => <span key={i} className="flex gap-2">{i > 0 && <span aria-hidden>/</span>}{n}</span>)}
    {owner && <span className="chip bg-muted text-[11px]" data-dp-crumb-owner={owner.id}><NavText label="Owner" />: <NavText label={owner.label} /></span>}
    {back}
    {isHomeCandidate(loc.pathname) && <PinHome path={loc.pathname.replace(/\/$/, "")} rtl={rtl} pushEnd={!back} />}
  </nav>;
}

/** M-13 personal pinned home: pins this page as where "DIGIT Pro" opens for the session user (page path only). */
function PinHome({ path, rtl, pushEnd }: { path: string; rtl: boolean; pushEnd: boolean }) {
  const user = useSessionUser();
  const pinned = usePinnedHome(user) === path;
  const label = pinned ? (rtl ? "صفحتي الرئيسية" : "My home") : (rtl ? "اجعلها صفحتي الرئيسية" : "Make this my home");
  return <button type="button" className={`btn-ghost py-0.5 text-xs ${pushEnd ? "ms-auto" : ""}`} aria-pressed={pinned} data-dp-pin-home={pinned ? "on" : "off"} data-no-i18n
    title={pinned ? (rtl ? "إلغاء التثبيت — تعود الصفحة الرئيسية حسب دورك" : "Unpin — your home follows your role again") : undefined}
    onClick={() => setPinnedHome(user, pinned ? undefined : path)}><span aria-hidden>{pinned ? "★" : "☆"}</span> {label}</button>;
}

