/**
 * Context and card helpers shared by the 41 workspace overview specs (ui/ov/*). A spec is a pure function of the
 * permitted records and the URL scope; it returns insight panels (charts first), KPI cards and page extras. KPI cards
 * reuse the K01–K30 registry (same rows as their RP report) or count a work queue, so every number reconciles.
 */
import type { ReactNode } from "react";
import type { DxTone } from "@/components/digit/Experience";
import type { Filters } from "../../domain/data";
import { reportById } from "../../domain/reports";
import type { Row } from "../../domain/rules";
import { FSM_KPIS, kpiValue } from "../../analytics/kpis";
import { QUEUES } from "../queues";
import { Kpi, numTxt, useFx } from "../kit";
import { qs, type Drill, type Meta, type OverviewSpec, type Txt } from "../insights";

export type Fx = ReturnType<typeof useFx>;
/** `url` is the page's full URL state (dedicated pages with their own filters, e.g. the Visits portfolio). */
export interface Ctx { fx: Fx; t: Fx["t"]; ar: boolean; F: Filters; url?: Record<string, string> | undefined }
export type OvFn = (c: Ctx) => OverviewSpec;
export const M = (src: string[], grain: Txt, formula: Txt, drill: Txt, missing?: Txt): Meta => ({ src, grain, formula, drill, ...(missing ? { missing } : {}) });
/** Rows of an RP report for the scope (the report applies the shared scope boundary itself). */
export const R = (id: string, F: Filters): Row[] => reportById(id)?.run(F) ?? [];
/** Filtered native-list drill: `LS("FSM Run", ["workflow_state", "Draft"], ["site", ["is", "set"]])`. */
export const LS = (dt: string, ...f: [string, unknown][]): Drill => ({ list: [dt, f.map(([k, v]) => [dt, k, v] as [string, string, unknown])] });
/** Period clause for a list drill on a date field (only when the URL period is set). */
export const per = (F: Filters, field: string): [string, unknown][] => (F.from || F.to ? [[field, ["between", [F.from || "0000-01-01", F.to || "9999-12-31 23:59:59"]]]] : []);
export const num = (v: unknown) => Number(v) || 0;
export const sum = (rows: Record<string, unknown>[], f: string) => rows.reduce((a, r) => a + num(r[f]), 0);

/** K-metric card: value from the same rows as its report; opens the report with the KPI context. */
export function K({ id, F, c }: { id: string; F: Filters; c: Ctx }): ReactNode {
  const k = FSM_KPIS.find((x) => x.id === id); if (!k) return null;
  const v = kpiValue(k, F); const dec = k.unit ? 1 : 0;
  return <Kpi key={id} label={`${id} · ${c.ar ? k.label_ar : k.label}`} value={v === null ? "—" : numTxt(v, dec)} unit={k.unit === "%" ? "%" : k.unit === "h" ? c.t("h", "س") : k.unit === "d" ? c.t("days", "يوم") : undefined}
    tone={v === null ? "neutral" : k.tone ? k.tone(v) : "neutral"} basis={c.ar ? k.definition_ar : k.definition} to={`reports/${k.report}${qs({ ...(F as Record<string, string | undefined>), ...((k.drill ?? {}) as Record<string, string | undefined>), kpi: id })}`} server={k.status === "SERVER_REQUIRED"} />;
}
/** Work-queue card: count of the queue's permitted rows; opens the queue. */
export function Q({ k, c, label, tone = "warn" }: { k: string; c: Ctx; label?: Txt; tone?: DxTone }): ReactNode {
  const q = QUEUES.find((x) => x.key === k); if (!q) return null;
  const n = q.rows({}).length; const path = q.my ? `my/${k.replace(/^my-/, "")}` : `queue/${k}`;
  return <Kpi key={k} label={label ? c.t(...label) : c.ar ? q.title_ar : q.title} value={numTxt(n)} tone={n ? tone : "good"} basis={c.ar ? q.question_ar : q.question} to={path} cta={c.t("Open queue", "فتح الطابور")} />;
}
/** Plain count card with its drill path. */
export function C({ label, value, basis, to, tone = "neutral", unit, c }: { label: Txt; value: number | string | null; basis: Txt; to?: string; tone?: DxTone; unit?: string; c: Ctx }): ReactNode {
  return <Kpi key={label[0]} label={c.t(...label)} value={value === null ? "—" : typeof value === "number" ? numTxt(value) : value} unit={unit} tone={tone} basis={c.t(...basis)} {...(to ? { to, cta: c.t("Open", "فتح") } : {})} />;
}
