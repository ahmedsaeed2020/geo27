import { cloneElement, isValidElement, type ReactNode, type ReactElement } from "react";
import { useRouterState } from "@tanstack/react-router";
import translations from "@/content/en/translations.json";

export type Locale = "ar" | "en";
const dictionary: Record<string, string> = translations;
export function useLocale(): Locale {
  return useRouterState({ select: state => /^\/en(?:\/|$)/.test(state.location.pathname) ? "en" : "ar" });
}
export function translate(text: string, locale: Locale = "en"): string {
  if (locale === "ar") return text;
  const normalized = text.replace(/\s+/g, " ").trim();
  return dictionary[text] ?? dictionary[normalized] ?? text.replace(/الشريحة /g, "Slide ");
}
export function localeHref(href: string, locale: Locale): string {
  if (!href.startsWith("/") || href.startsWith("//") || href.startsWith("/__l5e/") || /\.[a-z0-9]+(?:[?#]|$)/i.test(href)) return href;
  const bare = href.replace(/^\/en(?=\/|$)/, "") || "/";
  return locale === "en" ? `/en${bare === "/" ? "" : bare}` : bare;
}
export function localizeData<T>(data: T, locale: Locale = "en"): T {
  if (typeof data === "string") {
    const value = translate(data, locale).replace(/(href=["'])(\/(?!\/)[^"']*)(["'])/g, (_, start, href, end) => start + localeHref(href, locale) + end);
    return value as T;
  }
  if (Array.isArray(data)) return data.map(item => localizeData(item, locale)) as T;
  if (data && typeof data === "object") return Object.fromEntries(Object.entries(data).map(([key, value]) => [key, key === "href" && typeof value === "string" ? localeHref(value, locale) : localizeData(value, locale)])) as T;
  return data;
}
export function localizeTree(tree: ReactNode, locale: Locale): ReactNode {
  if (locale === "ar") return tree;
  if (typeof tree === "string") return translate(tree, locale);
  if (Array.isArray(tree)) return tree.map(child => localizeTree(child, locale));
  if (!isValidElement(tree)) return tree;
  const element = tree as ReactElement<Record<string, unknown>>;
  const props = { ...element.props };
  if (props['data-language-switch']) return tree;
  for (const key of ["title", "alt", "aria-label", "placeholder"]) if (typeof props[key] === "string") props[key] = translate(props[key], locale);
  for (const key of ["href", "to"]) if (typeof props[key] === "string") props[key] = localeHref(props[key], locale);
  if (props['dangerouslySetInnerHTML']) props['dangerouslySetInnerHTML'] = localizeData(props['dangerouslySetInnerHTML'], locale);
  const { children, ...rest } = props;
  if (children === undefined) return cloneElement(element, rest);
  const localized = localizeTree(children as ReactNode, locale);
  // Spread static child lists back as arguments so React keeps treating them as static (no key warnings).
  return Array.isArray(localized) ? cloneElement(element, rest, ...localized) : cloneElement(element, rest, localized);
}