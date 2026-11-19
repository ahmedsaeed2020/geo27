// @ts-nocheck -- DIGIT Pro/HR apps are switched off in the merged site build; their original /pro/* and /hr/* app routes are not in this route tree (re-enabling the app needs those routes, then remove this line)
import { Link, useRouterState } from "@tanstack/react-router";
import { Component, useEffect, type ErrorInfo, type ReactNode } from "react";
import { Shell } from "@/components/Shell";
import { useHydrated } from "@/components/hrms/HrShell";
import { useStoreVersion } from "@/lib/adapter";
import { useScopeMetas } from "@/lib/scope";
import { cachedMeta } from "@/lib/catalog";
import { useSessionUser, userRoles } from "@/lib/session";
import { useLang, t as tr } from "@/i18n";
import { enabledPlugins, usePluginsVersion } from "@/plugins/runtime";
import { setActiveExperience } from "@/plugins/theme";
import { FINANCE_DOCTYPES } from "./finance";
import { locate, NAV_AR } from "./nav";
import { appIconFor } from "@/components/enterprise/iconMap";
import { BandTabsHost, BrandIcon, ContextStrip, CustomizeScope } from "@/components/enterprise/kit";

const TABS = [
  { to: "/pro/finance-intelligence", label: "Finance Intelligence" },
  { to: "/pro/finance", label: "Finance Control Center" },
  { to: "/pro/accounts", label: "Chart of Accounts" },
  { to: "/pro/general-ledger", label: "General Ledger" },
  { to: "/pro/receivables", label: "Receivables" },
  { to: "/pro/payables", label: "Payables" },
  { to: "/pro/payments", label: "Payments" },
  { to: "/pro/bank-reconciliation", label: "Bank Reconciliation" },
  { to: "/pro/cost-centers", label: "Cost Centers" },
  { to: "/pro/period-control", label: "Period Control" },
  { to: "/pro/trial-balance", label: "Trial Balance" },
  { to: "/pro/statements", label: "Financial Statements" },
  { to: "/pro/vat", label: "VAT Reports" },
  { to: "/pro/audit", label: "Audit & Exceptions" },
] as const;

type Ctx = { user: string; roles: string[] };

/** Shared DIGIT Pro Finance frame: activates the DIGIT Pro experience, loads Core metas for permission checks, page header + module nav. */
/** The band shows the app badge (one logo per app, iconMap.appIconFor); department icons stay on department items. */

/**
 * Shared DIGIT Pro frame: activates the DIGIT Pro experience, loads Core metas for permission checks, renders the page
 * header + module nav. R2: the header is the approved two-tone Forest/Emerald Command Band (eyebrow = DIGIT Pro ·
 * department resolved from the navigation manifest). Pages that compose their own decision hero below a plain title
 * (Executive Home, Section Workspaces and a single Customer 360 profile — the approved V1 layouts) pass `band={false}`.
 */
export function ProFrame({ title, subtitle, actions, children, tabs = true, icon = "/icons/digit/logo/digit-icon.svg", doctypes = [], band = true, bare = false, customize = false }: { doctypes?: string[]; /** the page body is a shared Dashboard Designer: the band carries its Customise button */ customize?: boolean; /** the page template draws its own context strip (no band / page head) */ bare?: boolean; title: string; subtitle?: string; actions?: ReactNode; tabs?: boolean; icon?: string; band?: boolean; children: (ctx: Ctx) => ReactNode }) {
  const hydrated = useHydrated();
  usePluginsVersion(); useStoreVersion();
  const user = useSessionUser();
  const href = useRouterState({ select: (s) => s.location.href });
  const path = useRouterState({ select: (s) => s.location.pathname });
  const ar = useLang() === "ar";
  const dept = band ? locate(path)?.dept : undefined;
  // the page icon wears its department colour (owner 2026-11-12): same icon and colour as the rail and the Home tile
  const pageDept = path.startsWith("/pro/dashboard") || path.startsWith("/pro/executive") ? "executive" : locate(path)?.dept?.id;
  const need = [...FINANCE_DOCTYPES, ...doctypes];
  const metaV = useScopeMetas(hydrated ? need : []);
  // Permission/source checks need Core meta; render data only once it is loaded so first load never shows a false "empty"/"unavailable".
  const ready = hydrated && (metaV > 0 || need.every((d) => !!cachedMeta(d)));
  const enabled = hydrated && enabledPlugins().some((p) => p.name === "digit_pro");
  useEffect(() => { if (enabled) setActiveExperience("digit_pro"); }, [enabled]);
  void metaV;
  return (
    <Shell crumbs={[{ label: "", to: <Link to="/pro/home" className="hover:underline">DIGIT Pro</Link> }, { label: title }]}>
      {!hydrated || (enabled && !ready) ? <div className="dp-skeleton" data-dp-state="loading" role="status" aria-busy="true"><span>Loading…</span></div>
        : !enabled ? <div className="panel p-6" data-dp-state="unavailable"><h2 className="font-semibold">DIGIT Pro is not enabled</h2><p className="mt-1 text-sm text-muted-foreground"><Link to="/plugins" className="underline">Apps & Plugins</Link></p></div>
        : <div data-dp-finance>
          {bare ? null : band ? <header className="dp-band-host" data-dp-band>
            <CustomizeScope on={customize}><ContextStrip icon={<img src={appIconFor("digit_pro", "band")} alt="" className="h-8 w-8" data-app-badge="digit_pro" />}
              eyebrow={<span data-no-i18n><span>{ar ? "ديجيت برو" : "DIGIT Pro"}</span>{dept && <><span aria-hidden="true"> · </span><span data-dp-band-dept={dept.id}>{ar ? NAV_AR[dept.label] ?? dept.label : dept.label}</span></>}</span>}
              title={title} sub={subtitle} actions={actions ? <div className="dp-band-actions">{actions}</div> : undefined} /></CustomizeScope>
          </header>
          : <header className="dp-pagehead">
            <BrandIcon src={icon} accent={pageDept ?? "digit_pro"} size={40} />
            <div className="min-w-0">
              <h1 className="text-xl font-semibold leading-tight">{title}</h1>
              {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
            </div>
            <div className="ms-auto flex flex-wrap items-center gap-2">{actions}</div>
          </header>}
          {/* one tab position (owner 2026-11-12 evening §1): band first, section tabs directly under it — a page that draws its own band receives the tabs under that band */}
          {bare ? <BandTabsHost tabs={tabs ? <FinanceTabs /> : null}>
            <SourceBoundary resetKey={href} title={title}><FrameBody render={children} ctx={{ user, roles: userRoles(user) }} /></SourceBoundary>
          </BandTabsHost> : <>
            {tabs && <FinanceTabs />}
            {/* A failing source read shows an explicit outage state for this page only; the shell and navigation stay usable. Reset on navigation. */}
            <SourceBoundary resetKey={href} title={title}><FrameBody render={children} ctx={{ user, roles: userRoles(user) }} /></SourceBoundary>
          </>}
        </div>}
    </Shell>
  );
}

function FinanceTabs() {
  return <nav className="dp-tabs" aria-label="Finance" data-dp-section-tabs>
    {TABS.map((t) => <Link key={t.to} to={t.to} className="dp-tab" activeProps={{ className: "dp-tab dp-tab-active", "aria-current": "page" } as never} data-dp-tab={t.to}>{t.label}</Link>)}
  </nav>;
}

function FrameBody({ render, ctx }: { render: (ctx: Ctx) => ReactNode; ctx: Ctx }) { return <>{render(ctx)}</>; }

/** RXP-01 AC-RXP-013: an exception while reading/aggregating source records never blanks the app or shows a misleading 0. */
export class SourceBoundary extends Component<{ title: string; resetKey?: string; children: ReactNode }, { error: Error | null; attempt: number }> {
  override state = { error: null as Error | null, attempt: 0 };
  static getDerivedStateFromError(error: Error) { return { error }; }
  /** Changing filters/route clears the outage so the new scope is read again (no remount on ordinary filter changes). */
  override componentDidUpdate(prev: { resetKey?: string }) { if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState((s) => ({ error: null, attempt: s.attempt + 1 })); }
  override componentDidCatch(error: Error, info: ErrorInfo) { console.error(`[DIGIT Pro] ${this.props.title}: source read failed`, error, info.componentStack); }
  override render() {
    if (this.state.error) return <SourceOutage error={this.state.error} onRetry={() => this.setState((s) => ({ error: null, attempt: s.attempt + 1 }))} />;
    return <div key={this.state.attempt} className="contents">{this.props.children}</div>;
  }
}

function SourceOutage({ error, onRetry }: { error: Error; onRetry: () => void }) {
  const ar = useLang() === "ar"; const t = (en: string, arabic: string) => (ar ? arabic : en);
  return <div className="dp-card mt-4" role="alert" data-dp-state="outage">
    <h2 className="font-semibold">{t("Source unavailable", "المصدر غير متاح")}</h2>
    <p className="mt-1 text-sm text-muted-foreground">{t("This page could not read its source records, so no figures are shown — an empty or zero total would be misleading. Nothing was changed or posted.", "تعذّر على هذه الصفحة قراءة سجلات المصدر، لذلك لا تُعرض أي أرقام — فالإجمالي الفارغ أو الصفري سيكون مضللًا. لم يتم تغيير أو ترحيل أي شيء.")}</p>
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <button type="button" className="btn-primary" onClick={onRetry} data-dp-retry>{t("Try again", "إعادة المحاولة")}</button>
      <span className="text-xs text-muted-foreground">{t("The DIGIT Pro menu stays available.", "تبقى قائمة DIGIT Pro متاحة.")}</span>
    </div>
    <details className="mt-3 text-xs text-muted-foreground"><summary>{t("Technical detail", "تفاصيل تقنية")}</summary><code className="mt-1 block break-words" data-no-i18n>{error.message || String(error)}</code></details>
  </div>;
}

const STATE_HELP: Record<"denied" | "unavailable" | "empty", [string, string]> = {
  denied: ["Your role cannot read these records, so no amounts or counts are shown.", "لا يسمح دورك بقراءة هذه السجلات، لذلك لا تُعرض مبالغ أو أعداد."],
  unavailable: ["The source records could not be read; no figures are shown instead of a misleading zero.", "تعذّرت قراءة سجلات المصدر؛ لا تُعرض أرقام بدلًا من صفر مضلل."],
  empty: ["No matching records exist for the current company and filters.", "لا توجد سجلات مطابقة للشركة والفلاتر الحالية."],
};

/** Explicit non-data states (never demo values). */
export function SourceState({ status, doctype }: { status: "denied" | "unavailable" | "empty"; doctype?: string | undefined }) {
  const ar = useLang() === "ar";
  return <div className="dp-state" data-dp-state={status}>
    {status === "denied" ? <span>Not Permitted</span> : status === "unavailable" ? <span>Source unavailable</span> : <span>Nothing to show</span>}
    {doctype && <span className="text-muted-foreground" data-no-i18n> · {ar ? tr(doctype) : doctype}</span>}
    {status !== "empty" && <span className="basis-full text-xs" data-dp-state-help>{STATE_HELP[status][ar ? 1 : 0]}</span>}
  </div>;
}
