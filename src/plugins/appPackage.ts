/**
 * P7 — export-side mapping of the DIGIT-only manifest extensions (actions, settings, department sections, frontend) to an
 * installable Frappe app CANDIDATE. Everything emitted here is source text for review and staging:
 *  - server actions → whitelisted Python stubs in <app>/<app>/api.py that refuse to run until implemented
 *  - virtual actions → candidate `frappe.ui.form.on` buttons (owned DocTypes) or Client Script fixtures (native DocTypes)
 *  - frontend → plugin-owned sources copied from src/plugins/<name>/frontend/ plus a build/integration description
 *  - digit/integration.json → machine-readable record of every mapping and its verification status (always NOT_RUN here)
 * Nothing in this module builds assets, installs an app or proves Frappe runtime behaviour.
 */
import type { PluginAction, PluginManifest } from "./types";

/** Plugin-owned frontend sources, keyed "<plugin folder>/frontend/<path>". Raw text only; never imported or executed. */
const RAW = import.meta.glob("./*/frontend/**/*.{ts,tsx,js,jsx,vue,css,html,json,md}", { query: "?raw", import: "default", eager: true }) as Record<string, string>;

export const INTEGRATION_SCHEMA_VERSION = 1;
const snake = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
const py = (s: string) => JSON.stringify(s);
const safeRel = (p: string) => !p.startsWith("/") && !p.includes("\\") && !p.split("/").some((x) => x === ".." || x === ".git" || x === "");

/** Frontend source files of a plugin, relative to its frontend/ folder. `folder` defaults to the manifest name, `_template` for the template. */
export function pluginFrontendSources(p: PluginManifest, raw: Record<string, string> = RAW): Record<string, string> {
  const folders = new Set([p.name, p.source_application?.provenance_references?.[0]?.match(/^src\/plugins\/([^/]+)\//)?.[1]].filter(Boolean) as string[]);
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) {
    const m = k.match(/^\.\/([^/]+)\/frontend\/(.+)$/);
    if (m && folders.has(m[1]!) && safeRel(m[2]!)) out[m[2]!] = v;
  }
  return out;
}

export type ActionDestination = "SERVER_STUB_API_PY" | "DOCTYPE_JS_CANDIDATE" | "CLIENT_SCRIPT_FIXTURE_CANDIDATE" | "NOT_EXPORTED";
export function actionDestination(p: PluginManifest, a: PluginAction): ActionDestination {
  if (a.kind === "server") return "SERVER_STUB_API_PY";
  if (!a.effect || a.effect.type === "route" || a.effect.type === "call") return "NOT_EXPORTED";
  return (p.doctypes ?? []).some((d) => d.name === a.doctype) ? "DOCTYPE_JS_CANDIDATE" : "CLIENT_SCRIPT_FIXTURE_CANDIDATE";
}

/** Candidate JS for the declarative virtual actions of one DocType (expr.ts expressions are JS-compatible for literals/doc fields). */
export function actionsJs(p: PluginManifest, dt: string): string {
  const acts = (p.actions ?? []).filter((a) => a.doctype === dt && a.kind === "virtual" && a.effect && ["set_value", "message", "create"].includes(a.effect.type));
  const server = (p.actions ?? []).filter((a) => a.doctype === dt && a.kind === "server");
  if (!acts.length && !server.length) return "";
  const lines: string[] = [];
  for (const a of acts) {
    const cond = [a.required_docstatus !== undefined ? `doc.docstatus === ${a.required_docstatus}` : "", a.condition ? `(${a.condition})` : ""].filter(Boolean).join(" && ") || "true";
    const e = a.effect!;
    const body = e.type === "set_value"
      ? Object.entries(e.values).map(([k, x]) => `\t\t\t\tfrm.set_value(${py(k)}, (${x}));`).join("\n") + "\n\t\t\t\tfrm.save();"
      : e.type === "message" ? `\t\t\t\tfrappe.msgprint(__(${py(e.text)}));`
      : e.type === "create" ? `\t\t\t\tfrappe.new_doc(${py(e.doctype)}, { ${Object.entries(e.map).map(([k, x]) => `${k}: (${x})`).join(", ")} });` : "";
    lines.push(`\t\tif (${cond}) {\n\t\t\tfrm.add_custom_button(__(${py(a.label)}), () => {\n\t\t\t\tconst doc = frm.doc;\n${body}\n\t\t\t});\n\t\t}`);
  }
  for (const a of server) {
    const cond = [a.required_docstatus !== undefined ? `doc.docstatus === ${a.required_docstatus}` : "", a.condition ? `(${a.condition})` : ""].filter(Boolean).join(" && ") || "true";
    lines.push(`\t\tif (${cond}) {\n\t\t\tfrm.add_custom_button(__(${py(a.label)}), () => frappe.call({ method: ${py(`${p.name}.api.${snake(a.server_method ?? a.name)}`)}, args: { doctype: frm.doctype, name: frm.doc.name } }).then(() => frm.reload_doc()));\n\t\t}`);
  }
  return `// CANDIDATE generated from the DIGIT manifest actions of ${p.name}; review and stage-test before production.\nfrappe.ui.form.on(${py(dt)}, {\n\trefresh(frm) {\n\t\tconst doc = frm.doc;\n\t\tif (frm.is_new()) return;\n${lines.join("\n")}\n\t},\n});\n`;
}

function apiPy(p: PluginManifest): string {
  const server = (p.actions ?? []).filter((a) => a.kind === "server");
  if (!server.length) return "";
  const fns = server.map((a) => `@frappe.whitelist()\ndef ${snake(a.server_method ?? a.name)}(doctype, name):\n\t"""DIGIT action ${py(a.label)} on ${a.doctype}. SERVER_IMPLEMENTATION_REQUIRED: implement, permission-check and stage-test."""\n\tdoc = frappe.get_doc(doctype, name)\n\tdoc.check_permission(${py(a.permission === "submit" || a.permission === "cancel" ? a.permission : "write")})\n\tfrappe.throw(_("{0} is not implemented on this site yet").format(${py(a.label)}))\n`).join("\n\n");
  return `# Copyright (c) 2026, ${p.publisher} and contributors\n# For license information, please see license.txt\n# Server actions declared in the DIGIT manifest. These stubs refuse to run until implemented.\n\nimport frappe\nfrom frappe import _\n\n\n${fns}`;
}

export interface IntegrationResult { files: Record<string, string>; hooks: string; clientScripts: { name: string; dt: string; script: string }[]; manifest: Record<string, unknown> }

/** Extra export files + hooks lines for the DIGIT extensions of a manifest. `sources` overrides discovered frontend sources (tests). */
export function appIntegration(p: PluginManifest, sources: Record<string, string> = pluginFrontendSources(p)): IntegrationResult {
  const app = p.name, R = `${app}/`, P = `${app}/${app}/`, mod = snake(p.module), M = `${P}${mod}/`;
  const files: Record<string, string> = {}; const hooks: string[] = []; const clientScripts: IntegrationResult["clientScripts"] = [];
  const api = apiPy(p); if (api) files[`${P}api.py`] = api;
  const nativeDts = [...new Set((p.actions ?? []).filter((a) => actionDestination(p, a) === "CLIENT_SCRIPT_FIXTURE_CANDIDATE" || (a.kind === "server" && !(p.doctypes ?? []).some((d) => d.name === a.doctype))).map((a) => a.doctype))];
  for (const dt of nativeDts) { const js = actionsJs(p, dt); if (js) clientScripts.push({ name: `${p.title} ${dt} Actions`, dt, script: js }); }

  const fe = p.frontend && p.frontend.strategy !== "none" ? p.frontend : undefined;
  const feFiles = Object.keys(sources).sort();
  if (fe) {
    const route = snake(fe.route ?? app) || app;
    for (const [rel, body] of Object.entries(sources)) files[`${R}frontend/${rel}`] = body;
    files[`${R}frontend/package.json`] = JSON.stringify({ name: `${app}-frontend`, private: true, version: p.version, type: "module",
      scripts: { build: fe.build_command ?? "vite build" }, dependencies: fe.dependencies ?? {} }, null, 2) + "\n";
    files[`${R}frontend/BUILD.md`] = `# ${p.title} frontend (candidate)\n\nFramework: ${fe.framework}. Strategy: ${fe.strategy}. Entry: ${fe.entry ?? "(not declared)"}.\n\nBuild with \`${fe.build_command ?? "vite build"}\` into \`${fe.output_dir ?? `${app}/public/frontend`}\`, then \`bench build --app ${app}\`.\nThe virtual Core does not run this build; asset paths, routing and authentication must be verified on an authorized staging site.\n`;
    if (fe.strategy === "www_spa") {
      files[`${P}www/${route}.html`] = `{% extends "templates/web.html" %}\n{% block page_content %}\n<div id="app"></div>\n<!-- CANDIDATE: replace with the built entry from ${fe.output_dir ?? `public/frontend`} -->\n<script type="module" src="/assets/${app}/frontend/index.js"></script>\n{% endblock %}\n`;
      files[`${P}www/__init__.py`] = "";
      hooks.push(`# DIGIT frontend (candidate): single-page app served from /${route}\nwebsite_route_rules = [{"from_route": "/${route}/<path:app_path>", "to_route": "${route}"}]`);
    } else if (fe.strategy === "desk_page") {
      const s = route;
      files[`${M}page/${s}/__init__.py`] = "";
      files[`${M}page/${s}/${s}.json`] = JSON.stringify({ doctype: "Page", name: s, page_name: s, title: p.title, module: p.module, standard: "Yes", roles: (p.roles ?? []).map((role) => ({ role })) }, null, 1) + "\n";
      files[`${M}page/${s}/${s}.js`] = `// CANDIDATE Desk page shell for ${p.title}; mounts the built frontend bundle.\nfrappe.pages[${py(s)}].on_page_load = function (wrapper) {\n\tfrappe.ui.make_app_page({ parent: wrapper, title: __(${py(p.title)}), single_column: true });\n\tfrappe.require("/assets/${app}/frontend/index.js");\n};\n`;
    }
  }
  const manifest = {
    schema_version: INTEGRATION_SCHEMA_VERSION, app, version: p.version, host_app: p.host_app, required_apps: p.required_apps, compatibility: p.compatibility ?? {},
    source_application: p.source_application ?? null,
    actions: (p.actions ?? []).map((a) => ({ ...a, destination: actionDestination(p, a), verification: "NOT_RUN" })),
    settings: (p.settings ?? []).map((s) => ({ ...s, exported_as: (p.doctypes ?? []).some((d) => d.name === s.doctype && d.issingle) ? "Single DocType" : "MISSING_SINGLE_DOCTYPE" })),
    department_sections: (p.department_sections ?? []).map((d) => ({ ...d, exported_as: "DIGIT_ONLY (no Frappe equivalent; add Workspace links on staging if needed)" })),
    frontend: fe ? { ...fe, files: feFiles, status: feFiles.length ? "CANDIDATE_SOURCES_ONLY" : "DECLARED_WITHOUT_SOURCES", build: "NOT_RUN", staging: "NOT_RUN" } : null,
    server_required: (p.actions ?? []).filter((a) => a.kind === "server").map((a) => `${app}.api.${snake(a.server_method ?? a.name)}`),
    verification: { virtual_core: "see repository tests", frappe_staging: "NOT_RUN" },
  };
  files[`${R}digit/integration.json`] = JSON.stringify(manifest, null, 1) + "\n";
  files[`${R}digit/INTEGRATION.md`] = `# DIGIT integration record — ${p.title}\n\nGenerated by the DIGIT Virtual Core exporter. Candidate, not production verification.\n\n| Area | Count | Destination |\n|---|---|---|\n| Actions | ${(p.actions ?? []).length} | api.py stubs / DocType JS / Client Script fixtures |\n| Settings | ${(p.settings ?? []).length} | Single DocTypes |\n| Department sections | ${(p.department_sections ?? []).length} | DIGIT only |\n| Frontend files | ${feFiles.length} | ${fe ? `frontend/ (${fe.strategy})` : "none"} |\n\nFrappe staging tests: NOT_RUN.\n`;
  return { files, hooks: hooks.join("\n"), clientScripts, manifest };
}

/** Reads a previously exported integration record back into manifest fields (round trip). */
export function integrationFromFiles(files: Record<string, string>, app: string): Partial<PluginManifest> {
  const k = Object.keys(files).find((x) => x === `${app}/digit/integration.json` || x.endsWith(`/${app}/digit/integration.json`) || x === "digit/integration.json");
  if (!k) return {};
  let j: Record<string, unknown>; try { j = JSON.parse(files[k]!); } catch { return {}; }
  if (j["schema_version"] !== INTEGRATION_SCHEMA_VERSION || j["app"] !== app) return {};
  const strip = <T extends object>(rows: unknown, keys: string[]) => (Array.isArray(rows) ? rows : []).map((r) => Object.fromEntries(Object.entries(r as object).filter(([x]) => !keys.includes(x))) as T);
  const out: Partial<PluginManifest> = {};
  const acts = strip<PluginAction>(j["actions"], ["destination", "verification"]); if (acts.length) out.actions = acts;
  const st = strip<NonNullable<PluginManifest["settings"]>[number]>(j["settings"], ["exported_as"]); if (st.length) out.settings = st;
  const ds = strip<NonNullable<PluginManifest["department_sections"]>[number]>(j["department_sections"], ["exported_as"]); if (ds.length) out.department_sections = ds;
  const fe = j["frontend"] as Record<string, unknown> | null;
  if (fe) { const { files: _f, status: _s, build: _b, staging: _g, ...rest } = fe; out.frontend = rest as unknown as NonNullable<PluginManifest["frontend"]>; }
  if (j["compatibility"] && typeof j["compatibility"] === "object" && Object.keys(j["compatibility"] as object).length) out.compatibility = j["compatibility"] as Record<string, string>;
  return out;
}
