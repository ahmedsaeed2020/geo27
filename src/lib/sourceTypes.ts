/** Source ownership is not a routing AppId. All structures are metadata only. */
import type { AppId, DocTypeMeta, ReportEntry, Workspace } from './catalog';
import type { FormAction, LinkFilter } from './engines';
import type { FormRule } from './formRules';

export type ExecutionClass = 'VIRTUAL_IMPLEMENTED' | 'VIRTUAL_PARTIAL' | 'FRAPPE_SERVER_REQUIRED' | 'SOURCE_UNVERIFIED' | 'METADATA_ONLY';
export interface SourceDependency { name: string; constraint?: string | null; optional: boolean }
export interface PinnedSourceRequest { status: string; repository: string; declared_version?: string | null; recorded_ref?: string; archive_sha256?: string | null; request: string; evidence_checked: string[]; impact: string }
export interface SourceApplication {
  name: string; namespace: string; version?: string | null; host_app?: AppId | null; optional: boolean;
  dependencies: SourceDependency[]; archive?: string; available?: boolean; sha256?: string; commit?: string | null;
  commit_status?: string; recorded_ref?: string; release_status?: string; status?: string;
  catalog_counts?: Record<string, number>; archive_counts?: Record<string, number>;
  schema_drift?: { archive_only: string[]; catalog_only: string[]; changed_field_shapes: string[] };
  owned_doctypes?: string[]; workspaces?: string[]; reports?: string[]; actions?: string[]; frontend_routes?: string[];
  execution?: ExecutionClass; provenance_references?: string[];
  repository_declared?: string | null; pinned_source_request?: PinnedSourceRequest;
}
export interface Relationship {
  id: string; kind: 'LINK' | 'DYNAMIC_LINK' | 'CHILD_TABLE'; from: string; field: string; to: string | null;
  discriminator: string | null; target_exists: boolean | null; discriminator_exists: boolean | null;
  cardinality: 'N:1' | '1:N'; source: string; evidence: 'EXPLICIT_SCHEMA'; scope?: 'native' | 'optional';
}
/** Controller index: method names, bases and whitelist decorators only — bodies are never retained or executed. */
export interface ControllerIndex {
  source: string; execution: ExecutionClass; body_indexed: boolean; exists?: boolean; class?: string | null; bases?: string[];
  hooks?: string[]; methods_count?: number; whitelisted?: string[]; plain_base?: boolean; parse?: string; index_scope?: string;
}
export interface DocCapability {
  name: string; owner: string; module: string; slug: string; host_app: AppId; source: string; schema: DocTypeMeta;
  outgoing: number[]; incoming: number[]; controller: ControllerIndex;
  actions: FormAction[]; link_filters: LinkFilter[]; form_rules: FormRule[]; behavior: unknown;
  settings: Record<string, unknown>; reverse_link_registry: unknown[]; reports: string[];
  dashboard: unknown; number_cards: string[]; charts: string[]; workflows: Record<string, unknown>[];
  customization: Record<string, string>; execution: string; scope?: 'native'; source_flags?: Record<string, unknown>;
}
/** Optional-app DocType indexed from its own archive namespace; never registered in the four host slots. */
export type OptionalCapability = Omit<DocCapability, 'host_app' | 'scope' | 'schema'> & {
  host_app: null; scope: 'optional'; registration: string; schema: Omit<DocTypeMeta, 'app'> & { app: string };
};
export type AnyCapability = DocCapability | OptionalCapability;
export interface OptionalSource {
  status: string; namespace?: string; doctypes: Record<string, OptionalCapability>; relationships: Relationship[];
  counts?: Record<string, number>; virtual_runtime?: string;
}
export interface DependencyBoundary {
  app: string; dependency: string; status: 'OPTIONAL_DEPENDENCY_REQUIRED'; source_status: string; declared_as: string; constraint: string;
  hook_lines: { line: number; text: string }[]; references: Record<string, { file: string; lines: number[]; count: number }[]>;
  affected_capabilities: string[]; virtual_policy: string; acquisition_request: Record<string, string>;
}
export interface CapabilityRegistry {
  schema_version: 1; generator: string; inputs: Record<string, string>; source_apps: SourceApplication[];
  modules: Record<string, string[]>; doctypes: Record<string, DocCapability>; relationships: Relationship[];
  reports: (ReportEntry & { source_execution?: ExecutionClass; runtime_verification?: string; virtual_registry_reference?: string })[]; workspaces: Workspace[]; number_cards: Record<string, Record<string, unknown>>;
  charts: Record<string, Record<string, unknown>>; workflow_audit: Record<string, unknown>;
  business_effects: Record<string, unknown>; coverage: Record<string, unknown>;
  optional_sources?: Record<string, OptionalSource>; effective_counts?: Record<string, number>;
  optional_dependency_boundaries?: DependencyBoundary[];
}
