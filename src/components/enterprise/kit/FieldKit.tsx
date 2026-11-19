/**
 * Enterprise field pieces (owner FSM round F4, 2026-11-18) — app-agnostic, display + collection only; apps pass figures,
 * labels and callbacks and apply every change through their own services:
 *  - StepBar      a progress bar of a short step journey («الخطوة 3 من 7») with tappable step chips (done / current / todo).
 *  - ThumbBar     a bar stuck to the bottom of the screen for one-handed use (back / next / main action).
 *  - DayStops     an ordered day plan: time, title, sub line, distance from the previous stop, state chip, open action.
 *  - SignaturePad a finger / mouse signature canvas that hands back a PNG data URL (and «مسح» to clear).
 *  - FlowBar      requested → issued → used → returned per line with a red difference flag.
 *  - HoursBar     booked vs logged vs approved hours for one person or job.
 *  - SyncChip / OfflineBanner  sync state of a captured action (pending / synced / conflict / discarded) and the offline band.
 *  - StockCard    a stock card (van) with quantity, value, pending usage and low-stock marks.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";

const tx = (ar: boolean, en: string, a: string) => (ar ? a : en);
const nf = (n: number, d = 0) => new Intl.NumberFormat("en-US", { maximumFractionDigits: d, minimumFractionDigits: 0 }).format(n);

// ---------------------------------------------------------------- StepBar
export interface JourneyStep { key: string; label: string; done?: boolean | undefined; warn?: boolean | undefined }
export function StepBar({ steps, current, onPick, ar, title }: { steps: JourneyStep[]; current: number; onPick?: ((key: string) => void) | undefined; ar: boolean; title?: ReactNode }) {
  const done = steps.filter((s) => s.done).length; const pct = steps.length ? Math.round((done / steps.length) * 100) : 0; const cur = steps[current];
  return (
    <section className="ek-fk-steps" data-step-bar data-step={cur?.key ?? ""} data-step-done={done} data-step-total={steps.length}>
      <header className="ek-fk-steps-h">
        <span className="ek-fk-steps-t">{title ?? tx(ar, `Step ${current + 1} of ${steps.length}`, `الخطوة ${current + 1} من ${steps.length}`)}{cur ? <> · <b>{cur.label}</b></> : null}</span>
        <span className="ek-fk-steps-p" data-no-i18n>{pct}%</span>
      </header>
      <div className="ek-fk-steps-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label={tx(ar, "Journey progress", "تقدم الرحلة")}><span style={{ width: `${pct}%` }} /></div>
      <ol className="ek-fk-steps-l">
        {steps.map((s, i) => (
          <li key={s.key}>
            <button type="button" className="ek-fk-step" onClick={() => onPick?.(s.key)} data-on={i === current || undefined} data-done={s.done || undefined} data-warn={s.warn || undefined} aria-current={i === current ? "step" : undefined} data-step-chip={s.key}>
              <span className="ek-fk-step-n" data-no-i18n>{s.done ? "✓" : i + 1}</span><span className="ek-fk-step-l">{s.label}</span>
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
}

// ---------------------------------------------------------------- ThumbBar
export function ThumbBar({ children, note }: { children: ReactNode; note?: ReactNode }) {
  return <div className="ek-fk-thumb" data-thumb-bar>{note && <p className="ek-fk-thumb-n">{note}</p>}<div className="ek-fk-thumb-b">{children}</div></div>;
}

// ---------------------------------------------------------------- DayStops
export type StopTone = "ok" | "warn" | "bad" | "info" | "neutral";
export interface DayStop { key: string; time: string; until?: string | undefined; title: ReactNode; sub?: ReactNode; km?: number | null | undefined; state: ReactNode; tone?: StopTone | undefined; badge?: ReactNode; open: ReactNode }
export function DayStops({ stops, ar, empty }: { stops: DayStop[]; ar: boolean; empty?: ReactNode }) {
  if (!stops.length) return <p className="ek-fk-empty">{empty ?? tx(ar, "No visits on this day.", "لا زيارات في هذا اليوم.")}</p>;
  return (
    <ol className="ek-fk-stops" data-day-stops={stops.length}>
      {stops.map((s, i) => (
        <li key={s.key} className="ek-fk-stop" data-tone={s.tone ?? "neutral"} data-stop={s.key}>
          <span className="ek-fk-stop-i" data-no-i18n>{i + 1}</span>
          <div className="ek-fk-stop-b">
            <p className="ek-fk-stop-t"><bdi className="ek-fk-stop-time" dir="ltr" data-no-i18n>{s.time}{s.until ? `–${s.until}` : ""}</bdi><b>{s.title}</b></p>
            {s.sub && <p className="ek-fk-stop-s">{s.sub}</p>}
            <p className="ek-fk-stop-m">
              <span className="ek-fk-stop-km">{s.km === null || s.km === undefined ? tx(ar, "First stop", "أول زيارة") : <><span data-no-i18n>{nf(s.km, 1)}</span> {tx(ar, "km from the previous stop", "كم من الزيارة السابقة")}</>}</span>
              <span className="ek-fk-stop-st" data-tone={s.tone ?? "neutral"}>{s.state}</span>{s.badge}
            </p>
          </div>
          <div className="ek-fk-stop-o">{s.open}</div>
        </li>
      ))}
    </ol>
  );
}

// ---------------------------------------------------------------- SignaturePad
export function SignaturePad({ value, onChange, disabled, ar, label }: { value?: string | undefined; onChange: (dataUrl: string | null) => void; disabled?: boolean | undefined; ar: boolean; label?: string | undefined }) {
  const ref = useRef<HTMLCanvasElement>(null); const drawing = useRef(false); const dirty = useRef(false); const [has, setHas] = useState(!!value);
  useEffect(() => {
    const c = ref.current; if (!c) return; const ctx = c.getContext("2d"); if (!ctx) return;
    const r = c.getBoundingClientRect(); const dpr = window.devicePixelRatio || 1; c.width = Math.max(1, Math.round(r.width * dpr)); c.height = Math.max(1, Math.round(r.height * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.lineWidth = 2.4; ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.strokeStyle = getComputedStyle(c).color || "currentColor";
    if (value) { const img = new Image(); img.onload = () => ctx.drawImage(img, 0, 0, r.width, r.height); img.src = value; }
  }, [value]);
  const pos = (e: React.PointerEvent<HTMLCanvasElement>) => { const r = e.currentTarget.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top] as const; };
  const down = (e: React.PointerEvent<HTMLCanvasElement>) => { if (disabled) return; e.currentTarget.setPointerCapture(e.pointerId); drawing.current = true; const ctx = e.currentTarget.getContext("2d"); const [x, y] = pos(e); ctx?.beginPath(); ctx?.moveTo(x, y); };
  const move = (e: React.PointerEvent<HTMLCanvasElement>) => { if (!drawing.current) return; const ctx = e.currentTarget.getContext("2d"); const [x, y] = pos(e); ctx?.lineTo(x, y); ctx?.stroke(); dirty.current = true; };
  const up = () => { if (!drawing.current) return; drawing.current = false; if (dirty.current && ref.current) { setHas(true); onChange(ref.current.toDataURL("image/png")); } };
  const clear = () => { const c = ref.current; const ctx = c?.getContext("2d"); if (c && ctx) { ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, c.width, c.height); ctx.restore(); } dirty.current = false; setHas(false); onChange(null); };
  return (
    <div className="ek-fk-sig" data-signature-pad data-signed={has || undefined}>
      <canvas ref={ref} className="ek-fk-sig-c" aria-label={label ?? tx(ar, "Signature area — sign with your finger", "مساحة التوقيع — وقّع بإصبعك")} role="img"
        onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerLeave={up} data-disabled={disabled || undefined} />
      {!has && <span className="ek-fk-sig-h" aria-hidden>{tx(ar, "Sign here", "وقّع هنا")}</span>}
      {!disabled && <button type="button" className="ek-fk-sig-x" onClick={clear} data-signature-clear>{tx(ar, "Clear", "مسح")}</button>}
    </div>
  );
}

// ---------------------------------------------------------------- FlowBar
export interface FlowStep { key: string; label: string; value: number; display?: string | undefined; pending?: number | undefined }
export function FlowBar({ title, sub, steps, flag, link, ar }: { title: ReactNode; sub?: ReactNode; steps: FlowStep[]; flag?: { tone: "bad" | "warn" | "ok"; label: ReactNode } | undefined; link?: ReactNode; ar: boolean }) {
  const max = Math.max(1, ...steps.map((s) => s.value + (s.pending ?? 0)));
  return (
    <div className="ek-fk-flow" data-flow-bar data-flag={flag?.tone}>
      <div className="ek-fk-flow-h"><span className="ek-fk-flow-t">{title}{sub && <small>{sub}</small>}</span>{flag && <span className="ek-fk-flag" data-tone={flag.tone}>{flag.label}</span>}{link}</div>
      <ol className="ek-fk-flow-s" aria-label={tx(ar, "Requested → issued → used → returned", "مطلوب ← مصروف ← مستخدم ← مرتجع")}>
        {steps.map((s, i) => (
          <li key={s.key} data-flow-step={s.key}>
            <span className="ek-fk-flow-l">{i > 0 && <span className="ek-fk-flow-arrow" aria-hidden>{ar ? "←" : "→"}</span>}{s.label}</span>
            <span className="ek-fk-flow-track"><span className="ek-fk-flow-fill" data-k={s.key} style={{ width: `${(s.value / max) * 100}%` }} />{(s.pending ?? 0) > 0 && <span className="ek-fk-flow-pend" style={{ width: `${((s.pending ?? 0) / max) * 100}%` }} />}</span>
            <b className="ek-fk-flow-v" data-no-i18n>{s.display ?? nf(s.value, 1)}{(s.pending ?? 0) > 0 ? <small> +{nf(s.pending ?? 0, 1)}</small> : null}</b>
          </li>
        ))}
      </ol>
    </div>
  );
}

// ---------------------------------------------------------------- HoursBar
export function HoursBar({ label, sub, booked, logged, approved, ar, link, unit }: { label: ReactNode; sub?: ReactNode; booked: number; logged: number; approved: number; ar: boolean; link?: ReactNode; unit?: string | undefined }) {
  const max = Math.max(booked, logged, approved, 0.01); const w = (v: number) => `${(Math.max(0, v) / max) * 100}%`;
  const pending = Math.max(0, logged - approved); const over = booked > 0 && logged > booked * 1.1;
  const u = unit ?? tx(ar, "h", "س");
  return (
    <div className="ek-fk-hrs" data-hours-bar data-over={over || undefined} data-pending={pending > 0 || undefined}>
      <div className="ek-fk-hrs-h"><span className="ek-fk-hrs-t">{label}{sub && <small>{sub}</small>}</span>{link}</div>
      <div className="ek-fk-hrs-track" role="img" aria-label={tx(ar, `Approved ${nf(approved, 1)} of ${nf(booked, 1)} booked hours`, `معتمد ${nf(approved, 1)} من ${nf(booked, 1)} ساعة محجوزة`)}>
        <span className="ek-fk-hrs-book" style={{ width: w(booked) }} /><span className="ek-fk-hrs-log" style={{ width: w(logged) }} /><span className="ek-fk-hrs-ok" style={{ width: w(approved) }} />
      </div>
      <p className="ek-fk-hrs-k">
        <span data-k="book">{tx(ar, "Booked", "محجوزة")} <b data-no-i18n>{nf(booked, 1)}</b> {u}</span>
        <span data-k="log">{tx(ar, "Logged", "مسجلة")} <b data-no-i18n>{nf(logged, 1)}</b> {u}</span>
        <span data-k="ok">{tx(ar, "Approved", "معتمدة")} <b data-no-i18n>{nf(approved, 1)}</b> {u}</span>
        {pending > 0 && <span data-k="pend">{tx(ar, "Awaiting approval", "بانتظار الاعتماد")} <b data-no-i18n>{nf(pending, 1)}</b> {u}</span>}
        {over && <span data-k="over">{tx(ar, "More than booked", "أكثر من المحجوز")}</span>}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------- sync
export type SyncState = "pending" | "synced" | "conflict" | "discarded";
const SYNC: Record<SyncState, [string, string]> = { pending: ["Waiting to sync", "بانتظار المزامنة"], synced: ["Synced", "تمت المزامنة"], conflict: ["Conflict", "تعارض"], discarded: ["Discarded", "مستبعد"] };
export function SyncChip({ state, ar }: { state: SyncState; ar: boolean }) { return <span className="ek-fk-sync" data-sync={state}>{tx(ar, SYNC[state][0], SYNC[state][1])}</span>; }
export function OfflineBanner({ offline, pending, conflicts, onToggle, onSync, ar, queue }: { offline: boolean; pending: number; conflicts: number; onToggle: () => void; onSync: () => void; ar: boolean; queue?: ReactNode }) {
  return (
    <section className="ek-fk-off" data-offline-banner data-offline={offline || undefined} role="status">
      <span className="ek-fk-off-dot" aria-hidden />
      <p className="ek-fk-off-t"><b>{offline ? tx(ar, "Working offline", "تعمل دون اتصال") : tx(ar, "Online", "متصل")}</b>
        <span>{offline ? tx(ar, "Every step is kept on this device and sent when you sync.", "كل خطوة تُحفظ على هذا الجهاز وتُرسل عند المزامنة.") : tx(ar, "Steps are saved straight away.", "الخطوات تُحفظ فوراً.")}</span>
        {(pending > 0 || conflicts > 0) && <span className="ek-fk-off-c"><span data-no-i18n>{pending}</span> {tx(ar, "waiting", "بانتظار المزامنة")}{conflicts > 0 && <> · <span data-no-i18n>{conflicts}</span> {tx(ar, "in conflict", "تعارض")}</>}</span>}
      </p>
      <div className="ek-fk-off-a">
        {queue}
        {pending > 0 && !offline && <button type="button" className="ek-fk-btn" data-tone="primary" onClick={onSync} data-sync-now>{tx(ar, "Sync now", "مزامنة الآن")}</button>}
        <button type="button" className="ek-fk-btn" onClick={onToggle} data-offline-toggle aria-pressed={offline}>{offline ? tx(ar, "Back online", "العودة للاتصال") : tx(ar, "Work offline", "العمل دون اتصال")}</button>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- StockCard
export interface StockLine { key: string; label: ReactNode; qty: number; unit?: string | undefined; value?: string | undefined; pending?: number | undefined; low?: boolean | undefined; action?: ReactNode }
export function StockCard({ title, sub, lines, total, ar, link, empty }: { title: ReactNode; sub?: ReactNode; lines: StockLine[]; total?: ReactNode; ar: boolean; link?: ReactNode; empty?: ReactNode }) {
  return (
    <section className="ek-fk-stock" data-stock-card data-low={lines.filter((l) => l.low).length || undefined}>
      <header className="ek-fk-stock-h"><span className="ek-fk-stock-ic" aria-hidden>🚐</span><span className="ek-fk-stock-t"><b>{title}</b>{sub && <small>{sub}</small>}</span>{link}</header>
      {lines.length ? <ul className="ek-fk-stock-l">
        {lines.map((l) => (
          <li key={l.key} data-low={l.low || undefined} data-stock-line={l.key}>
            <span className="ek-fk-stock-n">{l.label}{l.low && <em>{tx(ar, "Low", "منخفض")}</em>}</span>
            <b className="ek-fk-stock-q" data-no-i18n>{nf(l.qty, 1)}{l.unit ? <small> {l.unit}</small> : null}</b>
            {(l.pending ?? 0) > 0 && <span className="ek-fk-stock-p">{tx(ar, "pending", "بانتظار")} <span data-no-i18n>{nf(l.pending ?? 0, 1)}</span></span>}
            {l.value && <span className="ek-fk-stock-v" data-no-i18n>{l.value}</span>}
            {l.action}
          </li>
        ))}
      </ul> : <p className="ek-fk-empty">{empty ?? tx(ar, "Nothing in stock.", "لا رصيد.")}</p>}
      {total && <footer className="ek-fk-stock-f">{total}</footer>}
    </section>
  );
}
