import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { APPS, type AppId, type DocTypeMeta } from "@/lib/catalog";
import { allPlugins } from "@/plugins/runtime";
import { useLang } from "@/i18n";

/**
 * First breadcrumb of a list/form: the owning app. Plugin-owned DocTypes (meta.source "plugin:<app>") lead back to the
 * plugin workspace (/plugins/<app>), core DocTypes to their Desk app — so parent → list → form → back keeps app context.
 */
export function AppCrumb({ meta, app }: { meta: Pick<DocTypeMeta, "source">; app: string }) {
  const lang = useLang();
  const owner = meta.source?.startsWith("plugin:") ? meta.source.slice(7) : "";
  const p = owner ? allPlugins().find((x) => x.name === owner) : undefined;
  if (p) return <Link to="/plugins/$name" params={{ name: p.name }} className="hover:underline" data-app-crumb={p.name}>{lang === "ar" && p.title_ar ? p.title_ar : p.title}</Link>;
  return <Link to="/app/$app" params={{ app }} className="hover:underline" data-app-crumb={app}>{APPS[app as AppId]?.label}</Link>;
}

/**
 * Leading crumbs of a list / form / tree trail. frappe views/breadcrumbs.js (develop) names only the entity — the dock
 * names the app and the module sidebar names the module — so core DocTypes get no app or module crumb. Plugin-owned
 * DocTypes keep their app crumb back to the plugin workspace, the approved app-shell return path.
 */
export function leadCrumbs(meta: Pick<DocTypeMeta, "source">, app: string): { label: string; to?: ReactNode }[] {
  return meta.source?.startsWith("plugin:") ? [{ label: "", to: <AppCrumb meta={meta} app={app} /> }] : [];
}
