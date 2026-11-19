import { Link, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { indexQuery } from "@/lib/catalog";
import { useLang } from "@/i18n";
import { appNavigation, enterApp, exitApp, useActiveApp, type AppNavEntry } from "@/plugins/appShell";
import { navTarget } from "./ModuleRailNav";
import { enabledPlugins } from "@/plugins/runtime";

const GROUPS: { key: AppNavEntry["group"]; en: string; ar: string }[] = [
  { key: "workspace", en: "Workspace", ar: "مساحة العمل" },
  { key: "documents", en: "Documents", ar: "المستندات" },
  { key: "extended", en: "Extended documents", ar: "مستندات موسّعة" },
  { key: "reports", en: "Reports", ar: "التقارير" },
  { key: "settings", en: "Settings", ar: "الإعدادات" },
];

/**
 * Keeps the active DIGIT app in sync with the location: the Desk home ("/") leaves the app, and any deep link carrying
 * `?app=<enabled plugin>` enters it. Display-only; routes and records stay the shared native ones.
 */
export function useActiveAppLocation() {
  const loc = useRouterState({ select: (s) => ({ path: s.location.pathname, app: (s.location.search as Record<string, unknown>)["app"] }) });
  useEffect(() => {
    if (loc.path === "/") { exitApp(); return; }
    if (typeof loc.app === "string" && enabledPlugins().some((p) => p.name === loc.app)) enterApp(loc.app);
  }, [loc.path, loc.app]);
}

/** Contextual navigation of the active app, derived only from its manifest (appShell.appNavigation). */
export function ActiveAppNav() {
  const app = useActiveApp();
  const ar = useLang() === "ar";
  const idx = useQuery(indexQuery);
  if (!app) return null;
  const nav = appNavigation(app, (dt) => { const e = idx.data?.find((d) => d.name === dt); return e ? { app: e.app, slug: e.slug } : undefined; });
  // an app that declares its own navigation (departments → workspaces) keeps that tree here instead of a flat document list
  // (Enterprise Visual Round 1 X03): one block per department with its workspace pages, the department home first
  if (app.navigation?.length) return <AppNavTree app={app} ar={ar} slot={(dt) => { const e = idx.data?.find((d) => d.name === dt); return e ? { app: e.app, slug: e.slug } : undefined; }} />;
  return (
    <div className="border-t border-border px-2 py-2 text-sm" data-active-app={app.name}>
      <div className="flex items-center gap-2 px-2 pb-1">
        <span className="min-w-0 flex-1 truncate font-semibold text-primary" data-no-i18n>{ar ? app.title_ar ?? app.title : app.title}</span>
        <button type="button" className="text-xs text-muted-foreground hover:text-foreground hover:underline" data-exit-app onClick={() => exitApp()}>{ar ? "خروج" : "Exit"}</button>
      </div>
      {GROUPS.map((g) => {
        const items = nav.filter((n) => n.group === g.key);
        if (!items.length) return null;
        return (
          <div key={g.key} className="mt-1" data-app-nav-group={g.key}>
            {g.key !== "workspace" && <div className="px-2 pt-1 text-[11px] uppercase tracking-wide text-muted-foreground">{ar ? g.ar : g.en}</div>}
            {items.map((n) => (
              <Link key={`${n.group}:${n.label}`} to={n.to as never} params={n.params as never} search={(n.to === "/plugins/$name" ? undefined : { app: app.name }) as never}
                className="block truncate rounded px-2 py-1 hover:bg-muted" activeProps={{ className: "bg-muted font-medium" }} data-app-nav={n.label}>
                {ar && n.label_ar ? n.label_ar : n.label}
              </Link>
            ))}
          </div>
        );
      })}
    </div>
  );
}
export { useAppModules, navTarget, hrefOfTarget } from "./ModuleRailNav";

/** Departments → workspaces from the manifest navigation (workspace pages are the items ending in /overview; a department
 *  without such pages lists its featured items). The department of the current page opens; the others stay folded. */
function AppNavTree({ app, ar, slot }: { app: NonNullable<ReturnType<typeof useActiveApp>>; ar: boolean; slot: (dt: string) => { app: string; slug: string } | undefined }) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  return (
    <div className="border-t border-border px-2 py-2 text-sm" data-active-app={app.name} data-app-nav-tree={app.navigation!.length}>
      <div className="flex items-center gap-2 px-2 pb-1">
        <span className="min-w-0 flex-1 truncate font-semibold text-primary" data-no-i18n>{ar ? app.title_ar ?? app.title : app.title}</span>
        <button type="button" className="text-xs text-muted-foreground hover:text-foreground hover:underline" data-exit-app onClick={() => exitApp()}>{ar ? "خروج" : "Exit"}</button>
      </div>
      {app.navigation!.map((g) => {
        const ws = g.items.filter((i) => /\/overview$/.test(i.to));
        const items = ws.length ? ws : g.items.filter((i) => i.featured).slice(0, 6);
        const home = g.items.find((i) => i.to.startsWith("dept/")) ?? g.items[0];
        const seg = ws[0]?.to.split("/")[0];
        const open = !!seg && (path.includes(`/${seg}/`) || path.endsWith(`/${seg}`));
        return (
          <details key={g.key} className="mt-1" open={open} data-app-nav-dept={g.key} data-ws={items.length}>
            <summary className="cursor-pointer rounded px-2 py-1 font-medium hover:bg-muted">{ar ? g.label_ar ?? g.label : g.label}</summary>
            <div className="ps-2">
              {home && !ws.includes(home) && (() => { const t = navTarget(app, home.to, slot); return <Link to={t.to as never} params={t.params as never} search={{ app: app.name } as never} className="block truncate rounded px-2 py-1 text-muted-foreground hover:bg-muted" data-app-nav={home.label}>{ar ? home.label_ar ?? home.label : home.label}</Link>; })()}
              {items.map((i) => { const t = navTarget(app, i.to, slot); return (
                <Link key={i.to} to={t.to as never} params={t.params as never} search={{ app: app.name } as never} className="block truncate rounded px-2 py-1 hover:bg-muted" activeProps={{ className: "bg-muted font-medium" }} data-app-nav={i.label}>
                  {ar ? i.label_ar ?? i.label : i.label}
                </Link>); })}
            </div>
          </details>
        );
      })}
    </div>
  );
}
