/**
 * DIGIT CRM experience slots (Final Core enterprise shell). The CRM source's own navigation model (./nav.ts: seven
 * modules, their sections, longest-prefix module ownership and search-aware active items) is rendered in the shared
 * PES V1 layout — App Dock → green module rail (official icons + short labels) → green contextual sections → workspace —
 * instead of the source's dc-* sidebar, so all four apps share one look. Every destination is the same registered route;
 * "missing" items stay visible and disabled with their reason. Display only.
 */
import { Link, useRouterState } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useLang } from "@/i18n";
import { openShellDialog } from "@/lib/userSettings";
import { DigitIcon, digitIconSrc, type DigitIconName } from "@/components/enterprise/DigitIcon";
import { globalServices, RailFoot, RailLayout, RailSearch } from "@/components/plugins/ModuleRailNav";
import { EnterpriseAccount } from "@/components/enterprise/EnterpriseAccount";
import { Profiles360NavButton } from "@/components/enterprise/Open360";
import type { EnterpriseIndicator, ExperienceSlots } from "../experienceSlots";
import { digitCrm } from "./index";
import { CRM_NAV, groupHome, groupOfPath, isItemActive, type NavGroup } from "./nav";
import { appIconFor } from "@/components/enterprise/iconMap";
import { CommissionPanel } from "./CommissionPanel";

/** CRM modules → official DIGIT icons (CRM module artwork is the pack's Extended set, pending owner signature). */
export const CRM_MODULE_ICON: Record<string, DigitIconName> = {
  home: "ui-dashboard", customers: "mod-crm", pipeline: "mod-sales", activities: "trust-phone", management: "ui-user", reports: "mod-reports", admin: "ui-settings",
};
/** Rail captions: the source's short module names (full name stays the tooltip and panel title). */
const SHORT: Record<string, [string, string]> = {
  home: ["Home", "الرئيسية"], customers: ["Customers", "العملاء"], pipeline: ["Sales", "المبيعات"], activities: ["Activities", "الأنشطة"],
  management: ["Teams", "الفرق"], reports: ["Reports", "التقارير"], admin: ["Settings", "الإعدادات"],
};
const useT = () => {
  const ar = useLang() === "ar"; const tr = digitCrm.translations ?? {};
  return { ar, t: (s: string) => (ar ? (s === "Demo dataset" ? "البيانات التجريبية" : tr[s] ?? s) : s) };
};

function CrmRail({ onNavigate }: { onNavigate?: (() => void) | undefined }) {
  const { ar, t } = useT();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const active = groupOfPath(path);
  const brand = ar ? "ديجيت CRM" : "DIGIT CRM";
  return (
    <nav className="dx-rail" aria-label={ar ? "وحدات التطبيق" : "Application modules"} data-module-rail="digit_crm" data-no-i18n>
      <Link to="/digit-crm/home" onClick={() => onNavigate?.()} className="dx-rail-app" title={brand} aria-label={`${brand} — ${t("Home")}`} data-rail-app>
        <img src={appIconFor("digit_crm", "rail")} alt="" className="dx-rail-app-ico" />
      </Link>
      <RailSearch ar={ar} onNavigate={onNavigate} />
      <ul className="dx-rail-list" role="list">
        {CRM_NAV.map((g) => {
          const home = groupHome(g); if (!home?.to || g.id === "reports" || g.id === "admin") return null;
          const on = g.id === active.id;
          return (
            <li key={g.id}>
              <Link to={home.to as never} search={(home.search ?? {}) as never} onClick={() => onNavigate?.()} className="dx-rail-item" data-active={on || undefined} aria-current={on ? "true" : undefined} title={t(g.label)} data-rail-module={g.id}>
                <DigitIcon name={CRM_MODULE_ICON[g.id] ?? "ui-dashboard"} on="dark" size={24} className="dx-rail-ico" />
                <span className="dx-rail-label" aria-hidden data-long={/^\S{11,}$/.test(String(SHORT[g.id]?.[ar ? 1 : 0] ?? t(g.label))) ? "" : undefined}>{SHORT[g.id]?.[ar ? 1 : 0] ?? t(g.label)}</span><span className="sr-only">{t(g.label)}</span>
              </Link>
            </li>
          );
        })}
      </ul>
      {/* shared global services (Reports, Compliance, Settings, Help) — same order, icons and labels as every DIGIT app */}
      <RailFoot ar={ar} onNavigate={onNavigate} services={globalServices(ar, path, { reports: { to: "/digit-crm/reports", active: active.id === "reports", module: "reports" }, settings: { to: "/digit-crm/settings", active: active.id === "admin", module: "admin" } })} />
    </nav>
  );
}

function CrmContext({ account, onNavigate }: { account?: ReactNode; onNavigate?: (() => void) | undefined }) {
  const { t } = useT();
  const loc = useRouterState({ select: (s) => ({ path: s.location.pathname, search: s.location.search as Record<string, unknown> }) });
  const active: NavGroup = groupOfPath(loc.path);
  return (
    // CRM labels are translated by its own useT(), so only the CRM-owned head and list skip the shared DOM layer; the shared
    // account footer stays outside that scope and translates exactly like every other DIGIT app.
    <div className="dx-ctx" data-active-app="digit_crm" data-app-nav-layout="rail">
      <header className="dx-ctx-head" data-no-i18n>
        <DigitIcon name={CRM_MODULE_ICON[active.id] ?? "ui-dashboard"} on="dark" size={22} className="dx-ctx-mark" />
        <h2 className="dx-ctx-title">{t(active.label)}</h2>
      </header>
      <div className="dx-ctx-scroll" data-no-i18n>
        <nav aria-label={t(active.label)} data-app-module={active.id}>
          <ul className="dx-ctx-list" data-dc-sections={active.id}>
            {active.items.map((i) => {
              if (!i.to) return <li key={i.label}><span className="dx-nav-item" aria-disabled="true" title={i.reason ? t(i.reason) : undefined} data-crm-kind="missing" style={{ opacity: 0.55, cursor: "not-allowed" }}><span className="min-w-0">{t(i.label)}</span></span></li>;
              const on = isItemActive(i, loc.path, loc.search, active.items);
              return (
                <li key={i.label}>
                  <Link to={i.to as never} search={(i.search ?? {}) as never} onClick={() => onNavigate?.()} {...(on ? {} : { activeOptions: { exact: true, includeSearch: true } })} aria-current={on ? "page" : undefined} className="dx-nav-item" data-crm-kind={i.kind} data-app-nav={i.label}>
                    <span className="min-w-0">{t(i.label)}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
        <div className="dx-ctx-profiles"><Profiles360NavButton onNavigate={onNavigate} /></div>
      </div>
      <div className="dx-ctx-account"><EnterpriseAccount account={account} /></div>
    </div>
  );
}

function CrmSidebarSlot({ account, onNavigate }: { account?: ReactNode; onNavigate?: () => void }) {
  const { ar } = useT();
  return <RailLayout id="digit_crm" label={ar ? "قائمة ديجيت CRM" : "DIGIT CRM menu"} onNavigate={onNavigate}
    rail={(nav) => <CrmRail onNavigate={nav} />} context={(nav) => <CrmContext account={account} onNavigate={nav} />} />;
}

const OPEN_LEAD = ["New", "Contacted", "Nurture"];
const OPEN_DEAL = ["Qualification", "Demo/Making", "Proposal/Quotation", "Negotiation", "Ready to Close"];
/** Counts of permitted records; definitions follow the source's CRM status types (crmSourceDefaults.json). */
const INDICATORS: EnterpriseIndicator[] = [
  { id: "crm-leads-open", doctype: "CRM Lead", app: "crm", filters: [["status", "in", OPEN_LEAD]],
    label: { en: "Open leads", ar: "عملاء محتملون مفتوحون" }, definition: { en: "Leads with status New, Contacted or Nurture", ar: "عملاء محتملون بحالة جديد أو تم التواصل أو رعاية" } },
  { id: "crm-leads-unassigned", doctype: "CRM Lead", app: "crm", filters: [["status", "in", OPEN_LEAD], ["lead_owner", "is", "not set"]], tone: "attention",
    label: { en: "Unassigned leads", ar: "عملاء محتملون غير مسندين" }, definition: { en: "Open leads without a lead owner", ar: "عملاء محتملون مفتوحون بلا مسؤول" } },
  { id: "crm-deals-open", doctype: "CRM Deal", app: "crm", filters: [["status", "in", OPEN_DEAL]],
    label: { en: "Open deals", ar: "صفقات مفتوحة" }, definition: { en: "Deals in an open or ongoing stage", ar: "صفقات في مرحلة مفتوحة أو جارية" } },
  { id: "crm-tasks-open", doctype: "CRM Task", app: "crm", filters: [["status", "in", ["Backlog", "Todo", "In Progress"]]],
    label: { en: "Open CRM tasks", ar: "مهام CRM مفتوحة" }, definition: { en: "Tasks with status Backlog, Todo or In Progress", ar: "مهام بحالة متراكمة أو للتنفيذ أو قيد التنفيذ" } },
];
const HOSTED = new Set(["CRM Lead", "CRM Deal", "CRM Organization", "Contact", "CRM Task", "CRM Call Log", "FCRM Note", "Campaign", "Sales Partner", "Sales Person", "CRM Deal Status", "CRM Lead Status"]);

export const digitCrmSlots: ExperienceSlots = {
  Sidebar: (p) => <CrmSidebarSlot {...p} />,
  // commission statement form panel: lines from posted Sales Invoices, posted only through a native Journal Entry
  FormPanels: (p) => <CommissionPanel {...p} />,
  dock: { icon: appIconFor("digit_crm", "dock")!, label: "DIGIT CRM", label_ar: "ديجيت CRM", short: "CRM", short_ar: "CRM", home: "/digit-crm/home", main: ["home", "digit_crm", "reports"] },
  enterprise: {
    description: { en: "Lead intake, qualification, pipeline, activities, sales teams and forecasts on the native DIGIT CRM records.", ar: "استقبال العملاء المحتملين وتأهيلهم ومسار المبيعات والأنشطة وفرق المبيعات والتوقعات على سجلات DIGIT CRM الأصلية." },
    modules: () => CRM_NAV.map((g) => {
      const home = groupHome(g);
      const tr = digitCrm.translations ?? {};
      return { id: g.id, label: { en: g.label, ar: tr[g.label] ?? SHORT[g.id]?.[1] ?? g.label }, to: home?.to ?? "/digit-crm/home", ...(home?.search ? { search: home.search } : {}), icon: digitIconSrc(CRM_MODULE_ICON[g.id] ?? "ui-dashboard", "dark") };
    }),
    indicators: INDICATORS,
    owns: (dt) => HOSTED.has(dt),
  },
};
