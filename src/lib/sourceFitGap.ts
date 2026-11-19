/**
 * Registry-backed fit-gap compiler (M5 → P6). Read-only decision evidence for a requirement: native owner/version,
 * exact DocType fields/child tables/links, existing behaviour (lifecycle class, actions, services), reports, settings,
 * permissions, missing capabilities, proposed app extension location, affected routes/departments and the
 * server/export mapping. Never invents fields, permissions or business effects; proposals are marked PROPOSED.
 */
import { capabilityHandoff, capabilityOfAny, childTablesOf, isOptional, relationsOf, searchCapabilities } from './capabilities';
import type { CapabilityRegistry } from './sourceTypes';
import type { IndexEntry } from './catalog';
import { classifyDocument, type RuntimeContract } from './runtimeContract';
import { DOMAINS } from './domainMaps';
import { reportClass } from './reportRegistry';
import { settingsForDocType } from './settingsRegistry';
import { fieldSupport } from './fieldTypes';

export const FIT_GAP_CLASSES = ['NATIVE_REUSE', 'NATIVE_CONFIGURATION', 'ADDITIVE_CUSTOMIZATION', 'NEW_APP_DOCTYPE', 'NEW_APP_UI', 'NEW_APP_REPORT', 'CORE_FOUNDATION_GAP', 'FRAPPE_SERVER_REQUIRED', 'SOURCE_UNVERIFIED'] as const;
export type FitGapClass = typeof FIT_GAP_CLASSES[number];
/** Historical names kept readable: STANDARD_CONFIGURATION → NATIVE_CONFIGURATION, NEW_APP_COMPONENT → NEW_APP_UI. */
export const LEGACY_FIT_GAP_ALIASES: Record<string, FitGapClass> = { STANDARD_CONFIGURATION: 'NATIVE_CONFIGURATION', NEW_APP_COMPONENT: 'NEW_APP_UI', UNVERIFIED: 'SOURCE_UNVERIFIED' };
export const normalizeFitGapClass = (c: string | undefined): FitGapClass => (FIT_GAP_CLASSES as readonly string[]).includes(c ?? '') ? c as FitGapClass : LEGACY_FIT_GAP_ALIASES[c ?? ''] ?? 'SOURCE_UNVERIFIED';

export interface FitGapRequirement {
  id: string; evidence: string[]; outcome: string; native_candidate?: string;
  fields?: string[]; decision?: FitGapClass | 'STANDARD_CONFIGURATION'; rationale?: string;
  acceptance: string[]; tests: string[]; app?: string;
}
export interface FitGapContext { contract?: RuntimeContract | null; index?: IndexEntry[]; runners?: Record<string, unknown> }

const EXTENSION_LOCATION: Record<FitGapClass, string> = {
  NATIVE_REUSE: 'No app code: link to the native DocType through its existing route/adapter.',
  NATIVE_CONFIGURATION: 'Site configuration records (Property Setter / Workflow / Number Card / settings) or plugin fixtures.',
  ADDITIVE_CUSTOMIZATION: 'src/plugins/<app>/index.ts custom_fields / property_setters / client_scripts / actions on the native DocType.',
  NEW_APP_DOCTYPE: 'src/plugins/<app>/index.ts doctypes (Links to native masters, child tables owned by the app).',
  NEW_APP_UI: 'src/plugins/<app>/ workspaces / department_sections / frontend (React candidate bundle).',
  NEW_APP_REPORT: 'src/plugins/<app>/index.ts reports with run() over scoped canonical rows.',
  CORE_FOUNDATION_GAP: 'Shared Core module (requires owner approval + AGENTS.md rule).',
  FRAPPE_SERVER_REQUIRED: 'Python controller / whitelisted method in the exported DIGIT app (staging required).',
  SOURCE_UNVERIFIED: 'Blocked until source evidence or an owner decision exists.',
};
const EXPORT_MAPPING: Record<FitGapClass, string> = {
  NATIVE_REUSE: 'Nothing exported; native app keeps ownership.', NATIVE_CONFIGURATION: 'fixtures/*.json (Property Setter, Workflow, Number Card…)',
  ADDITIVE_CUSTOMIZATION: 'fixtures/custom_field.json, property_setter.json, client_script.json', NEW_APP_DOCTYPE: '<module>/doctype/<name>/<name>.json + .py controller + test',
  NEW_APP_UI: 'workspace JSON + frontend/ candidate sources + digit/integration.json (build and staging SERVER_OR_STAGING_REQUIRED)', NEW_APP_REPORT: '<module>/report/<name>/<name>.json (+ .py for Script Report)',
  CORE_FOUNDATION_GAP: 'Not exported by an app.', FRAPPE_SERVER_REQUIRED: '<app>/api.py whitelisted method / hooks.py doc_events (implementation + staging tests)', SOURCE_UNVERIFIED: 'Nothing until resolved.',
};

/** Read-only decision evidence. Never invents fields, permissions or business effects. */
export function compileFitGap(registry: CapabilityRegistry, requirement: FitGapRequirement, ctx: FitGapContext = {}) {
  const candidate = requirement.native_candidate ? capabilityOfAny(registry, requirement.native_candidate) : undefined;
  const schemaFields = candidate?.schema.fields ?? [];
  const missingFields = candidate ? (requirement.fields ?? []).filter(n => !schemaFields.some(f => f.fieldname === n)) : requirement.fields ?? [];
  const requested = normalizeFitGapClass(requirement.decision);
  const invalidReuse = ['NATIVE_REUSE', 'NATIVE_CONFIGURATION', 'ADDITIVE_CUSTOMIZATION'].includes(requested) && !candidate;
  const optionalReuse = requested === 'NATIVE_REUSE' && isOptional(candidate);
  const decision: FitGapClass = invalidReuse || (requested === 'NATIVE_REUSE' && missingFields.length > 0) ? 'SOURCE_UNVERIFIED' : optionalReuse ? 'SOURCE_UNVERIFIED' : requested;
  const app = candidate ? registry.source_apps.find(a => a.name === candidate.owner) : undefined;
  const ev = candidate ? ctx.contract?.lifecycle[candidate.name] : undefined;
  const docState = candidate ? classifyDocument(candidate.schema, ev) : undefined;
  const slugRoute = candidate && !isOptional(candidate) ? `/app/${candidate.host_app}/${candidate.slug}` : null;
  const reports = candidate ? registry.reports.filter(r => r.ref_doctype === candidate.name).map(r => ({ name: r.name, execution: reportClass(r, !!ctx.runners?.[r.name]) })) : [];
  const departments = candidate ? [...new Set(DOMAINS.filter(d => d.doctypes.includes(candidate.name)).map(d => d.department ?? d.id))] : [];
  const unsupported = schemaFields.filter(f => f.fieldname && fieldSupport(f.fieldtype).mode === 'READ_ONLY_EXPLICIT').map(f => `${f.fieldname} (${f.fieldtype})`);
  const missingCapabilities = [
    ...missingFields.map(f => `Field ${f} absent from ${candidate?.name ?? 'source'} — needs ADDITIVE_CUSTOMIZATION (PROPOSED custom field) or a new app DocType`),
    ...(docState?.submit === 'SERVER_ONLY' ? [`${candidate!.name} submit/cancel is FRAPPE_SERVER_REQUIRED (${docState.reasons[0]})`] : []),
    ...(docState?.controller_validation === 'SERVER_ONLY' ? [`${candidate!.name} controller validation runs only on DIGIT`] : []),
    ...unsupported.map(f => `Field ${f} renders read-only (control not available virtually)`),
    ...(isOptional(candidate) ? [`${candidate!.name} belongs to optional app ${candidate!.owner} (not installed in a host slot)`] : []),
  ];
  return {
    requirement, requirement_id: requirement.id, decision, requested_decision: requested,
    rationale: requirement.rationale ?? 'Owner decision required; metadata alone does not establish runtime fit.',
    candidate: candidate ? { name: candidate.name, owner: candidate.owner, source: candidate.source, host_app: candidate.host_app, scope: candidate.scope ?? 'native', module: candidate.module } : null,
    source_version: app ? { app: app.name, version: app.version ?? null, recorded_ref: app.recorded_ref, commit: app.commit ?? null, commit_status: app.commit_status, release_status: app.release_status } : null,
    alternatives: candidate ? [] : searchCapabilities(registry, requirement.native_candidate ?? requirement.outcome).slice(0, 25).map(d => ({ name: d.name, owner: d.owner, source: d.source })),
    fields: candidate ? { requested: requirement.fields ?? [], existing: (requirement.fields ?? []).filter(n => !missingFields.includes(n)), missing: missingFields,
      child_tables: childTablesOf(registry, candidate.name), links: relationsOf(registry, candidate.name).filter(r => r.kind !== 'CHILD_TABLE').map(r => ({ field: r.field, kind: r.kind, to: r.to, discriminator: r.discriminator })),
      incoming_references: relationsOf(registry, candidate.name, 'incoming').length } : null,
    missing_fields: missingFields,
    existing_behavior: candidate ? { document_state: docState, actions: candidate.actions.map(a => ({ label: a.label, target: a.target, method: a.method })), controller_hooks: candidate.controller.hooks ?? [],
      services: DOMAINS.filter(d => d.doctypes.includes(candidate.name)).flatMap(d => d.services) } : null,
    needed_customization: decision === 'ADDITIVE_CUSTOMIZATION' ? missingFields.map(f => ({ type: 'Custom Field (PROPOSED)', dt: candidate?.name, fieldname: f.startsWith('custom_') ? f : `custom_${f}` }))
      : decision === 'NEW_APP_DOCTYPE' ? [{ type: 'App DocType (PROPOSED)', links_to: candidate?.name ?? null, note: 'Link to the native record; never copy native masters or ledgers.' }] : [],
    app_extension_location: EXTENSION_LOCATION[decision],
    affected_routes: slugRoute ? [slugRoute, `${slugRoute}/<name>`, ...reports.filter(r => r.execution === 'LOCAL_VIRTUAL_REPORT').map(r => `/report/${r.name}`)] : [],
    affected_departments: departments, affected_reports: reports,
    settings: candidate && ctx.index ? settingsForDocType({ name: candidate.name, module: candidate.module, autoname: candidate.schema.autoname, fields: candidate.schema.fields }, ctx.index, ctx.contract).map(d => ({ domain: d.id, doctypes: d.settings.filter(s => s.present).map(s => s.doctype) })) : [],
    permissions: candidate ? candidate.schema.permissions.map(p => ({ role: String(p['role']), rights: ['read', 'write', 'create', 'delete', 'submit', 'cancel', 'amend'].filter(k => p[k]), permlevel: Number(p['permlevel'] ?? 0), if_owner: !!p['if_owner'] })) : [],
    missing_capabilities: missingCapabilities,
    server_export_mapping: EXPORT_MAPPING[decision],
    acceptance_criteria: requirement.acceptance.length ? requirement.acceptance : ['PENDING_ARCHITECT: supply AC-* (positive, negative/denied, read-back, AR/EN)'],
    handoff: candidate ? capabilityHandoff(registry, candidate.name) : null,
    virtual_mapping: candidate && !isOptional(candidate) ? { read_back: 'VirtualERPAdapter', workflow: 'src/lib/workflow.ts', permissions: 'src/lib/session.ts', posting: 'src/lib/posting.ts', contract: 'src/lib/documentApi.ts', ui: slugRoute } : null,
    frappe_mapping: { native: 'Reuse existing owning-app DocType; never duplicate canonical masters.', custom: 'Owning plugin DocType JSON, controller, hooks, fixtures and migration', ui: 'Native Desk form or explicitly built DIGIT frontend assets', tests: 'Separate authorized staging required' },
    verification: 'NOT_RUN', approval_required: ['CORE_FOUNDATION_GAP', 'FRAPPE_SERVER_REQUIRED'].includes(decision),
  };
}
