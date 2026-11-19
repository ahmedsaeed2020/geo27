/**
 * Parser for sheet 5 rows (documents & fields) of the owner test list: where the field lives, its fieldname, label,
 * expected type, Link target / Select options and whether it is mandatory. Pure (no runtime imports) so the
 * schema generator (scripts/construction-spec-schema.ts) and the field suite read rows the same way.
 */
import type { TRow } from "./rows";

/** Spec DocType names that this app already implements under another name (same purpose, never duplicated). */
export const DOCTYPE_ALIASES: Record<string, string> = {
  "Digit EOT Request": "Digit EOT", "Digit Defect Case": "Digit Defect", "Digit Delay Event": "Digit EOT Delay Event",
  "Digit Inspection Item": "Digit Inspection Line", "Digit Change Event Line": "Digit CE Line",
  // research proposed these documents; the design unified them into the existing one (spec notes "وحّده في")
  "Digit Technical Submittal": "Digit Submittal", "Digit OandM Manual": "Digit Handover Package",
};
export const NATIVE_HINT = /^(ERPNext|Frappe)\s+/;

export type FieldKind = "field" | "doctype" | "readmodel" | "report" | "unknown" | "notverified";
/** The DocType a field row is about: the child of a "Parent / Child" Where, else the only one. */
export const homeOf = (s: { doctypes: string[] }) => s.doctypes[s.doctypes.length - 1]!;
export interface FieldSpec {
  kind: FieldKind;
  /** candidate DocTypes (aliases resolved), first = parent */
  doctypes: string[];
  /** spec names before alias resolution */
  specDoctypes: string[];
  fieldname: string; labelEn: string; labelAr: string;
  type: string; target?: string; options?: string[]; reqd: boolean; conditional?: string; note: string;
  /** "Date Range" → from/to pair; "Source Row Pointer" → doctype/name/row triple */
  composite?: "range" | "pointer";
  /** read-model rows: the existing screen / report / function named in Where */
  artifact?: string;
  /** whole-DocType rows: the listed fieldnames */
  fields?: string[];
  /** owner mapping note "same label / meaning exists in the app/design: DocType.field" */
  ref?: { doctype: string; fieldname: string };
  /** owner mapping note "research suggested DocType X; the design unified it into Y" (spec DocType X) */
  unifiedFrom?: string | undefined;
}

const cleanDt = (s: string) => s.replace(NATIVE_HINT, "").replace(/\s*\(native\)\s*$/i, "").trim();
const TYPE_WORDS = ["Data", "Currency", "Select", "Link", "Date", "Float", "Int", "Small Text", "Check", "Percent", "Table", "Attach", "Text", "Datetime", "Dynamic Link", "Long Text", "Table MultiSelect", "Time", "Duration", "Attach Image", "Text Editor", "Code", "Read Only", "Rating", "Signature", "JSON", "HTML"];

export function parseType(raw: string): { type: string; target?: string; options?: string[]; composite?: "range" | "pointer" } {
  const t = raw.trim();
  let m = /^Link\s*(?::|→)\s*(.+)$/.exec(t); if (m) return { type: "Link", target: m[1]!.trim() };
  m = /^Dynamic Link(?:\s*→\s*(.+))?$/.exec(t); if (m) return { type: "Dynamic Link", ...(m[1] ? { target: m[1].trim() } : {}) };
  m = /^Select\s*→\s*(.+)$/.exec(t); if (m) return { type: "Select", options: splitOptions(m[1]!) };
  m = /^Table\s*(?::|→)\s*(.+)$/.exec(t); if (m) return { type: "Table", target: m[1]!.trim() };
  if (/^Date Range/.test(t)) return { type: "Date", composite: "range" };
  if (/^Source Row Pointer/.test(t)) return { type: "Data", composite: "pointer" };
  return { type: TYPE_WORDS.includes(t) ? t : t || "UNKNOWN" };
}

/** "A / B / N/A" → ["A", "B", "N/A"] (N/A and and/or stay one value) */
export function splitOptions(s: string): string[] {
  return s.replace(/N\/A/g, "N\u2044A").replace(/and\/or/g, "and\u2044or").split("/").map((x) => x.trim().replace(/\u2044/g, "/")).filter(Boolean);
}
/** Select options written in the note as "A/B/C" (Latin words), e.g. "None/Possible Change/Possible EOT/Notice". */
function noteOptions(note: string): string[] | undefined {
  const head = note.split(/[—–]| \(|؛|،/)[0]!.trim();
  if (!head.includes("/") || !/^[A-Za-z0-9 _\-./&+%]+$/.test(head)) return undefined;
  const o = splitOptions(head);
  return o.length >= 2 ? o : undefined;
}

export function parseFieldRow(r: TRow): FieldSpec {
  const [typeRaw = "", ...rest] = r.must.split("|");
  const note = rest.join("|").trim();
  const where = r.where;
  const fm = /\(([a-z_][a-z0-9_]*)\)\s*$/.exec(r.idea);
  const fieldname = fm?.[1] ?? "";
  let label = fm ? r.idea.slice(0, fm.index).trim() : r.idea;
  label = label.replace(/^(مقابل عربي مقترح|ترجمة عربية مقترحة):\s*/, "");
  let labelAr = "", labelEn = label;
  const dash = label.split(" — ");
  if (dash.length >= 2) { labelAr = dash[0]!.trim(); labelEn = dash.slice(1).join(" — ").trim(); }
  else { const em = /^([\u0600-\u06FF][^A-Za-z]*)\s+([A-Za-z].*)$/.exec(label); if (em) { labelAr = em[1]!.trim(); labelEn = em[2]!.trim(); } else if (/[\u0600-\u06FF]/.test(label) && !/[A-Za-z]/.test(label)) { labelAr = label.trim(); labelEn = ""; } }
  const ty = parseType(typeRaw);
  // "إلزامي" alone = mandatory field; "إلزامي للإغلاق / عند الرفض / قبل الخصم …" = a conditional rule on save
  const reqd = /^(إلزامي|مطلوب)$/.test(note.trim());
  const conditional = /^(إلزامي|إلزامية|مطلوب)\s+\S/.test(note.trim()) ? note.trim() : undefined;
  const base = { fieldname, labelEn, labelAr, ...ty, reqd, ...(conditional ? { conditional } : {}), note };
  if (!ty.options && ty.type === "Select") { const o = noteOptions(note); if (o) base.options = o; }
  // whole-DocType rows: "عضو فريق المشروع — Digit Project Team Member" + "10 حقل: a, b, c"
  const whole = /^(\d+)\s+حقل:\s*(.+)$/.exec(r.must);
  if (whole) {
    const dtn = /—\s*(.+)$/.exec(r.idea)?.[1]?.trim() ?? where;
    const dt = cleanDt(dtn);
    return { ...base, kind: "doctype", doctypes: [DOCTYPE_ALIASES[dt] ?? dt], specDoctypes: [dt], fields: whole[2]!.split(",").map((x) => x.trim()).filter(Boolean), type: "DocType", reqd: false };
  }
  const rm0 = /(?:نفس التسمية موجودة في التطبيق\/التصميم|نفس المعنى في التصميم):\s*([A-Z][A-Za-z0-9 &]+?)\.([a-z_][a-z0-9_]*)/.exec(note);
  const ref0 = rm0 ? { doctype: rm0[1]!.trim(), fieldname: rm0[2]! } : undefined;
  if (/^(شاشة|تقرير)/.test(where)) {
    const artifact = where.replace(/^شاشة\/تقرير قائم:\s*|^شاشة قراءة الميزة\s*|^تقرير:\s*/, "").trim();
    return { ...base, kind: where.startsWith("تقرير:") ? "report" : "readmodel", doctypes: [], specDoctypes: [], artifact };
  }
  if (!where) return { ...base, kind: /NOT_VERIFIED/.test(r.idea + r.must) ? "notverified" : "unknown", doctypes: [], specDoctypes: [], ...(ref0 ? { ref: ref0 } : {}) };
  const spec = where.split(/\s+\/\s+/).map(cleanDt).filter(Boolean);
  const rm = /(?:نفس التسمية موجودة في التطبيق\/التصميم|نفس المعنى في التصميم):\s*([A-Z][A-Za-z0-9 &]+?)\.([a-z_][a-z0-9_]*)/.exec(note);
  const ref = rm ? { doctype: rm[1]!.trim(), fieldname: rm[2]! } : undefined;
  const um = /وحّده في\s+(Digit [A-Za-z0-9 &]+?|[A-Z][A-Za-z ]+?)\s*(?:—|$)/.exec(note);
  if (um) { const y = cleanDt(um[1]!); return { ...base, kind: "field", doctypes: [DOCTYPE_ALIASES[y] ?? y], specDoctypes: spec, unifiedFrom: spec[0], ...(ref ? { ref } : {}) }; }
  return { ...base, kind: "field", doctypes: spec.map((d) => DOCTYPE_ALIASES[d] ?? d), specDoctypes: spec, ...(ref ? { ref } : {}) };
}

/** Field types that hold the same kind of value (a spec "Data" stored as Small Text keeps the value). */
const FAMILY: Record<string, string> = {
  Data: "text", "Small Text": "text", Text: "text", "Long Text": "text", "Text Editor": "text", Code: "text", "Read Only": "text", HTML: "text", JSON: "text",
  Int: "int", Float: "dec", Percent: "dec", Currency: "money", Check: "check", Date: "date", Datetime: "datetime", Time: "time", Duration: "dur",
  Link: "link", "Dynamic Link": "dlink", Select: "select", Table: "table", "Table MultiSelect": "table", Attach: "file", "Attach Image": "file", Rating: "dec", Signature: "file",
};
export const sameFamily = (spec: string, actual: string) => spec === actual || (!!FAMILY[spec] && FAMILY[spec] === FAMILY[actual]);
/** Strict = spec type equals the stored type, or both are free text (Data ↔ Small Text ↔ Text). */
export const typeMatches = (spec: string, actual: string) => spec === actual || (FAMILY[spec] === "text" && FAMILY[actual] === "text");
