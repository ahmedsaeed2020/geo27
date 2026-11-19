/**
 * Module rail navigation for apps that declare manifest `navigation` (theme.module_rail), e.g. DIGIT Construction.
 * PES V1 three-level layout inside the enterprise shell: App Dock (Shell) → green Module Rail (the app's own modules,
 * official icons + short labels) → green Contextual Sidebar (the selected module's frequent sections and its "All
 * <module>" directory) → workspace. Phones: one drawer with the dock apps, the rail and the sections.
 * Presentation only: every manifest navigation item stays reachable (frequent section or module directory), routes are
 * the app's own (/plugins/<app>/…, native /app/… lists and forms) and nothing is stored except the selected module
 * (session) and the shared "module sidebar" user preference.
 */
import { publicHref } from "@/lib/appUrls";
import { Link, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useSyncExternalStore, type ReactNode } from "react";
import { indexQuery } from "@/lib/catalog";
import { useLang } from "@/i18n";
import { getSettings, openShellDialog, setSettings, useSettings } from "@/lib/userSettings";
import { activeItem, featuredItems, moduleItems, moduleOfPath, railModules, type RailModule } from "@/plugins/appModules";
import { appReturn } from "@/plugins/pages";
import { enabledPlugins, pluginSlug } from "@/plugins/runtime";
import type { PluginManifest, PluginNavGroup, PluginNavItem } from "@/plugins/types";
import { EnterpriseDock } from "@/components/enterprise/EnterpriseDock";
import { EnterpriseAccount } from "@/components/enterprise/EnterpriseAccount";
import { Profiles360NavButton } from "@/components/enterprise/Open360";
import { DigitIcon, isDigitIcon } from "@/components/enterprise/DigitIcon";
import { appIconFor, RAIL_MODULE_ICON } from "@/components/enterprise/iconMap";
import { NavIcon } from "./navIcons";
import { globalServices, GLOBAL_SERVICES, type GlobalService, type GlobalServiceKey, type ServiceTarget } from "@/components/enterprise/globalServices";

type Slot = (dt: string) => { app: string; slug: string } | undefined;
export type NavTarget = { to: string; params: Record<string, string>; search?: Record<string, string> };

/** Resolve a manifest navigation target: plugin page path, "doctype:<DocType>" or "report:<name>". */
export function navTarget(p: PluginManifest, to: string, slot: Slot): NavTarget {
  if (to.startsWith("doctype:")) {
    const dt = to.slice(8); const own = p.doctypes?.some((d) => d.name === dt); const s = own ? { app: p.host_app, slug: pluginSlug(dt) } : slot(dt);
    const single = p.doctypes?.find((d) => d.name === dt)?.issingle;
    // a document list opens inside the app (as ActiveAppNav links do), so an app's address map shows it at the app's own address
    if (single) return { to: "/app/$app/$doctype/$name", params: { app: p.host_app, doctype: pluginSlug(dt), name: dt }, search: { app: p.name } };
    return { to: "/app/$app/$doctype", params: { app: s?.app ?? "erpnext", doctype: s?.slug ?? pluginSlug(dt) }, search: { app: p.name } };
  }
  if (to.startsWith("report:")) return { to: "/plugins/$name/report/$report", params: { name: p.name, report: to.slice(7) } };
  return to ? { to: "/plugins/$name/$", params: { name: p.name, _splat: to } } : { to: "/plugins/$name", params: { name: p.name } };
}
export function hrefOfTarget(app: PluginManifest, t: NavTarget) {
  if (t.to === "/plugins/$name/$") return `/plugins/${app.name}/${t.params["_splat"]}`;
  if (t.to === "/plugins/$name") return `/plugins/${app.name}`;
  if (t.to === "/plugins/$name/report/$report") return `/plugins/${app.name}/report/${t.params["report"]}`;
  if (t.to === "/app/$app/$doctype") return `/app/${t.params["app"]}/${t.params["doctype"]}`;
  if (t.to === "/app/$app/$doctype/$name") return `/app/${t.params["app"]}/${t.params["doctype"]}/${encodeURIComponent(t.params["name"] ?? "")}`;
  return "";
}
function useSlot(): Slot {
  const idx = useQuery(indexQuery);
  return (dt) => { const e = idx.data?.find((d) => d.name === dt); return e ? { app: e.app, slug: e.slug } : undefined; };
}

// Selected module: the module a location belongs to wins; otherwise the last module picked in this tab (a Project 360 or
// a native form outside the menu keeps the module the user came from). Session-scoped, display only.
const SEL_KEY = "digit-virtual-core:app-module:";
const listeners = new Set<() => void>();
let selVersion = 0;
function readSel(app: string) { try { return sessionStorage.getItem(SEL_KEY + app) ?? ""; } catch { return ""; } }
function writeSel(app: string, key: string) { try { if (readSel(app) === key) return; sessionStorage.setItem(SEL_KEY + app, key); selVersion++; listeners.forEach((l) => l()); } catch { /* storage unavailable */ } }
function useSelVersion() { return useSyncExternalStore((l) => { listeners.add(l); return () => { listeners.delete(l); }; }, () => selVersion, () => 0); }

/** Rail modules, the current module and the navigation item matching the location (module rail layout). */
export function useAppModules(app: PluginManifest | undefined) {
  const slot = useSlot();
  useSelVersion();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const hrefOf = (to: string) => (app ? hrefOfTarget(app, navTarget(app, to, slot)) : "");
  const mods = app ? railModules(app) : [];
  const remembered = app ? readSel(app.name) : "";
  const fromPath = app ? moduleOfPath(app, path, hrefOf, remembered || undefined) : undefined;
  const current = mods.find((m) => m.key === fromPath) ?? mods.find((m) => m.key === remembered) ?? mods[0];
  const hit = app ? activeItem(app, path, hrefOf, remembered || undefined) : undefined;
  useEffect(() => { if (app && fromPath) writeSel(app.name, fromPath); }, [app, fromPath]);
  return { mods, current, hit, slot, select: (k: string) => app && writeSel(app.name, k) };
}

const appTitle = (p: PluginManifest, ar: boolean) => (ar ? p.title_ar ?? p.title : p.title);
const modLabel = (m: RailModule, ar: boolean) => (ar ? m.label_ar ?? m.label : m.label);


/** Pro-style rail pieces shared by every module-rail app: search under the app tile, pinned services, collapse control. */
export function RailSearch({ ar, onNavigate }: { ar: boolean; onNavigate?: (() => void) | undefined }) {
  return (
    <button type="button" className="dx-rail-item dx-rail-search" onClick={() => { onNavigate?.(); openShellDialog("global-search"); }} data-rail-search>
      <DigitIcon name="ui-search" on="dark" size={20} className="dx-rail-ico" /><span className="dx-rail-label">{ar ? "بحث" : "Search"}</span>
    </button>
  );
}
export type RailService = GlobalService;
export { globalServices, GLOBAL_SERVICES, type GlobalServiceKey, type ServiceTarget };

/** Rail links announce the current page only on an exact match: the router's default prefix match would mark the app
 *  brand and the Home module aria-current="page" on every page below the app root, while `data-active` (the painted state)
 *  names one module, so screen readers and the visible selection named different items. */
const EXACT = { exact: true } as const;

export function RailFoot({ ar, services, onNavigate }: { ar: boolean; services: RailService[]; onNavigate?: (() => void) | undefined }) {
  const collapsed = useNavCollapse();
  const lbl = collapsed ? (ar ? "إظهار القائمة السياقية" : "Show the section menu") : (ar ? "إخفاء القائمة السياقية" : "Hide the section menu");
  return (
    <div className="dx-rail-foot" data-rail-services>
      {services.map((x) => (
        <Link key={x.key} to={x.to as never} params={x.params as never} search={x.search as never} activeOptions={EXACT} onClick={() => { x.onClick?.(); onNavigate?.(); }} className="dx-rail-item" data-active={x.active || undefined} aria-current={x.active ? "true" : undefined} title={x.label} data-rail-service={x.key} data-rail-module={x.module}>
          {isDigitIcon(x.icon) ? <DigitIcon name={x.icon} on="dark" size={22} className="dx-rail-ico" /> : <NavIcon name={x.icon} on="dark" size={22} className="dx-rail-ico" />}<span className="dx-rail-label">{x.label}</span>
        </Link>
      ))}
      {!onNavigate && (
        <button type="button" className="dx-rail-item dx-rail-toggle" onClick={toggleModuleSidebar} aria-expanded={!collapsed} aria-label={lbl} title={lbl} data-nav-collapse>
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="rtl:-scale-x-100" aria-hidden><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M9 3v18" />{collapsed ? <path d="m14 9 3 3-3 3" /> : <path d="m16 15-3-3 3-3" />}</svg>
        </button>
      )}
    </div>
  );
}

/** Rail module whose official icon is a global service icon (an app's own Reports / Settings module). */
const serviceOfIcon = (icon?: string): "reports" | "settings" | undefined => { const d = icon ? RAIL_MODULE_ICON[icon] : undefined; return d === "mod-reports" ? "reports" : d === "ui-settings" ? "settings" : undefined; };

/** Module rail: app tile, one entry per module (official icon + short label); the app's Reports / Settings modules sit with the global services. */
function Rail({ app, ar, onNavigate }: { app: PluginManifest; ar: boolean; onNavigate?: (() => void) | undefined }) {
  const { mods, current, slot, select } = useAppModules(app);
  const icon = appIconFor(app.name, "rail");
  const path = useRouterState({ select: (st) => st.location.pathname });
  const own: Partial<Record<GlobalServiceKey, ServiceTarget>> = {};
  for (const k of ["reports", "settings"] as const) {
    const m = mods.find((x) => serviceOfIcon(x.icon) === k);
    if (m) { const t = m.overview ? navTarget(app, m.overview.to, slot) : { to: "/plugins/$name", params: { name: app.name } }; own[k] = { to: t.to, params: t.params, search: (t as NavTarget).search, active: current?.key === m.key, onClick: () => select(m.key), module: m.key }; continue; }
    // folded groups (e.g. Construction REP / SET inside Finance): first page of the app's own group
    const g = (app.navigation ?? []).find((x) => serviceOfIcon(x.icon) === k || x.key === (k === "reports" ? "REP" : "SET")); const first = g?.items[0]; if (!first) continue;
    const t = navTarget(app, first.to, slot); const href = hrefOfTarget(app, t);
    own[k] = { to: t.to, params: t.params, search: (t as NavTarget).search, active: !!href && path === href };
  }
  for (const k of ["compliance", "help"] as const) {
    const to = app.rail_services?.[k]; if (!to) continue;
    const t = navTarget(app, to, slot); const href = hrefOfTarget(app, t);
    own[k] = { to: t.to, params: t.params, search: (t as NavTarget).search, active: !!href && path === href };
  }
  // one active service at a time: an app page that is both in the Reports module and the Compliance target lights Compliance
  if (own.compliance?.active || own.help?.active) for (const k of ["reports", "settings"] as const) if (own[k]) own[k] = { ...own[k]!, active: false };
  const services = globalServices(ar, path, own);
  const main = mods.filter((m) => !serviceOfIcon(m.icon));
  return (
    <nav className="dx-rail" aria-label={ar ? "وحدات التطبيق" : "Application modules"} data-module-rail={app.name}>
      <Link to="/plugins/$name" params={{ name: app.name }} activeOptions={EXACT} onClick={() => onNavigate?.()} title={appTitle(app, ar)} aria-label={appTitle(app, ar)} className="dx-rail-app" data-rail-app>
        {icon ? <img src={icon} alt="" className="dx-rail-app-ico" /> : <span aria-hidden data-no-i18n>{appTitle(app, ar).charAt(0)}</span>}
      </Link>
      <RailSearch ar={ar} onNavigate={onNavigate} />
      <ul className="dx-rail-list" role="list">
        {main.map((m) => {
          const on = m.key === current?.key;
          const t = m.overview ? navTarget(app, m.overview.to, slot) : { to: "/plugins/$name", params: { name: app.name } };
          const label = ar ? m.short_ar ?? m.label_ar ?? m.label : m.short ?? m.label;
          return (
            <li key={m.key}>
              <Link to={t.to as never} params={t.params as never} search={(t as NavTarget).search as never} activeOptions={EXACT} onClick={() => { select(m.key); onNavigate?.(); }} data-active={on || undefined} aria-current={on ? "true" : undefined} title={modLabel(m, ar)} data-rail-module={m.key} className="dx-rail-item">
                <NavIcon name={m.icon} on="dark" size={24} className="dx-rail-ico" />
                <span className="dx-rail-label" data-long={/^\S{11,}$/.test(String(label)) ? "" : undefined}>{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
      <RailFoot ar={ar} onNavigate={onNavigate} services={services} />
    </nav>
  );
}

/** Contextual sidebar: the selected module's title, its frequent sections (per folded group) and the "All <module>" directory. */
function Context({ app, ar, account, onNavigate }: { app: PluginManifest; ar: boolean; account?: ReactNode; onNavigate?: (() => void) | undefined }) {
  const { current, hit, slot } = useAppModules(app);
  const path = useRouterState({ select: (s) => s.location.pathname });
  const inApp = path === `/plugins/${app.name}` || path.startsWith(`/plugins/${app.name}/`);
  const ret = !inApp ? appReturn(app.name) : null;
  const link = (g: PluginNavGroup, n: PluginNavItem, extra?: boolean) => {
    const t = navTarget(app, n.to, slot);
    const on = hit?.item === n;
    return (
      <li key={`${g.key}:${n.to}`}>
        <Link to={t.to as never} params={t.params as never} search={t.search as never} activeOptions={EXACT} onClick={() => onNavigate?.()} aria-current={on ? "page" : undefined} className="dx-nav-item" data-app-nav={n.label} data-app-nav-extra={extra ? "1" : undefined}>
          <span className="min-w-0">{ar ? n.label_ar ?? n.label : n.label}</span>
        </Link>
      </li>
    );
  };
  const name = current ? modLabel(current, ar) : appTitle(app, ar);
  const count = current ? moduleItems(current).length : 0;
  return (
    <div className="dx-ctx" data-active-app={app.name} data-app-nav-layout="rail">
      <header className="dx-ctx-head">
        {current && <NavIcon name={current.icon} on="dark" size={22} className="dx-ctx-mark" />}
        <h2 className="dx-ctx-title">{name}</h2>
      </header>
      <div className="dx-ctx-scroll">
        {ret && <a href={publicHref(ret.href)} onClick={() => onNavigate?.()} className="dx-nav-item dx-nav-return" data-app-return><span aria-hidden>{ar ? "→" : "←"}</span><span className="min-w-0 truncate">{ar ? `العودة إلى: ${ret.label}` : `Back to: ${ret.label}`}</span></a>}
        {current && (
          <nav aria-label={ar ? `أقسام ${name}` : `${name} sections`} data-app-nav-grouped data-app-module={current.key}>
            {current.groups.map((g, gi) => {
              const items = featuredItems(g);
              const extra = hit && hit.group === g && !items.includes(hit.item) ? hit.item : undefined;
              return (
                <div key={g.key} data-app-nav-group={g.key}>
                  {(gi > 0 || current.groups.length > 1) && <p className="dx-nav-label">{ar ? g.label_ar ?? g.label : g.label}</p>}
                  <ul className="dx-ctx-list">{items.map((n) => link(g, n))}{extra && link(g, extra, true)}</ul>
                </div>
              );
            })}
            {current.directory && (
              <ul className="dx-ctx-list dx-ctx-all">
                <li><Link to="/plugins/$name/$" params={{ name: app.name, _splat: current.directory }} onClick={() => onNavigate?.()} className="dx-nav-item" activeProps={{ "aria-current": "page" } as never} data-app-nav-all={current.key}>
                  <DigitIcon name="ui-menu" on="dark" size={16} className="dx-nav-ico-sm" /><span className="min-w-0 flex-1">{ar ? `كل ${name}` : `All ${name}`}</span><span className="dx-nav-count">{count}</span>
                </Link></li>
              </ul>
            )}
          </nav>
        )}
        <div className="dx-ctx-profiles"><Profiles360NavButton onNavigate={onNavigate} /></div>
      </div>
      <div className="dx-ctx-account"><EnterpriseAccount account={account} /></div>
    </div>
  );
}

/** Contextual-sidebar fold = the shared "module sidebar" user preference (header ☰ / Ctrl+B), like Pro, HR and the Desk. */
function useNavCollapse(): boolean { return !useSettings().module_sidebar; }
export const toggleModuleSidebar = () => setSettings({ module_sidebar: !getSettings().module_sidebar });

/**
 * Shared frame of every module-rail app navigation: desktop = rail + contextual sidebar (sidebar folds with the shared
 * "module sidebar" preference), phones = one drawer (dock apps, rail, sections) shown while the Core ☰ menu is open.
 * Apps supply the rail and context renderers; geometry, colours and states stay identical across apps.
 */
export function RailLayout({ id, label, rail, context, onNavigate }: { id: string; label: string; rail: (nav?: () => void) => ReactNode; context: (nav?: () => void) => ReactNode; onNavigate?: (() => void) | undefined }) {
  const collapsed = useNavCollapse();
  const drawerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const aside = drawerRef.current?.closest("aside");
    if (!aside) return;
    const focusIn = () => { if (aside.hasAttribute("data-mobile-open")) drawerRef.current?.querySelector<HTMLElement>("[data-module-rail] a[href]")?.focus(); };
    const mo = new MutationObserver(focusIn);
    mo.observe(aside, { attributes: true, attributeFilter: ["data-mobile-open"] });
    return () => mo.disconnect();
  }, []);
  return (
    <div className="dx-mr" data-module-rail-shell={id}>
      <div className="dx-mr-desktop">
        {rail()}
        {!collapsed && <div className="dx-aside dx-mr-ctx">{context()}</div>}
      </div>
      <div className="dx-mr-drawer" role="dialog" aria-modal="true" aria-label={label} data-module-rail-drawer>
        <div className="dx-mr-backdrop" onClick={() => onNavigate?.()} />
        <div ref={drawerRef} className="dx-mr-panel">
          <div className="dx-mr-apps"><EnterpriseDock variant="grid" onNavigate={onNavigate} /></div>
          <div className="dx-mr-body">
            {rail(onNavigate)}
            <div className="dx-aside dx-mr-ctx">{context(onNavigate)}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Experience slot Sidebar of a manifest-navigation app (theme.module_rail), e.g. DIGIT Construction. */
export function ModuleRailShell({ appName, account, onNavigate }: { appName: string; account?: ReactNode; onNavigate?: () => void }) {
  const ar = useLang() === "ar";
  const app = enabledPlugins().find((p) => p.name === appName);
  if (!app) return null;
  return <RailLayout id={app.name} label={ar ? `قائمة ${appTitle(app, ar)}` : `${appTitle(app, ar)} menu`} onNavigate={onNavigate}
    rail={(nav) => <Rail app={app} ar={ar} onNavigate={nav} />}
    context={(nav) => <Context app={app} ar={ar} account={account} onNavigate={nav} />} />;
}
