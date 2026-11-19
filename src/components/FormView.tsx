import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { createContext, useContext, useEffect, useState } from "react";
import { filterReadable, useSessionUser } from "@/lib/session";
import { clientSetQuery, usePluginsVersion } from "@/plugins/runtime";
import { linkFiltersQuery, linkFilterFor, applyLinkFilters } from "@/lib/engines";

const FormCtx = createContext<{ doctype: string; doc: Doc; slots?: Record<string, React.ReactNode> | undefined } | null>(null);
import { indexQuery, loadMeta, LAYOUT_TYPES, TABLE_TYPES, type DocField, type DocTypeMeta } from "@/lib/catalog";
import { adapter, type Doc } from "@/lib/adapter";
import { evalDepends, evalDependsSafe } from "@/lib/depends";
import { ChildTable } from "@/components/form/ChildGrid";
import { LOCAL_FIELD_BUTTONS } from "@/lib/localActions";
import { fieldState, type Over } from "@/lib/formRules";
import { formatValue, NUMERIC } from "@/lib/format";
import { fieldSupport, formatDuration, partsToSeconds, ratingStars, ratingToStars, secondsToParts } from "@/lib/fieldTypes";
import { useLang, t as trDesc } from "@/i18n";
import { Eye, FileText, Users, CalendarDays, MapPin, Coins, ListOrdered, Percent, Truck, Settings2, Building2, Clock, Layers, type LucideIcon } from "lucide-react";
import { openQuickView } from "@/components/enterprise/QuickView";
import { isPlainClick } from "@/lib/reportLinks";
import { LinkCombo, linkTitle, type LinkOption } from "./form/LinkCombo";
import { DateInput } from "@/components/form/DateInput";

interface Section { fieldname?: string | undefined; label?: string | undefined; collapsible?: number | undefined; depends_on?: string | undefined; collapsible_depends_on?: string | undefined; columns: DocField[][] }
interface Tab { fieldname?: string | undefined; label: string; depends_on?: string | undefined; sections: Section[] }

export function layout(fields: DocField[]): Tab[] {
  const tabs: Tab[] = [{ label: "Details", sections: [{ columns: [[]] }] }];
  for (const f of fields) {
    const tab = tabs[tabs.length - 1]!;
    if (f.fieldtype === "Tab Break") { tabs.push({ fieldname: f.fieldname, label: f.label || "Tab", depends_on: f.depends_on, sections: [{ columns: [[]] }] }); continue; }
    if (f.fieldtype === "Section Break") { tab.sections.push({ fieldname: f.fieldname, label: f.label, collapsible: f.collapsible, depends_on: f.depends_on, collapsible_depends_on: (f as { collapsible_depends_on?: string }).collapsible_depends_on, columns: [[]] }); continue; }
    const sec = tab.sections[tab.sections.length - 1]!;
    if (f.fieldtype === "Column Break") { sec.columns.push([]); continue; }
    sec.columns[sec.columns.length - 1]!.push(f);
  }
  tabs.forEach((t) => (t.sections = t.sections.filter((s) => s.columns.some((c) => c.length))));
  return tabs.filter((t) => t.sections.length);
}

/** htmlSlots: client renderers for source HTML placeholders (e.g. Customer overview_html); extraTabs: form dashboard tabs such as Connections. */
export function FormView({ meta, doc, dev, onChange, onSeed, over, allTabs, htmlSlots, extraTabs, tabRequest }: { meta: DocTypeMeta; doc: Doc; dev: boolean; onChange: (p: Record<string, unknown>) => void; onSeed?: (p: Record<string, unknown>) => void; over?: Over | undefined; allTabs?: boolean; htmlSlots?: Record<string, React.ReactNode>; extraTabs?: { label: string; node: React.ReactNode }[]; tabRequest?: { label: string; n: number } | undefined }) {
  const tabs = layout(meta.fields);
  // Tab/Section visibility: depends_on plus form-script overrides (form_rules.json) keyed by the break's fieldname.
  const shown = (fn: string | undefined, dep: string | undefined) => (fn && over?.[fn]?.hidden !== undefined ? !over[fn]!.hidden : evalDepends(dep, doc));
  const [tab, setTab] = useState(0);
  const locked = (doc.docstatus ?? 0) > 0;
  // frappe/public/js/frappe/form/controls/base_control.js get_status: a field in "Read" status with no value is "None" (hidden);
  // layout.js hides sections/tabs whose fields are all hidden.
  const vis = (f: DocField) => dev || (!fieldState(f, doc, over).hidden && !(isRead(f, doc, over, locked) && emptyValue(f, doc)));
  // sections holding only HTML placeholders (server-rendered dashboards) render nothing, so they do not count as content
  const counts = (f: DocField) => vis(f) && (!!(f.fieldname && htmlSlots?.[f.fieldname]) || !(LAYOUT_TYPES.has(f.fieldtype) && f.fieldtype !== "Button" && f.fieldtype !== "Heading"));
  const secVis = (s: Section) => dev || (shown(s.fieldname, s.depends_on) && s.columns.some((c) => c.some(counts)));
  const srcTabs = tabs.filter((t) => dev || (shown(t.fieldname, t.depends_on) && t.sections.some(secVis)));
  const extra = (extraTabs ?? []).filter((e) => !srcTabs.some((t) => t.label === e.label));
  // frappe form/dashboard.js: the dashboard renders at the top of the source tab of the same name (e.g. the
  // Purchase Order "Connections" Tab Break that an app filled with a Custom Field), never instead of it.
  const inTab = (label: string) => (extraTabs ?? []).find((e) => e.label === label);
  const labels = [...srcTabs.map((t) => t.label), ...extra.map((e) => e.label)];
  const ti = Math.min(tab, labels.length - 1);
  useEffect(() => { if (tabRequest) { const i = labels.indexOf(tabRequest.label); if (i >= 0) setTab(i); } }, [tabRequest?.n]);
  const visibleTabs = srcTabs;
  const cur = ti < srcTabs.length ? srcTabs[ti] : undefined;
  const curExtra = ti >= srcTabs.length ? extra[ti - srcTabs.length] : undefined;
  return (
    <FormCtx.Provider value={{ doctype: meta.name, doc, slots: htmlSlots }}>
    <div>
      {labels.length > 1 && (
        <div className="mb-4 flex gap-1 overflow-x-auto border-b border-border" role="tablist">
          {labels.map((l, i) => <button key={i} type="button" role="tab" aria-selected={i === ti} data-tab-label={l} onClick={() => setTab(i)} className={`whitespace-nowrap border-b-2 px-3 py-2 text-sm ${i === ti ? "border-primary text-foreground" : "border-transparent text-muted-foreground"}`}>{l}</button>)}
        </div>
      )}
      {curExtra && !allTabs && <div data-extra-tab={curExtra.label}>{curExtra.node}</div>}
      {(allTabs ? visibleTabs : cur ? [cur] : []).map((tb, ti) => <div key={ti} data-field={tb.fieldname} data-tab>{!allTabs && inTab(tb.label) && <div data-extra-tab={tb.label} className="mb-4">{inTab(tb.label)!.node}</div>}{((secs: Section[]) => { const sec2 = secondaryFlags(secs, doc, locked); return secs.map((s, si) => (
        <SectionBox key={s.fieldname ?? `s${si}`} s={s} doc={doc} expand={allTabs} index={si} secondary={sec2[si]!} shownFields={s.columns.flat().filter((f) => vis(f) && !LAYOUT_TYPES.has(f.fieldtype)).length}>
          <div className="grid gap-6 dx-sec-cols" style={{ "--sec-cols": s.columns.length } as React.CSSProperties}>
            {s.columns.map((col, ci) => (
              <div key={ci} className="space-y-3">
                {col.filter(vis).map((f, fi) => (
                  <FieldControl key={f.fieldname ?? fi} f={f} doc={doc} dev={dev} over={over} locked={locked && !f['allow_on_submit']} onChange={onChange} onSeed={onSeed} />
                ))}
              </div>
            ))}
          </div>
        </SectionBox>
      )); })(tb.sections.filter(secVis))}</div>)}
    </div>
    </FormCtx.Provider>
  );
}

const NO_READ_HIDE = new Set(["Check", "HTML", "Button", "Heading", "Image", "Table", "Table MultiSelect"]);
function isRead(f: DocField, doc: Doc, over: Over | undefined, locked: boolean) {
  return locked && !f["allow_on_submit"] ? true : fieldState(f, doc, over).ro || (!!f.fetch_from && !f["fetch_if_empty"]);
}
function emptyValue(f: DocField, doc: Doc) {
  if (NO_READ_HIDE.has(f.fieldtype) || LAYOUT_TYPES.has(f.fieldtype) || !f.fieldname) return false;
  const v = doc[f.fieldname];
  return v === undefined || v === null || v === "" || (["Int", "Float", "Currency", "Percent"].includes(f.fieldtype) && false);
}

/* Owner notes round 2026-11-17 (A-05): every section is a coloured card with an icon tile; on a submitted / cancelled
 * document the main sections (first section, child tables with rows, required, bold or total fields) stay open and the
 * secondary ones start collapsed — nothing is removed, a click opens them. Drafts keep the source collapse rules. */
const SEC_HUES = ["emerald", "blue", "violet", "amber", "teal", "coral", "gold", "lime"] as const;
const SEC_ICONS: [RegExp, LucideIcon][] = [
  [/item|product|line|material|bom|component|stock/i, ListOrdered], [/tax|vat|zakat|withholding/i, Percent], [/address|location|territory|city|shipping address/i, MapPin],
  [/deliver|ship|transport|dispatch/i, Truck], [/total|amount|payment|price|currency|rate|cost|budget|salary|earning|deduction|account/i, Coins],
  [/date|schedule|period|time sheet|timesheet|validity/i, CalendarDays], [/customer|supplier|party|contact|employee|person|sales team|owner|user/i, Users],
  [/company|dimension|cost center|department|branch/i, Building2], [/time|duration|hour/i, Clock], [/more|setting|other|additional|print/i, Settings2], [/./, FileText],
];
const sectionIcon = (label: string | undefined): LucideIcon => (label ? SEC_ICONS.find(([re]) => re.test(label))?.[1] : undefined) ?? Layers;
function mainSection(s: Section, doc: Doc): boolean {
  return s.columns.flat().some((f) => (TABLE_TYPES.has(f.fieldtype) && Array.isArray(doc[f.fieldname ?? ""]) && (doc[f.fieldname ?? ""] as unknown[]).length > 0)
    || !!Number(f.reqd ?? 0) || !!Number(f.bold ?? 0) || /^(grand_total|rounded_total|outstanding_amount|total|net_total|paid_amount)$/.test(f.fieldname ?? ""));
}
/** A labelled section and the unlabelled sections that continue it form one group: the group is secondary (collapsed on a
 *  posted document) only when none of its sections holds a main field, so «Items» never folds above its own table. */
function secondaryFlags(secs: Section[], doc: Doc, locked: boolean): boolean[] {
  const start = secs.map((_, i) => { let j = i; while (j > 0 && !secs[j]!.label) j--; return j; });
  const main = new Map<number, boolean>();
  start.forEach((j, i) => main.set(j, (main.get(j) ?? false) || mainSection(secs[i]!, doc)));
  return secs.map((_, i) => locked && start[i]! > 0 && !main.get(start[i]!));
}
function SectionBox({ s, doc, children, expand, index = 0, secondary = false, shownFields = 0 }: { s: Section; doc: Doc; children: React.ReactNode; expand?: boolean | undefined; index?: number; secondary?: boolean; shownFields?: number }) {
  const [open, setOpen] = useState((!s.collapsible && !secondary) || !!expand);
  // collapsible_depends_on (frappe form/section.js): section is expanded while the expression is true.
  const cdo = s.collapsible_depends_on ? evalDepends(s.collapsible_depends_on, doc) : null;
  useEffect(() => { if (cdo !== null && !expand) setOpen(cdo); }, [cdo, expand]);
  const toggles = !!s.collapsible || secondary;
  const Icon = sectionIcon(s.label);
  return (
    <section className="panel dx-sec mb-4 p-4" data-field={s.fieldname} data-sec-card data-hue={SEC_HUES[index % SEC_HUES.length]} data-sec-secondary={secondary || undefined} data-sec-open={open ? "1" : "0"}>
      {s.label ? <button type="button" disabled={!toggles} onClick={() => setOpen(!open)} className="dx-sec-h" aria-expanded={toggles ? open : undefined}>
        <span className="dx-sec-ico" aria-hidden><Icon className="h-4 w-4" /></span><span className="dx-sec-t">{s.label}</span>
        {toggles && !open && shownFields > 0 && <span className="dx-sec-n" data-no-i18n>{shownFields}</span>}{toggles && <span className="dx-sec-chev" aria-hidden>{open ? "▾" : "▸"}</span>}</button>
        : secondary && !open ? <button type="button" onClick={() => setOpen(true)} className="dx-sec-h"><span className="dx-sec-ico" aria-hidden><Icon className="h-4 w-4" /></span><span className="dx-sec-t">{trDesc("More details")}</span><span className="dx-sec-chev" aria-hidden>▸</span></button> : null}
      {open && children}
    </section>
  );
}

function DevTag({ f }: { f: DocField }) {
  const unsupported = [f.depends_on, f.mandatory_depends_on, f.read_only_depends_on].filter((e) => e && !evalDependsSafe(e as string, {}).supported);
  return (
    <span className="ml-1 font-mono text-[10px] text-dev">
      {f.fieldname} · {f.fieldtype}{f.options ? ` · ${String(f.options).split("\n")[0]}` : ""}{f.hidden ? " · hidden" : ""}{f.depends_on ? ` · depends_on: ${f.depends_on}` : ""}{f.fetch_from ? ` · fetch_from: ${f.fetch_from}` : ""}{unsupported.length ? " · ⚠ unsupported expression (shown by default)" : ""}
    </span>
  );
}

function FieldControl(p: { f: DocField; doc: Doc; dev: boolean; over?: Over | undefined; locked: boolean; onChange: (p: Record<string, unknown>) => void; onSeed?: ((p: Record<string, unknown>) => void) | undefined }) {
  const st = fieldState(p.f, p.doc, p.over);
  // "Read Only" fieldtype (fetch display) is never editable in frappe
  const ro = p.locked || st.ro || (!!p.f.fetch_from && !p.f["fetch_if_empty"]) || p.f.fieldtype === "Read Only";
  return <div data-field={p.f.fieldname} data-reqd={st.reqd ? 1 : 0} data-ro={ro ? 1 : 0} data-fieldtype={p.f.fieldtype}><FieldInner {...p} reqd={st.reqd} ro={ro} /></div>;
}

/** Read-only display text for field types whose stored value is not human readable as-is (fieldTypes.ts registry). */
function displayText(f: DocField, v: unknown, doc: Doc): string {
  if (f.fieldtype === "Duration") return v === undefined || v === null || v === "" ? "" : formatDuration(v, { hide_days: !!f["hide_days"], hide_seconds: !!f["hide_seconds"] });
  if (f.fieldtype === "Rating") { const n = ratingStars(f.options); const s = ratingToStars(v, n); return "★".repeat(s) + "☆".repeat(Math.max(0, n - s)); }
  if (f.fieldtype === "Password") return v ? "••••••••" : "";
  if (v !== null && typeof v === "object") return JSON.stringify(v);
  return formatValue(f.fieldtype, v, { options: f.options, doc });
}

function FieldInner({ f, doc, dev, reqd, ro, onChange, onSeed }: { reqd: boolean; ro: boolean; f: DocField; doc: Doc; dev: boolean; locked: boolean; onChange: (p: Record<string, unknown>) => void; onSeed?: ((p: Record<string, unknown>) => void) | undefined }) {
  const name = f.fieldname!;
  const ctx = useContext(FormCtx);
  const ar = useLang() === "ar";
  const slot = (n: string) => ctx?.slots?.[n];
  const v = name ? doc[name] : undefined;
  const set = (x: unknown) => onChange({ [name]: x });
  const sup = fieldSupport(f.fieldtype);
  // limitation notes are preview diagnostics (Developer mode) except for controls that are not available at all
  const note = (sup.note || sup.note_ar) && (dev || sup.mode === "READ_ONLY_EXPLICIT") ? <p className="mt-0.5 text-[10px] text-muted-foreground" data-field-support={sup.mode} data-no-i18n>{ar ? sup.note_ar : sup.note}</p> : null;
  const label = (
    <label className="mb-1 block text-xs text-muted-foreground">
      {f.label ?? name}{reqd ? <span className="text-destructive"> *</span> : null}{dev && <DevTag f={f} />}
    </label>
  );
  if (f.fieldtype === "Heading") return <h4 className="font-semibold">{f.label}</h4>;
  if (f.fieldtype === "HTML" && name && slot(name)) return <div data-html-slot={name}>{slot(name)}</div>;
  // Image: shows the image URL held by the field named in options (frappe ImageControl)
  if (f.fieldtype === "Image" && !dev) { const src = f.options ? doc[f.options] : undefined; return typeof src === "string" && src ? <img src={src} alt={f.label ?? name} data-image-field={name} className="max-h-40 rounded border border-border object-contain" /> : null; }
  if (LAYOUT_TYPES.has(f.fieldtype)) return dev ? <div className="text-xs text-muted-foreground">[{f.fieldtype}] {f.label}<DevTag f={f} /></div> : f.fieldtype === "Button" ? <button type="button" className="btn-ghost" data-button={name} onClick={() => { const h = LOCAL_FIELD_BUTTONS[`${ctx?.doctype ?? ""}::${name}`]; if (!h) return; try { onChange(h(doc)); } catch (e) { alert((e as Error).message); } }}>{f.label}</button> : null;
  if (TABLE_TYPES.has(f.fieldtype)) return <div>{label}<ChildTable f={f} rows={(v as Doc[]) ?? null} ro={ro} parent={doc} onChange={set} onSeed={(r) => onSeed?.({ [name]: r })} /></div>;
  // explicit read-only state for source controls the virtual Core does not have (map, signature pad, barcode, icon picker, unknown types)
  if (sup.mode === "READ_ONLY_EXPLICIT") return <div data-read data-unsupported-field={f.fieldtype}>{label}<div data-no-i18n dir="ltr" className="min-h-8 whitespace-pre-wrap break-words rounded-md border border-dashed border-border bg-muted/30 px-2 py-1.5 font-mono text-xs">{displayText(f, v, doc) || "—"}</div>{note}</div>;

  // read-only Link and Dynamic Link keep their open-record arrow (frappe ControlDynamicLink extends ControlLink)
  if (ro && !dev && !["Link", "Dynamic Link", "Attach", "Attach Image", "Select", "Check", "Heading", "HTML", "Button", "Table", "Table MultiSelect", "Image", "Fold", "Section Break", "Column Break", "Tab Break", "Color"].includes(f.fieldtype)) {
    const num = NUMERIC.has(f.fieldtype);
    const txt = displayText(f, v, doc);
    return <div data-read>{label}<div data-no-i18n dir={num ? undefined : "auto"} data-value={f.fieldtype === "Password" ? "" : String(v ?? "")} data-formatted={txt} className={`bidi-iso min-h-8 rounded-md bg-muted/40 px-2 py-1.5 text-sm ${num ? "text-end tabular-nums" : "whitespace-pre-wrap break-words"} ${f["bold"] ? "font-semibold" : ""}`}>{txt}</div></div>;
  }
  if (ro && !dev && f.fieldtype === "Select") return <div data-read>{label}<div dir="auto" className="bidi-iso min-h-8 rounded-md bg-muted/40 px-2 py-1.5 text-sm" data-value={String(v ?? "")}>{String(v ?? "")}</div></div>;
  let input: React.ReactNode;
  switch (f.fieldtype) {
    case "Check": return <div data-check={name}><label className="flex items-center gap-2 text-sm">{ro
      ? <span role="checkbox" aria-checked={!!v} aria-disabled data-checkbox data-value={v ? 1 : 0} className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[11px] leading-none ${v ? "border-primary bg-primary text-primary-foreground" : "border-foreground/40 bg-card"}`}>{v ? "✓" : ""}</span>
      : <input type="checkbox" data-checkbox className="h-4 w-4 shrink-0 accent-primary" checked={!!v} onChange={(e) => set(e.target.checked ? 1 : 0)} />}<span>{f.label ?? name}</span>{dev && <DevTag f={f} />}</label>{f.description && <FieldDescription text={f.description} />}</div>;
    case "Select": input = <select dir="auto" className="field-input bidi-iso" disabled={ro} value={String(v ?? "")} onChange={(e) => set(e.target.value)}>{(f.options || "").split("\n").map((o) => <option key={o} value={o} dir="auto" {...(/[.#-]/.test(o) ? { "data-no-i18n": true } : {})}>{o}</option>)}</select>; break;
    case "Small Text": case "Text": case "Long Text": case "Text Editor": case "Markdown Editor": case "HTML Editor":
      input = <textarea data-no-i18n className="field-input min-h-20" disabled={ro} value={String(v ?? "")} placeholder={typeof f["placeholder"] === "string" ? f["placeholder"] : undefined} onChange={(e) => set(e.target.value)} />; break;
    case "Code": case "JSON": {
      const txt = typeof v === "object" && v !== null ? JSON.stringify(v, null, 1) : String(v ?? "");
      const bad = f.fieldtype === "JSON" && txt.trim() !== "" && (() => { try { JSON.parse(txt); return false; } catch { return true; } })();
      input = <><textarea data-no-i18n dir="ltr" spellCheck={false} className={`field-input min-h-24 font-mono text-xs ${bad ? "border-destructive" : ""}`} disabled={ro} value={txt} onChange={(e) => set(e.target.value)} aria-invalid={bad || undefined} />{bad && <p className="mt-0.5 text-[11px] text-destructive" data-no-i18n>{ar ? "صيغة JSON غير صالحة" : "Invalid JSON"}</p>}{f.options && <p className="mt-0.5 text-[10px] text-muted-foreground" data-no-i18n>{f.options}</p>}</>; break;
    }
    case "Int": case "Float": case "Currency": case "Percent":
      input = <NumInput f={f} v={v} doc={doc} ro={ro} set={set} />; break;
    case "Attach": case "Attach Image":
      input = <div className="flex items-center gap-2"><input type="file" disabled={ro} className="text-xs" aria-label={f.label ?? name} onChange={(e) => set(e.target.files?.[0] ? `/files/${e.target.files[0].name}` : "")} />{v ? <span className="truncate text-xs text-muted-foreground">{String(v)}</span> : null}</div>;
      return <div>{label}{input}{dev && <p className="mt-0.5 text-[10px] text-muted-foreground">Local simulation: only the file name is stored; no upload happens.</p>}</div>;
    case "Dynamic Link": input = <DynamicLinkInput f={f} v={String(v ?? "")} doc={doc} ro={ro} set={set} />; break;
    case "Datetime": input = <input type="datetime-local" className="field-input" disabled={ro} value={String(v ?? "").replace(" ", "T").slice(0, 16)} onChange={(e) => set(e.target.value.replace("T", " ") + ":00")} />; break;
    case "Time": input = <input type="time" className="field-input" disabled={ro} value={String(v ?? "").slice(0, 5)} onChange={(e) => set(e.target.value + ":00")} />; break;
    case "Date": input = <DateInput className="field-input" disabled={ro} value={String(v ?? "")} onChange={(e) => set(e.target.value)} />; break;
    case "Link": input = <LinkInput f={f} v={String(v ?? "")} ro={ro} set={set} dev={dev} />; break;
    case "Color": input = <div className="flex items-center gap-2"><input type="color" aria-label={f.label ?? name} disabled={ro} className="h-8 w-10 cursor-pointer rounded border border-border bg-card p-0.5" value={/^#[0-9a-f]{6}$/i.test(String(v ?? "")) ? String(v) : "#000000"} onChange={(e) => set(e.target.value)} /><input dir="ltr" data-no-i18n className="field-input w-28 font-mono text-xs" disabled={ro} value={String(v ?? "")} onChange={(e) => set(e.target.value)} /></div>; break;
    case "Duration": input = <DurationInput f={f} v={v} ro={ro} set={set} />; break;
    case "Rating": { const n = ratingStars(f.options); const cur = ratingToStars(v, n);
      input = <div className="flex gap-0.5" role="radiogroup" aria-label={f.label ?? name} data-rating={cur}>{Array.from({ length: n }, (_, i) => <button key={i} type="button" role="radio" aria-checked={cur === i + 1} disabled={ro} aria-label={`${i + 1} / ${n}`} className={`text-lg leading-none ${i < cur ? "text-primary" : "text-muted-foreground"}`} onClick={() => set(cur === i + 1 ? 0 : Math.round(((i + 1) / n) * 1000) / 1000)}>{i < cur ? "★" : "☆"}</button>)}</div>; break; }
    case "Password": input = <input type="password" autoComplete="new-password" className="field-input" disabled={ro} value={String(v ?? "")} onChange={(e) => set(e.target.value)} />; break;
    case "Phone": input = <input type="tel" dir="ltr" data-no-i18n className="field-input" disabled={ro} value={String(v ?? "")} onChange={(e) => set(e.target.value)} />; break;
    case "Autocomplete": { const id = `ac-${name}`; input = <><input list={id} dir="auto" className="field-input bidi-iso" disabled={ro} value={String(v ?? "")} onChange={(e) => set(e.target.value)} /><datalist id={id}>{String(f.options ?? "").split("\n").filter(Boolean).map((o) => <option key={o} value={o} />)}</datalist></>; break; }
    default: input = <input dir="auto" className="field-input bidi-iso" disabled={ro} value={String(v ?? "")} placeholder={typeof f["placeholder"] === "string" ? f["placeholder"] : undefined} onChange={(e) => set(e.target.value)} />;
  }
  return <div>{label}{input}{f.description && <FieldDescription text={f.description} />}{note}</div>;
}

function NumInput({ f, v, doc, ro, set }: { f: DocField; v: unknown; doc: Doc; ro: boolean; set: (x: unknown) => void }) {
  const [focus, setFocus] = useState(false);
  if (ro) return <div data-no-i18n data-value={String(v ?? "")} className="min-h-8 rounded-md bg-muted/40 px-2 py-1.5 text-end text-sm tabular-nums">{formatValue(f.fieldtype, v, { options: f.options, doc })}</div>;
  return focus
    ? <input type="number" autoFocus className="field-input text-end" value={Number(v ?? 0)} onBlur={() => setFocus(false)} onChange={(e) => set(Number(e.target.value))} />
    : <input type="text" readOnly data-no-i18n className="field-input text-end tabular-nums" value={formatValue(f.fieldtype, v, { options: f.options, doc })} onFocus={() => setFocus(true)} aria-label={f.label} />;
}

/** Same-screen look at a linked party, item, account or any record (shared Enterprise Quick View; read permission checked there). */
function QuickPeek({ doctype, name }: { doctype: string; name: string }) {
  const ar = useLang() === "ar";
  const label = ar ? `نظرة سريعة: ${name}` : `Quick view: ${name}`;
  return <button type="button" className="btn-ghost px-2" title={label} aria-label={label} aria-haspopup="dialog" data-quick-peek={`${doctype}:${name}`}
    onClick={(e) => openQuickView({ kind: "doc", doctype, name }, e.currentTarget)}><Eye className="h-4 w-4" aria-hidden /></button>;
}

function LinkInput({ f, v, ro, set, dev }: { f: DocField; v: string; ro: boolean; set: (x: unknown) => void; dev: boolean }) {
  const idx = useQuery(indexQuery);
  const target = idx.data?.find((d) => d.name === f.options);
  const ctx = useContext(FormCtx);
  const lfs = useQuery(linkFiltersQuery);
  const { filters, rule, localPort } = ctx ? linkFilterFor(lfs.data?.[ctx.doctype], f.fieldname ?? "", ctx.doc) : { filters: [], rule: undefined, localPort: undefined };
  const fkey = JSON.stringify(filters);
  const user = useSessionUser(); usePluginsVersion();
  const sq = ctx ? JSON.stringify(clientSetQuery(ctx.doctype, f.fieldname ?? "", ctx.doc)) : "";
  const [opts, setOpts] = useState<LinkOption[]>([]);
  const [titleField, setTitleField] = useState<string | undefined>();
  useEffect(() => {
    if (!idx.data || !f.options) return;
    loadMeta(idx.data, f.options).then((m) => { if (m) { adapter.ensureSeed(m); setTitleField(m.title_field); setOpts(filterReadable(m, applyLinkFilters(m.name, [...JSON.parse(fkey), ...(ctx ? clientSetQuery(ctx.doctype, f.fieldname ?? "", ctx.doc).map((q) => [q[1], q[2], q[3]]) : [])] as never)).filter((d) => !d["__islocal"]).map((d) => ({ value: d.name, title: linkTitle(d, m.title_field) }))); } });
  }, [idx.data, f.options, fkey, user, sq]);
  const exists = target && adapter.get(target.name, v);
  const title = exists && titleField ? String(exists[titleField] ?? "") : "";
  const full = title && title !== v ? `${v}: ${title}` : v;
  if (ro && !dev) return (
    <div {...(/\d|[A-Z]{2,}-/.test(full) ? { "data-no-i18n": true } : {})} data-value={v} title={full} dir="auto" className="bidi-iso min-h-8 break-words rounded-md bg-muted/40 px-2 py-1.5 text-sm">
      {exists ? <Link to="/app/$app/$doctype/$name" params={{ app: target.app, doctype: target.slug, name: v }} className="hover:underline" aria-haspopup="dialog" data-quick-link={`${target.name}:${v}`}
        onClick={(e) => { if (!isPlainClick(e)) return; e.preventDefault(); openQuickView({ kind: "doc", doctype: target.name, name: v }, e.currentTarget); }}>{title && title !== v ? title : v}</Link> : full}
    </div>
  );
  return (
    <div className="flex gap-1">
      <div className="min-w-0 flex-1">
        <LinkCombo value={v} onChange={(x) => set(x)} options={opts} disabled={ro} title={full} ariaLabel={f.label} attrs={{ "data-link-field": f.fieldname }} />
        {title && title !== v && <div className="mt-0.5 truncate text-[11px] text-muted-foreground" data-no-i18n data-link-title title={title}>{title}</div>}
      </div>
      {exists && <QuickPeek doctype={target.name} name={v} />}
      {exists && <Link to="/app/$app/$doctype/$name" params={{ app: target.app, doctype: target.slug, name: v }} className="btn-ghost px-2" title={`Open ${f.options}`}>→</Link>}
      {dev && rule && <span className="chip self-center bg-accent" data-link-filter={f.fieldname} data-local-port={localPort} title={`set_query (${rule.source})${rule.server_query ? ` · server query ${rule.server_query}` : ""}${localPort ? ` · local port (${localPort})` : ""}: ${filters.map((x) => x.join(" ")).join(", ") || "no restriction"}`}>{localPort ? <><span>local port</span> <span data-no-i18n>({filters.length})</span></> : rule.server_query ? "server filter" : <><span>filtered</span> <span data-no-i18n>({filters.length})</span></>}</span>}
      {dev && !target && f.options && <span className="chip self-center bg-muted" title="Target DocType is in DIGIT (not supplied)">{f.options}</span>}
    </div>
  );
}

/** Duration (frappe ControlDuration): days/hours/minutes/seconds parts, stored as total seconds; hide_days / hide_seconds honoured. */
function DurationInput({ f, v, ro, set }: { f: DocField; v: unknown; ro: boolean; set: (x: unknown) => void }) {
  const ar = useLang() === "ar";
  const p = secondsToParts(Number(v) || 0);
  const hideDays = !!f["hide_days"], hideSec = !!f["hide_seconds"];
  const parts = { ...p, hours: hideDays ? p.hours + p.days * 24 : p.hours, days: hideDays ? 0 : p.days };
  const keys = ([["days", ar ? "يوم" : "d"], ["hours", ar ? "ساعة" : "h"], ["minutes", ar ? "دقيقة" : "m"], ["seconds", ar ? "ثانية" : "s"]] as const).filter(([k]) => !(k === "days" && hideDays) && !(k === "seconds" && hideSec));
  return <div className="flex flex-wrap items-center gap-1" data-duration={Number(v) || 0}>{keys.map(([k, l]) => <label key={k} className="flex items-center gap-1 text-xs"><input type="number" min={0} className="field-input w-16 text-end" disabled={ro} value={parts[k]} aria-label={l} onChange={(e) => set(partsToSeconds({ ...parts, [k]: Math.max(0, Number(e.target.value) || 0) }))} /><span data-no-i18n>{l}</span></label>)}<span className="text-[11px] text-muted-foreground" data-no-i18n>{formatDuration(v, { hide_days: hideDays, hide_seconds: hideSec })}</span></div>;
}

/** Dynamic Link: the target DocType is the value of the discriminator field (options); suggestions are the user's readable records of that DocType. */
function DynamicLinkInput({ f, v, doc, ro, set }: { f: DocField; v: string; doc: Doc; ro: boolean; set: (x: unknown) => void }) {
  const idx = useQuery(indexQuery);
  const user = useSessionUser();
  const ar = useLang() === "ar";
  const targetDt = String(doc[f.options ?? ""] ?? "");
  const target = idx.data?.find((d) => d.name === targetDt);
  const [opts, setOpts] = useState<LinkOption[]>([]);
  useEffect(() => {
    if (!idx.data || !targetDt) { setOpts([]); return; }
    let live = true;
    loadMeta(idx.data, targetDt).then((m) => { if (live && m) setOpts(filterReadable(m, adapter.list(m.name)).filter((d) => !d["__islocal"]).map((d) => ({ value: d.name, title: linkTitle(d, m.title_field) }))); });
    return () => { live = false; };
  }, [idx.data, targetDt, user]);
  const exists = target && v && adapter.get(target.name, v);
  if (!targetDt) return <input className="field-input" disabled value={v} placeholder={ar ? "اختر نوع المستند أولًا" : "Select the document type first"} data-dynamic-link-pending />;
  return (
    <div className="flex gap-1" data-dynamic-link={targetDt}>
      <div className="min-w-0 flex-1"><LinkCombo value={v} onChange={(x) => set(x)} options={opts} disabled={ro} ariaLabel={f.label} attrs={{ "data-link-field": f.fieldname }} /></div>
      {exists && <QuickPeek doctype={targetDt} name={v} />}
      {exists && <Link to="/app/$app/$doctype/$name" params={{ app: target.app, doctype: target.slug, name: v }} className="btn-ghost px-2" title={targetDt}>→</Link>}
    </div>
  );
}


/**
 * A field description as frappe shows it: source descriptions are HTML (line breaks, links, escaped arrows). The text is
 * translated by its exact source key first, then drawn as plain text with its line breaks, so no raw tag reaches the screen.
 */
const DESC_ENT: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: "\"", "#39": "'", apos: "'", nbsp: "\u00a0" };
export function descriptionText(html: string): string {
  if (!/[<&]/.test(html)) return html;
  return html.replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|div|li)>/gi, "\n").replace(/<[^>]+>/g, "").replace(/&(amp|lt|gt|quot|#39|apos|nbsp);/g, (_, e: string) => DESC_ENT[e] ?? _).replace(/\n{3,}/g, "\n\n").trim();
}
function FieldDescription({ text }: { text: string }) {
  useLang();
  // the translation pack keys a multi-line source description with its line breaks as single spaces ("<br> Uncheck…")
  const flat = text.replace(/\s*\n\s*/g, " ");
  const shown = trDesc(text) !== text ? trDesc(text) : trDesc(flat) !== flat ? trDesc(flat) : text;
  // a code example inside the description (e.g. "doc.status == 'Open'") is shown as code, left-to-right and never translated
  const body = descriptionText(shown); const at = body.search(/\bdoc\.[a-z_]+/);
  return <p className="mt-0.5 whitespace-pre-line text-[11px] text-muted-foreground" data-field-description>{at < 0 ? body : <>{body.slice(0, at)}<code dir="ltr" data-no-i18n className="font-mono text-[10.5px]">{body.slice(at)}</code></>}</p>;
}
