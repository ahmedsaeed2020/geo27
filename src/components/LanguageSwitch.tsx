import { Link, useRouterState } from "@tanstack/react-router";
import { Globe, Languages } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLocale, localeHref } from "@/lib/i18n";

/**
 * Page-preserving language switch. The header uses the compact outline button ("EN"); the dark footer passes
 * `tone="dark"`, which shows a globe and the full language name so it reads clearly on the deep green background.
 */
export default function LanguageSwitch({ tone = "light" }: { tone?: "light" | "dark" }) {
  const locale = useLocale();
  const location = useRouterState({ select: state => state.location });
  const next = locale === "ar" ? "en" : "ar";
  const label = locale === "ar" ? "Switch to English" : "التبديل إلى العربية";
  if (tone === "dark") {
    return (
      <Link
        data-language-switch
        to={localeHref(location.pathname, next)}
        search={location.search}
        hash={location.hash}
        hrefLang={next}
        aria-label={label}
        dir={next === "ar" ? "rtl" : "ltr"}
        className="group inline-flex h-10 items-center gap-2.5 rounded-full border border-mint/35 bg-mint/10 ps-1.5 pe-4 text-[13.5px] font-bold text-white transition-colors hover:border-mint hover:bg-mint/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mint"
      >
        <span className="grid size-7 place-items-center rounded-full bg-mint text-ink transition-transform group-hover:rotate-12" aria-hidden="true">
          <Globe className="size-4" />
        </span>
        <span>{next === "en" ? "English" : "العربية"}</span>
      </Link>
    );
  }
  return <Button asChild variant="outline" size="sm" data-language-switch>
    <Link data-language-switch to={localeHref(location.pathname, next)} search={location.search} hash={location.hash} hrefLang={next} aria-label={label} dir={next === "ar" ? "rtl" : "ltr"}>
      <Languages size={16} /><span>{locale === "ar" ? "EN" : "العربية"}</span>
    </Link>
  </Button>;
}
