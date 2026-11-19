/**
 * Enterprise stage columns (Construction phase 4 C4-06) — an app-agnostic kanban: each column header shows its colour
 * dot, label, count, total, a select-all box and a ⋯ menu that moves the selected cards one stage left / right (the
 * host applies the move through its own workflow / save path and returns refusals); a column shows its first 10 cards
 * and «+N أخرى»; each card shows its age and time in the stage; ⚡ marks a stage the system sets automatically. The
 * alternative view is stage tabs with counts. Apps pass columns and cards; nothing here writes.
 * CRM C1 (owner 2026-11-17) adds, all optional: a coloured column head (3px top rule + tinted head in the stage hue) with
 * head facts (probability %, weighted), column footer totals, card flags (e.g. «لا نشاط منذ 3 أيام»), card facts the
 * reader chooses (a late date in red), a free card body (the host's own controls), drag-and-drop through the host's
 * onDropCard, a settings slot in the top bar and a host note for a move that needs more input (e.g. a lost reason).
 */
import { useEffect, useState, type ReactNode } from "react";
import { EntPopover } from "../Surfaces";

export type StageTone = "bad" | "warn" | "info" | "ok";
export interface StageFact { key: string; label: ReactNode; value: ReactNode; tone?: StageTone | undefined }
export interface StageFlag { key: string; label: ReactNode; tone: StageTone }
export interface StageCard { key: string; title: ReactNode; sub?: ReactNode; amountText?: string | undefined; age?: string | undefined; inStage?: string | undefined; late?: boolean | undefined;
  /** reader-chosen card fields; a fact with tone "bad" (e.g. a passed close date) is drawn in red */ facts?: StageFact[] | undefined; flags?: StageFlag[] | undefined; body?: ReactNode; draggable?: boolean | undefined;
  /** CRM C4 D-10: a click on the card (not on its links or controls) opens the host's quick view */ onOpen?: ((el: HTMLElement) => void) | undefined }
export interface StageColumn { key: string; label: string; hue: string; auto?: boolean | undefined; autoHint?: string | undefined; count: number; totalText: string; cards: StageCard[];
  /** head figures beside the count and total (e.g. probability 25% · weighted ⃁ 1.2M) */ facts?: StageFact[] | undefined; /** totals under the column */ foot?: ReactNode; /** colour the whole head in the stage hue */ tinted?: boolean | undefined }
export interface MoveResult { moved: number; refused: string[]; /** the host needs more input first (e.g. a lost reason dialog) — shown instead of the moved count */ note?: string | undefined }
const FIRST = 10;
const tx = (ar: boolean, en: string, a: string) => (ar ? a : en);

export function StageBoard({ columns, ar, onMove, onDropCard, title, footer, settings, attrs }: {
  columns: StageColumn[]; ar: boolean; onMove?: ((keys: string[], from: string, to: string) => MoveResult) | undefined; title?: ReactNode; footer?: ReactNode; attrs?: Record<string, string> | undefined;
  /** drag a card onto another column (cards with draggable) — the host applies the move and returns refusals */ onDropCard?: ((key: string, from: string, to: string) => MoveResult) | undefined; /** a control in the top bar (e.g. the card-fields picker) */ settings?: ReactNode;
}) {
  const [view, setView] = useState<"columns" | "tabs">("columns");
  // phones open on the stage tabs (one stage at a time); the reader can still switch to columns
  useEffect(() => { if (typeof window !== "undefined" && window.matchMedia?.("(max-width: 767px)").matches) setView("tabs"); }, []);
  const [tab, setTab] = useState<string>(columns.find((c) => c.count)?.key ?? columns[0]?.key ?? "");
  const [sel, setSel] = useState<Set<string>>(() => new Set());
  const [full, setFull] = useState<Set<string>>(() => new Set());
  const [menu, setMenu] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ tone: "ok" | "bad" | "info"; text: string[] } | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const show = (r: MoveResult, to: StageColumn) => setMsg(r.note ? { tone: "info", text: [r.note] } : r.refused.length ? { tone: "bad", text: [tx(ar, `${r.moved} moved, ${r.refused.length} refused`, `نُقل ${r.moved} ورُفض ${r.refused.length}`), ...r.refused] } : { tone: "ok", text: [tx(ar, `${r.moved} moved to ${to.label}`, `نُقل ${r.moved} إلى ${to.label}`)] });
  const drop = (to: StageColumn, data: string) => { setOver(null); if (!onDropCard || !data) return; const [from, key] = data.split("\u0001"); if (!key || from === to.key) return; show(onDropCard(key, from!, to.key), to); };
  const toggle = (k: string, on: boolean) => setSel((x) => { const n = new Set(x); if (on) n.add(k); else n.delete(k); return n; });
  const move = (c: StageColumn, dir: -1 | 1) => {
    const i = columns.indexOf(c); const to = columns[i + dir]; if (!to || !onMove) return;
    const keys = c.cards.map((x) => x.key).filter((k) => sel.has(k));
    setMenu(null); if (!keys.length) return;
    const r = onMove(keys, c.key, to.key);
    setSel((x) => { const n = new Set(x); keys.forEach((k) => n.delete(k)); return n; });
    show(r, to);
  };
  const card = (c: StageCard, col: StageColumn) => (
    <li key={c.key} className="ek-sb-card" data-late={c.late || undefined} data-stage-card={c.key} data-openable={c.onOpen ? "" : undefined}
      onClick={c.onOpen ? (e) => { if ((e.target as HTMLElement).closest("a, button, input, select, label, textarea")) return; c.onOpen!(e.currentTarget); } : undefined} draggable={!!(c.draggable && onDropCard)} data-draggable={c.draggable && onDropCard ? "" : undefined}
      onDragStart={c.draggable && onDropCard ? (e) => { e.dataTransfer.setData("text/plain", `${col.key}\u0001${c.key}`); e.dataTransfer.effectAllowed = "move"; } : undefined}>
      <label className="ek-sb-pick"><input type="checkbox" checked={sel.has(c.key)} onChange={(e) => toggle(c.key, e.target.checked)} aria-label={tx(ar, "Select", "تحديد")} data-stage-select={c.key} /></label>
      {/* owner notes C-05: a card moves by drag or by its own ⋯ menu — never by a status dropdown under the card */}
      {c.draggable && onDropCard && <EntPopover open={menu === `card:${c.key}`} onOpenChange={(o) => setMenu(o ? `card:${c.key}` : null)} align="end" width={230}
        trigger={<button type="button" className="ek-sb-cardmore" aria-label={tx(ar, "Move to…", "نقل إلى…")} data-stage-card-menu={c.key}>⋯</button>}>
        <div role="menu" className="ek-dmenu-list"><p className="px-2 py-1 text-xs text-muted-foreground">{tx(ar, "Move to", "نقل إلى")}</p>
          {columns.filter((t) => t.key !== col.key).map((t) => <button key={t.key} type="button" role="menuitem" className="ek-dmenu-item" disabled={!!t.auto} title={t.auto ? t.autoHint : undefined}
            onClick={() => { setMenu(null); show(onDropCard(c.key, col.key, t.key), t); }} data-stage-card-move={t.key}><span className="ek-sb-dot" style={{ background: t.hue }} aria-hidden /> {t.label}</button>)}
        </div></EntPopover>}
      <div className="min-w-0 flex-1">
        <div className="ek-sb-title">{c.title}</div>
        {c.sub && <div className="ek-sb-sub">{c.sub}</div>}
        {c.flags && c.flags.length > 0 && <div className="ek-sb-flags">{c.flags.map((f) => <span key={f.key} className="ek-sb-flag" data-tone={f.tone} data-stage-flag={f.key}>{f.label}</span>)}</div>}
        {(c.amountText || c.age || c.inStage) && <div className="ek-sb-meta">{c.amountText && <b className="tabular-nums" data-no-i18n>{c.amountText}</b>}{c.age && <span data-stage-age>{c.age}</span>}{c.inStage && <span data-stage-in>{c.inStage}</span>}</div>}
        {c.facts && c.facts.length > 0 && <dl className="ek-sb-facts">{c.facts.map((f) => <div key={f.key} data-stage-fact={f.key} data-tone={f.tone}><dt>{f.label}</dt><dd>{f.value}</dd></div>)}</dl>}
        {c.body}
      </div>
    </li>
  );
  const head = (c: StageColumn) => {
    const i = columns.indexOf(c); const all = c.cards.length > 0 && c.cards.every((x) => sel.has(x.key)); const n = c.cards.filter((x) => sel.has(x.key)).length;
    const prev = columns[i - 1], next = columns[i + 1];
    return (
      <header className="ek-sb-head" data-stage-head={c.key} data-tinted={c.tinted || undefined}>
        <span className="ek-sb-dot" style={{ background: c.hue }} aria-hidden />
        <span className="ek-sb-label">{c.label}{c.auto && <span className="ek-sb-auto" title={c.autoHint} aria-label={tx(ar, "Set automatically", "تُضبط تلقائيًا")} data-stage-auto>⚡</span>}</span>
        <span className="ek-sb-count tabular-nums" data-no-i18n data-stage-count={c.count}>{c.count}</span>
        <bdi dir="ltr" className="ek-sb-total tabular-nums" data-no-i18n>{c.totalText}</bdi>
        <span className="ms-auto inline-flex items-center gap-1">
          <input type="checkbox" checked={all} disabled={!c.cards.length} onChange={(e) => setSel((x) => { const s = new Set(x); c.cards.forEach((k) => (e.target.checked ? s.add(k.key) : s.delete(k.key))); return s; })} aria-label={tx(ar, `Select all in ${c.label}`, `تحديد الكل في ${c.label}`)} data-stage-select-all={c.key} />
          {onMove && <EntPopover open={menu === c.key} onOpenChange={(o) => setMenu(o ? c.key : null)} align="end" width={230}
            trigger={<button type="button" className="ek-sb-more" aria-label={tx(ar, `Actions for ${c.label}`, `إجراءات ${c.label}`)} data-stage-menu={c.key}>⋯</button>}>
            <div role="menu" className="ek-dmenu-list">
              <p className="px-2 py-1 text-xs text-muted-foreground">{n ? tx(ar, `${n} selected`, `${n} محدد`) : tx(ar, "Select cards first", "حدد البطاقات أولًا")}</p>
              {[[prev, -1, ar ? "→" : "←"], [next, 1, ar ? "←" : "→"]].map(([to, dir, arrow]) => { const t = to as StageColumn | undefined; if (!t) return null; const off = !n || !!t.auto;
                return <button key={String(dir)} type="button" role="menuitem" className="ek-dmenu-item" disabled={off} title={t.auto ? t.autoHint : undefined} onClick={() => move(c, dir as -1 | 1)} data-stage-move={dir === -1 ? "prev" : "next"}>{dir === -1 ? tx(ar, "Move to previous stage", "نقل للمرحلة السابقة") : tx(ar, "Move to next stage", "نقل للمرحلة التالية")} {String(arrow)} {t.label}{t.auto ? " ⚡" : ""}</button>; })}
            </div>
          </EntPopover>}
        </span>
        {c.facts && c.facts.length > 0 && <dl className="ek-sb-hfacts">{c.facts.map((f) => <div key={f.key} data-stage-hfact={f.key} data-tone={f.tone}><dt>{f.label}</dt><dd className="tabular-nums" data-no-i18n>{f.value}</dd></div>)}</dl>}
      </header>
    );
  };
  const cards = (c: StageColumn, all?: boolean) => {
    const open = all || full.has(c.key); const shown = open ? c.cards : c.cards.slice(0, FIRST);
    return <>
      <ul className="ek-sb-cards">{shown.map((x) => card(x, c))}</ul>
      {!open && c.cards.length > FIRST && <button type="button" className="ek-sb-moreCards" onClick={() => setFull((x) => new Set(x).add(c.key))} data-stage-more={c.key}>{tx(ar, `+${c.cards.length - FIRST} more`, `+${c.cards.length - FIRST} أخرى`)}</button>}
      {!c.cards.length && <p className="ek-sb-empty">{tx(ar, "None", "لا يوجد")}</p>}
      {c.foot && <footer className="ek-sb-foot" data-stage-foot={c.key}>{c.foot}</footer>}
    </>;
  };
  const cur = columns.find((c) => c.key === tab) ?? columns[0];
  return (
    <section className="ek-sb" data-stage-board={view} {...attrs}>
      <div className="ek-sb-top">
        {title && <h3 className="ek-h3">{title}</h3>}
        {settings && <span className="ms-auto inline-flex items-center gap-2" data-stage-settings>{settings}</span>}
        <div className="inline-flex rounded-full border border-border p-0.5" role="group" aria-label={tx(ar, "View", "العرض")}>
          {(["columns", "tabs"] as const).map((v) => <button key={v} type="button" aria-pressed={view === v} className="ek-seg" data-active={view === v || undefined} data-tone="ok" onClick={() => setView(v)} data-stage-view={v}>{v === "columns" ? tx(ar, "Columns", "أعمدة") : tx(ar, "Stage tabs", "تبويبات المراحل")}</button>)}
        </div>
      </div>
      {msg && <div className={`mb-2 rounded-md p-2 text-xs ${msg.tone === "bad" ? "bg-destructive/10 text-destructive" : msg.tone === "info" ? "bg-info/10 text-info" : "bg-success/15 text-success-text"}`} role="status" data-stage-msg={msg.tone}>{msg.text.map((x, i) => <p key={i}>{x}</p>)}</div>}
      {view === "columns" ? (
        <div className="ek-sb-cols">{columns.map((c) => <div key={c.key} className="ek-sb-col" data-stage-col={c.key} style={{ ["--sb-hue" as string]: c.hue }} data-tinted={c.tinted || undefined} data-drop-over={over === c.key || undefined}
          onDragOver={onDropCard ? (e) => { e.preventDefault(); if (over !== c.key) setOver(c.key); } : undefined} onDragLeave={onDropCard ? () => setOver((o) => (o === c.key ? null : o)) : undefined}
          onDrop={onDropCard ? (e) => { e.preventDefault(); drop(c, e.dataTransfer.getData("text/plain")); } : undefined}>{head(c)}{cards(c)}</div>)}</div>
      ) : (
        <div>
          <div className="ek-sb-tabs" role="tablist">{columns.map((c) => <button key={c.key} type="button" role="tab" aria-selected={cur?.key === c.key} className="ek-sb-tab" onClick={() => setTab(c.key)} data-stage-tab={c.key}><span className="ek-sb-dot" style={{ background: c.hue }} aria-hidden />{c.label}{c.auto ? " ⚡" : ""} <span className="ek-sb-count tabular-nums" data-no-i18n>{c.count}</span></button>)}</div>
          {cur && <div className="ek-sb-col ek-sb-col-wide" data-stage-col={cur.key} style={{ ["--sb-hue" as string]: cur.hue }} data-tinted={cur.tinted || undefined}>{head(cur)}{cards(cur, true)}</div>}
        </div>
      )}
      {footer && <div className="ek-note">{footer}</div>}
    </section>
  );
}

/** Stage progress of one record (CRM C3-03 open deal): one segment per stage in order, filled up to the current stage. */
export function StageProgress({ stages, current, ar, label, attrs }: { stages: { key: string; label: string; hue: string }[]; current: number; ar: boolean; label?: ReactNode; attrs?: Record<string, string> | undefined }) {
  const cur = stages[current];
  return (
    <div data-stage-progress={cur?.key ?? ""} {...attrs}>
      <div className="ek-stagebar" role="img" aria-label={tx(ar, `Stage ${current + 1} of ${stages.length}: ${cur?.label ?? "—"}`, `المرحلة ${current + 1} من ${stages.length}: ${cur?.label ?? "—"}`)}>
        {stages.map((s, i) => <span key={s.key} title={s.label} style={{ ["--seg" as string]: cur?.hue ?? s.hue }} data-on={i <= current || undefined} data-current={i === current || undefined} />)}
      </div>
      <div className="ek-stagebar-l"><span>{label ?? <b>{cur?.label ?? "—"}</b>}</span><span className="tabular-nums" data-no-i18n>{current + 1}/{stages.length}</span></div>
    </div>
  );
}

/** The reader's choice of fields shown on each card (CRM C1-01): checkboxes in a popover, saved by the host. */
export function CardFieldPicker({ fields, chosen, onChange, defaults, ar }: { fields: { key: string; label: ReactNode }[]; chosen: string[]; onChange: (keys: string[]) => void; defaults: string[]; ar: boolean }) {
  const [open, setOpen] = useState(false);
  const on = new Set(chosen);
  const toggle = (k: string) => onChange(fields.map((f) => f.key).filter((x) => (x === k ? !on.has(k) : on.has(x))));
  return (
    <EntPopover open={open} onOpenChange={setOpen} align="end" width={250}
      trigger={<button type="button" className="btn-ghost min-h-9 text-xs" aria-label={tx(ar, "Card fields", "حقول البطاقة")} data-card-fields-open>{tx(ar, `Card fields (${chosen.length})`, `حقول البطاقة (${chosen.length})`)}</button>}>
      <div role="group" aria-label={tx(ar, "Fields shown on each card", "الحقول الظاهرة على كل بطاقة")} data-card-fields>
        <div className="ek-fieldpick">{fields.map((f) => <label key={f.key}><input type="checkbox" checked={on.has(f.key)} onChange={() => toggle(f.key)} data-card-field={f.key} />{f.label}</label>)}</div>
        <div className="ek-fieldpick-foot"><span className="text-muted-foreground">{tx(ar, "Saved for you only", "يُحفظ لك وحدك")}</span><button type="button" className="font-semibold text-primary" onClick={() => onChange(defaults)} data-card-fields-reset>{tx(ar, "Default", "الافتراضي")}</button></div>
      </div>
    </EntPopover>
  );
}
