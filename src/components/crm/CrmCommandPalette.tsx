import { useEffect, useMemo, useState } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { useStoreVersion } from "@/lib/adapter";
import { useSessionUser, userRoles } from "@/lib/session";
import { type Command, groupCommands, ordered, readRecent, recentNamesByDoctype, rememberRecent, search, SETTINGS_SECTIONS, sortByRecency, type PaletteRecord, type Upcoming } from "@/lib/crmCommandPalette";
import { Modal } from "./CrmShell";
import { useL } from "./crmI18n";
import { CrmIcon } from "./icons/CrmIcon";

const ROUTES: Record<string, string> = { Lead: "/crm/leads/", Deal: "/crm/deals/", Contact: "/crm/contacts/", Organization: "/crm/organizations/" };
const NAV: [string, string][] = [["Leads", "/crm/leads"], ["Deals", "/crm/deals"], ["Contacts", "/crm/contacts"], ["Organizations", "/crm/organizations"], ["Notes", "/crm/notes"], ["Tasks", "/crm/tasks"], ["Call Logs", "/crm/call-logs"], ["Dashboard", "/crm/dashboard"], ["Notifications", "/crm/notifications"]];
const CREATE: [string, string, string, string][] = [["lead", "Lead", "CRM Lead", "/crm/leads"], ["deal", "Deal", "CRM Deal", "/crm/deals"], ["contact", "Contact", "Contact", "/crm/contacts"], ["organization", "Organization", "CRM Organization", "/crm/organizations"], ["note", "Note", "FCRM Note", "/crm/notes"], ["task", "Task", "CRM Task", "/crm/tasks"]];
const RECENT_ROUTES: [RegExp, string][] = [[/^\/crm\/leads\/([^/]+)$/, "CRM Lead"], [/^\/crm\/deals\/([^/]+)$/, "CRM Deal"]];

/** Port of CommandPalette.vue + useCRMCommands.js over crm/api/command_palette.py semantics. */
export function CrmCommandPalette() {
  const { L, fmt } = useL(); const navigate = useNavigate(); const v = useStoreVersion(); const user = useSessionUser();
  const path = useRouterState({ select: s => s.location.pathname });
  const [open, setOpen] = useState(false); const [query, setQuery] = useState(""); const [active, setActive] = useState(0);
  const [stack, setStack] = useState<{ title: string; commands: Command[] }[]>([]);
  useEffect(() => { for (const [re, dt] of RECENT_ROUTES) { const m = path.match(re); if (m && m[1] && m[1] !== "view") rememberRecent(dt, decodeURIComponent(m[1] ?? ""), user); } }, [path, user]);
  useEffect(() => { const h = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setOpen(o => !o); setStack([]); setQuery(""); } if (e.key === "Escape") setOpen(false); }; window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h); }, []);
  const isManager = userRoles(user).some(r => ["Sales Manager", "System Manager", "Administrator"].includes(r)) || user === "Administrator";
  const go = (to: string) => void navigate({ to });
  const commands = useMemo<Command[]>(() => {
    if (!open) return [];
    const recent = readRecent(user); const data = search(query, recentNamesByDoctype(recent), new Date(), user);
    const rec = (r: PaletteRecord, group: string): Command => ({ id: `record-${r.doctype}-${r.name}`, title: r.title, keywords: r.keywords ?? "", translate: false, subtitle: r.doctype.replace("CRM ", ""), group, icon: group === "Recent" ? "clock" : r.doctype, perform: () => go(ROUTES[r.route] + encodeURIComponent(r.name)) });
    const up = (u: Upcoming): Command => ({ id: `upcoming-${u.kind}-${u.name}`, title: u.title, group: "Upcoming", translate: false, subtitle: u.label, keywords: u.due, perform: () => go(u.route_name ? ROUTES[u.route] + encodeURIComponent(u.route_name) : "/crm/tasks") });
    const settingsChildren = () => SETTINGS_SECTIONS.filter(s => isManager || !s.manager).flatMap(s => s.pages.map(page => ({ id: `settings-${page}`, title: page, group: s.title, keywords: `configure settings ${page}`, perform: () => window.dispatchEvent(new CustomEvent("crm-open-settings", { detail: page })) })));
    return ordered([
      ...(query.trim() ? [] : data.upcoming.map(up)),
      ...NAV.map(([label, to]) => ({ id: `navigate-${label}`, title: label, group: "Navigate", weight: 0.7, keywords: `go open ${label}`, perform: () => go(to) })),
      ...CREATE.map(([id, title, dt, to]) => ({ id: `create-${id}`, title: fmt("Create {0}", L(title)), group: "Create", keywords: `new add ${id}`, perform: () => { go(to); setTimeout(() => window.dispatchEvent(new CustomEvent("crm-create", { detail: dt })), 300); } })),
      { id: "settings", title: "Settings", group: "Account", keywords: "configure preferences profile users brand telephony erpnext automations", children: settingsChildren },
      ...sortByRecency(data.recent, recent).map(r => rec(r, "Recent")),
      ...data.matches.map(r => rec(r, "Records")),
    ], query);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, query, user, v, isManager]);
  const current = stack.at(-1)?.commands ?? commands;
  const groups = groupCommands(current, query); const items = groups.flatMap(g => g.items);
  const run = (c?: Command) => { if (!c) return; if (c.children) { setStack(s => [...s, { title: c.title, commands: c.children!() }]); setQuery(""); setActive(0); return; } setOpen(false); c.perform?.(); };
  const back = () => { if (!stack.length) return false; setStack(s => s.slice(0, -1)); setQuery(""); setActive(0); return true; };
  let idx = -1;
  return <><Button variant="ghost" className="w-full justify-start px-2" onClick={() => { setOpen(true); setStack([]); setQuery(""); }} aria-label={L("Command palette")}><CrmIcon name="QuickFilterIcon" />{L("Search")}<kbd className="ms-auto text-[10px] text-crm-muted max-md:hidden" data-no-i18n dir="ltr">Ctrl K</kbd></Button>
    {open && <Modal title={L("Command palette")} onClose={() => setOpen(false)}>
      {stack.length > 0 && <nav aria-label={L("Breadcrumbs")} className="mb-2 text-xs text-crm-muted">{stack.map(s => L(s.title)).join(" / ")}</nav>}
      <input autoFocus className="crm-input" aria-label={L("Search records")} placeholder={L("Search…")} value={query} data-no-i18n onChange={e => { setQuery(e.target.value); setActive(0); }} onKeyDown={e => {
        if (e.key === "ArrowDown") { e.preventDefault(); setActive(Math.min(active + 1, items.length - 1)); }
        if (e.key === "ArrowUp") { e.preventDefault(); setActive(Math.max(active - 1, 0)); }
        if (e.key === "Enter") { e.preventDefault(); run(items[active]); }
        if (e.key === "Backspace" && !query && back()) e.preventDefault();
      }} />
      <div role="listbox" aria-label={L("Search results")} className="mt-3 max-h-96 overflow-auto">
        {groups.map(g => <div key={g.title} role="group" aria-label={L(g.title)}>{g.title && <div className="px-2 pt-2 text-xs font-medium text-crm-muted">{L(g.title)}</div>}
          {g.items.map(c => { idx++; const i = idx; return <Button key={c.id} role="option" aria-selected={active === i} variant="ghost" className={`flex w-full h-auto justify-between text-start p-2 ${active === i ? "bg-crm-hover" : ""}`} onMouseEnter={() => setActive(i)} onClick={() => run(c)}>
            <span {...(c.translate === false ? { "data-no-i18n": true } : {})}>{c.translate === false ? c.title : L(c.title)}</span>
            <span className="text-xs text-crm-muted">{c.subtitle ? L(c.subtitle) : c.children ? "›" : ""}</span></Button>; })}</div>)}
        {!items.length && <p className="p-3 text-sm text-crm-muted">{L("No results")}</p>}
      </div>
      <div className="mt-2 flex gap-3 border-t border-crm-line pt-2 text-xs text-crm-muted"><span>↑ ↓ {L("Navigate")}</span><span>↵ {L("Select")}</span>{stack.length > 0 ? <span>⌫ {L("Back")}</span> : <span>Esc {L("Close")}</span>}</div>
    </Modal>}</>;
}
