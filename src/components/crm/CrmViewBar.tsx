import { useNavigate, useSearch } from "@tanstack/react-router";
import { t, useLang } from "@/i18n";
import { dval } from "./crmI18n";
import { useDevMode } from "@/lib/mode";
import { useEffect, useState } from "react";
import { adapter, useStoreVersion, type Doc } from "@/lib/adapter";
import { currentUser } from "@/lib/session";
import { Button } from "@/components/ui/button";
import { useL } from "./crmI18n";
import { cachedMeta, ensureMetas } from "@/lib/catalog";
import { linkTitle, TITLE_FIELDS } from "@/lib/linkTitle";
import { DateInput } from "@/components/form/DateInput";

/**
 * Local simulation of CRM View Settings (crm/fcrm/doctype/crm_view_settings).
 * Saved views are stored as CRM View Settings records in the shared adapter using the
 * source field names (label, dt, type, group_by_field, order_by, filters, user).
 * Server-side get_views / public-view permissions are not executed.
 */
export type ViewType = "list" | "group_by" | "kanban";
export type FilterOp = "=" | "!=" | "like" | "not like" | "in" | "not in" | ">" | "<" | ">=" | "<=" | "is";
export type Filter = { field: string; op: FilterOp; value: string };
export type ViewState = { type: ViewType; group_by_field: string; order_by: string; search: string; filters: Filter[]; title_field?: string; kanban_fields?: string };
/** Operators offered by crm/frontend Filter.vue for data/select/number fields. */
export const OPS: { op: FilterOp; label: string }[] = [
  { op: "=", label: "equals" }, { op: "!=", label: "not equals" }, { op: "like", label: "like" }, { op: "not like", label: "not like" },
  { op: "in", label: "in" }, { op: "not in", label: "not in" }, { op: ">", label: ">" }, { op: "<", label: "<" },
  { op: ">=", label: ">=" }, { op: "<=", label: "<=" }, { op: "is", label: "is" },
];
const num = (x: unknown) => x !== "" && x != null && !isNaN(Number(x));
/** Evaluates one Frappe-style [field, op, value] condition locally; all conditions are ANDed like frappe.get_list. */
/** One shared collator: same order as localeCompare(…, undefined, { numeric: true }) without building one per comparison. */
const NUMERIC = new Intl.Collator(undefined, { numeric: true });
export function matchFilter(r: Doc, f: Filter): boolean {
  const raw = f.field === "_assign" ? r["_assign"] ?? r["lead_owner"] ?? r["deal_owner"] : r[f.field];
  const a = String(raw ?? ""), v = f.value;
  const cmp = () => (num(a) && num(v) ? Number(a) - Number(v) : NUMERIC.compare(a, v));
  const list = v.split(",").map((x) => x.trim().toLowerCase()).filter(Boolean);
  const like = a.toLowerCase().includes(v.replace(/%/g, "").toLowerCase());
  switch (f.op) {
    case "=": return a.toLowerCase() === v.toLowerCase();
    case "!=": return a.toLowerCase() !== v.toLowerCase();
    case "like": return like;
    case "not like": return !like;
    case "in": return list.includes(a.toLowerCase());
    case "not in": return !list.includes(a.toLowerCase());
    case ">": return a !== "" && cmp() > 0;
    case "<": return a !== "" && cmp() < 0;
    case ">=": return a !== "" && cmp() >= 0;
    case "<=": return a !== "" && cmp() <= 0;
    case "is": return v === "not set" ? a === "" : a !== "";
  }
}
export type SourceMeta = { quick: { key: string; label: string; ft: string; options?: string[]; link?: string }[]; all: { key: string; label: string }[] };
type SourceField = { fieldname: string; label?: string; fieldtype: string; options?: string; in_standard_filter?: number };
/** crm/api/doc.py get_quick_filters: fields flagged in_standard_filter in the DocType meta; Select options from the field. */
export function quickFiltersFromFields(fields: SourceField[]): SourceMeta {
  const fl = fields.filter((f) => !["Section Break", "Column Break", "Tab Break", "HTML", "Table", "Table MultiSelect", "Button"].includes(f.fieldtype));
  return {
    quick: fl.filter((f) => f.in_standard_filter).map((f) => {
      const options = f.fieldtype === "Select" ? String(f.options ?? "").split("\n").filter(Boolean) : ["Link", "Check"].includes(f.fieldtype) ? [] : undefined;
      return { key: f.fieldname, label: f.label || f.fieldname, ft: f.fieldtype, ...(options ? { options } : {}), ...(f.fieldtype === "Link" && f.options ? { link: f.options } : {}) };
    }),
    all: fl.map((f) => ({ key: f.fieldname, label: f.label || f.fieldname })),
  };
}
/** Source quick filters. CRM-app DocTypes (CRM …/FCRM …) read their raw CRM JSON; others (e.g. Contact) read the catalog meta, as Frappe CRM does for any DocType. */
export function useSourceMeta(dt: string) {
  const [meta, setMeta] = useState<SourceMeta | null>(null);
  useEffect(() => {
    let live = true;
    const done = (m: SourceMeta) => { if (live) setMeta(m); };
    const empty = { quick: [], all: [] };
    if (!/^(CRM|FCRM) /.test(dt)) {
      ensureMetas([dt]).then(() => done(quickFiltersFromFields((cachedMeta(dt)?.fields ?? []) as SourceField[]))).catch(() => done(empty));
      return () => { live = false; };
    }
    const file = dt.toLowerCase().replace(/ /g, "_");
    fetch(`/catalog/raw/crm/${file}.json`).then((r) => (r.ok ? r.json() : null)).then((d) => done(d ? quickFiltersFromFields(d.fields ?? []) : empty)).catch(() => done(empty));
    return () => { live = false; };
  }, [dt]);
  return meta;
}
export const VIEW_DT = "CRM View Settings";

/** Kanban settings persist on the user's default kanban CRM View Settings record (is_default), as in the source KanbanSettings save. */
const KANBAN_KEYS = ["group_by_field", "title_field", "kanban_fields"] as const;
const kanbanDefault = (dt: string) => adapter.list(VIEW_DT).find((d) => d["dt"] === dt && d["type"] === "kanban" && Number(d["is_default"]) && d["user"] === currentUser());
/** URL-backed view state: unsaved search/sort/filters/view type survive refresh and Back (frappe list route state). */
function viewFromUrl(s: Record<string, unknown>, initial: ViewType): ViewState {
  const filters = typeof s["f"] === "string" ? parseFilters(s["f"]) : [];
  return {
    type: (s["view"] === "kanban" || s["view"] === "group_by" ? s["view"] : initial) as ViewType,
    group_by_field: typeof s["gb"] === "string" ? s["gb"] : "",
    order_by: typeof s["sort"] === "string" ? s["sort"] : "modified desc",
    search: typeof s["q"] === "string" ? s["q"] : "",
    filters,
  };
}
function parseFilters(raw: string): Filter[] {
  try { const j = JSON.parse(raw); return Array.isArray(j) ? j.map((x) => ({ field: String(x[0]), op: x[1] as FilterOp, value: String(x[2] ?? "") })) : []; } catch { return []; }
}
function viewToSearch(v: ViewState): Record<string, string> {
  const out: Record<string, string> = {};
  if (v.type !== "list") out["view"] = v.type;
  if (v.group_by_field) out["gb"] = v.group_by_field;
  if (v.order_by !== "modified desc") out["sort"] = v.order_by;
  if (v.search) out["q"] = v.search;
  if (v.filters.some((f) => f.field)) out["f"] = JSON.stringify(v.filters.filter((f) => f.field).map((f) => [f.field, f.op, f.value]));
  return out;
}

export function useCrmView(dt: string, initial: ViewType = "list") {
  const urlSearch = useSearch({ strict: false }) as Record<string, unknown>;
  const nav = useNavigate();
  const [v, setV] = useState<ViewState>(() => viewFromUrl(urlSearch, initial));
  useEffect(() => { if (initial !== "kanban") return; const d = kanbanDefault(dt); if (d) setV((s) => ({ ...s, group_by_field: String(d["group_by_field"] ?? ""), title_field: String(d["title_field"] ?? ""), kanban_fields: String(d["kanban_fields"] ?? "") })); }, [dt, initial]);
  const set = (p: Partial<ViewState>) => setV((s) => {
    const n = { ...s, ...p };
    void nav({ to: ".", replace: true, search: (prev: Record<string, unknown>) => {
      const rest = { ...prev }; for (const k of ["view", "gb", "sort", "q", "f"]) delete rest[k];
      return { ...rest, ...viewToSearch(n) };
    } });
    if (n.type === "kanban" && KANBAN_KEYS.some((k) => k in p)) {
      const vals = { group_by_field: n.group_by_field, title_field: n.title_field ?? "", kanban_fields: n.kanban_fields ?? "" }; const d = kanbanDefault(dt);
      if (d) adapter.update(VIEW_DT, d.name, vals); else adapter.insertDoc(VIEW_DT, { label: "Kanban", dt, type: "kanban", is_default: 1, user: currentUser(), public: 0, filters: "[]", order_by: n.order_by, ...vals });
    }
    return n;
  });
  return [v, set] as const;
}

/** Read model only: a Select field never written on a record (undefined/null) reads as its meta default, as the Frappe
 *  column default would hold it, so quick filters / group-by on e.g. Contact.status ("Passive") match. Stored data is untouched. */
export function withSelectDefaults(fields: { fieldname?: string; fieldtype?: string; default?: unknown }[], rows: Doc[]): Doc[] {
  const defs = fields.filter((f) => f.fieldtype === "Select" && f.fieldname && f.default != null && String(f.default) !== "").map((f) => [String(f.fieldname), String(f.default)] as const);
  if (!defs.length) return rows;
  return rows.map((r) => (defs.some(([k]) => r[k] == null) ? { ...r, ...Object.fromEntries(defs.filter(([k]) => r[k] == null)) } : r));
}
export function applyView(rows: Doc[], v: ViewState): Doc[] {
  const q = v.search.toLowerCase();
  const out = rows.filter((r) => (!q || JSON.stringify(r).toLowerCase().includes(q)) && (v.filters ?? []).every((f) => !f.field || matchFilter(r, f)));
  const sort = v.order_by.split(",").map(s => s.trim().split(/\s+/));
  return out.sort((a, b) => {
    for (const [field = "modified", dir = "desc"] of sort) {
      const x = String(a[field] ?? ""), y = String(b[field] ?? "");
      const cmp = (dir === "asc" ? 1 : -1) * NUMERIC.compare(x, y);
      if (cmp) return cmp;
    }
    return 0;
  });
}

export function groupRows(rows: Doc[], field: string): [string, Doc[]][] {
  const m = new Map<string, Doc[]>();
  for (const r of rows) {
    const k = String(r[field] ?? "") || "(empty)";
    m.set(k, [...(m.get(k) ?? []), r]);
  }
  return [...m.entries()];
}

export function CrmViewBar({ dt, v, set, fields, types }: {
  dt: string; v: ViewState; set: (p: Partial<ViewState>) => void;
  fields: { key: string; label: string }[]; types: ViewType[];
}) {
  useStoreVersion();
  useLang();
  const dev = useDevMode();
  const { L } = useL();
  const user = currentUser();
  const saved = adapter.list(VIEW_DT).filter((d) => d["dt"] === dt && !Number(d["is_default"]) && (d["user"] === user || Number(d["public"]))).sort((a, b) => Number(b["pinned"] ?? 0) - Number(a["pinned"] ?? 0));
  const [selected, setSelected] = useState("");
  const selectedView = saved.find(s => s.name === selected);
  const [field = "modified", dir = "desc"] = v.order_by.split(" ");
  const save = () => {
    const label = window.prompt(L("View name"));
    if (!label) return;
    adapter.insertDoc(VIEW_DT, {
      label, dt, type: v.type, group_by_field: v.group_by_field, order_by: v.order_by, title_field: v.title_field ?? "", kanban_fields: v.kanban_fields ?? "",
      filters: JSON.stringify([...v.filters.filter((f) => f.field).map((f) => [f.field, f.op, f.value]), ...(v.search ? [["_search", "like", v.search]] : [])]), user, public: 0,
    });
  };
  const load = (d: Doc) => set({
    type: (d["type"] as ViewType) || "list", group_by_field: String(d["group_by_field"] ?? ""),
    order_by: String(d["order_by"] || "modified desc"), title_field: String(d["title_field"] ?? ""), kanban_fields: String(d["kanban_fields"] ?? ""),
    ...parseSaved(String(d["filters"] || "[]")),
  });
  const meta = useSourceMeta(dt);
  const [adv, setAdv] = useState(false);
  const recs = adapter.list(dt);
  // Link/Check quick filters offer the distinct values present in the records (frappe-ui Link/Check filter).
  const quick = (meta?.quick ?? []).map((q) => q.options && q.options.length === 0 ? { ...q, options: [...new Set(recs.map((r) => String(r[q.key] ?? "")).filter(Boolean))].sort() } : q);
  const qv = (k: string) => v.filters.find((f) => f.field === k && f.op === (quickOp(quick, k)))?.value ?? "";
  const setQuick = (k: string, val: string) => set({ filters: [...v.filters.filter((f) => !(f.field === k && f.op === quickOp(quick, k))), ...(val ? [{ field: k, op: quickOp(quick, k), value: val }] : [])] });
  const allFields = meta?.all.length ? meta.all : fields;
  const lang = useLang();
  const upd = (i: number, p: Partial<Filter>) => set({ filters: v.filters.map((f, j) => (j === i ? { ...f, ...p } : f)) });
  return (
    <div data-crm-viewbar className="flex flex-wrap items-center gap-2 px-5 py-3 text-sm">
      <div className="flex rounded-md bg-crm-hover p-0.5">
        {types.map((t) => (
          <button key={t} onClick={() => set({ type: t, group_by_field: t === "group_by" && !v.group_by_field ? fields[1]?.key ?? fields[0]?.key ?? "" : v.group_by_field })}
            className={`rounded px-2 py-0.5 ${v.type === t ? "bg-crm-surface shadow-sm" : "text-crm-muted"}`}>
            <span data-no-i18n>{lang === "ar" ? { list: "قائمة", group_by: "تجميع حسب", kanban: "كانبان" }[t] : t === "group_by" ? "Group By" : t.charAt(0).toUpperCase() + t.slice(1)}</span>
          </button>
        ))}
      </div>
      {v.type === "group_by" && (
        <select aria-label={L("Group by field")} className="crm-input w-auto" value={v.group_by_field} onChange={(e) => set({ group_by_field: e.target.value })}>
          {fields.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
        </select>
      )}
      <input className="crm-input max-w-52" placeholder={L("Search")} value={v.search} onChange={(e) => set({ search: e.target.value })} />
      {(() => { /* SortBy.vue: multiple sort rows, each field + direction, removable */
        const rows = v.order_by.split(",").map(s => s.trim().split(/\s+/)).filter(r => r[0]);
        const save = (r: (string | undefined)[][]) => set({ order_by: (r.length ? r : [["modified", "desc"]]).map(([f, d = "desc"]) => `${f} ${d}`).join(", ") });
        void field; void dir;
        return <>{rows.map(([f, d = "desc"], i) => <span key={i} className="flex items-center gap-1" data-sort-row>
          <select aria-label={L("Sort field")} className="crm-input w-auto" value={f} onChange={(e) => save(rows.map((r, j) => j === i ? [e.target.value, d] : r))}>
            <option value="modified">{L("Last modified")}</option>
            {fields.filter((x) => x.key !== "modified").map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}
          </select>
          <button className="crm-input w-auto" onClick={() => save(rows.map((r, j) => j === i ? [f, d === "asc" ? "desc" : "asc"] : r))}>{d === "asc" ? "↑ " + L("Ascending") : "↓ " + L("Descending")}</button>
          {rows.length > 1 && <button aria-label={L("Remove")} title={L("Remove")} onClick={() => save(rows.filter((_, j) => j !== i))}>×</button>}
        </span>)}
        <button className="crm-input w-auto" aria-label={L("Add sort")} onClick={() => save([...rows, [fields.find(x => !rows.some(r => r[0] === x.key))?.key ?? "modified", "asc"]])}>+ {L("Add sort")}</button></>;
      })()}
      <div className="ms-auto flex items-center gap-2">
        {saved.length > 0 && (
          <select aria-label={L("Saved views")} className="crm-input w-auto" value={selected} onChange={(e) => { setSelected(e.target.value); const d = saved.find((s) => s.name === e.target.value); if (d) load(d); }}>
            <option value="">{t("Saved views")} ({saved.length})</option>
            {saved.map((s) => <option data-no-i18n key={s.name} value={s.name}>{String(s["label"])}</option>)}
          </select>
        )}
        {selectedView && <><Button size="icon" variant="ghost" aria-label={L("Pin view")} title={L("Pin view")} onClick={() => adapter.update(VIEW_DT, selected, { pinned: Number(selectedView["pinned"]) ? 0 : 1 })}>☆</Button>{selectedView["user"] === user && <><Button variant="outline" onClick={() => { const label = window.prompt(L("View name"), String(selectedView["label"])); if (label) adapter.update(VIEW_DT, selected, { label }); }}>{L("Rename")}</Button><label className="flex gap-1"><input type="checkbox" aria-label={L("Public view")} checked={Boolean(Number(selectedView["public"]))} onChange={e => adapter.update(VIEW_DT, selected, { public: Number(e.target.checked) })} />{L("Public view")}</label><Button size="icon" variant="ghost" aria-label={L("Delete view")} title={L("Delete view")} onClick={() => { adapter.remove(VIEW_DT, selected); setSelected(""); }}>×</Button></>}</>}
        <button className="crm-input w-auto" onClick={() => setAdv(!adv)} aria-label="Filter">Filter{v.filters.length ? ` (${v.filters.length})` : ""}</button>
        {v.filters.length > 0 && <button className="crm-input w-auto" onClick={() => set({ filters: [] })}>Clear filters</button>}
        <Button variant="outline" onClick={save}><span data-no-i18n>{L("Save view")}</span></Button>
        {dev && <span className="text-[11px] text-crm-muted" title="Stored locally as CRM View Settings; public views and server permissions are not executed">local · preview</span>}
      </div>
      {quick.length > 0 && (
        <div className="flex w-full flex-wrap gap-2" aria-label="Quick filters">
          {quick.map((q) => <QuickFilterField key={q.key} q={q} lang={lang} value={qv(q.key)} onChange={(val) => setQuick(q.key, val)} />)}
        </div>
      )}
      {adv && (
        <div className="w-full space-y-2 rounded-md border border-crm-line p-3" aria-label="Advanced filters">
          {v.filters.map((f, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2">
              <span className="w-12 text-xs text-crm-muted">{i === 0 ? "Where" : "and"}</span>
              <select aria-label={`Filter field ${i + 1}`} className="crm-input w-auto" value={f.field} onChange={(e) => upd(i, { field: e.target.value })}>
                <option value="">Field</option>{allFields.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}
              </select>
              <select aria-label={`Filter operator ${i + 1}`} className="crm-input w-auto" value={f.op} onChange={(e) => upd(i, { op: e.target.value as FilterOp, value: e.target.value === "is" ? "set" : f.value })}>
                {OPS.map((o) => <option key={o.op} value={o.op}>{o.label}</option>)}
              </select>
              {f.op === "is" ? (
                <select aria-label={`Filter value ${i + 1}`} className="crm-input w-auto" value={f.value} onChange={(e) => upd(i, { value: e.target.value })}><option value="set">set</option><option value="not set">not set</option></select>
              ) : (
                <input aria-label={`Filter value ${i + 1}`} className="crm-input max-w-48" placeholder={f.op.includes("in") && !f.op.includes("like") ? "a, b, c" : "Value"} value={f.value} onChange={(e) => upd(i, { value: e.target.value })} />
              )}
              <button className="text-crm-muted" aria-label={`Remove filter ${i + 1}`} onClick={() => set({ filters: v.filters.filter((_, j) => j !== i) })}>✕</button>
            </div>
          ))}
          <button className="crm-input w-auto" onClick={() => set({ filters: [...v.filters, { field: "", op: "=", value: "" }] })}>+ Add filter</button>
        </div>
      )}
    </div>
  );
}

/** Source QuickFilterField: the control follows the field type (Select/Check dropdown, Date picker, text input). */
/** Link options keep the stored name as the filter value; the visible label is the target's title (lib/linkTitle). */
function QuickFilterField({ q, lang, value, onChange }: { q: { key: string; label: string; ft: string; options?: string[]; link?: string }; lang: string; value: string; onChange: (v: string) => void }) {
  const label = `Quick filter ${q.label}`;
  if (q.ft === "Check")
    return <select aria-label={label} className="crm-input w-auto" value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{q.label}</option>{["Yes", "No"].map((o) => <option key={o} value={o}>{lang === "ar" ? { Yes: "نعم", No: "لا" }[o] : o}</option>)}
    </select>;
  if (q.ft === "Date" || q.ft === "Datetime")
    return <DateInput aria-label={label} className="crm-input w-auto" value={value} onChange={(e) => onChange(e.target.value)} />;
  if (q.options)
    return <select aria-label={label} className="crm-input w-auto" value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{q.label}</option>{(q.link && TITLE_FIELDS[q.link] ? q.options.map((o) => [o, linkTitle(q.link, o)] as const).sort((a, b) => a[1].localeCompare(b[1], lang, { numeric: true })) : q.options.map((o) => [o, dval(o, lang)] as const)).map(([o, text]) => <option key={o} value={o} data-no-i18n>{text}</option>)}
    </select>;
  return <input aria-label={label} className="crm-input max-w-40" placeholder={q.label} value={value} onChange={(e) => onChange(e.target.value)} />;
}

function quickOp(quick: { key: string; options?: string[] }[], k: string): FilterOp {
  return quick.find((q) => q.key === k)?.options ? "=" : "like";
}

/** Saved filters: Frappe list form [[field, op, value]]; legacy {_search} dicts still load. */
export function parseSaved(raw: string): { search: string; filters: Filter[] } {
  try {
    const j = JSON.parse(raw);
    if (Array.isArray(j)) {
      const s = j.find((x) => x[0] === "_search");
      return { search: s ? String(s[2]) : "", filters: j.filter((x) => x[0] !== "_search").map((x) => ({ field: String(x[0]), op: x[1] as FilterOp, value: String(x[2] ?? "") })) };
    }
    const filters = Object.entries(j).filter(([k]) => k !== "_search").map(([k, val]) => Array.isArray(val) ? { field: k, op: val[0] as FilterOp, value: String(val[1]) } : { field: k, op: "=" as FilterOp, value: String(val) });
    return { search: String(j._search ?? ""), filters };
  } catch { return { search: "", filters: [] }; }
}
