/**
 * One shared date field (owner Final UI Fix Pass §4, 2026-10-19). Drop-in replacement for `<input type="date">`:
 * same props, same events, the stored value stays ISO (yyyy-mm-dd). What the user sees follows System Settings'
 * date format (Saudi default dd-mm-yyyy) with LTR digits in both languages and a translated placeholder
 * ("يوم-شهر-سنة" / "dd-mm-yyyy") instead of the browser's mm/dd/yyyy mask — the way Frappe's own date control shows
 * dates. The calendar button opens the browser's native picker.
 *
 * How it stays a drop-in: every prop (value/defaultValue/onChange/name/min/max/required/disabled…) goes to a real,
 * visually hidden `<input type="date">`, so callers keep reading `e.target.value` (ISO) and forms keep posting ISO.
 * Typing a complete date in the visible box writes the ISO value into that input through the native value setter and
 * fires a bubbling `input` event, which React reports as the input's onChange.
 */
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState, type InputHTMLAttributes } from "react";
import { useLang } from "@/i18n";
import { sysFormat } from "@/lib/format";

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "type">;
const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;
const SUPPORTED = ["dd-mm-yyyy", "mm-dd-yyyy", "yyyy-mm-dd", "dd/mm/yyyy", "mm/dd/yyyy", "dd.mm.yyyy", "mm.dd.yyyy"];

/** System date format, limited to the patterns Frappe offers (falls back to dd-mm-yyyy). */
export function dateFormat(): string {
  // visual round R3: the Saudi default dd-mm-yyyy reads with slashes (dd/mm/yyyy) on every screen; stored values stay ISO
  const f = (typeof window !== "undefined" ? sysFormat().date_format : "dd-mm-yyyy").replace(/^dd-mm-yyyy$/, "dd/mm/yyyy");
  return SUPPORTED.includes(f) ? f : "dd/mm/yyyy";
}
/** ISO → display text in the given format ("" for empty or malformed values). */
export function formatIsoDate(iso: unknown, fmt = dateFormat()): string {
  const m = String(iso ?? "").slice(0, 10).match(ISO);
  return m ? fmt.replace("yyyy", m[1]!).replace("mm", m[2]!).replace("dd", m[3]!) : "";
}
/** Display text → ISO, or null when it is not a complete real calendar date in that format. */
export function parseDisplayDate(text: string, fmt = dateFormat()): string | null {
  const digits = text.trim().split(/[^0-9]+/).filter(Boolean);
  const order = fmt.split(/[^a-z]+/);
  if (digits.length !== 3 || order.length !== 3) return null;
  const part = (k: string) => digits[order.indexOf(k)] ?? "";
  const y = part("yyyy"), mo = part("mm").padStart(2, "0"), d = part("dd").padStart(2, "0");
  if (y.length !== 4 || mo.length !== 2 || d.length !== 2) return null;
  const dt = new Date(Date.UTC(+y, +mo - 1, +d));
  return dt.getUTCFullYear() === +y && dt.getUTCMonth() === +mo - 1 && dt.getUTCDate() === +d ? `${y}-${mo}-${d}` : null;
}
/** Placeholder in the user's language. Arabic reads in its own order «يوم/شهر/سنة» (owner notes A-09: never «سنة/شهر/يوم»),
 *  so the words are not forced into the digits' left-to-right order. */
export function datePlaceholder(ar: boolean, fmt = dateFormat()): string {
  if (!ar) return fmt;
  const sep = fmt.match(/[^a-z]/)?.[0] ?? "-";
  return fmt.split(/[^a-z]+/).map((k) => (k === "dd" ? "يوم" : k === "mm" ? "شهر" : "سنة")).join(sep);
}

const nativeSetter = typeof window !== "undefined" ? Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set : undefined;
function writeNative(el: HTMLInputElement, iso: string) {
  if (el.value === iso) return;
  nativeSetter?.call(el, iso);
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

export const DateInput = forwardRef<HTMLInputElement, Props>(function DateInput({ className, style, placeholder, onFocus, onBlur, onKeyDown, id, title, autoFocus, "aria-label": ariaLabel, ...rest }, ref) {
  const ar = useLang() === "ar";
  const fmt = dateFormat();
  const native = useRef<HTMLInputElement>(null);
  useImperativeHandle(ref, () => native.current as HTMLInputElement);
  const controlled = rest.value !== undefined;
  const current = () => String((controlled ? rest.value : native.current?.value ?? rest.defaultValue) ?? "");
  const [draft, setDraft] = useState<string | null>(null);
  const typing = useRef(false); // a write caused by typing keeps the user's text until blur
  const [, bump] = useState(0);
  // uncontrolled inputs: follow the native value (picker choice, form reset)
  const sync = useCallback(() => bump((n) => n + 1), []);
  useEffect(() => {
    const el = native.current; if (!el || controlled) return;
    el.addEventListener("change", sync); el.form?.addEventListener("reset", sync);
    return () => { el.removeEventListener("change", sync); el.form?.removeEventListener("reset", sync); };
  }, [controlled, sync]);
  const shown = draft ?? formatIsoDate(current(), fmt);
  const commit = (text: string) => {
    const el = native.current; if (!el) return;
    if (!text.trim()) writeNative(el, "");
    else { const iso = parseDisplayDate(text, fmt); if (iso) writeNative(el, iso); }
    setDraft(null);
  };
  const disabled = !!rest.disabled, readOnly = !!rest.readOnly;
  const label = ariaLabel ?? title;
  return (
    <span className={`dx-date ${className ?? ""}`} style={style} data-date-field data-disabled={disabled || undefined} title={title}>
      <input
        type="text" inputMode="numeric" dir={ar && !shown ? "rtl" : "ltr"} autoComplete="off" id={id} autoFocus={autoFocus}
        className="dx-date-text" value={shown} placeholder={placeholder && !/^(dd|mm|yyyy)/i.test(placeholder) ? placeholder : datePlaceholder(ar, fmt)}
        disabled={disabled} readOnly={readOnly} required={rest.required} aria-label={label} aria-invalid={draft !== null && draft.trim() !== "" && !parseDisplayDate(draft, fmt) ? true : undefined}
        data-date-display={fmt} data-no-i18n
        onChange={(e) => {
          const t = e.target.value; setDraft(t);
          const iso = parseDisplayDate(t, fmt);
          if (iso && native.current) { typing.current = true; try { writeNative(native.current, iso); } finally { typing.current = false; } }
        }}
        onFocus={onFocus as never}
        onBlur={(e) => { commit(e.target.value); onBlur?.(e as never); }}
        onKeyDown={(e) => { if (e.key === "Enter") commit((e.target as HTMLInputElement).value); onKeyDown?.(e as never); }}
      />
      <button type="button" className="dx-date-btn" tabIndex={-1} disabled={disabled || readOnly} aria-label={ar ? "اختيار التاريخ" : "Pick a date"}
        onClick={() => { const el = native.current; if (!el) return; try { el.showPicker(); } catch { el.focus(); } }}>
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 10h18" /></svg>
      </button>
      <input ref={native} type="date" {...rest} className="dx-date-native" tabIndex={-1} aria-hidden="true"
        onChange={(e) => { if (!typing.current) setDraft(null); rest.onChange?.(e); if (!controlled) sync(); }} />
    </span>
  );
});
