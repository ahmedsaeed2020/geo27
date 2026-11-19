/**
 * Runtime contract — compact generated evidence (public/source-intelligence/runtime-contract.json, written by
 * scripts/build-source-intelligence.py) that tells every screen and the SDK what each DocType can really do in the
 * Virtual Core. Classification is pure and source-backed: archive DocType flags (in_create / read_only / is_virtual),
 * controller lifecycle method names (never bodies) and the virtual service modules that carry DocType-specific rules.
 * It never claims Frappe parity: a virtual rule is a partial local port.
 */
import { queryOptions } from "@tanstack/react-query";

export interface LifecycleEvidence {
  owner: string; scope: "native" | "optional"; istable: number; issingle: number; is_submittable: number; autoname: string | null;
  flags: Record<string, unknown>; controller_exists: boolean; hooks: string[]; submit_hooks: string[]; plain_base: boolean;
  bases: string[]; whitelisted: number; virtual_rules: string[]; data_fields: number;
  /** EXACT when the controller class named after the DocType was found; anything else is treated as unverified */
  class_match?: "EXACT" | "HEURISTIC" | "NONE" | null;
}
export interface RuntimeContract {
  schema_version: 1; generator: string; lifecycle: Record<string, LifecycleEvidence>;
  virtual_lifecycle_rules: Record<string, string[]>; settings_consumers: Record<string, string[]>; meaning: Record<string, string>;
}

let cache: RuntimeContract | null = null;
export const primeRuntimeContract = (c: RuntimeContract) => { cache = c; };
export const cachedRuntimeContract = () => cache;
export const runtimeContractQuery = queryOptions({
  queryKey: ["runtime-contract", 1], staleTime: Infinity, gcTime: Infinity,
  queryFn: async (): Promise<RuntimeContract> => {
    const r = await fetch("/source-intelligence/runtime-contract.json");
    if (!r.ok) throw new Error("Runtime contract unavailable");
    const c = (await r.json()) as RuntimeContract;
    if (c.schema_version !== 1) throw new Error("Unsupported runtime contract version");
    cache = c; return c;
  },
});

export const DOCUMENT_CLASSES = ["DOCUMENT_READABLE", "DOCUMENT_EDITABLE_VIRTUAL", "DOCUMENT_LIFECYCLE_VIRTUAL", "SOURCE_DEFINED_SERVER_ONLY", "NOT_IMPLEMENTED"] as const;
export type DocumentClass = typeof DOCUMENT_CLASSES[number];
export type OpState = "VIRTUAL" | "SERVER_ONLY" | "NOT_APPLICABLE";
export interface DocumentCapability {
  class: DocumentClass; create: boolean; edit: boolean; delete: boolean; submit: OpState; cancel: OpState; amend: OpState;
  controller_validation: "NONE" | "VIRTUAL_RULES" | "SERVER_ONLY"; reasons: string[];
}
type MetaLike = { name: string; istable?: number; issingle?: number; is_submittable?: number; source?: string; fields?: { fieldname?: string; fieldtype: string }[] };
const SAVE_HOOKS = ["validate", "before_validate", "before_save", "before_insert", "after_insert", "on_update", "autoname", "before_naming"];

/** Classify what a DocType supports in the Virtual Core. App-owned (plugin) DocTypes run declarative server scripts only. */
export function classifyDocument(meta: MetaLike, ev?: LifecycleEvidence): DocumentCapability {
  const sub = !!meta.is_submittable;
  const lifecycle = (s: OpState): Pick<DocumentCapability, "submit" | "cancel" | "amend"> => ({ submit: sub ? s : "NOT_APPLICABLE", cancel: sub ? s : "NOT_APPLICABLE", amend: sub ? s : "NOT_APPLICABLE" });
  if (String(meta.source ?? "").startsWith("plugin:")) {
    return { class: sub ? "DOCUMENT_LIFECYCLE_VIRTUAL" : "DOCUMENT_EDITABLE_VIRTUAL", create: !meta.istable, edit: true, delete: !meta.istable, ...lifecycle("VIRTUAL"),
      controller_validation: "VIRTUAL_RULES", reasons: ["App-owned DocType: declarative Server/Client Scripts run virtually; the exported Python controller needs DIGIT staging."] };
  }
  if (!ev) return { class: "DOCUMENT_READABLE", create: false, edit: false, delete: false, ...lifecycle("SERVER_ONLY"), controller_validation: "SERVER_ONLY", reasons: ["No runtime evidence indexed for this DocType (SOURCE_UNVERIFIED)."] };
  const flags = ev.flags ?? {};
  const ctrl: DocumentCapability["controller_validation"] = ev.virtual_rules.length ? "VIRTUAL_RULES" : ev.hooks.some((h) => SAVE_HOOKS.includes(h)) ? "SERVER_ONLY" : "NONE";
  if (flags["is_virtual"]) return { class: "SOURCE_DEFINED_SERVER_ONLY", create: false, edit: false, delete: false, ...lifecycle("SERVER_ONLY"), controller_validation: "SERVER_ONLY", reasons: ["Virtual DocType (is_virtual): records are produced by the Python controller (load_from_db/get_list)."] };
  if (ev.data_fields === 0) return { class: "NOT_IMPLEMENTED", create: false, edit: false, delete: false, ...lifecycle("NOT_APPLICABLE"), controller_validation: ctrl, reasons: ["No data fields in source schema; nothing to render."] };
  if (ev.istable) return { class: "DOCUMENT_READABLE", create: false, edit: false, delete: false, ...lifecycle("NOT_APPLICABLE"), controller_validation: ctrl, reasons: ["Child table: rows are created and edited through the parent document (parent/parentfield/parenttype)."] };
  if (flags["in_create"] || flags["read_only"]) {
    return { class: "DOCUMENT_READABLE", create: false, edit: !flags["read_only"], delete: false, ...lifecycle("SERVER_ONLY"), controller_validation: ctrl,
      reasons: [flags["read_only"] ? "Source marks the DocType read_only." : "Source marks the DocType in_create (users cannot create; records are generated)."] };
  }
  if (ev.issingle) return { class: "DOCUMENT_EDITABLE_VIRTUAL", create: false, edit: true, delete: false, ...lifecycle("NOT_APPLICABLE"), controller_validation: ctrl, reasons: ["Single (settings) record stored through the adapter."] };
  if (sub) {
    if (ev.virtual_rules.length) return { class: "DOCUMENT_LIFECYCLE_VIRTUAL", create: true, edit: true, delete: true, ...lifecycle("VIRTUAL"), controller_validation: ctrl, reasons: [`Submit/cancel run ported rules in ${ev.virtual_rules.join(", ")} (partial parity).`] };
    if (ev.controller_exists && ev.class_match !== undefined && ev.class_match !== "EXACT") return { class: "DOCUMENT_EDITABLE_VIRTUAL", create: true, edit: true, delete: true, ...lifecycle("SERVER_ONLY"), controller_validation: "SERVER_ONLY",
      reasons: ["Controller class could not be identified in source (SOURCE_UNVERIFIED): submit/cancel need the DIGIT server."] };
    if (ev.submit_hooks.length || !ev.plain_base) return { class: "DOCUMENT_EDITABLE_VIRTUAL", create: true, edit: true, delete: true, ...lifecycle("SERVER_ONLY"), controller_validation: ctrl,
      reasons: [ev.submit_hooks.length ? `Controller defines ${ev.submit_hooks.join(", ")} with no virtual port: submit/cancel need the DIGIT server.` : `Controller inherits ${ev.bases.join(", ")} (shared submit logic) with no virtual port: submit/cancel need the DIGIT server.`] };
    return { class: "DOCUMENT_LIFECYCLE_VIRTUAL", create: true, edit: true, delete: true, ...lifecycle("VIRTUAL"), controller_validation: ctrl, reasons: ["Controller declares no submit/cancel hooks; the docstatus lifecycle is faithful without a server."] };
  }
  return { class: "DOCUMENT_EDITABLE_VIRTUAL", create: true, edit: true, delete: true, ...lifecycle("NOT_APPLICABLE"), controller_validation: ctrl,
    reasons: [ctrl === "SERVER_ONLY" ? `Drafts save locally; controller ${ev.hooks.filter((h) => SAVE_HOOKS.includes(h)).join(", ")} validation needs the DIGIT server.` : "Drafts save locally through the adapter."] };
}

/** Classification from the cached contract (sync; undefined evidence until the contract query has loaded). */
export function documentCapability(meta: MetaLike): DocumentCapability { return classifyDocument(meta, cache?.lifecycle[meta.name]); }
