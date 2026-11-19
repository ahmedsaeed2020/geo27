import { adapter } from "@/lib/adapter";
import { useL } from "./crmI18n";

/** Frappe Rating stores 0..1; the control shows `stars` stars (frappe-ui Rating). */
export const ratingToStars = (v: unknown, stars = 5) => Math.round((Number(v) || 0) * stars);
export const starsToRating = (n: number, stars = 5) => n / stars;
/** Duration seconds <-> {d,h,m,s} (frappe duration control). */
export function splitDuration(sec: unknown) { const n = Math.max(0, Math.floor(Number(sec) || 0)); return { d: Math.floor(n / 86400), h: Math.floor(n % 86400 / 3600), m: Math.floor(n % 3600 / 60), s: n % 60 }; }
export const joinDuration = (p: { d: number; h: number; m: number; s: number }) => p.d * 86400 + p.h * 3600 + p.m * 60 + p.s;
/** Table MultiSelect rows: [{ [linkField]: value }]. */
export const multiValues = (v: unknown, key: string) => (Array.isArray(v) ? v as Record<string, unknown>[] : []).map(r => String(r[key] ?? "")).filter(Boolean);

export function CrmRating({ value, onChange, disabled, label }: { value: unknown; onChange: (v: number) => void; disabled?: boolean | undefined; label?: string | undefined }) {
  const { L } = useL(); const n = ratingToStars(value);
  return <div role="radiogroup" aria-label={label} className="flex gap-0.5">{[1, 2, 3, 4, 5].map(i => <button key={i} type="button" role="radio" aria-checked={n === i} aria-label={`${i} ${L("stars")}`} disabled={disabled} className={i <= n ? "text-crm-ink" : "text-crm-muted"} onClick={() => onChange(starsToRating(n === i ? 0 : i))}>{i <= n ? "★" : "☆"}</button>)}</div>;
}

export function CrmDuration({ value, onChange, disabled, hideDays, hideSeconds }: { value: unknown; onChange: (v: number) => void; disabled?: boolean | undefined; hideDays?: boolean; hideSeconds?: boolean }) {
  const { L } = useL(); const p = splitDuration(value);
  const parts: [keyof typeof p, string][] = [["d", "Days"], ["h", "Hours"], ["m", "Minutes"], ["s", "Seconds"]];
  return <div className="flex gap-1">{parts.filter(([k]) => !(k === "d" && hideDays) && !(k === "s" && hideSeconds)).map(([k, l]) => <label key={k} className="text-[10px] text-crm-muted">{L(l)}<input type="number" min={0} aria-label={L(l)} className="crm-input w-14" disabled={disabled} value={p[k]} onChange={e => onChange(joinDuration({ ...p, [k]: Math.max(0, Number(e.target.value) || 0) }))} /></label>)}</div>;
}

export function CrmImageUploader({ value, onChange, disabled, label, doctype, docname }: { value: unknown; onChange: (v: string) => void; disabled?: boolean | undefined; label?: string | undefined; doctype: string; docname: string }) {
  const { L } = useL();
  return <div className="flex items-center gap-2">{value ? <img src={String(value)} alt={label} className="h-10 w-10 rounded object-cover" /> : <span className="h-10 w-10 rounded border border-crm-line" />}<label className="text-xs">{L("Upload")}<input type="file" accept="image/*" aria-label={`${L("Upload")} ${label ?? ""}`} disabled={disabled} className="block max-w-40 text-xs" onChange={e => { const file = e.target.files?.[0]; if (!file) return; const r = new FileReader(); r.onload = () => { const url = String(r.result); adapter.insertDoc("File", { file_name: file.name, file_url: url, attached_to_doctype: doctype, attached_to_name: docname, is_private: 0 }); onChange(url); }; r.readAsDataURL(file); }} /></label>{Boolean(value) && !disabled && <button type="button" className="crm-btn" aria-label={L("Remove")} onClick={() => onChange("")}>×</button>}</div>;
}

export function CrmTableMultiSelect({ value, onChange, options, linkField, disabled, label }: { value: unknown; onChange: (v: Record<string, unknown>[]) => void; options: string[]; linkField: string; disabled?: boolean | undefined; label?: string | undefined }) {
  const { L } = useL(); const vals = multiValues(value, linkField);
  return <div className="flex flex-wrap items-center gap-1">{vals.map(v => <span key={v} className="inline-flex items-center gap-1 rounded bg-crm-sidebar px-1.5 text-xs" data-no-i18n>{v}{!disabled && <button type="button" aria-label={`${L("Remove")} ${v}`} onClick={() => onChange(vals.filter(x => x !== v).map(x => ({ [linkField]: x })))}>×</button>}</span>)}<select aria-label={label} className="crm-input w-auto" disabled={disabled} value="" onChange={e => e.target.value && onChange([...vals, e.target.value].map(x => ({ [linkField]: x })))}><option value="">{L("Add")}</option>{options.filter(o => !vals.includes(o)).map(o => <option key={o} value={o} data-no-i18n>{o}</option>)}</select></div>;
}
