/**
 * Global services (owner enterprise UI goal 2026-10-21, Lock 1): every DIGIT app shows the same four services in the
 * same order with the same official icons and labels as DIGIT Pro — Reports, Compliance, Settings, Help. Each app
 * supplies its own target where it has one; a missing Reports / Compliance / Settings / Help target opens the shared
 * Core page (/report, /compliance, /settings, /help), so the controls never differ between apps. Dependency-free so
 * every rail (module rail, CRM, HR) can import it.
 */
import type { DigitIconName } from "./DigitIcon";

export type GlobalServiceKey = "reports" | "compliance" | "settings" | "help";
export interface GlobalService { key: string; label: string; icon: string; to: string; params?: Record<string, string> | undefined; search?: Record<string, unknown> | undefined; active?: boolean | undefined; /** active AND on the target's own address (aria-current="page"); active only → current section ("true") */ exact?: boolean | undefined; onClick?: (() => void) | undefined; module?: string | undefined }
export type ServiceTarget = Omit<GlobalService, "key" | "label" | "icon">;

export const GLOBAL_SERVICES: { key: GlobalServiceKey; icon: DigitIconName; en: string; ar: string }[] = [
  { key: "reports", icon: "mod-reports", en: "Reports", ar: "التقارير" },
  { key: "compliance", icon: "trust-zatca", en: "Compliance", ar: "الامتثال" },
  { key: "settings", icon: "ui-settings", en: "Settings", ar: "الإعدادات" },
  { key: "help", icon: "ui-support", en: "Help", ar: "المساعدة" },
];
export const CORE_SERVICE: Record<GlobalServiceKey, string> = { reports: "/report", compliance: "/compliance", settings: "/settings", help: "/help" };

export function globalServices(ar: boolean, path: string, own: Partial<Record<GlobalServiceKey, ServiceTarget>>): GlobalService[] {
  return GLOBAL_SERVICES.map((g) => ({ key: g.key, icon: g.icon, label: ar ? g.ar : g.en, ...(own[g.key] ?? { to: CORE_SERVICE[g.key], active: path === CORE_SERVICE[g.key], exact: path === CORE_SERVICE[g.key] }) }));
}
