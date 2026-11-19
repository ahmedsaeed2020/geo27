import { HeaderMyWork, HeaderRecent } from "@/components/desk/HeaderWork";
import { usePageCompanyValue } from "@/components/enterprise/RecordProfile";
import { QuickViewHost } from "@/components/enterprise/QuickView";
import { CreatePanelHost, installCreateLinks } from "@/components/enterprise/CreatePanel";
import { indexQuery } from "@/lib/catalog";
import { installConnectedSplit, setSplitIndex } from "@/components/enterprise/connectedSplit";
import { WorkTabs } from "@/components/enterprise/WorkTabs";
import { BandMark } from "@/components/enterprise/BandMark";
import { installBrandGuard } from "@/lib/brandGuard";
import { ScreenHelp } from "@/components/enterprise/Knowledge";
import { ReportProblem } from "@/components/enterprise/ReportProblem";
import { ADMIN, switchUser, useSessionUser } from "@/lib/session";
import { siteSignOut } from "@/lib/siteAuth.functions";
import { markSignedOut } from "@/lib/siteGate";
import { Link, useNavigate, useRouter, useRouterState } from "@tanstack/react-router";
import { installNavOrigins } from "@/lib/navOrigin";
import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { adapter } from "@/lib/adapter";
import { enabledPlugins, liveSig, usePluginsVersion } from "@/plugins/runtime";
import { setMode, useMode, useDevMode, setDevMode } from "@/lib/mode";
import { AppLogo } from "@/components/desk/AppLogo";
import { seedErp } from "@/lib/seed";
import { GlobalSearch } from "@/components/desk/Search";
import { DigitIcon, EntGlyph } from "@/components/enterprise/DigitIcon";
import { LangToggle } from "@/i18n/LangToggle";
import { arabicDigits, setArabicDigits, useLang } from "@/i18n";
import { DOCK_APPS, openShellDialog, toggleFullWidth, useDock, useSettings } from "@/lib/userSettings";
import { BUILD, buildLabel } from "@/lib/buildStamp";
import { clearSessionDefaults } from "@/lib/sessionDefaults";
import { useHydrated } from "@/components/hrms/HrShell";
import { NotificationsPanel, useUnreadNotifications } from "@/components/desk/Notifications";
import { ActiveAppNav, useActiveAppLocation } from "@/components/plugins/ActiveAppNav";
import { useActiveApp } from "@/plugins/appShell";
import { ContextModuleSidebar } from "@/components/desk/ModuleSidebarNav";
import { allSlotProviders, useExperienceSlots, useSlotShellEffects, type ExperienceSlots } from "@/plugins/experienceSlots";
import { resolveInApp, setActiveExperience } from "@/plugins/theme";
import { exitApp } from "@/plugins/appShell";
import { DESK_HOME, useEnterprise } from "@/plugins/enterprise";
import { EnterpriseDock } from "@/components/enterprise/EnterpriseDock";
import { EnterpriseNav } from "@/components/enterprise/EnterpriseNav";
import { installRowLinks } from "@/components/enterprise/rowLink";
import { appIconFor } from "@/components/enterprise/iconMap";
import { moduleFor } from "@/components/enterprise/kit/palettes";
import { defaultCompany } from "@/lib/sessionDefaults";
import { useScreenHost } from "@/plugins/experience/screenHost";

/** Leaving an app experience by choosing another app (dock) also leaves the session app shell. */
function leaveExperience() { setActiveExperience(""); exitApp(); }
/** App rail clicks may ask the phone drawer to stay open on the page they open (experience slot keepDrawerOn). */
const keepDrawer = (path: string) => allSlotProviders().some(([, s]) => s.keepDrawerOn?.(path));

let seeded = false;

/**
 * Desk chrome per docs/VCORE_V1650_VIDEO_SPECS.md §0: left app dock (pinned/floating) + collapsible module
 * sidebar (Search, Notification, Home, module links) + avatar menu bottom-left. Module links come from the
 * caller's data-driven sidebar (Workspace Sidebar JSON), never hard-coded here.
 */
export function Shell({ children, crumbs = [], sidebar, nav }: { children: ReactNode; crumbs?: { label: string; to?: ReactNode }[]; sidebar?: ReactNode; /** "enterprise": the DIGIT Enterprise Home navigation (enterprise mode only) */ nav?: "enterprise" }) {
  const qc = useQueryClient();
  // Live customizations (new DocTypes, custom fields, setters) refresh the index + meta caches as soon as they are saved.
  useEffect(() => { let last = liveSig(); const off = adapter.subscribe(() => { const n = liveSig(); if (n !== last) { last = n; void qc.invalidateQueries({ queryKey: ["catalog-index"] }); void qc.invalidateQueries({ queryKey: ["meta"] }); } }); return () => { off(); }; }, [qc]);
  const s = useSettings();
  const dev = useDevMode();
  const [drawer, setDrawer] = useState(false);
  const [bell, setBell] = useState(false);
  const unreadRaw = useUnreadNotifications();
  const hyd = useHydrated();
  const unread = hyd ? unreadRaw : 0;
  useEffect(() => { if (!seeded) { seeded = true; seedErp(); void import("@/lib/crmReset").then((m) => m.syncSiteLeads()).catch(() => {}); } }, []);
  useActiveAppLocation();
  useSlotShellEffects();
  // active DIGIT app experience (enabled + active): its slots replace the module sidebar and breadcrumbs (display only)
  const xp = useExperienceSlots(); const S = xp?.slots;
  // DIGIT Enterprise mode (>= 1 enabled DIGIT app): one app selector + header controls in every Shell branch
  const ent = useEnterprise();
  // the Enterprise frame owns the look of every app and of the desk pages an app opens (Enterprise Visual Round 1 §0)
  const deskApp = useActiveApp();
  // <html data-enterprise> scopes the shared DIGIT Enterprise surface rules (src/components/enterprise/enterprise.css)
  useEffect(() => { document.documentElement.toggleAttribute("data-enterprise", ent.on); }, [ent.on]);
  // no platform names or vendor documentation links inside DIGIT (display only; src/lib/brandGuard.ts)
  useEffect(() => (ent.on ? installBrandGuard() : undefined), [ent.on]);
  // whole-row / whole-card click in every DIGIT Enterprise work area (one delegated listener; src/components/enterprise/rowLink.ts)
  useEffect(() => installRowLinks(), []);
  useEffect(() => installCreateLinks(), []);
  useEffect(() => installConnectedSplit(), []);
  const splitIdx = useQuery(indexQuery);
  useEffect(() => setSplitIndex(splitIdx.data), [splitIdx.data]);
  // source-aware Back on document pages: remember where each history entry was opened from (src/lib/navOrigin.ts)
  const router = useRouter();
  useEffect(() => installNavOrigins(router), [router]);
  // browser tab icon = the active app's logo (one logo per app, iconMap.appIconFor); Standard Desk keeps the site icon
  const appIcon = xp ? appIconFor(xp.name, "favicon") : undefined;
  useEffect(() => {
    const link = document.querySelector<HTMLLinkElement>('link[rel="icon"]'); if (!link) return;
    link.href = appIcon ?? "/favicon.ico"; link.type = appIcon ? "image/svg+xml" : "image/x-icon";
    if (appIcon) link.setAttribute("data-app-icon", xp!.name); else link.removeAttribute("data-app-icon");
  }, [appIcon]); // eslint-disable-line react-hooks/exhaustive-deps
  // phones (< md): the app dock + module sidebar become one off-canvas menu opened by ☰ (frappe desk mobile sidebar);
  // the desktop layout and the persisted "module sidebar" setting are unchanged
  const path = useRouterState({ select: (r) => r.location.pathname });
  // module colour of the area on screen (icon tiles, tab underline, hero chip dot, first chart colour; kit/palettes.ts moduleFor)
  const xpName = xp?.name, deskName = deskApp?.name;
  useEffect(() => {
    const m = ent.on ? moduleFor(window.location.pathname, xpName ?? deskName) : undefined;
    if (m) document.documentElement.setAttribute("data-module", m); else document.documentElement.removeAttribute("data-module");
  }, [path, ent.on, xpName, deskName]);
  // ScreenHost: the one content host below names the registered screen this path renders (src/plugins/experience/screenHost.ts)
  const host = useScreenHost(path);
  // --shell-header-h = live height of the sticky top bar, so in-page sticky bars sit below it and focus/anchor
  // scrolling never leaves a heading or field hidden under it (styles.css scroll-padding-top)
  useEffect(() => {
    const h = document.querySelector<HTMLElement>("[data-shell-header]"); if (!h) return;
    const set = () => document.documentElement.style.setProperty("--shell-header-h", `${h.offsetHeight}px`);
    set(); const ro = new ResizeObserver(set); ro.observe(h); return () => ro.disconnect();
  }, [path]);
  const [mobileNav, setMobileNav] = useState(() => keepDrawer(path));
  useEffect(() => { if (!keepDrawer(path)) setMobileNav(false); }, [path]);
  const navBtn = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!mobileNav) return;
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") { setMobileNav(false); navBtn.current?.focus(); } };
    document.addEventListener("keydown", k); return () => document.removeEventListener("keydown", k);
  }, [mobileNav]);
  const toggleNav = () => { if (typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches) setMobileNav((v) => !v); else openToggleSidebar(); };
  const header = <ShellHeader navBtn={navBtn} expanded={mobileNav} onToggle={toggleNav} dev={dev} onDev={() => setDrawer(!drawer)} enterprise={ent.on} bell={bell} onBell={() => setBell(!bell)} unread={s.allow_notifications ? unread : 0} />;
  if (nav === "enterprise" && ent.on) {
    return (
      <div className="flex min-h-screen" data-desk-shell data-qv-host data-enterprise-shell data-visual="r3">
        {mobileNav && <button type="button" aria-label="Close menu" data-mobile-nav-backdrop className="fixed inset-0 z-40 bg-foreground/30 md:hidden" onClick={() => setMobileNav(false)} />}
        <div data-mobile-nav={mobileNav ? "open" : "closed"} className={`us-nav md:contents ${mobileNav ? "us-nav-open max-md:fixed max-md:inset-y-0 max-md:start-0 max-md:z-50 max-md:flex max-md:shadow-xl" : "max-md:hidden"}`}>
          <Dock />
          <aside data-us="module-sidebar" className="us-module-sidebar dx-aside sticky top-0 flex h-screen shrink-0 flex-col">
            <EnterpriseNav account={<AvatarMenu />} onNavigate={() => setMobileNav(false)} />
          </aside>
        </div>
        <div className="min-w-0 flex-1" data-shell-content>
          {header}
          {bell && <NotificationsPanel onClose={() => setBell(false)} />}
          <WorkTabs /><BandMark />
          <main className="us-main us-page min-w-0 px-3 py-4 md:px-6" data-shell-main {...host} data-layout={s.layout === "Full Width" ? "full-width" : "compact"}>{children}</main>
        </div>
        {dev && drawer && <DeveloperDrawer onClose={() => setDrawer(false)} />}
      </div>
    );
  }
  if (S?.Sidebar) {
    const Side = S.Sidebar;
    return (
      <div className="flex min-h-screen" data-desk-shell data-qv-host data-experience={xp!.name} data-app-shell={xp!.name} {...(ent.on ? { "data-visual": "r3" } : {})}>
        <Dock />
        {mobileNav && <div className="us-mnav-backdrop" data-mobile-nav-backdrop onClick={() => setMobileNav(false)} />}
        <aside data-us="module-sidebar" data-mobile-open={mobileNav || undefined} data-dp-sidebar className="us-module-sidebar dp-sidebar dp-aside sticky top-0 flex h-screen shrink-0 flex-col border-e border-border">
          <Side account={<AvatarMenu />} onNavigate={() => setMobileNav(false)} />
        </aside>
        <div className="min-w-0 flex-1" data-shell-content>
          {header}
          {ent.on && bell && <NotificationsPanel onClose={() => setBell(false)} />}
          {S.Crumbs ? <S.Crumbs crumbs={crumbs} /> : <Crumbs crumbs={crumbs} />}
          {ent.on && <WorkTabs />}<BandMark />
          <main className="us-main us-page min-w-0 px-3 py-4 md:px-6" data-shell-main {...host} data-layout={s.layout === "Full Width" ? "full-width" : "compact"}>{children}</main>
        </div>
        {dev && drawer && <DeveloperDrawer onClose={() => setDrawer(false)} />}
      </div>
    );
  }
  // Before hydration this browser's mode (DIGIT Enterprise or plain Core) is still unknown — it lives in browser storage —
  // so the first paint shows neutral navigation placeholders instead of the plain Core Desk launchers; the real
  // navigation replaces them as soon as the page hydrates (same markup on server and client, no mismatch).
  if (!hyd) return (
    <div className="flex min-h-screen" data-shell-pending>
      <div aria-hidden className="hidden w-16 shrink-0 border-e border-border bg-muted md:block" />
      <div aria-hidden className="sticky top-0 hidden h-screen w-60 shrink-0 border-e border-border bg-card md:block" />
      <div className="min-w-0 flex-1" data-shell-content>
        {header}
        <main className="us-main us-page min-w-0 px-3 py-4 md:px-6" data-shell-main {...host} data-layout={s.layout === "Full Width" ? "full-width" : "compact"}>{children}</main>
      </div>
    </div>
  );
  return (
    <div className="flex min-h-screen" data-desk-shell data-qv-host {...(ent.on && deskApp ? { "data-visual": "r3" } : {})}>
      {mobileNav && <button type="button" aria-label="Close menu" data-mobile-nav-backdrop className="fixed inset-0 z-40 bg-foreground/30 md:hidden" onClick={() => setMobileNav(false)} />}
      <div data-mobile-nav={mobileNav ? "open" : "closed"} className={`us-nav md:contents ${mobileNav ? "us-nav-open max-md:fixed max-md:inset-y-0 max-md:start-0 max-md:z-50 max-md:flex max-md:shadow-xl max-md:bg-card" : "max-md:hidden"}`}>
      <Dock />
      <aside data-us="module-sidebar" className="us-module-sidebar sticky top-0 flex h-screen w-60 shrink-0 flex-col border-e border-border bg-card">
        <div className="px-3 pb-1 pt-3 text-sm font-semibold text-primary">Digit Desk</div>
        <nav className="space-y-0.5 px-2 py-1 text-sm">
          <SideBtn icon="⌕" label="Search" onClick={() => openShellDialog("global-search")} />
          <button type="button" data-bell onClick={() => setBell(!bell)} className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-start hover:bg-muted"><span className="w-4 text-center">◔</span><span>Notification</span>{unread > 0 && s.allow_notifications && <span className="ms-auto chip bg-primary/15 text-primary" data-unread={unread} data-no-i18n>{unread}</span>}</button>
          <Link to={ent.on ? DESK_HOME : "/"} className="flex items-center gap-2 rounded px-2 py-1.5 hover:bg-muted" activeOptions={{ exact: true }} activeProps={{ className: "bg-muted font-medium" }} data-desk-home-link><span className="w-4 text-center">⌂</span><span>{ent.on ? "Desk Home" : "Home"}</span></Link>
          {s.show_my_space && <Link to="/my-space" data-my-space className="flex items-center gap-2 rounded px-2 py-1.5 hover:bg-muted" activeProps={{ className: "bg-muted font-medium" }}><span className="w-4 text-center">◎</span><span>My Space</span></Link>}
        </nav>
        {bell && <NotificationsPanel onClose={() => setBell(false)} />}
        {hyd && <ActiveAppNav />}
        <div className="min-h-0 flex-1 overflow-y-auto border-t border-border p-2">{sidebar ?? (hyd ? <ContextModuleSidebar fallback={<DefaultModules />} /> : <DefaultModules />)}</div>
        <div className="border-t border-border p-2"><AvatarMenu /></div>
      </aside>
      </div>
      <div className="min-w-0 flex-1" data-shell-content>
        {header}
        <Crumbs crumbs={crumbs} />
        <main className="us-main us-page min-w-0 px-3 py-4 md:px-6" data-shell-main {...host} data-layout={s.layout === "Full Width" ? "full-width" : "compact"}>{children}</main>
      </div>
      {dev && drawer && <DeveloperDrawer onClose={() => setDrawer(false)} />}
    </div>
  );
}

function ShellHeader({ navBtn, expanded, onToggle, dev, onDev, enterprise, bell, onBell, unread }: { navBtn: RefObject<HTMLButtonElement | null>; expanded: boolean; onToggle: () => void; dev: boolean; onDev: () => void; enterprise?: boolean; bell?: boolean; onBell?: () => void; unread?: number }) {
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-card" data-shell-header>
      <QuickViewHost />
      <CreatePanelHost />
      <div className="flex flex-wrap items-center gap-2 px-3 py-2 md:gap-3 md:px-5" data-shell-header-row>
        <button ref={navBtn} type="button" aria-label="Toggle sidebar" title="Ctrl+B" aria-expanded={expanded} data-nav-toggle className="btn-ghost shrink-0 px-2 py-1" onClick={onToggle}>{enterprise ? <DigitIcon name="ui-menu" size={20} /> : "☰"}</button>
        <div className="us-search min-w-[8rem] flex-1 md:min-w-[9rem] md:max-w-[20rem]"><GlobalSearch /></div>
        {/* actions wrap to a second row when the screen is too narrow, never off-screen */}
        <div className="ms-auto flex max-w-full flex-wrap items-center justify-end gap-2 text-xs xl:gap-3" data-shell-header-actions>
          {enterprise && <HeaderCompany />}
          {enterprise ? <span className="dx-hdr-lang"><DigitIcon name="ui-language" size={18} className="hidden sm:inline-block" /><LangToggle /></span> : <LangToggle />}
          {enterprise && <HeaderRecent />}
          {enterprise && <HeaderMyWork />}
          {enterprise && <ScreenHelp />}
          {enterprise && <ReportProblem />}
          {enterprise && <button type="button" data-header-bell aria-label="Notifications" aria-expanded={!!bell} onClick={onBell} className="dx-hdr-btn relative">
            <DigitIcon name="ui-notifications" size={20} />
            {!!unread && <span className="dx-hdr-count" data-unread={unread} data-no-i18n>{unread}</span>}
          </button>}
          {/* phones: the account menu lives in the ☰ menu */}
          {enterprise && <div className="dx-hdr-user hidden md:block" data-header-user><AvatarMenu placement="down" compact /></div>}
          {dev && <button type="button" data-dev-drawer-toggle className="text-dev hover:underline" onClick={onDev}>Developer</button>}
        </div>
      </div>
    </header>
  );
}

/** Session company in the top bar (shared Session Defaults resolver; display only — change it in User Settings › Session Defaults). */
function HeaderCompany() {
  const user = useSessionUser(); const hyd = useHydrated();
  // a record page names its own company (Enterprise usePageCompany), so the top bar and the record card never disagree
  const pc = usePageCompanyValue();
  const c = hyd ? pc || defaultCompany(user) : "";
  if (!c) return null;
  return <button type="button" className="dx-hdr-company hidden lg:inline-flex" title="Session Defaults" onClick={() => openShellDialog("settings", "Session Defaults")} data-header-company><span className="truncate" data-no-i18n>{c}</span></button>;
}

function Crumbs({ crumbs }: { crumbs: { label: string; to?: ReactNode }[] }) {
  if (!crumbs.length) return null;
  return (
    <div className="us-page flex flex-wrap gap-x-2 gap-y-1 px-3 pt-4 text-sm text-muted-foreground md:px-6" data-crumbs>
      {crumbs.map((c, i) => <span key={i}>{i > 0 && "/ "}{c.to ?? c.label}</span>)}
    </div>
  );
}

/** Preview-only controls (not part of Frappe): shown only in Developer mode, opened from the navbar/avatar menu. */
function DeveloperDrawer({ onClose }: { onClose: () => void }) {
  const mode = useMode();
  return (
    <div data-dev-drawer className="fixed inset-y-0 end-0 z-50 w-80 overflow-y-auto border-s border-border bg-popover p-4 text-sm shadow-xl">
      <div className="mb-3 flex items-center"><h2 className="font-semibold">Developer</h2><button type="button" className="ms-auto btn-ghost px-2" aria-label="Close" onClick={onClose}>×</button></div>
      <p className="mb-3 rounded-md bg-muted p-2 text-xs text-muted-foreground" data-preview-banner>Synthetic preview — no DIGIT backend runs here. Generated screens follow source metadata; they are not pixel-faithful reproductions (see Coverage).</p>
      <div className="mb-3 flex rounded-md border border-border p-0.5" title="Both modes use the same synthetic records">
        {(["original", "customized"] as const).map((m) => (
          <button key={m} type="button" onClick={() => setMode(m)} className={`flex-1 rounded px-2 py-1 ${mode === m ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>{m === "original" ? "Original" : "Customized"}</button>
        ))}
      </div>
      <div className="space-y-1">
        <Link to="/coverage" className="block hover:underline">Coverage</Link>
        <Link to="/developer" className="block hover:underline">Developer pages</Link>
      </div>
    </div>
  );
}

import { getSettings, setSettings } from "@/lib/userSettings";
function openToggleSidebar() { setSettings({ module_sidebar: !getSettings().module_sidebar }); }

function SideBtn({ icon, label, onClick }: { icon: string; label: string; onClick: () => void }) {
  return <button type="button" onClick={onClick} className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-start hover:bg-muted"><span className="w-4 text-center">{icon}</span><span>{label}</span></button>;
}

/** Fallback module list = the source apps; real module links come from Workspace Sidebar data via `sidebar`. */
function DefaultModules() {
  return (
    <div className="space-y-0.5 text-sm">
      {DOCK_APPS.filter((a) => a.id !== "home").map((a) => <Link key={a.id} to={a.to as "/"} params={(a.app ? { app: a.app } : {}) as never} className="block rounded px-2 py-1.5 hover:bg-muted">{a.label}</Link>)}
      <div className="mt-3 px-2 text-xs font-semibold text-muted-foreground">Setup</div>
      <Link to="/settings" className="block rounded px-2 py-1.5 hover:bg-muted">Settings</Link>
      <Link to="/page" className="block rounded px-2 py-1.5 hover:bg-muted">Pages</Link>
      <Link to="/plugins" className="block rounded px-2 py-1.5 hover:bg-muted" data-nav-plugins>Apps &amp; Plugins</Link>
      <Link to="/developer/sdk" className="block rounded px-2 py-1.5 hover:bg-muted" data-nav-dev-sdk>Developer</Link>
    </div>
  );
}

type DockApp = (typeof DOCK_APPS)[number];
/** A Core dock app. Inside an app experience, generic entries (Home, Reports) resolve to the app's in-app targets; choosing another app leaves the experience. */
function DockLink({ a, inXp }: { a: DockApp; inXp: boolean }) {
  const r = inXp && !a.app ? resolveInApp(a.to) : a.to; const inApp = r !== a.to ? r : undefined;
  return (
    <Link to={(inApp ?? a.to) as "/"} params={(a.app ? { app: a.app } : {}) as never} title={a.label} aria-label={a.label} data-dock-app={a.id} data-in-app={inApp ? "" : undefined} suppressHydrationWarning onClick={() => { if (inXp && !inApp) leaveExperience(); }} className="us-dock-app group flex w-12 flex-col items-center gap-0.5 rounded-lg py-1 hover:bg-card" {...(inXp ? {} : { activeProps: { className: "bg-card", "data-active": "" } as never })}>
      <AppLogo id={a.id} />
      <span suppressHydrationWarning className="max-w-12 truncate text-[9px] leading-tight text-muted-foreground">{a.label}</span>
    </Link>
  );
}
/** Dock entry of an enabled app that declares experience slots (opens the app's home). */
function AppDockLink({ name, dock, active }: { name: string; dock: NonNullable<ExperienceSlots["dock"]>; active: boolean }) {
  return (
    <Link to={dock.home as "/"} title={dock.label} aria-label={dock.label} data-dock-app={name} data-active={active || undefined} className={`us-dock-app group flex w-12 flex-col items-center gap-0.5 rounded-lg py-1 hover:bg-card ${active ? "bg-card" : ""}`}>
      <span data-app-logo={name} className="flex h-9 w-9 items-center justify-center"><img src={dock.icon} alt="" className="h-9 w-9" /></span>
      <span className="max-w-12 truncate text-[9px] leading-tight text-muted-foreground" data-no-i18n>{dock.label}</span>
    </Link>
  );
}

/**
 * App dock (icon rail). Pinned = always visible; Floating = overlays on hover at the screen edge. Enabled apps with a
 * dock slot appear after Home. While an app experience is active its dock order applies (e.g. Home, the app, HR, CRM,
 * Insights, Reports) and every other app stays reachable from "More Apps" — nothing is unregistered.
 */
function Dock() {
  const ent = useEnterprise(); const hyd = useHydrated();
  if (ent.on) return <EnterpriseDock />;
  // mode unknown until hydrated: a neutral rail, never the Core launchers (same rule as the pending Shell)
  if (!hyd) return <div aria-hidden data-dock-pending className="us-dock sticky top-0 z-40 h-screen w-14 shrink-0 border-e border-border bg-muted/60" />;
  return <CoreDock />;
}
/** The original Core dock (no DIGIT app enabled), unchanged. */
function CoreDock() {
  const ids = useDock(); usePluginsVersion();
  const hyd = useHydrated(); const xp = useExperienceSlots();
  const [more, setMore] = useState(false);
  const apps = DOCK_APPS.filter((a) => ids.includes(a.id));
  const enabled = new Set(hyd ? enabledPlugins().map((p) => p.name) : []);
  const appLinks = allSlotProviders().filter(([n, s]) => s.dock && enabled.has(n)).map(([n, s]) => <AppDockLink key={n} name={n} dock={s.dock!} active={xp?.name === n} />);
  const order = xp?.slots.dock?.main;
  if (!order) return (
    <div data-dock className="us-dock sticky top-0 z-40 flex h-screen w-14 shrink-0 flex-col items-center gap-1.5 border-e border-border bg-muted/60 py-3">
      {apps.flatMap((a) => a.id === "home" ? [<DockLink key={a.id} a={a} inXp={false} />, ...appLinks] : [<DockLink key={a.id} a={a} inXp={false} />])}
    </div>
  );
  const own = appLinks.find((l) => l.key === xp!.name);
  const main = order.flatMap((id) => (id === xp!.name ? (own ? [own] : []) : apps.filter((a) => a.id === id).map((a) => <DockLink key={a.id} a={a} inXp />)));
  const rest = apps.filter((a) => !order.includes(a.id));
  const otherApps = appLinks.filter((l) => l.key !== xp!.name);
  return (
    <div data-dock data-dock-grouped className="us-dock sticky top-0 z-40 flex h-screen w-14 shrink-0 flex-col items-center gap-1.5 border-e border-border bg-muted/60 py-3">
      {main}
      {otherApps}
      {rest.length > 0 && <div className="relative mt-1 border-t border-border pt-2">
        <button type="button" aria-label="More Apps" aria-expanded={more} data-dock-more onClick={() => setMore(!more)} className="us-dock-app flex w-12 flex-col items-center gap-0.5 rounded-lg py-1 hover:bg-card">
          <span className="flex h-9 w-9 items-center justify-center">{xp!.slots.dock?.moreIcon ? <img src={xp!.slots.dock.moreIcon} alt="" className="h-6 w-6" /> : <span aria-hidden>⋯</span>}</span>
          <span className="max-w-12 truncate text-[9px] leading-tight text-muted-foreground">More Apps</span>
        </button>
        {more && <div role="menu" data-dock-more-menu className="absolute start-14 top-0 z-50 grid w-48 gap-1 rounded-lg border border-border bg-popover p-2 shadow-lg" onMouseLeave={() => setMore(false)}>
          {rest.map((a) => <Link key={a.id} role="menuitem" to={a.to as "/"} params={(a.app ? { app: a.app } : {}) as never} onClick={() => { leaveExperience(); setMore(false); }} data-dock-app={a.id} className="flex items-center gap-2 rounded px-2 py-1 text-sm hover:bg-muted"><AppLogo id={a.id} /><span>{a.label}</span></Link>)}
        </div>}
      </div>}
    </div>
  );
}

function AvatarMenu({ placement = "up", compact }: { placement?: "up" | "down"; compact?: boolean } = {}) {
  const [open, setOpen] = useState(false);
  const user = useSessionUser();
  const s = useSettings();
  const dev = useDevMode();
  const nav = useNavigate();
  const ar = useLang() === "ar";
  const item = "flex w-full items-center gap-2 rounded px-2 py-1.5 text-start hover:bg-muted";
  return (
    <div className="relative">
      <button type="button" aria-label="User menu" data-user-menu onClick={() => setOpen(!open)} className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-accent text-xs font-semibold text-accent-foreground" data-no-i18n>{(s.first_name || "A")[0]}</span>
        <span className={`truncate ${compact ? "hidden 2xl:inline" : ""}`} {...(user === ADMIN ? {} : { "data-no-i18n": "" })} data-session-user={user}>{user === ADMIN ? [s.first_name, s.last_name].filter(Boolean).join(" ") : user}</span>
      </button>
      {open && (
        <div className={`absolute z-50 w-56 rounded-md border border-border bg-popover p-1.5 text-sm shadow-lg ${placement === "down" ? "end-0 top-10" : "bottom-11 start-0"}`} onMouseLeave={() => setOpen(false)}>
          <button type="button" className={item} onClick={() => { setOpen(false); openShellDialog("settings", "Profile"); }}><EntGlyph name="ui-settings" /><span>Settings</span></button>
          <button type="button" className={item} onClick={() => { setOpen(false); openShellDialog("dock"); }}><EntGlyph name="ui-dashboard" /><span>Manage Dock</span></button>
          <button type="button" role="menuitemcheckbox" aria-checked={s.layout === "Full Width"} data-toggle-full-width className={`${item} flex items-center gap-2`} onClick={() => { toggleFullWidth(); }}><span className="w-4 text-center" aria-hidden>{s.layout === "Full Width" ? <EntGlyph name="ui-success" fallback="✓" /> : ""}</span><span>Toggle Full Width</span></button>
          <button type="button" className={item} onClick={() => location.reload()}><EntGlyph name="ui-refresh" /><span>Reload</span></button>
          {/* night mode (owner 2026-11-12): saved per user, Automatic follows the system */}
          <div className="px-2 py-1.5 text-xs" role="group" aria-label={ar ? "الوضع الليلي" : "Night mode"} data-theme-switch={s.theme}>
            <span className="inline-flex items-center gap-1.5"><EntGlyph name="ui-settings" size={14} /><span>{ar ? "المظهر" : "Appearance"}</span></span>
            <div className="mt-1 grid grid-cols-3 gap-1">{(["Automatic", "Light", "Dark"] as const).map((th) => <button key={th} type="button" aria-pressed={s.theme === th} data-theme-option={th} onClick={() => setSettings({ theme: th })}
              className={`rounded border px-1 py-1 text-[11px] ${s.theme === th ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-muted"}`}>{th === "Automatic" ? (ar ? "تلقائي" : "System") : th === "Light" ? (ar ? "نهاري" : "Light") : (ar ? "ليلي" : "Night")}</button>)}</div>
          </div>
          <label className="block px-2 py-1.5 text-xs"><span className="inline-flex items-center gap-1.5"><EntGlyph name="trust-login" size={14} /><span>Switch User</span></span>
            <select className="field-input mt-1" data-switch-user value={user} onChange={(e) => { switchUser(e.target.value); setOpen(false); toast(e.target.value); }}>
              <option value={ADMIN}>{ADMIN}</option>
              {adapter.list("User").filter((u) => u.name !== ADMIN && u.name !== "Guest" && Number(u["enabled"] ?? 1) === 1).map((u) => <option key={u.name} value={u.name}>{u.name}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-2 px-2 py-1.5 text-xs"><input type="checkbox" data-dev-mode checked={dev} onChange={(e) => setDevMode(e.target.checked)} /> <EntGlyph name="svc-customization" size={14} /><span>Developer Mode</span></label>
          <label className="flex items-center gap-2 px-2 py-1.5 text-xs"><input type="checkbox" checked={arabicDigits()} onChange={(e) => setArabicDigits(e.target.checked)} /> <EntGlyph name="feat-bilingual" size={14} /><span>Arabic-Indic digits</span></label>
          {/* on_logout hook clear_session_defaults: the user's session defaults end with the session */}
          <button type="button" className={item} onClick={() => { setOpen(false); clearSessionDefaults(); void siteSignOut().finally(() => { markSignedOut(); nav({ to: "/login", replace: true }); }); }}><EntGlyph name="ui-logout" /><span>Logout</span></button>
          <div className="mt-1 border-t border-border px-2 pt-1.5 text-[11px] text-muted-foreground" data-build-stamp title={BUILD.time}><span>{ar ? "الإصدار" : "Version"}</span>{" "}<span dir="ltr" data-no-i18n>{buildLabel()}</span></div>
        </div>
      )}
    </div>
  );
}

const LOADING_AR: Record<string, string> = { catalog: "جارٍ تحميل البيانات…", record: "جارٍ تحميل السجل…", list: "جارٍ تحميل القائمة…", report: "جارٍ تحميل التقرير…", form: "جارٍ تحميل النموذج…", page: "جارٍ تحميل الصفحة…" };
export function Loading({ what = "catalog" }: { what?: string }) {
  const ar = useLang() === "ar";
  return <div className="p-10 text-center text-muted-foreground" data-loading={what}>{ar ? LOADING_AR[what] ?? "جارٍ التحميل…" : `Loading ${what}…`}</div>;
}
