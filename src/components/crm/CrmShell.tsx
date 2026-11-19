import { Link, useRouterState } from "@tanstack/react-router";
import { ContextStrip } from "@/components/enterprise/kit/templates";
import { appIconFor } from "@/components/enterprise/iconMap";
import type { ReactNode } from "react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Menu, X } from "lucide-react";
import { LangToggle } from "@/i18n/LangToggle";
import { useDevMode } from "@/lib/mode";
import { useL } from "./crmI18n";
import { CrmUserMenu, useCrmTheme } from "./CrmUserMenu";
import { CrmCommandPalette } from "./CrmCommandPalette";
import { CrmShortcuts } from "./CrmShortcuts";
import { CrmIcon, CRM_ICON_NAMES, type CrmIconName } from "./icons/CrmIcon";
import "@/lib/crmAutomation";
import { Shell } from "@/components/Shell";
import { useHydrated } from "@/components/hrms/HrShell";
import { useActiveExperience } from "@/plugins/theme";
import { isEnabled, usePluginsVersion } from "@/plugins/runtime";

/** Sidebar entries follow crm/frontend/src/router.js route names and AppSidebar.vue link order. */
const NAV: { label: string; to: string; native: boolean }[] = [
  { label: "Leads", to: "/crm/leads", native: true },
  { label: "Deals", to: "/crm/deals", native: true },
  { label: "Contacts", to: "/crm/contacts", native: true },
  { label: "Organizations", to: "/crm/organizations", native: true },
  { label: "Notes", to: "/crm/notes", native: true },
  { label: "Tasks", to: "/crm/tasks", native: true },
  { label: "Call Logs", to: "/crm/call-logs", native: true },
  { label: "Dashboard", to: "/crm/dashboard", native: true },
  { label: "Notifications", to: "/crm/notifications", native: true },
  { label: "Data Import", to: "/crm/data-import", native: true },
];

export function CrmShell({ children, header }: { children: ReactNode; header: ReactNode }) {
  const { L } = useL();
  const dev = useDevMode();
  const [theme] = useCrmTheme();
  const [mobileNav, setMobileNav] = useState(false);
  // Inside the DIGIT CRM experience the native Frappe CRM screen is hosted in that app's shell (App Dock → CRM module
  // rail → sections), so users never meet a second sidebar; without it the standalone Frappe CRM frame is unchanged.
  usePluginsVersion();
  const mounted = useHydrated(), experience = useActiveExperience();
  const path = useRouterState({ select: (r) => r.location.pathname });
  const section = NAV.find((n) => path === n.to || path.startsWith(`${n.to}/`));
  if (mounted && experience === "digit_crm" && isEnabled("digit_crm")) return (
    <Shell>
      {/* ONE STANDARD R1 (owner 2026-11-13): the hosted native screen opens under the shared Enterprise band; the native
          header row (breadcrumbs, view and record actions) stays unchanged inside the CRM frame below it. */}
      <div className="mb-3" data-crm-band><ContextStrip icon={<img src={appIconFor("digit_crm", "band")} alt="" className="h-7 w-7" data-app-badge="digit_crm" />} eyebrow={<span data-no-i18n>DIGIT CRM</span>} title={L(section?.label ?? "CRM")} /></div>
      <div data-crm-hosted="digit_crm" className={`flex min-h-[calc(100vh-7rem)] flex-col overflow-hidden rounded-lg border border-crm-line bg-crm-surface text-crm-ink ${theme === "dark" ? "crm-theme-dark" : ""}`}>
        <CrmCommandPalette /><CrmShortcuts />
        <header className="flex min-h-12 shrink-0 flex-wrap items-center gap-2 border-b border-crm-line px-3 py-1 sm:px-5">{header}</header>
        <div className="min-h-0 flex-1 overflow-auto">{children}</div>
      </div>
    </Shell>
  );
  return (
    // Until mount the hosting app is unknown (enabled apps live in browser storage): the standalone frame stays invisible
    // so a user inside DIGIT CRM never sees the native CRM sidebar flash before the shared app shell takes over.
    <div data-shell-pending={!mounted ? "" : undefined} className={`flex h-screen bg-crm-surface text-crm-ink ${theme === "dark" ? "crm-theme-dark" : ""}`}>
      {mobileNav && <div data-mobile-backdrop className="fixed inset-0 z-30 bg-crm-dark/40 sm:hidden" onClick={() => setMobileNav(false)} />}
      <aside data-mobile-sidebar={mobileNav ? "open" : undefined} className={`${mobileNav ? "fixed inset-y-0 start-0 z-40 flex w-64 shadow-lg" : "hidden"} shrink-0 flex-col border-e border-crm-line bg-crm-sidebar p-2 sm:static sm:flex sm:w-56 sm:shadow-none`}>
        <Button variant="ghost" size="icon" className="ms-auto sm:hidden" aria-label={L("Close")} onClick={() => setMobileNav(false)}><X className="h-4 w-4" /></Button>
        <CrmUserMenu />
        <CrmCommandPalette />
        <CrmShortcuts />
        <nav className="space-y-0.5">
          {NAV.map((n) => (
            <Link key={n.label} to={n.to} onClick={() => setMobileNav(false)} className="flex items-center justify-between rounded px-2 py-1.5 text-sm text-crm-ink hover:bg-crm-hover" activeProps={{ className: "bg-crm-surface shadow-sm" }}>
              <span className="flex items-center gap-2"><CrmIcon name={({ Leads: "LeadsIcon", Deals: "DealsIcon", Contacts: "ContactIcon", Organizations: "OrganizationsIcon", Notes: "NoteIcon", Tasks: "TaskIcon", "Call Logs": "PhoneIcon", Dashboard: "DashboardIcon", Notifications: "NotificationsIcon", "Data Import": "ExportIcon" } as Record<string, CrmIconName>)[n.label] || "ActivityIcon"} />{L(n.label)}</span>
              {!n.native && <span className="text-[10px] text-crm-muted" title="Opens the generic metadata form — native screen not yet reconstructed">generic</span>}
            </Link>
          ))}
        </nav>
        {dev && <details className="mt-auto border-t border-crm-line pt-2 text-[11px] text-crm-muted"><summary>{L("Source icons")}</summary><div className="grid grid-cols-5 gap-3 max-h-64 overflow-auto p-2">{CRM_ICON_NAMES.map(name => <span key={name} data-crm-source-icon={name} title={name} className="flex h-8 w-8 items-center justify-center"><CrmIcon name={name} status="Done" priority="High" /></span>)}</div></details>}
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex min-h-12 shrink-0 flex-wrap items-center gap-2 border-b border-crm-line px-3 py-1 sm:px-5"><Button variant="ghost" size="icon" className="sm:hidden" aria-label={L("Apps")} onClick={() => setMobileNav(true)}><Menu className="h-4 w-4" /></Button>{header}<LangToggle className="ms-auto" /></header>
        <div className="min-h-0 flex-1 overflow-auto">{children}</div>
      </div>
    </div>
  );
}

export function StatusDot({ color }: { color?: string }) {
  return <span className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: `var(--status-${color ?? "gray"})` }} />;
}

export function Badge({ children, tone = "gray" }: { children: ReactNode; tone?: string }) {
  return <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-crm-ink" style={{ backgroundColor: `color-mix(in oklch, var(--status-${tone}) 18%, transparent)` }}>{children}</span>;
}

export function Modal({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-auto bg-crm-dark/40 p-4 sm:p-10" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div role="dialog" aria-label={title} className="w-full max-w-3xl rounded-xl bg-crm-surface p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between"><h2 className="text-xl font-semibold">{title}</h2><button className="crm-btn" onClick={onClose} aria-label="Close">×</button></div>
        {children}
      </div>
    </div>
  );
}
