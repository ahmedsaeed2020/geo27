/**
 * Universal effective metadata resolution (P1.1). One interface over the layers the Core already has — it does not
 * duplicate the capability graph or the plugin overlay:
 *   ORIGINAL_NATIVE (frozen catalog) | OPTIONAL_APP_SOURCE (separately indexed optional archive) | APP_OWNED (plugin DocType)
 *   → CUSTOM_FIELD / PROPERTY_SETTER (plugins/runtime.ts overlayMeta incl. live Desk customizations)
 *   → APP_EXTENSION (client/server scripts, workflows, app actions targeting the DocType)
 *   → USER_PRESENTATION (List View Settings record, display only).
 * Technical fieldnames/identifiers are never rewritten.
 */
import type { DocField, DocTypeMeta, IndexEntry } from "./catalog";
import { adapter } from "./adapter";
import { enabledPlugins, overlayMeta, pluginMeta } from "@/plugins/runtime";
import type { AnyCapability, CapabilityRegistry } from "./sourceTypes";
import { capabilityOfAny, isOptional } from "./capabilities";
import type { LifecycleEvidence } from "./runtimeContract";
import { classifyDocument } from "./runtimeContract";
import { fieldSupport } from "./fieldTypes";
import { namingPolicy } from "./documentApi";
import { LAYOUT_TYPES, TABLE_TYPES } from "./catalog";

export type MetaLayerKind = "ORIGINAL_NATIVE" | "OPTIONAL_APP_SOURCE" | "APP_OWNED" | "CUSTOM_FIELD" | "PROPERTY_SETTER" | "APP_EXTENSION" | "USER_PRESENTATION";
export interface MetaLayer { kind: MetaLayerKind; source: string; count: number }
export interface EffectiveMeta { meta: DocTypeMeta; base: DocTypeMeta; layers: MetaLayer[]; scope: "native" | "optional" | "app"; owner: string }

/** Pure: apply enabled overlays to a base meta and report which layers contributed. */
export function effectiveMetaFrom(base: DocTypeMeta, scope: EffectiveMeta["scope"], owner: string): EffectiveMeta {
  const layers: MetaLayer[] = [{ kind: scope === "optional" ? "OPTIONAL_APP_SOURCE" : scope === "app" ? "APP_OWNED" : "ORIGINAL_NATIVE", source: base.source, count: base.fields.length }];
  const meta = scope === "optional" ? base : overlayMeta(base);
  const plugins = enabledPlugins();
  const cf = new Map<string, number>();
  for (const f of meta.fields) if (f["is_custom_field"] && !base.fields.some((b) => b.fieldname === f.fieldname)) { const k = String(f["__plugin"] ?? "custom"); cf.set(k, (cf.get(k) ?? 0) + 1); }
  for (const [source, count] of cf) layers.push({ kind: "CUSTOM_FIELD", source, count });
  for (const p of plugins) {
    const ps = (p.property_setters ?? []).filter((x) => x.doc_type === base.name).length;
    if (ps && scope !== "optional") layers.push({ kind: "PROPERTY_SETTER", source: p.name, count: ps });
    const ext = (p.client_scripts ?? []).filter((c) => c.dt === base.name).length + (p.server_scripts ?? []).filter((s) => s.reference_doctype === base.name).length
      + (p.workflows ?? []).filter((w) => w.document_type === base.name).length + (p.actions ?? []).filter((a) => a.doctype === base.name).length;
    if (ext) layers.push({ kind: "APP_EXTENSION", source: p.name, count: ext });
  }
  const lvs = adapter.get("List View Settings", base.name);
  if (lvs) layers.push({ kind: "USER_PRESENTATION", source: `List View Settings/${base.name}`, count: Object.keys(lvs).filter((k) => !["name", "doctype", "modified", "creation", "owner", "docstatus"].includes(k)).length });
  return { meta, base, layers, scope, owner };
}

/** Async resolution through the frozen catalog file, plugin-owned meta or the optional source registry. */
export async function resolveEffectiveMeta(name: string, index: IndexEntry[], registry?: CapabilityRegistry): Promise<EffectiveMeta | undefined> {
  const e = index.find((i) => i.name === name);
  if (e?.source.startsWith("plugin:")) { const m = pluginMeta(e.slug); return m ? effectiveMetaFrom(m, "app", e.source.slice(7)) : undefined; }
  if (e) {
    const r = await fetch(`/catalog/${e.app}/${e.slug}.json`); if (!r.ok) return undefined;
    return effectiveMetaFrom((await r.json()) as DocTypeMeta, "native", e.app);
  }
  const opt = registry ? capabilityOfAny(registry, name) : undefined;
  if (opt && isOptional(opt)) return effectiveMetaFrom(opt.schema as unknown as DocTypeMeta, "optional", opt.owner);
  return undefined;
}

export interface FieldDescription { fieldname: string; fieldtype: string; label?: string | undefined; options?: string | undefined; reqd: boolean; default?: string | undefined; read_only: boolean; hidden: boolean;
  depends_on?: string | undefined; mandatory_depends_on?: string | undefined; read_only_depends_on?: string | undefined; fetch_from?: string | undefined; permlevel: number; allow_on_submit: boolean; custom: boolean; support: string }
/** Pure typed description of a meta (+ optional capability / lifecycle evidence) for SDK consumers and the Explorer. */
export function describeMeta(meta: DocTypeMeta, cap?: AnyCapability, ev?: LifecycleEvidence) {
  const data = meta.fields.filter((f): f is DocField & { fieldname: string } => !!f.fieldname && !LAYOUT_TYPES.has(f.fieldtype));
  const fields: FieldDescription[] = data.map((f) => ({ fieldname: f.fieldname, fieldtype: f.fieldtype, label: f.label, options: f.options, reqd: !!f.reqd, default: f.default,
    read_only: !!f.read_only, hidden: !!f.hidden, depends_on: f.depends_on, mandatory_depends_on: f.mandatory_depends_on, read_only_depends_on: f.read_only_depends_on,
    fetch_from: f.fetch_from, permlevel: Number(f["permlevel"] ?? 0), allow_on_submit: !!f["allow_on_submit"], custom: !!f["is_custom_field"], support: fieldSupport(f.fieldtype).mode }));
  return {
    identity: { name: meta.name, app: meta.app, module: meta.module, owner: cap?.owner ?? meta.app, scope: cap?.scope ?? "native", istable: !!meta.istable, issingle: !!meta.issingle,
      is_submittable: !!meta.is_submittable, is_tree: !!meta.is_tree, title_field: meta.title_field, search_fields: meta.search_fields, source: meta.source },
    fields,
    child_tables: data.filter((f) => TABLE_TYPES.has(f.fieldtype)).map((f) => ({ fieldname: f.fieldname, doctype: f.options ?? "", parentfield: f.fieldname, parenttype: meta.name })),
    links: data.filter((f) => f.fieldtype === "Link").map((f) => ({ fieldname: f.fieldname, target: f.options ?? "" })),
    dynamic_links: data.filter((f) => f.fieldtype === "Dynamic Link").map((f) => ({ fieldname: f.fieldname, discriminator: f.options ?? "" })),
    required: fields.filter((f) => f.reqd).map((f) => f.fieldname),
    conditional_required: fields.filter((f) => f.mandatory_depends_on).map((f) => ({ fieldname: f.fieldname, when: f.mandatory_depends_on })),
    defaults: Object.fromEntries(fields.filter((f) => f.default !== undefined && f.default !== "").map((f) => [f.fieldname, f.default])),
    read_only: fields.filter((f) => f.read_only || f.fetch_from).map((f) => f.fieldname),
    permissions: meta.permissions,
    naming: namingPolicy(meta),
    document_state: classifyDocument(meta, ev),
    controller: cap?.controller ?? null,
    source_flags: cap?.source_flags ?? ev?.flags ?? {},
    workflows: enabledPlugins().flatMap((p) => (p.workflows ?? []).filter((w) => w.document_type === meta.name).map((w) => ({ app: p.name, name: w.name, states: w.states.map((s) => s.state) }))),
    reports: cap?.reports ?? [],
    unsupported_fields: fields.filter((f) => f.support === "READ_ONLY_EXPLICIT").map((f) => `${f.fieldname} (${f.fieldtype})`),
  };
}
