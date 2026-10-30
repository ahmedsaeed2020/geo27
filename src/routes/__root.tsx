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
import { useEffect, type ReactNode } from "react";
import ChatWidget from "@/components/chat/ChatWidget";
import { getPublishedContent } from '@/lib/cms.functions';
import { CmsProvider } from '@/components/cms/CmsContext';
import v3Css from '../v3.css?url';

import appCss from "../styles.css?url";
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

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  loader: () => getPublishedContent(),
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
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
    ],
    scripts: [{ type: "application/ld+json", children: JSON.stringify(ORGANIZATION_JSONLD) }],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "stylesheet", href: bilingualCss },
      { rel: 'stylesheet', href: v3Css },
      { rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },
      { rel: "icon", href: "/favicon.png", type: "image/png" },
      { rel: "apple-touch-icon", href: "/favicon.png" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Archivo:wght@600;700;800;900&family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Sans+Arabic:wght@400;500;600;700;800&family=Space+Mono:wght@400;700&display=swap",
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  const english = useRouterState({ select: state => /^\/en(?:\/|$)/.test(state.location.pathname) });
  return (
    <html lang={english ? "en" : "ar"} dir={english ? "ltr" : "rtl"}>
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const records = Route.useLoaderData();

  return (
    <QueryClientProvider client={queryClient}>
      {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
      <CmsProvider records={records}><Outlet /></CmsProvider>
      <ClientOnly fallback={null}>
        <ChatWidget />
      </ClientOnly>
    </QueryClientProvider>
  );
}
