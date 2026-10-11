import { Link, useRouterState } from "@tanstack/react-router";
import { Languages } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLocale, localeHref } from "@/lib/i18n";

export default function LanguageSwitch() {
  const locale = useLocale();
  const location = useRouterState({ select: state => state.location });
  const next = locale === "ar" ? "en" : "ar";
  return <Button asChild variant="outline" size="sm" data-language-switch>
    <Link data-language-switch to={localeHref(location.pathname, next)} search={location.search} hash={location.hash} hrefLang={next} aria-label={locale === "ar" ? "Switch to English" : "التبديل إلى العربية"} dir={next === "ar" ? "rtl" : "ltr"}>
      <Languages size={16} /><span>{locale === "ar" ? "EN" : "العربية"}</span>
    </Link>
  </Button>;
}