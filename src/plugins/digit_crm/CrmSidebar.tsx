import { Link, useRouterState } from "@tanstack/react-router";
import { useEffect, useState, useSyncExternalStore } from "react";
import { openShellDialog } from "@/lib/userSettings";
import { setActiveExperience } from "@/plugins/theme";
import { useLang } from "@/i18n";
import { digitCrm } from "./index";
import { CRM_NAV, groupHome, groupOfPath, isItemActive } from "./nav";
import { appIconFor } from "@/components/enterprise/iconMap";

/** Section glyphs (inline, CRM-owned; no DIGIT Pro icon dependency). */
const ICON: Record<string, string> = {
  dashboard: "M4 4h7v7H4zM13 4h7v4h-7zM13 10h7v10h-7zM4 13h7v7H4z",
  users: "M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21v-1a6 6 0 0 1 12 0v1M16 3.5a4 4 0 0 1 0 7.5M18 14a6 6 0 0 1 4 6v1",
  pipeline: "M3 4h18l-7 8v6l-4 2v-8z",
  activity: "M3 12h4l3-8 4 16 3-8h4",
  team: "M12 2l3 6 6 1-4.5 4 1 6.5L12 16l-5.5 3.5 1-6.5L3 9l6-1z",
  reports: "M4 20V10M10 20V4M16 20v-7M22 20H2",
  settings: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z",
  panel: "M4 4h16v16H4zM10 4v16",
  search: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM21 21l-5.2-5.2",
  exit: "M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10",
};
const Glyph = ({ name, className = "h-5 w-5" }: { name: string; className?: string }) => <svg viewBox="0 0 24 24" className={`${className} shrink-0`} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={ICON[name] ?? ICON["dashboard"]} /></svg>;

/** Rail captions: a short form of each module name (the full name stays the tooltip, accessible name and panel title). */
const SHORT: Record<string, [string, string]> = {
  home: ["Home", "الرئيسية"], customers: ["Customers", "العملاء"], pipeline: ["Sales", "المبيعات"], activities: ["Activities", "الأنشطة"],
  management: ["Teams", "الفرق"], reports: ["Reports", "التقارير"], admin: ["Settings", "الإعدادات"],
};

/** Section panel visibility: "auto" follows the viewport (shown ≥1280 px); a click pins it open/closed for this tab. */
type PanelState = "auto" | "open" | "closed";
const PANEL_KEY = "digit-crm:nav-panel";
const WIDE = "(min-width: 1280px)";
const subscribeWide = (l: () => void) => { const m = window.matchMedia(WIDE); m.addEventListener("change", l); return () => m.removeEventListener("change", l); };
const useWide = () => useSyncExternalStore(subscribeWide, () => window.matchMedia(WIDE).matches, () => true);

/** DIGIT CRM application navigation (levels 1–2): a module rail that always lists all seven modules, and a contextual
 *  panel listing only the active module's sections (Overview first, All sections last). Every destination is the same
 *  registered route as before; only the presentation changed. */
export function CrmSidebar() {
  const loc = useRouterState({ select: (s) => ({ path: s.location.pathname, search: s.location.search as Record<string, unknown> }) });
  const active = groupOfPath(loc.path);
  const lang = useLang();
  const ar = digitCrm.translations ?? {};
  const t = (s: string) => lang === "ar" ? (s === "Demo dataset" ? "البيانات التجريبية" : s === "Standard Desk" ? "المكتب القياسي" : ar[s] ?? s) : s;
  const brand = lang === "ar" ? "ديجيت CRM" : "DIGIT CRM";
  const [panel, setPanel] = useState<PanelState>("auto");
  useEffect(() => { const v = sessionStorage.getItem(PANEL_KEY); if (v === "open" || v === "closed") setPanel(v); }, []);
  const wide = useWide();
  const shown = panel === "auto" ? wide : panel === "open";
  const toggle = () => { const next: PanelState = shown ? "closed" : "open"; setPanel(next); sessionStorage.setItem(PANEL_KEY, next); };
  const exit = <Link to="/" search={{ experience: "standard" } as never} onClick={() => setActiveExperience("")} className="dc-rail-btn" aria-label={t("Standard Desk")} title={t("Standard Desk")} data-dc-exit><Glyph name="exit" /></Link>;
  return (
    <nav className="dc-nav" aria-label={brand} data-no-i18n data-dc-nav data-dc-panel={panel === "auto" ? undefined : panel}>
      <div className="dc-rail" data-dc-rail>
        <Link to="/digit-crm/home" className="dc-rail-brand" aria-label={`${brand} ${t("Home")}`} title={brand}><img src={appIconFor("digit_crm", "rail")} alt="" /></Link>
        <button type="button" className="dc-rail-btn" onClick={() => openShellDialog("global-search")} aria-label={t("Search")} title={t("Search")} data-dc-search><Glyph name="search" /></button>
        <ul className="dc-rail-mods">
          {CRM_NAV.map((g) => {
            const home = groupHome(g);
            if (!home?.to) return null;
            const on = g.id === active.id;
            return <li key={g.id} data-dc-group={g.id} data-active={on || undefined}>
              <Link to={home.to as never} search={(home.search ?? {}) as never} className="dc-rail-mod" data-dc-module={g.id} data-on={on || undefined} title={t(g.label)}>
                <span className="dc-rail-ico"><Glyph name={g.icon} /></span><span className="dc-rail-label" aria-hidden>{SHORT[g.id]?.[lang === "ar" ? 1 : 0] ?? t(g.label)}</span><span className="sr-only">{t(g.label)}</span>
              </Link>
            </li>;
          })}
        </ul>
        <div className="dc-rail-foot">
          <button type="button" className="dc-rail-btn" onClick={toggle} aria-expanded={shown} aria-controls="dc-nav-panel" aria-label={t(shown ? "Hide sections" : "Show sections")} title={t(shown ? "Hide sections" : "Show sections")} data-dc-panel-toggle><Glyph name="panel" /></button>
          {exit}
        </div>
      </div>
      <div className="dc-pnav" id="dc-nav-panel" data-dc-pnav>
        <div className="dc-pnav-head">
          <span className="dc-pnav-brand">{brand}</span>
          <p className="dc-pnav-title"><Glyph name={active.icon} className="h-4 w-4" /><span>{t(active.label)}</span></p>
        </div>
        <div className="dc-pnav-items" data-dc-sections={active.id}>
          {active.items.map((i) => {
            if (!i.to) return <div key={i.label} className="dc-pnav-item dc-pnav-missing" title={i.reason ? t(i.reason) : undefined} aria-disabled="true" data-crm-kind="missing">{t(i.label)}</div>;
            const on = isItemActive(i, loc.path, loc.search, active.items);
            // The router marks prefix/search-subset matches as current too; non-selected sections only accept an exact match,
            // so assistive tech announces the same single section that is highlighted.
            return <Link key={i.label} to={i.to as never} search={(i.search ?? {}) as never} {...(on ? {} : { activeOptions: { exact: true, includeSearch: true } })} data-crm-kind={i.kind} data-dc-item={i.label} data-on={on || undefined} className="dc-pnav-item" aria-current={on ? "page" : undefined}>{t(i.label)}</Link>;
          })}
        </div>
        <Link to="/" search={{ experience: "standard" } as never} onClick={() => setActiveExperience("")} className="dc-pnav-exit"><Glyph name="exit" className="h-4 w-4" /><span>{t("Standard Desk")}</span></Link>
      </div>
    </nav>
  );
}
