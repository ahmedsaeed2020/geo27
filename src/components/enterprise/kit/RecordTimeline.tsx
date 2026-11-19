/**
 * Enterprise activity timeline + composer (CRM C4 C-04 / C-05 / D-07, owner 2026-11-17), shared by every record frame.
 *  - Timeline: type tabs with counts (all · notes · email · calls · WhatsApp · tasks · meetings · changes), the pinned
 *    «المطلوب الآن / متأخر» block on top (overdue in red), pinned items, then history by month; a field-change item reads
 *    «غيّر X و3 حقول أخرى» and expands to old → new; any item takes comments and a pin.
 *  - Composer at the top: note / call log (direction, outcome, duration) / email / WhatsApp template / task with due date /
 *    meeting. Sending is the host's job — the host records the message (sandbox: nothing leaves the app).
 * Apps pass items and callbacks; nothing here reads or writes records.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";

const tx = (ar: boolean, en: string, a: string) => (ar ? a : en);
export type TlKind = "note" | "email" | "call" | "whatsapp" | "task" | "meeting" | "change" | "system";
export interface TlChange { label: string; from: string; to: string }
export interface TlComment { key: string; who: string; at: string; text: string }
export interface TlItem { id: string; kind: TlKind; at: string; title: ReactNode; body?: ReactNode; who?: string | undefined; tone?: "bad" | "warn" | "ok" | undefined; changes?: TlChange[] | undefined; comments?: TlComment[] | undefined; pinned?: boolean | undefined; meta?: ReactNode; sandbox?: boolean | undefined }
const ICON: Record<TlKind, string> = { note: "✎", email: "✉", call: "☎", whatsapp: "◉", task: "☑", meeting: "◷", change: "↻", system: "★" };
const TABS: [TlKind | "all", string, string][] = [["all", "All", "الكل"], ["note", "Notes", "ملاحظات"], ["email", "Email", "بريد"], ["call", "Calls", "مكالمات"], ["whatsapp", "WhatsApp", "واتساب"], ["task", "Tasks", "مهام"], ["meeting", "Meetings", "اجتماعات"], ["change", "Change log", "سجل التغييرات"]];
const monthOf = (at: string, ar: boolean) => { const d = new Date(at); return Number.isFinite(d.getTime()) ? d.toLocaleDateString(ar ? "ar-SA-u-ca-gregory-nu-latn" : "en-GB", { month: "long", year: "numeric" }) : "—"; };

function Item({ it, ar, when, onComment, onPin }: { it: TlItem; ar: boolean; when: (at: string) => string; onComment?: ((id: string, text: string) => void) | undefined; onPin?: ((id: string, on: boolean) => void) | undefined }) {
  const [open, setOpen] = useState(false); const [c, setC] = useState(""); const [reply, setReply] = useState(false);
  const many = (it.changes?.length ?? 0) > 1;
  return <li className="ek-tl-i" data-kind={it.kind} data-tone={it.tone} data-pinned={it.pinned || undefined} data-tl-item={it.id}>
    <span className="ek-tl-ic" aria-hidden>{ICON[it.kind]}</span>
    <div className="min-w-0 flex-1">
      <p className="ek-tl-t">{it.title}{it.sandbox && <span className="ek-tl-sb" data-tl-sandbox>{tx(ar, "Sandbox — not sent", "تجريبي — لم يُرسل")}</span>}</p>
      <p className="ek-tl-w">{it.who && <bdi data-no-i18n>{it.who}</bdi>}{it.who ? " · " : ""}<bdi data-no-i18n>{when(it.at)}</bdi>{it.meta && <> · {it.meta}</>}</p>
      {it.body && <div className="ek-tl-b">{it.body}</div>}
      {it.changes && it.changes.length > 0 && (many ? <>
        <button type="button" className="ek-rl-link" aria-expanded={open} onClick={() => setOpen((x) => !x)} data-tl-expand={it.id}>{open ? tx(ar, "Hide the changes", "إخفاء التغييرات") : tx(ar, "Show old → new", "عرض القديم ← الجديد")}</button>
        {open && <ul className="ek-tl-ch">{it.changes.map((x, i) => <li key={i}><b>{x.label}</b> <s data-no-i18n>{x.from || "—"}</s> <span aria-hidden className="rtl:-scale-x-100 inline-block">→</span> <bdi data-no-i18n>{x.to || "—"}</bdi></li>)}</ul>}
      </> : <ul className="ek-tl-ch">{it.changes.map((x, i) => <li key={i}><s data-no-i18n>{x.from || "—"}</s> <span aria-hidden className="rtl:-scale-x-100 inline-block">→</span> <bdi data-no-i18n>{x.to || "—"}</bdi></li>)}</ul>)}
      {it.comments && it.comments.length > 0 && <ul className="ek-tl-cm" data-tl-comments={it.comments.length}>{it.comments.map((x) => <li key={x.key}><b data-no-i18n>{x.who}</b> <small data-no-i18n>{when(x.at)}</small><p data-no-i18n>{x.text}</p></li>)}</ul>}
      {(onComment || onPin) && <div className="ek-tl-acts">
        {onComment && (!reply ? <button type="button" className="ek-rl-link" onClick={() => setReply(true)} data-tl-comment={it.id}>{tx(ar, "Comment", "تعليق")}</button>
          : <span className="ek-tl-reply"><input className="field-input min-h-8 text-xs" autoFocus value={c} onChange={(e) => setC(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && c.trim()) { onComment(it.id, c.trim()); setC(""); setReply(false); } if (e.key === "Escape") setReply(false); }} placeholder={tx(ar, "Write a comment", "اكتب تعليقًا")} data-tl-comment-input={it.id} />
            <button type="button" className="ek-rl-link" disabled={!c.trim()} onClick={() => { onComment(it.id, c.trim()); setC(""); setReply(false); }} data-tl-comment-save={it.id}>{tx(ar, "Add", "إضافة")}</button></span>)}
        {onPin && <button type="button" className="ek-rl-link" aria-pressed={!!it.pinned} onClick={() => onPin(it.id, !it.pinned)} data-tl-pin={it.id}>{it.pinned ? tx(ar, "Unpin", "إلغاء التثبيت") : tx(ar, "Pin", "تثبيت")}</button>}
      </div>}
    </div>
  </li>;
}

export function Timeline({ items, now, ar, when, onComment, onPin, empty }: { items: TlItem[]; now: TlItem[]; ar: boolean; when: (at: string) => string; onComment?: ((id: string, text: string) => void) | undefined; onPin?: ((id: string, on: boolean) => void) | undefined; empty?: ReactNode }) {
  const [tab, setTab] = useState<TlKind | "all">("all");
  const count = (k: TlKind | "all") => (k === "all" ? items.length : items.filter((i) => i.kind === k).length);
  const shown = items.filter((i) => tab === "all" || i.kind === tab);
  const pinned = shown.filter((i) => i.pinned);
  const months = new Map<string, TlItem[]>(); for (const i of shown.filter((x) => !x.pinned)) { const m = monthOf(i.at, ar); months.set(m, [...(months.get(m) ?? []), i]); }
  return <div className="ek-tl" data-tl={items.length}>
    <div className="ek-tl-tabs" role="tablist" aria-label={tx(ar, "Activity types", "أنواع النشاط")}>{TABS.map(([k, en, a]) => <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)} data-tl-tab={k}>{tx(ar, en, a)} <bdi className="tabular-nums" data-no-i18n>{count(k)}</bdi></button>)}</div>
    {now.length > 0 && <section className="ek-tl-now" data-tl-now={now.length}><h4>{tx(ar, "Due now / overdue", "المطلوب الآن / متأخر")}</h4><ul>{now.map((i) => <Item key={i.id} it={i} ar={ar} when={when} />)}</ul></section>}
    {pinned.length > 0 && <section className="ek-tl-month" data-tl-pinned={pinned.length}><h4>{tx(ar, "Pinned", "مثبّت")}</h4><ul>{pinned.map((i) => <Item key={i.id} it={i} ar={ar} when={when} onComment={onComment} onPin={onPin} />)}</ul></section>}
    {[...months.entries()].map(([m, xs]) => <section key={m} className="ek-tl-month" data-tl-month={m}><h4 data-no-i18n>{m}</h4><ul>{xs.map((i) => <Item key={i.id} it={i} ar={ar} when={when} onComment={onComment} onPin={onPin} />)}</ul></section>)}
    {!shown.length && <p className="ek-tl-empty" data-tl-empty>{empty ?? tx(ar, "Nothing recorded yet. Use the composer above to log the first activity.", "لا يوجد نشاط مسجّل بعد. سجّل أول نشاط من مربع الإضافة أعلاه.")}</p>}
  </div>;
}

export type ComposerMode = "note" | "call" | "email" | "whatsapp" | "task" | "meeting";
export type ComposerPayload = { text?: string; direction?: "Outgoing" | "Incoming"; outcome?: string; minutes?: number; to?: string; subject?: string; template?: string; title?: string; due?: string; start?: string };
const MODES: [ComposerMode, string, string, string][] = [["note", "Note", "ملاحظة", "✎"], ["call", "Call log", "مكالمة", "☎"], ["email", "Email", "بريد", "✉"], ["whatsapp", "WhatsApp", "واتساب", "◉"], ["task", "Task", "مهمة", "☑"], ["meeting", "Meeting", "اجتماع", "◷"]];
const localInput = (d: Date) => { const p = (n: number) => String(n).padStart(2, "0"); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; };
export function Composer({ ar, mode, onMode, onSubmit, outcomes, templates, emailTo, phoneTo, disabled, focusKey }: {
  ar: boolean; mode: ComposerMode; onMode: (m: ComposerMode) => void; onSubmit: (m: ComposerMode, p: ComposerPayload) => string | null;
  outcomes: { value: string; label: string }[]; templates: { key: string; label: string; body: string }[]; emailTo: string; phoneTo: string; disabled?: string | undefined; focusKey?: number | undefined;
}) {
  const tomorrow = () => { const d = new Date(Date.now() + 864e5); d.setHours(10, 0, 0, 0); return localInput(d); };
  const [p, setP] = useState<ComposerPayload>({});
  const [err, setErr] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => { setErr(null); setP(mode === "task" ? { due: tomorrow() } : mode === "meeting" ? { start: tomorrow(), minutes: 30 } : mode === "call" ? { direction: "Outgoing", outcome: outcomes[0]?.value ?? "", minutes: 5 } : mode === "email" ? { to: emailTo } : mode === "whatsapp" ? { to: phoneTo, template: templates[0]?.key ?? "", text: templates[0]?.body ?? "" } : {}); }, [mode]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (focusKey) box.current?.querySelector<HTMLElement>("textarea, input")?.focus(); }, [focusKey]);
  const set = (x: Partial<ComposerPayload>) => setP((o) => ({ ...o, ...x }));
  const send = () => { const e = onSubmit(mode, p); if (e) { setErr(e); return; } setErr(null); setP(mode === "task" ? { due: tomorrow() } : mode === "call" ? { direction: "Outgoing", outcome: outcomes[0]?.value ?? "", minutes: 5 } : mode === "email" ? { to: emailTo } : mode === "whatsapp" ? { to: phoneTo, template: templates[0]?.key ?? "", text: templates[0]?.body ?? "" } : mode === "meeting" ? { start: tomorrow(), minutes: 30 } : {}); };
  const L = (en: string, a: string) => tx(ar, en, a);
  return <div className="ek-cmp" ref={box} data-cmp={mode} onKeyDown={(e) => { if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); send(); } }}>
    <div className="ek-cmp-modes" role="tablist" aria-label={L("Log an activity", "تسجيل نشاط")}>{MODES.map(([k, en, a, ic]) => <button key={k} type="button" role="tab" aria-selected={mode === k} onClick={() => onMode(k)} data-cmp-mode={k}><span aria-hidden>{ic}</span> {tx(ar, en, a)}</button>)}</div>
    {disabled ? <p className="ek-cmp-off" data-cmp-off>{disabled}</p> : <div className="ek-cmp-body">
      {mode === "note" && <textarea className="field-input w-full text-sm" rows={3} value={p.text ?? ""} onChange={(e) => set({ text: e.target.value })} placeholder={L("Write a note…", "اكتب ملاحظة…")} data-cmp-text />}
      {mode === "call" && <div className="ek-cmp-grid">
        <label>{L("Direction", "الاتجاه")}<select className="field-input min-h-9 text-sm" value={p.direction ?? "Outgoing"} onChange={(e) => set({ direction: e.target.value as "Outgoing" | "Incoming" })} data-cmp-dir><option value="Outgoing">{L("Outgoing", "صادرة")}</option><option value="Incoming">{L("Incoming", "واردة")}</option></select></label>
        <label>{L("Outcome", "النتيجة")}<select className="field-input min-h-9 text-sm" value={p.outcome ?? ""} onChange={(e) => set({ outcome: e.target.value })} data-cmp-outcome>{outcomes.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select></label>
        <label>{L("Minutes", "المدة بالدقائق")}<input className="field-input min-h-9 text-sm" type="number" min={0} value={p.minutes ?? 0} onChange={(e) => set({ minutes: Number(e.target.value) })} data-cmp-min /></label>
        <textarea className="field-input col-span-full w-full text-sm" rows={2} value={p.text ?? ""} onChange={(e) => set({ text: e.target.value })} placeholder={L("What was said", "ملخص المكالمة")} data-cmp-text />
      </div>}
      {mode === "email" && <div className="ek-cmp-grid">
        <label className="col-span-full">{L("To", "إلى")}<input className="field-input min-h-9 text-sm" dir="ltr" value={p.to ?? ""} onChange={(e) => set({ to: e.target.value })} data-cmp-to /></label>
        <label className="col-span-full">{L("Subject", "الموضوع")}<input className="field-input min-h-9 text-sm" value={p.subject ?? ""} onChange={(e) => set({ subject: e.target.value })} data-cmp-subject /></label>
        <textarea className="field-input col-span-full w-full text-sm" rows={3} value={p.text ?? ""} onChange={(e) => set({ text: e.target.value })} placeholder={L("Message", "نص الرسالة")} data-cmp-text />
      </div>}
      {mode === "whatsapp" && <div className="ek-cmp-grid">
        <label>{L("To", "إلى")}<input className="field-input min-h-9 text-sm" dir="ltr" value={p.to ?? ""} onChange={(e) => set({ to: e.target.value })} data-cmp-to /></label>
        <label>{L("Template", "القالب")}<select className="field-input min-h-9 text-sm" value={p.template ?? ""} onChange={(e) => { const t = templates.find((x) => x.key === e.target.value); set({ template: e.target.value, text: t?.body ?? "" }); }} data-cmp-template>{templates.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}</select></label>
        <textarea className="field-input col-span-full w-full text-sm" rows={3} value={p.text ?? ""} onChange={(e) => set({ text: e.target.value })} data-cmp-text />
      </div>}
      {mode === "task" && <div className="ek-cmp-grid">
        <label className="col-span-full">{L("Task", "المهمة")}<input className="field-input min-h-9 text-sm" value={p.title ?? ""} onChange={(e) => set({ title: e.target.value })} placeholder={L("e.g. Call back about the budget", "مثال: معاودة الاتصال بخصوص الميزانية")} data-cmp-title /></label>
        <label>{L("Due", "الاستحقاق")}<input className="field-input min-h-9 text-sm" type="datetime-local" value={p.due ?? ""} onChange={(e) => set({ due: e.target.value })} data-cmp-due /></label>
      </div>}
      {mode === "meeting" && <div className="ek-cmp-grid">
        <label className="col-span-full">{L("Subject", "الموضوع")}<input className="field-input min-h-9 text-sm" value={p.subject ?? ""} onChange={(e) => set({ subject: e.target.value })} data-cmp-subject /></label>
        <label>{L("Starts", "يبدأ")}<input className="field-input min-h-9 text-sm" type="datetime-local" value={p.start ?? ""} onChange={(e) => set({ start: e.target.value })} data-cmp-start /></label>
        <label>{L("Minutes", "المدة بالدقائق")}<input className="field-input min-h-9 text-sm" type="number" min={15} step={15} value={p.minutes ?? 30} onChange={(e) => set({ minutes: Number(e.target.value) })} data-cmp-min /></label>
      </div>}
      {err && <p className="ek-ff-err" role="alert" data-cmp-err>{err}</p>}
      <div className="ek-cmp-foot">
        {(mode === "email" || mode === "whatsapp") && <small className="ek-cmp-sb">{L("Sandbox: the message is recorded on the timeline; nothing is sent outside the app.", "تجريبي: تُسجّل الرسالة في السجل ولا يُرسل شيء خارج التطبيق.")}</small>}
        <span className="ms-auto" /><small className="ek-cmp-key">Ctrl+Enter</small>
        <button type="button" className="btn-primary" onClick={send} data-cmp-send>{mode === "email" || mode === "whatsapp" ? L("Record (sandbox)", "تسجيل (تجريبي)") : L("Save", "حفظ")}</button>
      </div>
    </div>}
  </div>;
}
