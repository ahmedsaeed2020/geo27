/**
 * Enterprise inspection pieces (owner FSM round F3, 2026-11-18) — app-agnostic, display + collection only; apps pass the
 * figures, labels and callbacks and apply every change through their own services:
 *  - LocationTree  building → floor → zone (any depth) with a progress ring per node (done / total), a red count of failed
 *                  and an amber count of untested; a click picks the node (the host filters its devices).
 *  - OutcomePad    big outcome buttons for one check; an outcome flagged `needsReason` asks for a reason first and is only
 *                  sent with it (e.g. «تعذر الوصول»).
 *  - BigRing       one large progress ring with value, label, sub line and the KPI code it equals.
 *  - AlertBanner   a full-width warning band (impairment, stop-work) with title, lines and an action slot.
 *  - ReportSheet   a printable document page: letterhead, bilingual title, «مسودة · DRAFT» watermark until published,
 *                  meta grid, sections and a signature row (name, time, signature image or an empty line).
 */
import { useState, type ReactNode } from "react";

const tx = (ar: boolean, en: string, a: string) => (ar ? a : en);
export type InspectTone = "ok" | "bad" | "warn" | "neutral" | "info";
const RING = (f: number, fail: number) => (fail > 0 ? "var(--ek-risk)" : f >= 1 ? "var(--ek-good)" : f > 0 ? "var(--ek-attention)" : "var(--line)");

export function MiniRing({ done, total, fail = 0, size = 26, label }: { done: number; total: number; fail?: number; size?: number; label?: string }) {
  const f = total > 0 ? Math.max(0, Math.min(1, done / total)) : 0; const C = 2 * Math.PI * 9;
  return <svg className="ek-ins-ring" width={size} height={size} viewBox="0 0 22 22" role="img" aria-label={label ?? `${done} / ${total}`}>
    <circle cx="11" cy="11" r="9" className="ek-ins-ring-t" /><circle cx="11" cy="11" r="9" className="ek-ins-ring-f" style={{ stroke: RING(f, fail), strokeDasharray: `${f * C} ${C}` }} /></svg>;
}

export interface TreeNode { key: string; label: ReactNode; kind?: ReactNode; done: number; total: number; fail?: number | undefined; untested?: number | undefined; children?: TreeNode[] | undefined }
function TreeRow({ n, depth, selected, onPick, ar, open, toggle }: { n: TreeNode; depth: number; selected: string; onPick: (k: string) => void; ar: boolean; open: Set<string>; toggle: (k: string) => void }) {
  const kids = n.children ?? []; const isOpen = !open.has(n.key);
  return <li role="treeitem" aria-expanded={kids.length ? isOpen : undefined} aria-selected={selected === n.key} data-tree-node={n.key}>
    <div className="ek-ins-tn" data-on={selected === n.key || undefined} style={{ paddingInlineStart: 6 + depth * 16 }}>
      {kids.length ? <button type="button" className="ek-ins-tog" onClick={() => toggle(n.key)} aria-label={isOpen ? tx(ar, "Collapse", "طي") : tx(ar, "Expand", "توسيع")}>{isOpen ? "▾" : "▸"}</button> : <span className="ek-ins-tog" aria-hidden />}
      <button type="button" className="ek-ins-tb" onClick={() => onPick(n.key)} data-tree-pick={n.key}>
        <MiniRing done={n.done} total={n.total} fail={n.fail ?? 0} label={`${n.done} / ${n.total}`} />
        <span className="ek-ins-tl"><b>{n.label}</b>{n.kind && <small>{n.kind}</small>}</span>
        <span className="ek-ins-tc" data-no-i18n>{n.done}/{n.total}</span>
        {(n.fail ?? 0) > 0 && <span className="ek-ins-badge" data-tone="bad" title={tx(ar, "Failed devices", "أجهزة راسبة")} data-no-i18n>✕ {n.fail}</span>}
        {(n.untested ?? 0) > 0 && <span className="ek-ins-badge" data-tone="warn" title={tx(ar, "Untested devices", "أجهزة لم تُفحص")} data-no-i18n>○ {n.untested}</span>}
      </button>
    </div>
    {kids.length > 0 && isOpen && <ul role="group">{kids.map((k) => <TreeRow key={k.key} n={k} depth={depth + 1} selected={selected} onPick={onPick} ar={ar} open={open} toggle={toggle} />)}</ul>}
  </li>;
}
export function LocationTree({ nodes, selected, onPick, ar, all, title }: { nodes: TreeNode[]; selected: string; onPick: (key: string) => void; ar: boolean; all?: TreeNode | undefined; title?: ReactNode }) {
  const [closed, setClosed] = useState<Set<string>>(new Set());
  const toggle = (k: string) => setClosed((x) => { const n = new Set(x); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  return <nav className="ek-ins-tree" aria-label={tx(ar, "Locations", "الأماكن")} data-location-tree>
    {title && <p className="ek-ins-tree-h">{title}</p>}
    <ul role="tree">{all && <TreeRow n={all} depth={0} selected={selected} onPick={onPick} ar={ar} open={closed} toggle={toggle} />}{nodes.map((n) => <TreeRow key={n.key} n={n} depth={all ? 1 : 0} selected={selected} onPick={onPick} ar={ar} open={closed} toggle={toggle} />)}</ul>
  </nav>;
}

export interface OutcomeOpt { key: string; label: string; tone: InspectTone; needsReason?: boolean | undefined }
export function OutcomePad({ id, value, options, onPick, disabled, ar, note }: { id: string; value: string; options: OutcomeOpt[]; onPick: (key: string, reason?: string) => void; disabled?: boolean | undefined; ar: boolean; note?: string | undefined }) {
  const [ask, setAsk] = useState(""); const [why, setWhy] = useState("");
  const pick = (o: OutcomeOpt) => { if (o.needsReason) { setAsk(o.key); setWhy(o.key === value ? note ?? "" : ""); return; } onPick(o.key); };
  const send = () => { if (!why.trim()) return; onPick(ask, why.trim()); setAsk(""); setWhy(""); };
  return <div className="ek-ins-pad" data-outcome-pad={id}>
    <div className="ek-ins-pad-b" role="radiogroup" aria-label={tx(ar, "Outcome", "النتيجة")}>
      {options.map((o) => <button key={o.key} type="button" role="radio" aria-checked={value === o.key} data-tone={o.tone} data-on={value === o.key || undefined} disabled={disabled} onClick={() => pick(o)} data-pad-outcome={o.key}>{o.label}</button>)}
    </div>
    {ask && <div className="ek-ins-why" data-pad-reason={id}>
      <input className="field-input min-h-9 text-sm" autoFocus value={why} onChange={(e) => setWhy(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") send(); if (e.key === "Escape") setAsk(""); }} placeholder={tx(ar, "Why could the device not be reached? (required)", "لماذا تعذر الوصول إلى الجهاز؟ (مطلوب)")} aria-label={tx(ar, "Reason", "السبب")} data-pad-why />
      <button type="button" className="btn-primary min-h-9 px-3 text-sm" disabled={!why.trim()} onClick={send} data-pad-save>{tx(ar, "Record", "تسجيل")}</button>
      <button type="button" className="btn-secondary min-h-9 px-3 text-sm" onClick={() => setAsk("")}>{tx(ar, "Cancel", "إلغاء")}</button>
    </div>}
    {!ask && value && options.find((o) => o.key === value)?.needsReason && note && <p className="ek-ins-note" data-no-i18n>{note}</p>}
  </div>;
}

export function BigRing({ value, label, sub, code, size = 128, tone }: { value: number | null; label: ReactNode; sub?: ReactNode; code?: string | undefined; size?: number; tone?: InspectTone | undefined }) {
  const f = value === null ? 0 : Math.max(0, Math.min(1, value)); const C = 2 * Math.PI * 42;
  const stroke = tone === "bad" ? "var(--ek-risk)" : tone === "warn" ? "var(--ek-attention)" : tone === "ok" ? "var(--ek-good)" : f >= 1 ? "var(--ek-good)" : f >= 0.8 ? "var(--ek-attention)" : "var(--ek-risk)";
  return <figure className="ek-ins-big" data-big-ring={code ?? ""}>
    <svg width={size} height={size} viewBox="0 0 100 100" role="img" aria-label={value === null ? "—" : `${Math.round(f * 1000) / 10}%`}>
      <circle cx="50" cy="50" r="42" className="ek-ins-ring-t" strokeWidth="10" /><circle cx="50" cy="50" r="42" className="ek-ins-ring-f" strokeWidth="10" style={{ stroke, strokeDasharray: `${f * C} ${C}` }} />
      <text x="50" y="50" textAnchor="middle" dominantBaseline="central" className="ek-ins-big-v">{value === null ? "—" : `${Math.round(f * 1000) / 10}%`}</text>
    </svg>
    <figcaption><b>{label}</b>{sub && <span>{sub}</span>}{code && <small data-no-i18n>{code}</small>}</figcaption>
  </figure>;
}

export function AlertBanner({ tone = "bad", title, lines, action, icon = "⚠", attrs }: { tone?: "bad" | "warn" | "info"; title: ReactNode; lines?: ReactNode[] | undefined; action?: ReactNode; icon?: ReactNode; attrs?: Record<string, string> | undefined }) {
  return <div className="ek-ins-alert" data-tone={tone} role="alert" {...attrs}>
    <span className="ek-ins-alert-i" aria-hidden>{icon}</span>
    <div className="min-w-0 flex-1"><p className="ek-ins-alert-t">{title}</p>{lines && lines.length > 0 && <ul>{lines.map((l, i) => <li key={i}>{l}</li>)}</ul>}</div>
    {action && <div className="ek-ins-alert-a">{action}</div>}
  </div>;
}

/** Two-language label: the reader's language first, the other one beside it (marked as record text, never re-translated). */
export function Bil({ pair, ar, block }: { pair: readonly [string, string]; ar: boolean; block?: boolean }) {
  const [en, a] = pair;
  return <span className="ek-bil" data-block={block || undefined}><span>{ar ? a : en}</span><span className="ek-bil-o" lang={ar ? "en" : "ar"} dir={ar ? "ltr" : "rtl"} data-no-i18n>{ar ? en : a}</span></span>;
}

export interface SheetMeta { label: readonly [string, string]; value: ReactNode }
export interface SheetSign { label: readonly [string, string]; name?: ReactNode; at?: ReactNode; image?: string | undefined }
/**
 * Printable document page (customer inspection report, certificate …). `draft` draws the «مسودة · DRAFT» watermark and a
 * draft ribbon; headings carry both languages; sections are the host's own content.
 */
export function ReportSheet({ ar, letterhead, title, reference, draft, meta, children, signatures, foot }: {
  ar: boolean; letterhead: { name: ReactNode; lines?: ReactNode[] | undefined; mark?: ReactNode }; title: readonly [string, string]; reference?: ReactNode; draft: boolean;
  meta: SheetMeta[]; children: ReactNode; signatures: SheetSign[]; foot?: ReactNode;
}) {
  return <article className="ek-sheet" data-draft={draft || undefined} data-report-sheet aria-label={ar ? title[1] : title[0]}>
    {draft && <div className="ek-sheet-wm" aria-hidden data-no-i18n><span>مسودة · DRAFT</span></div>}
    <header className="ek-sheet-lh">
      <div className="ek-sheet-mark" aria-hidden>{letterhead.mark ?? "◆"}</div>
      <div className="min-w-0 flex-1"><p className="ek-sheet-co">{letterhead.name}</p>{letterhead.lines?.map((l, i) => <p key={i} className="ek-sheet-cl">{l}</p>)}</div>
      <div className="ek-sheet-st">{draft ? <span className="ek-sheet-draft" data-sheet-state="draft"><Bil pair={["Draft — not published", "مسودة — غير منشورة"]} ar={ar} /></span> : <span className="ek-sheet-pub" data-sheet-state="published"><Bil pair={["Published", "منشور"]} ar={ar} /></span>}{reference && <p className="ek-sheet-ref" data-no-i18n>{reference}</p>}</div>
    </header>
    <h2 className="ek-sheet-h"><Bil pair={title} ar={ar} block /></h2>
    <dl className="ek-sheet-meta">{meta.map((m, i) => <div key={i}><dt><Bil pair={m.label} ar={ar} /></dt><dd>{m.value}</dd></div>)}</dl>
    <div className="ek-sheet-body">{children}</div>
    <footer className="ek-sheet-sign">{signatures.map((g, i) => <div key={i} className="ek-sheet-sg" data-signature={i}>
      <div className="ek-sheet-sl">{g.image ? <img src={g.image} alt={ar ? g.label[1] : g.label[0]} /> : <span aria-hidden />}</div>
      <p><Bil pair={g.label} ar={ar} /></p>{g.name && <p className="ek-sheet-sn" data-no-i18n>{g.name}</p>}{g.at && <p className="ek-sheet-sa" data-no-i18n>{g.at}</p>}
    </div>)}</footer>
    {foot && <p className="ek-sheet-foot">{foot}</p>}
  </article>;
}

/** One heading inside a ReportSheet (both languages). */
export function SheetSection({ title, ar, children, attrs }: { title: readonly [string, string]; ar: boolean; children: ReactNode; attrs?: Record<string, string> | undefined }) {
  return <section className="ek-sheet-sec" {...attrs}><h3><Bil pair={title} ar={ar} /></h3>{children}</section>;
}
