/**
 * DIGIT Enterprise export factory — shared types. One factory builds every DIGIT app's installable Frappe release from
 * that app's own release descriptor (src/plugins/<app>/release.json) and its checked-in Frappe package; nothing here is
 * app-specific. The factory never installs, migrates or deploys anything.
 */

/** Readiness ladder. Each stage is reported from executed evidence only; the factory itself can reach at most
 *  EXPORT_STATIC_VALIDATED. Hosted Frappe stages need a staging bench run (not available here). */
export const RELEASE_STAGES = [
  "VIRTUAL_APP_INTEGRATED",
  "EXPORT_SOURCE_COMPLETE",
  "EXPORT_PACKAGE_BUILT",
  "EXPORT_STATIC_VALIDATED",
  "FRAPPE_TEST_INSTALLED",
  "FRAPPE_HOSTED_UI_VERIFIED",
] as const;
export type ReleaseStage = (typeof RELEASE_STAGES)[number];
export type StageResult = "PASS" | "FAIL" | "NOT_RUN";

export type CheckStatus = "PASS" | "FAIL" | "WARN" | "NOT_RUN";
export interface CheckResult { id: string; title: string; status: CheckStatus; details: string[] }

export type FrontendKind = "desk-assets" | "hosted-spa" | "none";

/** App-owned export descriptor (src/plugins/<app>/release.json). Paths are repository-relative. */
export interface ReleaseDescriptor {
  schema: 1;
  app: string;
  title: string;
  title_ar: string;
  /** Directory of the authoritative installable Frappe package (contains pyproject.toml and <app>/hooks.py). */
  frappe_package: string;
  /** How the app's Frappe-side UI is delivered. */
  frontend: {
    kind: FrontendKind;
    summary: string;
    /** hosted-spa: page (relative to the package's python module) that loads the compiled bundle */
    entry_html?: string;
    /** hosted-spa: compiled bundle directory (relative to the package's python module) */
    bundle_dir?: string;
    /** command that produces the bundle, or null when no build pipeline exists in this repository */
    build?: string | null;
    /** exact gap statement when the bundle cannot be produced here */
    gap?: string;
  };
  /** Virtual (Lovable) sources owned by the app: plugin, UI components, routes, icons. Packed into the source ZIP. */
  sources: string[];
  /** App documentation packed into the source ZIP. */
  docs: string[];
  /** Frappe apps the package must declare in hooks.required_apps (normalised: "frappe/hrms" -> "hrms"). */
  required_apps: string[];
  /** Supported version ranges, must match pyproject [tool.bench.frappe-dependencies]. */
  target: Record<string, string>;
  integrations: { name: string; status: "NOT_INCLUDED" | "OPTIONAL_NOT_CONFIGURED" | "REQUIRED_NOT_CONFIGURED"; needs: string }[];
  env: { name: string; purpose: string; required: boolean }[];
  /** Read-only commands the operator runs before install-app (e.g. an app preflight). Optional. */
  preflight?: string[];
  /** Post-install verification the operator performs on a staging site. */
  staging_checks: string[];
  known_limitations: string[];
}

/** One file of the Frappe package or the source tree (repository-relative path). */
export interface SourceFile { path: string; data: Uint8Array }

export interface FactoryContext {
  /** commit the release is built from */
  commit: string;
  /** true when tracked files differ from the commit (the release says so) */
  dirty: boolean;
  /** manifests of every registered plugin (name -> version) */
  registered: Record<string, string>;
  /** apps with an experience slot (Enterprise shell entry) */
  experiences: string[];
  /** native DocType names from the frozen catalog */
  catalogDoctypes: Set<string>;
  /** DocTypes owned by other apps (app -> names) */
  otherOwned: Record<string, string[]>;
  /** external results computed by the CLI (python compile, schema validator, frozen catalog) */
  external: { python?: CheckResult; schema?: CheckResult; catalog?: CheckResult };
}

export interface Artifact { file: string; sha256: string; bytes: number; entries?: number }

export interface ReleaseManifest {
  schema: 1;
  factory: string;
  app: string;
  title: string;
  title_ar: string;
  version: string;
  virtual_plugin_version: string | null;
  source: { commit: string; dirty: boolean; package: string };
  built_at: string;
  reproducible_zip_epoch: string;
  target: Record<string, string>;
  required_apps: string[];
  python: string | null;
  frontend: ReleaseDescriptor["frontend"] & { status: CheckStatus };
  owned_doctypes: string[];
  migrations: string[];
  integrations: ReleaseDescriptor["integrations"];
  env: ReleaseDescriptor["env"];
  artifacts: Artifact[];
  checks: CheckResult[];
  readiness: Record<ReleaseStage, StageResult> & { highest: ReleaseStage | "NONE"; production: "PRODUCTION_NOT_AUTHORIZED" };
  known_limitations: string[];
}

/** Factory refusal: the app cannot be exported (no descriptor/package/registration). Exit code 2 in the CLI. */
export interface FactoryRefusal { app: string; status: "SOURCE_REQUIRED" | "NOT_REGISTERED" | "INVALID_DESCRIPTOR"; reasons: string[]; needed: string[] }
