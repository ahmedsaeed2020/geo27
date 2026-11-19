/** Step 2.4 — load an existing Frappe app (zip or folder) into the virtual core as a plugin manifest. */
import { unzipSync, strFromU8 } from "fflate";
import type { ClientScript, CustomField, PluginDocType, PluginManifest, PropertySetter, ServerScript, PrintFormat, PluginReport, PluginWorkspace, NumberCard, DashboardChart, Notification, Workflow } from "./types";
import { inspectSourceFiles } from './sourceInspection';
import { integrationFromFiles } from './appPackage';

type Files = Record<string, string>;
export function filesFromZip(bytes: Uint8Array): Files {
  const out: Files = {}; const z = unzipSync(bytes);
  for (const [k, v] of Object.entries(z)) if (!k.endsWith("/") && !k.split('/').some(p => ['..', '.git'].includes(p)) && !k.startsWith('/') && /\.(json|py|js|vue|ts|tsx|txt|csv|toml|md)$/.test(k)) out[k] = strFromU8(v);
  return out;
}
export async function filesFromFileList(list: FileList | File[]): Promise<Files> {
  const out: Files = {};
  for (const f of Array.from(list)) {
    const p = (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name;
    if (f.name.endsWith(".zip")) Object.assign(out, filesFromZip(new Uint8Array(await f.arrayBuffer())));
    else if (/\.(json|py|js|vue|ts|tsx|txt|csv|toml|md)$/.test(p)) out[p] = await f.text();
  }
  return out;
}
const pyStr = (src: string, key: string) => src.match(new RegExp(`^${key}\\s*=\\s*["'](.*)["']`, "m"))?.[1];
function parseCsv(s: string): [string, string][] {
  const rows: [string, string][] = [];
  for (const line of s.split(/\r?\n/)) { const m = line.match(/^"((?:[^"]|"")*)","((?:[^"]|"")*)"/) ?? line.match(/^([^,]+),([^,]+)/); if (m) rows.push([m[1]!.replace(/""/g, '"'), m[2]!.replace(/""/g, '"')]); }
  return rows;
}
const parse = (s: string) => { try { return JSON.parse(s); } catch { return undefined; } };

export function manifestFromFiles(files: Files, hostApp: PluginManifest["host_app"] = "erpnext"): { manifest?: PluginManifest; errors: string[]; counts: Record<string, number> } {
  const errors: string[] = [];
  const hooksPath = Object.keys(files).find((k) => /(^|\/)hooks\.py$/.test(k));
  if (!hooksPath) return { errors: ["hooks.py not found — not a Frappe app"], counts: {} };
  const hooks = files[hooksPath] ?? ''; const base = hooksPath.replace(/hooks\.py$/, "");
  const inspection = inspectSourceFiles(files, { host_app: hostApp });
  if (inspection.applications.length !== 1 || inspection.issues.some(i => i.severity === 'error')) return { errors: inspection.issues.map(i => i.message).concat(inspection.applications.length !== 1 ? ['Import one source application at a time.'] : []), counts: {} };
  const app = pyStr(hooks, "app_name") ?? base.split("/").filter(Boolean).pop() ?? "imported_app";
  const modules = (files[`${base}modules.txt`] ?? "").split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  const m: PluginManifest = {
    name: app, title: pyStr(hooks, "app_title") ?? app, version: (files[`${base}__init__.py`] ?? "").match(/__version__\s*=\s*["'](.+)["']/)?.[1] ?? "0.0.1",
    publisher: pyStr(hooks, "app_publisher") ?? "", email: pyStr(hooks, "app_email") ?? "", license: pyStr(hooks, "app_license") ?? "MIT",
    description: pyStr(hooks, "app_description") ?? "", host_app: hostApp, module: modules[0] ?? app, required_apps: ["frappe"],
    doctypes: [], custom_fields: [], property_setters: [], client_scripts: [], server_scripts: [], reports: [], print_formats: [], workspaces: [], number_cards: [], dashboard_charts: [], notifications: [], workflows: [], roles: [], translations: {}, fixtures: [],
  };
  const sourceApplication = inspection.applications[0];
  if (sourceApplication) m.source_application = sourceApplication;
  m.required_apps = m.source_application?.dependencies.filter(d => !d.optional).map(d => d.name) ?? ['frappe'];
  m.source_references = inspection.references;
  const provenance = files[`${base}digit-source-provenance.md`]?.match(/```json\n([\s\S]*?)\n```/)?.[1];
  if (provenance) { const saved = parse(provenance); if (saved?.name === app && saved?.namespace === app) m.source_application = saved; }
  for (const [k, v] of Object.entries(files)) {
    if (!k.startsWith(base)) continue;
    const rel = k.slice(base.length);
    let mm = rel.match(/^[^/]+\/doctype\/([^/]+)\/\1\.json$/);
    if (mm) { const d = parse(v); if (d?.doctype === "DocType") m.doctypes!.push({ name: d.name, module: d.module, istable: d.istable ?? 0, issingle: d.issingle ?? 0, is_submittable: d.is_submittable ?? 0, is_tree: d.is_tree ?? 0, autoname: d.autoname, title_field: d.title_field, fields: d.fields ?? [], permissions: d.permissions ?? [], controller: files[k.replace(/\.json$/, ".py")], client_source: files[k.replace(/\.json$/, '.js')] } as PluginDocType); else errors.push(`${rel}: not a DocType JSON`); continue; }
    mm = rel.match(/^[^/]+\/report\/([^/]+)\/\1\.json$/);
    if (mm) { const r = parse(v); if (r?.doctype === "Report") m.reports!.push({ name: r.name, ref_doctype: r.ref_doctype, report_type: r.report_type, columns: r.columns ?? [], query: r.query, script: files[k.replace(/\.json$/, ".py")] } as PluginReport); continue; }
    mm = rel.match(/^[^/]+\/workspace\/([^/]+)\/\1\.json$/);
    if (mm) { const w = parse(v); if (w) m.workspaces!.push({ name: w.name, label: w.label ?? w.name, number_cards: (w.number_cards ?? []).map((x: { number_card_name: string }) => x.number_card_name), charts: (w.charts ?? []).map((x: { chart_name: string }) => x.chart_name), shortcuts: w.shortcuts ?? [] } as PluginWorkspace); continue; }
    mm = rel.match(/^[^/]+\/number_card\/([^/]+)\/\1\.json$/);
    if (mm) { const c = parse(v); if (c) m.number_cards!.push({ name: c.name, label: c.label, document_type: c.document_type, function: c.function, aggregate_function_based_on: c.aggregate_function_based_on, filters: (parse(c.filters_json || "[]") ?? []).map((x: unknown[]) => x.slice(0, 4)) } as NumberCard); continue; }
    mm = rel.match(/^[^/]+\/dashboard_chart\/([^/]+)\/\1\.json$/);
    if (mm) { const c = parse(v); if (c) m.dashboard_charts!.push({ name: c.name, chart_name: c.chart_name, chart_type: c.chart_type, document_type: c.document_type, group_by_based_on: c.group_by_based_on, value_based_on: c.aggregate_function_based_on, type: c.type, filters: (parse(c.filters_json || "[]") ?? []).map((x: unknown[]) => x.slice(0, 4)), limit: c.number_of_groups } as DashboardChart); continue; }
    mm = rel.match(/^fixtures\/([^/]+)\.json$/);
    if (mm) {
      const rows = parse(v); if (!Array.isArray(rows)) { errors.push(`${rel}: not a JSON list`); continue; }
      const dt = rows[0]?.doctype as string | undefined;
      for (const r of rows) {
        if (dt === "Custom Field") m.custom_fields!.push(r as CustomField);
        else if (dt === "Property Setter") m.property_setters!.push(r as PropertySetter);
        // client scripts generated from manifest actions are regenerated from digit/integration.json, not imported twice
        else if (dt === "Client Script" && String(r.script ?? "").startsWith("// CANDIDATE generated from the DIGIT manifest actions")) continue;
        else if (dt === "Client Script") m.client_scripts!.push({ name: r.name, dt: r.dt, view: r.view ?? "Form", enabled: r.enabled, script: r.script ?? "", buttons: [...String(r.script ?? "").matchAll(/add_custom_button\(\s*__\(\s*["'](.+?)["']\s*\)/g)].map((x) => ({ label: x[1]!, action: { type: "message" as const, text: `Client Script "${r.name}" button — script body runs on Frappe; imported for review` } })) } as ClientScript);
        else if (dt === "Server Script") m.server_scripts!.push({ name: r.name, script_type: r.script_type, reference_doctype: r.reference_doctype, doctype_event: r.doctype_event, api_method: r.api_method, enabled: r.disabled ? 0 : 1, script: r.script ?? "" } as ServerScript);
        else if (dt === "Print Format") m.print_formats!.push({ name: r.name, doc_type: r.doc_type, html: r.html ?? "", css: r.css } as PrintFormat);
        else if (dt === "Notification") m.notifications!.push({ name: r.name, document_type: r.document_type, event: r.event, subject: String(r.subject ?? "").replace(/\{\{\s*doc\.(\w+)\s*\}\}/g, "{$1}"), message: String(r.message ?? "").replace(/\{\{\s*doc\.(\w+)\s*\}\}/g, "{$1}"), recipients: r.recipients ?? [] } as Notification);
        else if (dt === "Workflow") m.workflows!.push(r as Workflow);
        else if (dt === "Role") m.roles!.push(r.role_name ?? r.name);
        else if (dt) m.fixtures!.push({ doctype: dt, name: r.name, data: r });
      }
      continue;
    }
    if (/^translations\/ar\.csv$/.test(rel)) for (const [en, ar] of parseCsv(v)) m.translations![en] = ar;
  }
  Object.assign(m, integrationFromFiles(files, app));
  const counts: Record<string, number> = {};
  for (const [k, v] of Object.entries(m)) if (Array.isArray(v)) counts[k] = v.length; else if (k === "translations") counts[k] = Object.keys(v as object).length;
  return { manifest: m, errors, counts };
}
