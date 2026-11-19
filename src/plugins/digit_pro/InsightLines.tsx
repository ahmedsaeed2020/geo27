/**
 * The six workspace insights (run11InsightLines.ts) as indicator tiles. They lead the workspace's ONE indicator row (template T3):
 * the host receives them as strip items and places them first; a line computed from a workspace KPI names that KPI as its figure,
 * so the KPI is not drawn a second time.
 */
import type { ReactNode } from "react";
import { useStoreVersion } from "@/lib/adapter";
import { KpiStrip, type StripItem } from "@/components/enterprise/kit";
import { DrillLink } from "./CommandUi";
import { NavText } from "./ProSidebar";
import type { Drill } from "./command";
import { insightLines, type InsightLine } from "./run11InsightLines";
import type { SectionCtx } from "./sections";

export function InsightTile({ l, ar }: { l: InsightLine; ar: boolean }) {
  return <DrillLink drill={l.drill} className="ek-kpi" data-dp-insight-line={l.id} data-run11-placement={l.id} data-status={l.status} title={ar ? "افتح السجلات" : "Open the records"}>
    <span className="ek-kpi-head"><span className="ek-kpi-label">{ar ? l.title[1] : l.title[0]}</span></span>
    <span className="ek-kpi-main"><bdi className="ek-kpi-value" data-no-i18n>{l.value.split(" · ")[0]}</bdi></span>
    {(l.detail || l.value.includes(" · ")) && <span className="ek-kpi-sub" data-no-i18n>{[l.value.split(" · ").slice(1).join(" · "), l.detail].filter(Boolean).join(" · ")}</span>}
  </DrillLink>;
}

export function insightItems(lines: InsightLine[], ar: boolean): StripItem[] {
  return lines.map((l) => ({ key: `ins:${l.id}`, figures: l.via.startsWith("kpi:") ? [l.via] : [], tags: [l.id], node: <InsightTile key={l.id} l={l} ar={ar} /> }));
}

/** Supplies the insight tiles and lines to `children` (the host's one indicator row); alone it draws them as their own row. */
export function InsightLines({ ws, ctx, user, ar, children }: { ws: string; ctx: SectionCtx; user: string; ar: boolean; children?: (items: StripItem[], lines: InsightLine[]) => ReactNode }) {
  useStoreVersion();
  const lines = insightLines(ws, ctx, user, ar);
  const items = insightItems(lines, ar);
  if (children) return <>{children(items, lines)}</>;
  return items.length ? <div data-dp-insight-lines={items.length}><KpiStrip items={items} ar={ar} tagAttr="data-run11-placement" /></div> : null;
}

const sourceOf = (d: Drill): string | undefined => {
  const x = d as unknown as { kind?: string; doctype?: string; name?: string; report?: string };
  return x.kind === "report" ? x.name ?? x.report : x.doctype;
};
/**
 * Design contract A.2 (owner 2026-11-12): insights are short sourced sentences on the indicator block, not a second card
 * row. A line computed from a workspace KPI is left out — that KPI's tile already shows the figure (one figure once).
 * Each sentence opens the records behind it.
 */
export function InsightNotes({ lines, ar }: { lines: InsightLine[]; ar: boolean }) {
  const shown = lines.filter((l) => !l.via.startsWith("kpi:"));
  if (!shown.length) return null;
  return <ul className="ek-insights" data-dp-insight-notes={shown.length}>{shown.map((l) => { const src = sourceOf(l.drill);
    return <li key={l.id}><DrillLink drill={l.drill} className="ek-insight" data-dp-insight-line={l.id} data-run11-placement={l.id} data-status={l.status} title={ar ? "افتح السجلات" : "Open the records"}>
      <i aria-hidden className="ek-insight-dot" /><span className="ek-insight-t">{ar ? l.title[1] : l.title[0]}</span>
      <bdi className="ek-insight-v" data-no-i18n>{l.value}</bdi>{l.detail && <span className="ek-insight-d" data-no-i18n>{l.detail}</span>}
      {src && <span className="ek-insight-s">{ar ? "المصدر: " : "Source: "}<NavText label={src} /></span>}
    </DrillLink></li>; })}</ul>;
}
