/**
 * Sheet 5 checker: a spec field / DocType row is PASS when the DocType and field exist with the expected type, Link
 * target, Select values and mandatory flag, AND a document carrying that field is created → saved → read back
 * through the same document API the forms use (documentApi.createDraft / saveDocument / getDocument).
 */
import type { DocField, DocTypeMeta } from "@/lib/catalog";
import type { TRow } from "./rows";
import { parseFieldRow, typeMatches, homeOf, type FieldSpec } from "./fieldSpec";
import type { Ev } from "./record";
import { CHILD_ALIASES, COMPATIBLE_TYPES, DEVIATIONS, FIELD_ALIASES, STANDARD_FIELDS, synonymFor } from "../spec/aliases";
import SPEC from "../spec/schema.generated.json";


export type Env = { meta: (dt: string) => DocTypeMeta | undefined; adapter: typeof import("@/lib/adapter").adapter; api: typeof import("@/lib/documentApi"); appDoctypes: string[] };
type Row = Record<string, unknown>;
const LAYOUT = new Set(["Section Break", "Column Break", "Tab Break", "HTML", "Button", "Heading", "Fold", "Image"]);
const specAdded = (dt: string, fn: string): string | undefined => {
  const s = SPEC as unknown as { doctypes: { name: string; fields: { fieldname: string }[] }[]; fields: Record<string, { fieldname: string }[]>; custom_fields: { dt: string; fieldname: string }[]; props: Record<string, Record<string, unknown>>; options: Record<string, Record<string, string[]>> };
  if (s.doctypes.some((d) => d.name === dt)) return `added DocType ${dt} (spec/schema.generated.json)`;
  if (s.fields[dt]?.some((f) => f.fieldname === fn)) return `added field ${dt}.${fn} (spec/schema.generated.json)`;
  if (s.custom_fields.some((c) => c.dt === dt && c.fieldname === fn)) return `added Custom Field ${dt}.${fn} (spec/schema.generated.json)`;
  if (s.props[dt]?.[fn]) return `corrected ${dt}.${fn} to ${JSON.stringify(s.props[dt][fn])} (spec/aliases.ts FIELD_PROPS, lossless)`;
  if (s.options[dt]?.[fn]) return `added Select values ${s.options[dt][fn]!.join(" / ")} to ${dt}.${fn}`;
  return undefined;
};

/** a sample value of the field's type (Links resolve to an existing record) */
function sample(env: Env, f: DocField, i = 0): unknown {
  const t = f.fieldtype ?? "Data", fn = f.fieldname ?? "";
  // machine meters and hours form one consistent day (meter difference ≥ hours, ≤ 24 h, no downtime without a reason)
  const MACHINE: Record<string, number> = { meter_start: 1000, meter_end: 1012, idle_hours: 1, downtime_hours: 0 };
  if (fn in MACHINE && (t === "Float" || t === "Int")) return MACHINE[fn];
  switch (t) {
    case "Int": return 3 + i; case "Float": return 2.5 + i; case "Currency": return 1250 + i; case "Percent": return 12.5; case "Check": return 0;
    case "Rating": return 0.6; case "Duration": return 3600;
    case "Date": return /(end|to_date|until|due|finish|expiry|valid_to)/.test(fn) ? "2026-11-30" : "2026-11-02";
    case "Datetime": return /(end|to|until)/.test(fn) ? "2026-11-30 17:00:00" : "2026-11-02 08:00:00";
    case "Time": return "08:00:00";
    case "Select": { const o = String(f.options ?? "").split("\n").filter(Boolean); return o[0] ?? ""; }
    case "Link": {
      const target = String(f.options ?? "");
      if (target === "Project") return "DCC-PRJ-A";
      if (target === "Company") return "شركة ديجيت للمقاولات (تجريبية)";
      const recs = env.adapter.list(target);
      if (target === "User") return (recs.find((u) => u.name === "pm@dcc.test") ?? recs.find((u) => u.name !== "Guest"))?.name;
      return (recs.find((x) => x["company"] === "شركة ديجيت للمقاولات (تجريبية)" || x["project"] === "DCC-PRJ-A") ?? recs[0])?.name;
    }
    case "Dynamic Link": return undefined;
    case "Attach": case "Attach Image": return "/files/spec-test.pdf";
    case "JSON": return "{\"k\": 1}";
    case "Table": case "Table MultiSelect": return undefined;
    default: return `TL ${fn} ${i}`.slice(0, 60);
  }
}
const sameValue = (a: unknown, b: unknown) => a === b || (a !== undefined && b !== undefined && String(a) === String(b)) || (typeof a === "number" && Number(b) === a);

type RT = { name?: string | undefined; parent?: string | undefined; stored?: Row | undefined; sent: Row; errors: string[]; how?: string | undefined };
const rt = new Map<string, RT>();
const DEMO_CO = "شركة ديجيت للمقاولات (تجريبية)";
const SKIP = ["name", "creation", "modified", "owner", "modified_by", "docstatus", "doctype", "amended_from", "workflow_state", "idx", "parent", "parentfield", "parenttype"];
/** fields the spec merge added to `dt` (the whole DocType when it is new) */
function specFieldsOf(dt: string): Set<string> | "all" {
  const sp = SPEC as unknown as { doctypes: { name: string }[]; fields: Record<string, { fieldname: string }[]>; custom_fields: { dt: string; fieldname: string }[] };
  if (sp.doctypes.some((d) => d.name === dt)) return "all";
  return new Set([...(sp.fields[dt] ?? []).map((f) => f.fieldname), ...sp.custom_fields.filter((c) => c.dt === dt).map((c) => c.fieldname)]);
}
const copyDoc = (d: Row): Row => Object.fromEntries(Object.entries(d).filter(([k]) => !SKIP.includes(k) && !k.startsWith("__")).map(([k, v]) => [k, Array.isArray(v) ? (v as Row[]).map((x) => Object.fromEntries(Object.entries(x).filter(([kk]) => !["name", "parent", "parenttype", "parentfield"].includes(kk)))) : v]));
let uniq = 0;
/** Per-DocType values that keep the clone a valid, distinct document under the owner's rules. */
const CLONE_PREP: Record<string, (dt: string) => Row> = {
  // F02-03-1: one active Project baseline per project — the clone is a User baseline
  "Digit Schedule Baseline": () => ({ baseline_type: "User" }),
  // F03-02-1: criteria weights total 100 — the sample criterion (12.5 %) is completed by a second row of 87.5 %
  "Digit Tender": (dt) => (dt === "Digit Tender Criterion" ? { criteria: [{ criterion: "Capacity", weight_pct: 87.5, score: 3 }, {}] } : {}),
};
/** Sample values the owner's rules need (F03-03-1: an addendum deadline is not in the past; its tender has no expired bid bond). */
const SAMPLE_FIX: Record<string, (env: Env) => Row> = {
  "Digit Tender Addendum": (env) => {
    const d = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
    const t = env.adapter.list("Digit Tender").find((x) => !x["emd_valid_until"] || String(x["emd_valid_until"]) >= d);
    return { ...(t ? { tender: t.name } : {}), new_deadline: d };
  },
  // F09-07-2: one WIP adjustment per project and YYYY-MM period, so every field round trip takes a free period
  "Digit WIP Adjustment": (env) => {
    const used = new Set(env.adapter.list("Digit WIP Adjustment").map((x) => String(x["period"] ?? "")));
    let k = 0; const at = (i: number) => `${2000 + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, "0")}`;
    while (used.has(at(k))) k++;
    return { period: at(k) };
  },
};
/** Fields an owner rule sets on save (shown as "set by the system" instead of an echo of the sample). */
const RULE_SET: Record<string, Record<string, string>> = {
  "Digit Review Step": { step_status: "F02-10-1: the review workflow rule derives each step status from the outcomes (site.ts reviewWorkflowRule)" },
  "Digit Leveling Cell": { supplier: "F03-12-1: leveling cells are built from the package bids (tendering.ts levelingCells)", amount: "F03-12-1 / DEC-037: the bid amount in base currency, or the plug at the highest other offer (tendering.ts levelingCells)" },
};
/** create → save → read back one document of `dt` (a child table: one row on its parent); falls back to updating an existing record when the business rules forbid a second copy of the demo record */
export function roundtrip(env: Env, dt: string): RT {
  const hit = rt.get(dt); if (hit) return hit;
  const done = (r: RT) => { rt.set(dt, r); return r; };
  const m = env.meta(dt); if (!m) return done({ sent: {}, errors: [`no meta for ${dt}`] });
  let pm: DocTypeMeta = m, tableField: string | undefined;
  if (m.istable) {
    for (const p of [...env.appDoctypes, "Purchase Receipt", "Purchase Order", "Purchase Invoice", "Material Request", "Supplier Quotation", "Stock Entry", "Request for Quotation", "Project", "Task"]) {
      const pmeta = env.meta(p); const tf = pmeta?.fields.find((f) => f.fieldtype === "Table" && f.options === dt);
      if (pmeta && tf) { pm = pmeta; tableField = tf.fieldname; break; }
    }
    if (!tableField) return done({ sent: {}, errors: [`no parent DocType holds child table ${dt}`] });
  }
  const spec = specFieldsOf(dt);
  const editable = m.fields.filter((f) => f.fieldname && !LAYOUT.has(f.fieldtype ?? "") && !Number(f.read_only ?? 0) && !f.fetch_from && f.fieldtype !== "Table" && !["workflow_state", "amended_from"].includes(f.fieldname) && f.fieldtype !== "Dynamic Link");
  const recs = env.adapter.list(pm.name);
  const demo = (d: Row) => d["company"] === undefined || d["company"] === DEMO_CO;
  const withRows = (d: Row) => !tableField || (Array.isArray(d[tableField]) && (d[tableField] as Row[]).length > 0);
  // the record to duplicate: a demo draft, else a submitted demo record (Duplicate makes a new draft of it)
  const base = recs.find((d) => Number(d["docstatus"] ?? 0) === 0 && demo(d) && withRows(d)) ?? recs.find((d) => Number(d["docstatus"] ?? 0) === 0 && demo(d)) ?? recs.find((d) => demo(d) && withRows(d) && Number(d["docstatus"] ?? 0) < 2);
  const baseRow = tableField && base ? ((base[tableField] as Row[] | undefined) ?? []).slice(-1)[0] : base;
  let baseRowRef: Row | undefined = baseRow;
  // values under test: the spec-added fields get samples; fields the demo record already holds keep their (rule-valid) value
  const vals: Row = {};
  editable.forEach((f, i) => {
    const fn = f.fieldname!; const cur = baseRow?.[fn];
    const isSpec = spec === "all" || spec.has(fn);
    const v = cur !== undefined && cur !== null && cur !== "" ? cur : isSpec || !baseRow ? sample(env, f, i) : undefined;
    if (v !== undefined && v !== "") vals[fn] = v;
  });
  for (const [k, v] of Object.entries(SAMPLE_FIX[pm.name]?.(env) ?? {})) if (k in vals) vals[k] = v;
  const auto = String(pm.autoname ?? "");
  const uniqueField = /^field:/.test(auto) ? auto.slice(6) : undefined;
  const readBack = (name: string): Row | undefined => {
    const back = env.api.getDocument(pm.name, name) as Row | undefined; if (!tableField) return back;
    const rows = (back?.[tableField] as Row[] | undefined) ?? [];
    const ref = { ...(baseRowRef ?? {}), ...vals };
    const key = ["line_key", "item_key", "sov_line_key", "wo_line_key", "employee", "task", "item_code"].find((k) => ref[k] !== undefined && ref[k] !== "");
    return (key ? rows.find((x) => x[key] === ref[key]) : undefined) ?? rows.slice(-1)[0];
  };
  // 1) create a new document (clone of the demo record when there is one)
  const pvals: Row = base ? { ...copyDoc(base), ...(CLONE_PREP[pm.name]?.(dt) ?? {}) } : {};
  if (!base) {
    for (const f of pm.fields.filter((x) => Number(x.reqd ?? 0) && x.fieldname && x.fieldtype !== "Table")) { const v = sample(env, f); if (v !== undefined) pvals[f.fieldname!] = v; }
    if (pm.fields.some((f) => f.fieldname === "company")) pvals["company"] = DEMO_CO;
    if (pm.fields.some((f) => f.fieldname === "project" && f.options === "Project")) pvals["project"] ??= "DCC-PRJ-A";
  }
  if (tableField) { const rows = Array.isArray(pvals[tableField]) ? (pvals[tableField] as Row[]) : []; pvals[tableField] = [...rows.slice(0, -1), { ...(rows.slice(-1)[0] ?? {}), ...vals }]; }
  else Object.assign(pvals, vals);
  if (uniqueField) { const v = `TL-${dt.replace(/^Digit /, "").replace(/\W+/g, "")}-${++uniq}`; const uf = pm.fields.find((f) => f.fieldname === uniqueField); if (uf?.fieldtype !== "Select" && uf?.fieldtype !== "Link") { pvals[uniqueField] = v; if (!tableField) vals[uniqueField] = v; } }
  const d = env.api.createDraft(pm);
  const errs: string[] = [];
  if (d.doc) {
    const sv = env.api.saveDocument(pm, d.doc.name, pvals, { prompt: () => `TL-${dt.replace(/\W+/g, "-")}-${++uniq}` });
    if (!sv.errors.length) return done({ name: sv.name, ...(tableField ? { parent: `${pm.name} ${sv.name}` } : {}), stored: readBack(sv.name), sent: vals, errors: [], how: "created" });
    errs.push(...sv.errors); env.api.deleteDraft(pm, d.doc.name);
  } else errs.push(...d.errors);
  // 2) the rules forbid a second copy (unique per project/date, consumed source rows …): save the values on the existing record, read back, restore
  const upd = base ?? recs.find((d) => (d["company"] === undefined || d["company"] === DEMO_CO) && (!tableField || (Array.isArray(d[tableField]) && (d[tableField] as Row[]).length))) ?? recs[0];
  if (upd) {
    const base = upd; const baseRow = tableField ? ((base[tableField] as Row[] | undefined) ?? []).slice(-1)[0] : base; baseRowRef = baseRow;
    const before = tableField ? { [tableField]: base[tableField] } : Object.fromEntries(Object.keys(vals).map((k) => [k, base[k]]));
    const patch: Row = tableField ? { [tableField]: [...((base[tableField] as Row[]) ?? []).slice(0, -1), { ...(baseRow ?? {}), ...vals }] } : vals;
    try { env.adapter.update(pm.name, base.name as string, patch); } catch (e) { return done({ sent: vals, errors: [...errs, `update: ${String((e as Error).message ?? e)}`] }); }
    const stored = readBack(base.name as string);
    try { env.adapter.update(pm.name, base.name as string, before); } catch { /* restore best effort */ }
    return done({ name: base.name as string, ...(tableField ? { parent: `${pm.name} ${base.name}` } : {}), stored, sent: vals, errors: [], how: `saved on existing ${pm.name} ${base.name} (a new copy is refused: ${errs[0]?.slice(0, 90)})` });
  }
  return done({ sent: vals, errors: errs });
}

const fieldOf = (m: DocTypeMeta | undefined, fn: string) => m?.fields.find((f) => f.fieldname === fn);
const optList = (f: DocField) => String(f.options ?? "").split("\n").map((x) => x.trim()).filter(Boolean);

export function checkFieldRow(env: Env, row: TRow): Ev {
  const s: FieldSpec = parseFieldRow(row);
  if (s.kind === "doctype") return checkDoctypeRow(env, s);
  if (s.kind === "unknown" || s.kind === "notverified") return checkRefRow(env, s);
  if (s.kind === "readmodel" || s.kind === "report") return { present: "NO", where: s.artifact ?? "", result: "FAIL", evidence: "read-model row not yet checked" };
  const home = CHILD_ALIASES[homeOf(s)] ?? homeOf(s);
  const m = env.meta(home);
  if (!m) {
    if (/as applicable/i.test(home)) return { present: "YES", where: "GL Entry.voucher_type + voucher_no", result: env.meta("GL Entry")?.fields.some((f) => f.fieldname === "voucher_no") ? "PASS" : "FAIL", evidence: "native ledger rows keep the source voucher (GL Entry voucher_type/voucher_no); Construction never writes GL" };
    return { present: "NO", where: home, result: "FAIL", evidence: `DocType ${home} not found` };
  }
  // resolve the stored field: own name, equivalence, the owner's same-label reference, native child table
  let fn = s.fieldname, note = "";
  const alias = FIELD_ALIASES[home]?.[s.fieldname];
  if (!fieldOf(m, fn) && alias) { fn = alias; note = `equivalent field ${home}.${alias}`; }
  let f = fieldOf(m, fn); let at = home;
  if (!f && STANDARD_FIELDS.has(fn)) return { present: "YES", where: `${home}.${fn} (standard)`, result: "PASS", evidence: `${note || "standard field"} — every ${home} record carries ${fn}` };
  if (!f && m && !m.istable) for (const t of m.fields.filter((x) => x.fieldtype === "Table" && x.options)) { const c = env.meta(t.options!); const cf = fieldOf(c, fn) ?? (FIELD_ALIASES[t.options!]?.[fn] ? fieldOf(c, FIELD_ALIASES[t.options!]![fn]!) : undefined); if (cf) { f = cf; at = t.options!; note = `line field of ${home} (child ${t.options})`; fn = cf.fieldname!; break; } }
  if (!f && s.composite === "range") {
    const ds = m.fields.filter((x) => x.fieldtype === "Date" || x.fieldtype === "Datetime").map((x) => x.fieldname!);
    const a = ds.find((x) => /(start|from)/.test(x)), b = ds.find((x) => /(end|to_date|until|finish)/.test(x));
    if (a && b) { const r = roundtrip(env, home); const ok = !r.errors.length && (r.stored?.[a] !== undefined || r.sent[a] === undefined); return { present: "YES", where: `${home}.${a} + ${b}`, result: ok ? "PASS" : "FAIL", evidence: `date range stored as ${a} / ${b}; ${r.errors.length ? "save failed: " + r.errors.join("; ") : `saved ${r.name} → ${a}=${String(r.stored?.[a] ?? "")}, ${b}=${String(r.stored?.[b] ?? "")}`}`, ...(specAdded(home, a) ? { fix: specAdded(home, a) } : {}) }; }
  }
  if (!f && s.ref) {
    const rm = env.meta(s.ref.doctype); const rf = fieldOf(rm, s.ref.fieldname) ?? (STANDARD_FIELDS.has(s.ref.fieldname) ? ({ fieldname: s.ref.fieldname, fieldtype: "Data" } as DocField) : undefined);
    if (rf) return { present: "YES", where: `${s.ref.doctype}.${s.ref.fieldname}`, result: "PASS", evidence: `owner mapping: same label/meaning is stored at ${s.ref.doctype}.${s.ref.fieldname} (${rf.fieldtype})`, ...(specAdded(s.ref.doctype, s.ref.fieldname) ? { fix: specAdded(s.ref.doctype, s.ref.fieldname) } : {}) };
  }
  if (!f) return { present: "NO", where: `${home}.${s.fieldname}`, result: "FAIL", evidence: `field ${s.fieldname} not on ${home}` };
  const where = `${at}.${fn}`;
  const dev = DEVIATIONS[where];
  if (dev) return { present: "PARTIAL", where, result: dev.result, evidence: `${where} ${f.fieldtype}; ${dev.reason}`, reason: dev.reason, owner: dev.owner };
  const problems: string[] = [];
  const ft = f.fieldtype ?? "";
  const childTarget = s.type === "Link" && ft === "Data" && (s.target ? !!env.meta(s.target.replace(/^Digit EOT Request$/, "Digit EOT"))?.istable : /_(item|line|row)$/.test(fn));
  const compat = COMPATIBLE_TYPES.find(([a, b]) => a === s.type && b === ft) ?? (childTarget ? (["Link", "Data", "row reference: a child-table row is referenced by its row name or key (Data), as the standard platform does — server Link fields cannot target child rows"] as [string, string, string]) : undefined);
  if (s.type !== "UNKNOWN" && s.type !== "SOURCE_GAP" && !typeMatches(s.type, ft) && !compat) problems.push(`type ${ft}, spec ${s.type}`);
  if (s.type === "Link" && s.target && ft === "Link" && !childTarget) { const want = s.target.replace(/^Digit EOT Request$/, "Digit EOT").replace(/^Digit Defect Case$/, "Digit Defect"); if (f.options !== want) problems.push(`links to ${f.options}, spec ${s.target}`); }
  if (s.options?.length && ft === "Select") { const have = optList(f); const miss = s.options.filter((o) => !have.includes(synonymFor(o, have))); if (miss.length) problems.push(`Select lacks ${miss.join(" / ")}`); }
  if (s.reqd && !Number(f.reqd ?? 0) && !f["mandatory_depends_on"]) problems.push("not mandatory");
  if (s.reqd && !Number(f.reqd ?? 0) && f["mandatory_depends_on"]) note = `${note ? note + "; " : ""}mandatory when ${String(f["mandatory_depends_on"]).replace(/^eval:/, "")}`;
  // create → save → read back
  const r = roundtrip(env, at);
  let back = "";
  if (r.errors.length) problems.push(`save failed: ${r.errors.join("; ").slice(0, 200)}`);
  else if (RULE_SET[at]?.[fn]) back = `saved ${r.parent ?? at + " " + r.name}; ${fn} is set by the rule — ${RULE_SET[at]![fn]} (stored: ${JSON.stringify(r.stored?.[fn] ?? null)})`;
  else if (Number(f.read_only ?? 0) || f.fetch_from || ft === "Table" || ft === "Dynamic Link" || fn === "workflow_state" || LAYOUT.has(ft)) back = `saved ${r.parent ?? at + " " + r.name}; ${fn} is ${ft === "Table" ? "a child table" : "set by the system"} (stored: ${JSON.stringify(r.stored?.[fn] ?? null).slice(0, 40)})`;
  else if (fn in r.sent && !sameValue(r.sent[fn], r.stored?.[fn])) problems.push(`read back ${JSON.stringify(r.stored?.[fn])} ≠ sent ${JSON.stringify(r.sent[fn])}`);
  else back = fn in r.sent ? `${r.how === "created" ? "created → saved" : r.how} ${r.parent ?? at + " " + r.name}; read back ${fn}=${JSON.stringify(r.stored?.[fn]).slice(0, 40)}` : `saved ${r.parent ?? at + " " + r.name}; ${fn} has no linkable sample (no ${f.options} record)`;
  const fix = specAdded(at, fn) ?? specAdded(at, "");
  const ev = `${where} ${ft}${f.options && ft !== "Select" ? "→" + f.options : ""}${Number(f.reqd ?? 0) ? " mandatory" : ""}${compat ? " — " + compat[2] : ""}${note ? " — " + note : ""}; ${problems.length ? "PROBLEM: " + problems.join("; ") : back}`;
  return { present: problems.some((p) => p.startsWith("type") || p.startsWith("links")) ? "PARTIAL" : "YES", where, result: problems.length ? "FAIL" : "PASS", evidence: ev, ...(fix ? { fix } : {}) };
}

function checkDoctypeRow(env: Env, s: FieldSpec): Ev {
  const dt = s.doctypes[0]!; const m = env.meta(dt);
  if (!m) return { present: "NO", where: dt, result: "FAIL", evidence: `DocType ${dt} not found` };
  const miss = (s.fields ?? []).filter((fn) => !fieldOf(m, fn));
  const r = roundtrip(env, dt);
  const added = (s.fields ?? []).map((fn) => specAdded(dt, fn)).filter(Boolean);
  const fix = specAdded(dt, "") ?? (added.length ? `${added.length} field(s) restored: ${added.slice(0, 3).join("; ")}${added.length > 3 ? " …" : ""}` : undefined);
  const ok = !miss.length && !r.errors.length;
  return { present: miss.length ? "PARTIAL" : "YES", where: `${dt} (${m.fields.length} fields${m.istable ? ", child table" : ""})`, result: ok ? "PASS" : "FAIL",
    evidence: `${(s.fields ?? []).length - miss.length}/${(s.fields ?? []).length} listed fields present${miss.length ? "; missing " + miss.join(", ") : ""}; ${r.errors.length ? "save failed: " + r.errors.join("; ") : `created → saved → read back ${r.parent ?? dt + " " + r.name}`}`, ...(fix ? { fix } : {}) };
}

function checkRefRow(env: Env, s: FieldSpec): Ev {
  if (!s.ref) return { present: "NO", where: "", result: "FAIL", evidence: "row names no DocType or reference" };
  const m = env.meta(s.ref.doctype); const f = fieldOf(m, s.ref.fieldname);
  const ok = !!f || STANDARD_FIELDS.has(s.ref.fieldname);
  return { present: ok ? "YES" : "NO", where: `${s.ref.doctype}.${s.ref.fieldname}`, result: ok ? "PASS" : "FAIL", evidence: ok ? `owner mapping: «${s.labelAr || s.labelEn}» is stored at ${s.ref.doctype}.${s.ref.fieldname} (${f?.fieldtype ?? "standard"})` : `${s.ref.doctype}.${s.ref.fieldname} not found`, ...(specAdded(s.ref.doctype, s.ref.fieldname) ? { fix: specAdded(s.ref.doctype, s.ref.fieldname) } : {}) };
}
