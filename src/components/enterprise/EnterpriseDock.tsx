import { Link, useRouterState } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { AppLogo } from "@/components/desk/AppLogo";
import { AssistantDockButton } from "@/components/assistant/AssistantHost";
import { useLang } from "@/i18n";
import { DOCK_APPS, useDock } from "@/lib/userSettings";
import { exitApp } from "@/plugins/appShell";
import { DESK_HOME, ENTERPRISE_HOME, useEnterprise, type EnterpriseApp } from "@/plugins/enterprise";
import { useExperienceSlots } from "@/plugins/experienceSlots";
import { setActiveExperience } from "@/plugins/theme";
import { DigitIcon, digitIconSrc } from "./DigitIcon";
import { DESK_LAUNCHER_ICON, appTile } from "./iconMap";

/** Choosing Enterprise Home or a Desk launcher leaves the active app experience (presentation only). */
export function leaveExperience() { setActiveExperience(""); exitApp(); }

const T = {
  home: { en: "Enterprise Home", ar: "الرئيسية" },
  desk: { en: "Desk", ar: "المكتب" },
  deskHome: { en: "Desk Home", ar: "رئيسية المكتب" },
  deskHint: { en: "Native DIGIT / DIGIT (administrators)", ar: "مكتب DIGIT / DIGIT الأصلي (للمسؤولين)" },
  plugins: { en: "Apps & Plugins", ar: "التطبيقات والإضافات" },
  apps: { en: "DIGIT applications", ar: "تطبيقات ديجيت" },
};
export const tEnt = (k: keyof typeof T, ar: boolean) => (ar ? T[k].ar : T[k].en);

/**
 * App icon in the shared 36px tile. With `app` set (a DIGIT app), the tile follows DIGIT Pro's tile exactly for every app
 * (iconMap appTile: official dark artwork on the deep-green square); otherwise icons that carry their own tile fill it and
 * bare marks sit on a white tile (Enterprise Home entry, Desk launchers).
 */
export function AppTile({ icon, tile, size = "md", app }: { icon: string; tile?: boolean | undefined; size?: "md" | "lg"; app?: string | undefined }) {
  const brand = app ? appTile(app) : undefined;
  const kind = brand ? (brand.kind === "own" ? "dx-tile-own" : "dx-tile-own dx-tile-brand") : tile ? "dx-tile-own" : "";
  return <span className={`dx-tile ${size === "lg" ? "dx-tile-lg" : ""} ${kind}`} data-app-tile={app} data-tile-kind={brand?.kind} aria-hidden><img src={brand?.icon ?? icon} alt="" /></span>;
}

export const appLabel = (a: EnterpriseApp, ar: boolean) => (ar ? a.dock.label_ar ?? a.title_ar : a.dock.label);
/** Dock caption: the approved short name (برو، الموارد البشرية، المقاولات، CRM), so it never truncates; the full name stays in the tooltip. */
export const dockLabel = (a: EnterpriseApp, ar: boolean) => (ar ? a.dock.short_ar : a.dock.short) ?? appLabel(a, ar);
/** Router links are current on a prefix match; dock tiles are current pages only on their exact address. */
const EXACT = { exact: true } as const;

/**
 * DIGIT Enterprise app selector (shared Shell, enterprise mode): Enterprise Home, then every enabled + permitted DIGIT
 * app, then — for Desk-authorised users only — one Desk entry holding the native launchers. `variant="grid"` renders the
 * same entries for phone drawers. One component serves the Desk, Enterprise Home and every app experience.
 */
export function EnterpriseDock({ variant = "rail", onNavigate }: { variant?: "rail" | "grid"; onNavigate?: (() => void) | undefined }) {
  const { apps, deskEntry } = useEnterprise();
  const ar = useLang() === "ar";
  const xp = useExperienceSlots();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const onHome = path === ENTERPRISE_HOME;
  const inDesk = !xp && !onHome;
  const grid = variant === "grid";
  return (
    <nav data-dock={grid ? undefined : ""} data-dock-enterprise data-dock-variant={variant} aria-label={tEnt("apps", ar)} className={grid ? "dx-dock-grid" : "us-dock dx-dock"}>
      {/* exact: the router's prefix match would announce an app tile as the current page on every page inside the app;
          the tile of the active app says aria-current="true" (current app), "page" only on the app's own home */}
      {apps.filter((a) => /crm/i.test(a.name)).map((a) => {
        const on = xp?.name === a.name;
        return (
          <Link key={a.name} to={a.dock.home as "/"} activeOptions={EXACT} data-dock-app={a.name} data-active={on || undefined} aria-current={on ? "true" : undefined} title={appLabel(a, ar)} onClick={() => onNavigate?.()} className="dx-dock-item">
            <AppTile icon={a.dock.icon} tile={a.dock.tile} app={a.name} />
            <span className="dx-dock-label" data-no-i18n data-dock-short>{dockLabel(a, ar)}</span>
          </Link>
        );
      })}
      {deskEntry && <DeskEntry active={inDesk} grid={grid} onNavigate={onNavigate} />}
      <AssistantDockButton grid={grid} onNavigate={onNavigate} />
    </nav>
  );
}

/** One Desk entry (administrators / System Manager / Developer mode): Desk Home, the native launchers and Apps & Plugins. */
function DeskEntry({ active, grid, onNavigate }: { active: boolean; grid: boolean; onNavigate?: (() => void) | undefined }) {
  const ar = useLang() === "ar";
  const ids = useDock();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") { setOpen(false); btn.current?.focus(); } };
    const out = (e: MouseEvent) => { if (root.current && !root.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("keydown", key); document.addEventListener("mousedown", out);
    return () => { document.removeEventListener("keydown", key); document.removeEventListener("mousedown", out); };
  }, [open]);
  useEffect(() => { if (open) root.current?.querySelector<HTMLElement>("[role=menuitem]")?.focus(); }, [open]);
  const launchers = DOCK_APPS.filter((a) => a.id !== "home" && ids.includes(a.id));
  const pick = () => { leaveExperience(); setOpen(false); onNavigate?.(); };
  return (
    <div ref={root} className={grid ? "dx-desk-grid" : "dx-desk"} data-dock-desk-wrap>
      <button ref={btn} type="button" data-dock-desk data-active={active || undefined} aria-haspopup="menu" aria-expanded={open} title={tEnt("deskHint", ar)} onClick={() => setOpen(!open)} className="dx-dock-item">
        <span className="dx-tile" aria-hidden><img src={digitIconSrc("svc-erpnext")} alt="" /></span>
        <span className="dx-dock-label">{tEnt("desk", ar)}</span>
      </button>
      {open && (
        <div role="menu" aria-label={tEnt("deskHint", ar)} data-dock-desk-menu className="dx-desk-menu">
          <p className="dx-desk-menu-hint">{tEnt("deskHint", ar)}</p>
          <Link role="menuitem" to={DESK_HOME} onClick={pick} data-dock-app="desk-home" className="dx-desk-menu-item"><DigitIcon name={DESK_LAUNCHER_ICON["home"]!} size={22} className="dx-desk-menu-ico" /><span>{tEnt("deskHome", ar)}</span></Link>
          {launchers.map((a) => (
            <Link key={a.id} role="menuitem" to={a.to as "/"} params={(a.app ? { app: a.app } : {}) as never} onClick={pick} data-dock-app={a.id} className="dx-desk-menu-item">{DESK_LAUNCHER_ICON[a.id] ? <DigitIcon name={DESK_LAUNCHER_ICON[a.id]!} size={22} className="dx-desk-menu-ico" /> : <AppLogo id={a.id} />}<span>{a.label}</span></Link>
          ))}
          <Link role="menuitem" to="/plugins" onClick={pick} data-dock-app="plugins" className="dx-desk-menu-item dx-desk-menu-sep"><DigitIcon name="feat-integrations" size={22} className="dx-desk-menu-ico" /><span>{tEnt("plugins", ar)}</span></Link>
        </div>
      )}
    </div>
  );
}
