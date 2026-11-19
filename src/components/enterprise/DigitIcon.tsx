/**
 * Official DIGIT icon library (owner upload 2026-10-18, public/icons/digit/README.md): one registry and one component
 * for every DIGIT surface. Each icon has a light variant (ink #0B1F17 + emerald accent, for light surfaces) and a dark
 * variant (white ink + mint accent, for green rails, headers and dark mode). `on="dark"` picks the dark variant; on light
 * surfaces the variant follows the user's dark-mode setting. Icons are decorative unless a `title` is given.
 */
import { useSyncExternalStore } from "react";

export const DIGIT_ICONS = {
  mod: ["accounts", "assets", "crm", "einvoicing", "financial", "hr", "inventory", "manufacturing", "pos", "projects", "purchases", "reports", "sales"],
  ui: ["add", "calendar", "chevron", "close", "dashboard", "download", "edit", "filter", "info", "language", "logout", "menu", "notifications", "print", "refresh", "save", "search", "settings", "share", "success", "support", "trash", "upload", "user", "warning"],
  feat: ["ai", "backup", "bilingual", "cloud", "documents", "integrations", "multicurrency", "permissions", "security", "signature"],
  ind: ["contracting", "distribution", "education", "healthcare", "hospitality", "manufacturing", "multibranch", "proservices", "realestate", "retail"],
  svc: ["customization", "data-migration", "discovery", "erpnext", "hosting", "implementation", "maintenance", "support", "training", "zatca-onboarding"],
  pos: ["mobileshops", "pharmacies", "salons", "sweets"],
  trust: ["comparison", "email", "knowledge", "location", "login", "phone", "sla", "zatca"],
} as const;
type Families = typeof DIGIT_ICONS;
export type DigitIconFamily = keyof Families;
export type DigitIconName = { [F in DigitIconFamily]: `${F}-${Families[F][number]}` }[DigitIconFamily];

/** Brand marks (logo/). `app` = tile with its own green square; `mark` = ink mark for light tiles; `white` = on green. */
export const DIGIT_LOGO = {
  app: "/icons/digit/logo/digit-icon-app.svg",
  mark: "/icons/digit/logo/digit-icon.svg",
  white: "/icons/digit/logo/digit-icon-white.svg",
  mono: "/icons/digit/logo/digit-icon-mono.svg",
} as const;

export const isDigitIcon = (s: string): s is DigitIconName => {
  const i = s.indexOf("-"); const fam = s.slice(0, i) as DigitIconFamily;
  return i > 0 && fam in DIGIT_ICONS && (DIGIT_ICONS[fam] as readonly string[]).includes(s.slice(i + 1));
};

export function digitIconSrc(name: DigitIconName, tone: "light" | "dark" = "light"): string {
  const fam = name.slice(0, name.indexOf("-"));
  return `/icons/digit/${fam}/digit-${name}-${tone}.svg`;
}

// one observer for html.dark + html[data-enterprise] (both set by the shared Shell / user settings)
type HtmlState = { dark: boolean; enterprise: boolean };
let snap: HtmlState = { dark: false, enterprise: false };
const subs = new Set<() => void>();
let observer: MutationObserver | null = null;
const read = (): HtmlState => {
  const h = document.documentElement;
  const next = { dark: h.classList.contains("dark"), enterprise: h.hasAttribute("data-enterprise") };
  if (next.dark !== snap.dark || next.enterprise !== snap.enterprise) snap = next;
  return snap;
};
function subscribe(f: () => void) {
  subs.add(f);
  if (!observer && typeof MutationObserver !== "undefined") {
    observer = new MutationObserver(() => { const before = snap; if (read() !== before) subs.forEach((s) => s()); });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "data-enterprise"] });
  }
  return () => { subs.delete(f); if (!subs.size) { observer?.disconnect(); observer = null; } };
}
const SERVER: HtmlState = { dark: false, enterprise: false };
const useHtmlState = () => useSyncExternalStore(subscribe, read, () => SERVER);
/** True while the DIGIT Enterprise shell is active (any enabled DIGIT app); the Standard Desk keeps its own icons. */
export const useEnterpriseMode = () => useHtmlState().enterprise;

export function DigitIcon({ name, on = "light", size = 20, className, title }: { name: DigitIconName; on?: "light" | "dark"; size?: number; className?: string | undefined; title?: string | undefined }) {
  const { dark } = useHtmlState();
  const tone = on === "dark" || dark ? "dark" : "light";
  return (
    <img src={digitIconSrc(name, tone)} width={size} height={size} alt={title ?? ""} {...(title ? { title } : { "aria-hidden": true })}
      draggable={false} className={`dx-icon ${className ?? ""}`} data-digit-icon={name} />
  );
}

/** Toolbar/menu glyph shown only in the DIGIT Enterprise shell; the Standard Desk keeps `fallback` (its source glyph or nothing). */
export function EntGlyph({ name, on = "light", fallback, size = 18 }: { name: DigitIconName; on?: "light" | "dark"; fallback?: string | undefined; size?: number }) {
  const ent = useEnterpriseMode();
  if (!ent) return <>{fallback ?? null}</>;
  return <DigitIcon name={name} on={on} size={size} className="dx-glyph" />;
}
