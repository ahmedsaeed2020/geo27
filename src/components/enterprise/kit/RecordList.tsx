/**
 * Enterprise record list (CRM C4 A-01 … A-10, owner 2026-11-17) — one app-agnostic list frame every app reuses:
 *  - header: title + view switcher (table / kanban / grouped) + the host's actions (SplitButton below);
 *  - saved-view tabs: the host's built-in views + the reader's Enterprise saved views (lib/sharedViews: private / team /
 *    everyone), «+ عرض», and «احفظ التعديلات» when the filter differs from the active view (save as new / update);
 *  - one row of quick-filter chips (each shows its value, «+ المزيد», «مسح الكل») and «فلاتر متقدمة» (AND / OR groups over a
 *    searchable field list) in a side panel;
 *  - the Enterprise status strip over the filtered rows (a click filters; parts add up to the rows);
 *  - the table: column-header sort + quick filter, «إدارة الأعمدة» (show / hide, drag to reorder, pin the first column,
 *    saved per user), row hover actions, row click → the host's quick view (↑/↓ handled by the host drawer),
 *    Ctrl/Cmd-click → the full record; on phones each row becomes a card;
 *  - bulk bar «تم تحديد N»; footer with the record count, rows per page, pages and a totals row for amount columns;
 *  - empty states with a reason (no records at all / nothing matches with «مسح الفلاتر»).
 * Filtering is the pure filterRows(), so a host test can prove the strip and totals equal the rows. Nothing here writes
 * records: actions call the host.
 */
import { useEffect, useMemo, useState, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";
import { StatusStrip } from "../StatusStrip";
import { EntDrawer, EntPopover } from "../Surfaces";
import { SaveShareDialog, ViewChip } from "../SaveShareView";
import { StageBoard, type MoveResult, type StageCard } from "./StageBoard";
import type { StripTab } from "@/lib/statusStrip";
import { deleteView, updateView, viewsFor, type SharedView } from "@/lib/sharedViews";
import { listLayoutOf, setListLayout, useSettings } from "@/lib/userSettings";
import { useSessionUser } from "@/lib/session";
import { useStoreVersion } from "@/lib/adapter";
import { PROFILES_360 } from "@/lib/coreShared/profile360";
import { Open360 } from "../Open360";

const tx = (ar: boolean, en: string, a: string) => (ar ? a : en);
export type RlOpt = { value: string; label: string };
export interface RlColumn<T> {
  key: string; label: string; render: (r: T) => ReactNode;
  sortValue?: ((r: T) => string | number) | undefined;
  /** header quick filter: text match on filterValue, or a value checklist when filterOptions are given */
  filterValue?: ((r: T) => string) | undefined; filterOptions?: RlOpt[] | undefined;
  amount?: ((r: T) => number) | undefined; amountText?: ((n: number) => string) | undefined;
  /** cannot be hidden */ fixed?: boolean | undefined; defaultHidden?: boolean | undefined; minWidth?: number | undefined; align?: "end" | undefined;
}
export interface RlChip<T> { key: string; label: string; get: (r: T) => string | string[]; options: RlOpt[]; /** under «+ المزيد» until added */ more?: boolean | undefined }
export interface RlField<T> { key: string; label: string; type: "text" | "number" | "select" | "date"; get: (r: T) => string | number | null; options?: RlOpt[] | undefined }
export interface RlView<T> { key: string; label: string; test: (r: T) => boolean }
export interface RlRowAction<T> { key: string; label: string; icon: ReactNode; run: (r: T, el: HTMLElement) => void; hidden?: ((r: T) => boolean) | undefined }
export interface RlBulk { key: string; label: string; icon?: ReactNode; min?: number | undefined; max?: number | undefined; tone?: "bad" | undefined; /** reason it is unavailable */ blocked?: string | undefined; run: (keys: string[]) => void }
export interface RlKanban<T> { columns: { key: string; label: string; hue: string }[]; of: (r: T) => string; card: (r: T) => StageCard; onDrop?: ((key: string, from: string, to: string) => MoveResult) | undefined }
export interface RlGroup<T> { key: string; label: string; of: (r: T) => string; labelOf?: ((v: string) => string) | undefined }
/** Calendar view (CRM C-07): each record on its day (yyyy-mm-dd), drawn in its type colour; a click opens the quick view. */
export interface RlCalendar<T> { date: (r: T) => string; label: (r: T) => ReactNode; hue: (r: T) => string; legend?: { key: string; label: string; hue: string }[] | undefined }
export type AdvOp = "is" | "not" | "contains" | "gt" | "lt" | "set" | "empty" | "before" | "after";
export interface AdvRule { field: string; op: AdvOp; value: string }
export interface AdvGroup { join: "and" | "or"; rules: AdvRule[] }
export interface AdvFilter { join: "and" | "or"; groups: AdvGroup[] }
export interface ListState { view: string; chips: Record<string, string[]>; adv: AdvFilter | null; q: string; sort: { key: string; dir: "asc" | "desc" } | null; col: Record<string, string[]>; strip: string | null }
export const emptyState = (view: string): ListState => ({ view, chips: {}, adv: null, q: "", sort: null, col: {}, strip: null });
export interface ListDef<T> { views: RlView<T>[]; chips: RlChip<T>[]; fields: RlField<T>[]; columns: RlColumn<T>[]; stripOf?: ((r: T) => string) | undefined; search?: ((r: T) => string) | undefined }

const norm = (v: unknown) => String(v ?? "").trim().toLowerCase();
const asArr = (v: string | string[]) => (Array.isArray(v) ? v : [v]);
function matchRule<T>(r: T, rule: AdvRule, f: RlField<T> | undefined): boolean {
  if (!f) return true;
  const raw = f.get(r); const v = raw === null || raw === undefined ? "" : String(raw);
  const n = Number(raw), x = Number(rule.value);
  switch (rule.op) {
    case "is": return norm(v) === norm(rule.value);
    case "not": return norm(v) !== norm(rule.value);
    case "contains": return norm(v).includes(norm(rule.value));
    case "gt": return Number.isFinite(n) && n > x;
    case "lt": return Number.isFinite(n) && n < x;
    case "set": return v !== "";
    case "empty": return v === "";
    case "before": return !!v && v.slice(0, 10) < rule.value;
    case "after": return !!v && v.slice(0, 10) > rule.value;
  }
}
/** Advanced filter: groups joined by AND / OR, rules inside a group joined by the group's own AND / OR. */
export function matchAdv<T>(r: T, adv: AdvFilter | null, fields: RlField<T>[]): boolean {
  if (!adv || !adv.groups.some((g) => g.rules.length)) return true;
  const gs = adv.groups.filter((g) => g.rules.length).map((g) => { const hits = g.rules.map((x) => matchRule(r, x, fields.find((f) => f.key === x.field))); return g.join === "and" ? hits.every(Boolean) : hits.some(Boolean); });
  return adv.join === "and" ? gs.every(Boolean) : gs.some(Boolean);
}
/** The one filter every view uses: `base` = after view + chips + advanced + search + column filters (the strip counts these),
 *  `rows` = base after the strip tab, sorted. */
export function filterRows<T>(all: T[], st: ListState, def: ListDef<T>, except?: string): { base: T[]; rows: T[] } {
  const view = def.views.find((v) => v.key === st.view);
  const base = all.filter((r) => (!view || view.test(r))
    && def.chips.every((c) => c.key === except || !(st.chips[c.key]?.length) || asArr(c.get(r)).some((v) => st.chips[c.key]!.includes(v)))
    && matchAdv(r, st.adv, def.fields)
    && (!st.q || norm(def.search ? def.search(r) : "").includes(norm(st.q)))
    && def.columns.every((c) => { const want = st.col[c.key]; if (!want?.length) return true; const v = c.filterValue ? c.filterValue(r) : ""; return c.filterOptions ? want.includes(v) : norm(v).includes(norm(want[0])); }));
  let rows = st.strip && def.stripOf ? base.filter((r) => def.stripOf!(r) === st.strip) : base;
  const sc = st.sort ? def.columns.find((c) => c.key === st.sort!.key) : undefined;
  if (sc?.sortValue) { const dir = st.sort!.dir === "asc" ? 1 : -1; rows = [...rows].sort((a, b) => { const x = sc.sortValue!(a), y = sc.sortValue!(b); return (x < y ? -1 : x > y ? 1 : 0) * dir; }); }
  return { base, rows };
}
const same = (a: ListState, b: ListState) => JSON.stringify({ ...a, view: "" }) === JSON.stringify({ ...b, view: "" }) && a.view === b.view;
const OPS: Record<RlField<unknown>["type"], AdvOp[]> = { text: ["contains", "is", "not", "set", "empty"], select: ["is", "not", "set", "empty"], number: ["gt", "lt", "is", "set", "empty"], date: ["after", "before", "set", "empty"] };
const OP_LABEL: Record<AdvOp, [string, string]> = { is: ["is", "يساوي"], not: ["is not", "لا يساوي"], contains: ["contains", "يحتوي"], gt: ["more than", "أكبر من"], lt: ["less than", "أصغر من"], set: ["is set", "له قيمة"], empty: ["is empty", "فارغ"], before: ["before", "قبل"], after: ["after", "بعد"] };

function useNarrow() { const [n, setN] = useState(false); useEffect(() => { const m = window.matchMedia("(max-width: 767px)"); const f = () => setN(m.matches); f(); m.addEventListener("change", f); return () => m.removeEventListener("change", f); }, []); return n; }

/** Split button: the main action + ▾ menu of related ways to start (e.g. import, business card, WhatsApp sandbox). */
export function SplitButton({ label, onClick, items, ar, attrs }: { label: ReactNode; onClick: () => void; items: { key: string; label: ReactNode; run: () => void; hint?: ReactNode }[]; ar: boolean; attrs?: Record<string, string> }) {
  const [open, setOpen] = useState(false);
  return <span className="ek-split" {...attrs}>
    <button type="button" className="ek-split-main" onClick={onClick} data-split-main>{label}</button>
    <EntPopover open={open} onOpenChange={setOpen} align="end" width={260} trigger={<button type="button" className="ek-split-more" aria-label={tx(ar, "More ways to add", "طرق إضافة أخرى")} data-split-more>▾</button>}>
      <ul className="ek-menu">{items.map((i) => <li key={i.key}><button type="button" onClick={() => { setOpen(false); i.run(); }} data-split-item={i.key}><span>{i.label}</span>{i.hint && <small>{i.hint}</small>}</button></li>)}</ul>
    </EntPopover>
  </span>;
}

function ChipFilter<T>({ chip, value, onChange, counts, ar }: { chip: RlChip<T>; value: string[]; onChange: (v: string[]) => void; counts: Map<string, number>; ar: boolean }) {
  const [q, setQ] = useState("");
  const label = value.length ? `${chip.options.find((o) => o.value === value[0])?.label ?? value[0]}${value.length > 1 ? ` +${value.length - 1}` : ""}` : tx(ar, "All", "الكل");
  const opts = chip.options.filter((o) => !q || norm(o.label).includes(norm(q)));
  return <EntPopover width={260} title={chip.label} trigger={<button type="button" className="ek-rl-chip" data-on={value.length ? "" : undefined} data-rl-chip={chip.key}><span>{chip.label}</span><b>{label}</b><span aria-hidden>▾</span></button>}>
    {chip.options.length > 8 && <input className="field-input mb-1 min-h-9 w-full text-xs" value={q} onChange={(e) => setQ(e.target.value)} placeholder={tx(ar, "Search", "بحث")} aria-label={tx(ar, "Search", "بحث")} />}
    <ul className="ek-rl-opts">{opts.map((o) => <li key={o.value}><label><input type="checkbox" checked={value.includes(o.value)} onChange={(e) => onChange(e.target.checked ? [...value, o.value] : value.filter((x) => x !== o.value))} data-rl-opt={o.value} />
      <span className="min-w-0 flex-1 truncate">{o.label}</span><bdi className="tabular-nums" data-no-i18n>{counts.get(o.value) ?? 0}</bdi></label></li>)}</ul>
    {value.length > 0 && <button type="button" className="ek-rl-link mt-1" onClick={() => onChange([])}>{tx(ar, "Clear", "مسح")}</button>}
  </EntPopover>;
}

function AdvancedPanel<T>({ open, onOpenChange, fields, value, onApply, ar, preview }: { open: boolean; onOpenChange: (o: boolean) => void; fields: RlField<T>[]; value: AdvFilter | null; onApply: (a: AdvFilter | null) => void; ar: boolean; preview: (a: AdvFilter) => number }) {
  const blank = (): AdvRule => ({ field: fields[0]?.key ?? "", op: OPS[fields[0]?.type ?? "text"][0]!, value: "" });
  const [a, setA] = useState<AdvFilter>(value ?? { join: "and", groups: [{ join: "and", rules: [blank()] }] });
  const [fq, setFq] = useState("");
  useEffect(() => { if (open) setA(value ?? { join: "and", groups: [{ join: "and", rules: [blank()] }] }); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const setRule = (gi: number, ri: number, p: Partial<AdvRule>) => setA((x) => ({ ...x, groups: x.groups.map((g, i) => i !== gi ? g : { ...g, rules: g.rules.map((r, j) => j !== ri ? r : { ...r, ...p }) }) }));
  const shown = fields.filter((f) => !fq || norm(f.label).includes(norm(fq)));
  const JoinSel = ({ v, on, attr }: { v: "and" | "or"; on: (j: "and" | "or") => void; attr: string }) => <span className="ek-seg" role="radiogroup" data-rl-join={attr}>{(["and", "or"] as const).map((j) => <button key={j} type="button" role="radio" aria-checked={v === j} onClick={() => on(j)}>{j === "and" ? tx(ar, "AND", "و") : tx(ar, "OR", "أو")}</button>)}</span>;
  return <EntDrawer open={open} onOpenChange={onOpenChange} title={tx(ar, "Advanced filters", "فلاتر متقدمة")} id="rl-advanced" size="lg"
    kicker={<span data-rl-adv-count={preview(a)}>{tx(ar, `${preview(a)} records match`, `${preview(a)} سجلًا يطابق`)}</span>}
    footer={<div className="flex w-full flex-wrap items-center gap-2"><button type="button" className="btn-ghost" onClick={() => { onApply(null); onOpenChange(false); }} data-rl-adv-clear>{tx(ar, "Remove advanced filters", "إزالة الفلاتر المتقدمة")}</button><span className="ms-auto" />
      <button type="button" className="btn-primary" onClick={() => { onApply(a); onOpenChange(false); }} data-rl-adv-apply>{tx(ar, "Apply", "تطبيق")}</button></div>}>
    <div className="grid gap-3" data-rl-advanced>
      <label className="text-xs font-semibold">{tx(ar, "Find a field", "ابحث عن حقل")}<input className="field-input mt-1 min-h-9 w-full text-sm" value={fq} onChange={(e) => setFq(e.target.value)} placeholder={tx(ar, "Field name", "اسم الحقل")} data-rl-field-search /></label>
      <p className="flex items-center gap-2 text-xs">{tx(ar, "Groups are joined by", "تُجمع المجموعات بـ")} <JoinSel v={a.join} on={(j) => setA((x) => ({ ...x, join: j }))} attr="top" /></p>
      {a.groups.map((g, gi) => <fieldset key={gi} className="ek-rl-group" data-rl-group={gi}>
        <legend className="flex items-center gap-2 text-xs font-semibold">{tx(ar, `Group ${gi + 1}`, `المجموعة ${gi + 1}`)} · {tx(ar, "rules joined by", "الشروط بـ")} <JoinSel v={g.join} on={(j) => setA((x) => ({ ...x, groups: x.groups.map((y, i) => i === gi ? { ...y, join: j } : y) }))} attr={String(gi)} />
          {a.groups.length > 1 && <button type="button" className="ek-rl-link ms-auto" onClick={() => setA((x) => ({ ...x, groups: x.groups.filter((_, i) => i !== gi) }))}>{tx(ar, "Remove group", "حذف المجموعة")}</button>}</legend>
        {g.rules.map((r, ri) => { const f = fields.find((x) => x.key === r.field); const ops = OPS[f?.type ?? "text"]; const pick = shown.some((x) => x.key === r.field) ? shown : [...(f ? [f] : []), ...shown];
          return <div key={ri} className="ek-rl-rule" data-rl-rule={`${gi}:${ri}`}>
            <select className="field-input min-h-9 text-sm" value={r.field} onChange={(e) => { const nf = fields.find((x) => x.key === e.target.value); setRule(gi, ri, { field: e.target.value, op: OPS[nf?.type ?? "text"][0]!, value: "" }); }} aria-label={tx(ar, "Field", "الحقل")}>{pick.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}</select>
            <select className="field-input min-h-9 text-sm" value={r.op} onChange={(e) => setRule(gi, ri, { op: e.target.value as AdvOp })} aria-label={tx(ar, "Condition", "الشرط")}>{ops.map((o) => <option key={o} value={o}>{OP_LABEL[o][ar ? 1 : 0]}</option>)}</select>
            {r.op === "set" || r.op === "empty" ? <span /> : f?.options ? <select className="field-input min-h-9 text-sm" value={r.value} onChange={(e) => setRule(gi, ri, { value: e.target.value })} aria-label={tx(ar, "Value", "القيمة")}><option value="">—</option>{f.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
              : <input className="field-input min-h-9 text-sm" type={f?.type === "number" ? "number" : f?.type === "date" ? "date" : "text"} value={r.value} onChange={(e) => setRule(gi, ri, { value: e.target.value })} aria-label={tx(ar, "Value", "القيمة")} />}
            <button type="button" className="ek-rl-x" aria-label={tx(ar, "Remove rule", "حذف الشرط")} onClick={() => setA((x) => ({ ...x, groups: x.groups.map((y, i) => i !== gi ? y : { ...y, rules: y.rules.filter((_, j) => j !== ri) }) }))}>×</button>
          </div>; })}
        <button type="button" className="ek-rl-link" onClick={() => setA((x) => ({ ...x, groups: x.groups.map((y, i) => i === gi ? { ...y, rules: [...y.rules, blank()] } : y) }))} data-rl-add-rule={gi}>+ {tx(ar, "Add a rule", "إضافة شرط")}</button>
      </fieldset>)}
      <button type="button" className="btn-ghost justify-self-start" onClick={() => setA((x) => ({ ...x, groups: [...x.groups, { join: "and", rules: [blank()] }] }))} data-rl-add-group>+ {tx(ar, "Add a group", "إضافة مجموعة")}</button>
    </div>
  </EntDrawer>;
}

function ColumnManager<T>({ cols, order, hidden, pin, onChange, onReset, ar }: { cols: RlColumn<T>[]; order: string[]; hidden: string[]; pin: boolean; onChange: (o: string[], h: string[], p: boolean) => void; onReset: () => void; ar: boolean }) {
  const [drag, setDrag] = useState<string | null>(null);
  const move = (k: string, to: number) => { const o = order.filter((x) => x !== k); o.splice(Math.max(0, Math.min(o.length, to)), 0, k); onChange(o, hidden, pin); };
  return <EntPopover width={300} align="end" title={tx(ar, "Manage columns", "إدارة الأعمدة")} trigger={<button type="button" className="ek-rl-tool" data-rl-columns>{tx(ar, "Manage columns", "إدارة الأعمدة")}</button>}>
    <ul className="ek-rl-cols" data-rl-col-list>{order.map((k, i) => { const c = cols.find((x) => x.key === k); if (!c) return null; return <li key={k} draggable onDragStart={() => setDrag(k)} onDragOver={(e) => e.preventDefault()} onDrop={() => { if (drag && drag !== k) move(drag, i); setDrag(null); }} data-rl-col={k}>
      <span className="ek-rl-grip" aria-hidden>⋮⋮</span>
      <label className="min-w-0 flex-1"><input type="checkbox" disabled={c.fixed} checked={!hidden.includes(k)} onChange={(e) => onChange(order, e.target.checked ? hidden.filter((x) => x !== k) : [...hidden, k], pin)} data-rl-col-show={k} /> <span>{c.label}</span></label>
      <button type="button" className="ek-rl-x" disabled={i === 0} onClick={() => move(k, i - 1)} aria-label={tx(ar, "Move up", "نقل لأعلى")}>↑</button>
      <button type="button" className="ek-rl-x" disabled={i === order.length - 1} onClick={() => move(k, i + 1)} aria-label={tx(ar, "Move down", "نقل لأسفل")}>↓</button>
    </li>; })}</ul>
    <label className="mt-2 flex items-center gap-2 text-xs"><input type="checkbox" checked={pin} onChange={(e) => onChange(order, hidden, e.target.checked)} data-rl-pin /> {tx(ar, "Pin the first column", "تثبيت العمود الأول")}</label>
    <button type="button" className="ek-rl-link mt-1" onClick={onReset} data-rl-col-reset>{tx(ar, "Restore the default columns", "استعادة الأعمدة الافتراضية")}</button>
  </EntPopover>;
}

function HeaderFilter<T>({ col, value, onChange, ar }: { col: RlColumn<T>; value: string[]; onChange: (v: string[]) => void; ar: boolean }) {
  return <EntPopover width={240} title={col.label} trigger={<button type="button" className="ek-rl-hf" data-on={value.length ? "" : undefined} aria-label={tx(ar, `Filter ${col.label}`, `تصفية ${col.label}`)} data-rl-hf={col.key}>⏷</button>}>
    {col.filterOptions ? <ul className="ek-rl-opts">{col.filterOptions.map((o) => <li key={o.value}><label><input type="checkbox" checked={value.includes(o.value)} onChange={(e) => onChange(e.target.checked ? [...value, o.value] : value.filter((x) => x !== o.value))} /><span className="flex-1">{o.label}</span></label></li>)}</ul>
      : <input className="field-input min-h-9 w-full text-sm" autoFocus value={value[0] ?? ""} onChange={(e) => onChange(e.target.value ? [e.target.value] : [])} placeholder={tx(ar, "Contains…", "يحتوي على…")} data-rl-hf-input={col.key} />}
    {value.length > 0 && <button type="button" className="ek-rl-link mt-1" onClick={() => onChange([])}>{tx(ar, "Clear", "مسح")}</button>}
  </EntPopover>;
}

export interface RecordListProps<T> {
  /** storage key of the personal layout and the saved views' list, e.g. `digit_crm:leads` */ id: string; doctype: string; ar: boolean;
  title: ReactNode; actions?: ReactNode; rows: T[]; rowKey: (r: T) => string;
  views: RlView<T>[]; chips: RlChip<T>[]; fields: RlField<T>[]; columns: RlColumn<T>[];
  strip?: { tabs: (rows: T[]) => StripTab[]; of: (r: T) => string } | undefined; search?: ((r: T) => string) | undefined;
  rowActions?: RlRowAction<T>[] | undefined; bulk?: RlBulk[] | undefined; kanban?: RlKanban<T> | undefined; groups?: RlGroup<T>[] | undefined;
  onOpen?: ((r: T, keys: string[], el: HTMLElement) => void) | undefined; onOpenFull?: ((r: T) => void) | undefined;
  /** no records at all */ empty: { title: ReactNode; hint?: ReactNode; action?: ReactNode };
  /** a row that needs attention gets a tinted background */ tone?: ((r: T) => "bad" | "warn" | "info" | undefined) | undefined;
  defaultView?: string | undefined;
  calendar?: RlCalendar<T> | undefined;
}
export function RecordList<T>(p: RecordListProps<T>) {
  const { ar } = p; useStoreVersion(); const user = useSessionUser(); useSettings();
  const narrow = useNarrow();
  const [st, setSt] = useState<ListState>(() => emptyState(p.defaultView ?? p.views[0]?.key ?? ""));
  const [mode, setMode] = useState<"table" | "kanban" | "group" | "calendar">("table");
  const [groupBy, setGroupBy] = useState(p.groups?.[0]?.key ?? "");
  const [saved, setSaved] = useState<string | null>(null); // active saved view id
  const [sel, setSel] = useState<Set<string>>(() => new Set());
  const [page, setPage] = useState(1);
  const [adv, setAdv] = useState(false);
  const [save, setSave] = useState<null | "new" | SharedView>(null);
  const [more, setMore] = useState<string[]>([]);
  const lay = listLayoutOf(p.id);
  const defOrder = p.columns.map((c) => c.key), defHidden = p.columns.filter((c) => c.defaultHidden).map((c) => c.key);
  const order = [...(lay?.order ?? defOrder).filter((k) => defOrder.includes(k)), ...defOrder.filter((k) => !(lay?.order ?? defOrder).includes(k))];
  const hidden = lay?.hidden ?? defHidden, pin = lay?.pin ?? true, size = lay?.size ?? 25;
  const saveLayout = (o: string[], h: string[], pn: boolean, sz = size) => setListLayout(p.id, { order: o, hidden: h, pin: pn, size: sz });
  const cols = order.map((k) => p.columns.find((c) => c.key === k)!).filter((c) => c && !hidden.includes(c.key));
  const def: ListDef<T> = { views: p.views, chips: p.chips, fields: p.fields, columns: p.columns, stripOf: p.strip?.of, search: p.search };
  const { base, rows } = useMemo(() => filterRows(p.rows, st, def), [p.rows, st]); // eslint-disable-line react-hooks/exhaustive-deps
  const savedViews = viewsFor(p.doctype, "list", user);
  const activeSaved = saved ? savedViews.find((v) => v.id === saved) : undefined;
  const baseline: ListState = activeSaved ? { ...emptyState(st.view), ...(activeSaved.payload as Partial<ListState>) } : emptyState(st.view);
  const dirty = !same(st, baseline);
  const set = (patch: Partial<ListState>) => { setSt((x) => ({ ...x, ...patch })); setPage(1); };
  // the strip pick and the view stay in the address, so a filtered list can be shared
  useEffect(() => { const u = new URL(window.location.href); const s0 = u.searchParams.get("strip"), v0 = u.searchParams.get("view"); if (s0 || (v0 && p.views.some((v) => v.key === v0))) setSt((x) => ({ ...x, ...(s0 ? { strip: s0 } : {}), ...(v0 && p.views.some((v) => v.key === v0) ? { view: v0 } : {}) })); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const u = new URL(window.location.href); if (st.strip) u.searchParams.set("strip", st.strip); else u.searchParams.delete("strip"); if (st.view && st.view !== p.views[0]?.key) u.searchParams.set("view", st.view); else u.searchParams.delete("view"); if (u.href !== window.location.href) window.history.replaceState(window.history.state, "", u.href); }, [st.strip, st.view]); // eslint-disable-line react-hooks/exhaustive-deps
  const pages = Math.max(1, Math.ceil(rows.length / size)); const cur = Math.min(page, pages);
  const shown = rows.slice((cur - 1) * size, cur * size);
  const keys = rows.map(p.rowKey);
  const chipCounts = (c: RlChip<T>) => { const m = new Map<string, number>(); for (const r of filterRows(p.rows, { ...st, strip: null }, def, c.key).base) for (const v of asArr(c.get(r))) m.set(v, (m.get(v) ?? 0) + 1); return m; };
  const filtersOn = Object.values(st.chips).some((v) => v.length) || !!st.adv || !!st.q || Object.values(st.col).some((v) => v.length) || !!st.strip;
  const clearAll = () => set({ chips: {}, adv: null, q: "", col: {}, strip: null });
  const summary = [
    ...p.chips.filter((c) => st.chips[c.key]?.length).map((c) => `${c.label}: ${st.chips[c.key]!.map((v) => c.options.find((o) => o.value === v)?.label ?? v).join("، ")}`),
    ...(st.adv ? [tx(ar, `Advanced: ${st.adv.groups.reduce((a, g) => a + g.rules.length, 0)} rules`, `متقدم: ${st.adv.groups.reduce((a, g) => a + g.rules.length, 0)} شروط`)] : []),
    ...(st.q ? [`${tx(ar, "Search", "بحث")}: ${st.q}`] : []), ...(st.strip ? [`${tx(ar, "State", "الحالة")}: ${st.strip}`] : []),
  ];
  const visibleChips = p.chips.filter((c) => !c.more || more.includes(c.key) || st.chips[c.key]?.length);
  const hiddenChips = p.chips.filter((c) => c.more && !visibleChips.includes(c));
  const onRow = (e: MouseEvent<HTMLElement>, r: T) => {
    if ((e.target as HTMLElement).closest("a, button, input, select, label, textarea, [data-rl-stop]")) return;
    if ((e.metaKey || e.ctrlKey) && p.onOpenFull) { e.preventDefault(); p.onOpenFull(r); return; }
    p.onOpen?.(r, keys, e.currentTarget);
  };
  const onRowKey = (e: KeyboardEvent<HTMLElement>, r: T) => { if (e.key === "Enter" && e.target === e.currentTarget) { if ((e.metaKey || e.ctrlKey) && p.onOpenFull) p.onOpenFull(r); else p.onOpen?.(r, keys, e.currentTarget); } };
  const amountCols = cols.filter((c) => c.amount);
  const totalOf = (c: RlColumn<T>, xs: T[]) => xs.reduce((a, r) => a + (c.amount!(r) || 0), 0);
  // owner SH-05: a list of a kind that has a 360 profile carries the «360» button on every row (Open360 checks read access)
  const has360 = PROFILES_360.some((x) => x.doctype === p.doctype) && !p.rowActions?.some((a) => a.key === "360"); const hasActs = !!p.rowActions?.length || has360;
  const tableRows = (xs: T[]) => xs.map((r) => { const k = p.rowKey(r); const tone = p.tone?.(r);
    return <tr key={k} className="ek-rl-row" tabIndex={0} data-tone={tone} data-selected={sel.has(k) || undefined} onClick={(e) => onRow(e, r)} onKeyDown={(e) => onRowKey(e, r)} data-rl-row={k}>
      <td className="ek-rl-sel" data-rl-stop><input type="checkbox" checked={sel.has(k)} onChange={(e) => setSel((x) => { const n = new Set(x); if (e.target.checked) n.add(k); else n.delete(k); return n; })} aria-label={tx(ar, "Select", "تحديد")} data-rl-select={k} /></td>
      {cols.map((c, i) => <td key={c.key} data-label={c.label} data-col={c.key} data-pin={i === 0 && pin ? "" : undefined} data-align={c.align} style={c.minWidth ? { minWidth: c.minWidth } : undefined}>{c.render(r)}</td>)}
      {hasActs ? <td className="ek-rl-acts" data-rl-stop><span className="ek-rl-actbar">{has360 && <Open360 doctype={p.doctype} name={k} compact className="dx-360 ek-rl-360" />}{(p.rowActions ?? []).filter((a) => !a.hidden?.(r)).map((a) => <button key={a.key} type="button" title={a.label} aria-label={a.label} onClick={(e) => a.run(r, e.currentTarget)} data-rl-act={a.key}>{a.icon}</button>)}</span></td> : null}
    </tr>; });
  const allOnPage = shown.length > 0 && shown.every((r) => sel.has(p.rowKey(r)));
  const grp = p.groups?.find((g) => g.key === groupBy);
  return <section className="ek-card ek-rl" data-rl={p.id} data-rl-mode={mode} data-rl-count={rows.length}>
    <header className="ek-rl-head">
      <div className="min-w-0 flex-1"><h2 className="ek-h3">{p.title}</h2></div>
      <span className="ek-seg" role="radiogroup" aria-label={tx(ar, "View", "طريقة العرض")} data-rl-modes>
        <button type="button" role="radio" aria-checked={mode === "table"} onClick={() => setMode("table")} data-rl-mode-btn="table">{tx(ar, "Table", "جدول")}</button>
        {p.kanban && <button type="button" role="radio" aria-checked={mode === "kanban"} onClick={() => setMode("kanban")} data-rl-mode-btn="kanban">{tx(ar, "Kanban by status", "كانبان حسب الحالة")}</button>}
        {p.groups?.length ? <button type="button" role="radio" aria-checked={mode === "group"} onClick={() => setMode("group")} data-rl-mode-btn="group">{tx(ar, "Grouped", "مجمّع")}</button> : null}
        {p.calendar && <button type="button" role="radio" aria-checked={mode === "calendar"} onClick={() => setMode("calendar")} data-rl-mode-btn="calendar">{tx(ar, "Calendar", "تقويم")}</button>}
      </span>
      {p.actions}
    </header>
    <nav className="ek-rl-views" aria-label={tx(ar, "Saved views", "العروض المحفوظة")} data-rl-views>
      {p.views.map((v) => { const n = filterRows(p.rows, { ...emptyState(v.key) }, def).base.length; return <button key={v.key} type="button" className="ek-rl-view" aria-pressed={!saved && st.view === v.key} onClick={() => { setSaved(null); setSt(emptyState(v.key)); setPage(1); }} data-rl-view={v.key}>{v.label} <bdi className="tabular-nums" data-no-i18n>{n}</bdi></button>; })}
      {savedViews.map((v) => <ViewChip key={v.id} v={v} ar={ar} active={saved === v.id} onApply={() => { setSaved(v.id); setSt({ ...emptyState(p.views[0]?.key ?? ""), ...(v.payload as Partial<ListState>) }); setPage(1); }} onShare={() => setSave(v)} onDelete={() => { deleteView(v.id, user); if (saved === v.id) setSaved(null); }} />)}
      <button type="button" className="ek-rl-view ek-rl-addview" onClick={() => setSave("new")} data-rl-add-view>+ {tx(ar, "View", "عرض")}</button>
      {dirty && <EntPopover width={240} align="end" trigger={<button type="button" className="ek-rl-dirty" data-rl-dirty>{tx(ar, "Save changes", "احفظ التعديلات")}</button>}>
        <ul className="ek-menu">
          <li><button type="button" onClick={() => setSave("new")} data-rl-save-new>{tx(ar, "Save as a new view", "حفظ كعرض جديد")}</button></li>
          {activeSaved && activeSaved.owner === user && <li><button type="button" onClick={() => { updateView(activeSaved.id, { payload: { ...st } as unknown as Record<string, unknown> }, user); }} data-rl-save-update>{tx(ar, `Update «${activeSaved.title}»`, `تحديث «${activeSaved.title}»`)}</button></li>}
          <li><button type="button" onClick={() => setSt(baseline)} data-rl-save-discard>{tx(ar, "Discard changes", "تجاهل التعديلات")}</button></li>
        </ul></EntPopover>}
    </nav>
    <div className="ek-rl-filters" data-rl-filters>
      <input className="field-input ek-rl-search" value={st.q} onChange={(e) => set({ q: e.target.value })} placeholder={tx(ar, "Search name, company, phone…", "ابحث بالاسم أو الشركة أو الجوال…")} aria-label={tx(ar, "Search", "بحث")} data-rl-search />
      {visibleChips.map((c) => <ChipFilter key={c.key} chip={c} ar={ar} value={st.chips[c.key] ?? []} counts={chipCounts(c)} onChange={(v) => set({ chips: { ...st.chips, [c.key]: v } })} />)}
      {hiddenChips.length > 0 && <EntPopover width={220} trigger={<button type="button" className="ek-rl-chip" data-rl-more>+ {tx(ar, "More", "المزيد")}</button>}>
        <ul className="ek-menu">{hiddenChips.map((c) => <li key={c.key}><button type="button" onClick={() => setMore((m) => [...m, c.key])} data-rl-more-add={c.key}>{c.label}</button></li>)}</ul></EntPopover>}
      <button type="button" className="ek-rl-tool" onClick={() => setAdv(true)} data-on={st.adv ? "" : undefined} data-rl-adv>{tx(ar, "Advanced filters", "فلاتر متقدمة")}{st.adv ? ` (${st.adv.groups.reduce((a, g) => a + g.rules.length, 0)})` : ""}</button>
      {filtersOn && <button type="button" className="ek-rl-link" onClick={clearAll} data-rl-clear>{tx(ar, "Clear all", "مسح الكل")}</button>}
      <span className="ms-auto" />
      {mode === "group" && p.groups && <label className="ek-rl-grpby">{tx(ar, "Group by", "تجميع حسب")} <select className="field-input min-h-9 text-xs" value={groupBy} onChange={(e) => setGroupBy(e.target.value)} data-rl-groupby>{p.groups.map((g) => <option key={g.key} value={g.key}>{g.label}</option>)}</select></label>}
      {mode !== "kanban" && mode !== "calendar" && <ColumnManager cols={p.columns} order={order} hidden={hidden} pin={pin} ar={ar} onChange={(o, h, pn) => saveLayout(o, h, pn)} onReset={() => setListLayout(p.id, null)} />}
    </div>
    {p.strip && <div className="ek-rl-strip" data-rl-strip-total={base.length}><StatusStrip tabs={p.strip.tabs(base)} active={st.strip ?? undefined} onPick={(k) => set({ strip: k ?? null })} ar={ar} label={tx(ar, "States", "الحالات")} /></div>}
    {sel.size > 0 && <div className="ek-rl-bulk" role="toolbar" aria-label={tx(ar, "Selected records", "السجلات المحددة")} data-rl-bulk={sel.size}>
      <b>{tx(ar, `${sel.size} selected`, `تم تحديد ${sel.size}`)}</b>
      {sel.size < rows.length && <button type="button" className="ek-rl-link" onClick={() => setSel(new Set(keys))} data-rl-select-all>{tx(ar, `Select all ${rows.length}`, `تحديد كل ${rows.length}`)}</button>}
      {(p.bulk ?? []).map((b) => { const off = b.blocked ?? (b.min && sel.size < b.min ? tx(ar, `Select at least ${b.min}`, `حدّد ${b.min} على الأقل`) : b.max && sel.size > b.max ? tx(ar, `Select exactly ${b.max}`, `حدّد ${b.max} فقط`) : undefined);
        return <button key={b.key} type="button" className="ek-rl-bulkbtn" data-tone={b.tone} disabled={!!off} title={off} onClick={() => b.run([...sel])} data-rl-bulk-act={b.key}>{b.icon}{b.label}</button>; })}
      <button type="button" className="ek-rl-link ms-auto" onClick={() => setSel(new Set())} data-rl-unselect>{tx(ar, "Clear selection", "إلغاء التحديد")}</button>
    </div>}
    {!p.rows.length ? <div className="ek-rl-empty" data-rl-empty="none"><p className="ek-rl-empty-t">{p.empty.title}</p>{p.empty.hint && <p>{p.empty.hint}</p>}{p.empty.action}</div>
      : !rows.length ? <div className="ek-rl-empty" data-rl-empty="filter"><p className="ek-rl-empty-t">{tx(ar, "No records match the current filters", "لا توجد سجلات تطابق الفلاتر الحالية")}</p><p>{tx(ar, `${p.rows.length} records exist; the filters hide them all.`, `يوجد ${p.rows.length} سجلًا، والفلاتر الحالية تخفيها كلها.`)}</p><button type="button" className="btn-primary" onClick={clearAll} data-rl-empty-clear>{tx(ar, "Clear filters", "مسح الفلاتر")}</button></div>
      : mode === "calendar" && p.calendar ? <RlCalendarView rows={rows} cal={p.calendar} ar={ar} onOpen={(r, el) => p.onOpen?.(r, keys, el)} rowKey={p.rowKey} />
      : mode === "kanban" && p.kanban ? <StageBoard ar={ar} columns={p.kanban.columns.map((c) => { const xs = rows.filter((r) => p.kanban!.of(r) === c.key); return { key: c.key, label: c.label, hue: c.hue, tinted: true, count: xs.length, totalText: amountCols[0]?.amountText ? amountCols[0].amountText(totalOf(amountCols[0], xs)) : "", cards: xs.map(p.kanban!.card) }; })} onDropCard={p.kanban.onDrop} attrs={{ "data-rl-kanban": String(rows.length) }} />
      : <div className="ek-rl-scroll"><table className="ek-rl-table" data-pin={pin ? "" : undefined} data-narrow={narrow ? "" : undefined}>
        <thead><tr>
          <th className="ek-rl-sel"><input type="checkbox" checked={allOnPage} onChange={(e) => setSel((x) => { const n = new Set(x); for (const r of shown) { if (e.target.checked) n.add(p.rowKey(r)); else n.delete(p.rowKey(r)); } return n; })} aria-label={tx(ar, "Select the page", "تحديد الصفحة")} data-rl-select-page /></th>
          {cols.map((c, i) => <th key={c.key} data-col={c.key} data-pin={i === 0 && pin ? "" : undefined} data-align={c.align} aria-sort={st.sort?.key === c.key ? (st.sort.dir === "asc" ? "ascending" : "descending") : undefined}>
            <span className="ek-rl-th">{c.sortValue ? <button type="button" onClick={() => set({ sort: st.sort?.key !== c.key ? { key: c.key, dir: "asc" } : st.sort.dir === "asc" ? { key: c.key, dir: "desc" } : null })} data-rl-sort={c.key}>{c.label}<span aria-hidden className="ek-rl-arrow">{st.sort?.key === c.key ? (st.sort.dir === "asc" ? "▲" : "▼") : "↕"}</span></button> : <span>{c.label}</span>}
              {(c.filterValue || c.filterOptions) && <HeaderFilter col={c} ar={ar} value={st.col[c.key] ?? []} onChange={(v) => set({ col: { ...st.col, [c.key]: v } })} />}</span></th>)}
          {hasActs ? <th className="ek-rl-acts"><span className="sr-only">{tx(ar, "Actions", "إجراءات")}</span></th> : null}
        </tr></thead>
        <tbody>{mode === "group" && grp ? (() => { const groups = new Map<string, T[]>(); for (const r of shown) { const g = grp.of(r) || "—"; groups.set(g, [...(groups.get(g) ?? []), r]); }
            return [...groups.entries()].sort((a, b) => b[1].length - a[1].length).flatMap(([g, xs]) => { const all = rows.filter((r) => (grp.of(r) || "—") === g);
              return [<tr key={`g:${g}`} className="ek-rl-grouprow" data-rl-group-row={g}><td colSpan={cols.length + 1 + (hasActs ? 1 : 0)}><b>{grp.labelOf ? grp.labelOf(g) : g}</b> <bdi className="tabular-nums" data-no-i18n>{all.length}</bdi>{amountCols.map((c) => <span key={c.key} className="ek-rl-grouptot">{c.label} <bdi dir="ltr" data-no-i18n>{c.amountText ? c.amountText(totalOf(c, all)) : totalOf(c, all)}</bdi></span>)}</td></tr>, ...tableRows(xs)]; }); })()
          : tableRows(shown)}</tbody>
        {amountCols.length > 0 && <tfoot><tr data-rl-totals><td />{cols.map((c, i) => <td key={c.key} data-label={c.label} data-align={c.align}>{i === 0 ? <b>{tx(ar, `Total of ${rows.length}`, `إجمالي ${rows.length}`)}</b> : c.amount ? <b dir="ltr" data-no-i18n data-rl-total={c.key} data-value={Math.round(totalOf(c, rows) * 100) / 100}>{c.amountText ? c.amountText(totalOf(c, rows)) : totalOf(c, rows)}</b> : null}</td>)}{p.rowActions?.length ? <td /> : null}</tr></tfoot>}
      </table></div>}
    {rows.length > 0 && mode !== "kanban" && mode !== "calendar" && <footer className="ek-rl-foot" data-rl-foot>
      <span>{tx(ar, `${rows.length} records`, `${rows.length} سجل`)}{rows.length !== p.rows.length ? tx(ar, ` of ${p.rows.length}`, ` من ${p.rows.length}`) : ""}</span>
      <label>{tx(ar, "Rows per page", "صفوف في الصفحة")} <select className="field-input min-h-8 text-xs" value={size} onChange={(e) => { saveLayout(order, hidden, pin, Number(e.target.value)); setPage(1); }} data-rl-size>{[10, 25, 50, 100].map((n) => <option key={n} value={n}>{n}</option>)}</select></label>
      <span className="ek-rl-pager"><button type="button" disabled={cur <= 1} onClick={() => setPage(cur - 1)} aria-label={tx(ar, "Previous page", "الصفحة السابقة")} data-rl-prev><span className="rtl:-scale-x-100 inline-block">‹</span></button>
        <span data-rl-page={cur}>{tx(ar, `Page ${cur} of ${pages}`, `صفحة ${cur} من ${pages}`)}</span>
        <button type="button" disabled={cur >= pages} onClick={() => setPage(cur + 1)} aria-label={tx(ar, "Next page", "الصفحة التالية")} data-rl-next><span className="rtl:-scale-x-100 inline-block">›</span></button></span>
    </footer>}
    <AdvancedPanel open={adv} onOpenChange={setAdv} fields={p.fields} value={st.adv} ar={ar} onApply={(a) => set({ adv: a && a.groups.some((g) => g.rules.length) ? a : null })} preview={(a) => filterRows(p.rows, { ...st, adv: a, strip: null }, def).base.length} />
    {save && <SaveShareDialog open onOpenChange={(o) => { if (!o) setSave(null); }} ar={ar} doctype={p.doctype} surface="list" payload={{ ...st } as unknown as Record<string, unknown>} summary={summary}
      editing={save === "new" ? undefined : save} onSaved={(v) => { setSaved(v.id); setSave(null); }} />}
  </section>;
}
const ymdOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
/** Month grid of the filtered rows (Saturday-first in Arabic, Sunday-first in English); opens on the month of the next dated record. */
function RlCalendarView<T>({ rows, cal, ar, onOpen, rowKey }: { rows: T[]; cal: RlCalendar<T>; ar: boolean; onOpen: (r: T, el: HTMLElement) => void; rowKey: (r: T) => string }) {
  const today = ymdOf(new Date());
  const [month, setMonth] = useState(() => today.slice(0, 7));
  const [open, setOpen] = useState<string | null>(null);
  const byDay = new Map<string, T[]>(); for (const r of rows) { const d = cal.date(r).slice(0, 10); if (d) byDay.set(d, [...(byDay.get(d) ?? []), r]); }
  const [y, m] = month.split("-").map(Number) as [number, number];
  const first = new Date(y, m - 1, 1); const start = ar ? 6 : 0; // Saturday / Sunday
  const lead = (first.getDay() - start + 7) % 7; const days = new Date(y, m, 0).getDate(); const cells = Math.ceil((lead + days) / 7) * 7;
  const dows = Array.from({ length: 7 }, (_, i) => new Date(2024, 0, 6 + ((start + i) % 7)).toLocaleDateString(ar ? "ar-SA-u-ca-gregory-nu-latn" : "en-US", { weekday: "short" }));
  const shift = (k: number) => { const d = new Date(y, m - 1 + k, 1); setMonth(ymdOf(d).slice(0, 7)); setOpen(null); };
  const inMonth = rows.filter((r) => cal.date(r).slice(0, 7) === month).length; const undated = rows.filter((r) => !cal.date(r)).length;
  return <div className="ek-rl-cal" data-rl-calendar={month} data-rl-cal-count={inMonth}>
    <div className="ek-rl-cal-head">
      <button type="button" className="ek-rl-tool" onClick={() => shift(-1)} aria-label={tx(ar, "Previous month", "الشهر السابق")} data-rl-cal-prev><span className="inline-block rtl:-scale-x-100">‹</span></button>
      <b data-no-i18n>{first.toLocaleDateString(ar ? "ar-SA-u-ca-gregory-nu-latn" : "en-US", { month: "long", year: "numeric" })}</b>
      <button type="button" className="ek-rl-tool" onClick={() => shift(1)} aria-label={tx(ar, "Next month", "الشهر التالي")} data-rl-cal-next><span className="inline-block rtl:-scale-x-100">›</span></button>
      <button type="button" className="ek-rl-link" onClick={() => { setMonth(today.slice(0, 7)); setOpen(null); }} data-rl-cal-today>{tx(ar, "Today", "اليوم")}</button>
      <span className="text-xs text-muted-foreground">{tx(ar, `${inMonth} this month`, `${inMonth} في هذا الشهر`)}{undated ? tx(ar, ` · ${undated} without a date`, ` · ${undated} بلا تاريخ`) : ""}</span>
      {cal.legend && <span className="ek-rl-cal-legend">{cal.legend.map((l) => <span key={l.key}><i style={{ background: l.hue }} />{l.label}</span>)}</span>}
    </div>
    <div className="ek-rl-cal-grid" role="grid">
      {dows.map((d) => <div key={d} className="ek-rl-cal-dow" role="columnheader">{d}</div>)}
      {Array.from({ length: cells }, (_, i) => { const day = i - lead + 1; const out = day < 1 || day > days; const date = out ? "" : `${month}-${String(day).padStart(2, "0")}`;
        const xs = date ? byDay.get(date) ?? [] : []; const all = open === date;
        return <div key={i} className="ek-rl-cal-day" role="gridcell" data-out={out || undefined} data-today={date === today || undefined} data-rl-cal-day={date || undefined} data-n={xs.length || undefined}>
          {!out && <span className="ek-rl-cal-n" data-no-i18n>{day}</span>}
          {(all ? xs : xs.slice(0, 3)).map((r) => <button key={rowKey(r)} type="button" className="ek-rl-cal-item" style={{ ["--cal-hue" as string]: cal.hue(r) }} onClick={(e) => onOpen(r, e.currentTarget)} data-rl-cal-item={rowKey(r)}>{cal.label(r)}</button>)}
          {!all && xs.length > 3 && <button type="button" className="ek-rl-cal-more" onClick={() => setOpen(date)} data-rl-cal-more={date}>{tx(ar, `+${xs.length - 3} more`, `+${xs.length - 3} أخرى`)}</button>}
        </div>; })}
    </div>
  </div>;
}
/** Helper for hosts: does a keyboard / mouse event ask for the full record (Ctrl / Cmd)? */
export const wantsFull = (e: { metaKey: boolean; ctrlKey: boolean }) => e.metaKey || e.ctrlKey;
export type { StripTab };
