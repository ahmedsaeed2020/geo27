/**
 * Enterprise table (owner closing round OS-02): the list pattern of the CRM leads list for any page that draws its rows
 * itself — saved-view tabs, status strip with counts and amounts, search, column-header filters, coloured state pills,
 * row count — wrapped around the page's own <tr> rows. The page keeps its rows, links and actions (quick view, 360, drills);
 * this frame reads the rendered cells only to filter and count, so every figure is the one the page already shows and
 * nothing is computed twice. Views are stored with the shared saved-view records (sharedViews.ts, surface "list").
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useLang } from "@/i18n";
import { useSessionUser } from "@/lib/session";
import { useStoreVersion } from "@/lib/adapter";
import { deleteView, viewsFor, type SharedView } from "@/lib/sharedViews";
import type { StripTab, StripTone } from "@/lib/statusStrip";
import { StatusStrip } from "../StatusStrip";
import { EntPopover } from "../Surfaces";
import { SaveShareDialog, ViewChip } from "../SaveShareView";

const tx = (ar: boolean, en: string, a: string) => (ar ? a : en);
const PILL = ".chip, .ek-pill, .r1-pill, [data-state-pill], .dx-pill, [class$=\"-chip\"], [class*=\"-chip \"]";
/** cell text without bidi isolates / riyal sign spacing, for matching */
const clean = (s: string) => s.replace(/[\u2066-\u2069\u200e\u200f]/g, "").replace(/\s+/g, " ").trim();
/** a money / number cell → number (U+2212 minus, riyal sign, thousands separators); NaN when the cell is not a figure */
export function cellNumber(s: string): number {
  const t = clean(s).replace(/\u20C1|SAR|ر\.س|﷼/g, "").replace(/\u2212/g, "-").replace(/,/g, "").replace(/\s/g, "");
  return /^-?\d+(\.\d+)?$/.test(t) ? Number(t) : Number.NaN;
}
/** tone of a pill from its classes / data-tone */
export function pillTone(el: Element): StripTone {
  const c = `${el.className} ${el.getAttribute("data-tone") ?? ""}`.toLowerCase();
  if (/red|bad|danger|risk|negative|overdue|error|destructive/.test(c)) return "bad";
  if (/amber|warn|orange|yellow|gold|pending/.test(c)) return "warn";
  if (/green|ok|success|positive|emerald|done|paid/.test(c)) return "ok";
  if (/blue|info|sky|teal|violet/.test(c)) return "info";
  return "neutral";
}
interface Scan { cols: string[][]; pillCol: number; pills: Map<string, StripTone>; labels: Record<string, string>; amountCol: number; attr: string; sig: string }
/** the state word of a pill: text before a « · detail» suffix (days late, date sent) */
const pillText = (e: Element | null | undefined) => clean(e?.textContent ?? "").split("·")[0]!.trim();
const CODE_LIKE = /[A-Z]{2,}-[A-Z0-9-]*\d|\d{2,}|^[\d.,\s%]+$/;
const ROW_STATE = ["data-state", "data-status", "data-level", "data-stage"] as const;
/** tone of a state word (row attribute values carry no colour class) */
export function wordTone(v: string): StripTone {
  const w = v.toLowerCase();
  if (/overdue|late|reject|fail|broken|block|error|cancel|متأخر|مرفوض|فشل/.test(w)) return "bad";
  if (/pending|open|draft|wait|due|review|hold|l[1-9]|level|بانتظار|مفتوح|مسودة/.test(w)) return "warn";
  if (/done|paid|approved|complete|closed|kept|ok|matched|منجز|مدفوع|معتمد|مكتمل/.test(w)) return "ok";
  return "info";
}
interface TState { q: string; col: Record<number, string[]>; strip?: string | undefined; view?: string | undefined }

/** the strip state of one rendered row */
function stateOf(r: HTMLTableRowElement, s: Pick<Scan, "attr" | "pillCol">): string {
  if (s.attr) return r.getAttribute(s.attr) ?? "";
  return s.pillCol >= 0 ? pillText(r.cells[s.pillCol]?.querySelector(PILL)) : "";
}

/**
 * `head` + rows: the frame draws the table. `wrap`: the page keeps its own complete <table> (sorting headers, column chooser,
 * saved views of its own register) and the frame adds the strip, search, row count and a filter in each header cell.
 */
export function EntTable({ id, head: headProp, children, title, actions, wrap = false, views: withViews = true }: { id: string; head?: string[] | undefined; children: ReactNode; title?: ReactNode; actions?: ReactNode; wrap?: boolean; /** false when the page already has its own saved views (Pro register toolbar) */ views?: boolean }) {
  useStoreVersion(); const user = useSessionUser(); const ar = useLang() === "ar";
  const body = useRef<HTMLTableSectionElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const liveBody = useRef<HTMLTableSectionElement | null>(null);
  const [wrapped, setWrapped] = useState<{ head: string[]; hosts: HTMLElement[] }>({ head: [], hosts: [] });
  const head = wrap ? wrapped.head : (headProp ?? []);
  // a wrapped table may re-render its rows on its own (sorting, paging): re-apply the filters when its rows change
  const [, bump] = useState(0);
  // …and when the display-only translation layer rewrites cell text after render, so strip keys are the words shown
  useEffect(() => {
    const el = root.current; if (!el || typeof MutationObserver === "undefined") return;
    let raf = 0;
    const mo = new MutationObserver((ms) => {
      if (!ms.some((m) => { const n = m.target.nodeType === 3 ? m.target.parentElement : (m.target as Element); return !!n?.closest?.("tbody") || n?.nodeName === "TABLE"; })) return;
      cancelAnimationFrame(raf); raf = requestAnimationFrame(() => bump((x) => x + 1));
    });
    mo.observe(el, { childList: true, subtree: true, characterData: true }); return () => { mo.disconnect(); cancelAnimationFrame(raf); };
  }, []);
  const [st, setSt] = useState<TState>({ q: "", col: {} });
  const [scan, setScan] = useState<Scan>({ cols: [], pillCol: -1, pills: new Map(), labels: {}, amountCol: -1, attr: "", sig: "" });
  const [shown, setShown] = useState<{ n: number; total: number }>({ n: 0, total: 0 });
  const [saving, setSaving] = useState<{ open: boolean; editing?: SharedView | undefined }>({ open: false });
  const vdt = `table:${id}`;
  const views = viewsFor(vdt, "list", user);

  // read the rendered rows after every render: distinct values per column, the state-pill column and the amount column
  useLayoutEffect(() => {
    let tb: HTMLTableSectionElement | null = body.current; liveBody.current = tb;
    if (wrap) {
      const table = box.current?.querySelector("table"); tb = table?.tBodies[0] ?? null; liveBody.current = tb; if (!table || !tb) return;
      table.classList.add("ek-et-table"); table.setAttribute("data-et-wrapped", id);
      const ths = [...(table.tHead?.rows[0]?.cells ?? [])] as HTMLElement[];
      const hosts = ths.map((th) => { let h = th.querySelector<HTMLElement>(":scope > [data-et-hf-host]"); if (!h) { h = document.createElement("span"); h.setAttribute("data-et-hf-host", ""); h.className = "ek-et-hf-host"; th.appendChild(h); } return h; });
      const labels = ths.map((th) => clean((th.textContent ?? "").replace(/[⏷▲▼↕]/g, "")));
      if (JSON.stringify(labels) !== JSON.stringify(wrapped.head) || hosts.some((h, i) => h !== wrapped.hosts[i])) { setWrapped({ head: labels, hosts }); return; }
    }
    if (!tb) return;
    const rows = [...tb.rows].filter((r) => !r.hasAttribute("data-et-empty") && r.cells.length > 1);
    const cols: string[][] = head.map(() => []); const pills = new Map<string, StripTone>(); const pillHits = head.map(() => 0); const numHits = head.map(() => 0); const riyal = head.map(() => 0);
    for (const r of rows) [...r.cells].forEach((c, i) => {
      if (i >= head.length) return; const t = clean(c.textContent || "");
      if (!c.hasAttribute("data-label")) c.setAttribute("data-label", head[i] ?? ""); // phone card layout labels each value
      cols[i]!.push(t);
      const p = c.querySelector(PILL); const k = p ? pillText(p) : "";
      // a pill that carries a document code or a number is a reference, not a state
      if (p && k && !CODE_LIKE.test(k)) { pillHits[i]!++; if (!pills.has(k)) pills.set(k, pillTone(p)); }
      if (t && !Number.isNaN(cellNumber(t))) numHits[i]!++;
      if (/\u20C1|SAR/.test(c.textContent ?? "")) riyal[i]!++;
    });
    const half = Math.max(1, Math.ceil(rows.length * 0.6));
    let amountCol = -1; for (let i = head.length - 1; i >= 0; i--) if (numHits[i]! >= half && riyal[i]! >= half) { amountCol = i; break; }
    // the strip groups by a row state attribute the page already sets (data-state / data-status / data-level / data-stage),
    // else by the column whose cells carry a state pill; only 2–8 distinct states make a strip
    const attr = ROW_STATE.find((a) => rows.filter((r) => r.getAttribute(a)).length >= half) ?? "";
    let pillCol = -1; let states = pills; const labels: Record<string, string> = {};
    if (attr) { states = new Map(); for (const r of rows) { const v = r.getAttribute(attr) ?? "";
      // the label is the state pill the row already shows (translated text), else the attribute value itself
      if (v && !(v in labels)) { const pill = [...r.querySelectorAll(PILL)].map(pillText).find((x) => x && !CODE_LIKE.test(x)); if (pill) labels[v] = pill; }
      if (v && !states.has(v)) states.set(v, attr === "data-level" && /^\d+$/.test(v) ? (Number(v) >= 3 ? "bad" : Number(v) === 2 ? "warn" : "info") : wordTone(v)); } }
    else pillCol = pillHits.findIndex((n) => n >= half);
    const usable = (attr || pillCol >= 0) && states.size >= 2 && states.size <= 8;
    const sig = JSON.stringify([cols, pillCol, amountCol, attr, [...states], labels]);
    if (sig !== scan.sig) setScan({ cols, pillCol: usable ? pillCol : -1, pills: usable ? states : new Map(), labels, amountCol, attr: usable ? attr : "", sig });
    // apply the filters: search, column filters, strip tab
    const q = st.q.trim().toLowerCase(); let n = 0;
    for (const r of rows) {
      const cells = [...r.cells].map((c) => clean(c.textContent || ""));
      let ok = !q || cells.join(" ").toLowerCase().includes(q);
      for (const [k, vs] of Object.entries(st.col)) if (ok && vs.length) ok = vs.includes(cells[Number(k)] ?? "");
      if (ok && st.strip) ok = stateOf(r, scan) === st.strip;
      r.hidden = !ok; if (ok) n++;
    }
    if (n !== shown.n || rows.length !== shown.total) setShown({ n, total: rows.length });
  });

  const tabs: StripTab[] = useMemo(() => {
    if ((!scan.attr && scan.pillCol < 0) || scan.pills.size < 2) return [];
    const tb = liveBody.current; const rows = tb ? [...tb.rows].filter((r) => r.cells.length > 1) : [];
    const amt = (r: HTMLTableRowElement) => (scan.amountCol >= 0 ? cellNumber(r.cells[scan.amountCol]?.textContent ?? "") : Number.NaN);
    const sum = (rs: HTMLTableRowElement[]) => { if (scan.amountCol < 0) return undefined; const v = rs.reduce((a, r) => a + (Number.isNaN(amt(r)) ? 0 : amt(r)), 0); return Math.round(v * 100) / 100; };
    const of = (r: HTMLTableRowElement) => stateOf(r, scan);
    const all: StripTab = { key: "all", label: ["All", "الكل"], tone: "neutral", count: rows.length, ...(scan.amountCol >= 0 ? { amount: sum(rows), currency: "SAR" } : {}) };
    return [all, ...[...scan.pills].map(([k, tone]) => { const rs = rows.filter((r) => of(r) === k); return { key: k, label: (scan.attr === "data-level" && /^\d+$/.test(k) ? [`Level ${k}`, `المستوى ${k}`] : [scan.labels[k] ?? k, scan.labels[k] ?? k]) as [string, string], tone, count: rs.length, ...(scan.amountCol >= 0 ? { amount: sum(rs), currency: "SAR" } : {}) }; })];
  }, [scan.sig]); // eslint-disable-line react-hooks/exhaustive-deps

  const apply = (v: SharedView | undefined) => {
    if (!v) { setSt({ q: "", col: {} }); return; }
    const p = v.payload as Partial<TState>; setSt({ q: String(p.q ?? ""), col: (p.col as Record<number, string[]>) ?? {}, strip: p.strip, view: v.id });
  };
  const active = Object.values(st.col).some((v) => v.length) || !!st.q || !!st.strip;
  const summary = [st.q && `${tx(ar, "Search", "بحث")}: ${st.q}`, ...Object.entries(st.col).filter(([, v]) => v.length).map(([k, v]) => `${head[Number(k)]}: ${v.join("، ")}`), st.strip && `${tx(ar, "State", "الحالة")}: ${st.strip}`].filter(Boolean) as string[];

  const filterOf = (i: number) => {
    const h = head[i] ?? ""; const vals = [...new Set((scan.cols[i] ?? []).filter(Boolean))].sort((a, b) => a.localeCompare(b, ar ? "ar" : "en")); const v = st.col[i] ?? [];
    if (!h || vals.length < 2 || vals.length > 40 || i === scan.amountCol) return null;
    return <EntPopover width={240} title={h} trigger={<button type="button" className="ek-rl-hf" data-on={v.length ? "" : undefined} aria-label={tx(ar, `Filter ${h}`, `تصفية ${h}`)} data-et-hf={i}>⏷</button>}>
      <ul className="ek-rl-opts">{vals.map((o) => <li key={o}><label><input type="checkbox" checked={v.includes(o)} onChange={(e) => setSt((s) => ({ ...s, col: { ...s.col, [i]: e.target.checked ? [...v, o] : v.filter((x) => x !== o) } }))} /><span className="flex-1" data-no-i18n>{o}</span></label></li>)}</ul>
      {v.length > 0 && <button type="button" className="ek-rl-link mt-1" onClick={() => setSt((s) => ({ ...s, col: { ...s.col, [i]: [] } }))}>{tx(ar, "Clear", "مسح")}</button>}
    </EntPopover>;
  };
  return <div ref={root} className="ek-et" data-ent-table={id}>
    {(title || actions) && <div className="ek-et-h">{title && <h3 className="ek-et-t">{title}</h3>}{actions && <div className="ek-et-acts">{actions}</div>}</div>}
    {withViews && <div className="ek-rl-views ek-et-views" role="tablist" aria-label={tx(ar, "Saved views", "العروض المحفوظة")}>
      <button type="button" role="tab" aria-selected={!st.view} className="ek-rl-view" data-et-view="all" onClick={() => apply(undefined)}>{tx(ar, "All", "الكل")}</button>
      {views.map((v) => <ViewChip key={v.id} v={v} ar={ar} active={st.view === v.id} onApply={() => apply(v)} onShare={() => setSaving({ open: true, editing: v })} onDelete={() => { deleteView(v.id, user); if (st.view === v.id) apply(undefined); }} />)}
      {active && <button type="button" className="ek-et-save" onClick={() => setSaving({ open: true })} data-et-save>{tx(ar, "Save view", "حفظ العرض")}</button>}
    </div>}
    {tabs.length > 0 && <StatusStrip ar={ar} tabs={tabs} active={st.strip} onPick={(k) => setSt((s) => ({ ...s, strip: k }))} label={scan.attr ? tx(ar, "States", "الحالات") : head[scan.pillCol] ?? ""} />}
    <div className="ek-et-tools">
      <input className="field-input ek-et-q" value={st.q} onChange={(e) => setSt((s) => ({ ...s, q: e.target.value }))} placeholder={tx(ar, "Search this list", "ابحث في هذه القائمة")} aria-label={tx(ar, "Search", "بحث")} data-et-search />
      <span className="ek-et-n" data-et-count={shown.n} data-no-i18n>{shown.n === shown.total ? tx(ar, `${shown.total} ${shown.total === 1 ? "row" : "rows"}`, `${shown.total} صف`) : tx(ar, `${shown.n} of ${shown.total}`, `${shown.n} من ${shown.total}`)}</span>
      {active && <button type="button" className="ek-et-clear" onClick={() => setSt({ q: "", col: {} })}>{tx(ar, "Clear", "مسح")}</button>}
    </div>
    {wrap ? <div ref={box} className="ek-et-wrap">{children}{wrapped.hosts.map((host, i) => host.isConnected ? createPortal(filterOf(i), host, `hf${i}`) : null)}</div> : <div className="ek-rl-scroll ek-et-scroll"><table className="ek-rl-table ek-et-table" data-fin-table={id} data-compact>
      <thead><tr>{head.map((h, i) => <th key={`${h}-${i}`} data-align={i === scan.amountCol ? "end" : undefined}><span className="ek-rl-th">{h}{filterOf(i)}</span></th>)}</tr></thead>
      <tbody ref={body}>{children}</tbody>
    </table>
    </div>}
    {shown.total > 0 && shown.n === 0 && <p className="ek-et-none" role="status">{tx(ar, "No row matches the search or filters.", "لا صف يطابق البحث أو التصفية.")}</p>}
    {saving.open && <SaveShareDialog open onOpenChange={(o) => { if (!o) setSaving({ open: false }); }} ar={ar} doctype={vdt} surface="list" payload={{ q: st.q, col: st.col, strip: st.strip }} summary={summary} editing={saving.editing}
      onSaved={(v) => { setSaving({ open: false }); setSt((s) => ({ ...s, view: v.id })); }} />}
  </div>;
}
