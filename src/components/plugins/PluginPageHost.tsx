/**
 * Host for app-owned virtual pages (manifest `pages`, src/plugins/pages.ts): resolves the page for a path, enters the
 * app shell and its experience (so the enterprise module rail and contextual sidebar apply), remembers the location for
 * "back to app" links on native records and renders the registered component inside the shared Shell. Missing app /
 * page / component states are explicit, never blank.
 */
import { Link, useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";
import { Shell } from "@/components/Shell";
import { useHydrated } from "@/components/hrms/HrShell";
import { useLang } from "@/i18n";
import { useStoreVersion } from "@/lib/adapter";
import { enterApp } from "@/plugins/appShell";
import { matchPluginPage, pageComponent, rememberAppLocation } from "@/plugins/pages";
import "@/plugins/builtinPages";
import { allPlugins, enabledPlugins, usePluginsVersion } from "@/plugins/runtime";
import { setActiveExperience, useActiveExperience } from "@/plugins/theme";

export function PluginPageHost({ name, path }: { name: string; path: string }) {
  usePluginsVersion(); useStoreVersion();
  const hydrated = useHydrated();
  const ar = useLang() === "ar";
  const active = useActiveExperience();
  const href = useRouterState({ select: (s) => s.location.href });
  const p = enabledPlugins().find((x) => x.name === name);
  const m = p ? matchPluginPage(p, path) : undefined;
  useEffect(() => { if (p) { enterApp(p.name); if ((p.experience || p.theme) && active !== p.name) setActiveExperience(p.name); } }, [p, active]);
  useEffect(() => { if (p && m) rememberAppLocation(p.name, href, ar ? m.page.label_ar ?? m.page.label : m.page.label); }, [p, m, href, ar]);
  if (!hydrated) return <Shell><p className="p-6 text-muted-foreground" role="status">{ar ? "جارٍ التحميل…" : "Loading…"}</p></Shell>;
  if (!p) {
    const known = allPlugins().find((x) => x.name === name);
    return (
      <Shell>
        <div className="mx-auto mt-8 max-w-lg rounded-lg border border-border bg-card p-6 text-center" data-app-disabled>
          <h1 className="text-lg font-semibold" data-no-i18n>{known ? (ar ? known.title_ar ?? known.title : known.title) : name}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{known ? (ar ? "هذا التطبيق غير مفعّل. فعّله من صفحة التطبيقات والإضافات؛ التعطيل لا يحذف أي بيانات." : "This app is not enabled. Enable it from Apps & Plugins; disabling never deletes data.") : (ar ? "التطبيق غير موجود." : "App not found.")}</p>
          <Link to="/plugins" className="btn-primary mt-4 inline-flex">{ar ? "التطبيقات والإضافات" : "Apps & Plugins"}</Link>
        </div>
      </Shell>
    );
  }
  if (!m) return <Shell><div className="rounded-lg border border-border bg-card p-6" data-page-not-found><h1 className="font-semibold">{ar ? "الصفحة غير موجودة" : "Page not found"}</h1><Link to="/plugins/$name" params={{ name }} className="mt-2 inline-block text-primary hover:underline">{ar ? "العودة إلى التطبيق" : "Back to the app"}</Link></div></Shell>;
  const C = pageComponent(p.name, m.page.component);
  if (!C) return <Shell><div className="rounded-lg border border-border bg-card p-6" data-page-component-missing><h1 className="font-semibold">{ar ? m.page.label_ar ?? m.page.label : m.page.label}</h1><p className="mt-1 text-sm text-muted-foreground">{ar ? "واجهة هذه الصفحة غير متاحة في النواة الافتراضية (تطبيق مستورد بدون مكوّن مسجل)." : "This page's frontend is not available in the Virtual Core (imported app without a registered component)."}</p></div></Shell>;
  return <Shell><C plugin={p} page={m.page} params={m.params} path={path} /></Shell>;
}
