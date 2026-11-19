import { useEffect, type ReactNode } from "react";
import { useTx, useHrEnabled, suiteFor } from "./HrNav";
import { Link, useHydrated, useRouterState } from "@tanstack/react-router";
import { Menu } from "lucide-react";
import { Shell } from "@/components/Shell";
import { SUITES } from "@/plugins/digit_hr/service";
import { setActiveExperience } from "@/plugins/theme";
import { ModuleBand } from "./ui";

export { useTx };

/** Opens the Core ☰ menu, which shows the DIGIT HR drawer on phones (src/components/digithr/HrShellNav.tsx). */
const openShellMenu = () => document.querySelector<HTMLButtonElement>("[data-nav-toggle]")?.click();

/**
 * DIGIT HR frame inside the current Core Shell. Entering an HR screen makes DIGIT HR the active app experience, so the
 * Shell renders the HR navigation slot (rail → HR nav → workspace; below md one drawer with the HR navigation and the
 * app dock, opened by the top-bar ☰ or the slim HR app bar).
 * Home screens (`headless`) render their own command header and drop the breadcrumb strip.
 */
export function DigitHrLayout({ title, crumbs = [], children, subtitle, actions, band, header, headless, record, chips }: { chips?: ReactNode; title: string; header?: ReactNode; crumbs?: { label: string }[]; children: ReactNode; subtitle?: ReactNode; actions?: ReactNode; band?: ReactNode; /** the page renders its own HrCommandHeader */ headless?: boolean; /** record (360) page: compact identity with the record kind; the page's own summary carries the green band */ record?: boolean }) {
  const hydrated = useHydrated(); const on = useHrEnabled(); const { tx } = useTx();
  const path = useRouterState({ select: (s) => s.location.pathname });
  // Opening a DIGIT HR screen is a deliberate app entry (same rule as the DIGIT Pro frame and /plugins/<app>).
  useEffect(() => { if (on) setActiveExperience("digit_hr"); }, [on]);
  const app = tx("ديجيت للموارد البشرية", "DIGIT HR");
  if (!hydrated) return <Shell crumbs={[{ label: app }]}><div className="p-10 text-center text-muted-foreground">…</div></Shell>;
  if (!on) return (
    <Shell crumbs={[{ label: app }]}>
      <div className="panel mx-auto max-w-lg p-6 text-center">
        <h1 className="mb-2 text-lg font-semibold">{tx("تطبيق ديجيت للموارد البشرية غير مفعّل", "DIGIT HR app is disabled")}</h1>
        <p className="mb-4 text-sm text-muted-foreground">{tx("فعّل التطبيق من مدير التطبيقات. السجلات الأصلية تبقى كما هي.", "Enable it from the Plugin Manager. Native records stay unchanged.")}</p>
        <Link to="/plugins/$name" params={{ name: "digit_hr" }} className="inline-flex h-10 items-center rounded-md bg-primary px-4 text-sm text-primary-foreground">{tx("فتح مدير التطبيقات", "Open Plugin Manager")}</Link>
      </div>
    </Shell>
  );
  const su = SUITES.find((x) => x.id === suiteFor(path));
  return (
    <Shell crumbs={headless ? [] : [{ label: app }, ...crumbs]}>
      <div className="digit-hr dhr-canvas -mx-3 -my-4 min-h-[calc(100vh-4rem)] md:-mx-6 overflow-x-hidden p-3 md:p-5 xl:p-6">
        {/* Home screens carry module + suite in their own header, so the phone row would only repeat it: there the shared top-bar ☰ opens the drawer. */}
        {!headless && <div className="dhr-appbar md:hidden">
          <button type="button" onClick={openShellMenu} aria-haspopup="dialog" className="dhr-suite inline-flex h-11 shrink-0 items-center gap-2 rounded-md border border-[var(--dhr-border)] bg-[var(--dhr-surface)] px-3 text-sm font-medium" data-hr-menu-button><Menu className="h-4 w-4" aria-hidden />{tx("قائمة الموارد البشرية", "HR menu")}</button>
          <span className="min-w-0 truncate text-[12.5px] text-[var(--dhr-muted)]">{su ? tx(su.ar, su.en) : app}</span>
        </div>}
        {headless ? null : header ?? <ModuleBand eyebrow={su ? tx(su.ar, su.en) : app} title={record ? <span data-no-i18n>{title}</span> : title} subtitle={subtitle} actions={actions} compact={!!record} chips={chips}>{band}</ModuleBand>}
        {children}
      </div>
    </Shell>
  );
}
