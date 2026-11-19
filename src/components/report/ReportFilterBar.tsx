import { useMemo, useState, type ReactNode } from "react";
import { ChevronDown, ChevronUp, Lock, X } from "lucide-react";
import { evalDepends } from "@/lib/depends";
import { scopedList, useScopeMetas } from "@/lib/scope";
import { multiValues, specLinkTarget, specOptions, type WbFilter } from "@/lib/reportSpecs";
import { t, tLabel, useLang } from "@/i18n";
import { DateInput } from "@/components/form/DateInput";
import { LinkCombo, linkTitle } from "@/components/form/LinkCombo";
export type { WbFilter };

const LINK_LIMIT = 200;

/**
 * Report filter area (query_report.js setup_filters): one control per source filter in source order, "Break" rows
 * ignored, Check filters in their own row when separate_check_filters, and the collapse chevron when
 * collapsible_filters (first row shown, the rest behind the toggle). depends_on hides a filter like
 * refresh_filters_dependency; a filter the local runner does not apply stays visible but locked (server-only).
 */
export function ReportFilterBar({ filters, values, onChange, collapsible, separateChecks }: {
  filters: WbFilter[]; values: Record<string, string>; onChange: (k: string, v: string) => void; collapsible?: boolean | undefined; separateChecks?: boolean | undefined;
}) {
  // null = follow collapsible_filters (the spec may arrive after first render); a click pins the user's choice
  const [pinned, setOpen] = useState<boolean | null>(null);
  const open = pinned ?? !collapsible;
  const visible = filters.filter((f) => f.fieldtype !== "Break" && !Number(f.hidden ?? 0) && (!f.depends_on || evalDepends(f.depends_on, values)));
  const linkTargets = useMemo(() => [...new Set(visible.flatMap((f) => { const t = specLinkTarget(f); return t && !filters.some((x) => x.fieldname === t) ? [t] : t ? [values[t] ?? ""] : []; }).filter(Boolean))], [visible, filters, values]);
  useScopeMetas(linkTargets);
  const main = visible.filter((f) => !(separateChecks && f.fieldtype === "Check"));
  const checks = separateChecks ? visible.filter((f) => f.fieldtype === "Check") : [];
  const FIRST_ROW = 6;
  const shownMain = open ? main : main.slice(0, FIRST_ROW);
  if (!visible.length) return null;
  return (
    <div className="mt-3 space-y-2" data-report-filters>
      <div className="flex flex-wrap items-end gap-2">
        {shownMain.map((f) => <FilterControl key={f.fieldname} f={f} values={values} onChange={onChange} filters={filters} />)}
        {collapsible && (main.length > FIRST_ROW || checks.length > 0) && (
          <button type="button" className="btn-ghost mb-0.5 px-2 py-1" aria-expanded={open} aria-label={open ? "Hide filters" : "Show all filters"} data-filters-toggle onClick={() => setOpen(!open)}>{open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}</button>
        )}
      </div>
      {checks.length > 0 && (open || !collapsible) && (
        <div className="flex flex-wrap gap-x-5 gap-y-1.5 rounded-md border border-dashed border-border px-3 py-2" data-check-filters>
          {checks.map((f) => <FilterControl key={f.fieldname} f={f} values={values} onChange={onChange} filters={filters} />)}
        </div>
      )}
    </div>
  );
}

function FilterControl({ f, values, onChange, filters }: { f: WbFilter; values: Record<string, string>; onChange: (k: string, v: string) => void; filters: WbFilter[] }) {
  const v = values[f.fieldname] ?? "";
  useLang();
  const label = f.label ?? f.fieldname;
  // inputs carry data-no-i18n (typed values are data), so their hint text is translated here
  const hint = tLabel(label);
  const reqd = !!Number(f.reqd ?? 0);
  const locked = !f.applied;
  const lockTitle = locked ? "Applied by the DIGIT server only — this preview does not filter by it" : undefined;
  const set = (x: string) => onChange(f.fieldname, x);
  const common = { "data-filter": f.fieldname, disabled: locked, title: lockTitle ? t(lockTitle) : hint, "aria-label": hint };
  const Lk = locked ? <Lock className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden /> : null;
  if (f.fieldtype === "Check") {
    return (
      <label className={`flex items-center gap-1.5 text-xs ${locked ? "opacity-60" : ""}`} title={lockTitle} data-filter-wrap={f.fieldname} data-server-only={locked ? "1" : undefined}>
        <input type="checkbox" {...common} checked={v === "1"} onChange={(e) => set(e.target.checked ? "1" : "")} />
        <span>{label}</span>{Lk}
      </label>
    );
  }
  // Link / MultiSelectList target: a DocType, or the value of another filter (party → party_type)
  const rawTarget = specLinkTarget(f);
  const target = rawTarget && filters.some((x) => x.fieldname === rawTarget) ? values[rawTarget] ?? "" : rawTarget;
  const listId = `rf-${f.fieldname}`;
  const linkDocs = target ? scopedList(target).slice(0, LINK_LIMIT) : [];
  const linkOptions = linkDocs.map((d) => d.name);
  const box = (inner: ReactNode) => (
    <div className={`w-44 ${locked ? "opacity-60" : ""}`} data-filter-wrap={f.fieldname} data-server-only={locked ? "1" : undefined} title={lockTitle}>
      <span className="mb-0.5 flex items-center gap-1 text-[11px] text-muted-foreground"><span>{label}</span>{reqd && <span className="text-destructive">*</span>}{Lk}</span>
      {inner}
    </div>
  );
  if (f.fieldtype === "Select") {
    const opts = specOptions(f);
    return box(<select className="field-input" {...common} value={v} onChange={(e) => set(e.target.value)}>{opts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}{!opts.some((o) => o.value === v) && v && <option value={v}>{v}</option>}</select>);
  }
  if (f.fieldtype === "MultiSelectList") {
    const vals = multiValues(v);
    const add = (x: string) => { const s = x.trim(); if (!s || vals.includes(s)) return; set(JSON.stringify(f.single ? [s] : [...vals, s])); };
    return box(
      <div className="field-input flex min-h-8 flex-wrap items-center gap-1 py-0.5" data-multiselect={f.fieldname}>
        {vals.map((x) => <span key={x} className="chip inline-flex items-center gap-1 bg-muted" data-no-i18n>{x}<button type="button" aria-label={`Remove ${x}`} disabled={locked} onClick={() => { const next = vals.filter((y) => y !== x); set(next.length ? JSON.stringify(next) : ""); }}><X className="h-3 w-3" /></button></span>)}
        {(!f.single || !vals.length) && <input className="min-w-16 flex-1 bg-transparent text-xs outline-none" list={listId} {...common} data-no-i18n placeholder={vals.length ? "" : hint}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add((e.target as HTMLInputElement).value); (e.target as HTMLInputElement).value = ""; } }}
          onChange={(e) => { if (linkOptions.includes(e.target.value)) { add(e.target.value); e.target.value = ""; } }} onBlur={(e) => { if (e.target.value) { add(e.target.value); e.target.value = ""; } }} />}
        <datalist id={listId}>{linkOptions.filter((o) => !vals.includes(o)).map((o) => <option key={o} value={o} />)}</datalist>
      </div>,
    );
  }
  const auto = f.fieldtype === "Autocomplete" ? specOptions(f).map((o) => o.value).filter(Boolean) : [];
  const type = f.fieldtype === "Date" ? "date" : f.fieldtype === "Int" || f.fieldtype === "Float" || f.fieldtype === "Currency" ? "number" : "text";
  return box(
    <>
      {type === "date" ? <DateInput className="field-input" {...common} value={v} onChange={(e) => set(e.target.value)} />
        // owner note 6 LINK-01: link / autocomplete filters use the shared under-field list
        : type === "text" && (linkOptions.length > 0 || auto.length > 0) ? <LinkCombo className="field-input" value={v} onChange={set} disabled={locked} ariaLabel={hint} title={common.title} placeholder={hint} attrs={{ "data-filter": f.fieldname }}
            options={[...auto.map((o) => ({ value: o })), ...linkDocs.map((d) => ({ value: d.name, title: linkTitle(d) }))]} />
        : <input className="field-input" {...common} data-no-i18n type={type} placeholder={f.fieldtype === "Date" ? undefined : hint} value={v} onChange={(e) => set(e.target.value)} />}
    </>,
  );
}
