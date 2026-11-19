/**
 * VirtualERPAdapter — the single shared synthetic data store.
 * All screens read and write through it, in both Original and Customized
 * modes, so the same records appear everywhere. Persisted in localStorage.
 * This is NOT a Frappe backend; server-side controllers never run here.
 */
import { useSyncExternalStore } from "react";
import { LAYOUT_TYPES, TABLE_TYPES, type DocField, type DocTypeMeta } from "./catalog";

export type Doc = Record<string, unknown> & { name: string; doctype: string; docstatus?: number; modified?: string };
type Store = Record<string, Record<string, Doc>>;

const KEY = "digit-virtual-core:data:v1";
let store: Store = {};
let version = 0;
const listeners = new Set<() => void>();

/**
 * Ephemeral partition (owner 2026-10-19 "lots of data that does not affect the apps"): records inserted inside
 * adapter.ephemeral() live in memory only and are never written to browser storage, so a large deterministic sample
 * layer can be rebuilt on every visit without the localStorage quota. Any user write (insert / insertDoc / update /
 * remove outside ephemeral()) turns that record into an ordinary persisted record, so user work is never lost.
 */
let ephemeralDepth = 0;
const vol: Record<string, Set<string>> = {};
const isVol = (dt: string, name: string) => !!vol[dt]?.has(name);
const markNew = (dt: string, name: string, existed: boolean) => { if (ephemeralDepth > 0 && !existed) (vol[dt] ??= new Set()).add(name); };
const keepUserWrite = (dt: string, name: string) => { if (ephemeralDepth === 0) vol[dt]?.delete(name); };
/** The store without ephemeral records (what is written to browser storage). */
function persistable(): Store {
  const out: Store = {};
  for (const dt of Object.keys(store)) {
    const v = vol[dt]; const recs = store[dt]!;
    if (!v || !v.size) { out[dt] = recs; continue; }
    const keep: Record<string, Doc> = {};
    for (const k in recs) if (!v.has(k)) keep[k] = recs[k]!;
    out[dt] = keep;
  }
  return out;
}

/** Per-DocType revision + sorted-list cache: adapter.list sorts once per change instead of on every call. */
const rev: Record<string, number> = {};
const sortedCache = new Map<string, { rev: number; rows: Doc[] }>();
const touch = (dt: string) => { rev[dt] = (rev[dt] ?? 0) + 1; };
const touchAll = () => { sortedCache.clear(); };

function load() {
  if (typeof window === "undefined") return;
  try { store = JSON.parse(localStorage.getItem(KEY) || "{}"); } catch { store = {}; }
  touchAll();
}
let batchDepth = 0, batchDirty = false;
function save() {
  version++;
  // inside adapter.batch(): one write + one notification at the end instead of one per record
  if (batchDepth > 0) { batchDirty = true; return; }
  if (typeof window !== "undefined") {
    try { localStorage.setItem(KEY, JSON.stringify(persistable())); }
    catch (e) { console.warn("[adapter] browser storage write failed; records stay in memory for this visit", e); }
  }
  listeners.forEach((l) => l());
}
load();
/** Owner of new records = the simulated session user (src/lib/session.ts), read directly to avoid an import cycle. */
const sessionOwner = () => (typeof window !== "undefined" && localStorage.getItem("digit-virtual-core:session-user-v1")) || "Administrator";
/**
 * Browser-tab identity for unsaved local drafts. Frappe keeps a new doc only in the open page's `locals`; the shared
 * store is persisted across tabs, so each draft records its tab and a new "+ Add" only discards drafts of its own tab.
 */
const TAB_KEY = "digit-virtual-core:tab";
export function tabId(): string {
  if (typeof window === "undefined") return "server";
  try {
    let t = sessionStorage.getItem(TAB_KEY);
    if (!t) { t = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`; sessionStorage.setItem(TAB_KEY, t); }
    return t;
  } catch { return "tab"; }
}

export const prefixOf = (doctype: string) =>
  doctype.split(/\s+/).map((w) => w[0]).join("").toUpperCase().slice(0, 4) || "DOC";
export const synthName = (doctype: string, i: number) => `${prefixOf(doctype)}-${String(i).padStart(4, "0")}`;

const SAMPLE = ["Atlas", "Nadia", "Orion", "Sahara", "Cedar", "Falcon", "Delta", "Noor", "Harbor", "Zephyr"];
export function synthValue(f: DocField, i: number): unknown {
  const n = i + (f.fieldname?.length ?? 0);
  switch (f.fieldtype) {
    case "Link": return f.options ? synthName(f.options, (n % 5) + 1) : "";
    case "Dynamic Link": return "";
    case "Select": {
      const o = (f.options || "").split("\n").filter(Boolean);
      return o.length ? o[n % o.length] : "";
    }
    case "Check": return n % 2;
    case "Int": return (n * 7) % 50;
    case "Float": case "Percent": return ((n * 13) % 100) / 2;
    case "Currency": return ((n * 1373) % 90000) / 10 + 100;
    case "Date": return `2026-${String((n % 12) + 1).padStart(2, "0")}-${String((n % 27) + 1).padStart(2, "0")}`;
    case "Datetime": return `2026-0${(n % 9) + 1}-1${n % 9} 10:${String(n % 60).padStart(2, "0")}:00`;
    case "Time": return `0${n % 10}:30:00`;
    case "Data": case "Small Text": case "Text": case "Long Text": case "Text Editor": case "Read Only":
      if (/email/.test(f.fieldname || "")) return `${SAMPLE[n % 10]!.toLowerCase()}@example.test`;
      if (/phone|mobile/.test(f.fieldname || "")) return `+966 5${n}0 000 ${100 + n}`;
      return `${SAMPLE[n % 10]} ${f.label ?? f.fieldname} ${i}`;
    default: return undefined;
  }
}

/** An unsaved Single: its literal field defaults only (Check / number defaults as numbers). */
export function singleDefaults(meta: DocTypeMeta): Doc {
  const now = new Date().toISOString();
  const d: Doc = { name: meta.name, doctype: meta.name, docstatus: 0, creation: now, modified: now };
  for (const f of meta.fields) {
    if (!f.fieldname || LAYOUT_TYPES.has(f.fieldtype) || TABLE_TYPES.has(f.fieldtype)) continue;
    if (f.default == null || f.default === "" || f.default.startsWith("eval") || f.default.startsWith("__") || f.default.startsWith(":")) continue;
    d[f.fieldname] = f.fieldtype === "Check" || /Int|Float|Currency|Percent/.test(f.fieldtype) ? Number(f.default) || 0 : f.default;
  }
  return d;
}

/** Earlier previews filled an unsaved Single with generated values; clear the ones that are plainly generated — a Link
 *  code (C-0004) whose record does not exist, or a "Sample Label 1" text — so stored settings keep only real input. */
function clearSynthSingle(meta: DocTypeMeta) {
  const d = store[meta.name]?.[meta.name]; if (!d) return;
  let changed = false;
  for (const f of meta.fields) {
    if (!f.fieldname || f.default || !(f.fieldtype === "Link" || /^(Data|Small Text|Text|Long Text|Text Editor|Read Only)$/.test(f.fieldtype))) continue;
    const v = d[f.fieldname]; if (typeof v !== "string" || !v || v !== synthValue(f, 1)) continue;
    if (f.fieldtype === "Link" && (!f.options || store[f.options]?.[v])) continue;
    delete d[f.fieldname]; changed = true;
  }
  if (changed) { touch(meta.name); save(); }
}

export function makeDoc(meta: DocTypeMeta, i: number): Doc {
  const d: Doc = { name: synthName(meta.name, i), doctype: meta.name, docstatus: 0, creation: new Date().toISOString(), modified: new Date().toISOString() };
  for (const f of meta.fields) {
    if (!f.fieldname || LAYOUT_TYPES.has(f.fieldtype) || TABLE_TYPES.has(f.fieldtype)) continue;
    const v = f.default && !f.default.startsWith("eval") && !f.default.startsWith("__") ? f.default : synthValue(f, i);
    if (v !== undefined) d[f.fieldname] = f.fieldtype === "Check" || /Int|Float|Currency|Percent/.test(f.fieldtype) ? Number(v) || 0 : v;
  }
  if (meta.title_field && typeof d[meta.title_field] !== "string") d[meta.title_field] = `${SAMPLE[i % 10]} ${meta.name}`;
  return d;
}

/** Server-side document controller hooks (ported Python validate/before_save/after_insert), keyed by DocType.
 *  Registered by engine modules (e.g. src/lib/crmLogic.ts); run on insertDoc/update so Desk and SPA share one behaviour. */
export type DocHook = (doc: Doc, before: Doc | undefined) => { doc: Doc; errors?: string[]; after?: (d: Doc) => void };
const docHooks: Record<string, DocHook[]> = {};
export function registerDocHook(doctype: string, h: DocHook) { (docHooks[doctype] ??= []).push(h); }
export class DocValidationError extends Error { constructor(public errors: string[]) { super(errors.join("\n")); } }
function runHooks(doctype: string, doc: Doc, before: Doc | undefined): { doc: Doc; after: ((d: Doc) => void)[] } {
  let d = doc; const errs: string[] = []; const after: ((d: Doc) => void)[] = [];
  for (const h of docHooks[doctype] ?? []) { const r = h(d, before); d = r.doc; if (r.errors) errs.push(...r.errors); if (r.after) after.push(r.after); }
  if (errs.length && !d["__synthetic"]) throw new DocValidationError(errs);
  return { doc: d, after };
}

/** Naming hook (src/lib/naming.ts registers make_autoname); undefined → preview synthName. */
type Namer = (doctype: string, data: Record<string, unknown>, meta?: DocTypeMeta) => string | undefined;
let namer: Namer | null = null;
/** Declared naming that frappe applies in set_new_name on insert (first save); controller-only naming is server-dependent. */
export const namesOnFirstSave = (meta: Pick<DocTypeMeta, "autoname" | "fields" | "issingle">) =>
  !meta.issingle && (!!String(meta.autoname ?? "").trim() || meta.fields.some((f) => f.fieldname === "naming_series"));


export const adapter = {
  ensureSeed(meta: DocTypeMeta, count = 5) {
    if (meta.istable) return;
    // app-owned and site-custom DocTypes start empty, as on a fresh Frappe site — placeholder rows would hold links to masters that do not exist
    if (String(meta.source ?? "").startsWith("plugin:")) return;
    if (store[meta.name]) { if (meta.issingle) clearSynthSingle(meta); return; }
    store[meta.name] = {}; touch(meta.name);
    const n = meta.issingle ? 1 : count;
    for (let i = 1; i <= n; i++) {
      // a Single never saved holds only its field defaults (frappe get_single_value of an unsaved Single), never
      // generated codes that point at masters which do not exist (owner 2026-11-13 spot-check: company "C-0004")
      const d = meta.issingle ? singleDefaults(meta) : makeDoc(meta, i);
      markNew(meta.name, d.name, false);
      store[meta.name]![d.name] = d;
    }
    save();
  },
  setNamer(f: Namer) { namer = f; },
  /**
   * Saved records of a DocType, newest first. Unsaved local drafts (`__islocal`, frappe locals) are not records yet —
   * frappe.get_list / reports / counts never see them — so they are excluded unless `includeLocal` is asked for.
   */
  list(doctype: string, opts?: { includeLocal?: boolean }): Doc[] {
    const r = rev[doctype] ?? 0; let hit = sortedCache.get(doctype);
    if (!hit || hit.rev !== r) {
      hit = { rev: r, rows: Object.values(store[doctype] || {}).sort((a, b) => String(b.modified).localeCompare(String(a.modified))) };
      sortedCache.set(doctype, hit);
    }
    // always a fresh array: callers may sort / splice the result
    return opts?.includeLocal ? hit.rows.slice() : hit.rows.filter((d) => !d["__islocal"]);
  },
  get(doctype: string, name: string): Doc | undefined { return store[doctype]?.[name]; },
  /** DocTypes that currently hold records (Insights "Site DB" tables). */
  doctypes(): string[] { return Object.keys(store).filter((k) => Object.keys(store[k] || {}).length).sort(); },
  /**
   * New blank document (list "+ Add" / form "New") = frappe.model.get_new_doc: an unsaved local doc named
   * `new-<doctype>-<n>` with __islocal=1. Any declared naming (naming_series:, series, format:, field:, Prompt, hash,
   * UUID, autoincrement) is assigned on first save (src/lib/documentApi.ts saveDocument → set_new_name), so an
   * abandoned "+ Add" never consumes a series number. DocTypes with no declared autoname (controller autoname() in
   * Python) keep the immediate preview name — that naming is server-dependent and documented as such.
   */
  insert(meta: DocTypeMeta, init: Record<string, unknown> = {}): Doc {
    const existing = Object.keys(store[meta.name] || {}).length;
    let i = existing + 1;
    while (store[meta.name]?.[synthName(meta.name, i)]) i++;
    const d: Doc = { name: synthName(meta.name, i), doctype: meta.name, docstatus: 0, owner: sessionOwner(), creation: new Date().toISOString(), modified: new Date().toISOString() };
    // literal docfield defaults only; dynamic ones (Today, Now, user, :DocType, eval) are resolved by documentApi.createDraft → sessionDefaults.newDocDefaults
    for (const f of meta.fields) if (f.fieldname && f.default && !/^(eval|__|:)/.test(f.default) && !["today", "now", "user", "user_fullname"].includes(f.default.toLowerCase())) d[f.fieldname] = ["Check", "Int", "Float", "Currency", "Percent"].includes(f.fieldtype ?? "") ? Number(f.default) || 0 : f.default; // frappe casts numeric defaults
    // resolved user/session defaults (documentApi.createDraft → sessionDefaults.newDocLinkDefaults); never name/doctype/docstatus
    for (const [k, v] of Object.entries(init)) if (!["name", "doctype", "docstatus", "owner", "creation", "modified"].includes(k) && v !== undefined && v !== "") d[k] = v;
    const sf = meta.fields.find((f) => f.fieldname === "naming_series");
    if (sf && !d["naming_series"]) { const o = String(sf.options ?? "").split("\n").map((x) => x.trim()).filter(Boolean)[0]; if (o) d["naming_series"] = o; }
    if (meta.issingle) d.name = meta.name;
    else if (namesOnFirstSave(meta)) { const slug = meta.name.toLowerCase().replace(/[^a-z0-9]+/g, "-"); let k = 1; while (store[meta.name]?.[`new-${slug}-${k}`]) k++; d.name = `new-${slug}-${k}`; d["__islocal"] = 1; d["__tab"] = tabId(); }
    markNew(meta.name, d.name, !!store[meta.name]?.[d.name]); keepUserWrite(meta.name, d.name);
    store[meta.name] = { ...(store[meta.name] || {}), [d.name]: d }; touch(meta.name);
    save();
    return d;
  },
  /** Insert a record with explicit values (used by simulated flows such as Convert to Deal). Unnamed records use the DocType autoname when its meta is loaded. */
  insertDoc(doctype: string, data: Record<string, unknown>): Doc {
    let i = Object.keys(store[doctype] || {}).length + 1;
    while (store[doctype]?.[synthName(doctype, i)]) i++;
    const now = new Date().toISOString();
    let nm = data["name"] as string | undefined;
    if (!nm) { const auto = namer?.(doctype, data); if (auto && !store[doctype]?.[auto]) nm = auto; }
    const d0: Doc = { docstatus: 0, owner: sessionOwner(), ...data, name: nm || synthName(doctype, i), doctype, creation: (data["creation"] as string) || now, modified: (data["modified"] as string) || now };
    const { doc: d, after } = runHooks(doctype, d0, undefined);
    markNew(doctype, d.name, !!store[doctype]?.[d.name]); keepUserWrite(doctype, d.name);
    store[doctype] = { ...(store[doctype] || {}), [d.name]: d }; touch(doctype);
    // ephemeral sample records carry no history (like the quiet seed inserts), so Version names never collide later
    if (doctype !== "Version" && ephemeralDepth === 0) logVersion(doctype, d.name, { created: true });
    for (const a of after) a(d);
    save();
    return store[doctype]![d.name]!;
  },
  /** Bulk seed insert: no Version log and no per-record save; call flush() afterwards. */
  insertDocQuiet(doctype: string, data: Record<string, unknown>) {
    const now = new Date().toISOString();
    const d: Doc = { docstatus: 0, ...data, name: data["name"] as string, doctype, creation: (data["creation"] as string) || now, modified: (data["creation"] as string) || now };
    // bulk path: an existing record keeps its partition (seed passes may rewrite ephemeral rows without persisting them)
    markNew(doctype, d.name, !!store[doctype]?.[d.name]);
    (store[doctype] ??= {})[d.name] = d; touch(doctype);
  },
  flush() { save(); },
  /** Run many writes with one persist + notification at the end (bulk installers); hooks and validation still run per record. */
  batch<T>(fn: () => T): T {
    batchDepth++;
    try { return fn(); } finally { batchDepth--; if (batchDepth === 0 && batchDirty) { batchDirty = false; save(); } }
  },
  /** Run `fn` as one batch whose NEW records are memory-only (never persisted) until a user write touches them. */
  ephemeral<T>(fn: () => T): T {
    ephemeralDepth++;
    try { return adapter.batch(fn); } finally { ephemeralDepth--; }
  },
  /** Whether a record belongs to the memory-only partition. */
  isEphemeral(doctype: string, name: string): boolean { return isVol(doctype, name); },
  /** Number of memory-only records (all DocTypes). */
  ephemeralCount(): number { return Object.values(vol).reduce((s, v) => s + v.size, 0); },
  /** Drop every memory-only record (persisted records are untouched). */
  clearEphemeral(): number {
    let n = 0;
    for (const [dt, names] of Object.entries(vol)) { const recs = store[dt]; if (recs) for (const k of names) if (recs[k]) { delete recs[k]; n++; } names.clear(); touch(dt); }
    if (n) save();
    return n;
  },
  /** Delete every record (persisted or memory-only) that `match` selects — no hooks, one save. Used by an app's "Remove demo data". */
  purge(match: (doctype: string, doc: Doc) => boolean): number {
    let n = 0;
    for (const dt of Object.keys(store)) {
      const recs = store[dt]!; let hit = false;
      for (const [name, d] of Object.entries(recs)) if (match(dt, d as Doc)) { delete recs[name]; vol[dt]?.delete(name); n++; hit = true; }
      if (hit) touch(dt);
    }
    if (n) save();
    return n;
  },
  update(doctype: string, name: string, patch: Record<string, unknown>) {
    const cur = store[doctype]?.[name];
    if (!cur) return;
    const { doc: next, after } = runHooks(doctype, { ...cur, ...patch }, cur);
    patch = Object.fromEntries(Object.entries(next).filter(([k, v]) => cur[k] !== v));
    const changed = Object.entries(patch).filter(([k, v]) => k !== "modified" && typeof v !== "object" && cur[k] !== v).map(([k, v]) => [k, cur[k] ?? null, v]);
    if (changed.length && doctype !== "Version" && ephemeralDepth === 0) logVersion(doctype, name, { changed });
    keepUserWrite(doctype, name);
    store[doctype] = { ...store[doctype], [name]: { ...cur, ...patch, modified: new Date().toISOString() } }; touch(doctype);
    for (const a of after) a(store[doctype]![name]!);
    save();
  },
  remove(doctype: string, name: string) {
    if (!store[doctype]) return;
    const { [name]: _, ...rest } = store[doctype];
    store[doctype] = rest; touch(doctype); keepUserWrite(doctype, name);
    save();
  },
  /** Records in `doctype` whose `fieldname` points to `value` (connections). */
  related(doctype: string, fieldname: string, value: string) {
    return adapter.list(doctype).filter((d) => d[fieldname] === value);
  },
  resetAll() { store = {}; for (const v of Object.values(vol)) v.clear(); touchAll(); save(); },
  /** Removes only seeded synthetic records (flagged __synthetic); user-created records are kept. */
  resetSynthetic() {
    let n = 0;
    for (const dt of Object.keys(store)) {
      for (const [name, d] of Object.entries(store[dt]!)) if ((d as Doc)["__synthetic"]) { delete store[dt]![name]; vol[dt]?.delete(name); n++; }
    }
    touchAll(); save();
    return n;
  },
  subscribe(l: () => void) { listeners.add(l); return () => listeners.delete(l); },
  version: () => version,
};

/** Mirrors Frappe's Version DocType (ref_doctype, docname, data) so activity timelines read real-shaped records. */
function logVersion(ref_doctype: string, docname: string, data: Record<string, unknown>) {
  const v = store["Version"] || (store["Version"] = {});
  const n = `VER-${String(Object.keys(v).length + 1).padStart(5, "0")}`;
  keepUserWrite("Version", n); touch("Version");
  v[n] = { name: n, doctype: "Version", ref_doctype, docname, data: JSON.stringify(data), owner: sessionOwner(), creation: new Date().toISOString(), modified: new Date().toISOString() };
}

/** Re-render whenever any record changes. */
export function useStoreVersion() {
  return useSyncExternalStore(adapter.subscribe, adapter.version, () => 0);
}
if (typeof window !== "undefined" && import.meta.env.DEV) (window as unknown as Record<string, unknown>)["__digitAdapter"] = adapter;
