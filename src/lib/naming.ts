/**
 * Document naming — virtual port of frappe/model/naming.py (set_new_name / make_autoname / NamingSeries /
 * _format_autoname / _field_autoname) so new records get the name their DocType (or plugin manifest) declares.
 * Supported: "hash", "UUID", "autoincrement", "naming_series:", "field:<f>", "format:..{f}..{###}..",
 * "PREFIX-.YYYY.-.#####" series, "Prompt". Series counters live in a persisted Series table like tabSeries,
 * seeded from the highest existing name so counters never re-issue a name.
 * Controller autoname() methods (Python) are server-dependent: DocTypes without a declared autoname keep the
 * preview name from adapter.synthName.
 */
import { adapter } from "./adapter";
import { cachedMeta, type DocTypeMeta } from "./catalog";

const KEY = "digit-virtual-core:series-v1";
const isB = typeof window !== "undefined";
let mem: Record<string, number> | null = null;
const counters = (): Record<string, number> => { if (mem) return mem; try { mem = isB ? JSON.parse(localStorage.getItem(KEY) || "{}") : {}; } catch { mem = {}; } return mem!; };
const persist = () => { if (isB) localStorage.setItem(KEY, JSON.stringify(counters())); };

const pad = (x: number, w = 2) => String(x).padStart(w, "0");
const hash = (len = 10) => Array.from({ length: len }, () => "0123456789abcdef"[Math.floor(Math.random() * 16)]).join("");

/** Next counter for a series prefix (tabSeries.current + 1), never below the highest existing name of that prefix. */
function nextCount(dt: string, prefix: string, width: number, consume = true): string {
  const c = counters(); let cur = c[prefix] ?? 0;
  for (const d of adapter.list(dt)) if (d.name.startsWith(prefix)) { const k = Number(d.name.slice(prefix.length)); if (Number.isInteger(k) && k > cur) cur = k; }
  let i = cur + 1; while (adapter.get(dt, prefix + String(i).padStart(width, "0"))) i++;
  if (consume) { c[prefix] = i; persist(); }
  return String(i).padStart(width, "0");
}

/** parse_naming_series: "." separated parts; date tokens, {field}/field parts, and a #### counter. */
export function parseNamingSeries(dt: string, series: string, doc: Record<string, unknown> = {}, consume = true): string {
  const s = series.includes("#") ? series : `${series}.#####`;
  const now = new Date(String(doc["posting_date"] ?? doc["transaction_date"] ?? "") || Date.now());
  const date = Number.isNaN(now.getTime()) ? new Date() : now;
  const parts = s.split("."); let name = ""; let counterAt = -1; let width = 5;
  parts.forEach((p, i) => { if (/^#+$/.test(p)) { counterAt = i; width = p.length; } });
  const tok = (p: string): string => {
    if (p === "YYYY") return String(date.getFullYear());
    if (p === "YY") return String(date.getFullYear()).slice(2);
    if (p === "MM") return pad(date.getMonth() + 1);
    if (p === "DD") return pad(date.getDate());
    if (p === "timestamp") return String(Date.now());
    if (p === "FY") return String(date.getFullYear());
    if (/^\{\w+\}$/.test(p)) return String(doc[p.slice(1, -1)] ?? "");
    if (doc[p] !== undefined && doc[p] !== null && typeof doc[p] !== "object" && /^[a-z_]+$/.test(p)) return String(doc[p]);
    return p;
  };
  parts.forEach((p, i) => { if (i !== counterAt) name += tok(p); else name += "\u0000"; });
  const prefix = name.split("\u0000")[0]!;
  return name.replace("\u0000", nextCount(dt, prefix, width, consume));
}

/** _format_autoname: "format:CST-{customer}-{fiscal_year}-{###}" (braced fields, date tokens and one counter). */
function formatAutoname(dt: string, fmt: string, doc: Record<string, unknown>, consume: boolean): string {
  const parts = fmt.split(/(\{[^}]+\})/).filter(Boolean);
  let name = ""; let width = 0;
  for (const p of parts) {
    if (!p.startsWith("{")) { name += p; continue; }
    const k = p.slice(1, -1);
    if (/^#+$/.test(k)) { width = k.length; name += "\u0000"; continue; }
    if (["YYYY", "YY", "MM", "DD", "timestamp", "FY"].includes(k)) { name += parseNamingSeries(dt, `${k}.#`, doc, false).slice(0, -1); continue; }
    name += String(doc[k] ?? "");
  }
  if (!width) return name;
  return name.replace("\u0000", nextCount(dt, name.split("\u0000")[0]!, width, consume));
}

/** Fields an autoname needs before it can resolve (field:x, format:{x}); empty = resolvable at insert. */
export function autonameNeeds(meta: Pick<DocTypeMeta, "autoname">): string[] {
  const a = String(meta.autoname ?? "").trim();
  if (a.startsWith("field:")) return [a.slice(6).trim()];
  if (a.startsWith("format:")) return [...a.matchAll(/\{([^}#]+)\}/g)].map((m) => m[1]!).filter((k) => !["YYYY", "YY", "MM", "DD", "timestamp", "FY"].includes(k));
  if (/^prompt$/i.test(a)) return ["__newname"];
  return [];
}

/** Series options of the naming_series field (Select options / default), as Document Naming Settings reads them. */
export function seriesOptions(meta: DocTypeMeta): string[] {
  const f = meta.fields.find((x) => x.fieldname === "naming_series");
  return String(f?.options ?? "").split("\n").map((x) => x.trim()).filter(Boolean);
}

/**
 * make_autoname for a new document. Returns undefined when the DocType declares nothing this port can apply
 * (caller keeps its preview name) or when required field values are still missing (caller names on save).
 */
export function makeAutoname(meta: DocTypeMeta, doc: Record<string, unknown>, consume = true): string | undefined {
  let a = String(meta.autoname ?? "").trim();
  if (!a && meta.fields.some((f) => f.fieldname === "naming_series")) a = "naming_series:";
  if (!a) return undefined;
  if (a === "hash") return hash(10);
  if (a === "UUID") return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${hash(8)}-${hash(4)}-${hash(4)}-${hash(4)}-${hash(12)}`;
  if (a === "autoincrement") { const max = adapter.list(meta.name).reduce((m, d) => Math.max(m, Number.isInteger(Number(d.name)) ? Number(d.name) : 0), 0); return String(max + 1); }
  if (/^prompt$/i.test(a)) return doc["__newname"] ? String(doc["__newname"]) : undefined;
  if (a.startsWith("field:")) { const v = doc[a.slice(6).trim()]; return v === undefined || v === null || v === "" ? undefined : String(v).trim(); }
  if (a.startsWith("format:")) { const need = autonameNeeds(meta); if (need.some((k) => doc[k] === undefined || doc[k] === null || doc[k] === "")) return undefined; return formatAutoname(meta.name, a.slice(7), doc, consume); }
  if (a.startsWith("naming_series:")) {
    const s = String(doc["naming_series"] ?? "") || String(meta.fields.find((f) => f.fieldname === "naming_series")?.default ?? "") || seriesOptions(meta)[0] || "";
    return s ? parseNamingSeries(meta.name, s, doc, consume) : undefined;
  }
  if (a.includes("#") || a.includes(".")) return parseNamingSeries(meta.name, a, doc, consume);
  return undefined;
}

/** naming_series value a new doc should carry (so the form shows which series named it). */
export function defaultSeries(meta: DocTypeMeta): string | undefined {
  const f = meta.fields.find((x) => x.fieldname === "naming_series"); if (!f) return undefined;
  return String(f.default ?? "") || seriesOptions(meta)[0];
}

// adapter.insert / insertDoc ask this namer for records created without an explicit name
adapter.setNamer((dt, data, meta) => { const m = meta ?? cachedMeta(dt); return m ? makeAutoname(m, data) : undefined; });
