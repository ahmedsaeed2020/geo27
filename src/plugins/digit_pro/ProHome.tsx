/** R2 M-01: DIGIT Pro entry — opens the user's pinned or role home (see ./roleHome.ts) with a replace navigation, so Back skips it. */
import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { Shell } from "@/components/Shell";
import { useHydrated } from "@/components/hrms/HrShell";
import { cachedMeta } from "@/lib/catalog";
import { useScopeMetas } from "@/lib/scope";
import { ADMIN, useSessionUser } from "@/lib/session";
import { enabledPlugins, usePluginsVersion } from "@/plugins/runtime";
import { setActiveExperience } from "@/plugins/theme";
import { HOME_SOURCES, resolveHome } from "./roleHome";

export function ProHome() {
  const hydrated = useHydrated();
  usePluginsVersion();
  const user = useSessionUser();
  const nav = useNavigate();
  const metaV = useScopeMetas(hydrated ? HOME_SOURCES : []);
  const enabled = hydrated && enabledPlugins().some((p) => p.name === "digit_pro");
  const ready = enabled && (user === ADMIN || HOME_SOURCES.every((d) => !!cachedMeta(d)));
  useEffect(() => {
    if (!ready) return;
    setActiveExperience("digit_pro");
    void nav({ to: resolveHome(user).to as never, replace: true });
  }, [ready, user, metaV, nav]);
  return <Shell>
    {hydrated && !enabled
      ? <div className="panel p-6" data-dp-state="unavailable"><h2 className="font-semibold">DIGIT Pro is not enabled</h2><p className="mt-1 text-sm text-muted-foreground"><Link to="/plugins" className="underline">Apps & Plugins</Link></p></div>
      : <div className="dp-skeleton" data-dp-state="loading" data-dp-home-resolving role="status" aria-busy="true"><span>Loading…</span></div>}
  </Shell>;
}
