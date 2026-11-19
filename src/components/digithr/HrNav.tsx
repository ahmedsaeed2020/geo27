import { openShellDialog } from "@/lib/userSettings";
import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { LayoutGrid, PanelLeftClose, PanelLeftOpen, X } from "lucide-react";
import { DigitIcon, type DigitIconName } from "@/components/enterprise/DigitIcon";
import { EnterpriseAccount } from "@/components/enterprise/EnterpriseAccount";
import { globalServices } from "@/components/enterprise/globalServices";
import { HR_MODULE_ICON, HR_UTIL_ICON, appIconFor } from "@/components/enterprise/iconMap";
import { isEnabled, subscribePlugins } from "@/plugins/runtime";
import { SUITES } from "@/plugins/digit_hr/service";
import NATIVE, { HR_SLUGS } from "@/plugins/digit_hr/nativeMap";
import { useLang } from "@/i18n";
import { HR_MENU, menuSectionFor } from "./navigation";
import { Profiles360NavButton } from "@/components/enterprise/Open360";

const CTX = "digit-hr:ctx-sub";
export const useTx = () => { const lang = useLang(); return { lang, tx: (ar: string, en: string) => (lang === "ar" ? ar : en) }; };
export function useHrEnabled() { return useSyncExternalStore(subscribePlugins, () => isEnabled("digit_hr"), () => false); }

const ctxSub = () => (typeof window === "undefined" ? null : sessionStorage.getItem(CTX));
const setCtx = (id: string | null) => { if (typeof window !== "undefined") { if (id) sessionStorage.setItem(CTX, id); else sessionStorage.removeItem(CTX); } };
/** Keep DIGIT HR context when jumping to a native register/form from a DIGIT screen. */
export const enterHrNative = (sub: string) => setCtx(sub);
const nativeKey = (path: string) => { const m = path.match(/^\/app\/([^/]+)\/([^/]+)/); return m ? `${m[1]}/${m[2]}` : null; };

/** Subspace owning the URL: DIGIT screen prefix, else the remembered subspace when on one of its native registers. */
export function subFor(path: string): string | undefined {
  const sm = path.match(/^\/digit-hr\/s\/([^/]+)/); if (sm) return decodeURIComponent(sm[1] ?? "");
  for (const s of SUITES) for (const x of s.subs) if (x.to && path.startsWith(x.to)) return x.id;
  const k = nativeKey(path); const c = ctxSub();
  if (k && c && (NATIVE[c] ?? []).some((t) => `${t.app}/${t.slug}` === k)) return c;
  return undefined;
}
export const suiteFor = (path: string) => { const mm = path.match(/^\/digit-hr\/m\/([^/]+)/); if (mm) return mm[1]; const sub = menuSectionFor(path, ctxSub()) ?? subFor(path); return sub ? SUITES.find((s) => s.subs.some((x) => x.id === sub))?.id : undefined; };

/** One official DIGIT icon per primary module (shared DIGIT Enterprise icon library, iconMap.ts); meaning is fixed per module. */
const modIcon = (id: string): DigitIconName => HR_MODULE_ICON[id] ?? "mod-hr";
/** Short rail captions. Each is a substring of the module's full name, so the accessible name contains the visible label (WCAG 2.5.3). */
const RAIL_SHORT: Record<string, [string, string]> = { "01": ["الأساسية", "Core HR"], "02": ["المواهب", "Human Capital"], "03": ["القوى العاملة", "Workforce"], "04": ["الرواتب", "Payroll"], "05": ["الخدمة الذاتية", "Experience"], "06": ["ذكاء الموارد", "Intelligence"], "07": ["الحوكمة", "Governance"] };
const isHome = (path: string) => path === "/digit-hr" || path === "/digit-hr/";
/** Router links mark themselves aria-current on a fuzzy (prefix) match; HR utilities are current only on their exact page. */
const EXACT = { exact: true } as const;
/** "All sections & documents" jumps to the #sections anchor of the module page: current only while that anchor is the location. */
const HASH_EXACT = { exact: true, includeHash: true } as const;

/**
 * Visual Fidelity V2 navigation (portable experience system): App Dock → HR primary module rail → the selected module's
 * contextual sidebar. The rail lists Mission Control, the seven modules and the Report Center (icon + short caption);
 * the contextual sidebar lists only the shown module's Overview, every approved section and "All sections & documents".
 * Collapsing hides the contextual sidebar and keeps the rail. Inside the phone drawer a module tap previews its sections
 * (no navigation) so a section stays one tap away. Destinations are unchanged from NB-1; documents and reports live inside
 * the section workspace, never as sidebar leaves.
 */
export function HrNav({ path, collapsed, onCollapse, onNavigate, account }: { path: string; collapsed: boolean; onCollapse?: () => void; onNavigate?: () => void; /** Core avatar menu (settings, switch user) from the experience slot */ account?: ReactNode }) {
  const { tx, lang } = useTx();
  const drawer = !!onNavigate;
  const home = isHome(path);
  const active = home ? undefined : suiteFor(path);
  const selected = home ? undefined : menuSectionFor(path, ctxSub());
  const [peek, setPeek] = useState<string | undefined>(undefined);
  useEffect(() => { setPeek(undefined); }, [path]);
  const shown = peek ?? active;
  const mod = HR_MENU.find((m) => m.id === shown);
  const finish = (section?: string) => { setCtx(section ?? null); onNavigate?.(); };
  const reports = path === "/digit-hr/reports" || path.startsWith("/digit-hr/reports/");
  const Toggle = drawer ? X : collapsed ? PanelLeftOpen : PanelLeftClose;
  const toggleLabel = drawer ? tx("إغلاق القائمة", "Close menu") : collapsed ? tx("إظهار أقسام الوحدة", "Show module sections") : tx("إخفاء أقسام الوحدة", "Hide module sections");
  const util = (to: "/digit-hr" | "/digit-hr/reports", icon: DigitIconName, full: [string, string], short: [string, string], on: boolean, section?: string) => (
    <Link to={to} activeOptions={EXACT} onClick={() => finish(section)} data-active={on || undefined} aria-current={on ? "page" : undefined} title={tx(...full)} aria-label={tx(...full)} className="dhr-rail-item" data-hr-util={to}>
      <DigitIcon name={icon} on="dark" className="dhr-nav-ico" /><span className="dhr-rail-cap" aria-hidden>{tx(...short)}</span>
    </Link>
  );
  return (
    <nav aria-label={tx("وحدات الموارد البشرية", "HR modules")} data-dhr-nav data-collapsed={collapsed || undefined} className="dhr-side flex h-full">
      <div className="dhr-rail flex h-full w-[var(--dx-rail-w)] shrink-0 flex-col" data-hr-rail>
        <Link to="/digit-hr" activeOptions={EXACT} onClick={() => finish()} className="dhr-rail-brand" title={tx("ديجيت للموارد البشرية", "DIGIT HR")} aria-label={tx("ديجيت للموارد البشرية — مركز القيادة", "DIGIT HR — Mission Control")} data-hr-brand>
          <img src={appIconFor("digit_hr", "rail")} alt="" aria-hidden="true" className="h-8 w-8" />
        </Link>
        {/* search under the app tile, like DIGIT Pro and every DIGIT app */}
        <button type="button" onClick={() => { finish(); openShellDialog("global-search"); }} title={tx("بحث", "Search")} aria-label={tx("بحث", "Search")} className="dhr-rail-item mx-1" data-rail-search>
          <DigitIcon name="ui-search" on="dark" className="dhr-nav-ico" /><span className="dhr-rail-cap" aria-hidden>{tx("بحث", "Search")}</span>
        </button>
        <div className="min-h-0 flex-1 overflow-y-auto px-1 pb-2 pt-1 [scrollbar-width:none]">
          {util("/digit-hr", HR_UTIL_ICON.home, ["مركز قيادة الموارد البشرية", "HR Mission Control"], ["مركز قيادة", "Mission Control"], home)}
          <div className="dhr-rail-sep" aria-hidden />
          <ul aria-label={tx("الوحدات", "Modules")} className="grid gap-1">
            {HR_MENU.map((module) => {
              const here = path === `/digit-hr/m/${module.id}`;
              const on = active === module.id;
              const label = tx(module.ar, module.en);
              const cap = RAIL_SHORT[module.id] ?? [module.ar, module.en];
              const body = <><DigitIcon name={modIcon(module.id)} on="dark" className="dhr-nav-ico" /><span className="dhr-rail-cap" aria-hidden>{tx(...cap)}</span></>;
              return (
                <li key={module.id} data-hr-module={module.id} data-active={on || undefined}>
                  {drawer
                    ? <button type="button" onClick={() => setPeek(module.id)} aria-pressed={shown === module.id} aria-controls="dhr-ctxbar" data-suite={module.id} data-active={on || undefined} data-shown={shown === module.id || undefined} title={label} aria-label={label} className="dhr-rail-item">{body}</button>
                    : <Link to="/digit-hr/m/$module" params={{ module: module.id }} activeOptions={EXACT} data-suite={module.id} data-active={on || undefined} data-shown={shown === module.id || undefined}
                        aria-current={here ? "page" : on ? "true" : undefined} onClick={() => finish()} title={label} aria-label={label} className="dhr-rail-item">{body}</Link>}
                </li>
              );
            })}
          </ul>
        </div>
        <div className="dhr-rail-foot grid gap-1 px-1 py-2" data-rail-services>
          {/* shared global services (Reports, Compliance, Settings, Help) — same order, icons and labels as every DIGIT app */}
          {globalServices(lang === "ar", path, {
            reports: { to: "/digit-hr/reports", active: reports, exact: path === "/digit-hr/reports", onClick: () => finish("06.3") },
            compliance: { to: "/digit-hr/compliance", active: path === "/digit-hr/compliance", exact: true, onClick: () => finish() },
            settings: { to: "/app/$app/$doctype/$name", params: { app: "hrms", doctype: "hr-settings", name: "HR Settings" }, active: path.startsWith("/app/hrms/hr-settings"), exact: decodeURIComponent(path) === "/app/hrms/hr-settings/HR Settings", onClick: () => finish() },
            help: { to: "/help", active: path === "/help", exact: true, onClick: () => finish() },
          }).map((x) => (
            <Link key={x.key} to={x.to as never} params={x.params as never} activeOptions={EXACT} onClick={() => x.onClick?.()} data-active={x.active || undefined} aria-current={x.active ? (x.exact ? "page" : "true") : undefined} title={x.label} aria-label={x.label} className="dhr-rail-item" data-rail-service={x.key} {...(x.key === "reports" ? { "data-hr-util": "/digit-hr/reports" } : {})}>
              <DigitIcon name={x.icon as DigitIconName} on="dark" className="dhr-nav-ico" /><span className="dhr-rail-cap" aria-hidden>{x.label}</span>
            </Link>
          ))}
          {account && collapsed && !drawer && <div className="dhr-rail-account" data-hr-account>{account}</div>}
          {onCollapse && <button type="button" onClick={onCollapse} aria-expanded={drawer ? undefined : !collapsed} aria-controls={drawer ? undefined : "dhr-ctxbar"} aria-label={toggleLabel} title={toggleLabel} className="dhr-rail-item dhr-rail-toggle" data-nav-collapse>
            <Toggle className="h-5 w-5 rtl:-scale-x-100" strokeWidth={1.75} aria-hidden />
          </button>}
        </div>
      </div>
      {!collapsed && (
        <div id="dhr-ctxbar" role="group" aria-labelledby="dhr-ctxbar-title" className="dhr-ctxbar flex h-full w-[var(--dx-ctx-w)] min-w-0 flex-col" data-hr-context={mod?.id ?? "home"}>
          <div className="dhr-head flex h-[var(--dx-ctx-head-h)] shrink-0 items-center gap-2.5 px-4">
            <DigitIcon name={mod ? modIcon(mod.id) : HR_UTIL_ICON.home} on="dark" className="h-5 w-5 shrink-0" />
            <span id="dhr-ctxbar-title" className="dhr-ctx-title min-w-0">{mod ? tx(mod.ar, mod.en) : tx("ديجيت للموارد البشرية", "DIGIT HR")}</span>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3 pt-2">
            {mod ? (() => {
              const here = path === `/digit-hr/m/${mod.id}`;
              return (
                <ul id={`dhr-module-${mod.id}`} className="dhr-nav-ctx" data-module-children={mod.id} aria-label={tx(`أقسام ${mod.ar}`, `${mod.en} sections`)}>
                  <li><Link to="/digit-hr/m/$module" params={{ module: mod.id }} activeOptions={EXACT} onClick={() => finish()} data-active={here || undefined} aria-current={here ? "page" : undefined} className="dhr-nav-sub" data-module-overview={mod.id}>{tx("نظرة عامة على الوحدة", "Module overview")}</Link></li>
                  <li className="dhr-ctx-sep" aria-hidden />
                  {mod.sections.map((section) => {
                    const on = selected === section.id; const exact = path === `/digit-hr/s/${section.id}`;
                    return <li key={section.id} data-hr-section={section.id}>
                      <Link to="/digit-hr/s/$section" params={{ section: section.id }} activeOptions={EXACT} onClick={() => finish(section.id)} className="dhr-nav-sub" data-active={on || undefined} aria-current={exact ? "page" : on ? "true" : undefined}>
                        <span className="min-w-0 break-words">{tx(section.ar, section.en)}</span>
                      </Link>
                    </li>;
                  })}
                  <li className="dhr-ctx-sep" aria-hidden />
                  <li><Link to="/digit-hr/m/$module" params={{ module: mod.id }} hash="sections" activeOptions={HASH_EXACT} onClick={() => finish()} className="dhr-nav-sub dhr-nav-all" data-module-all={mod.id}><LayoutGrid className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} aria-hidden /><span className="min-w-0 flex-1">{tx("كل الأقسام والمستندات", "All sections & documents")}</span><b className="dhr-ctx-count" data-no-i18n>{mod.sections.length}</b></Link></li>
                </ul>
              );
            })() : (
              <ul className="dhr-nav-ctx" aria-label={tx("مركز الموارد البشرية", "HR hub")} data-hr-hub>
                <li><Link to="/digit-hr" activeOptions={EXACT} onClick={() => finish()} data-active={home || undefined} aria-current={home ? "page" : undefined} className="dhr-nav-sub" data-hub-home>{tx("مركز قيادة الموارد البشرية", "HR Mission Control")}</Link></li>
                <li><Link to="/digit-hr/reports" activeOptions={EXACT} onClick={() => finish("06.3")} data-active={reports || undefined} aria-current={reports ? "page" : undefined} className="dhr-nav-sub" data-hub-reports>{tx("مركز التقارير", "Report Center")}</Link></li>
                <li className="dhr-ctx-sep" aria-hidden />
                <li className="dhr-nav-label" aria-hidden>{tx("نظرة عامة على الوحدات", "Module overviews")}</li>
                {HR_MENU.map((m) => <li key={m.id}><Link to="/digit-hr/m/$module" params={{ module: m.id }} activeOptions={EXACT} onClick={() => finish()} className="dhr-nav-sub" data-hub-module={m.id}><span className="min-w-0 break-words">{tx(m.ar, m.en)}</span></Link></li>)}
              </ul>
            )}
          </div>
          {/* shared DIGIT Enterprise account footer (company, role, preferences, width) above the Core user menu */}
          {/* owner SH-05: «ملفات 360» is an ordinary entry of the app navigation, as in every other DIGIT app */}
          <div className="dx-ctx-profiles" data-hr-profiles-360><Profiles360NavButton onNavigate={() => finish()} /></div>
          <div className="dx-ctx-account" data-hr-account><EnterpriseAccount account={account} /></div>
        </div>
      )}
    </nav>
  );
}

/**
 * Mounted by every Core Shell through the DIGIT HR experience slot (useShellEffects): forgets the remembered HR section
 * once the user leaves DIGIT HR screens and HR native registers, so a later native visit is not highlighted as HR.
 */
export function useHrContextReset() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const k = nativeKey(path);
  useEffect(() => { if (!path.startsWith("/digit-hr") && !(k && HR_SLUGS.has(k))) setCtx(null); }, [path, k]);
}
