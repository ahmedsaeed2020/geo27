import { queryOptions } from '@tanstack/react-query';
import type { AnyCapability, CapabilityRegistry, DocCapability, ExecutionClass, OptionalCapability, Relationship } from './sourceTypes';

export const capabilityQuery = queryOptions({
  queryKey: ['source-capabilities', 2], staleTime: Infinity,
  queryFn: async (): Promise<CapabilityRegistry> => {
    const r = await fetch('/source-intelligence/capabilities.json');
    if (!r.ok) throw new Error('Source capability index unavailable');
    const data: CapabilityRegistry = await r.json();
    if (data.schema_version !== 1) throw new Error('Unsupported source capability index version');
    return data;
  },
});

/** Optional-app capabilities (e.g. Insights) indexed in their own namespace, keyed by DocType. */
export function optionalCapabilities(registry: CapabilityRegistry): Record<string, OptionalCapability> {
  return Object.assign({}, ...Object.values(registry.optional_sources ?? {}).map(o => o.doctypes));
}
/** Native baseline + compatible optional source metadata (the effective source registry). Native names win. */
export function allCapabilities(registry: CapabilityRegistry): AnyCapability[] {
  return [...Object.values(registry.doctypes), ...Object.values(optionalCapabilities(registry)).filter(o => !registry.doctypes[o.name])];
}
export function capabilityOf(registry: CapabilityRegistry, name: string): DocCapability | undefined { return registry.doctypes[name]; }
export function capabilityOfAny(registry: CapabilityRegistry, name: string): AnyCapability | undefined { return registry.doctypes[name] ?? optionalCapabilities(registry)[name]; }
export const isOptional = (c: AnyCapability | undefined): c is OptionalCapability => !!c && c.scope === 'optional';
function optionalRelations(registry: CapabilityRegistry, owner: string): Relationship[] { return (registry.optional_sources?.[owner]?.relationships ?? []).map(r => ({ ...r, scope: 'optional' as const })); }

export function relationsOf(registry: CapabilityRegistry, name: string, direction: 'incoming' | 'outgoing' = 'outgoing'): Relationship[] {
  const cap = capabilityOfAny(registry, name);
  if (!cap) return [];
  const pool = isOptional(cap) ? optionalRelations(registry, cap.owner) : registry.relationships;
  const own = cap[direction].flatMap(i => pool[i] ? [pool[i]] : []);
  if (direction === 'incoming' && !isOptional(cap)) {
    // optional apps may reference native masters (e.g. Insights → User); expose them without mutating native indices
    const extra = Object.keys(registry.optional_sources ?? {}).flatMap(o => optionalRelations(registry, o).filter(r => r.to === name));
    return [...own, ...extra];
  }
  return own;
}
export function relatedDocTypes(registry: CapabilityRegistry, name: string): string[] {
  return [...new Set([...relationsOf(registry, name).flatMap(e => e.to ? [e.to] : []), ...relationsOf(registry, name, 'incoming').map(e => e.from)])].sort();
}
export function searchCapabilities(registry: CapabilityRegistry, search: string, owner?: string, module?: string): AnyCapability[] {
  const q = search.toLowerCase();
  return allCapabilities(registry).filter(d => (!owner || d.owner === owner) && (!module || d.module === module) &&
    [d.name, d.module, ...d.schema.fields.map(f => f.fieldname ?? '')].some(s => s.toLowerCase().includes(q)));
}
/** Child-table DocTypes of a capability (parent → child, preserving fieldname/parentfield identity). */
export function childTablesOf(registry: CapabilityRegistry, name: string): { fieldname: string; doctype: string; exists: boolean }[] {
  return relationsOf(registry, name).filter(r => r.kind === 'CHILD_TABLE' && r.to).map(r => ({ fieldname: r.field, doctype: r.to!, exists: !!r.target_exists }));
}
/** Only explicit local registration proves a virtual implementation; source presence alone does not. */
export function actionExecution(action: { target?: string | null; kind?: string; method?: string | null }, localRegistered = false): ExecutionClass {
  if (localRegistered) return 'VIRTUAL_IMPLEMENTED';
  if (action.target && ['create', 'route'].includes(action.kind ?? 'create')) return 'VIRTUAL_PARTIAL';
  return action.method ? 'FRAPPE_SERVER_REQUIRED' : 'SOURCE_UNVERIFIED';
}
export function capabilityHandoff(registry: CapabilityRegistry, name: string) {
  const capability = capabilityOfAny(registry, name);
  if (!capability) return { status: 'SOURCE_UNVERIFIED', name };
  return { schema_version: 1, capability, source_application: registry.source_apps.find(a => a.name === capability.owner),
    scope: capability.scope ?? 'native',
    relationships: { outgoing: relationsOf(registry, name), incoming: relationsOf(registry, name, 'incoming') },
    related_doctypes: relatedDocTypes(registry, name), reports: registry.reports.filter(r => capability.reports.includes(r.name)),
    metric_sources: { number_cards: capability.number_cards.map(n => registry.number_cards[n]), charts: capability.charts.map(n => registry.charts[n]) },
    effects: registry.business_effects, workflow_audit: registry.workflow_audit,
    limitations: ['Source metadata is not proof of runtime behavior', 'Python controllers require real DIGIT', 'Dynamic Link targets resolve from document discriminator values',
      ...(isOptional(capability) ? ['Optional application: indexed from its own archive, not installed in a host slot'] : [])],
    export: { schema: 'PluginManifest.doctypes → doctype.json', customization: 'Custom Field / Property Setter fixtures',
      server: 'Python controller/hooks require implementation and staging tests', frontend: 'Owned frontend sources are bundled as a candidate; DIGIT asset build/runtime wiring requires staging (SERVER_OR_STAGING_REQUIRED)' } };
}
