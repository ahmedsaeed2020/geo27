/**
 * Action registry + generic dispatcher (P2.1). Compiles, per DocType, every action the Core knows about from the
 * EXISTING sources — docstatus lifecycle (runtimeContract classification), extracted source buttons (form_actions),
 * local ports (localActions.ts), workflow transitions (workflow.ts), plugin Client Script buttons and app actions —
 * into one contract. Dispatch goes only through the existing authorized services; a server-declared or unported
 * action returns SERVER_REQUIRED and never a false success. No per-module action engines.
 */
import { adapter, DocValidationError, type Doc } from "./adapter";
import type { DocTypeMeta } from "./catalog";
import type { FormAction } from "./engines";
import { actionVisible } from "./engines";
import { LOCAL_ACTIONS, LOCAL_WHEN, localWhen } from "./localActions";
import { activeWorkflow, applyWorkflow, transitionsFor } from "./workflow";
import { documentCapability, type DocumentCapability } from "./runtimeContract";
import { amendDocument, cancelDocument, submitDocument } from "./documentApi";
import { hasPerm, type PType } from "./session";
import { appActions, formButtons, logEvent, value } from "@/plugins/runtime";
import type { PluginAction } from "@/plugins/types";
import { assertScoped } from "./scope";

export type ActionKind = "LIFECYCLE" | "SOURCE_BUTTON" | "LOCAL_PORT" | "WORKFLOW" | "APP_ACTION" | "CLIENT_SCRIPT";
export type ActionExecution = "VIRTUAL_IMPLEMENTED" | "VIRTUAL_PARTIAL" | "FRAPPE_SERVER_REQUIRED" | "SOURCE_UNVERIFIED";
export interface ActionContract {
  id: string; doctype: string; label: string; kind: ActionKind; group: string | null; entry_route: string;
  required_state: string; required_permission: PType; required_fields: string[]; source_handler: string | null;
  inputs: string[]; outputs: string[]; virtual_implementation: string | null; execution: ActionExecution;
  reversal: string | null; eligible?: boolean | undefined; reason?: string | undefined;
}
const route = (meta: DocTypeMeta) => `/app/${meta.app}/${meta.name.toLowerCase().replace(/[^a-z0-9]+/g, "_")}/<name>`;
/** Docstatus a workflow transition moves to, and whether that move is executable in the Virtual Core. */
export function workflowTransitionGate(wf: { states: { state: string; doc_status?: string | number }[] }, t: { next_state: string }, fromDs: number, cap: DocumentCapability): { to: number; virtual: boolean } {
  const to = Number(wf.states.find((s) => s.state === t.next_state)?.doc_status ?? fromDs);
  return { to, virtual: to === fromDs || (to === 1 && cap.submit === "VIRTUAL") || (to === 2 && cap.cancel === "VIRTUAL") };
}

export function actionContracts(meta: DocTypeMeta, sources: { formActions?: FormAction[]; capability?: DocumentCapability }, doc?: Doc): ActionContract[] {
  const cap = sources.capability ?? documentCapability(meta);
  const out: ActionContract[] = [];
  const ds = Number(doc?.docstatus ?? 0);
  if (meta.is_submittable) {
    const life: [string, "submit" | "cancel" | "amend", string, string | null, boolean][] = [
      ["Submit", "submit", "docstatus = 0 (saved)", "Cancel", ds === 0 && !doc?.["__islocal"]],
      ["Cancel", "cancel", "docstatus = 1", "Amend", ds === 1],
      ["Amend", "amend", "docstatus = 2", null, ds === 2]];
    for (const [label, op, state, rev, ok] of life) {
      const s = cap[op];
      out.push({ id: `lifecycle:${op}`, doctype: meta.name, label, kind: "LIFECYCLE", group: null, entry_route: route(meta), required_state: state, required_permission: op,
        required_fields: op === "submit" ? meta.fields.filter((f) => f.reqd && f.fieldname).map((f) => f.fieldname!) : [], source_handler: `${meta.source.replace(/\.json$/, ".py")}${op === "submit" ? " on_submit" : op === "cancel" ? " on_cancel" : ""}`,
        inputs: [meta.name], outputs: op === "amend" ? [meta.name] : ["GL Entry / Stock Ledger Entry / status via posting.ts when ported"], virtual_implementation: s === "VIRTUAL" ? `src/lib/posting.ts ${op}` : null,
        execution: s === "VIRTUAL" ? (op === "amend" ? "VIRTUAL_IMPLEMENTED" : "VIRTUAL_PARTIAL") : "FRAPPE_SERVER_REQUIRED", reversal: rev,
        ...(doc ? { eligible: ok && s === "VIRTUAL" && hasPerm(meta, op, doc), reason: s !== "VIRTUAL" ? cap.reasons[0] : undefined } : {}) });
    }
  }
  for (const a of sources.formActions ?? []) {
    const key = `${meta.name}::${a.label}`; const local = !!LOCAL_ACTIONS[key];
    const execution: ActionExecution = local ? "VIRTUAL_IMPLEMENTED" : a.target ? "VIRTUAL_PARTIAL" : a.method ? "FRAPPE_SERVER_REQUIRED" : "SOURCE_UNVERIFIED";
    out.push({ id: `source:${a.group ?? ""}:${a.label}`, doctype: meta.name, label: a.label, kind: local ? "LOCAL_PORT" : "SOURCE_BUTTON", group: a.group, entry_route: route(meta),
      required_state: LOCAL_WHEN[key] ? "src/lib/localActions.ts LOCAL_WHEN" : a.conditions.length ? JSON.stringify(a.conditions) : "always", required_permission: a.target ? "create" : "write",
      required_fields: [], source_handler: a.source, inputs: [meta.name], outputs: a.target ? [a.target] : [], virtual_implementation: local ? `src/lib/localActions.ts ${key}` : a.target ? "engines.ts mapDoc (get_mapped_doc preview)" : null,
      execution, reversal: a.target ? `cancel/delete ${a.target}` : null, ...(doc ? { eligible: local ? localWhen(meta.name, a.label, doc, (d) => actionVisible(a, d)) : actionVisible(a, doc) } : {}) });
  }
  const wf = activeWorkflow(meta.name);
  if (wf) for (const t of wf.transitions) { const g = workflowTransitionGate(wf, t, ds, cap); out.push({ id: `workflow:${t.state}:${t.action}`, doctype: meta.name, label: t.action, kind: "WORKFLOW", group: wf.name, entry_route: route(meta),
    required_state: `${wf.workflow_state_field} = ${t.state}`, required_permission: "write", required_fields: [], source_handler: `Workflow ${wf.name}`, inputs: [meta.name], outputs: [`${wf.workflow_state_field} = ${t.next_state}`],
    virtual_implementation: g.virtual ? "src/lib/workflow.ts applyWorkflow" : null, execution: g.virtual ? "VIRTUAL_IMPLEMENTED" : "FRAPPE_SERVER_REQUIRED", reversal: null,
    ...(doc ? { eligible: g.virtual && transitionsFor(wf, doc).some((x) => x.action === t.action && x.state === t.state), ...(g.virtual ? {} : { reason: `Moves the document to docstatus ${g.to}: ${cap.reasons[0] ?? "requires the DIGIT server"}` }) } : {}) }); }
  for (const a of appActions(meta.name)) out.push(appContract(meta, a, doc));
  if (doc) for (const b of formButtons(meta.name, doc)) out.push({ id: `client:${b.script}:${b.label}`, doctype: meta.name, label: b.label, kind: "CLIENT_SCRIPT", group: b.group ?? null, entry_route: route(meta),
    required_state: b.condition ?? "always", required_permission: "write", required_fields: [], source_handler: `Client Script ${b.script}`, inputs: [meta.name], outputs: [], virtual_implementation: "plugins/runtime.ts formButtons (declarative)",
    execution: b.action.type === "call" ? "VIRTUAL_PARTIAL" : "VIRTUAL_IMPLEMENTED", reversal: null, eligible: true });
  return out;
}
function appContract(meta: DocTypeMeta, a: PluginAction & { plugin: string }, doc?: Doc): ActionContract {
  const server = a.kind === "server";
  const ok = !doc || ((a.required_docstatus === undefined || Number(doc.docstatus ?? 0) === a.required_docstatus) && (!a.condition || !!value(a.condition, doc)) && hasPerm(meta, a.permission ?? "write", doc));
  return { id: `app:${a.plugin}:${a.name}`, doctype: meta.name, label: a.label, kind: "APP_ACTION", group: a.plugin, entry_route: route(meta),
    required_state: [a.required_docstatus !== undefined ? `docstatus = ${a.required_docstatus}` : "", a.condition ?? ""].filter(Boolean).join(" && ") || "always",
    required_permission: a.permission ?? "write", required_fields: [], source_handler: server ? `${a.plugin}.api.${a.server_method ?? a.name}` : `${a.plugin} manifest action ${a.name}`,
    inputs: [meta.name], outputs: a.effect?.type === "create" ? [a.effect.doctype] : [], virtual_implementation: server ? null : "actionRegistry.ts dispatchAction (declarative effect)",
    execution: server ? "FRAPPE_SERVER_REQUIRED" : "VIRTUAL_IMPLEMENTED", reversal: a.reversal ?? null, ...(doc ? { eligible: ok && !server, reason: server ? "Declared server method: requires the DIGIT server" : undefined } : {}) };
}

export type ActionResult = { status: "DONE" | "SERVER_REQUIRED" | "DENIED" | "INELIGIBLE" | "ERROR" | "UNSUPPORTED"; message: string; errors?: string[]; open?: [string, string]; patch?: Record<string, unknown> };
/** Generic dispatcher through the existing services. Mapped-create source buttons stay with FormActions (needs target metas). */
export function dispatchAction(meta: DocTypeMeta, name: string, actionId: string, ask: (q: string) => string | null = () => null): ActionResult {
  const doc = adapter.get(meta.name, name); if (!doc) return { status: "ERROR", message: `${meta.name} ${name} not found` };
  const c = actionContracts(meta, { formActions: [] }, doc).find((x) => x.id === actionId) ?? (actionId.startsWith("source:") ? sourceLocal(meta, doc, actionId) : undefined);
  if (!c) return { status: "UNSUPPORTED", message: `Unknown action ${actionId}` };
  if (c.execution === "FRAPPE_SERVER_REQUIRED") return { status: "SERVER_REQUIRED", message: c.reason ?? `${c.label}: requires the DIGIT server (${c.source_handler ?? "server method"})` };
  if (c.eligible === false) return { status: "INELIGIBLE", message: `${c.label} is not available in the current state (${c.required_state})` };
  logEvent({ kind: "doc", doctype: meta.name, name, event: `action → ${c.label}`, detail: c.id });
  try {
    if (c.kind === "LIFECYCLE") {
      if (c.id === "lifecycle:submit") { const e = submitDocument(meta, name); return e.length ? { status: "ERROR", message: e.join("\n"), errors: e } : { status: "DONE", message: "Submitted" }; }
      if (c.id === "lifecycle:cancel") { const e = cancelDocument(meta, name); return e.length ? { status: "ERROR", message: e.join("\n"), errors: e } : { status: "DONE", message: "Cancelled" }; }
      const r = amendDocument(meta, name); return r.errors.length ? { status: "ERROR", message: r.errors.join("\n"), errors: r.errors } : { status: "DONE", message: `Amended → ${r.name}`, open: [meta.name, r.name!] };
    }
    if (c.kind === "WORKFLOW") { const e = applyWorkflow(meta.name, name, c.label); return e.length ? { status: "ERROR", message: e.join("\n"), errors: e } : { status: "DONE", message: c.label }; }
    if (c.kind === "LOCAL_PORT") { const r = LOCAL_ACTIONS[`${meta.name}::${c.label}`]!(doc, ask); if (r.patch) adapter.update(meta.name, name, r.patch); return { status: "DONE", message: r.message, ...(r.open ? { open: r.open } : {}) }; }
    if (c.kind === "APP_ACTION") {
      const a = appActions(meta.name).find((x) => `app:${x.plugin}:${x.name}` === c.id)!;
      const eff = a.effect; if (!eff) return { status: "UNSUPPORTED", message: `${a.label}: no declarative effect` };
      if (eff.type === "set_value") { const patch: Record<string, unknown> = {}; for (const [k, e] of Object.entries(eff.values)) patch[k] = value(e, doc); assertScoped(meta.name, "write", { ...doc, ...patch }); adapter.update(meta.name, name, patch); return { status: "DONE", message: a.label, patch }; }
      if (eff.type === "create") { const data: Record<string, unknown> = {}; for (const [k, e] of Object.entries(eff.map)) data[k] = value(e, doc); assertScoped(eff.doctype, "create", { ...data, name: "", doctype: eff.doctype } as Doc); const d = adapter.insertDoc(eff.doctype, data); return { status: "DONE", message: `${eff.doctype} ${d.name}`, open: [eff.doctype, d.name] }; }
      if (eff.type === "message") return { status: "DONE", message: eff.text };
      return { status: "UNSUPPORTED", message: `${a.label}: effect ${eff.type} is handled by the form` };
    }
    return { status: "UNSUPPORTED", message: `${c.label}: handled by its own control` };
  } catch (e) {
    if (e instanceof DocValidationError) return { status: "ERROR", message: e.errors.join("\n"), errors: e.errors };
    const m = (e as Error).message; return { status: /permission/i.test(m) ? "DENIED" : "ERROR", message: m };
  }
}
function sourceLocal(meta: DocTypeMeta, doc: Doc, id: string): ActionContract | undefined {
  const label = id.split(":").slice(2).join(":"); const key = `${meta.name}::${label}`;
  if (!LOCAL_ACTIONS[key]) return undefined;
  return { id, doctype: meta.name, label, kind: "LOCAL_PORT", group: null, entry_route: route(meta), required_state: "LOCAL_WHEN", required_permission: "write", required_fields: [], source_handler: null,
    inputs: [meta.name], outputs: [], virtual_implementation: `src/lib/localActions.ts ${key}`, execution: "VIRTUAL_IMPLEMENTED", reversal: null, eligible: localWhen(meta.name, label, doc) };
}
