/**
 * Session Defaults — one resolver for every "user default" read in the virtual Core (port of frappe/defaults.py
 * get_user_default / get_user_default_as_list, frappe/public/js/frappe/model/create_new.js get_default_value and
 * frappe/core/doctype/session_default_settings/session_default_settings.py).
 *
 * Scope: per simulated user (Switch User), stored in this browser only. In real Frappe the same values are
 * DefaultValue rows (parent=<user>, defkey=scrub(ref_doctype)) written by frappe.defaults.set_user_default and
 * cleared by the on_logout hook clear_session_defaults; the virtual store is NOT server-backed.
 *
 * Resolution order for a key (e.g. "company"):
 *   1. session default set by this user (Settings › Session Defaults)
 *   2. global default (Global Defaults keydict: company → default_company, currency → default_currency, …)
 *   For DocType-style keys ("Company") an explicit is_default User Permission overrides both (defaults.js
 *   get_user_permission_default); new-document Link fields follow create_new.js order in newDocLinkDefaults.
 * A value outside the user's User Permissions, or pointing to a record that no longer exists, is never returned.
 */
import { useSyncExternalStore } from "react";
import { adapter, type Doc } from "./adapter";
import { ADMIN, currentUser, subscribeSession } from "./session";
import { resolveName } from "./rename";

const PREFIX = "digit-virtual-core:session-defaults:v1:";
const isB = typeof window !== "undefined";
export const sessionDefaultsKey = (user: string) => `${PREFIX}${user}`;

/** frappe.scrub / frappe.unscrub */
export const scrub = (s: string) => s.replace(/ /g, "_").replace(/-/g, "_").toLowerCase();
export const unscrub = (s: string) => s.replace(/[_-]/g, " ").split(" ").map((w) => (w ? w[0]!.toUpperCase() + w.slice(1) : w)).join(" ");
/** frappe.defaults.is_a_user_permission_key: DocType-style keys ("Company") vs fieldname keys ("company"). */
export const isUserPermissionKey = (key: string) => !key.includes(":") && key !== scrub(key);

/** erpnext/setup/doctype/global_defaults/global_defaults.py keydict ("key in defaults" → Global Defaults field). */
export const GLOBAL_DEFAULT_KEYS: Record<string, string> = {
  company: "default_company", currency: "default_currency", country: "country", hide_currency_symbol: "hide_currency_symbol",
  account_url: "account_url", disable_rounded_total: "disable_rounded_total", disable_in_words: "disable_in_words",
};

/* ---------- per-user store ---------- */
const subs = new Set<() => void>();
let version = 0;
const notify = () => { version++; subs.forEach((f) => f()); };
if (isB) {
  subscribeSession(notify);
  window.addEventListener("storage", (e) => { if (e.key?.startsWith(PREFIX)) notify(); });
}
export function readSessionDefaults(user = currentUser()): Record<string, string> {
  if (!isB) return {};
  try {
    const raw = JSON.parse(localStorage.getItem(sessionDefaultsKey(user)) ?? "{}") as unknown;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) if (k && typeof v === "string" && v) out[k] = v;
    return out;
  } catch { return {}; }
}
function writeSessionDefaults(user: string, v: Record<string, string>) {
  if (!isB) return;
  if (Object.keys(v).length) localStorage.setItem(sessionDefaultsKey(user), JSON.stringify(v)); else localStorage.removeItem(sessionDefaultsKey(user));
  notify();
}
export function subscribeSessionDefaults(f: () => void) { subs.add(f); return () => { subs.delete(f); }; }
/** Re-renders when the user's session defaults change or another user is selected. */
export function useSessionDefaultsVersion(): number {
  return useSyncExternalStore(subscribeSessionDefaults, () => version, () => 0);
}

/* ---------- User Permission helpers (frappe.defaults.get_user_permissions / perm.filter_allowed_docs_for_doctype) ---------- */
type UP = { allow: string; for_value: string; is_default: boolean; applicable_for: string; all: boolean };
function userPerms(user: string): UP[] {
  if (user === ADMIN) return [];
  return adapter.list("User Permission").filter((p) => p["user"] === user && p["allow"]).map((p) => {
    const af = String(p["applicable_for"] ?? "");
    return { allow: String(p["allow"]), for_value: String(p["for_value"] ?? ""), is_default: Number(p["is_default"] ?? 0) === 1, applicable_for: af, all: Number(p["apply_to_all_doctypes"] ?? (af ? 0 : 1)) === 1 };
  });
}
/** Allowed records of `doctype` for this user, optionally only those applicable to `forDoctype` (undefined = unrestricted). */
export function allowedRecords(doctype: string, forDoctype?: string, user = currentUser()): Set<string> | undefined {
  const ps = userPerms(user).filter((p) => p.allow === doctype && (!forDoctype || p.all || !p.applicable_for || p.applicable_for === forDoctype));
  return ps.length ? new Set(ps.map((p) => p.for_value)) : undefined;
}
/** The is_default User Permission record (frappe.perm.filter_allowed_docs_for_doctype default_doc / get_user_permission_default). */
export function userPermissionDefault(doctype: string, forDoctype?: string, user = currentUser()): string | undefined {
  return userPerms(user).find((p) => p.allow === doctype && p.is_default && (!forDoctype || p.all || !p.applicable_for || p.applicable_for === forDoctype))?.for_value;
}
/** frappe.defaults.in_user_permission (negated): true only when the user has User Permissions on unscrub(key) and value is outside them. */
function notInUserPermission(key: string, value: string | undefined, user: string): boolean {
  if (!value) return false;
  const ps = userPerms(user).filter((p) => p.allow === unscrub(key));
  return ps.length > 0 && !ps.some((p) => p.for_value === value);
}

/** The key's Link DocType when it names one with records in the store ("company" → "Company"). */
function keyDocType(key: string): string | undefined {
  const dt = unscrub(key);
  return adapter.list(dt).length ? dt : undefined;
}
/** A stale default (deleted or renamed record) is followed through the rename log, or dropped when missing. */
function liveValue(key: string, value: string | undefined): string | undefined {
  if (!value) return undefined;
  const dt = keyDocType(key);
  if (!dt) return value;
  const cur = resolveName(dt, value);
  return adapter.get(dt, cur) ? cur : undefined;
}

export function globalDefault(key: string): string | undefined {
  const f = GLOBAL_DEFAULT_KEYS[scrub(key)];
  if (!f) return undefined;
  const gd = adapter.get("Global Defaults", "Global Defaults")?.[f];
  return gd === undefined || gd === null || gd === "" ? undefined : String(gd);
}

export type DefaultSource = "session" | "global" | "user-permission" | "fallback" | "none";
export interface ResolvedDefault { value: string | undefined; source: DefaultSource }

/**
 * frappe.defaults.get_user_default(key) (desk defaults.js) over the virtual store, with provenance: the user's default for
 * the scrubbed key, else the global default; for DocType keys ("Company") an is_default User Permission overrides it;
 * a value outside the user's User Permissions is never returned.
 */
export function resolveUserDefault(key: string, user = currentUser()): ResolvedDefault {
  const fk = scrub(key);
  const session = liveValue(fk, readSessionDefaults(user)[fk]);
  const global = session ? undefined : liveValue(fk, globalDefault(fk));
  let value = session ?? global; let source: DefaultSource = session ? "session" : global ? "global" : "none";
  if (isUserPermissionKey(key)) { const up = userPermissionDefault(key, undefined, user); if (up && adapter.get(key, up)) { value = up; source = "user-permission"; } }
  if (!value || notInUserPermission(key, value, user)) return { value: undefined, source: "none" };
  return { value, source };
}
export function getUserDefault(key: string, user = currentUser()): string | undefined { return resolveUserDefault(key, user).value; }
/** frappe.defaults.get_user_defaults(doctype): the user's default for scrub(doctype) when permitted (create_new.js step 2). */
function userDefaultsFor(doctype: string, user: string): string[] {
  const fk = scrub(doctype);
  const v = liveValue(fk, readSessionDefaults(user)[fk]) ?? liveValue(fk, globalDefault(fk));
  return v && !notInUserPermission(doctype, v, user) ? [v] : [];
}

/**
 * Default Company for report filters and other "user default company" reads. Resolver first; only when no session,
 * global or User Permission default exists does the virtual preview pick a permitted company (most ledger entries,
 * then first), so previews keep data without ever choosing a company the user may not read.
 */
export function resolveDefaultCompany(user = currentUser()): ResolvedDefault {
  const r = resolveUserDefault("Company", user);
  if (r.value) return r;
  const allowed = allowedRecords("Company", undefined, user);
  const companies = adapter.list("Company").map((c) => c.name).filter((c) => !allowed || allowed.has(c));
  if (!companies.length) return { value: undefined, source: "none" };
  const count = new Map<string, number>();
  for (const g of adapter.list("GL Entry")) { const c = String(g["company"] ?? ""); if (companies.includes(c)) count.set(c, (count.get(c) ?? 0) + 1); }
  const best = [...count].sort((a, b) => b[1] - a[1])[0]?.[0] ?? companies[0];
  return { value: best, source: "fallback" };
}
export function defaultCompany(user = currentUser()): string { return resolveDefaultCompany(user).value ?? ""; }

/* ---------- Session Default Settings (configured fields) ---------- */
export interface SessionDefaultField { fieldname: string; ref_doctype: string; label: string; source: string }
export const INSTALL_SESSION_DEFAULTS: SessionDefaultField[] = [{ fieldname: "company", ref_doctype: "Company", label: "Default Company", source: "erpnext/setup/install.py add_company_to_session_defaults" }];
/**
 * get_session_default_values: one Link field per Session Default Settings row (fieldname = scrub(ref_doctype)).
 * While the single's child table was never written (no record, or a generated placeholder without the table),
 * ERPNext's install hook add_company_to_session_defaults supplies Company. A configured table is used as-is (an
 * emptied table means "No session defaults configured"). `isDocType` (catalog index) drops rows naming no DocType.
 */
export function sessionDefaultFields(isDocType: (dt: string) => boolean = () => true): SessionDefaultField[] {
  const rec = adapter.get("Session Default Settings", "Session Default Settings");
  if (!rec || !Array.isArray(rec["session_defaults"])) return INSTALL_SESSION_DEFAULTS;
  const rows = rec["session_defaults"] as Doc[];
  const valid = [...new Set(rows.map((r) => String(r["ref_doctype"] ?? "")).filter((dt) => dt && isDocType(dt)))];
  return valid.map((dt) => ({ fieldname: scrub(dt), ref_doctype: dt, label: `Default ${dt}`, source: "Session Default Settings" }));
}

/**
 * set_session_default_values: validates each value against the user's readable records (`canRead`) before storing.
 * Empty values clear the session default so the global default applies again. Returns per-field errors.
 */
export function setSessionDefaults(values: Record<string, string>, canRead: (doctype: string, name: string) => boolean, fields: SessionDefaultField[], user = currentUser()): string[] {
  const errs: string[] = []; const next = { ...readSessionDefaults(user) };
  for (const [k, v] of Object.entries(values)) {
    const f = fields.find((x) => x.fieldname === k);
    if (!f) { errs.push(`${k}: not a configured session default`); continue; }
    if (!v) { delete next[k]; continue; }
    if (!adapter.get(f.ref_doctype, v)) { errs.push(`${f.ref_doctype} ${v} not found`); continue; }
    if (!canRead(f.ref_doctype, v) || notInUserPermission(f.ref_doctype, v, user)) { errs.push(`Not permitted: ${f.ref_doctype} ${v}`); continue; }
    next[k] = v;
  }
  if (!errs.length) writeSessionDefaults(user, next);
  return errs;
}
/** on_logout clear_session_defaults: removes this user's session defaults (global defaults apply again). */
export function clearSessionDefaults(user = currentUser()) { writeSessionDefaults(user, {}); }

/** One-time move of the legacy browser-wide Default Company (user-settings v1) into Administrator's session defaults. */
export function migrateLegacyDefaultCompany(value: unknown, legacyHardcoded: string) {
  if (!isB || typeof value !== "string" || !value || value === legacyHardcoded) return;
  if (readSessionDefaults(ADMIN)["company"] || !adapter.get("Company", value)) return;
  writeSessionDefaults(ADMIN, { ...readSessionDefaults(ADMIN), company: value });
}

/* ---------- new-document defaults (create_new.js get_default_value, Link branch) ---------- */
const literalDefault = (f: { default?: string | undefined }) => (f.default && !f.default.startsWith("eval") && !f.default.startsWith("__") && !f.default.startsWith(":") && f.default.toLowerCase() !== "now" && f.default !== "Today" ? f.default : undefined);
/**
 * Link-field defaults for a new document (create_new.js get_default_value): the is_default User Permission record →
 * the user's single default for the target DocType → the user default for the fieldname; an explicit docfield default
 * still wins when it is allowed (step 3). Only values that exist and pass User Permissions are returned; User links
 * and read-only fields are skipped, as in the source.
 */
export function newDocLinkDefaults(meta: { name: string; fields: { fieldname?: string | undefined; fieldtype: string; options?: string | undefined; read_only?: number | undefined; default?: string | undefined; [k: string]: unknown }[] }, user = currentUser()): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of meta.fields) {
    if (f.fieldtype !== "Link" || !f.fieldname || !f.options || f.options === "User" || Number(f.read_only ?? 0)) continue;
    const ignoreUP = Number(f["ignore_user_permissions"] ?? 0) === 1;
    const allowed = ignoreUP ? undefined : allowedRecords(f.options, meta.name, user);
    let value: string | undefined;
    const defDoc = allowed ? userPermissionDefault(f.options, meta.name, user) : undefined;
    if (allowed && defDoc) value = defDoc;
    else {
      const uds = ignoreUP ? [] : userDefaultsFor(f.options, user);
      let ud = uds.length === 1 ? uds[0] : undefined;
      if (!ud) ud = getUserDefault(f.fieldname, user);
      if (ud && (!allowed || allowed.has(ud))) value = ud;
    }
    const lit = literalDefault(f);
    if (lit && (!allowed || allowed.has(lit))) continue; // adapter.insert keeps the docfield default
    if (value && adapter.get(f.options, value)) out[f.fieldname] = value;
  }
  return out;
}

/* ---------- full new-document defaults (create_new.js set_default_values + get_default_value) ---------- */
type DefaultField = { fieldname?: string | undefined; fieldtype: string; options?: string | undefined; read_only?: number | undefined; default?: string | undefined; [k: string]: unknown };
/** frappe.model.no_value_type without the table types (tables are initialised to []). */
const NO_VALUE_TYPES = new Set(["Section Break", "Column Break", "Tab Break", "HTML", "Button", "Image", "Fold", "Heading"]);
const TABLE_FIELD_TYPES = new Set(["Table", "Table MultiSelect"]);
/** frappe.datetime.get_today / now_time / system_datetime (UTC in the virtual runtime, as everywhere else in the Core). */
export const todayDate = () => new Date().toISOString().slice(0, 10);
export const nowTime = () => new Date().toISOString().slice(11, 19);
export const systemDatetime = () => new Date().toISOString().slice(0, 19).replace("T", " ");
const fullName = (user: string) => {
  const u = adapter.get("User", user);
  return String(u?.["full_name"] ?? ([u?.["first_name"], u?.["last_name"]].filter(Boolean).join(" ") || user));
};

/** get_default_value step 3 for one docfield, given the Link value steps 1–2 produced. */
function docfieldDefault(f: DefaultField, meta: { name: string; title_field?: string | undefined }, value: unknown, parent: Doc | undefined, user: string): unknown {
  const d = f.default == null ? "" : String(f.default);
  if (value && !d) return value;
  const allowed = f.fieldtype === "Link" && f.options && Number(f["ignore_user_permissions"] ?? 0) !== 1 ? allowedRecords(f.options, meta.name, user) : undefined;
  if (d === "__user" || d.toLowerCase() === "user") return user;
  if (d === "user_fullname") return fullName(user);
  if (d === "Today") return todayDate();
  if (d.toLowerCase() === "now") return f.fieldtype === "Time" ? nowTime() : systemDatetime();
  if (d.startsWith(":")) {
    // get_default_from_boot_docs: ":Company" → the parent's (or the user's default) Company record's same-named field
    const dt = d.slice(1); const refField = scrub(dt);
    const ref = parent ? String(parent[refField] ?? "") : getUserDefault(refField, user) ?? "";
    const boot = ref && f.fieldname ? adapter.get(dt, ref)?.[f.fieldname] : undefined;
    return !allowed || (boot !== undefined && allowed.has(String(boot))) ? boot : value;
  }
  if (f.fieldname === meta.title_field) return "";
  if (d.startsWith("eval:")) return value; // not a docfield default form the client evaluates; never stored literally
  if (f.fieldtype !== "Link" || f.options === "User" || !allowed || allowed.has(d)) return d || undefined;
  return value;
}

/**
 * Every default of a new document or child row (frappe.model.get_new_doc → set_default_values): Link fields follow
 * newDocLinkDefaults (User Permission → user default → fieldname default), then the docfield default with its
 * dynamic forms (__user / user, user_fullname, Today, Now, :DocType boot docs, title field ignored); Int/Check and
 * Currency/Float are cast, a Select without a value takes its first option, and tables start empty. No value is
 * ever invented: a field with no default stays unset.
 */
export function newDocDefaults(meta: { name: string; title_field?: string | undefined; fields: DefaultField[] }, parent?: Doc, user = currentUser()): Record<string, unknown> {
  const links = newDocLinkDefaults(meta, user);
  const out: Record<string, unknown> = {};
  for (const f of meta.fields) {
    if (!f.fieldname || NO_VALUE_TYPES.has(f.fieldtype) || Number(f["no_default"] ?? 0)) continue;
    if (TABLE_FIELD_TYPES.has(f.fieldtype)) { out[f.fieldname] = []; continue; }
    let v = docfieldDefault(f, meta, links[f.fieldname], parent, user);
    if (v !== undefined && v !== null && v !== "") {
      if (f.fieldtype === "Int" || f.fieldtype === "Check") v = Number.parseInt(String(v), 10) || 0;
      else if (f.fieldtype === "Currency" || f.fieldtype === "Float" || f.fieldtype === "Percent") v = Number.parseFloat(String(v)) || 0;
      out[f.fieldname] = v;
    } else if (f.fieldtype === "Select" && typeof f.options === "string" && f.options && !["[Select]", "Loading..."].includes(f.options)) {
      out[f.fieldname] = f.options.split("\n")[0];
    }
  }
  return out;
}

/** Report filter defaults: source expressions that read a user default (report .js `frappe.defaults.get_user_default("Company")`). */
export function filterDefaultFromExpr(expr: string | undefined, user = currentUser()): string | undefined {
  if (!expr) return undefined;
  const m = /^frappe\.defaults\.(get_user_default|get_default)\(\s*["']([^"']+)["']\s*\)$/.exec(expr.trim());
  if (!m) return undefined;
  return /^company$/i.test(m[2]!) ? defaultCompany(user) || undefined : getUserDefault(m[2]!, user);
}

/** Persistence scopes of the shared user-experience foundation (Developer Explorer + handoff docs). */
export const PREFERENCE_SCOPES: { scope: string; storage: string; module: string; frappe: string }[] = [
  { scope: "User preferences", storage: "localStorage digit-virtual-core:user-settings:v2:<user>", module: "src/lib/userSettings.ts", frappe: "User DocType fields (desk_theme, dock_mode, list_sidebar, report_split_view …); layout = browser localStorage container_fullwidth" },
  { scope: "Session defaults", storage: "localStorage digit-virtual-core:session-defaults:v1:<user>", module: "src/lib/sessionDefaults.ts", frappe: "DefaultValue parent=<user> via frappe.defaults.set_user_default; cleared on logout (clear_session_defaults)" },
  { scope: "Presentation mode", storage: "localStorage digit-virtual-core:mode:<user>; developer mode per browser", module: "src/lib/mode.ts", frappe: "none — preview-only diagnostics" },
  { scope: "Application context", storage: "sessionStorage digit-virtual-core:active-app (per tab)", module: "src/plugins/appShell.ts", frappe: "installed app desk routes / workspace" },
  { scope: "Simulated session user", storage: "localStorage digit-virtual-core:session-user-v1", module: "src/lib/session.ts", frappe: "real login session (frappe.session.user)" },
];
