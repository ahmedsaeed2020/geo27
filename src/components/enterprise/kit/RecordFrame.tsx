/**
 * Enterprise record frame (CRM C4 C-01 … C-08 and D-01 … D-09, owner 2026-11-17) — one frame for every record an app
 * shows as a working page (CRM Lead and CRM Deal today): header with avatar, pills, owner and followers, actions, quick
 * action icons and a ⋯ menu; a chevron status path with the days spent in each step, «وضع علامة كمكتمل» and a side exit;
 * three columns at desktop widths (fields · timeline · cards) that become tabs on phones; collapsible field groups with
 * inline edit (pencil on hover, save on blur, «أضف» for an empty field); side cards; score badge with its rule breakdown,
 * SLA chip, buying-committee strip, documents chain and a «new or existing» picker for conversions.
 * Apps pass values, labels and callbacks; nothing here reads or writes records.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { EntPopover } from "../Surfaces";
import { initials } from "../DocDrawer";
import { sampleNameAr, sampleNameEn, useLang } from "@/i18n";

const tx = (ar: boolean, en: string, a: string) => (ar ? a : en);
export type RfTone = "ok" | "warn" | "bad" | "info" | "neutral";
export type RfHue = "emerald" | "teal" | "blue" | "violet" | "amber" | "coral" | "rose" | "gold" | "lime" | "grey";

export function Avatar({ name, size = 40, hue }: { name: string; size?: 40 | 28 | 56 | 64; hue?: RfHue | undefined }) {
  // initials of the name as the screen shows it: an Arabic sample name on an English screen uses its English form (X-01)
  const en = useLang() !== "ar"; const shown = (en && name ? sampleNameEn(name) : undefined) ?? name;
  return <span className="ek-av" data-size={size} data-hue={hue} aria-hidden data-no-i18n>{initials(shown || "?")}</span>;
}
export function Pill({ tone = "neutral", hue, children, attrs }: { tone?: RfTone; hue?: RfHue | undefined; children: ReactNode; attrs?: Record<string, string | undefined> }) {
  return <span className="ek-pill" data-tone={hue ? undefined : tone} data-hue={hue} {...attrs}>{children}</span>;
}

/* ------------------------------------------------------------------ score and SLA ------------------------------------------------------------------ */
export interface ScorePart { key: string; group: string; label: ReactNode; points: number; kind: "positive" | "negative" | "missing" }
/** Score 0–100 in its colour band; a click opens the rules that gave the points (C-07). */
export function ScoreBadge({ score, band, parts, ar, groups }: { score: number; band: "Hot" | "Warm" | "Cold"; parts?: ScorePart[] | undefined; ar: boolean; groups?: Record<string, string> | undefined }) {
  const label = band === "Hot" ? tx(ar, "Hot", "ساخن") : band === "Warm" ? tx(ar, "Warm", "دافئ") : tx(ar, "Cold", "بارد");
  const badge = <span className="ek-score" data-band={band.toLowerCase()} data-score={score}><b dir="ltr" data-no-i18n>{score}</b><small>{label}</small></span>;
  if (!parts) return badge;
  const byGroup = new Map<string, ScorePart[]>(); for (const p of parts) byGroup.set(p.group, [...(byGroup.get(p.group) ?? []), p]);
  return <EntPopover width={320} title={tx(ar, `Score ${score} — how it is made`, `الدرجة ${score} — كيف حُسبت`)} trigger={<button type="button" className="ek-score-btn" aria-label={tx(ar, `Score ${score}, show the rules`, `الدرجة ${score}، عرض القواعد`)} data-score-open>{badge}</button>}>
    <div className="ek-score-pop" data-score-parts={parts.length}>
      {[...byGroup.entries()].map(([g, ps]) => { const sum = ps.reduce((a, x) => a + x.points, 0); return <section key={g} data-score-group={g}>
        <h4><span>{groups?.[g] ?? g}</span><bdi dir="ltr" data-no-i18n className={sum < 0 ? "text-[var(--negative)]" : ""}>{sum > 0 ? `+${sum}` : sum}</bdi></h4>
        <ul>{ps.map((x) => <li key={x.key} data-kind={x.kind}><span aria-hidden>{x.kind === "positive" ? "✓" : x.kind === "negative" ? "✕" : "○"}</span><span className="min-w-0 flex-1">{x.label}</span><bdi dir="ltr" data-no-i18n>{x.kind === "missing" ? "0" : x.points > 0 ? `+${x.points}` : x.points}</bdi></li>)}</ul>
      </section>; })}
      <p className="ek-score-note">{tx(ar, "Rule-based (settings); recalculated from the current records. Missing data scores 0.", "مبنية على قواعد (من الإعدادات) وتُعاد من السجلات الحالية. البيانات الناقصة تُحسب صفرًا.")}</p>
    </div>
  </EntPopover>;
}
export type SlaState = "ok" | "risk" | "breached" | "met" | "na";
export function SlaChip({ state, text, ar }: { state: SlaState; text?: ReactNode; ar: boolean }) {
  if (state === "na") return <span className="ek-sla" data-state="na">{tx(ar, "No SLA", "لا ينطبق")}</span>;
  const l = { ok: tx(ar, "On time", "في الوقت"), risk: tx(ar, "At risk", "معرّض للتأخر"), breached: tx(ar, "Breached", "متجاوز"), met: tx(ar, "Met", "تم الرد") }[state];
  return <span className="ek-sla" data-state={state} data-sla={state}><span aria-hidden className="ek-sla-dot" />{l}{text && <small>{text}</small>}</span>;
}

/* ------------------------------------------------------------------ header ------------------------------------------------------------------ */
export interface RfMenuItem { key: string; label: ReactNode; run: () => void; tone?: "bad" | undefined; blocked?: string | undefined }
export interface RfQuick { key: string; label: string; icon: ReactNode; run: () => void }
export function RecordHeader({ name, title, sub, pills, facts, actions, quick, menu, ar, kicker, attrs }: {
  name: string; title: ReactNode; sub?: ReactNode; pills?: ReactNode; facts?: ReactNode; actions?: ReactNode; quick?: RfQuick[] | undefined; menu?: RfMenuItem[] | undefined; ar: boolean; kicker?: ReactNode; attrs?: Record<string, string | undefined>;
}) {
  const [open, setOpen] = useState(false);
  return <header className="ek-rf-head" {...attrs}>
    <Avatar name={(ar ? sampleNameAr(name) : sampleNameEn(name)) ?? name} size={56} />
    <div className="ek-rf-id">
      {kicker && <p className="ek-rf-kicker">{kicker}</p>}
      <h1 className="ek-rf-title">{title}</h1>
      {sub && <p className="ek-rf-sub">{sub}</p>}
      {pills && <div className="ek-rf-pills">{pills}</div>}
    </div>
    {facts && <div className="ek-rf-facts">{facts}</div>}
    <div className="ek-rf-acts">
      {actions}
      {menu && menu.length > 0 && <EntPopover open={open} onOpenChange={setOpen} align="end" width={220} trigger={<button type="button" className="ek-rf-more" aria-label={tx(ar, "More actions", "إجراءات أخرى")} data-rf-more>⋯</button>}>
        <ul className="ek-menu">{menu.map((m) => <li key={m.key}><button type="button" data-tone={m.tone} disabled={!!m.blocked} title={m.blocked} onClick={() => { setOpen(false); m.run(); }} data-rf-menu={m.key}><span>{m.label}</span>{m.blocked && <small>{m.blocked}</small>}</button></li>)}</ul>
      </EntPopover>}
    </div>
    {quick && quick.length > 0 && <div className="ek-rf-quick" role="toolbar" aria-label={tx(ar, "Quick actions", "إجراءات سريعة")}>{quick.map((q) => <button key={q.key} type="button" onClick={q.run} title={q.label} data-rf-quick={q.key}><span aria-hidden>{q.icon}</span><small>{q.label}</small></button>)}</div>}
  </header>;
}

/* ------------------------------------------------------------------ status path ------------------------------------------------------------------ */
export interface PathStep { key: string; label: string; state: "done" | "current" | "next"; days?: number | null | undefined; hue?: RfHue | undefined; /** time in the stage as the host words it (e.g. «3 س»), shown instead of days */ span?: string | undefined; /** when the stage was entered (tooltip) */ at?: string | undefined }
export function StatusPath({ steps, ar, onPick, complete, exit, attrs }: {
  steps: PathStep[]; ar: boolean; onPick?: ((key: string) => void) | undefined; attrs?: Record<string, string | undefined>;
  complete?: { label: string; run: () => void; blocked?: string | undefined } | undefined;
  exit?: { label: string; run: () => void; active: boolean; blocked?: string | undefined; note?: ReactNode } | undefined;
}) {
  const days = (n: number | null | undefined) => n === null || n === undefined ? "" : ar ? (n === 0 ? "اليوم" : n === 1 ? "يوم" : n === 2 ? "يومان" : n <= 10 ? `${n} أيام` : `${n} يومًا`) : n === 0 ? "today" : `${n} day${n === 1 ? "" : "s"}`;
  // keep the current stage in view when the path scrolls sideways (phones); delta-based so it works in RTL and LTR
  const pathRef = useRef<HTMLOListElement | null>(null);
  const cur = steps.find((x) => x.state === "current")?.key;
  useEffect(() => { const ul = pathRef.current; const c = ul?.querySelector<HTMLElement>('[data-state="current"]'); if (!ul || !c || ul.scrollWidth <= ul.clientWidth) return;
    const r = c.getBoundingClientRect(), u = ul.getBoundingClientRect(); ul.scrollLeft += r.left + r.width / 2 - (u.left + u.width / 2); }, [cur]);
  return <div className="ek-path-wrap" {...attrs}>
    <ol className="ek-path" ref={pathRef} aria-label={tx(ar, "Stages", "المراحل")}>{steps.map((s) => <li key={s.key} data-state={s.state} data-path-step={s.key} aria-current={s.state === "current" ? "step" : undefined}>
      {onPick ? <button type="button" onClick={() => onPick(s.key)} data-path-pick={s.key}><span className="ek-path-l">{s.state === "done" && <span aria-hidden>✓ </span>}{s.label}</span>{s.span ? <small data-path-span title={s.at}>{s.span}</small> : s.days !== undefined && s.days !== null && <small data-path-days={s.days}>{days(s.days)}</small>}</button>
        : <span className="ek-path-b"><span className="ek-path-l">{s.state === "done" && <span aria-hidden>✓ </span>}{s.label}</span>{s.span ? <small data-path-span title={s.at}>{s.span}</small> : s.days !== undefined && s.days !== null && <small data-path-days={s.days}>{days(s.days)}</small>}</span>}
    </li>)}</ol>
    <div className="ek-path-acts">
      {complete && <button type="button" className="ek-path-done" disabled={!!complete.blocked} onClick={complete.run} title={complete.blocked} data-path-complete>{complete.label}</button>}
      {complete?.blocked && <small className="ek-path-why" data-path-blocked>{complete.blocked}</small>}
      {exit && <button type="button" className="ek-path-exit" data-on={exit.active ? "" : undefined} disabled={!!exit.blocked} title={exit.blocked} onClick={exit.run} data-path-exit>{exit.label}</button>}
      {exit?.note}
    </div>
  </div>;
}

/* ------------------------------------------------------------------ three columns / tabs ------------------------------------------------------------------ */
export function RecordColumns({ start, middle, end, ar, labels, initialTab = 1 }: { start: ReactNode; middle: ReactNode; end: ReactNode; ar: boolean; labels?: [string, string, string] | undefined; initialTab?: 0 | 1 | 2 | undefined }) {
  const [tab, setTab] = useState<0 | 1 | 2>(initialTab);
  const [narrow, setNarrow] = useState(false);
  useEffect(() => { const m = window.matchMedia("(max-width: 1023px)"); const f = () => setNarrow(m.matches); f(); m.addEventListener("change", f); return () => m.removeEventListener("change", f); }, []);
  const L = labels ?? [tx(ar, "Details", "التفاصيل"), tx(ar, "Activity", "النشاط"), tx(ar, "Related", "المرتبط")];
  if (!narrow) return <div className="ek-rf-cols" data-rf-cols="3"><aside className="ek-rf-col" data-rf-col="start">{start}</aside><main className="ek-rf-col" data-rf-col="middle">{middle}</main><aside className="ek-rf-col" data-rf-col="end">{end}</aside></div>;
  return <div className="ek-rf-tabs" data-rf-cols="tabs">
    <div className="ek-seg ek-rf-tabbar" role="tablist">{L.map((l, i) => <button key={l} type="button" role="tab" aria-selected={tab === i} onClick={() => setTab(i as 0 | 1 | 2)} data-rf-tab={i}>{l}</button>)}</div>
    <div className="ek-rf-col" data-rf-col={["start", "middle", "end"][tab]}>{tab === 0 ? start : tab === 1 ? middle : end}</div>
  </div>;
}

/* ------------------------------------------------------------------ cards ------------------------------------------------------------------ */
export function SideCard({ title, icon, hue = "emerald", count, action, children, tone, id }: { title: ReactNode; icon?: ReactNode; hue?: RfHue; count?: number | undefined; action?: ReactNode; children: ReactNode; tone?: "bad" | "warn" | undefined; id?: string }) {
  return <section className="ek-sc" data-hue={hue} data-tone={tone} data-sc={id}>
    <header><span className="ek-sc-ic" aria-hidden>{icon ?? "•"}</span><h3>{title}</h3>{count !== undefined && <bdi className="ek-sc-n tabular-nums" data-no-i18n>{count}</bdi>}{action && <span className="ms-auto">{action}</span>}</header>
    <div className="ek-sc-b">{children}</div>
  </section>;
}

/* ------------------------------------------------------------------ field groups with inline edit ------------------------------------------------------------------ */
export interface RfField { key: string; label: string; value: string; display?: ReactNode; type?: "text" | "email" | "tel" | "number" | "date" | "select" | "textarea" | undefined; options?: { value: string; label: string }[] | undefined; readOnly?: boolean | undefined; required?: boolean | undefined; core?: boolean | undefined }
export interface RfGroup { key: string; label: string; fields: RfField[] }
function InlineField({ f, ar, onSave, locked }: { f: RfField; ar: boolean; onSave: (key: string, value: string) => string | null; locked: boolean }) {
  const [edit, setEdit] = useState(false); const [v, setV] = useState(f.value); const [err, setErr] = useState<string | null>(null);
  useEffect(() => { if (!edit) setV(f.value); }, [f.value, edit]);
  const commit = () => { if (v === f.value) { setEdit(false); setErr(null); return; } const e = onSave(f.key, v); if (e) { setErr(e); return; } setErr(null); setEdit(false); };
  const ro = locked || f.readOnly;
  return <div className="ek-ff" data-ff={f.key} data-empty={!f.value || undefined}>
    <dt>{f.label}{f.required && <span className="ek-req" aria-hidden> *</span>}</dt>
    <dd>{edit ? <>
      {f.type === "select" ? <select className="field-input min-h-9 w-full text-sm" autoFocus value={v} onChange={(e) => setV(e.target.value)} onBlur={commit} onKeyDown={(e) => { if (e.key === "Escape") { setEdit(false); setV(f.value); } }} data-ff-input={f.key}><option value="">—</option>{(f.options ?? []).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
        : f.type === "textarea" ? <textarea className="field-input w-full text-sm" rows={3} autoFocus value={v} onChange={(e) => setV(e.target.value)} onBlur={commit} onKeyDown={(e) => { if (e.key === "Escape") { setEdit(false); setV(f.value); } }} data-ff-input={f.key} />
        : <input className="field-input min-h-9 w-full text-sm" autoFocus type={f.type === "number" ? "number" : f.type === "date" ? "date" : f.type === "email" ? "email" : f.type === "tel" ? "tel" : "text"} dir={f.type === "tel" || f.type === "email" ? "ltr" : undefined} value={v} onChange={(e) => setV(e.target.value)} onBlur={commit} onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") { setEdit(false); setV(f.value); setErr(null); } }} data-ff-input={f.key} />}
      {err && <p className="ek-ff-err" role="alert">{err}</p>}
    </> : !ro ? (
      // owner DOC-02: an editable value sits in a white bordered field box (click = edit in place, save on blur, undo toast);
      // links and buttons inside the value keep their own action
      <div className="ek-ff-box" data-ff-box={f.key} data-empty={!f.value || undefined} onClick={(e) => { if ((e.target as HTMLElement).closest("a, button:not(.ek-ff-pen), input, select, textarea")) return; setEdit(true); }}>
        {f.value ? <span className="ek-ff-v">{f.display ?? <bdi data-no-i18n>{f.value}</bdi>}</span> : <span className="ek-ff-ph" data-ff-add={f.key}>{tx(ar, "Add", "أضف")}</span>}
        <button type="button" className="ek-ff-pen" onClick={(e) => { e.stopPropagation(); setEdit(true); }} aria-label={tx(ar, `Edit ${f.label}`, `تعديل ${f.label}`)} data-ff-edit={f.key}>✎</button>
      </div>)
      : f.value ? <span className="ek-ff-v" data-ff-readonly>{f.display ?? <bdi data-no-i18n>{f.value}</bdi>}</span> : <span className="ek-ff-none">{tx(ar, "Not set", "غير محدد")}</span>}</dd>
  </div>;
}
export function FieldGroups({ groups, ar, onSave, locked, allLabel }: { groups: RfGroup[]; ar: boolean; onSave: (key: string, value: string) => string | null; locked?: boolean | undefined; allLabel?: string | undefined }) {
  const [closed, setClosed] = useState<Set<string>>(() => new Set());
  const [all, setAll] = useState(false);
  const extra = groups.reduce((a, g) => a + g.fields.filter((f) => !f.core).length, 0);
  return <div className="ek-fg" data-fg data-fg-all={all ? "" : undefined}>
    {groups.map((g) => { const fs = g.fields.filter((f) => all || f.core); if (!fs.length) return null; const isClosed = closed.has(g.key);
      return <section key={g.key} className="ek-fg-g" data-fg-group={g.key} data-closed={isClosed || undefined}>
        <button type="button" className="ek-fg-h" aria-expanded={!isClosed} onClick={() => setClosed((x) => { const n = new Set(x); if (n.has(g.key)) n.delete(g.key); else n.add(g.key); return n; })} data-fg-toggle={g.key}>
          <span>{g.label}</span><bdi className="tabular-nums" data-no-i18n>{fs.filter((f) => f.value).length}/{fs.length}</bdi><span aria-hidden className="ek-fg-car">{isClosed ? "▸" : "▾"}</span></button>
        {!isClosed && <dl className="ek-fg-b">{fs.map((f) => <InlineField key={f.key} f={f} ar={ar} onSave={onSave} locked={!!locked} />)}</dl>}
      </section>; })}
    {extra > 0 && <button type="button" className="ek-rl-link" onClick={() => setAll((x) => !x)} data-fg-all-toggle>{all ? tx(ar, "Show the key fields only", "عرض الحقول الأساسية فقط") : allLabel ?? tx(ar, `Show all fields (+${extra})`, `عرض كل الحقول (+${extra})`)}</button>}
  </div>;
}

/* ------------------------------------------------------------------ buying committee + documents chain ------------------------------------------------------------------ */
export function CommitteeStrip({ roles, ar }: { roles: { key: string; label: string; names: string[] }[]; ar: boolean }) {
  const filled = roles.filter((r) => r.names.length).length;
  return <div className="ek-cmte" data-cmte={`${filled}/${roles.length}`}>
    <p className="ek-cmte-h">{tx(ar, "Buying committee", "لجنة الشراء")} <bdi dir="ltr" data-no-i18n>{filled}/{roles.length}</bdi></p>
    <ol>{roles.map((r) => <li key={r.key} data-filled={r.names.length ? "" : undefined} data-cmte-role={r.key}><span className="ek-cmte-r">{r.label}</span><span className="ek-cmte-n">{r.names.length ? <bdi data-no-i18n>{r.names.join("، ")}</bdi> : tx(ar, "Missing", "غير محدد")}</span></li>)}</ol>
  </div>;
}
export interface ChainDoc { key: string; title: ReactNode; status: string; tone: RfTone; amount?: ReactNode }
export interface ChainStep { key: string; label: string; docs: ChainDoc[]; empty: ReactNode; action?: ReactNode }
export function DocChain({ steps, ar }: { steps: ChainStep[]; ar: boolean }) {
  return <ol className="ek-chain" aria-label={tx(ar, "Documents chain", "سلسلة المستندات")} data-chain={steps.map((s) => s.docs.length).join("-")}>{steps.map((s, i) => <li key={s.key} data-has={s.docs.length ? "" : undefined} data-chain-step={s.key}>
    <header><span className="ek-chain-n" aria-hidden>{i + 1}</span><b>{s.label}</b><bdi className="tabular-nums" data-no-i18n>{s.docs.length}</bdi></header>
    {s.docs.length ? <ul>{s.docs.map((d) => <li key={d.key} data-chain-doc={d.key}><span className="min-w-0 flex-1 truncate">{d.title}</span><Pill tone={d.tone}>{d.status}</Pill>{d.amount !== undefined && <span className="ek-chain-amt" dir="ltr" data-no-i18n>{d.amount}</span>}</li>)}</ul> : <p className="ek-chain-empty">{s.empty}</p>}
    {s.action}
  </li>)}</ol>;
}

/* ------------------------------------------------------------------ new or existing (conversion) ------------------------------------------------------------------ */
export interface PickOpt { key: string; label: string; sub?: string | undefined; match?: boolean | undefined }
export function NewOrExisting({ id, label, mode, onMode, query, onQuery, options, picked, onPick, ar, newHint, disabled }: {
  id: string; label: string; mode: "new" | "existing"; onMode: (m: "new" | "existing") => void; query: string; onQuery: (q: string) => void; options: PickOpt[]; picked: string; onPick: (k: string) => void; ar: boolean; newHint?: ReactNode; disabled?: boolean | undefined;
}) {
  const matches = options.filter((o) => o.match).length;
  const shown = options.filter((o) => !query || o.label.toLowerCase().includes(query.toLowerCase()) || (o.sub ?? "").toLowerCase().includes(query.toLowerCase())).slice(0, 8);
  return <fieldset className="ek-noe" data-noe={id} data-mode={mode} disabled={disabled}>
    <legend>{label} {matches > 0 && <span className="ek-noe-m" data-noe-matches={matches}>{tx(ar, `${matches} matching`, `${matches} مطابق`)}</span>}</legend>
    <span className="ek-seg" role="radiogroup">
      <button type="button" role="radio" aria-checked={mode === "new"} onClick={() => onMode("new")} data-noe-mode="new">{tx(ar, "Create new", "إنشاء جديد")}</button>
      <button type="button" role="radio" aria-checked={mode === "existing"} onClick={() => onMode("existing")} data-noe-mode="existing">{tx(ar, "Choose existing", "اختيار موجود")}</button>
    </span>
    {mode === "new" ? <p className="ek-noe-hint">{newHint}</p> : <>
      <input className="field-input mt-2 min-h-9 w-full text-sm" value={query} onChange={(e) => onQuery(e.target.value)} placeholder={tx(ar, "Search", "بحث")} aria-label={`${label}: ${tx(ar, "search", "بحث")}`} data-noe-search={id} />
      <ul className="ek-noe-list">{shown.map((o) => <li key={o.key}><label data-picked={picked === o.key || undefined}><input type="radio" name={`noe-${id}`} checked={picked === o.key} onChange={() => onPick(o.key)} data-noe-pick={o.key} />
        <span className="min-w-0 flex-1"><b data-no-i18n>{o.label}</b>{o.sub && <small data-no-i18n>{o.sub}</small>}</span>{o.match && <Pill tone="info">{tx(ar, "Match", "مطابق")}</Pill>}</label></li>)}
        {!shown.length && <li className="ek-noe-none">{tx(ar, "Nothing found — create a new one instead.", "لا نتائج — أنشئ سجلًا جديدًا بدلًا من ذلك.")}</li>}</ul>
    </>}
  </fieldset>;
}

/* ------------------------------------------------------------------ duplicate banner ------------------------------------------------------------------ */
export interface DupMatch { key: string; title: string; sub?: string | undefined; on: string[]; kind: string }
export function DupBanner({ matches, ar, onOpen, onMerge, onContinue, continued }: { matches: DupMatch[]; ar: boolean; onOpen: (m: DupMatch) => void; onMerge?: ((m: DupMatch) => void) | undefined; onContinue: (reason: string) => void; continued?: string | undefined }) {
  const [why, setWhy] = useState(""); const [ask, setAsk] = useState(false);
  if (!matches.length) return null;
  const m = matches[0]!;
  return <div className="ek-dup" role="status" data-dup={matches.length} data-dup-continued={continued ? "" : undefined}>
    <p className="ek-dup-h">⚠ {tx(ar, "A similar record exists", "يوجد سجل مشابه")}{matches.length > 1 && <span> · {tx(ar, `${matches.length} matches`, `${matches.length} تطابقات`)}</span>}</p>
    <div className="ek-dup-card"><Avatar name={m.title} size={40} /><div className="min-w-0 flex-1"><b data-no-i18n>{m.title}</b><small>{m.kind}{m.sub ? <> · <bdi data-no-i18n>{m.sub}</bdi></> : null}</small>
      <small className="ek-dup-on">{tx(ar, "Same", "نفس")}: {m.on.join("، ")}</small></div></div>
    {continued ? <p className="ek-dup-ok" data-dup-reason>{tx(ar, "Continuing anyway — reason recorded", "متابعة على أي حال — سُجّل السبب")}: <bdi data-no-i18n>{continued}</bdi></p>
      : <div className="ek-dup-acts">
        <button type="button" className="btn-secondary" onClick={() => onOpen(m)} data-dup-open>{tx(ar, "Open", "فتح")}</button>
        {onMerge && <button type="button" className="btn-secondary" onClick={() => onMerge(m)} data-dup-merge>{tx(ar, "Merge", "دمج")}</button>}
        {!ask ? <button type="button" className="btn-ghost" onClick={() => setAsk(true)} data-dup-continue>{tx(ar, "Continue anyway", "متابعة على أي حال")}</button>
          : <span className="ek-dup-why"><input className="field-input min-h-9 text-sm" autoFocus value={why} onChange={(e) => setWhy(e.target.value)} placeholder={tx(ar, "Why is it a different record?", "لماذا هو سجل مختلف؟")} data-dup-why />
            <button type="button" className="btn-primary" disabled={!why.trim()} onClick={() => onContinue(why.trim())} data-dup-confirm>{tx(ar, "Continue", "متابعة")}</button></span>}
      </div>}
  </div>;
}
