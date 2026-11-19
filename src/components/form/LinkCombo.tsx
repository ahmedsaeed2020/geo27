/**
 * Owner note 6 LINK-01: link suggestions open directly under the field (forms, child rows, dynamic links) — a branded
 * list with the record code and its readable name, filtered as you type, keyboard-driven (↓ ↑ Enter Esc), RTL-aware.
 * It replaces the browser <datalist>, whose popup the browser places and styles itself. Options are passed in already
 * filtered (link filters + read permission), so this control decides nothing about what a user may pick.
 */
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { useLang } from "@/i18n";
import { sampleDisplayAr } from "@/lib/seedNamesAr";

export interface LinkOption { value: string; title?: string | undefined }
const TITLE_KEYS = ["account_name", "customer_name", "supplier_name", "item_name", "employee_name", "cost_center_name", "warehouse_name", "project_name", "full_name", "title", "lead_name", "company_name"];
/** Readable name of a linked record: the DocType title field, else the usual name fields. */
export function linkTitle(d: Record<string, unknown>, titleField?: string): string {
  const t = titleField ? d[titleField] : undefined;
  const v = t != null && t !== "" ? t : TITLE_KEYS.map((k) => d[k]).find((x) => x != null && x !== "");
  const s = v == null ? "" : String(v);
  return s && s !== d["name"] ? s : "";
}

const LIMIT = 50;
export function LinkCombo({ value, onChange, options, disabled, className = "field-input bidi-iso", ariaLabel, title, placeholder, onFocus, attrs }: {
  value: string; onChange: (v: string) => void; options: LinkOption[]; disabled?: boolean | undefined; className?: string; ariaLabel?: string | undefined;
  title?: string | undefined; placeholder?: string | undefined; onFocus?: (() => void) | undefined; attrs?: Record<string, string | number | boolean | undefined>;
}) {
  const ar = useLang() === "ar";
  const id = useId(); const ref = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false); const [active, setActive] = useState(0); const [typed, setTyped] = useState(false);
  const [pos, setPos] = useState<{ style: CSSProperties; host: HTMLElement } | null>(null);
  const shown = (o: LinkOption) => (o.title ? (ar ? sampleDisplayAr(o.title) ?? o.title : o.title) : "");
  const q = typed ? value.trim().toLowerCase() : "";
  const matches = useMemo(() => (q ? options.filter((o) => o.value.toLowerCase().includes(q) || (o.title ?? "").toLowerCase().includes(q) || shown(o).toLowerCase().includes(q)) : options),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [options, q, ar]);
  const list = matches.slice(0, LIMIT);

  const place = () => {
    const el = ref.current; if (!el) return;
    const r = el.getBoundingClientRect(); const vw = window.innerWidth; const vh = window.innerHeight;
    const width = Math.min(Math.max(r.width, 260), vw - 16);
    let left = document.documentElement.dir === "rtl" || ar ? r.right - width : r.left; left = Math.max(8, Math.min(left, vw - width - 8));
    const below = vh - r.bottom; const up = below < 220 && r.top > below;
    // inside a modal dialog the list must live in the dialog (outside it is inert); its box is then the containing block
    const host = (el.closest('[role="dialog"]') as HTMLElement | null) ?? document.body;
    const h = host === document.body ? null : host.getBoundingClientRect();
    const top = up ? r.top - 4 : r.bottom + 4;
    const style: CSSProperties = h
      ? { position: "absolute", left: left - h.left + host.scrollLeft, width, ...(up ? { bottom: h.bottom - top - host.scrollTop } : { top: top - h.top + host.scrollTop }), maxHeight: Math.min(320, (up ? r.top : below) - 16) }
      : { position: "fixed", left, width, ...(up ? { bottom: vh - top } : { top }), maxHeight: Math.min(320, (up ? r.top : below) - 16) };
    setPos({ style, host });
  };
  useLayoutEffect(() => { if (open) place(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [open, value, list.length]);
  useEffect(() => {
    if (!open) return;
    const on = () => place();
    window.addEventListener("scroll", on, true); window.addEventListener("resize", on);
    return () => { window.removeEventListener("scroll", on, true); window.removeEventListener("resize", on); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  useEffect(() => { setActive(0); }, [q]);

  const pick = (o: LinkOption) => { onChange(o.value); setTyped(false); setOpen(false); };
  const key = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") { e.preventDefault(); if (!open) setOpen(true); else setActive((a) => Math.min(a + 1, list.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === "Enter" && open && list[active]) { e.preventDefault(); pick(list[active]!); }
    else if (e.key === "Escape" && open) { e.preventDefault(); e.stopPropagation(); setOpen(false); }
    else if (e.key === "Tab") setOpen(false);
  };
  const listId = `${id}-list`;
  return <>
    <input ref={ref} dir="auto" data-no-i18n className={className} title={title} placeholder={placeholder} disabled={disabled} value={value} autoComplete="off"
      role="combobox" aria-autocomplete="list" aria-expanded={open} aria-controls={listId} aria-label={ariaLabel}
      {...(open && list[active] ? { "aria-activedescendant": `${id}-o${active}` } : {})} data-link-combo {...attrs}
      onFocus={() => { onFocus?.(); setTyped(false); setOpen(true); }} onBlur={() => setOpen(false)} onClick={() => setOpen(true)}
      onChange={(e) => { setTyped(true); setOpen(true); onChange(e.target.value); }} onKeyDown={key} />
    {open && !disabled && pos && createPortal(
      <div id={listId} role="listbox" className="ent-link-list" style={pos.style} dir={ar ? "rtl" : "ltr"} data-link-list data-link-options={matches.length}
        onMouseDown={(e) => e.preventDefault()}>
        {list.length ? list.map((o, i) => { const t = shown(o); return (
          <div key={o.value} id={`${id}-o${i}`} role="option" aria-selected={i === active} className="ent-link-opt" data-active={i === active || undefined} data-link-option={o.value}
            onMouseEnter={() => setActive(i)} onClick={() => pick(o)}>
            {t ? <><span className="ent-link-title" data-no-i18n>{t}</span><span className="ent-link-code" data-no-i18n>{o.value}</span></> : <span className="ent-link-title" data-no-i18n>{o.value}</span>}
          </div>); })
          : <div className="ent-link-empty">{ar ? "لا توجد سجلات مطابقة" : "No matching records"}</div>}
        {matches.length > LIMIT && <div className="ent-link-more">{ar ? <>و<bdi data-no-i18n>{matches.length - LIMIT}</bdi> أخرى — اكتب لتضييق البحث</> : <><bdi data-no-i18n>{matches.length - LIMIT}</bdi> more — keep typing to narrow</>}</div>}
      </div>, pos.host)}
  </>;
}
