/** Non-destructive source package inspection. Does not import runtime or touch records/storage. */
import type { AppId, IndexEntry } from '@/lib/catalog';
import type { SourceApplication } from '@/lib/sourceTypes';
import type { PluginManifest } from './types';

export type SourceFiles = Record<string, string>;
export interface CompatibilityIssue { code: string; message: string; source?: string; severity: 'error' | 'warning' }
export interface SourceInspection { applications: SourceApplication[]; issues: CompatibilityIssue[]; references: SourceFiles; installable: false }
const literal = (body: string, key: string) => body.match(new RegExp(`^${key}\\s*=\\s*["']([^"']+)["']`, 'm'))?.[1];
const stringList = (body: string, key: string) => {
  const expression = body.match(new RegExp(`^${key}\\s*=\\s*\\[([\\s\\S]*?)\\]`, 'm'))?.[1] ?? '';
  return [...expression.matchAll(/["']([^"']+)["']/g)].map(m => m[1] ?? '');
};
const parse = (text: string): unknown => { try { return JSON.parse(text); } catch { return undefined; } };
const object = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

export function ownershipIssues(p: Pick<PluginManifest, 'name' | 'doctypes' | 'source_application'>, native: Pick<IndexEntry, 'name' | 'app'>[], plugins: Pick<PluginManifest, 'name' | 'doctypes' | 'source_application'>[] = []): CompatibilityIssue[] {
  const issues: CompatibilityIssue[] = [];
  const owner = p.source_application?.namespace ?? p.name;
  const seen = new Set<string>();
  for (const d of p.doctypes ?? []) {
    const baseline = native.find(n => n.name === d.name);
    const other = plugins.find(q => q.name !== p.name && q.doctypes?.some(n => n.name === d.name));
    if (baseline || other || seen.has(d.name)) issues.push({ code: 'DUPLICATE_OWNERSHIP', severity: 'error', message: `${owner}: ${d.name} is already owned by ${baseline?.app ?? other?.source_application?.namespace ?? other?.name ?? owner}; use additive Custom Fields instead.` });
    seen.add(d.name);
  }
  return issues;
}

export function inspectSourceFiles(files: SourceFiles, options: { native?: Pick<IndexEntry, 'name' | 'app'>[]; applications?: SourceApplication[]; host_app?: AppId } = {}): SourceInspection {
  const issues: CompatibilityIssue[] = [], applications: SourceApplication[] = [], references: SourceFiles = {};
  const paths = Object.keys(files).sort();
  for (const path of paths) {
    if (path.split('/').some(part => ['..', '.git'].includes(part)) || path.startsWith('/') || path.includes('\\')) {
      issues.push({ code: 'UNSAFE_PATH', severity: 'error', source: path, message: `Unsafe source path: ${path}` }); continue;
    }
    if (/\.(py|js|vue|ts|tsx|toml)$/.test(path)) references[path] = files[path] ?? '';
  }
  const hooks = paths.filter(p => /(^|\/)hooks\.py$/.test(p) && !issues.some(i => i.source === p));
  if (!hooks.length) issues.push({ code: 'SOURCE_UNVERIFIED', severity: 'warning', message: 'No hooks.py found; application ownership cannot be established.' });
  for (const path of hooks) {
    const body = files[path] ?? '', base = path.replace(/hooks\.py$/, '');
    const name = literal(body, 'app_name') ?? base.split('/').filter(Boolean).pop() ?? '';
    if (!/^[a-z][a-z0-9_]*$/.test(name)) { issues.push({ code: 'INVALID_NAMESPACE', severity: 'error', source: path, message: `Invalid application namespace: ${name}` }); continue; }
    const owned: string[] = [], reports: string[] = [], workspaces: string[] = [], actions: string[] = [];
    for (const file of paths.filter(p => p.startsWith(base) && p.endsWith('.json'))) {
      const d = parse(files[file] ?? '');
      if (!object(d)) continue;
      if (d['doctype'] === 'DocType' && typeof d['name'] === 'string') {
        owned.push(d['name']);
        if (!Array.isArray(d['fields'])) issues.push({ code: 'INVALID_SCHEMA', severity: 'error', source: file, message: `${d['name']}: fields must be an array.` });
      }
      if (d['doctype'] === 'Report' && typeof d['name'] === 'string') reports.push(d['name']);
      if (d['doctype'] === 'Workspace' && typeof d['name'] === 'string') workspaces.push(d['name']);
    }
    for (const file of paths.filter(p => p.startsWith(base) && p.endsWith('.js'))) {
      for (const match of (files[file] ?? '').matchAll(/add_custom_button\(\s*(?:__\(\s*)?["']([^"']+)["']/g)) actions.push(`${file}#${match[1]}`);
    }
    const deps = [...new Set(stringList(body, 'required_apps').flatMap(d => d.split('/')))].map(d => ({ name: d, constraint: null, optional: false }));
    if (name !== 'frappe' && !deps.some(d => d.name === 'frappe')) deps.unshift({ name: 'frappe', constraint: null, optional: false });
    const application: SourceApplication = { name, namespace: name, version: literal(files[base + '__init__.py'] ?? '', '__version__') ?? null,
      host_app: options.host_app ?? null, optional: true, dependencies: deps, commit: null, commit_status: 'UNKNOWN',
      recorded_ref: path.split('/')[0]?.endsWith('-develop') ? 'develop' : 'UNKNOWN', release_status: 'UNPINNED_SNAPSHOT',
      owned_doctypes: [...new Set(owned)].sort(), reports: [...new Set(reports)].sort(), workspaces: [...new Set(workspaces)].sort(),
      actions: actions.sort(), frontend_routes: paths.filter(p => p.startsWith(base) && /\/(www|templates\/pages)\//.test(p)).sort(),
      execution: 'METADATA_ONLY', provenance_references: [path, ...paths.filter(p => p.startsWith(base) && /(__init__\.py|modules\.txt)$/.test(p))] };
    issues.push(...ownershipIssues({ name, source_application: application, doctypes: owned.map(n => ({ name: n, fields: [], permissions: [] })) }, options.native ?? []));
    for (const dep of deps) if (options.applications && !options.applications.some(a => a.name === dep.name)) issues.push({ code: 'MISSING_DEPENDENCY', severity: 'error', message: `${name}: required source application ${dep.name} is unavailable.` });
    if (applications.some(a => a.namespace === name)) issues.push({ code: 'DUPLICATE_NAMESPACE', severity: 'error', message: `Duplicate source namespace: ${name}` });
    applications.push(application);
  }
  // Cross-package duplicate ownership is also rejected, even without a native catalog.
  const owners = new Map<string, string>();
  for (const app of applications) for (const dt of app.owned_doctypes ?? []) {
    const previous = owners.get(dt);
    if (previous && previous !== app.name) issues.push({ code: 'DUPLICATE_OWNERSHIP', severity: 'error', message: `${dt} belongs to both ${previous} and ${app.name}.` });
    owners.set(dt, app.name);
  }
  return { applications, issues, references, installable: false };
}