/**
 * DIGIT Pro placement of shared Core pages (experience slot `corePage`, owner 2026-11-13): every ServiceRoute screen the
 * Pro navigation lists (department sections, Reports / Settings / Help) opens inside Pro — Pro sidebar, band eyebrow
 * "DIGIT Pro · department · section" and the section's sibling screens as tabs directly under the band. Placement, labels
 * and tabs come only from nav.ts, the same manifest the sidebar and breadcrumbs read, so the page never shows the Desk menu.
 */
import { Link } from "@tanstack/react-router";
import { useLang } from "@/i18n";
import { CONTEXTS, SERVICES, DEPARTMENTS, pageItems, targetHref, type NavItem } from "./nav";
import { enterContext } from "./navContext";
import { hrefPath, NavText, useNavResolver, useProLocation } from "./ProSidebar";

const clean = (p: string) => p.replace(/[?#].*$/, "").replace(/(.)\/$/, "$1");
const corePathsOf = (items: NavItem[]) => items.flatMap((i) => (i.target.kind === "core" ? [i.target.to as string] : []));
const CORE_PATHS = new Set<string>([
  ...CONTEXTS.flatMap((c) => corePathsOf([c.home, ...c.links, ...c.sections.flatMap((s) => s.items)])),
  ...SERVICES.flatMap((s) => corePathsOf(s.groups.flatMap((g) => g.items))),
  ...DEPARTMENTS.flatMap((d) => corePathsOf(d.extra.flatMap((g) => g.items))),
]);
/** The Pro navigation lists this shared Core page. */
export const placesCorePage = (path: string) => CORE_PATHS.has(clean(path));

/** Screens only (Pro pages and shared Core pages), never native document lists or worklist variants. */
const isScreen = (i: NavItem) => i.target.kind === "core" || (i.target.kind === "pro" && !i.target.search);

export function CorePageEyebrow() {
  const { ctx, res } = useProLocation(); const ar = useLang() === "ar";
  return <span data-dp-core-eyebrow={ctx.id}><span data-no-i18n>{ar ? "ديجيت برو" : "DIGIT Pro"}</span><span aria-hidden> · </span><NavText label={ctx.label} />
    {res.page && <><span aria-hidden> · </span><NavText label={res.page.label} /></>}</span>;
}

/** The section's sibling screens (department) or the service's own pages, as tabs directly under the band. */
export function CorePageTabs() {
  const { ctx, res, path } = useProLocation(); const r = useNavResolver(); const ar = useLang() === "ar";
  const items: NavItem[] = res.page ? [res.page.link, ...pageItems(res.page).filter(isScreen)] : [ctx.home, ...ctx.links.filter(isScreen)];
  const seen = new Set<string>();
  const tabs = items.flatMap((i) => {
    if (r.state(i) === "denied") return [];
    const h = r.state(i) === "unavailable" ? undefined : targetHref(i.target, r.appOf); if (!h) return [];
    const href = hrefPath(h); if (seen.has(href)) return []; seen.add(href);
    return [{ i, h, href }];
  });
  if (tabs.length < 2) return null;
  return <nav className="dp-tabs" aria-label={ar ? "صفحات القسم" : "Section pages"} data-dp-section-tabs data-core-page-tabs={ctx.id}>
    {tabs.map(({ i, h, href }) => { const on = clean(href) === clean(path);
      return <Link key={href} to={h.to as never} params={h.params as never} search={(h.search ?? {}) as never} onClick={() => enterContext(ctx.id, href, res.page?.slug)}
        className={on ? "dp-tab dp-tab-active" : "dp-tab"} aria-current={on ? "page" : undefined} data-dp-tab={href}><NavText label={i.label} /></Link>; })}
  </nav>;
}
