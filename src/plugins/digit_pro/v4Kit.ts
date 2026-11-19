/**
 * DIGIT Pro V4 dashboard insights — evaluation kit (owner master 2026-11-11, V4I-WA/WI rows). Every insight reads
 * permission-scoped native records through the section engine (sections.ts scopeStatus/rowsMatching), so a figure equals
 * the rows its drill opens; a role that may not read a source gets no line (Hidden), never a zero. Nothing here writes.
 * Shared dimension rule: branch and department figures use the document's Cost Center (the native accounting dimension;
 * the demo cost centers are the city branches), falling back to the warehouse for stock rows.
 */
import type { Doc } from "@/lib/adapter";
import { translateTo, sampleNameAr } from "@/i18n";
import { recordLabel } from "@/components/enterprise/kit/labels";
import { cachedMeta } from "@/lib/catalog";
import { fmtCurrency } from "@/lib/format";
import type { Filter } from "@/lib/desk";
import type { Bi, Drill } from "./command";
import { listDrill, monthsBack, rowsMatching, scopeStatus, type SectionCtx } from "./sections";

export class Hidden extends Error { constructor(public status: string) { super(status); } }
/** `reads` (optional) collects every source a formula reads — tests use it to prove a denied source hides the line. */
export interface V4C { ctx: SectionCtx; user: string; ar: boolean; reads?: Set<string> }
export interface V4Out { status: "ok" | "empty"; value: string; detail: string; drill: Drill }
export type Board = "executive" | "finance" | "accounting" | "selling" | "purchasing" | "inventory" | "assets" | "vat";

export const n = (v: unknown) => (typeof v === "number" ? v : Number(v) || 0);
export const s = (v: unknown) => (v == null ? "" : String(v));
export const r2 = (v: number) => Math.round(v * 100) / 100;
const DAY = 86_400_000;
export const days = (a: string, b: string) => Math.round((Date.parse(`${b.slice(0, 10)}T00:00:00Z`) - Date.parse(`${a.slice(0, 10)}T00:00:00Z`)) / DAY);
export const addD = (d: string, k: number) => new Date(Date.parse(`${d}T00:00:00Z`) + k * DAY).toISOString().slice(0, 10);
export const t = (c: V4C, en: string, ar: string) => (c.ar ? ar : en);
/** A record named inside an insight sentence: its title without the company suffix, in Arabic when a translation exists (display only). */
export const shownName = (c: V4C, key: string) => key.split(" · ").map((k) => { const l = recordLabel(k); return c.ar ? (sampleNameAr(l) ?? translateTo(l, "ar")) : l; }).join(" · ");
export const bi = (c: V4C, b: Bi) => (c.ar ? b[1] : b[0]);
export const money = (c: V4C, v: number) => fmtCurrency(r2(v), c.ctx.currency);
export const num = (v: number, d = 0) => v.toLocaleString("en-US", { maximumFractionDigits: d });
export const pct = (v: number) => `${num(v, 1)}%`;
export const recs = (c: V4C, k: number) => (c.ar ? `${num(k)} سجل` : `${num(k)} record${k === 1 ? "" : "s"}`);
export const dayTxt = (c: V4C, v: number) => (c.ar ? `${num(v, 1)} يوم` : `${num(v, 1)} days`);
export const yearStart = (c: V4C) => `${c.ctx.asOf.slice(0, 4)}-01-01`;
export const quarterStart = (c: V4C) => { const m = Number(c.ctx.asOf.slice(5, 7)); return `${c.ctx.asOf.slice(0, 4)}-${String(Math.floor((m - 1) / 3) * 3 + 1).padStart(2, "0")}-01`; };
export const prevMonth = (c: V4C) => monthsBack(c.ctx.asOf, 2)[0]!;
export const ym = (d: Doc, f: string) => s(d[f]).slice(0, 7);

const hasField = (dt: string, f: string) => !!(cachedMeta(dt) as { fields?: { fieldname: string }[] } | undefined)?.fields?.some((x) => x.fieldname === f);
/** Readable rows of one source for the page company; throws Hidden when the user may not read it (line hidden). */
/** Bin rows carry no company (scoped by their warehouse's company instead), whatever the meta lists. */
const NO_COMPANY = new Set(["Bin"]);
export function rows(c: V4C, dt: string, filters: Filter[] = [], pick?: (d: Doc) => boolean): Doc[] {
  const f: Filter[] = hasField(dt, "company") && !NO_COMPANY.has(dt) ? [["company", "=", c.ctx.company], ...filters] : filters;
  c.reads?.add(dt); const st = scopeStatus(dt, f, c.user); if (st !== "ok") throw new Hidden(st);
  const r = rowsMatching(dt, f, c.user); return pick ? r.filter(pick) : r;
}
/** Submitted rows (docstatus 1). */
export const sub = (c: V4C, dt: string, filters: Filter[] = [], pick?: (d: Doc) => boolean) => rows(c, dt, [["docstatus", "=", 1], ...filters], pick);
export const drafts = (c: V4C, dt: string, pick?: (d: Doc) => boolean) => rows(c, dt, [["docstatus", "=", 0]], pick);
export const notReturn = (d: Doc) => !n(d["is_return"]);
/** Company-currency amount of a voucher field (base_* when stored, else × conversion rate). */
export const base = (d: Doc, f: string) => (d[`base_${f}`] != null ? n(d[`base_${f}`]) : n(d[f]) * (n(d["conversion_rate"]) || 1));
export const lines = (d: Doc, f = "items") => ((d[f] as Doc[] | undefined) ?? []);
export const lineAmt = (d: Doc, l: Doc) => (l["base_net_amount"] != null ? n(l["base_net_amount"]) : n(l["amount"]) * (n(d["conversion_rate"]) || 1));

export const listIn = (dt: string, names: string[], fallback: Filter[] = []): Drill => (names.length ? listDrill(dt, [["name", "in", [...new Set(names)]]]) : listDrill(dt, fallback));
export const pro = (c: V4C, to: string, extra: Record<string, string> = {}): Drill => ({ kind: "pro", to, search: { company: c.ctx.company, ...extra } });
/** Optional source: readable rows, or none (the source is not counted as read) when the user may not read it. */
export function optional(c: V4C, dt: string, f: () => Doc[]): Doc[] { const had = c.reads?.has(dt); try { return f(); } catch (e) { if (!(e instanceof Hidden)) throw e; if (!had) c.reads?.delete(dt); return []; } }
export const out = (value: string, detail: string, drill: Drill, ok = true): V4Out => ({ status: ok ? "ok" : "empty", value, detail, drill });

/** Sum of an amount over records; value = total, detail = record count (+ extra). */
export function sumOut(c: V4C, dt: string, docs: Doc[], amt: (d: Doc) => number, extra = "", drill?: Drill): V4Out {
  const total = docs.reduce((x, d) => x + amt(d), 0);
  return out(money(c, total), [recs(c, docs.length), extra].filter(Boolean).join(" · "), drill ?? listIn(dt, docs.map((d) => d.name)), docs.length > 0);
}
export function countOut(c: V4C, dt: string, docs: Doc[], extra = "", drill?: Drill): V4Out {
  return out(num(docs.length), extra, drill ?? listIn(dt, docs.map((d) => d.name)), docs.length > 0);
}
export interface Group { key: string; v: number; names: string[] }
export function groupBy<T>(items: T[], key: (x: T) => string | string[] | null, val: (x: T) => number, name: (x: T) => string): Group[] {
  const m = new Map<string, Group>();
  for (const x of items) { const ks = key(x); for (const k of ks == null ? [] : Array.isArray(ks) ? ks : [ks]) { const g = m.get(k) ?? { key: k, v: 0, names: [] }; g.v += val(x); g.names.push(name(x)); m.set(k, g); } }
  return [...m.values()];
}
/** Top (or lowest) group: value = its amount, detail = which one · share of total · number of groups. */
export function topOut(c: V4C, dt: string, groups: Group[], o: { money?: boolean; low?: boolean; label?: (k: string) => string; fmt?: (v: number) => string; what?: Bi } = {}): V4Out {
  const fmt = o.fmt ?? ((v: number) => (o.money === false ? num(v, 2) : money(c, v)));
  const gs = groups.filter((g) => g.v !== 0).sort((a, b) => (o.low ? a.v - b.v : b.v - a.v) || a.key.localeCompare(b.key));
  const total = gs.reduce((x, g) => x + g.v, 0); const top = gs[0];
  if (!top) return out(fmt(0), "", listIn(dt, []), false);
  const share = total ? Math.round((top.v / total) * 1000) / 10 : 0;
  const lead = o.low ? t(c, "Lowest", "الأدنى") : t(c, "Top", "الأعلى");
  return out(fmt(top.v), `${lead}: ${o.label ? o.label(top.key) : top.key ? shownName(c, top.key) : t(c, "(not set)", "(غير محدد)")} · ${pct(share)} · ${num(gs.length)} ${o.what ? bi(c, o.what) : t(c, "groups", "مجموعات")}`, listIn(dt, top.names), true);
}
/** Last k months: value = window total, detail = this month · last month · best month. */
export function monthOut(c: V4C, dt: string, docs: Doc[], dateField: string, val: (d: Doc) => number, o: { months?: number; money?: boolean; drill?: Drill } = {}): V4Out {
  const ms = monthsBack(c.ctx.asOf, o.months ?? 6); const by = new Map(ms.map((m) => [m, 0])); const names: string[] = [];
  for (const d of docs) { const m = ym(d, dateField); if (by.has(m)) { by.set(m, by.get(m)! + val(d)); names.push(d.name); } }
  const fmt = (v: number) => (o.money === false ? num(v, 1) : money(c, v));
  const total = [...by.values()].reduce((a, b) => a + b, 0); const best = [...by].sort((a, b) => b[1] - a[1])[0]!;
  const cur = by.get(ms[ms.length - 1]!) ?? 0; const last = by.get(ms[ms.length - 2]!) ?? 0;
  return out(fmt(total), `${t(c, "This month", "هذا الشهر")} ${fmt(cur)} · ${t(c, "last month", "الشهر الماضي")} ${fmt(last)} · ${t(c, "best", "الأفضل")} ${best[0]}`, o.drill ?? listIn(dt, names), names.length > 0);
}
