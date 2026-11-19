// DIGIT Core runtime for app paths (seeds, plugins, shell hosts). Loaded only when an app path opens.
import { allPlugins, enabledPlugins, initPlugins, installFixtures, isEnabled, setEnabled } from "@/plugins/runtime";
import { publicHref } from "@/lib/appUrls";
import { setActiveExperience, useExperienceTheme } from "@/plugins/theme";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  redirect,
  useRouter,
  useRouterState,
  HeadContent,
  Scripts,
  type ErrorComponentProps,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import { getSiteSession } from "@/lib/siteAuth.functions";
import { isMarkedSignedIn, markSignedIn, withNetworkRetry } from "@/lib/siteGate";

import { reportLovableError } from "@/lib/lovable-error-reporting";
import { installStaleChunkRecovery, isStaleChunkError, reloadForStaleChunk } from "@/lib/staleChunk";
import { seedErp } from "@/lib/seed";
import { adapter } from "@/lib/adapter";
import { seedInsights } from "@/lib/insightsSeed";
import { seedDemo } from "@/lib/seedDemo";
import { seedVolume } from "@/lib/volume";
import { AssistantHost } from "@/components/assistant/AssistantHost";
import "../plugins/builtinBoot";
import { applyLang, setLang, useLang } from "@/i18n";
import { startDateDisplay } from "@/i18n/dates";
import { EnterpriseToaster } from "@/components/enterprise/EnterpriseToaster";
import { Shell } from "@/components/Shell";
import { ContextStrip } from "@/components/enterprise/kit";
import { UserSettingsHost } from "@/components/desk/UserSettings";


/** Unknown address (owner 2026-11-13: the old 404 was an unbranded, English, black sheet in night mode): the shared shell,
 *  band and card, in the user's language, with the way back. */
export function CoreNotFound() {
  const ar = useLang() === "ar";
  const path = useRouterState({ select: (s) => s.location.pathname });
  const router = useRouter();
  return (
    <Shell crumbs={[{ label: ar ? "الصفحة غير موجودة" : "Page not found" }]}>
      <div className="mb-4" data-not-found-band>
        <ContextStrip icon={<img src="/icons/digit/ui/digit-ui-search-dark.svg" alt="" className="h-6 w-6" />} eyebrow="DIGIT"
          title={ar ? "الصفحة غير موجودة" : "Page not found"} sub={ar ? "هذا العنوان غير موجود أو نُقلت الصفحة إلى مكان آخر." : "This address does not exist or the page has moved."} />
      </div>
      <section className="ek-card p-6" data-route-not-found role="alert">
        <p className="text-sm text-muted-foreground">{ar ? "العنوان المطلوب" : "Requested address"}: <bdi dir="ltr" data-no-i18n className="font-mono text-foreground">{path}</bdi></p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link to="/digit-crm/home" className="btn-primary inline-flex">{ar ? "العودة إلى الرئيسية" : "Back to Home"}</Link>
          <button type="button" className="btn-ghost inline-flex" onClick={() => router.history.back()}>{ar ? "الصفحة السابقة" : "Previous page"}</button>
        </div>
      </section>
    </Shell>
  );
}

export function CoreError({ error, reset }: ErrorComponentProps) {
  console.error(error);
  const router = useRouter();
  const ar = useLang() === "ar";
  // an outdated page file (after an update) is recovered by reloading the current files instead of showing this screen
  const stale = isStaleChunkError(error);
  useEffect(() => {
    if (stale && reloadForStaleChunk(error)) return;
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error, stale]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          {ar ? "تعذّر فتح هذه الصفحة" : "This page didn't load"}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {ar ? "حدث خطأ من جهتنا. يمكنك المحاولة مرة أخرى أو العودة إلى الرئيسية." : "Something went wrong on our end. You can try refreshing or head back home."}
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            {ar ? "حاول مرة أخرى" : "Try again"}
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            {ar ? "العودة إلى الرئيسية" : "Go home"}
          </a>
        </div>
      </div>
    </div>
  );
}


export async function coreBeforeLoad(location: { pathname: string; href: string }) {
    if (location.pathname === "/login" || location.pathname.startsWith("/api/")) return;
    // Core + Enterprise + CRM build: Pro (accounting), HR, Construction and FSM are switched off and redirect to CRM home
    if (/^\/(digit-pro|digit-hr|digit-fsm|plugins\/digit_(pro|hr|construction|fsm))(\/|$)/.test(location.pathname)) throw redirect({ to: "/digit-crm/home" as "/" });
    if (typeof window !== "undefined" && isMarkedSignedIn()) return;
    const { signedIn } = await withNetworkRetry(() => getSiteSession());
    if (!signedIn) throw redirect({ to: "/login", search: { redirect: publicHref(location.href) } });
    if (typeof window !== "undefined") markSignedIn();
  }

/**
 * App entry parameters (shared Core): apps whose manifest sets `default_enabled` are enabled once on a clean browser
 * (afterwards Apps & Plugins keeps the administrator's choice), and `?experience=<app>|standard` / `?lang=ar|en` on any
 * URL set the active app experience / language before render, so shared links open the same screen in the same mode.
 */
function applyEntryParams() {
  for (const p of allPlugins().filter((x) => x.default_enabled)) {
    const k = `digit-virtual-core:default-enabled:${p.name}`;
    if (localStorage.getItem(k)) continue;
    try { if (!isEnabled(p.name)) setEnabled(p.name, true); } catch (e) { console.warn(e); }
    localStorage.setItem(k, "1");
  }
  const q = new URLSearchParams(window.location.search);
  const ex = q.get("experience");
  if (ex === "standard") setActiveExperience("");
  else if (ex && allPlugins().some((p) => p.name === ex && (p.experience || p.theme))) {
    try { if (!isEnabled(ex)) setEnabled(ex, true); setActiveExperience(ex); } catch (e) { console.warn(e); }
  }
  const lg = q.get("lang"); if (lg === "ar" || lg === "en") setLang(lg);
}

export function CoreRootComponent() {
  // Seed the shared synthetic store for every entry point (Desk, CRM, HR app),
  // not only routes that mount the Desk Shell. seedErp is insert-if-missing.
  // adapter.batch: the insert-if-missing seeders write thousands of rows on a first visit; batching persists the store
  // once instead of once per row (first visit was ~25 s in dev, dominated by repeated full-store serialisation).
  useEffect(() => {
    installStaleChunkRecovery();
    adapter.batch(() => { seedDemo(); seedErp(); initPlugins(); applyEntryParams(); for (const pl of enabledPlugins()) installFixtures(pl); });
    void seedInsights(); void applyLang(); startDateDisplay();
    // rich sample layer (memory only, never saved): built right after the first paint so screens open immediately
    const t = window.setTimeout(() => seedVolume(), 0);
    return () => window.clearTimeout(t);
  }, []);
  // keeps <html> class/data-experience in sync with the enabled + active app experience (theme tokens only)
  useExperienceTheme();

  return (
    <>
      <Outlet />
      <EnterpriseToaster />
      <UserSettingsHost />
      <AssistantHost />
    </>
  );
}
