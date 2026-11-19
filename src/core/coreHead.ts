// DIGIT Core head (stylesheets, title) — used by the merged root for app paths only
import tokensCss from "@/components/enterprise/tokens.css?url";
import enterpriseCss from "@/components/enterprise/enterprise.css?url";
import visualCss from "@/components/enterprise/visual.css?url";
import round1Css from "@/components/enterprise/round1.css?url";
import kitCss from "@/components/enterprise/kit/kit.css?url";
import recordCss from "@/components/enterprise/kit/record.css?url";
import dispatchCss from "@/components/enterprise/kit/dispatch.css?url";
import inspectCss from "@/components/enterprise/kit/inspect.css?url";
import fieldCss from "@/components/enterprise/kit/field.css?url";
import digitProCss from "@/plugins/digit_pro/digit_pro.css?url";
import digitHrCss from "@/plugins/digit_hr/digit_hr.css?url";
import digitCrmCss from "@/plugins/digit_crm/experience.css?url";
import digitFsmCss from "@/plugins/digit_fsm/digit_fsm.css?url";
import appCss from "../styles.css?url";

export const coreHead = () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "DIGIT Enterprise CRM" },
      { name: "description", content: "Virtual baseline of DIGIT, DIGIT HR and DIGIT CRM." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      // Phase 3 theme tokens (the only raw colours), the shared DIGIT Enterprise contract, then app-owned scoped sheets that consume it
      { rel: "stylesheet", href: tokensCss },
      { rel: "stylesheet", href: enterpriseCss },
      { rel: "stylesheet", href: kitCss },
      { rel: "stylesheet", href: recordCss },
      { rel: "stylesheet", href: dispatchCss },
      { rel: "stylesheet", href: inspectCss },
      { rel: "stylesheet", href: fieldCss },
      // app-owned scoped stylesheets load after the Core sheet so their scoped tokens win on <html class="theme-…">
      { rel: "stylesheet", href: digitProCss },
      { rel: "stylesheet", href: digitHrCss },
      { rel: "stylesheet", href: digitCrmCss },
      { rel: "stylesheet", href: digitFsmCss },
      // visual system R3: the final presentation layer every DIGIT app (except CRM, until its round) inherits
      { rel: "stylesheet", href: visualCss },
      { rel: "stylesheet", href: round1Css },
      // DIGIT app icon (public/favicon.ico 16–256 px + apple-touch-icon for phone home screens and link previews)
      { rel: "icon", href: "/favicon.ico", type: "image/x-icon", sizes: "any" },
      { rel: "apple-touch-icon", href: "/apple-touch-icon.png", sizes: "180x180" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Archivo:wght@600;700;800&family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&family=Space+Mono:wght@400;700&display=swap" },
    ],
  });
