/**
 * Canonical document contract (P1.3) — an explicit typed extension over the EXISTING engines, not a second store or
 * engine: VirtualERPAdapter (records), naming.ts (set_new_name), session.ts/scope.ts (permissions), posting.ts
 * (submit/cancel/amend), workflow.ts and actionRegistry.ts (actions), capabilities.ts (relationships/reports),
 * settingsRegistry.ts (settings). Every lifecycle call is gated by the source-backed classification in
 * runtimeContract.ts so a server-only Submit can never report a false success.
 */
import { adapter, DocValidationError, namesOnFirstSave, synthName, tabId, type Doc } from "./adapter";

/** Orphaned unsaved drafts (tab closed without saving) are discarded after this age. */
export const DRAFT_TTL_MS = 24 * 60 * 60 * 1000;
import type { DocTypeMeta } from "./catalog";
import { autonameNeeds, makeAutoname } from "./naming";
import { currentUser, hasPerm, levelAccess, type PType } from "./session";
import { scopedGet, scopedList } from "./scope";
import { amend as postAmend, cancel as postCancel, submit as postSubmit } from "./posting";
import { cachedRuntimeContract, documentCapability, type DocumentCapability } from "./runtimeContract";
import { matchFilter } from "./desk";
import { activeWorkflow, defaultState } from "./workflow";
import type { CapabilityRegistry } from "./sourceTypes";
import { relationsOf } from "./capabilities";
import { newDocDefaults } from "./sessionDefaults";
import { cachedMeta } from "./catalog";

/** Capability → implementation map (exported for the Developer Explorer and handoff docs). */
export const DOCUMENT_API_MAP: Record<string, { implementation: string; notes: string }> = {
  getMeta: { implementation: "catalog.ts loadMeta / metaQuery (frozen catalog or plugin-owned meta)", notes: "Original technical identifiers preserved" },
  getEffectiveMeta: { implementation: "metaResolver.ts resolveEffectiveMeta → plugins/runtime.ts overlayMeta", notes: "Original → optional source → app-owned → Custom Field → Property Setter → app extension → user presentation" },
  getList: { implementation: "documentApi.getList → scope.ts scopedList + desk.ts matchFilter", notes: "Unsaved local drafts are excluded, as in frappe.get_list" },
  getDocument: { implementation: "documentApi.getDocument → scope.ts scopedGet", notes: "has_permission incl. User Permission/company" },
  getLinkedDocuments: { implementation: "documentApi.linkedDocuments → capabilities.ts relationsOf(incoming) over adapter rows", notes: "Child rows resolve to their parent (parenttype/parentfield)" },
  createDraft: { implementation: "documentApi.createDraft → adapter.insert (frappe.model.get_new_doc) + sessionDefaults.newDocDefaults + create_mandatory_children", notes: "Local name new-<doctype>-<n>; no series number consumed; defaults from User Permission / session / global defaults and docfield defaults (Today, Now, __user, :DocType); one blank row per mandatory table" },
  newChildRow: { implementation: "documentApi.newChildRow (frappe.model.add_child → get_new_doc(child, parent_doc, parentfield))", notes: "Blank row with the child DocType's defaults; never invented values" },
  getUserDefault: { implementation: "sessionDefaults.getUserDefault / resolveUserDefault / defaultCompany (frappe.defaults.get_user_default)", notes: "Per simulated user, browser-only; real DIGIT stores DefaultValue rows server-side" },
  setSessionDefaults: { implementation: "sessionDefaults.setSessionDefaults / sessionDefaultFields (session_default_settings.py)", notes: "Validated against readable records and User Permissions; cleared on Logout" },
  getUserPreferences: { implementation: "userSettings.getSettings / useSettings / setSettings / toggleFullWidth", notes: "Per simulated user; FRAPPE_PREFERENCE_MAP lists the real DIGIT User fields" },
  previewLinkedDocument: { implementation: "components/report/DocPreview.tsx ReportPreviewScope + ReportDocLink + DocPreviewPanel, lib/reportLinks.ts reportCellTarget (frappe link_side_panel.js)", notes: "Read-only side panel / mobile sheet; honours report_split_view" },
  save: { implementation: "documentApi.saveDocument → naming.ts makeAutoname + adapter.update (doc hooks)", notes: "set_new_name on first save; child rows re-parented" },
  update: { implementation: "documentApi.updateDocument → session.ts write/permlevel + adapter.update", notes: "Submitted docs only accept allow_on_submit fields" },
  deleteDraft: { implementation: "documentApi.deleteDraft → adapter.remove", notes: "Draft (0) or cancelled (2) only, delete permission" },
  submit: { implementation: "documentApi.submitDocument → posting.ts submit", notes: "Refused when runtimeContract classifies submit SERVER_ONLY" },
  cancel: { implementation: "documentApi.cancelDocument → posting.ts cancel (reversals)", notes: "Refused when SERVER_ONLY" },
  amend: { implementation: "documentApi.amendDocument → posting.ts amend", notes: "Cancelled docs only; <name>-n naming" },
  invokeAction: { implementation: "actionRegistry.ts dispatchAction → localActions / workflow / posting / app actions", notes: "Server-declared actions return SERVER_REQUIRED" },
  getPermissions: { implementation: "documentApi.getPermissions → session.ts hasPerm/levelAccess", notes: "Simulation of DIGIT DocPerm; the real server enforces ACL" },
  getRelationships: { implementation: "capabilities.ts relationsOf / childTablesOf", notes: "Explicit schema edges only; Dynamic Links need a discriminator value" },
  getReports: { implementation: "reportRegistry.ts reportsForDocType / reportContract", notes: "LOCAL_VIRTUAL_REPORT vs SERVER_*_REQUIRED classes" },
  getSettings: { implementation: "settingsRegistry.ts settingsForDocType / resolveSettingsDomains", notes: "Local configuration vs FRAPPE_SERVER_REQUIRED effects" },
};

export type NamingPolicy = { policy: "ON_FIRST_SAVE" | "IMMEDIATE_PREVIEW" | "SINGLE"; autoname: string | null; reason: string };
export function namingPolicy(meta: Pick<DocTypeMeta, "autoname" | "fields" | "issingle">): NamingPolicy {
  const autoname = String(meta.autoname ?? "").trim() || (meta.fields.some((f) => f.fieldname === "naming_series") ? "naming_series:" : "");
  if (meta.issingle) return { policy: "SINGLE", autoname: autoname || null, reason: "Single DocType: the record name is the DocType name." };
  if (namesOnFirstSave(meta)) return { policy: "ON_FIRST_SAVE", autoname, reason: "Declared autoname is applied by set_new_name when the draft is first saved." };
  return { policy: "IMMEDIATE_PREVIEW", autoname: null, reason: "No declared autoname: the source names records in a Python autoname() or by hash; the virtual Core keeps a preview name (server-dependent naming)." };
}

export type Filter = [string, string, unknown];
export function getList(dt: string, filters: Filter[] = []): Doc[] { return scopedList(dt).filter((d) => !d["__islocal"] && filters.every((f) => matchFilter(d, f as never))); }
export function getDocument(dt: string, name: string): Doc | undefined { return scopedGet(dt, name); }

export function getPermissions(meta: DocTypeMeta, doc?: Doc, user = currentUser()) {
  const p = (t: PType) => hasPerm(meta, t, doc, user);
  const lv = levelAccess(meta, user);
  return { read: p("read"), write: p("write"), create: p("create"), delete: p("delete"), submit: p("submit"), cancel: p("cancel"), amend: p("amend"),
    report: p("report"), export: p("export"), print: p("print"), levels: { read: [...lv.read].sort(), write: [...lv.write].sort() } };
}

/**
 * frappe form.js set_link_field (used by frm.make_new from the form dashboard "+"): the new document links back to the
 * form it was made from — every Link to that DocType gets its name — and copies the form's same-named Link / Dynamic
 * Link values (company, customer, project …). Only fields the new DocType declares are set.
 */
export function linkFieldValues(meta: DocTypeMeta, fromDoctype: string, from: Doc): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of meta.fields) {
    if (!f.fieldname) continue;
    if (f.fieldtype === "Link" && f.options === fromDoctype) out[f.fieldname] = from.name;
    else if ((f.fieldtype === "Link" || f.fieldtype === "Dynamic Link") && from[f.fieldname] !== undefined && from[f.fieldname] !== null && from[f.fieldname] !== "") out[f.fieldname] = from[f.fieldname];
  }
  return out;
}

/**
 * frappe.new_doc / frappe.model.open_mapped_doc: an unsaved local draft. `mapped` carries the values a mapper produced
 * (engines.mapDoc over get_mapped_doc conventions): like frappe get_mapped_doc they are applied over the target's
 * defaults, and every mapped child row starts from add_child defaults. Nothing is persisted as a record — the first
 * Save inserts it (validation, naming and controller hooks run there), so an abandoned mapping leaves no document.
 */
export function createDraft(meta: DocTypeMeta, opts: { from?: { doctype: string; doc: Doc }; mapped?: Record<string, unknown> } = {}): { doc?: Doc; errors: string[] } {
  // the source-backed create rule applies once the runtime contract is loaded (plugin DocTypes need no evidence)
  const cap = documentCapability(meta);
  if ((cachedRuntimeContract() || String(meta.source ?? "").startsWith("plugin:")) && !cap.create) return { errors: [`${meta.name}: ${cap.reasons[0] ?? "creation is not supported"}`] };
  if (!hasPerm(meta, "create")) return { errors: [`No permission to create ${meta.name}`] };
  // abandoned unsaved drafts of this DocType opened in THIS tab are discarded (frappe keeps the open new-doc in the
  // page's locals); drafts open in another tab survive, and orphans older than a day are cleaned up.
  const tab = tabId(), stale = Date.now() - DRAFT_TTL_MS;
  for (const d of adapter.list(meta.name, { includeLocal: true }))
    if (d["__islocal"] && (!d["__tab"] || d["__tab"] === tab || Date.parse(String(d["creation"] ?? "")) < stale)) adapter.remove(meta.name, d.name);
  // frappe.new_doc → get_new_doc(with_mandatory_children): every default (set_default_values) + one blank row per
  // mandatory table whose child meta is loaded (ChildGrid adds the row once the child meta arrives otherwise)
  const tables = new Set(meta.fields.filter((f) => (f.fieldtype === "Table" || f.fieldtype === "Table MultiSelect") && f.fieldname).map((f) => f.fieldname!));
  const mappedParent = Object.fromEntries(Object.entries(opts.mapped ?? {}).filter(([k]) => !tables.has(k)));
  const init = meta.issingle ? {} : { ...newDocDefaults(meta), ...(opts.from ? linkFieldValues(meta, opts.from.doctype, opts.from.doc) : {}), ...mappedParent };
  const doc = adapter.insert(meta, init);
  if (!meta.issingle) {
    const rows: Record<string, unknown> = {};
    for (const f of meta.fields) {
      if (!f.fieldname || !f.options || !tables.has(f.fieldname)) continue;
      const cm = cachedMeta(f.options);
      const mappedRows = opts.mapped?.[f.fieldname];
      if (Array.isArray(mappedRows) && mappedRows.length) {
        // get_mapped_doc: target_doc.append(table) (child defaults) then the mapped values; idx follows the target order
        rows[f.fieldname] = (mappedRows as Record<string, unknown>[]).map((r, i) => ({
          ...(cm ? newChildRow(cm, doc, f.fieldname!, i + 1) : { name: childHash(), doctype: f.options, docstatus: 0, parent: doc.name, parentfield: f.fieldname, parenttype: meta.name }),
          ...r, idx: i + 1,
        }));
        continue;
      }
      if (f.fieldtype !== "Table" || !Number(f.reqd ?? 0)) continue;
      if (cm) rows[f.fieldname] = [newChildRow(cm, doc, f.fieldname, 1)];
      else delete doc[f.fieldname];
    }
    adapter.insertDocQuiet(meta.name, { ...doc, ...rows }); adapter.flush();
  }
  return { doc: adapter.get(meta.name, doc.name) ?? doc, errors: [] };
}

/** frappe.generate_hash(length=10) — child row names are random hashes in Frappe. */
const childHash = () => Array.from({ length: 10 }, () => "0123456789abcdefghijklmnopqrstuvwxyz"[Math.floor(Math.random() * 36)]).join("");

/**
 * frappe.model.add_child: a blank child row of `childMeta` for `parent.parentfield` with the child DocType's defaults
 * (":Company" style defaults read the parent), idx and parent links. Grid "Add row", "Add multiple", Upload and
 * mandatory tables all start from this row; nothing is invented.
 */
export function newChildRow(childMeta: Pick<DocTypeMeta, "name" | "fields" | "title_field">, parent: Doc, parentfield: string, idx: number, user = currentUser()): Doc {
  return { ...newDocDefaults(childMeta, parent, user), name: childHash(), doctype: childMeta.name, docstatus: 0, owner: user, parent: parent.name, parentfield, parenttype: String(parent.doctype ?? ""), idx };
}

/** set_new_name for a local draft. `prompt` answers autoname "Prompt". */
export function resolveFirstSaveName(meta: DocTypeMeta, current: string, vals: Record<string, unknown>, prompt?: (q: string) => string | null): { name?: string; errors: string[]; cancelled?: boolean } {
  const need = autonameNeeds(meta);
  const v: Record<string, unknown> = { ...vals };
  if (need.includes("__newname")) { const p = prompt?.("New name"); if (!p?.trim()) return { errors: [], cancelled: true }; v["__newname"] = p.trim(); }
  const nn = makeAutoname(meta, v);
  if (!nn) {
    const missing = need.filter((k) => k !== "__newname").map((k) => meta.fields.find((f) => f.fieldname === k)?.label ?? k);
    if (missing.length) return { errors: [`${missing.join(", ")}: value missing to name this document`] };
    // declared autoname the port cannot resolve (e.g. naming_series without options): unique preview name, labelled server-dependent
    let i = adapter.list(meta.name).length + 1; while (adapter.get(meta.name, synthName(meta.name, i))) i++;
    return { name: synthName(meta.name, i), errors: [] };
  }
  if (nn !== current && adapter.get(meta.name, nn)) return { errors: [`${meta.name} ${nn} already exists`] };
  return { name: nn, errors: [] };
}

/** Save a draft (insert-on-first-save for local docs). Returns the final name; callers navigate when it changed. */
export function saveDocument(meta: DocTypeMeta, name: string, values: Record<string, unknown>, opts: { prompt?: (q: string) => string | null; user?: string; extra?: Record<string, unknown> } = {}): { name: string; errors: string[]; cancelled?: boolean } {
  const stored = adapter.get(meta.name, name);
  if (!stored) return { name, errors: [`${meta.name} ${name} not found`] };
  const user = opts.user ?? currentUser();
  const local = !!stored["__islocal"];
  if (!hasPerm(meta, local ? "create" : "write", stored, user)) return { name, errors: [`No permission to ${local ? "create" : "write"} ${meta.name}`] };
  if (local) {
    // first save = frappe insert: set_new_name, insert hooks with no previous doc, one "created" Version for the final name
    const r = resolveFirstSaveName(meta, name, values, opts.prompt);
    if (r.cancelled) return { name, errors: [], cancelled: true };
    if (r.errors.length) return { name, errors: r.errors };
    const finalName = r.name!;
    if (finalName !== name && adapter.get(meta.name, finalName)) return { name, errors: [`${meta.name} ${finalName} already exists`] };
    const merged: Record<string, unknown> = { ...stored, ...values, ...(opts.extra ?? {}), name: finalName, owner: stored["owner"] ?? user, modified: new Date().toISOString(), modified_by: user };
    delete merged["__islocal"]; delete merged["__tab"];
    for (const [k, v] of Object.entries(merged)) if (Array.isArray(v)) merged[k] = (v as Record<string, unknown>[]).map((row) => (row && typeof row === "object" ? { ...row, parent: finalName, parenttype: meta.name, parentfield: k } : row));
    adapter.remove(meta.name, name);
    try { adapter.insertDoc(meta.name, merged); }
    catch (e) { adapter.insertDocQuiet(meta.name, stored); adapter.flush(); if (e instanceof DocValidationError) return { name, errors: e.errors }; throw e; }
    return { name: finalName, errors: [] };
  }
  try {
    adapter.update(meta.name, name, { ...values, ...(opts.extra ?? {}), modified: new Date().toISOString(), modified_by: user });
  } catch (e) { if (e instanceof DocValidationError) return { name, errors: e.errors }; throw e; }
  return { name, errors: [] };
}

export function updateDocument(meta: DocTypeMeta, name: string, patch: Record<string, unknown>, user = currentUser()): string[] {
  const d = adapter.get(meta.name, name); if (!d) return [`${meta.name} ${name} not found`];
  if (!hasPerm(meta, "write", d, user)) return [`No permission to write ${meta.name}`];
  const lv = levelAccess(meta, user);
  const ds = Number(d.docstatus ?? 0);
  for (const k of Object.keys(patch)) {
    const f = meta.fields.find((x) => x.fieldname === k); if (!f) continue;
    if (!lv.write.has(Number(f["permlevel"] ?? 0))) return [`No permission to write ${meta.name}.${k} (permlevel ${f["permlevel"]})`];
    if (ds === 1 && !f["allow_on_submit"]) return [`Not allowed to change ${f.label ?? k} after submission`];
    if (ds === 2) return [`Cannot edit cancelled document ${name}`];
  }
  try { adapter.update(meta.name, name, { ...patch, modified_by: user }); } catch (e) { if (e instanceof DocValidationError) return e.errors; throw e; }
  return [];
}

export function deleteDraft(meta: DocTypeMeta, name: string, user = currentUser()): string[] {
  const d = adapter.get(meta.name, name); if (!d) return [`${meta.name} ${name} not found`];
  if (Number(d.docstatus ?? 0) === 1) return ["Cannot delete a submitted document; cancel it first"];
  if (!d["__islocal"] && !hasPerm(meta, "delete", d, user)) return [`No permission to delete ${meta.name}`];
  adapter.remove(meta.name, name); return [];
}

function gate(meta: DocTypeMeta, op: "submit" | "cancel" | "amend", cap: DocumentCapability = documentCapability(meta)): string | null {
  const s = cap[op];
  if (s === "NOT_APPLICABLE") return `${meta.name} is not submittable`;
  if (s === "SERVER_ONLY") return `${meta.name}: ${op} requires the DIGIT server — ${cap.reasons[0] ?? ""}`.trim();
  return null;
}
export function submitDocument(meta: DocTypeMeta, name: string, user = currentUser()): string[] {
  const d = adapter.get(meta.name, name); if (!d) return [`${meta.name} ${name} not found`];
  if (d["__islocal"]) return ["Save the document before submitting"];
  const g = gate(meta, "submit"); if (g) return [g];
  if (!hasPerm(meta, "submit", d, user)) return [`No permission to submit ${meta.name}`];
  return postSubmit(meta.name, name);
}
export function cancelDocument(meta: DocTypeMeta, name: string, user = currentUser()): string[] {
  const g = gate(meta, "cancel"); if (g) return [g];
  const d = adapter.get(meta.name, name); if (!d) return [`${meta.name} ${name} not found`];
  if (!hasPerm(meta, "cancel", d, user)) return [`No permission to cancel ${meta.name}`];
  return postCancel(meta.name, name);
}
export function amendDocument(meta: DocTypeMeta, name: string, user = currentUser()): { name?: string; errors: string[] } {
  const g = gate(meta, "amend"); if (g) return { errors: [g] };
  const d = adapter.get(meta.name, name); if (!d) return { errors: [`${meta.name} ${name} not found`] };
  if (!hasPerm(meta, "amend", d, user) || !hasPerm(meta, "create", undefined, user)) return { errors: [`No permission to amend ${meta.name}`] };
  const nn = postAmend(meta.name, name); if (!nn) return { errors: ["Only cancelled documents can be amended"] };
  // workflow.js set_default_state: a new (amended) document starts again at the workflow's draft state, so a changed
  // document re-enters approval instead of carrying the cancelled original's "Approved" state
  const w = activeWorkflow(meta.name);
  if (w) adapter.update(meta.name, nn, { [w.workflow_state_field]: defaultState(w, 0) });
  return { name: nn, errors: [] };
}

/** Documents that reference `dt/name` through explicit schema Links (child rows resolve to their parent). */
export function linkedDocuments(registry: CapabilityRegistry, dt: string, name: string): { doctype: string; field: string; via?: string; names: string[] }[] {
  const out: { doctype: string; field: string; via?: string; names: string[] }[] = [];
  for (const r of relationsOf(registry, dt, "incoming")) {
    if (r.kind !== "LINK") continue;
    const from = registry.doctypes[r.from];
    if (from?.schema.istable) {
      for (const parent of registry.relationships.filter((p) => p.kind === "CHILD_TABLE" && p.to === r.from)) {
        const names = adapter.list(parent.from).filter((d) => !d["__islocal"] && Array.isArray(d[parent.field]) && (d[parent.field] as Record<string, unknown>[]).some((row) => row?.[r.field] === name)).map((d) => d.name);
        if (names.length) out.push({ doctype: parent.from, field: r.field, via: `${parent.field} (${r.from})`, names });
      }
    } else {
      const names = adapter.list(r.from).filter((d) => !d["__islocal"] && d[r.field] === name).map((d) => d.name);
      if (names.length) out.push({ doctype: r.from, field: r.field, names });
    }
  }
  return out;
}
