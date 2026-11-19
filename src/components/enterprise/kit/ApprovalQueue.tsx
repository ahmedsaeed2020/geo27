/**
 * Enterprise approval queue pieces (Construction phase 4 C4-04) — app-agnostic: apps pass the statuses, who may
 * decide and how a decision is applied; these components only draw and collect.
 *  - StatePill       one status with its meaning tone; approval / payment / payout are separate columns, never merged
 *  - MinePill        «بانتظار اعتمادك», drawn only when the session user is the current approver
 *  - DecisionMenu    «اعتمد» plus a menu «رفض» / «طلب تعديل» — only the decisions the user has on the document
 *  - ApprovalDrawer  the decision drawer: decision, comment (required to reject or ask for changes), attachment drop zone
 *  - BulkBar         the selection bar of the «تحتاج مراجعة» tab (approve the selected rows together)
 *  - MiniDistBar     a slim per-row distribution bar with the same segments and hues as DistributionBar
 */
import { useEffect, useRef, useState, type DragEvent, type ReactNode } from "react";
import { EntDrawer, EntPopover } from "../Surfaces";
import { segmentShares, type DistSegment } from "./DistributionBar";

export type PillTone = "neutral" | "info" | "warn" | "ok" | "bad" | "accent";
export interface PillState { key: string; label: string; tone: PillTone; hint?: string | undefined }
export type QueueDecision = "approve" | "reject" | "changes";
export interface QueueCan { approve?: boolean | undefined; reject?: boolean | undefined; changes?: boolean | undefined }

const tx = (ar: boolean, en: string, a: string) => (ar ? a : en);

export function StatePill({ s, attrs }: { s: PillState; attrs?: Record<string, string> | undefined }) {
  return <span className="ek-pill" data-tone={s.tone} title={s.hint} data-state-pill={s.key} {...(s.label.length > 12 ? { "data-long": "" } : {})} {...attrs}>{s.label}</span>;
}
export function MinePill({ ar }: { ar: boolean }) {
  return <span className="ek-pill ek-pill-mine" data-tone="accent" data-mine-pill data-long>{tx(ar, "Awaiting your approval", "بانتظار اعتمادك")}</span>;
}

/** «اعتمد» + ▾ menu (رفض / طلب تعديل); a document with no approve keeps only the menu. */
export function DecisionMenu({ can, ar, onPick, id }: { can: QueueCan; ar: boolean; onPick: (d: QueueDecision) => void; id: string }) {
  const [open, setOpen] = useState(false);
  const more = !!(can.reject || can.changes);
  if (!can.approve && !more) return null;
  return (
    <span className="ek-dmenu" data-decision-menu={id}>
      {can.approve && <button type="button" className="ek-dmenu-main" onClick={() => onPick("approve")} data-decide="approve">{tx(ar, "Approve", "اعتمد")}</button>}
      {more && <EntPopover open={open} onOpenChange={setOpen} align="end" width={190}
        trigger={<button type="button" className="ek-dmenu-more" aria-label={tx(ar, "More decisions", "قرارات أخرى")} aria-haspopup="menu" data-decide-more>{can.approve ? "▾" : <>{tx(ar, "Decide", "قرار")} ▾</>}</button>}>
        <div role="menu" className="ek-dmenu-list">
          {can.reject && <button type="button" role="menuitem" className="ek-dmenu-item" data-tone="bad" onClick={() => { setOpen(false); onPick("reject"); }} data-decide="reject">{tx(ar, "Reject", "رفض")}</button>}
          {can.changes && <button type="button" role="menuitem" className="ek-dmenu-item" onClick={() => { setOpen(false); onPick("changes"); }} data-decide="changes">{tx(ar, "Request changes", "طلب تعديل")}</button>}
        </div>
      </EntPopover>}
    </span>
  );
}

export interface DrawerResult { errors: string[] }
/**
 * The decision drawer. `can` limits the decisions offered; a comment is required to reject or ask for changes; files
 * dropped or picked are passed to `onConfirm` (the app stores them as attachments of the document).
 */
export function ApprovalDrawer({ open, onOpenChange, ar, title, summary, can, initial = "approve", onConfirm, count = 1 }: {
  open: boolean; onOpenChange: (o: boolean) => void; ar: boolean; title: ReactNode; summary?: ReactNode; can: QueueCan; initial?: QueueDecision;
  onConfirm: (d: QueueDecision, comment: string, files: File[]) => string[]; count?: number;
}) {
  const [d, setD] = useState<QueueDecision>(initial);
  const [note, setNote] = useState(""); const [files, setFiles] = useState<File[]>([]); const [over, setOver] = useState(false); const [errs, setErrs] = useState<string[]>([]);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { if (open) { setD(initial); setNote(""); setFiles([]); setErrs([]); } }, [open, initial]);
  const needNote = d === "reject" || d === "changes";
  const ok = !needNote || !!note.trim();
  // copy the list first: clearing the input empties the live FileList before a state updater would read it
  const add = (fl: FileList | null) => { const got = fl ? Array.from(fl) : []; if (got.length) setFiles((x) => [...x, ...got.filter((f) => !x.some((y) => y.name === f.name && y.size === f.size))]); };
  const drop = (e: DragEvent) => { e.preventDefault(); setOver(false); add(e.dataTransfer.files); };
  const opts: [QueueDecision, string, string][] = [["approve", "Approve", "اعتمد"], ["reject", "Reject", "رفض"], ["changes", "Request changes", "طلب تعديل"]];
  const confirm = () => { if (!ok) return; const r = onConfirm(d, note.trim(), files); if (r.length) setErrs(r); else onOpenChange(false); };
  return (
    <EntDrawer open={open} onOpenChange={onOpenChange} title={title} kicker={count > 1 ? tx(ar, `${count} documents`, `${count} مستندات`) : tx(ar, "Decision", "القرار")} id="approval-drawer"
      footer={<div className="flex flex-wrap items-center gap-2">
        <button type="button" className="btn-primary" data-tone={d === "reject" ? "bad" : undefined} disabled={!ok} onClick={confirm} data-approval-confirm={d}>{d === "approve" ? (count > 1 ? tx(ar, `Approve ${count}`, `اعتمد ${count}`) : tx(ar, "Approve", "اعتمد")) : d === "reject" ? tx(ar, "Reject", "رفض") : tx(ar, "Send change request", "أرسل طلب التعديل")}</button>
        <button type="button" className="btn-ghost" onClick={() => onOpenChange(false)}>{tx(ar, "Cancel", "إلغاء")}</button>
      </div>}>
      <div className="grid gap-3" data-approval-drawer={d}>
        {summary}
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={tx(ar, "Decision", "القرار")}>
          {opts.filter(([k]) => can[k]).map(([k, en, a]) => <button key={k} type="button" role="radio" aria-checked={d === k} className="ek-seg" data-active={d === k || undefined} data-tone={k === "reject" ? "bad" : k === "changes" ? "warn" : "ok"} onClick={() => setD(k)} data-approval-pick={k}>{tx(ar, en, a)}</button>)}
        </div>
        <label className="grid gap-1 text-sm"><span className="font-medium">{tx(ar, "Comment", "التعليق")}{needNote ? <span className="text-destructive"> *</span> : <span className="text-muted-foreground"> ({tx(ar, "optional", "اختياري")})</span>}</span>
          <textarea className="field-input" rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder={d === "reject" ? tx(ar, "Why is it rejected?", "سبب الرفض") : d === "changes" ? tx(ar, "What should change?", "ما المطلوب تعديله؟") : tx(ar, "A note for the record", "ملاحظة تُحفظ مع المستند")} data-approval-note /></label>
        <div className="ek-drop" data-over={over || undefined} onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={drop} data-approval-drop>
          <p className="text-sm font-medium">{tx(ar, "Drop files here", "أسقط الملفات هنا")}</p>
          <p className="text-xs text-muted-foreground">{tx(ar, "or", "أو")} <button type="button" className="text-primary underline" onClick={() => input.current?.click()} data-approval-browse>{tx(ar, "choose files", "اختر ملفات")}</button> — {tx(ar, "attached to the document with your decision", "تُرفق بالمستند مع قرارك")}</p>
          <input ref={input} type="file" multiple className="sr-only" tabIndex={-1} aria-label={tx(ar, "Attachments", "المرفقات")} onChange={(e) => { add(e.target.files); e.target.value = ""; }} data-approval-file />
        </div>
        {files.length > 0 && <ul className="grid gap-1 text-xs" data-approval-files={files.length}>{files.map((f, i) => <li key={`${f.name}:${i}`} className="flex items-center justify-between gap-2 rounded-md border border-border px-2 py-1"><bdi data-no-i18n>{f.name}</bdi><button type="button" className="text-muted-foreground hover:text-destructive" aria-label={tx(ar, `Remove ${f.name}`, `إزالة ${f.name}`)} onClick={() => setFiles((x) => x.filter((_, j) => j !== i))}>✕</button></li>)}</ul>}
        {errs.length > 0 && <ul className="grid gap-1 rounded-md bg-destructive/10 p-2 text-xs text-destructive" role="alert" data-approval-errors>{errs.map((e, i) => <li key={i}>{e}</li>)}</ul>}
      </div>
    </EntDrawer>
  );
}

/** Selection bar of the review tab: count, select all, approve selected, clear. */
export function BulkBar({ count, total, ar, onAll, onClear, onApprove }: { count: number; total: number; ar: boolean; onAll: () => void; onClear: () => void; onApprove: () => void }) {
  return (
    <div className="ek-bulk" role="toolbar" aria-label={tx(ar, "Selected documents", "المستندات المحددة")} data-bulk-bar={count}>
      <span className="font-semibold tabular-nums" data-no-i18n>{count}</span><span>{tx(ar, `of ${total} selected`, `من ${total} محدد`)}</span>
      {count < total && <button type="button" className="btn-ghost min-h-9 text-xs" onClick={onAll} data-bulk-all>{tx(ar, "Select all", "تحديد الكل")}</button>}
      {count > 0 && <button type="button" className="btn-ghost min-h-9 text-xs" onClick={onClear} data-bulk-clear>{tx(ar, "Clear", "إلغاء التحديد")}</button>}
      <button type="button" className="btn-primary ms-auto min-h-9 text-xs" disabled={!count} onClick={onApprove} data-bulk-approve>{tx(ar, `Approve selected (${count})`, `اعتمد المحدد (${count})`)}</button>
    </div>
  );
}

/** A slim distribution bar for one list row (tooltip per segment; the legend is shown once above the list). */
export function MiniDistBar({ segments, attrs }: { segments: DistSegment[]; attrs?: Record<string, string> | undefined }) {
  const shares = segmentShares(segments);
  const label = segments.map((s, i) => `${s.label} ${s.display ?? s.value} (${Math.round((shares[i] ?? 0) * 100)}%)`).join(" · ");
  if (!shares.some((x) => x > 0)) return <span className="ek-mini-dist" data-empty role="img" aria-label={label} title={label} {...attrs} />;
  return (
    <span className="ek-mini-dist" role="img" aria-label={label} title={label} {...attrs}>
      {segments.map((s, i) => (shares[i] ?? 0) > 0 && <span key={s.key} data-dist-seg={s.key} style={{ width: `${(shares[i] ?? 0) * 100}%`, background: `var(--${s.hue ?? "emerald"})` }} />)}
    </span>
  );
}
/** The legend of the mini bars (once above the list). */
export function MiniDistLegend({ segments }: { segments: Pick<DistSegment, "key" | "label" | "hue">[] }) {
  return <span className="ek-mini-legend" data-mini-legend>{segments.map((s) => <span key={s.key} className="inline-flex items-center gap-1"><span className="inline-block size-2 rounded-full" style={{ background: `var(--${s.hue ?? "emerald"})` }} aria-hidden />{s.label}</span>)}</span>;
}
