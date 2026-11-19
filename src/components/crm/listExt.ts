/**
 * Opt-in register extension point for native CRM lists (shared Core).
 * A DIGIT app may register, per active experience + DocType, extra virtual columns, operational highlights,
 * row actions and a preview inspector. With no registration (or another experience active) the native list
 * renders exactly as before, so other apps are unaffected. Extensions never replace native columns/tools.
 */
import type { ComponentType, ReactNode } from "react";
import type { Doc } from "@/lib/adapter";

export type ExtCol = { key: string; label: string };
export type Highlight = { id: string; label: string; count: number; tone?: string };
export type ListExtension = {
  /** Virtual columns added to the column pool (keys prefixed "x_"). */
  columns: ExtCol[];
  /** Default visible column keys when the user has not saved a column choice. */
  defaultCols: string[];
  highlights: (rows: Doc[]) => Highlight[];
  /** Row predicate for the active highlight (URL ?hl=). */
  matches: (id: string, row: Doc) => boolean;
  cell: (key: string, row: Doc) => ReactNode;
  Actions: ComponentType<{ row: Doc }>;
  Inspector: ComponentType<{ row: Doc; onClose: () => void }>;
  /** Display-only label translation for extension columns/highlights. */
  t: (s: string, lang: string) => string;
  /** App-owned slots; native grouping/settings remain authoritative. */
  KanbanContent?: ComponentType<{ row: Doc }>;
  kanbanSummary?: (rows: Doc[]) => ReactNode;
};
const exts = new Map<string, ListExtension>();
export function registerListExtension(app: string, doctype: string, ext: ListExtension) { exts.set(`${app}::${doctype}`, ext); }
export function listExtension(app: string | undefined, doctype: string) { return app ? exts.get(`${app}::${doctype}`) : undefined; }

/** Optional app-owned insight panel rendered above a native register (CRM lists and directories) while that app's
 *  experience is active. Absent registration → the register renders exactly as before. Presentation only. */
const insights = new Map<string, ComponentType>();
export function registerListInsights(app: string, doctype: string, panel: ComponentType) { insights.set(`${app}::${doctype}`, panel); }
export function listInsights(app: string | undefined, doctype: string) { return app ? insights.get(`${app}::${doctype}`) : undefined; }
