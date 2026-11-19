/**
 * Plugin runtime: additive layer over the frozen catalog. Core files are never edited — catalog.ts
 * asks this module to overlay enabled plugins on meta/index, and form/list code asks it for buttons,
 * events and indicators. Disabling a plugin removes every overlay, so the core renders Original again.
 */
import { CORE_MANIFEST, coreSlug } from "@/lib/coreShared/doctypes";
import { isServerHosted } from "@/lib/serverHost";
import type { DocField, DocTypeMeta, IndexEntry } from "@/lib/catalog";
import { adapter, type Doc } from "@/lib/adapter";
import { scopedList } from "@/lib/scope";
import { evalExpr } from "@/lib/expr";
import { setPluginTranslations } from "@/i18n";
import type { PluginManifest, ServerScript, ClientScript, NumberCard, DashboardChart } from "./types";
import { builtinPlugins } from "./registry";
import { parseClientScript } from "./clientScriptParser";
import nativeOwnership from './nativeOwnership.json';
import { ownershipIssues } from './sourceInspection';

const EN_KEY = "digit-virtual-core:plugins-enabled-v1";
const IMP_KEY = "digit-virtual-core:plugins-imported-v1";
const isB = typeof window !== "undefined";
const subs = new Set<() => void>();
let ver = 0;
/** Query-key signature: enabled set + change counter (empty on the server, so SSR-cached meta never masks the overlay). */
/** Monotonic counter of plugin changes (cache keys that must not depend on the enabled set string). */
export const pluginsEpoch = () => ver;
export const pluginsVersion = (): string => (isB ? `${[...enabledSet()].sort().join(",")}#${ver}#${liveSig()}` : "");
export const liveSig = () => { const m = liveManifest(); return m ? JSON.stringify([m.custom_fields, m.property_setters, m.doctypes, m.workflows]).length + ":" + adapter.list("Custom Field").length + adapter.list("Property Setter").length + adapter.list("DocType").length : "0"; };
export function subscribePlugins(f: () => void) { subs.add(f); return () => { subs.delete(f); }; }
const bump = () => { ver++; syncTranslations(); subs.forEach((f) => f()); };

export function importedPlugins(): PluginManifest[] { if (!isB) return []; try { return JSON.parse(localStorage.getItem(IMP_KEY) || "[]"); } catch { return []; } }
export function allPlugins(): PluginManifest[] { return [...builtinPlugins(), ...importedPlugins()]; }
function enabledSet(): Set<string> { if (!isB) return new Set(); try { return new Set(JSON.parse(localStorage.getItem(EN_KEY) || "[]")); } catch { return new Set(); } }
export function isEnabled(name: string) { return enabledSet().has(name); }
export function enabledPlugins(): PluginManifest[] { const s = enabledSet(); const l = allPlugins().filter((p) => s.has(p.name)); const live = liveManifest(); return live ? [...l, live] : l; }

// ---------- live site customizations (Customize Form / Custom Field / Property Setter / Server Script / DocType / Workflow records) ----------
let liveCache: { v: number; m: PluginManifest | null } = { v: -1, m: null };
/** Builds a manifest from customization records saved through the Desk, so they apply live and export like any plugin. */
export function liveManifest(): PluginManifest | null {
  if (!isB) return null;
  const v = adapter.version(); if (liveCache.v === v) return liveCache.m;
  const on = (d: Doc) => Number(d["disabled"] ?? 0) !== 1 && Number(d["enabled"] ?? 1) !== 0;
  const rows = (d: Doc, f: string) => (Array.isArray(d[f]) ? (d[f] as Record<string, unknown>[]) : []);
  const custom_fields = adapter.list("Custom Field").filter((d) => d["dt"] && d["fieldname"]).map((d) => ({ dt: String(d["dt"]), fieldname: String(d["fieldname"]), label: String(d["label"] ?? d["fieldname"]), fieldtype: String(d["fieldtype"] ?? "Data"), options: d["options"] as string | undefined, insert_after: String(d["insert_after"] ?? ""), reqd: Number(d["reqd"] ?? 0), default: d["default"] as string | undefined, depends_on: d["depends_on"] as string | undefined, in_list_view: Number(d["in_list_view"] ?? 0) }));
  const property_setters = adapter.list("Property Setter").filter((d) => d["doc_type"] && d["property"]).map((d) => ({ doc_type: String(d["doc_type"]), doctype_or_field: (d["doctype_or_field"] === "DocType" ? "DocType" : "DocField") as "DocType" | "DocField", field_name: d["field_name"] as string | undefined, property: String(d["property"]), property_type: String(d["property_type"] ?? "Data"), value: String(d["value"] ?? "") }));
  const doctypes = adapter.list("DocType").filter((d) => Number(d["custom"] ?? 0) === 1 && !d["__synthetic"] && rows(d, "fields").length).map((d) => ({ name: d.name, module: String(d["module"] ?? "Custom"), istable: Number(d["istable"] ?? 0), issingle: Number(d["issingle"] ?? 0), is_submittable: Number(d["is_submittable"] ?? 0), autoname: d["autoname"] as string | undefined, title_field: d["title_field"] as string | undefined, fields: rows(d, "fields").map((f) => ({ fieldname: String(f["fieldname"] ?? ""), label: String(f["label"] ?? ""), fieldtype: String(f["fieldtype"] ?? "Data"), options: f["options"], reqd: Number(f["reqd"] ?? 0), in_list_view: Number(f["in_list_view"] ?? 0) })) as unknown as DocField[], permissions: rows(d, "permissions") as never }));
  const server_scripts = adapter.list("Server Script").filter((d) => on(d) && d["script_type"] === "DocType Event" && d["reference_doctype"]).map((d) => ({ name: d.name, script_type: "DocType Event" as const, reference_doctype: String(d["reference_doctype"]), doctype_event: (d["doctype_event"] ?? "Before Save") as NonNullable<ServerScript["doctype_event"]>, script: String(d["script"] ?? ""), validate: parseThrows(String(d["script"] ?? "")) }));
  const client_scripts = adapter.list("Client Script").filter((d) => on(d) && d["dt"]).map((d) => { const src = String(d["script"] ?? ""); const p = parseClientScript(src); return { name: d.name, dt: String(d["dt"]), view: (d["view"] === "List" ? "List" : "Form") as "Form" | "List", script: src, buttons: p.buttons, on_change: p.on_change, set_query: p.set_query, refresh: p.refresh }; });
  const workflows = adapter.list("Workflow").filter((d) => Number(d["is_active"] ?? 0) === 1 && d["document_type"] && !d["__synthetic"]).map((d) => ({ name: d.name, document_type: String(d["document_type"]), workflow_state_field: String(d["workflow_state_field"] ?? "workflow_state"), is_active: 1, states: rows(d, "states").map((r) => ({ state: String(r["state"]), doc_status: String(r["doc_status"] ?? "0") as "0", allow_edit: String(r["allow_edit"] ?? "") })), transitions: rows(d, "transitions").map((r) => ({ state: String(r["state"]), action: String(r["action"]), next_state: String(r["next_state"]), allowed: String(r["allowed"] ?? ""), condition: r["condition"] as string | undefined })) }));
  const n = custom_fields.length + property_setters.length + doctypes.length + server_scripts.length + client_scripts.length + workflows.length;
  const m = (n ? { name: "site_customizations", title: "Site Customizations", title_ar: "تخصيصات الموقع", version: "0.0.1", publisher: "Site", email: "admin@example.com", license: "MIT", description: "Live customizations saved from the Desk (exportable as a DIGIT app).", host_app: "frappe", module: "Custom", required_apps: ["frappe"], custom_fields: custom_fields as never, property_setters: property_setters as never, doctypes: doctypes as never, server_scripts, client_scripts: client_scripts as never, workflows: workflows as never } : null) as PluginManifest | null;
  liveCache = { v, m }; return m;
}
/** Server Script `frappe.throw(...)` guarded by `if <cond>:` → declarative validation (never executed as Python). */
function parseThrows(src: string): { condition: string; message: string }[] {
  const out: { condition: string; message: string }[] = [];
  const re = /if\s+(.+?):\s*\n\s*frappe\.throw\(\s*(?:_\()?["']([^"']+)["']/g; let x;
  while ((x = re.exec(src))) out.push({ condition: x[1]!.replace(/doc\./g, "doc.").replace(/\band\b/g, "&&").replace(/\bor\b/g, "||").replace(/\bnot\b/g, "!"), message: x[2]! });
  return out;
}

export function setEnabled(name: string, on: boolean) {
  const plugin = allPlugins().find(p => p.name === name);
  if (on) {
    if (!plugin) throw new Error(`Plugin ${name} not found`);
    assertOwnership(plugin);
    const deps = dependencyIssues(plugin).filter((i) => i.severity === "error");
    if (deps.length) throw new Error(deps.map((i) => i.message).join("\n"));
  } else if (plugin) {
    // disabling an app other enabled apps depend on would orphan their extensions
    const dependents = enabledPlugins().filter((p) => p.name !== name && requiredOf(p).includes(name));
    if (dependents.length) throw new Error(`${name} is required by ${dependents.map((p) => p.name).join(", ")}; disable those apps first.`);
  }
  const s = enabledSet(); if (on) s.add(name); else s.delete(name);
  localStorage.setItem(EN_KEY, JSON.stringify([...s]));
  if (on && plugin) { installFixtures(plugin); installDemo(plugin); }
  logEvent({ kind: "plugin", doctype: "", name, event: on ? "enabled" : "disabled" });
  bump();
}
/** Virtual demo installer of a built-in app (insert-if-missing); errors are logged, never thrown into the toggle. */
export function installDemo(p: PluginManifest): number {
  if (isServerHosted()) return 0;
  const fn = p.install_demo ?? appRuntimes.get(p.name)?.install_demo;
  if (!fn) return 0;
  try { const n = fn(); if (n) logEvent({ kind: "plugin", doctype: "", name: p.name, event: `demo installed (${n})` }); return n; }
  catch (e) { logEvent({ kind: "plugin", doctype: "", name: p.name, event: "demo install failed", detail: (e as Error).message }); return 0; }
}
/** Runtime parts of built-in apps that must not load with the manifest (doc hooks, demo installer): registered by the
 *  app's boot module (src/plugins/builtinBoot.ts) after the adapter is initialised, avoiding catalog → runtime → manifest cycles. */
const appRuntimes = new Map<string, { install_demo?: () => number }>();
export function registerAppRuntime(name: string, rt: { install_demo?: () => number }) { appRuntimes.set(name, rt); }
/** Dock entries declared by enabled app manifests. */
export function pluginDocks() { return enabledPlugins().filter((p) => p.dock).map((p) => ({ name: p.name, ...p.dock! })); }
export function saveImported(p: PluginManifest) {
  if (builtinPlugins().some((b) => b.name === p.name)) p = { ...p, name: `${p.name}_imported`, title: `${p.title} (imported)` };
  assertOwnership(p);
  const list = importedPlugins().filter((x) => x.name !== p.name); list.push(p);
  localStorage.setItem(IMP_KEY, JSON.stringify(list)); bump();
}
function assertOwnership(p: PluginManifest) {
  const native = Object.entries(nativeOwnership).map(([name, app]) => ({ name, app: app as DocTypeMeta['app'] }));
  const errors = ownershipIssues(p, native, allPlugins()).filter(i => i.severity === 'error');
  if (errors.length) throw new Error(errors.map(i => i.message).join('\n'));
}

// ---------- dependency / compatibility validation (P4) ----------
/** Recorded source snapshot versions (public/source-intelligence/source-manifest.json; asserted by masterFoundation.test.ts). */
export const RECORDED_SOURCE_VERSIONS: Record<string, string> = { frappe: "17.0.0-dev", erpnext: "17.0.0-dev", hrms: "17.0.0-dev", crm: "2.0.0-dev", insights: "4.0.0-dev" };
/** Apps the virtual Core provides: the four host slots + the virtual Insights runtime. */
export const VIRTUAL_HOST_APPS = ["frappe", "erpnext", "hrms", "crm", "insights"];
const requiredOf = (p: PluginManifest) => [...new Set([...(p.required_apps ?? []), ...(p.source_application?.dependencies ?? []).filter((d) => !d.optional).map((d) => d.name)])];
const vparts = (v: string) => { const m = v.trim().match(/^(\d+)(?:\.(\d+))?(?:\.(\d+))?(-[\w.]+)?$/); return m ? { n: [Number(m[1]), Number(m[2] ?? 0), Number(m[3] ?? 0)], pre: !!m[4] } : null; };
/** Compare two versions; a pre-release (-dev) sorts before its release. */
export function compareVersions(a: string, b: string): number {
  const x = vparts(a), y = vparts(b); if (!x || !y) return NaN;
  for (let i = 0; i < 3; i++) if (x.n[i] !== y.n[i]) return x.n[i]! - y.n[i]!;
  return x.pre === y.pre ? 0 : x.pre ? -1 : 1;
}
/**
 * Check a constraint such as ">=17.0.0-dev,<18.0.0" (comma = AND). Supported grammar: >=, >, <=, <, ==, = ,
 * ^X.Y.Z (npm caret: same leftmost non-zero component) and ~=X.Y[.Z] (PEP 440 compatible release). Anything else
 * (wildcards, ||, !=, URLs) returns null = unverified; this is not a full semver/PEP 440 solver.
 */
export function satisfies(version: string, constraint: string): boolean | null {
  for (const part of constraint.split(",").map((s) => s.trim()).filter(Boolean)) {
    const m = part.match(/^(>=|<=|>|<|==|=|~=|\^)?\s*(\d[\w.-]*)$/); if (!m) return null;
    const c = compareVersions(version, m[2]!); if (Number.isNaN(c)) return null;
    const op = m[1] ?? "==";
    let ok: boolean;
    if (op === "^" || op === "~=") {
      const base = vparts(m[2]!)!.n; const given = m[2]!.split("-")[0]!.split(".").length;
      let upper: number[];
      if (op === "^") { const i = base[0]! > 0 ? 0 : base[1]! > 0 ? 1 : 2; upper = base.map((x, k) => (k < i ? x : k === i ? x + 1 : 0)); }
      else { if (given < 2) return null; const i = given - 2; upper = base.map((x, k) => (k < i ? x : k === i ? x + 1 : 0)); }
      // the upper bound excludes its own pre-releases too (18.0.0-dev is not ^17)
      ok = c >= 0 && compareVersions(version, `${upper.join(".")}-0`) < 0;
    } else ok = op === ">=" ? c >= 0 : op === ">" ? c > 0 : op === "<=" ? c <= 0 : op === "<" ? c < 0 : c === 0;
    if (!ok) return false;
  }
  return true;
}
export interface DependencyIssue { code: "MISSING_DEPENDENCY" | "INCOMPATIBLE_VERSION" | "UNVERIFIED_CONSTRAINT"; severity: "error" | "warning"; message: string }
export function dependencyIssues(p: PluginManifest, enabled: string[] = enabledPlugins().map((x) => x.name)): DependencyIssue[] {
  const out: DependencyIssue[] = [];
  const available = new Set([...VIRTUAL_HOST_APPS, ...enabled, ...allPlugins().filter((x) => enabled.includes(x.name)).map((x) => x.source_application?.namespace ?? x.name)]);
  for (const d of requiredOf(p)) if (d !== p.name && !available.has(d)) out.push({ code: "MISSING_DEPENDENCY", severity: "error", message: `${p.name}: required app ${d} is not available (enable or import it first).` });
  const constraints: Record<string, string> = { ...(p.compatibility ?? {}) };
  for (const d of p.source_application?.dependencies ?? []) if (d.constraint && !constraints[d.name]) constraints[d.name] = d.constraint;
  for (const [app, c] of Object.entries(constraints)) {
    const v = RECORDED_SOURCE_VERSIONS[app] ?? allPlugins().find((x) => x.name === app)?.version; if (!v) continue;
    const ok = satisfies(v, c);
    if (ok === false) out.push({ code: "INCOMPATIBLE_VERSION", severity: "error", message: `${p.name}: requires ${app} ${c}; recorded source is ${v}.` });
    if (ok === null) out.push({ code: "UNVERIFIED_CONSTRAINT", severity: "warning", message: `${p.name}: constraint ${app} ${c} could not be evaluated against ${v}.` });
  }
  return out;
}

// ---------- app extension lookups (actions, settings, department sections) ----------
export function appActions(dt: string) { return enabledPlugins().flatMap((p) => (p.actions ?? []).filter((a) => a.doctype === dt).map((a) => ({ ...a, plugin: p.name }))); }
export function appSettings() { return enabledPlugins().flatMap((p) => (p.settings ?? []).map((s) => ({ ...s, plugin: p.name, host_app: p.host_app }))); }
export function departmentInjections(dept: string) { return enabledPlugins().flatMap((p) => (p.department_sections ?? []).filter((s) => s.department === dept).map((s) => ({ ...s, plugin: p.name }))); }
export function removeImported(name: string) { setEnabled(name, false); localStorage.setItem(IMP_KEY, JSON.stringify(importedPlugins().filter((x) => x.name !== name))); resetPluginData(name); bump(); }

export function installFixtures(p: PluginManifest) {
  if (isServerHosted()) return;
  for (const f of p.fixtures ?? []) if (!adapter.get(f.doctype, f.name)) adapter.insertDocQuiet(f.doctype, { ...f.data, name: f.name, __plugin: p.name });
  adapter.flush();
}
/** Remove every record a plugin created (fixtures + records of its own DocTypes) and its custom-field values. */
export function resetPluginData(name: string): number {
  const p = allPlugins().find((x) => x.name === name); let n = 0;
  const own = new Set((p?.doctypes ?? []).map((d) => d.name));
  for (const dt of adapter.doctypes()) for (const d of adapter.list(dt)) {
    if (d["__plugin"] === name || own.has(dt)) { adapter.remove(dt, d.name); n++; continue; }
    const cf = (p?.custom_fields ?? []).filter((c) => c.dt === dt && c.fieldname in d);
    if (cf.length) { const x: Record<string, unknown> = { ...d }; for (const c of cf) delete x[c.fieldname]; adapter.insertDocQuiet(dt, x as Doc); n++; }
  }
  adapter.flush(); bump(); return n;
}

function syncTranslations() {
  const m: Record<string, string> = {};
  for (const p of withCore()) Object.assign(m, p.translations ?? {});
  setPluginTranslations(m);
}
export function initPlugins() { syncTranslations(); }

// ---------- meta overlay ----------
export const pluginSlug = (n: string) => n.toLowerCase().replace(/[^a-z0-9]+/g, "_");
/** Shared Core manifest first (always active, `core_` slugs), then the enabled apps. */
const withCore = (): PluginManifest[] => [CORE_MANIFEST, ...enabledPlugins()];
const docSlug = (p: PluginManifest, name: string) => (p === CORE_MANIFEST ? coreSlug(name) : pluginSlug(name));
export function pluginIndexEntries(): IndexEntry[] {
  return withCore().flatMap((p) => (p.doctypes ?? []).map((d) => ({ name: d.name, app: p.host_app, module: d.module ?? p.module, slug: docSlug(p, d.name), istable: d.istable ?? 0, issingle: d.issingle ?? 0, is_submittable: d.is_submittable ?? 0, nfields: d.fields.length, source: `plugin:${p.name}` })));
}
export function pluginMeta(slug: string): DocTypeMeta | undefined {
  for (const p of withCore()) for (const d of p.doctypes ?? []) if (docSlug(p, d.name) === slug)
    return { name: d.name, app: p.host_app, module: d.module ?? p.module, istable: d.istable ?? 0, issingle: d.issingle ?? 0, is_submittable: d.is_submittable ?? 0, is_tree: d.is_tree ?? 0, autoname: d.autoname, title_field: d.title_field, search_fields: d.search_fields, fields: d.fields, source: `plugin:${p.name}`, permissions: d.permissions, links: d.links ?? [] } as DocTypeMeta;
  return undefined;
}
/** Custom Fields + Property Setters, applied on a copy (catalog JSON stays the Original baseline). */
export function overlayMeta(meta: DocTypeMeta): DocTypeMeta {
  const ps = withCore(); // the always-active Core manifest first (its fields on native DocTypes), then enabled apps
  const cfs = ps.flatMap((p) => (p.custom_fields ?? []).filter((c) => c.dt === meta.name).map((c) => ({ ...c, __plugin: p.name })));
  const props = ps.flatMap((p) => (p.property_setters ?? []).filter((x) => x.doc_type === meta.name));
  const perms = ps.flatMap((p) => (p.docperms ?? []).filter((x) => x.parent === meta.name));
  if (!cfs.length && !props.length && !perms.length) return meta;
  const fields: DocField[] = meta.fields.map((f) => ({ ...f }));
  for (const c of cfs) {
    if (fields.some((f) => f.fieldname === c.fieldname)) continue;
    const at = fields.findIndex((f) => f.fieldname === c.insert_after);
    const { dt: _dt, insert_after: _ia, ...field } = c;
    fields.splice(at < 0 ? fields.length : at + 1, 0, { ...field, is_custom_field: 1 } as DocField);
  }
  const m: DocTypeMeta = { ...meta, fields };
  // app permission-level rows (frappe.permissions.add_permission) on a copy; an existing role+level row is never duplicated
  if (perms.length) { const base = [...((meta.permissions ?? []) as unknown as Record<string, unknown>[])]; for (const x of perms) if (!base.some((r) => r["role"] === x.role && Number(r["permlevel"] ?? 0) === x.permlevel)) { const { parent: _p, ...flags } = x; base.push({ ...flags, write: x.write ?? 0 }); } (m as unknown as Record<string, unknown>)["permissions"] = base; }
  for (const p of props) {
    const v: unknown = /^(Check|Int)$/.test(p.property_type) ? Number(p.value) : p.value;
    if (p.doctype_or_field === "DocType") (m as unknown as Record<string, unknown>)[p.property] = v;
    else { const f = fields.find((x) => x.fieldname === p.field_name); if (f) f[p.property] = v; }
  }
  // DocType-level `field_order` property setter (Customize Form drag order): listed fields first, in that order
  const fo = (m as unknown as Record<string, unknown>)["field_order"];
  if (typeof fo === "string" && fo.startsWith("[")) { try { const order: string[] = JSON.parse(fo); const pos = new Map(order.map((n, i) => [n, i])); const idx = new Map(fields.map((f, i) => [f, i])); m.fields = [...fields].sort((a, b) => (pos.get(a.fieldname ?? "") ?? 1e6 + idx.get(a)!) - (pos.get(b.fieldname ?? "") ?? 1e6 + idx.get(b)!)); } catch { /* malformed setter: keep source order */ } }
  return m;
}

// ---------- event log ----------
export interface EventRow { at: string; kind: "doc" | "client" | "server" | "api" | "plugin"; doctype: string; name: string; event: string; detail?: string | undefined }
const log: EventRow[] = [];
const logSubs = new Set<() => void>();
export function logEvent(e: Omit<EventRow, "at">) { log.unshift({ ...e, at: new Date().toISOString() }); if (log.length > 500) log.pop(); logSubs.forEach((f) => f()); }
export const eventLog = () => log;
export function subscribeLog(f: () => void) { logSubs.add(f); return () => { logSubs.delete(f); }; }

// ---------- expressions ----------
/** Evaluates an expression with doc fields in scope; quoted strings and numbers are literals. */
export function value(expr: string, doc: Record<string, unknown>): unknown {
  const s = expr.trim();
  if (/^(['"]).*\1$/.test(s)) return s.slice(1, -1);
  if (/^-?\d+(\.\d+)?$/.test(s)) return Number(s);
  const r = evalExpr(s, doc, { today: new Date().toISOString().slice(0, 10) });
  return r.supported ? r.value : undefined;
}
const truthy = (expr: string | undefined, doc: Record<string, unknown>) => !expr || !!value(expr, doc);
export const fill = (tpl: string, doc: Record<string, unknown>) => tpl.replace(/\{(\w+)\}/g, (_m, k: string) => String(doc[k] ?? ""));

// ---------- server scripts (virtual) ----------
const EVENT_MAP: Record<string, ServerScript["doctype_event"][]> = {
  before_save: ["Before Validate", "Before Save"], after_save: ["After Save"], before_insert: ["Before Insert"],
  before_submit: ["Before Submit"], on_submit: ["After Submit"], before_cancel: ["Before Cancel"], on_cancel: ["After Cancel"],
};
/**
 * Recipients of a System Notification (frappe Notification.get_list_of_recipients): enabled users holding a
 * receiver_by_role role plus the user named in a receiver_by_document_field; Administrator when nobody qualifies, so
 * an alert is never lost. One Notification Log per recipient, so each user's bell shows only their own alerts.
 */
export function notificationRecipients(n: { recipients?: { receiver_by_role?: string; receiver_by_document_field?: string }[] }, d: Doc): string[] {
  const out = new Set<string>();
  for (const r of n.recipients ?? []) {
    if (r.receiver_by_role) for (const u of adapter.list("User")) {
      const roles = Array.isArray(u["roles"]) ? (u["roles"] as Record<string, unknown>[]) : [];
      if (Number(u["enabled"] ?? 1) !== 0 && roles.some((x) => x["role"] === r.receiver_by_role)) out.add(u.name);
    }
    if (r.receiver_by_document_field) { const v = String(d[r.receiver_by_document_field] ?? ""); if (v && adapter.get("User", v)) out.add(v); }
  }
  return out.size ? [...out] : ["Administrator"];
}
export function runDocEvent(dt: string, event: keyof typeof EVENT_MAP, doc: Doc): { doc: Doc; errors: string[] } {
  let d = { ...doc }; const errors: string[] = [];
  for (const p of enabledPlugins()) for (const s of p.server_scripts ?? []) {
    if (s.script_type !== "DocType Event" || s.reference_doctype !== dt || s.enabled === 0 || !EVENT_MAP[event]!.includes(s.doctype_event)) continue;
    for (const v of s.validate ?? []) if (truthy(v.condition, d)) errors.push(fill(v.message, d));
    for (const [k, e] of Object.entries(s.set ?? {})) d = { ...d, [k]: value(e, d) };
    logEvent({ kind: "server", doctype: dt, name: d.name, event: `${s.doctype_event} → ${s.name}`, detail: errors.join("; ") || undefined });
  }
  for (const n of enabledPlugins().flatMap((p) => p.notifications ?? [])) {
    const fire = n.document_type === dt && ((n.event === "Save" && event === "after_save") || (n.event === "Submit" && event === "on_submit") || (n.event === "Cancel" && event === "on_cancel"));
    if (fire && truthy(n.condition, d)) {
      const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      notificationRecipients(n, d).forEach((u, i) => adapter.insertDocQuiet("Notification Log", { name: `PLN-${stamp}-${i}`, subject: fill(n.subject, d), ...(n.subject_ar ? { subject_ar: fill(n.subject_ar, d) } : {}), email_content: fill(n.message, d), for_user: u, from_user: d["modified_by"] ?? d["owner"] ?? "", type: "Alert", document_type: dt, document_name: d.name, read: 0, creation: new Date().toISOString() }));
      logEvent({ kind: "server", doctype: dt, name: d.name, event: `Notification → ${n.name}` });
    }
  }
  return { doc: d, errors };
}
export function apiMethods() { return enabledPlugins().flatMap((p) => (p.server_scripts ?? []).filter((s) => s.script_type === "API").map((s) => ({ plugin: p.name, ...s }))); }
export function callMethod(method: string, args: Record<string, unknown> = {}): unknown {
  const m = apiMethods().find((s) => s.api_method === method || `${s.plugin}.api.${s.api_method}` === method);
  if (!m?.handler) throw new Error(`Method ${method} not found`);
  logEvent({ kind: "api", doctype: "", name: method, event: "call", detail: JSON.stringify(args).slice(0, 120) });
  return m.handler(args);
}

// ---------- client scripts ----------
export function clientScripts(dt: string, view: ClientScript["view"] = "Form") { return enabledPlugins().flatMap((p) => (p.client_scripts ?? []).filter((c) => c.dt === dt && c.view === view && c.enabled !== 0)); }
export function formButtons(dt: string, doc: Doc) { return clientScripts(dt).flatMap((c) => (c.buttons ?? []).filter((b) => truthy(b.condition, doc)).map((b) => ({ ...b, script: c.name }))); }
export function onChangeScripts(dt: string, doc: Doc, changed: string[]): Doc {
  let d = doc;
  for (const c of clientScripts(dt)) for (const f of changed) for (const [k, e] of Object.entries(c.on_change?.[f] ?? {})) { d = { ...d, [k]: value(e, d) }; logEvent({ kind: "client", doctype: dt, name: d.name, event: `${f} → ${c.name}` }); }
  return d;
}
/** refresh(frm): set_df_property / toggle_* overrides and set_intro from client scripts. */
export function clientRefresh(dt: string, doc: Doc): { over: Record<string, { hidden?: boolean; reqd?: boolean; ro?: boolean }>; intro: string[] } {
  const over: Record<string, { hidden?: boolean; reqd?: boolean; ro?: boolean }> = {}; const intro: string[] = [];
  for (const c of clientScripts(dt)) {
    const r = c.refresh; if (!r) continue;
    if (r.intro) intro.push(r.intro);
    for (const x of r.df) { const b = !!value(x.value, doc); const k = x.property === "read_only" ? "ro" : x.property; if (k === "hidden" || k === "reqd" || k === "ro") (over[x.fieldname] ??= {})[k] = b; }
  }
  return { over, intro };
}
/** frm.set_query filters from client scripts; `eval:` values resolve against the current doc. */
export function clientSetQuery(dt: string, field: string, doc: Doc): [string, string, string, unknown][] {
  return clientScripts(dt).flatMap((c) => (c.set_query ?? []).filter((q) => q.fieldname === field).flatMap((q) => q.filters.map((f) => [f[0], f[1], f[2], typeof f[3] === "string" && f[3].startsWith("eval:") ? value(f[3].slice(5), doc) : f[3]] as [string, string, string, unknown])));
}
export function pluginListIndicator(dt: string, doc: Doc) {
  for (const c of clientScripts(dt, "List")) for (const i of c.list_indicator ?? []) if (truthy(i.condition, doc)) return i;
  return undefined;
}

// ---------- dashboards ----------
export function match(doc: Doc, filters: [string, string, string, unknown][]) {
  return filters.every(([, f, op, v]) => {
    const x = doc[f]; const today = new Date().toISOString().slice(0, 10);
    const val = v === "Today" ? today : v === "This Month Start" ? today.slice(0, 8) + "01" : v;
    switch (op) { case "=": return String(x ?? "") === String(val); case "!=": return String(x ?? "") !== String(val); case ">": return Number(x) > Number(val) || String(x) > String(val); case "<": return (typeof x === "number" ? x < Number(val) : String(x ?? "") < String(val)); case ">=": return String(x ?? "") >= String(val); case "<=": return String(x ?? "") <= String(val); case "in": return (val as unknown[]).map(String).includes(String(x)); default: return true; }
  });
}
/** Plugin number card over the rows the session user may read (src/lib/scope.ts) — same rows as the filtered list and drill-down. */
export function cardRows(c: { document_type: string; filters: [string, string, string, unknown][] }): Doc[] { return scopedList(c.document_type).filter((d) => match(d, c.filters)); }
export function cardValue(c: NumberCard): number {
  const rows = cardRows(c);
  if (c.function === "Count") return rows.length;
  const s = rows.reduce((a, d) => a + Number(d[c.aggregate_function_based_on ?? ""] ?? 0), 0);
  return c.function === "Average" ? (rows.length ? s / rows.length : 0) : Math.round(s * 100) / 100;
}
export function chartData(c: DashboardChart): { label: string; value: number }[] {
  const rows = cardRows(c);
  const by = new Map<string, number>();
  for (const d of rows) { const k = String(d[c.group_by_based_on ?? c.based_on ?? ""] ?? "—"); by.set(k, (by.get(k) ?? 0) + (c.chart_type === "Sum" || c.value_based_on ? Number(d[c.value_based_on ?? ""] ?? 0) : 1)); }
  return [...by.entries()].map(([label, v]) => ({ label, value: Math.round(v * 100) / 100 })).sort((a, b) => b.value - a.value).slice(0, c.limit ?? 10);
}

/**
 * Display label of a workflow state on a plugin-owned DocType (form header chip): the owning enabled plugin's own translation, Arabic only.
 * Stored workflow_state values, filters and transitions never change, and DocTypes no app owns keep the raw state exactly as before.
 */
export function workflowStateLabel(doctype: string, state: string, lang: "ar" | "en"): string {
  if (lang !== "ar" || !state) return state;
  for (const p of enabledPlugins()) {
    if (p.name === "site_customizations") continue;
    const owns = p.doctypes?.some((d) => d.name === doctype) || p.workflows?.some((w) => w.document_type === doctype);
    const label = owns ? p.translations?.[state] : undefined;
    if (label) return label;
  }
  return state;
}

// ---------- React hook ----------
import { useSyncExternalStore } from "react";
export function usePluginsVersion() { return useSyncExternalStore(subscribePlugins, pluginsVersion, () => ""); }
export function useEventLog() { return useSyncExternalStore(subscribeLog, () => log.length ? log[0]!.at + log.length : "", () => ""); }
