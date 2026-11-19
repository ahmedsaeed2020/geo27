import { ORGANIZATION_JSONLD } from "@/lib/seo";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  ClientOnly,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
  useRouterState,
  type ErrorComponentProps,
} from "@tanstack/react-router";
import { lazy, Suspense, useEffect, useState, type ReactNode } from "react";
import { coreHead } from "@/core/coreHead";
import { useServerFn } from '@tanstack/react-start';
import { getDraftSiteConfig } from '@/lib/cms-admin.functions';
import type { SiteConfig } from '@/lib/site-config-schema';
import ChatWidget from "@/components/chat/ChatWidget";
import FormCtaRouting from "@/components/FormCtaRouting";
import { loadSite, previewTokenFrom } from '@/lib/cms-query';
import { CmsProvider } from '@/components/cms/CmsContext';
import PreviewBanner, { SettingsDraftBanner, type SettingsDraftState } from '@/components/cms/PreviewBanner';
import v3Css from '../v3.css?url';
import catalogCss from '../catalog.css?url';
import motionCss from '../motion.css?url';
import { motionIdentity } from '@/motion/identity';
import { captureAttribution } from '@/lib/campaign-attribution';

import appCss from "../site.css?url";
import bilingualCss from "../bilingual.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { localizeTree, useLocale } from "@/lib/i18n";

function NotFoundComponent() {
  const locale = useLocale();
  return localizeTree((
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">الصفحة غير موجودة</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          الصفحة التي تبحث عنها غير موجودة أو تم نقلها.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            العودة للرئيسية
          </Link>
        </div>
      </div>
    </div>
  ), locale);
}

function ErrorComponent({ error, reset }: ErrorComponentProps) {
  const locale = useLocale();
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return localizeTree((
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          تعذّر تحميل الصفحة
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          حدث خطأ من جهتنا. يمكنك التحديث أو العودة للرئيسية.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            حاول مجدداً
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            العودة للرئيسية
          </a>
        </div>
      </div>
    </div>
  ), locale);
}

/** DIGIT app paths (Core + Enterprise + CRM). Everything else is the website. */
export const isCorePath = (p: string) => /^\/(digit-crm|digit-hr|digit-pro|digit-fsm|digit|app|desk|enterprise|login|insights|finance|stock|tax|report|page|selling|buying|control|developer|plugins|settings|printview|my-space|help|dev|department|dashboard|customize-form|coverage|compliance)(\/|$)/.test(p);
const CoreRoot = lazy(() => import("@/core/coreRoot").then((m) => ({ default: m.CoreRootComponent })));

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  loaderDeps: ({ search }) => ({ preview: previewTokenFrom(search) }),
  beforeLoad: async ({ location }) => {
    if (isCorePath(location.pathname)) { const m = await import("@/core/coreRoot"); await m.coreBeforeLoad(location); }
  },
  loader: ({ context, deps, location }) => (isCorePath(location.pathname) ? null : loadSite(context.queryClient, deps)),
  head: ({ loaderData, matches }) => {
    if (isCorePath(matches[matches.length - 1]?.pathname ?? "/")) return coreHead();
    const branding = loaderData?.config.branding;
    const icon = branding?.faviconUrl;
    return {
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { name: "google-site-verification", content: "nMt_xOQP4h78h_OdrlQWThvhx_00klI7Zg1KCJ4bWH8" },
      { title: "Digit — منصة ERP سعودية" },
      {
        name: "description",
        content:
          "Digit نظام ERP مالي وتشغيلي للسوق السعودي — محاسبة وفوترة إلكترونية ومبيعات ومشتريات ومخزون ونقاط بيع وتقارير.",
      },
      { property: "og:title", content: "Digit — منصة ERP سعودية" },
      {
        property: "og:description",
        content:
          "منصة واحدة تدير ماليتك وعملياتك ونقاط بيعك — محاسبة وفوترة إلكترونية ومخزون وتقارير، سحابياً أو داخل سيرفراتك.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { property: "og:site_name", content: "Digit" },
      ...(loaderData?.preview ? [{ name: "robots", content: "noindex, nofollow" }] : []),
    ],
    styles: branding?.primary ? [{ children: `:root{--primary:${branding.primary};--ring:${branding.primary};}` }] : [],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "stylesheet", href: bilingualCss },
      { rel: 'stylesheet', href: v3Css },
      { rel: 'stylesheet', href: catalogCss },
      { rel: 'stylesheet', href: motionCss },
      ...(icon
        ? [{ rel: "icon", href: icon, type: "image/png" }, { rel: "apple-touch-icon", href: icon }]
        : [
            { rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },
            { rel: "icon", href: "/favicon.png", type: "image/png" },
            { rel: "apple-touch-icon", href: "/favicon.png" },
          ]),
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Archivo:wght@600;700;800;900&family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Sans+Arabic:wght@400;500;600;700;800&family=Space+Mono:wght@400;700&display=swap",
      },
    ],
    };
  },
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  const core = useRouterState({ select: state => isCorePath(state.location.pathname) });
  if (core) return (
    <html lang="ar" dir="rtl" suppressHydrationWarning>
      <head><HeadContent /></head>
      <body>{children}<Scripts /></body>
    </html>
  );
  const landing = useRouterState({ select: state => /^\/(?:en\/?)?$/.test(state.location.pathname) });
  const english = useRouterState({ select: state => /^\/en(?:\/|$)/.test(state.location.pathname) });
  // The product family's motion identity is server-rendered so first-fold choreography runs on first paint.
  const identity = useRouterState({ select: state => motionIdentity(state.location.pathname) });
  return (
    // Arabic is the site's primary language and the literal default; /en pages override lang and dir.
    <html lang="ar" dir="rtl" {...(english ? { lang: "en", dir: "ltr" } : {})} data-dm={identity}>
      <head>
        <HeadContent />
        {!landing && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ORGANIZATION_JSONLD) }} />}
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

const DRAFT_SETTING_KEYS = ['forms', 'home', 'pro', 'catalog'] as const;

/**
 * `?draft_settings=home|pro|forms|catalog` shows saved, unpublished settings to a signed-in editor. It runs only in the
 * browser after hydration (the session lives there) and never changes what visitors or crawlers receive.
 */
function useSettingsDraft(): SettingsDraftState {
  const requested = useRouterState({ select: s => String((s.location.search as Record<string, unknown>)['draft_settings'] ?? '') });
  const key = DRAFT_SETTING_KEYS.find(k => k === requested);
  const load = useServerFn(getDraftSiteConfig);
  const [state, setState] = useState<SettingsDraftState>({ status: 'off' });
  useEffect(() => {
    if (!key) {
      setState({ status: 'off' });
      return;
    }
    let live = true;
    setState({ status: 'loading', key });
    load({ data: { key } })
      .then(r => live && setState({ status: 'ok', key, value: r.value as never }))
      .catch(() => live && setState({ status: 'denied', key }));
    return () => {
      live = false;
    };
  }, [key, load]);
  return state;
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const core = useRouterState({ select: s => isCorePath(s.location.pathname) });
  if (core) return <QueryClientProvider client={queryClient}><Suspense fallback={null}><CoreRoot /></Suspense></QueryClientProvider>;
  return <SiteRoot />;
}

function SiteRoot() {
  const { queryClient } = Route.useRouteContext();
  const site = Route.useLoaderData()!;
  const privateArea = useRouterState({ select: s => /^\/(admin|auth)(\/|$)/.test(s.location.pathname) });
  const landing = useRouterState({ select: s => /^\/(?:en\/?)?$/.test(s.location.pathname) });
  const draft = useSettingsDraft();
  const campaignLocation = useRouterState({ select: s => s.location.href });
  useEffect(() => { if (!privateArea) captureAttribution(); }, [campaignLocation, privateArea]);
  const config: SiteConfig = draft.status === 'ok' ? { ...site.config, [draft.key]: draft.value } : site.config;

  return (
    <QueryClientProvider client={queryClient}>
      {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
      <CmsProvider records={site.records} config={config} preview={site.preview} media={site.media}>
        <Outlet />
        <PreviewBanner />
        <SettingsDraftBanner state={draft} />
      </CmsProvider>
      <ClientOnly fallback={null}>
        {!privateArea && !landing && <ChatWidget />}
        {!privateArea && !landing && <FormCtaRouting />}
      </ClientOnly>
    </QueryClientProvider>
  );
}
