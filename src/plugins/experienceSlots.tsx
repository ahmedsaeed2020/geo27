/**
 * App experience slots (shared Core extension point). An installed DIGIT app with a manifest `experience` may provide
 * UI that the Core shell renders ONLY while that app is enabled and its experience is active (src/plugins/theme.ts):
 * a replacement module sidebar and breadcrumbs, native-form panels, child-grid keyboard handling, dock grouping and
 * workspace extras. Core files read slots through this module only — they never import an app directly — so disabling
 * the app (or leaving its experience) restores the Standard Desk exactly, and the next app plugs in with one line in
 * src/plugins/slotRegistry.ts. Slots are display/interaction only: records, permissions, workflows and posting stay
 * the shared Core engines.
 */
import { useBlocker } from "@tanstack/react-router";
import type { ComponentType, KeyboardEvent, ReactNode } from "react";
import type { DocTypeMeta } from "@/lib/catalog";
import { adapter, type Doc } from "@/lib/adapter";
import { useHydrated } from "@/components/hrms/HrShell";
import { enabledPlugins, usePluginsVersion } from "./runtime";
import { useActiveExperience } from "./theme";
import type { PluginManifest } from "./types";
import { slotProviders } from "./slotRegistry";

export type Crumb = { label: string; to?: ReactNode };
import type { DocPanel } from "@/components/enterprise/DocPanels";
export interface FormPanelProps { meta: DocTypeMeta; doc: Doc; dirty: boolean; canWrite: boolean; onChange: (patch: Record<string, unknown>) => void }

/** Bilingual display text (the app's own approved wording; never machine-translated). */
export type Bi = { en: string; ar: string };
/** A primary module of the app, listed on the DIGIT Enterprise Home and its navigation. */
export interface EnterpriseModule { id: string; label: Bi; to: string; search?: Record<string, string>; /** icon drawn for dark surfaces; a `-light.svg` sibling is used on white */ icon?: string; Icon?: ComponentType<{ className?: string; strokeWidth?: number }> }
/**
 * Source-backed indicator on the Enterprise Home: a COUNT of permitted `doctype` records matching `filters`
 * (desk.matchFilter semantics), drilled to the native list with the same filters. Definitions are the app's own;
 * the Enterprise Home never stores or invents values.
 */
export interface EnterpriseIndicator { id: string; label: Bi; definition: Bi; doctype: string; /** source app of the DocType (resolved from the catalog index when omitted) */ app?: string; filters: [string, string, unknown][]; tone?: "neutral" | "attention" }
/** Enterprise Home entry of an app (display only). `roles` limits who sees the app in the enterprise selector (Administrator always). */
export interface EnterpriseEntry { description: Bi; modules: () => EnterpriseModule[]; indicators?: EnterpriseIndicator[]; roles?: string[]; /** native DocTypes this app's navigation hosts: Enterprise Home links to them open inside this app's shell */ owns?: (doctype: string) => boolean }

export interface ExperienceSlots {
  /** Replaces the Desk module sidebar while the experience is active; `account` is the Core avatar menu. */
  Sidebar?: ComponentType<{ account?: ReactNode; onNavigate?: () => void }>;
  /** The app renders its own source-aware Back (e.g. in its breadcrumbs); the shared document header then omits its Back chip. */
  ownsBack?: boolean;
  /** Replaces the Desk breadcrumb strip while active. */
  Crumbs?: ComponentType<{ crumbs: Crumb[] }>;
  /** Hook mounted by every Shell (also in Standard Desk), e.g. per-history-entry origin recording for app Back. */
  useShellEffects?: () => void;
  /** Phone drawer: keep the menu open after navigating to this path (app rail click shows the chosen context's menu). */
  keepDrawerOn?: (path: string) => boolean;
  /** Panels rendered above native forms while active (read Core records; write only through the form's onChange). */
  FormPanels?: ComponentType<FormPanelProps>;
  /** The same panels as a list with their OWN-65 group; the record page merges them with the Core panels into brand tabs. */
  formPanelList?: (p: FormPanelProps) => DocPanel[];
  /** Extra section on the shared Help page while active (e.g. the app's own release notes). */
  HelpExtras?: ComponentType;
  /** Ask before discarding an unsaved native form while active; panels for `except` DocTypes install their own guard. */
  unsavedGuard?: { except: string[]; message: { en: string; ar: string } };
  /** Extra keyboard handling inside the Core child grid while active. */
  gridKeyDown?: (e: KeyboardEvent<HTMLElement>) => void;
  /** Dock entry (shown after Home whenever the app is enabled) and, while active, the grouped dock order + "More Apps". */
  dock?: { icon: string; label: string; label_ar?: string; /** approved short dock name (never truncated) */ short?: string; short_ar?: string; home: string; main: string[]; moreIcon?: string; /** the icon already carries its own app tile (drawn edge to edge) */ tile?: boolean };
  /** DIGIT Enterprise Home entry: description, primary modules and source-backed indicators. */
  enterprise?: EnterpriseEntry;
  /** Extra content on the app's own workspace page (/plugins/<name>). */
  WorkspaceExtras?: ComponentType<{ plugin: PluginManifest }>;
  /** Badge next to a native workspace link (e.g. an app-enhanced native screen). */
  linkBadge?: (doctype: string) => ReactNode;
  /**
   * Shared Core pages (ServiceRoute: finance, stock, buying, selling, control, support, tax, query studio) that this app's own
   * navigation places in one of its menus. Opening such a page enters the placing app, the band's eyebrow names the app and
   * department (Eyebrow) and the section's sibling pages are drawn as tabs directly under the band (Tabs).
   */
  corePage?: { places: (path: string) => boolean; Eyebrow: ComponentType; Tabs?: ComponentType };
}

/** The enabled app whose navigation places this shared Core page — the active app when it places it, else the first one that does. */
export function corePageOwner(path: string, active: string, enabled: string[]): string | undefined {
  const placed = (n: string) => enabled.includes(n) && !!slotsOf(n)?.corePage?.places(path);
  if (active && placed(active)) return active;
  return allSlotProviders().map(([n]) => n).find(placed);
}

/** Slot providers keyed by plugin name (static; see slotRegistry.ts). */
export const slotsOf = (name: string): ExperienceSlots | undefined => slotProviders()[name];
export const allSlotProviders = (): [string, ExperienceSlots][] => Object.entries(slotProviders());

/** Slots apply only when the active experience names an app that is enabled AND provides slots; otherwise Standard Desk. */
export function resolveSlots(active: string, enabled: string[]): { name: string; slots: ExperienceSlots } | undefined {
  const slots = active ? slotsOf(active) : undefined;
  return slots && enabled.includes(active) ? { name: active, slots } : undefined;
}

/** The active experience's slots, or undefined in Standard Desk (also before hydration, so SSR renders Standard Desk). */
export function useExperienceSlots(): { name: string; slots: ExperienceSlots } | undefined {
  const hyd = useHydrated(); const active = useActiveExperience(); usePluginsVersion();
  return hyd ? resolveSlots(active, enabledPlugins().map((p) => p.name)) : undefined;
}

/** Mounts every provider's Shell effect in a stable order (the provider table is static, so hook order never changes). */
export function useSlotShellEffects() {
  for (const [, s] of allSlotProviders()) (s.useShellEffects ?? noop)();
}
const noop = () => {};

/** Native form unsaved-changes guard of the active experience (Back, breadcrumbs, sidebar and refresh ask first). */
export function useExperienceUnsavedGuard(dirty: boolean, doctypeSlug: string, doctype: string) {
  const x = useExperienceSlots();
  const g = x?.slots.unsavedGuard;
  const on = !!g && dirty && !g.except.includes(doctype) && !g.except.includes(doctypeSlug);
  // the first save of a `new-…` draft replaces the route with the saved name (form.js frappe.set_route) before the form
  // re-renders clean; that draft no longer exists, so this move is never "leaving unsaved changes"
  const firstSave = (cur: string, next: string) => {
    const c = cur.split("/"), n = next.split("/"), nm = decodeURIComponent(c[c.length - 1] ?? "");
    return nm.startsWith("new-") && c.length === n.length && c.slice(0, -1).join("/") === n.slice(0, -1).join("/") && !adapter.get(doctype, nm);
  };
  useBlocker({ shouldBlockFn: ({ current, next }) => on && !firstSave(current.pathname, next.pathname) && !window.confirm(document.documentElement.dir === "rtl" ? g!.message.ar : g!.message.en), enableBeforeUnload: () => on, withResolver: false });
}
