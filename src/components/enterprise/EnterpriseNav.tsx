import { Link, useRouterState } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import { useLang } from "@/i18n";
import { useDevMode } from "@/lib/mode";
import { openShellDialog } from "@/lib/userSettings";
import { DESK_HOME, ENTERPRISE_HOME, useEnterprise, type EnterpriseApp } from "@/plugins/enterprise";
import { appLabel, AppTile, leaveExperience } from "./EnterpriseDock";
import { DIGIT_LOGO, DigitIcon } from "./DigitIcon";
import { EnterpriseAccount } from "./EnterpriseAccount";
import { Profiles360NavButton } from "./Open360";

const L = {
  title: { en: "DIGIT Enterprise", ar: "ديجيت للمؤسسات" },
  home: { en: "Enterprise Home", ar: "الرئيسية" },
  search: { en: "Search", ar: "بحث" },
  apps: { en: "Applications", ar: "التطبيقات" },
  admin: { en: "Administration", ar: "الإدارة" },
  desk: { en: "Desk Home", ar: "رئيسية المكتب" },
  plugins: { en: "Apps & Plugins", ar: "التطبيقات والإضافات" },
  settings: { en: "Settings", ar: "الإعدادات" },
  dev: { en: "Developer", ar: "المطوّر" },
  none: { en: "No DIGIT application is enabled for you.", ar: "لا يوجد تطبيق ديجيت مفعّل لك." },
  expand: { en: "Show modules", ar: "عرض الوحدات" },
};

/** Contextual navigation of the Enterprise Home (same geometry and behaviour as the app contextual menus). */
export function EnterpriseNav({ account, onNavigate }: { account?: ReactNode; onNavigate?: (() => void) | undefined }) {
  const ar = useLang() === "ar"; const t = (k: keyof typeof L) => (ar ? L[k].ar : L[k].en);
  const { apps, desk, deskEntry } = useEnterprise(); const dev = useDevMode();
  const path = useRouterState({ select: (s) => s.location.pathname });
  return (
    <div className="dx-ctx" data-enterprise-nav>
      <header className="dx-ctx-head">
        <img src={DIGIT_LOGO.white} alt="" className="dx-ctx-mark" />
        <h2 className="dx-ctx-title">{t("title")}</h2>
      </header>
      <div className="dx-ctx-scroll">
        <ul className="dx-ctx-list">
          <li><Link to={ENTERPRISE_HOME} onClick={() => onNavigate?.()} className="dx-nav-item dx-nav-pin" data-active={path === ENTERPRISE_HOME || undefined} aria-current={path === ENTERPRISE_HOME ? "page" : undefined}><DigitIcon name="ui-dashboard" on="dark" size={18} className="dx-nav-ico" />{t("home")}</Link></li>
          <li><button type="button" onClick={() => { onNavigate?.(); openShellDialog("global-search"); }} className="dx-nav-item"><DigitIcon name="ui-search" on="dark" size={18} className="dx-nav-ico" />{t("search")}</button></li>
          <li><Profiles360NavButton onNavigate={onNavigate} /></li>
        </ul>
        <p className="dx-nav-label">{t("apps")}</p>
        {apps.length === 0 && <p className="dx-nav-empty">{t("none")}</p>}
        <ul className="dx-ctx-list">{apps.map((a) => <AppGroup key={a.name} a={a} ar={ar} expandLabel={t("expand")} onNavigate={onNavigate} />)}</ul>
        {desk && <>
          <p className="dx-nav-label">{t("admin")}</p>
          <ul className="dx-ctx-list">
            {deskEntry && <li><Link to={DESK_HOME} onClick={() => { leaveExperience(); onNavigate?.(); }} className="dx-nav-item" data-nav-desk-home><DigitIcon name="svc-erpnext" on="dark" size={18} className="dx-nav-ico" />{t("desk")}</Link></li>}
            <li><Link to="/plugins" onClick={() => onNavigate?.()} className="dx-nav-item" data-nav-plugins><DigitIcon name="feat-integrations" on="dark" size={18} className="dx-nav-ico" />{t("plugins")}</Link></li>
            <li><Link to="/settings" onClick={() => onNavigate?.()} className="dx-nav-item"><DigitIcon name="ui-settings" on="dark" size={18} className="dx-nav-ico" />{t("settings")}</Link></li>
            {dev && <li><Link to="/developer/sdk" onClick={() => onNavigate?.()} className="dx-nav-item" data-nav-dev-sdk><DigitIcon name="svc-customization" on="dark" size={18} className="dx-nav-ico" />{t("dev")}</Link></li>}
          </ul>
        </>}
      </div>
      <div className="dx-ctx-account"><EnterpriseAccount account={account} /></div>
    </div>
  );
}

/** One line per installed app; its modules stay collapsed (PES V1: the module rail of the opened app lists them, never a
 *  long nested accordion on Home). */
function AppGroup({ a, ar, expandLabel, onNavigate }: { a: EnterpriseApp; ar: boolean; expandLabel: string; onNavigate?: (() => void) | undefined }) {
  const [open, setOpen] = useState(false);
  const mods = a.entry?.modules() ?? [];
  const id = `dx-mods-${a.name}`;
  return (
    <li data-enterprise-app={a.name}>
      <div className="dx-nav-app">
        <Link to={a.dock.home as "/"} onClick={() => onNavigate?.()} className="dx-nav-item dx-nav-app-link"><AppTile icon={a.dock.icon} tile={a.dock.tile} app={a.name} /><span className="min-w-0 truncate" data-no-i18n>{appLabel(a, ar)}</span></Link>
        {mods.length > 0 && <button type="button" className="dx-nav-toggle" aria-expanded={open} aria-controls={id} aria-label={`${expandLabel}: ${appLabel(a, ar)}`} onClick={() => setOpen(!open)}><DigitIcon name="ui-chevron" on="dark" size={14} className={`dx-chev ${open ? "dx-chev-open" : ""}`} /></button>}
      </div>
      {open && mods.length > 0 && (
        <ul id={id} className="dx-nav-sub">
          {mods.map((m) => <li key={m.id}><Link to={m.to as "/"} search={(m.search ?? {}) as never} onClick={() => onNavigate?.()} className="dx-nav-item dx-nav-subitem" data-enterprise-module={`${a.name}:${m.id}`} data-no-i18n>{m.icon && <img src={m.icon} alt="" className="dx-nav-ico dx-nav-ico-sm" />}{ar ? m.label.ar : m.label.en}</Link></li>)}
        </ul>
      )}
    </li>
  );
}
