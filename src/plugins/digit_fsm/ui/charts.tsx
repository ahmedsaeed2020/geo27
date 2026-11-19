/**
 * FSM chart pieces on the shared Enterprise chart kit (ONE STANDARD R4: no app keeps its own chart). Values are passed in
 * by the page from canonical records; every mark keeps its own drill link (`wrap`), so the records opened are the records
 * counted.
 */
import type { ReactNode } from "react";
import { useLang } from "@/i18n";
import { Donut as KitDonut, RankedBars, type Datum, type Tone } from "@/components/enterprise/kit";
import type { DxTone } from "@/components/digit/Experience";
import { numTxt } from "./kit";

const TONE: Record<DxTone, Tone> = { good: "good", warn: "attention", bad: "risk", info: "info", neutral: "neutral" };
export interface ChartItem { key: string; label: ReactNode; value: number; tone?: DxTone | undefined; wrap?: ((node: ReactNode) => ReactNode) | undefined }
const datum = (x: ChartItem): Datum => ({ key: x.key, label: typeof x.label === "string" ? x.label : x.key, ...(typeof x.label === "string" ? {} : { node: x.label }), value: x.value, ...(x.tone ? { tone: TONE[x.tone] } : {}), ...(x.wrap ? { drill: x.wrap } : {}) });
const wrap = (drill: unknown, n: ReactNode) => (drill as (node: ReactNode) => ReactNode)(n);

/** Part-to-whole ring; the legend rows are the drill targets (keyboard and screen-reader friendly). */
export function Donut({ items, total: totalLabel, empty }: { items: ChartItem[]; total: ReactNode; empty: ReactNode }) {
  const ar = useLang() === "ar";
  const shown = items.filter((x) => x.value > 0);
  if (!shown.length) return <p className="py-6 text-center text-sm text-muted-foreground" data-fsm-chart="donut-empty">{empty}</p>;
  return <div data-fsm-chart="donut"><KitDonut data={shown.map(datum)} ar={ar} wrap={wrap} fmt={(v) => numTxt(v)} centerFmt={(v) => numTxt(v)} max={6} {...(typeof totalLabel === "string" ? { centerLabel: totalLabel } : {})} /></div>;
}

/** Ranked horizontal bars (largest first). */
export function Ranked({ items, empty, limit = 8 }: { items: ChartItem[]; empty: ReactNode; limit?: number }) {
  const ar = useLang() === "ar";
  const shown = items.filter((x) => x.value > 0);
  if (!shown.length) return <p className="py-6 text-center text-sm text-muted-foreground" data-fsm-chart="ranked-empty">{empty}</p>;
  return <div data-fsm-chart="ranked"><RankedBars data={shown.map(datum)} ar={ar} wrap={wrap} fmt={(v) => numTxt(v)} max={limit} /></div>;
}
