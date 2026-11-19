/**
 * Enterprise Visual Round 1 §4 — THE KPI card of every DIGIT app (Pro, HR, Construction, CRM, POS, Manufacturing pass data
 * only). Four variants, chosen by the card's place on the page unless the caller names one:
 *   featured  — the first card of every KPI row: Emerald tint, 1px Em-100 border, Deep 34px value, Emerald sparkline with a
 *               12% fill, white icon tile;
 *   hero-dark — at most one per page (the second card of the page's first KPI row): Deep gradient, white text, Mint sparkline;
 *   state     — a card that carries a state: amber «مستحق قريبًا», rose overdue / negative, blue in process; value in the state colour;
 *   standard  — white card with a 36px module-colour icon tile and a module-colour sparkline (never a bare number).
 * Every card: label 13 grey · value · ▲/▼ delta pill · sparkline · one meta line; equal height (the sparkline and meta sit at the
 * bottom, so no card has an empty half); the whole card opens its drill list. Money: negative amounts read «−» in the negative
 * colour, positive signed figures (profit, net result) in the positive colour, other amounts in ink.
 */
import { Children, createContext, isValidElement, useContext, useEffect, useId, useSyncExternalStore, type ReactElement, type ReactNode } from "react";
import { DeltaChip, Spark, type Delta, type Tone } from "./charts";
import { sarText } from "@/lib/format";

export type KpiVariant = "featured" | "hero-dark" | "attention" | "risk" | "info" | "standard";
export type KpiIconKind = "money" | "bank" | "count" | "people" | "time" | "percent" | "doc" | "stock" | "alert" | "chart";

/* ---------- page-level slot: index in its KPI row and whether the row is the page's first ---------- */
export interface KpiSlot { index: number; lead: boolean }
export const KpiSlotCtx = createContext<KpiSlot | null>(null);
const rows: string[] = []; const subs = new Set<() => void>();
const sub = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };
/** The first KPI row mounted on the page is its lead row (it alone may carry the one Hero-dark card). */
export function useLeadRow(): boolean {
  const id = useId();
  useEffect(() => { rows.push(id); subs.forEach((f) => f()); return () => { const i = rows.indexOf(id); if (i >= 0) rows.splice(i, 1); subs.forEach((f) => f()); }; }, [id]);
  return useSyncExternalStore(sub, () => rows[0] === id, () => false);
}
/** Wrap each card of a KPI row so it knows its place (KpiRow, KpiStrip and the Dashboard Designer strip use it). */
export function KpiSlots({ children, lead }: { children: ReactNode; lead: boolean }) {
  let i = 0;
  return <>{Children.map(children, (c) => (c === null || c === undefined || c === false ? c : <KpiSlotCtx.Provider value={{ index: i++, lead }}>{c}</KpiSlotCtx.Provider>))}</>;
}

/** Variant of a card: the caller's choice, else featured (first of its row) → state (its tone) → hero-dark (second card of the
 *  page's lead row) → standard. */
export function kpiVariant(slot: KpiSlot | null, tone: Tone | undefined, forced?: KpiVariant): KpiVariant {
  if (forced) return forced;
  if (slot?.index === 0) return "featured";
  if (tone === "attention" || tone === "risk" || tone === "info") return tone;
  if (slot?.lead && slot.index === 1) return "hero-dark";
  return "standard";
}

/* ---------- text helpers ---------- */
export function nodeText(n: ReactNode): string {
  if (n === null || n === undefined || typeof n === "boolean") return "";
  if (typeof n === "string" || typeof n === "number") return String(n);
  if (Array.isArray(n)) return n.map(nodeText).join("");
  if (isValidElement(n)) return nodeText((n as ReactElement<{ children?: ReactNode }>).props.children);
  return "";
}
const NEG = /^\s*([^\d\s-−]{0,3}\s?)[-−]\s?(?=\d)/;
/** «−» and the sign of a shown amount: "⃁ -4,837.75" → { text: "⃁ −4,837.75", sign: -1 }. */
export function signOf(v: ReactNode): { node: ReactNode; sign: -1 | 0 | 1 } {
  if (typeof v === "number") return v < 0 ? { node: `−${Math.abs(v).toLocaleString("en-US")}`, sign: -1 } : { node: v.toLocaleString("en-US"), sign: v > 0 ? 1 : 0 };
  if (typeof v === "string") {
    if (NEG.test(v)) return { node: v.replace(NEG, (_m, pre: string) => `${pre}−`), sign: -1 };
    return { node: v, sign: /[1-9]/.test(v) ? 1 : 0 };
  }
  const t = nodeText(v);
  return { node: v, sign: NEG.test(t) ? -1 : /[1-9]/.test(t) ? 1 : 0 };
}
const SIGNED = /(ربح|خسار|صافي النتيجة|صافي الربح|profit|loss|net result|variance|الفرق|انحراف|margin|هامش)/i;

/** Icon of a card from its label (an explicit `icon` wins). */
export function kpiIconOf(label: string, value: string): KpiIconKind {
  const l = label.toLowerCase();
  if (/(نقد|بنك|cash|bank|treasury|خزين)/.test(l)) return "bank";
  if (/(متأخر|overdue|late|risk|exception|استثناء|مانع|blocked|مخاطر|غير مسوّ|unreconciled)/.test(l)) return "alert";
  if (/(موظف|employee|headcount|staff|people|عامل|workers|مرشح|candidate|applicant|عملاء|customers|contacts|جهات)/.test(l)) return "people";
  if (/(%|نسبة|rate|ratio|معدل|سعودة|saudization|margin|هامش)/.test(l)) return "percent";
  if (/(مخزون|stock|inventory|item|صنف|warehouse|مستودع)/.test(l)) return "stock";
  if (/(يوم|days|time|وقت|aging|عمر|ساعة|hours|due|مستحق)/.test(l)) return "time";
  if (/(فاتور|invoice|document|مستند|سجل|record|طلب|request|order|أمر|claim|مطالب|مسير|run|entry|قيد)/.test(l)) return "doc";
  if (/(إيراد|revenue|income|sales|مبيعات|ربح|profit|cost|تكلفة|expense|مصروف|راتب|رواتب|salary|pay|budget|موازنة|amount|مبلغ|قيمة|value)/.test(l) || /\u20C1|SAR|ر\.س/.test(value)) return "money";
  return "chart";
}
const GLYPH: Record<KpiIconKind, ReactNode> = {
  money: <><circle cx="12" cy="12" r="8.5" /><path d="M9 9.2h4.2a1.9 1.9 0 0 1 0 3.8H10.8a1.9 1.9 0 0 0 0 3.8H15M12 7.2v1.9m0 7.8v1.9" /></>,
  bank: <><path d="M4 10h16L12 5 4 10Z" /><path d="M6 10v7m4-7v7m4-7v7m4-7v7M4 19.5h16" /></>,
  count: <><path d="M9 5 7.5 19M16.5 5 15 19M5 9.5h14M4.5 14.5h14" /></>,
  people: <><circle cx="9" cy="9" r="3.2" /><path d="M3.5 19c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5" /><circle cx="16.8" cy="9.6" r="2.4" /><path d="M16 14.2c2.3.1 4 1.6 4.5 4.3" /></>,
  time: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></>,
  percent: <><path d="M18 6 6 18" /><circle cx="7.5" cy="7.5" r="2.3" /><circle cx="16.5" cy="16.5" r="2.3" /></>,
  doc: <><path d="M7 3.5h7l4 4v13H7z" /><path d="M14 3.5v4h4M9.5 12h6M9.5 15.5h6" /></>,
  stock: <><path d="M12 3.5 20 7.5v9L12 20.5 4 16.5v-9L12 3.5Z" /><path d="M4 7.5 12 11.5l8-4M12 11.5v9" /></>,
  alert: <><path d="M12 4 21 19.5H3L12 4Z" /><path d="M12 10v4.2m0 2.6v.2" /></>,
  chart: <><path d="M4.5 19.5h15" /><path d="M7 16v-5m5 5V7m5 9v-7" /></>,
};
export function KpiIcon({ kind }: { kind: KpiIconKind }) {
  return <span className="ek-kpi-icon" data-kpi-icon={kind} aria-hidden><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{GLYPH[kind]}</svg></span>;
}

type RootProps = { className: string; children: ReactNode } & Record<string, unknown>;
export interface KpiCardProps {
  label: ReactNode; value: ReactNode; delta?: Delta | undefined; spark?: number[] | undefined;
  /** the one meta line (as-of · scope, basis, comparison) */ meta?: ReactNode; tone?: Tone | undefined;
  /** shown instead of the figure (not permitted, needs data) */ state?: ReactNode;
  icon?: KpiIconKind | undefined; variant?: KpiVariant | undefined;
  /** colour positive figures too (profit, net result); detected from the label when not given */ signed?: boolean | undefined;
  /** wraps the value in its drill link (the card's own link) */ wrap?: ((node: ReactNode) => ReactNode) | undefined;
  /** the card root (a drill link that opens the list); default <article> */ Root?: ((p: RootProps) => ReactNode) | undefined;
  info?: ReactNode; extra?: ReactNode; attrs?: Record<string, unknown> | undefined; className?: string | undefined; ar: boolean;
}
/** The Enterprise KPI card. */
export function KpiCard({ label, value: rawValue, delta, spark, meta, tone, state, icon, variant, signed, wrap, Root, info, extra, attrs, className, ar }: KpiCardProps) {
  const slot = useContext(KpiSlotCtx);
  // an amount an app passes as text ("SAR 8,525,000", also inside a fragment) shows with the Riyal sign like every figure
  const rawText = typeof rawValue === "string" ? rawValue : nodeText(rawValue);
  const value = /\bSAR [-\u2212]?\d/.test(rawText) ? sarText(rawText) : rawValue;
  const sg = signOf(value); const lt = nodeText(label);
  const v = kpiVariant(slot, tone, variant);
  const isSigned = signed ?? SIGNED.test(lt);
  const signAttr = sg.sign < 0 ? "neg" : isSigned && sg.sign > 0 ? "pos" : undefined;
  const kind = icon ?? kpiIconOf(lt, nodeText(value));
  // money keeps its sign colours (K05); a count may take the card's category colour (page rule 11)
  const money = /\u20C1|SAR|﷼|ر\.س/.test(nodeText(value));
  const val = <span className="ek-kpi-value" data-no-i18n {...(signAttr ? { "data-sign": signAttr } : {})} {...(money ? { "data-money": "" } : {})}>{sg.node}</span>;
  const sparkTone = v === "risk" ? "risk" : v === "attention" ? "attention" : "good";
  const body = <>
    <span className="ek-kpi-head"><span className="ek-kpi-label">{label}</span>{info}<KpiIcon kind={kind} /></span>
    {state ? <span className="ek-kpi-state">{state}</span> : <>
      <span className="ek-kpi-main">{wrap ? wrap(val) : val}{delta && <DeltaChip d={delta} ar={ar} />}</span>
      {extra}
      {spark && spark.length > 1 ? <Spark values={spark} tone={sparkTone} height={v === "featured" ? 40 : 30} /> : <span className="ek-kpi-spacer" aria-hidden />}
      {meta && <span className="ek-kpi-sub ek-kpi-meta">{meta}</span>}
    </>}
  </>;
  const cls = `ek-kpi${className ? ` ${className}` : ""}`;
  const a = { "data-kpi-variant": v, "data-kpi-card": "", ...(tone ? { "data-tone": tone } : {}), ...attrs };
  return Root ? <>{Root({ className: cls, children: body, ...a })}</> : <article className={cls} {...a}>{body}</article>;
}
