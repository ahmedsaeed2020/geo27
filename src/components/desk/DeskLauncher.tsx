import { Link, useHydrated } from "@tanstack/react-router";
import { slotsOf } from "@/plugins/experienceSlots";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Shell, Loading } from "@/components/Shell";
import { ContextStrip } from "@/components/enterprise/kit/templates";
import { indexQuery } from "@/lib/catalog";
import { useDevMode } from "@/lib/mode";
import { enabledPlugins, usePluginsVersion } from "@/plugins/runtime";
import { useLang } from "@/i18n";
import { desktopIconUrl, desktopIconUrlsQuery, iconsQuery, iconTarget, moduleSidebarsQuery, sidebarsQuery, workspacesFullQuery, type DesktopIcon } from "@/lib/desk";
import { DEPARTMENTS } from "@/lib/departmentHomes";

const APP_TITLE: Record<string, string> = { erpnext: "ERPNext", hrms: "Frappe HR", frappe: "Framework" };

/**
 * Native Desk Home: Desktop Icon grid (frappe desktop_icons.bundle.js), source SVG per icon, route via get_route_for_icon;
 * folder icons open their children. Rendered at "/" without DIGIT apps, and at /desk (administrators) in DIGIT Enterprise mode.
 */
export function DeskLauncher() {
  const icons = useQuery(iconsQuery);
  const sbs = useQuery(sidebarsQuery);
  const msb = useQuery(moduleSidebarsQuery);
  const urls = useQuery(desktopIconUrlsQuery);
  const wss = useQuery(workspacesFullQuery);
  const idx = useQuery(indexQuery);
  const dev = useDevMode();
  const [folder, setFolder] = useState<string | null>(null);
  usePluginsVersion(); const hydrated = useHydrated(); const lang = useLang();
  // installed (enabled) apps add their own launcher icon, as a Frappe app's Desktop Icon / workspace does after install
  const apps = hydrated ? enabledPlugins().filter((p) => p.name !== "site_customizations" && p.workspaces?.length) : [];
  if (!icons.data || !sbs.data || !msb.data || !urls.data || !wss.data || !idx.data) return <Shell><Loading /></Shell>;
  const dts = new Set(idx.data.map((d) => d.name));
  const appIcons = new Set(icons.data.filter((i) => i.icon_type === "App").map((i) => i.name));
  const visible = icons.data.filter((i) => !i.hidden && i.icon_type !== "App" && (folder ? i.parent_icon === folder : !i.parent_icon || appIcons.has(i.parent_icon))).sort((a, b) => a.idx - b.idx || a.label.localeCompare(b.label));
  const byApp: Record<string, DesktopIcon[]> = {};
  visible.forEach((i) => (byApp[i.app] ??= []).push(i));
  const tile = (i: DesktopIcon) => {
    const src = urls.data ? desktopIconUrl(i, urls.data) : undefined;
    const inner = (
      <>
        {src ? <img src={src} alt="" className="h-12 w-12 rounded-xl" /> : <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-lg font-semibold text-primary-foreground">{i.label[0]}</div>}
        <span className="mt-2 text-center text-xs">{i.label}</span>
      </>
    );
    const cls = "flex w-24 flex-col items-center rounded-lg p-2 hover:bg-muted";
    if (i.icon_type === "Folder") return <button key={i.name} data-desktop-icon={i.name} className={cls} onClick={() => setFolder(i.name)}>{inner}</button>;
    const t = iconTarget(i, sbs.data!, msb.data!, (n) => dts.has(n), wss.data!);
    if (t.kind === "sidebar") return <Link key={i.name} data-desktop-icon={i.name} to="/desk/$sidebar" params={{ sidebar: t.sidebar }} search={{ ...(t.ws ? { ws: t.ws } : {}), ...(t.section ? { section: t.section } : {}) }} className={cls}>{inner}</Link>;
    if (t.kind === "doctype") { const e = idx.data!.find((d) => d.name === t.name)!; return <Link key={i.name} data-desktop-icon={i.name} to="/app/$app/$doctype" params={{ app: e.app, doctype: e.slug }} className={cls}>{inner}</Link>; }
    return null;
  };
  return (
    <Shell>
      <ContextStrip icon={<img src="/icons/digit/ui/digit-ui-dashboard-dark.svg" alt="" />} eyebrow="DIGIT" title={folder ?? "Desk Home"} sub="Departments, apps and workspaces in one place."
        actions={folder ? <button type="button" className="btn-primary" data-band-primary onClick={() => setFolder(null)}>All apps</button> : <Link to="/plugins" className="btn-primary" data-band-primary>Apps &amp; Plugins</Link>} />
      {!folder && (
        <section className="mb-4 mt-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-5" data-departments>
          {DEPARTMENTS.map((d) => <Link key={d.id} to="/department/$dept" params={{ dept: d.id }} className="panel p-3 hover:shadow-md" data-department={d.id}><div className="font-semibold">{lang === "ar" ? d.title.ar : d.title.en}</div></Link>)}
        </section>
      )}
      {!folder && (
        <section className="mb-6 grid gap-3 md:grid-cols-3">
          <Link to="/digit-crm/leads" className="panel p-4 hover:shadow-md"><div className="font-semibold">DIGIT CRM</div></Link>
          <Link to="/digit-hr" className="panel p-4 hover:shadow-md"><div className="font-semibold">DIGIT HR app</div></Link>
          <Link to="/insights/dashboards" className="panel p-4 hover:shadow-md"><div className="font-semibold">DIGIT Insights</div></Link>
        </section>
      )}
      {!folder && apps.length > 0 && (
        <section className="mt-5" data-installed-apps>
          <h2 className="mb-2 text-xs font-semibold text-muted-foreground">Installed apps</h2>
          <div className="flex flex-wrap gap-2">{apps.map((p) => (
            <Link key={p.name} to="/plugins/$name" params={{ name: p.name }} data-desktop-icon={p.name} data-plugin-app={p.name} className="flex w-24 flex-col items-center rounded-lg p-2 hover:bg-muted">
              {slotsOf(p.name)?.dock?.icon
                ? <img src={slotsOf(p.name)!.dock!.icon} alt="" className="h-12 w-12" aria-hidden />
                : <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-lg font-semibold text-primary-foreground" aria-hidden>{(lang === "ar" && p.title_ar ? p.title_ar : p.title)[0]}</div>}
              <span className="mt-2 text-center text-xs">{lang === "ar" && p.title_ar ? p.title_ar : p.title}</span>
            </Link>))}</div>
        </section>
      )}
      {Object.entries(byApp).sort(([a], [b]) => (a === "erpnext" ? -1 : b === "erpnext" ? 1 : a.localeCompare(b))).map(([app, list]) => (
        <section key={app} className="mt-5">
          <h2 className="mb-2 text-xs font-semibold text-muted-foreground">{APP_TITLE[app] ?? app}</h2>
          <div className="flex flex-wrap gap-2">{list.map(tile)}</div>
        </section>
      ))}
      {dev && <p className="mt-6 text-[11px] text-muted-foreground">Launcher built from {icons.data.length} Desktop Icon definitions.</p>}
    </Shell>
  );
}
