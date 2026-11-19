import { Link, useNavigate } from "@tanstack/react-router";
import { useHydrated } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { adapter, useStoreVersion, type Doc } from "@/lib/adapter";
import { ADMIN, useSessionUser } from "@/lib/session";
import { setLang } from "@/i18n";
import { Modal } from "./CrmShell";
import { useL } from "./crmI18n";
import { CrmIcon } from "./icons/CrmIcon";
import { CrmWorkflow } from "./CrmWorkflow";
import { CrmRuleEditor } from "./CrmRuleEditor";
import { CrmLayoutEditor } from "./CrmLayoutEditor";
import { CrmHierarchy } from "./CrmHierarchy";
import { CrmHomeActions, dropdownItems } from "./CrmHomeActions";
import { CrmForms } from "./CrmForms";
import { CrmProfile } from "./CrmProfile";
import { CrmEmailTemplates } from "./CrmEmailTemplates";
import { CrmEnrichment } from "./CrmEnrichment";
import { CrmSystemSettings } from "./CrmSystemSettings";

/** Display name of the simulated session user (users store getUser().full_name). */
export function useUserFullName(): string {
  useStoreVersion();
  const u = useSessionUser();
  const { L } = useL();
  const hyd = useHydrated();
  if (!hyd) return L("Administrator");
  const d = adapter.get("User", u);
  const n = String(d?.["full_name"] || [d?.["first_name"], d?.["last_name"]].filter(Boolean).join(" ") || "");
  return n || (u === ADMIN ? L("Administrator") : u);
}

const THEME_KEY = "digit-crm:theme";
export function useCrmTheme() {
  const [theme, setTheme] = useState<"light" | "dark">("light");
  useEffect(() => { setTheme(localStorage.getItem(THEME_KEY) === "dark" ? "dark" : "light"); }, []);
  const set = (t: "light" | "dark") => { localStorage.setItem(THEME_KEY, t); setTheme(t); window.dispatchEvent(new Event("crm-theme")); };
  useEffect(() => { const h = () => setTheme(localStorage.getItem(THEME_KEY) === "dark" ? "dark" : "light"); window.addEventListener("crm-theme", h); return () => window.removeEventListener("crm-theme", h); }, []);
  return [theme, set] as const;
}

/**
 * UserDropdown.vue: items from crm/hooks.py standard_dropdown_items
 * (app_selector → Apps submenu, settings, login_to_fc [hidden: not an FC site], about, separator, logout).
 * Apps submenu = deskApp() + crmSiblingApps(frappe.apps.get_apps) → Desk, Frappe HR, Insights.
 */
export function CrmUserMenu() {
  const { L } = useL();
  const name = useUserFullName();
  const [open, setOpen] = useState(false);
  const [apps, setApps] = useState(false);
  const [settings, setSettings] = useState(false);
  const [initialTab, setInitialTab] = useState<string | undefined>();
  useEffect(() => { const h = (e: Event) => { setInitialTab(undefined); window.setTimeout(() => setInitialTab((e as CustomEvent<string>).detail)); setSettings(true); }; window.addEventListener("crm-open-settings", h); return () => window.removeEventListener("crm-open-settings", h); }, []);
  const [about, setAbout] = useState(false);
  const [theme, setTheme] = useCrmTheme();
  const nav = useNavigate();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) { setOpen(false); setApps(false); } };
    document.addEventListener("mousedown", h); return () => document.removeEventListener("mousedown", h);
  }, []);
  const all = dropdownItems(); const hiddenStd = new Set(all.filter(x => x.is_standard && x.hidden).map(x => x.name1)); const custom = all.filter(x => !x.is_standard && !x.hidden);
  const item = "flex w-full items-center gap-2 rounded px-2 py-1.5 text-start text-sm hover:bg-crm-hover";
  return (
    <div ref={ref} className="relative mb-3">
      <button aria-label={L("User menu")} aria-expanded={open} onClick={() => setOpen(!open)} className={`flex h-12 w-full items-center gap-2 rounded-md px-2 ${open ? "bg-crm-surface shadow-sm" : "hover:bg-crm-hover"}`}>
        <CrmIcon name="CRMLogo" className="h-8 w-8 shrink-0" />
        <div className="min-w-0 flex-1 text-start leading-tight"><div className="truncate text-sm font-semibold" data-no-i18n>CRM</div><div className="truncate text-[12px] text-crm-muted" data-no-i18n>{name}</div></div>
        <span className="text-crm-muted" aria-hidden>▾</span>
      </button>
      {open && (
        <div role="menu" className="absolute inset-x-0 top-13 z-40 rounded-lg border border-crm-line bg-crm-surface p-1 shadow-lg">
          <div className="relative">
            <button role="menuitem" className={item} onClick={() => setApps(!apps)}><CrmIcon name="AppsIcon" />{L("Apps")}<span className="ms-auto text-crm-muted">›</span></button>
            {apps && (
              <div role="menu" aria-label={L("Apps")} className="mt-1 space-y-0.5 rounded-md border border-crm-line bg-crm-sidebar p-1">
                <Link role="menuitem" to="/" className={item}>{L("Desk")}</Link>
                <Link role="menuitem" to="/hr" className={item}>{L("Frappe HR")}</Link>
                <Link role="menuitem" to="/insights" className={item}>{L("Insights")}</Link>
              </div>
            )}
          </div>
          {!hiddenStd.has("settings") && <button role="menuitem" className={item} onClick={() => { setSettings(true); setOpen(false); }}><span aria-hidden>⚙</span>{L("Settings")}</button>}
          <button role="menuitem" className={item} onClick={() => setTheme(theme === "dark" ? "light" : "dark")}><span aria-hidden>◐</span>{L("Theme")}<span className="ms-auto text-xs text-crm-muted">{L(theme === "dark" ? "Dark" : "Light")}</span></button>
          {!hiddenStd.has("about") && <button role="menuitem" className={item} onClick={() => { setAbout(true); setOpen(false); }}><span aria-hidden>ⓘ</span>{L("About")}</button>}
          {custom.map((c, i) => c.type === "Separator" ? <div key={i} className="my-1 border-t border-crm-line" /> : <a key={i} role="menuitem" className={item} href={c.route} target={c.open_in_new_window !== 0 ? "_blank" : undefined} rel="noreferrer" data-no-i18n>{c.label}</a>)}
          <div className="my-1 border-t border-crm-line" />
          <button role="menuitem" className={item} onClick={() => nav({ to: "/login" })}><span aria-hidden>⎋</span>{L("Log out")}</button>
        </div>
      )}
      {settings && <CrmSettings initial={initialTab} onClose={() => { setSettings(false); setInitialTab(undefined); }} />}
      {about && <AboutModal onClose={() => setAbout(false)} />}
    </div>
  );
}

/** Modals/AboutModal.vue — CRM logo, version and the five source links. */
function AboutModal({ onClose }: { onClose: () => void }) {
  const { L } = useL();
  const links: [string, string][] = [["Website", "https://frappe.io/crm"], ["GitHub Repository", "https://github.com/frappe/crm"], ["Documentation", "https://docs.frappe.io/crm"], ["Report an Issue", "https://github.com/frappe/crm/issues"], ["Contact Support", "https://support.frappe.io"]];
  return (
    <Modal title={L("About")} onClose={onClose}>
      <div className="flex items-center gap-3"><div className="flex h-12 w-12 items-center justify-center rounded-lg bg-crm-dark text-lg font-bold text-crm-surface">C</div><div><div className="text-lg font-semibold">DIGIT CRM</div><div className="text-sm text-crm-muted">{L("Open-source CRM for growing businesses")}</div></div></div>
      <div className="mt-4 space-y-1">{links.map(([l, u]) => <a key={u} href={u} target="_blank" rel="noreferrer" className="block rounded px-2 py-1.5 text-sm hover:bg-crm-hover">{L(l)}</a>)}</div>
    </Modal>
  );
}

type Tab = { label: string; invite?: boolean; dt?: string; cols?: string[]; single?: string; fields?: string[]; server?: boolean; prefs?: boolean };
/** Settings/Settings.vue tab groups in source order. */
const GROUPS: [string, Tab[]][] = [
  ["User Configuration", [{ label: "Profile", dt: "User", single: "__me", fields: ["first_name", "last_name", "email", "mobile_no"] }, { label: "Preferences", prefs: true }]],
  ["System Configuration", [{ label: "General", single: "FCRM Settings", fields: ["restore_defaults", "auto_update_expected_deal_value", "enable_forecasting", "currency"] }, { label: "Dashboard", server: true }, { label: "Defaults", single: "FCRM Settings", fields: ["currency", "enable_forecasting"] }, { label: "Brand", single: "Website Settings", fields: ["app_name", "app_logo", "favicon"] }]],
  ["User Management", [{ label: "Users", dt: "User", cols: ["full_name", "email", "enabled"] }, { label: "Invite User", invite: true }, { label: "Sales Hierarchy", dt: "User", cols: ["full_name", "email"] }]],
  ["Email", [{ label: "Accounts", server: true }, { label: "Templates", dt: "Email Template", cols: ["name", "subject", "reference_doctype"] }]],
  ["Automation & Rules", [{ label: "Workflow Automations", server: true }, { label: "Assignment Rules", dt: "Assignment Rule", cols: ["name", "document_type", "rule", "priority"] }, { label: "SLA Policies", dt: "CRM Service Level Agreement", cols: ["name", "apply_on", "default", "enabled"] }, { label: "Forms", dt: "CRM Fields Layout", cols: ["name", "dt", "type"] }, { label: "Enrichment", server: true }]],
  ["Customization", [{ label: "Layouts" }, { label: "Home Actions" }]],
  ["Integrations", [{ label: "Telephony", server: true }, { label: "WhatsApp", server: true }, { label: "ERPNext", server: true }, { label: "Lead Syncing", server: true }]],
];

function CrmSettings({ onClose, initial }: { onClose: () => void; initial?: string | undefined }) {
  const { L, lang } = useL();
  useStoreVersion();
  const me = useSessionUser();
  const [tab, setTab] = useState<Tab>(() => GROUPS.flatMap(([, t]) => t).find(t => t.label === initial) ?? { label: "Profile", dt: "User", single: "__me", fields: ["first_name", "last_name", "email", "mobile_no"] });
  useEffect(() => { const t = GROUPS.flatMap(([, x]) => x).find(x => x.label === initial); if (t) setTab(t); }, [initial]);
  const [theme, setTheme] = useCrmTheme();
  const singleName = tab.single === "__me" ? me : tab.single;
  const singleDt = tab.single === "__me" ? "User" : tab.single;
  const doc: Doc | undefined = singleDt && singleName ? adapter.get(singleDt, singleName) : undefined;
  const save = (k: string, v: string) => {
    if (!singleDt || !singleName) return;
    if (doc) adapter.update(singleDt, singleName, { [k]: v }); else adapter.insertDoc(singleDt, { name: singleName, [k]: v });
  };
  return (
    <Modal title={L("Settings")} onClose={onClose}>
      <div className="flex min-h-[420px] gap-4">
        <nav className="w-48 shrink-0 space-y-3 border-e border-crm-line pe-3 text-sm">
          {GROUPS.map(([g, tabs]) => (
            <div key={g}><div className="mb-1 text-xs text-crm-muted">{L(g)}</div>
              {tabs.map((t) => <button key={t.label} onClick={() => setTab(t)} className={`block w-full rounded px-2 py-1 text-start ${t.label === tab.label ? "bg-crm-hover font-medium" : "hover:bg-crm-hover"}`}>{L(t.label)}</button>)}
            </div>
          ))}
        </nav>
        <section className="min-w-0 flex-1" aria-label={L(tab.label)}>
          <h3 className="mb-3 text-lg font-semibold">{L(tab.label)}</h3>
          {tab.label === "Workflow Automations" && <CrmWorkflow />}
          {tab.label === "Assignment Rules" && <CrmRuleEditor />}
          {tab.label === "SLA Policies" && <CrmRuleEditor sla />}
          {tab.label === "Sales Hierarchy" && <CrmHierarchy />}
          {tab.label === "Layouts" && <CrmLayoutEditor />}
          {tab.label === "Forms" && <CrmForms />}
          {tab.label === "Home Actions" && <CrmHomeActions />}
          {tab.label === "Profile" && <CrmProfile key={me} />}
          {tab.label === "Templates" && <CrmEmailTemplates />}
          {tab.label === "Enrichment" && <CrmEnrichment />}
           {["General", "Brand", "Defaults"].includes(tab.label) && <CrmSystemSettings key={tab.label} section={tab.label as "General" | "Brand" | "Defaults"} onSaved={onClose} />}
          {tab.prefs && (
            <div className="space-y-3 text-sm">
              <label className="block">{L("Language")}<select className="crm-input mt-1" value={lang} onChange={(e) => setLang(e.target.value as "ar" | "en")}><option value="ar">العربية</option><option value="en">English</option></select></label>
              <label className="block">{L("Theme")}<select className="crm-input mt-1" value={theme} onChange={(e) => setTheme(e.target.value as "light" | "dark")}><option value="light">{L("Light")}</option><option value="dark">{L("Dark")}</option></select></label>
            </div>
          )}
          {tab.fields && !["Profile", "General", "Brand", "Defaults"].includes(tab.label) && (
            <div className="grid gap-3 text-sm md:grid-cols-2">
              {tab.fields.map((f) => <label key={f} className="block">{L(f.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase()))}<input className="crm-input mt-1" data-no-i18n value={String(doc?.[f] ?? "")} onChange={(e) => save(f, e.target.value)} /></label>)}
            </div>
          )}
          {tab.dt && tab.cols && !["Assignment Rules", "SLA Policies", "Sales Hierarchy", "Forms", "Templates"].includes(tab.label) && (
            <table className="w-full text-sm">
              <thead className="border-b border-crm-line text-start text-crm-muted"><tr>{tab.cols.map((c) => <th key={c} className="px-2 py-1.5 text-start font-normal">{L(c === "name" ? "Name" : c.replace(/_/g, " ").replace(/^\w/, (x) => x.toUpperCase()))}</th>)}</tr></thead>
              <tbody>{adapter.list(tab.dt).slice(0, 50).map((r) => <tr key={r.name} className="border-b border-crm-line">{tab.cols?.map((c) => <td key={c} className="px-2 py-1.5" data-no-i18n>{String(r[c] ?? "")}</td>)}</tr>)}</tbody>
            </table>
          )}
          {tab.dt && tab.cols && tab.single === undefined && !["Assignment Rules", "SLA Policies", "Sales Hierarchy", "Forms", "Templates"].includes(tab.label) && (
            <button className="crm-btn mt-3" onClick={() => { const dt = tab.dt; const column = tab.cols?.[0]; if (!dt || !column) return; const n = window.prompt(L("Name")); if (n) adapter.insertDoc(dt, { name: n, [column]: n, ...(dt === "User" ? { email: n, enabled: 1 } : {}) }); }}>+ {L("Add")}</button>
          )}
          {tab.invite && <InviteUser />}
          {tab.server && !["Workflow Automations", "Enrichment"].includes(tab.label) && <p className="rounded-lg border border-dashed border-crm-line p-4 text-sm text-crm-muted">{L("This setting needs a connected DIGIT server or external service.")}</p>}
        </section>
      </div>
    </Modal>
  );
}

/** Settings/InviteUserPage.vue: emails + role (Sales User / Sales Manager / Admin) → User records with that role. */
function InviteUser() {
  const { L } = useL();
  const [emails, setEmails] = useState(""); const [role, setRole] = useState("Sales User"); const [done, setDone] = useState(0);
  return (
    <div className="space-y-3 text-sm">
      <label className="block">{L("Email")}<textarea className="crm-input mt-1 h-20 py-1" data-no-i18n placeholder="a@x.com, b@y.com" value={emails} onChange={(e) => setEmails(e.target.value)} aria-label="Invite emails" /></label>
      <label className="block">{L("Role")}<select className="crm-input mt-1" value={role} onChange={(e) => setRole(e.target.value)}>{["Sales User", "Sales Manager", "System Manager"].map((r) => <option key={r} value={r}>{L(r)}</option>)}</select></label>
      <button className="crm-btn-solid" disabled={!emails.trim()} onClick={() => {
        const list = emails.split(/[\s,]+/).filter((x) => /@/.test(x));
        list.forEach((e) => { if (!adapter.get("User", e)) adapter.insertDoc("User", { name: e, email: e, first_name: e.split("@")[0], full_name: e.split("@")[0], enabled: 1, roles: [{ role }] }); });
        setDone(list.length); setEmails("");
      }}>{L("Send Invites")}</button>
      {done > 0 && <p className="text-crm-muted">{done} ✓</p>}
    </div>
  );
}
