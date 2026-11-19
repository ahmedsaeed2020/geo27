/**
 * Page dashboards (owner 2026-11-13 §2.4): any Enterprise page (department overview, executive page, Home) turns its zones
 * into blocks of the ONE Dashboard Designer, so users add, remove, reorder, resize and adjust them in place, save per user,
 * and Administration publishes per role / company and switches blocks off per role. The page renders each block's content
 * (its own components and figures); the Designer only composes. A block the page has nothing for is left out.
 */
import type { ReactNode } from "react";
import { DashboardDesigner } from "./DashboardDesigner";
import { getDashboard, registerDashboard, type DashboardDef, type Height, type Width, BLOCK_OPTIONS } from "@/lib/dashboards/registry";
import type { Bi } from "@/lib/dashboards/views";

export interface PageBlockDef { id: string; title: Bi; meaning?: Bi | undefined; w?: Width | undefined; h?: Height | undefined; inDefault?: boolean | undefined; required?: boolean | undefined;
  /** the block re-reads its own period / comparison (block menu); its node is then a function of the saved options */ period?: boolean | undefined }
/** A block's content, or — for a period-aware block — a renderer of its saved block-menu options (per / pfrom / pto / pcmp). */
export type PageNode = ReactNode | ((opts: Record<string, string | undefined>) => ReactNode);
export type PageNodes = Record<string, PageNode>;
const has = (c: PageNodes, id: string) => c[id] !== undefined && c[id] !== null && c[id] !== false;

/** Register (or refresh) a page dashboard contract from its block list; the same ids keep saved layouts valid. */
export function pageDashboard(app: string, id: string, title: Bi, blocks: PageBlockDef[], managerRoles?: string[]): DashboardDef<PageNodes> {
  const sig = JSON.stringify(blocks.map((b) => [b.id, b.title, b.w ?? 12, b.h ?? 1, b.inDefault ?? true, b.required ?? false, b.period ?? false]));
  const hit = getDashboard<PageNodes>(app, id) as (DashboardDef<PageNodes> & { sig?: string }) | undefined;
  if (hit && hit.sig === sig) return hit;
  const def = registerDashboard<PageNodes>({ app, id, title, ...(managerRoles ? { managerRoles } : {}), widgets: blocks.map((b) => ({
    id: b.id, version: 1, title: b.title, meaning: b.meaning ?? b.title, sources: [], shape: "panel", defaultView: "panel", size: { w: b.w ?? 12, ...(b.h ? { h: b.h } : {}) },
    ...(b.required ? { required: true } : {}), ...(b.inDefault === false ? { inDefault: false } : {}), ...(b.period ? { options: BLOCK_OPTIONS } : {}),
    absent: (c: PageNodes) => !has(c, b.id), render: (c: PageNodes, opts: Record<string, string>) => { const v = c[b.id]; return <>{typeof v === "function" ? v(opts) : v}</>; },
  })) });
  (def as DashboardDef<PageNodes> & { sig?: string }).sig = sig;
  return def;
}

export function PageBlocks({ def, nodes, company, className, addSlot }: { def: DashboardDef<PageNodes>; nodes: PageNodes; company?: string | undefined; className?: string | undefined; /** «أضف عنصرًا +» at the end of the first KPI row */ addSlot?: boolean | undefined }) {
  return <DashboardDesigner def={def} ctx={nodes} bandEdit company={company} className={className} addSlot={addSlot} />;
}
