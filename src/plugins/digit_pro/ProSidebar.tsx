// @ts-nocheck -- DIGIT Pro/HR apps are switched off in the merged site build; their original /pro/* and /hr/* app routes are not in this route tree (re-enabling the app needs those routes, then remove this line)
import { sectionBadge } from "./sectionBadges";
import { useStoreVersion } from "@/lib/adapter";
/**
 * DIGIT Pro navigation (NAV-R1): primary rail + contextual sidebar.
 * Rail: Executive, the five departments, then Reports Center, Compliance & Controls, Settings and Help.
 * Contextual sidebar (RXP-NAV-CORRECTIVE-02): ONLY the selected context — pinned Overview, a compact flat list of
 * business SECTION WORKSPACE pages (/pro/$dept/$section; no document leaves, no accordions), pinned
 * "All [Department]" directory — plus the account footer. Context and highlighted page come from the route
 * (navContext.contextOf → nav.resolveLocation): a native document opened from a section keeps that section highlighted.
 * Links are filtered by session permissions (session.ts); absent resources are muted.
 */
import { Link, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { ensureMetas, indexQuery, reportsQuery } from "@/lib/catalog";
import { ADMIN, useSessionUser, userRoles } from "@/lib/session";
import { getSettings, openShellDialog, setSettings, useSettings } from "@/lib/userSettings";
import { useLang } from "@/i18n";
import { defaultCompany } from "@/lib/sessionDefaults";
import { Profiles360NavButton } from "@/components/enterprise/Open360";
import { SECTION_PAGES, CONTEXTS, ctxById, deptById, NAV_AR, NAV_DOCTYPES, PRO_SOURCE_DOCTYPES, RAIL_AR, SERVICE_DOCTYPES, pageBySlug, sectionCorePages, targetHref, type CtxId, type NavContextDef, type NavItem } from "./nav";
import { contextOf, enterContext } from "./navContext";
import { navItemState, type NavState } from "./navAccess";
import { featureEnabled } from "./admin/featureControl";
import { EnterpriseDock } from "@/components/enterprise/EnterpriseDock";
import { appIconFor } from "@/components/enterprise/iconMap";
import { darkArt } from "@/components/enterprise/kit";

const ALL_DOCTYPES = [...new Set([...NAV_DOCTYPES, ...SERVICE_DOCTYPES, ...PRO_SOURCE_DOCTYPES])];
/** Router links announce themselves current on a prefix match ("All Accounting" on every Accounting page); Pro links are
 *  current pages only on their exact address, the selected item keeps aria-current from its own resolved state. */
const EXACT = { exact: true } as const;

/**
 * Set by a rail click to the path it opens, so the phone drawer stays open there to show the chosen context's menu.
 * Path-keyed and non-consuming (dev double effects and per-page Shell remounts read it safely); any other path clears it.
 */
let keepDrawerPath: string | null = null;
export function keepDrawerOn(path: string) { if (keepDrawerPath !== null && keepDrawerPath !== path) keepDrawerPath = null; return keepDrawerPath === path; }

/** Context of the current location (route-aware; shared by the sidebar, breadcrumbs and workspaces). */
export function useProLocation() {
  const loc = useRouterState({ select: (s) => s.location });
  const res = contextOf(loc);
  const ctx = ctxById(res.ctx)!;
  const dept = deptById(res.ctx);
  return { path: loc.pathname, loc, res, ctx, dept, hit: dept ? { dept, item: res.item ?? dept.home } : undefined };
}

/**
 * One request lifecycle for the navigation DocType definitions (DIGIT-CORE-PRO-UX-006, gap G02 diagnosis).
 * useNavResolver() runs in every Pro link (SecLink, ItemLink, directories); when each instance asked the Core loader for
 * all ~210 navigation definitions on mount, dozens of concurrent ensureMetas() calls fetched the same files before any
 * resolved (measured: 2,486 requests for 206 files on a signed-in first load, 608 failed). The load is now started
 * once per page session through the unchanged Core ensureMetas(); every resolver subscribes to its completion.
 */
let navMetaLoad: Promise<void> | null = null;
let navMetaV = 0;
const navMetaSubs = new Set<() => void>();
function loadNavMetas() {
  navMetaLoad ??= ensureMetas(ALL_DOCTYPES).then(() => { navMetaV++; navMetaSubs.forEach((f) => f()); }, () => { navMetaLoad = null; });
  return navMetaLoad;
}
function useNavMetas(): number {
  useEffect(() => { void loadNavMetas(); }, []);
  return useSyncExternalStore((f) => { navMetaSubs.add(f); return () => { navMetaSubs.delete(f); }; }, () => navMetaV, () => 0);
}

/** Resolution + permission state of a navigation item (shared by sidebar, directories and service pages). */
export function useNavResolver() {
  const idx = useQuery(indexQuery); const reps = useQuery(reportsQuery);
  const user = useSessionUser(); const roles = userRoles(user);
  const metaV = useNavMetas();
  const appOf = (n: string) => idx.data?.find((e) => e.name === n)?.app;
  const state = (i: NavItem): NavState => navItemState(i, { user, roles, index: idx.data, reports: reps.data });
  return { appOf, state, user, roles, metaV, index: idx.data, reports: reps.data, ready: !!idx.data && !!reps.data };
}

/** Concrete pathname of a resolved href (params substituted), used to tag the next history entry with its context. */
export function hrefPath(h: { to: string; params?: Record<string, string> }) { return h.to.replace(/\$(\w+)/g, (_, k: string) => h.params?.[k] ?? ""); }

/** Bilingual label: DIGIT Pro's own Arabic wins (rendered untranslated); everything else goes through the shared i18n layer. */
export function NavText({ label, short }: { label: string; short?: boolean }) {
  const ar = useLang() === "ar";
  const own = ar ? (short ? RAIL_AR[label] : undefined) ?? NAV_AR[label] : undefined;
  return own ? <span data-no-i18n>{own}</span> : <span>{label}</span>;
}

export function ProSidebar({ account, onNavigate }: { account?: ReactNode; onNavigate?: () => void }) {
  const { res, ctx, loc } = useProLocation();
  const s = useSettings();
  const collapsed = !s.module_sidebar;
  const [peek, setPeek] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => { setPeek(false); }, [loc.href]);
  useEffect(() => {
    if (!peek) return;
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") { setPeek(false); root.current?.querySelector<HTMLElement>("[data-dp-rail-item][data-active]")?.focus(); } };
    const out = (e: MouseEvent) => { if (root.current && !root.current.contains(e.target as Node)) setPeek(false); };
    document.addEventListener("keydown", key); document.addEventListener("mousedown", out);
    return () => { document.removeEventListener("keydown", key); document.removeEventListener("mousedown", out); };
  }, [peek]);
  const rail = (c: NavContextDef, path: string) => { enterContext(c.id, path); keepDrawerPath = path; if (collapsed) setPeek(true); };
  return (<>
    <div className="dp-drawer-apps" data-dp-drawer-apps><EnterpriseDock variant="grid" onNavigate={() => { keepDrawerPath = null; onNavigate?.(); }} /></div>
    <div ref={root} className="dp-two" data-dp-nav data-dp-ctx={res.ctx} data-dp-peek={peek || undefined} data-dp-collapsed={collapsed || undefined}>
      <ProRail current={res.ctx} onPick={rail} collapsed={collapsed} onToggle={() => setSettings({ module_sidebar: !getSettings().module_sidebar })} />
      <div className="dp-ctx" id="dp-ctx-panel">
        <ContextPanel key={ctx.id} c={ctx} onNavigate={() => { keepDrawerPath = null; setPeek(false); onNavigate?.(); }} />
        {/* owner SH-05: «ملفات 360» is an ordinary entry of the app navigation, as in every other DIGIT app */}
        <div className="dx-ctx-profiles" data-dp-profiles-360><Profiles360NavButton onNavigate={() => { keepDrawerPath = null; setPeek(false); onNavigate?.(); }} /></div>
        <ProAccount account={account} />
      </div>
    </div>
  </>);
}

function ProRail({ current, onPick, collapsed, onToggle }: { current: CtxId; onPick: (c: NavContextDef, path: string) => void; collapsed: boolean; onToggle: () => void }) {
  const ar = useLang() === "ar"; const { user, roles } = useNavResolver();
  const item = (c: NavContextDef) => {
    const h = c.home.target.kind === "pro" ? c.home.target : undefined; const on = c.id === current;
    return <li key={c.id}>
      <Link to={(h?.to ?? "/") as never} search={(h?.search ?? {}) as never} activeOptions={EXACT} onClick={() => onPick(c, h ? hrefPath(h) : "/")} className="dp-rail-item" data-dp-rail-item={c.id} data-active={on || undefined} aria-current={on ? "true" : undefined} aria-controls="dp-ctx-panel" title={ar ? NAV_AR[c.label] ?? c.label : c.label} aria-label={ar ? NAV_AR[c.label] ?? c.label : c.label}>
        <img src={darkArt(c.icon)} alt="" className="dp-rail-icon dp-rail-art" data-dp-rail-art={c.id} draggable={false} />
        <span className="dp-rail-label"><NavText label={c.short} short /></span>
      </Link>
    </li>;
  };
  return (
    <nav className="dp-rail" aria-label="Primary navigation" data-dp-rail>
      <Link to="/pro/home" activeOptions={EXACT} className="dp-rail-brand" aria-label="DIGIT Pro"><img src={appIconFor("digit_pro", "rail")} alt="" /></Link>
      <button type="button" className="dp-rail-item" onClick={() => openShellDialog("global-search")} aria-label="Search" data-dp-rail-search>
        <img src="/icons/digit/ui/digit-ui-search-dark.svg" alt="" className="dp-rail-icon" /><span className="dp-rail-label"><NavText label="Search" short /></span>
      </button>
      <ul className="dp-rail-group" data-dp-rail-primary>{CONTEXTS.filter((c) => c.kind !== "service" && (c.kind !== "department" || featureEnabled(`dept:${c.id}`, { user, roles, company: defaultCompany(user) }))).map(item)}</ul>
      <ul className="dp-rail-group dp-rail-services" aria-label="Shared services" data-dp-services>{CONTEXTS.filter((c) => c.kind === "service").map(item)}</ul>
      {/* shared DIGIT Enterprise collapse control (same user preference as the header ☰ / Ctrl+B and the DIGIT HR rail) */}
      <button type="button" className="dp-rail-item dp-rail-toggle" onClick={onToggle} aria-expanded={!collapsed} aria-controls="dp-ctx-panel" data-nav-collapse
        aria-label={collapsed ? (ar ? "إظهار القائمة السياقية" : "Show the section menu") : (ar ? "إخفاء القائمة السياقية" : "Hide the section menu")} title={collapsed ? (ar ? "إظهار القائمة السياقية" : "Show the section menu") : (ar ? "إخفاء القائمة السياقية" : "Hide the section menu")}>
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="rtl:-scale-x-100" aria-hidden><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M9 3v18" />{collapsed ? <path d="m14 9 3 3-3 3" /> : <path d="m16 15-3-3 3-3" />}</svg>
      </button>
    </nav>
  );
}

function ContextPanel({ c, onNavigate }: { c: NavContextDef; onNavigate: () => void }) {
  const { res } = useProLocation();
  const r = useNavResolver();
  const ar = useLang() === "ar";
  const d = deptById(c.id);
  const links = c.links.filter((i) => r.state(i) !== "denied");
  const dirCount = d ? new Set(d.groups.flatMap((g) => g.items).filter((i) => i.target.kind !== "missing" && r.state(i) === "ok").map((i) => `${i.label}|${JSON.stringify(i.target)}`)).size : 0;
  const leaf = (i: NavItem, k: string, cls = "dp-nav-item", page0?: string) => {
    const t = i.target; const on = res.item === i || (cls.includes("dp-nav-sub") && res.leaf === i);
    if (t.kind === "dialog") return <button key={k} type="button" className={cls} onClick={() => openShellDialog(t.dialog)} data-dp-item={i.label}><NavText label={i.label} /></button>;
    const st = r.state(i); const h = st === "unavailable" ? undefined : targetHref(t, r.appOf);
    if (!h) return <div key={k} className={`${cls} dp-nav-muted`} data-dp-unavailable={i.label} title={t.kind === "missing" ? t.reason : undefined}><NavText label={i.label} /> <span className="dp-nav-tag"><NavText label="Unavailable" /></span></div>;
    const page = t.kind === "section" ? t.section : undefined;
    return <Link key={k} to={h.to as never} params={h.params as never} search={(h.search ?? {}) as never} activeOptions={EXACT} onClick={() => { enterContext(i.enter ?? c.id, hrefPath(h), page ?? page0); onNavigate(); }}
      className={`${cls} ${on ? "dp-nav-on" : ""}`} aria-current={on ? "page" : undefined} data-dp-item={i.label} data-dp-kind={t.kind} {...(page ? { "data-dp-section-link": page } : {})} {...(i.hint ? { title: ar ? NAV_AR[i.hint] ?? i.hint : i.hint } : {})}>
      <span className="dp-nav-text"><NavText label={i.label} /></span>
      {page && <SectionBadgeChip slug={page} dept={t.kind === "section" ? t.dept : ""} />}
    </Link>;
  };
  return (
    <div className="dp-ctx-body" data-dp-ctx-panel={c.id} aria-label={ar ? NAV_AR[c.label] ?? c.label : c.label} role="navigation">
      <header className="dp-ctx-head">
        <img src={c.icon} alt="" className="h-6 w-6" />
        <h2 className="dp-ctx-title" data-dp-ctx-title><NavText label={c.label} /></h2>
      </header>
      <div className="dp-ctx-scroll">
        <div className="dp-ctx-pin" data-dp-home>{leaf(c.home, "home", "dp-nav-item dp-nav-pin")}</div>
        {links.length === 0 && c.links.length > 0 && <p className="dp-nav-muted px-3 py-2 text-xs" data-dp-no-items><NavText label="No permitted items" /></p>}
        {links.length > 0 && <div className="dp-ctx-links" data-dp-links>{links.map((i, k) => {
          // a section's own shared Core pages (bank matching, invoice capture …) sit right under it: rail → page in two clicks
          const pg = i.target.kind === "section" ? pageBySlug(i.target.dept, i.target.section) : undefined;
          const subs = pg ? sectionCorePages(pg).filter((x) => r.state(x) !== "denied") : [];
          return <div key={`l-${k}`} className="contents">{leaf(i, `l-${k}`, "dp-nav-item dp-nav-link")}
            {subs.length > 0 && <div className="dp-nav-subs" data-dp-subs={pg!.slug}>{subs.map((x, j) => leaf(x, `s-${k}-${j}`, "dp-nav-item dp-nav-sub", pg!.slug))}</div>}</div>;
        })}</div>}
        {c.all && <div className="dp-ctx-pin dp-ctx-all" data-dp-all>{leaf(c.all, "all", "dp-nav-item dp-nav-pin")}{dirCount > 0 && <span className="dp-all-count" data-no-i18n aria-hidden>{dirCount}</span>}</div>}
      </div>
    </div>
  );
}

/** Account footer: current company and role (display only), personal preferences, page layout, admin shortcuts; the Core user menu below keeps Switch User / Logout. */
function ProAccount({ account }: { account?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const s = useSettings();
  const { appOf, state, user, roles } = useNavResolver();
  const company = defaultCompany(user); // shared Session Defaults resolver (session → Global Defaults → User Permission)
  const role = user === ADMIN ? "Administrator" : roles.filter((x) => !["All", "Guest", "Desk User"].includes(x)).join(", ") || "—";
  const links: NavItem[] = [
    { label: "Company Defaults", target: { kind: "doctype", doctype: "Global Defaults" } },
    { label: "Users & Permissions", target: { kind: "doctype", doctype: "User" }, roles: ["System Manager"] },
  ];
  return (
    <div className="dp-acct" data-dp-utility>
      {open && <div id="dp-acct-body" className="dp-acct-body" data-dp-context>
        <div className="dp-nav-context-row"><span className="dp-acct-k"><NavText label="Company" /></span><span className="truncate" data-no-i18n>{company}</span></div>
        <div className="dp-nav-context-row"><span className="dp-acct-k"><NavText label="Role" /></span><span className="truncate" data-no-i18n>{role}</span></div>
        <div className="dp-acct-actions">
          <button type="button" className="dp-acct-btn" onClick={() => openShellDialog("settings", "Profile")} data-dp-item="Profile"><NavText label="Profile" /></button>
          <button type="button" className="dp-acct-btn" onClick={() => openShellDialog("settings")} data-dp-item="My Preferences"><NavText label="My Preferences" /></button>
        </div>
        <div className="dp-acct-seg" role="radiogroup" aria-label="Display width" data-dp-width>
          <span className="dp-acct-k"><NavText label="Display width" /></span>
          {(["Full Width", "Compact"] as const).map((v) => <button key={v} type="button" role="radio" aria-checked={s.layout === v} className="dp-acct-opt" onClick={() => setSettings({ layout: v })} data-dp-width-opt={v}><span>{v}</span></button>)}
        </div>
        <div className="dp-acct-actions">{links.map((i) => {
          if (state(i) === "denied") return null;
          const h = state(i) === "unavailable" ? undefined : targetHref(i.target, appOf);
          if (!h) return null;
          return <Link key={i.label} to={h.to as never} params={h.params as never} className="dp-acct-btn" data-dp-item={i.label}><NavText label={i.label} /></Link>;
        })}</div>
      </div>}
      <button type="button" className="dp-acct-toggle" aria-expanded={open} aria-controls="dp-acct-body" onClick={() => setOpen(!open)} data-dp-acct-toggle>
        <span className="min-w-0 flex-1 text-start"><span className="block text-[11px] opacity-70"><NavText label="Account & preferences" /></span><span className="block truncate" data-no-i18n>{company}</span></span>
        <img src="/icons/digit/ui/digit-ui-chevron-dark.svg" alt="" className={`dp-chev ${open ? "dp-chev-up" : ""}`} />
      </button>
      {account && <div className="dp-acct-user">{account}</div>}
    </div>
  );
}

function SectionBadgeChip({ slug, dept }: { slug: string; dept: string }) {
  useStoreVersion(); const user = useSessionUser(); const ar = useLang() === "ar";
  const pg = SECTION_PAGES.find((p) => p.slug === slug && p.dept === dept); const b = pg ? sectionBadge(pg.id, user) : null;
  if (!b) return null;
  return <span className="dp-nav-badge" data-dp-badge={b.count} data-severity={b.severity} title={ar ? b.label[1] : b.label[0]} data-no-i18n>{b.count > 99 ? "99+" : b.count}</span>;
}
