/** EC-R1 shared command-center primitives: one link renderer for every `Drill`, signal cards, sparkline, deltas, totals. */
import { KPI_TILE, Spark as KitSpark } from "@/components/enterprise/kit";
import { KpiCard } from "@/components/enterprise/kit/KpiCard";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { fmtCurrency } from "@/lib/format";
import { slug } from "./finance";
import { SourceState } from "./ProFrame";
import type { Bi, Drill, Signal } from "./command";

export const bi = (ar: boolean, x: Bi) => (ar ? x[1] : x[0]);

/** Renders any Drill as a router link carrying the exact predicate. Native lists receive Frappe filter JSON; documents open in the Pro shell. */
export function DrillLink({ drill, className, children, title, ...data }: { drill: Drill; className?: string | undefined; children: ReactNode; title?: string | undefined } & Record<`data-${string}`, string | number | undefined>) {
  if (drill.kind === "pro") return <Link to={drill.to as never} search={drill.search as never} className={className} title={title} {...data}>{children}</Link>;
  if (drill.kind === "list") return <Link to="/app/$app/$doctype" params={{ app: "erpnext", doctype: slug(drill.doctype) }} search={{ filters: JSON.stringify(drill.filters) } as never} className={className} title={title} {...data}>{children}</Link>;
  if (drill.kind === "doc") return <Link to="/app/$app/$doctype/$name" params={{ app: "erpnext", doctype: slug(drill.doctype), name: drill.name }} className={className} title={title} {...data}>{children}</Link>;
  // the report page reads its filters from one `filters` JSON value (report.$name validateSearch), so pass them that way
  return <Link to="/report/$name" params={{ name: drill.name }} search={{ filters: JSON.stringify(drill.filters) } as never} className={className} title={title} {...data}>{children}</Link>;
}

/** Navigation arguments for any Drill, for chart marks that cannot be anchors (SVG groups). Same predicate as DrillLink. */
export function drillNav(drill: Drill): { to: string; params?: Record<string, string>; search?: Record<string, unknown> } {
  if (drill.kind === "pro") return { to: drill.to, search: drill.search };
  if (drill.kind === "list") return { to: "/app/$app/$doctype", params: { app: "erpnext", doctype: slug(drill.doctype) }, search: { filters: JSON.stringify(drill.filters) } };
  if (drill.kind === "doc") return { to: "/app/$app/$doctype/$name", params: { app: "erpnext", doctype: slug(drill.doctype), name: drill.name } };
  return { to: "/report/$name", params: { name: drill.name }, search: { filters: JSON.stringify(drill.filters) } };
}

/** Source-trend sparkline: the shared kit Spark (one chart look everywhere), point labels kept as the tooltip. */
export function Spark({ points, label }: { points: { label: string; value: number }[]; label: string }) {
  if (points.length < 2) return null;
  return <span className="dp-cc-spark block" title={points.map((p) => `${p.label}: ${p.value.toLocaleString("en-US")}`).join("\n")}><KitSpark values={points.map((p) => p.value)} label={label} /></span>;
}

/** Direction arrow + amount/percent. `good` decides colour: "up" = rise is favourable, "down" = fall is favourable, "neutral" = no judgement. */
export function DeltaChip({ d, good, currency, ar }: { d: NonNullable<Signal["delta"]>; good: "up" | "down" | "neutral"; currency: string; ar: boolean }) {
  const dir = d.amount > 0 ? "up" : d.amount < 0 ? "down" : "flat";
  const tone = good === "neutral" || dir === "flat" ? "neutral" : dir === good ? "good" : "bad";
  return <span className="inline-flex flex-wrap items-center gap-1">
    <span className="dp-cc-delta" data-tone={tone} data-dp-delta={dir} data-no-i18n>{dir === "up" ? "▲" : dir === "down" ? "▼" : "■"} {d.percent === null ? fmtCurrency(Math.abs(d.amount), currency) : `${Math.abs(d.percent).toFixed(1)}%`}</span>
    <span className="dp-cc-meta">{bi(ar, d.label)}</span>
  </span>;
}

export function Totals({ totals, empty = "—" }: { totals: { currency: string; amount: number }[]; empty?: string }) {
  if (!totals.length) return <span data-no-i18n>{empty}</span>;
  return <>{totals.map((x, i) => <bdi key={x.currency || i} className="me-2 inline-block whitespace-nowrap tabular-nums" data-no-i18n>{fmtCurrency(x.amount, x.currency)}</bdi>)}</>;
}

const GOOD: Record<string, "up" | "down" | "neutral"> = { cash: "up", invoiced: "up", receivable: "neutral", payable: "neutral", stock: "neutral" };
export function SignalCard({ s, ar }: { s: Signal; ar: boolean }) {
  const t = (en: string, arabic: string) => (ar ? arabic : en);
  const good = GOOD[s.id] ?? "neutral";
  // the one Enterprise KPI card (Round 1 §4); the signal passes its figure, change, trend, basis and drill
  const delta = s.delta && s.delta.percent !== null ? { pct: s.delta.percent, better: good === "neutral" ? "none" as const : good, label: bi(ar, s.delta.label) } : undefined;
  const meta = <>
    {s.delta && s.delta.percent === null && <DeltaChip d={s.delta} good={good} currency={s.currency} ar={ar} />}
    {s.count !== undefined && <><bdi data-no-i18n>{s.count}</bdi> {s.id === "cash" ? t("accounts", "حسابات") : s.id === "stock" ? t("items in stock", "صنف بالمخزون") : t("documents", "مستندات")} · </>}
    {s.note && <>{bi(ar, s.note)} · </>}
    <span title={s.source} data-dp-signal-basis>{bi(ar, s.basis)} · <bdi data-no-i18n>{s.asOf}</bdi></span>
  </>;
  const value = s.money ? fmtCurrency(s.value ?? 0, s.currency) : (s.value ?? 0).toLocaleString("en-US");
  const card = (Root?: (p: { className: string; children: ReactNode } & Record<string, unknown>) => ReactNode) => <KpiCard ar={ar} label={bi(ar, s.label)} value={value}
    delta={delta} spark={s.spark?.map((x) => x.value)} meta={meta} className={KPI_TILE}
    state={s.status !== "ok" ? <SourceState status={s.status} doctype={s.source.split(/[.·]/)[0]?.trim()} /> : undefined}
    attrs={{ "data-dp-signal": s.id, "data-status": s.status, "data-dp-signal-value": s.value ?? "" }} Root={Root} />;
  if (s.status !== "ok") return card();
  return card((rp) => <DrillLink drill={s.drill} {...(rp as Record<string, unknown>)} title={s.source}>{rp.children}</DrillLink>);
}

export function SevDot({ sev }: { sev: "high" | "medium" | "low" }) { return <span className={`dp-sev dp-sev-${sev} mt-1.5`} aria-hidden />; }
export const sevLabel = (sev: "high" | "medium" | "low", ar: boolean) => (sev === "high" ? (ar ? "مرتفعة" : "High") : sev === "medium" ? (ar ? "متوسطة" : "Medium") : ar ? "منخفضة" : "Low");
