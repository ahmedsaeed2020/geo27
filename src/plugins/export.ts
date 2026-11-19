/**
 * "Export as Frappe app" — builds the standard bench app layout (pyproject.toml, hooks.py, modules.txt,
 * patches.txt, <module>/doctype|report|workspace|number_card|dashboard_chart, fixtures/*.json,
 * translations/ar.csv, README). Validated by scripts/validate_frappe_app.py against Frappe DocType schemas.
 */
import { zipSync, strToU8 } from "fflate";
import type { PluginManifest } from "./types";
import { actionsJs, appIntegration } from "./appPackage";
import { RECORDED_SOURCE_VERSIONS } from "./runtime";

/** Frappe range declared in pyproject: the app's own compatibility, else the recorded source major (never a stale major). */
export function frappeDependency(p: PluginManifest): string {
  if (p.compatibility?.["frappe"]) return p.compatibility["frappe"];
  const major = Number((RECORDED_SOURCE_VERSIONS["frappe"] ?? "17").split(".")[0]);
  return `>=${major}.0.0-dev,<${major + 1}.0.0`;
}

const snake = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
const camel = (s: string) => s.replace(/[^A-Za-z0-9]+/g, " ").split(" ").filter(Boolean).map((w) => w[0]!.toUpperCase() + w.slice(1)).join("");
const TS = "2026-10-11 00:00:00.000000";
const META = { creation: TS, modified: TS, modified_by: "Administrator", owner: "Administrator", docstatus: 0 };
const J = (o: unknown) => JSON.stringify(o, null, 1) + "\n";
const py = (s: string) => JSON.stringify(s); // python-compatible double-quoted literal
const csvq = (s: string) => `"${s.replace(/"/g, '""')}"`;
function dynFilters(dt: string, f: [string, string, string, unknown][]) {
  const stat = f.filter((x) => !["This Month Start", "Today"].includes(String(x[3])));
  const dyn = f.filter((x) => ["This Month Start", "Today"].includes(String(x[3]))).map(([d, k, op, v]) => [d || dt, k, op, v === "Today" ? "frappe.datetime.get_today()" : "frappe.datetime.month_start()"]);
  return { filters_json: JSON.stringify(stat.map(([d, k, op, v]) => [d || dt, k, op, v, false])), dynamic_filters_json: dyn.length ? JSON.stringify(dyn.map((x) => [...x, false])) : "[]" };
}

export function frappeAppFiles(p: PluginManifest, opts: { frontendSources?: Record<string, string> } = {}): Record<string, string> {
  const app = p.name, mod = snake(p.module), R = `${app}/`, P = `${app}/${app}/`, M = `${P}${mod}/`;
  const f: Record<string, string> = {};
  f[`${R}pyproject.toml`] = `[project]\nname = "${app}"\nauthors = [\n    { name = ${py(p.publisher)}, email = ${py(p.email)} }\n]\ndescription = ${py(p.description)}\nrequires-python = ">=3.10"\nreadme = "README.md"\ndynamic = ["version"]\ndependencies = []\n\n[build-system]\nrequires = ["flit_core >=3.4,<4"]\nbuild-backend = "flit_core.buildapi"\n\n[tool.bench.frappe-dependencies]\nfrappe = ${py(frappeDependency(p))}\n${Object.entries(p.compatibility ?? {}).filter(([a]) => a !== "frappe").map(([a, c]) => `${a} = ${py(c)}\n`).join("")}`;
  f[`${R}license.txt`] = `${p.license} License\n\nCopyright (c) 2026, ${p.publisher}\n`;
  f[`${R}.gitignore`] = `.DS_Store\n*.pyc\n*.egg-info\n*.swp\ntags\nnode_modules\n__pycache__\n`;
  f[`${P}__init__.py`] = `__version__ = "${p.version}"\n`;
  f[`${P}modules.txt`] = `${p.module}\n`;
  f[`${P}patches.txt`] = `[pre_model_sync]\n# Patches added in this section will be executed before doctypes are migrated\n\n[post_model_sync]\n# Patches added in this section will be executed after doctypes are migrated\n`;
  f[`${P}config/__init__.py`] = "";
  f[`${P}public/.gitkeep`] = "";
  f[`${P}templates/__init__.py`] = ""; f[`${P}templates/pages/__init__.py`] = "";
  f[`${M}__init__.py`] = "";
  if (p.source_application) f[`${P}digit-source-provenance.md`] = `# Source application provenance\n\nMetadata, not production verification.\n\n\`\`\`json\n${JSON.stringify(p.source_application, null, 2)}\n\`\`\`\n`;
  for (const [path, body] of Object.entries(p.source_references ?? {})) {
    if (path.startsWith('/') || path.includes('\\') || path.split('/').some(part => ['..', '.git'].includes(part))) continue;
    f[`${R}source-references/${path}.txt`] = body;
  }

  const integ = appIntegration(p, opts.frontendSources);
  Object.assign(f, integ.files);
  const fixtureNames: Record<string, string[]> = {};
  const addFx = (dt: string, rows: Record<string, unknown>[]) => { if (!rows.length) return; f[`${P}fixtures/${snake(dt)}.json`] = J(rows); fixtureNames[dt] = rows.map((r) => String(r["name"])); };

  for (const d of p.doctypes ?? []) {
    const s = snake(d.name), dir = `${M}doctype/${s}/`;
    const fields = d.fields.map((x) => ({ ...x }));
    f[`${dir}__init__.py`] = "";
    f[`${dir}${s}.json`] = J({
      actions: [], allow_rename: 1, autoname: d.autoname ?? "hash", creation: TS, doctype: "DocType", engine: "InnoDB",
      field_order: fields.map((x) => x.fieldname), fields, is_submittable: d.is_submittable ?? 0, istable: d.istable ?? 0, issingle: d.issingle ?? 0,
      links: [], modified: TS, modified_by: "Administrator", module: d.module ?? p.module, name: d.name, naming_rule: d.naming_rule ?? (d.autoname?.startsWith("format:") ? "Expression" : "Random"), owner: "Administrator",
      permissions: d.permissions, row_format: "Dynamic", sort_field: "creation", sort_order: "DESC", states: [], title_field: d.title_field, track_changes: d.track_changes ?? 1,
      ...(d.search_fields ? { search_fields: d.search_fields } : {}),
    });
    f[`${dir}${s}.py`] = d.controller ?? `# Copyright (c) 2026, ${p.publisher} and contributors\n# For license information, please see license.txt\n\n# import frappe\nfrom frappe.model.document import Document\n\n\nclass ${d.name.replace(/ /g, "").replace(/-/g, "")}(Document):\n\tpass\n`;
    f[`${dir}${s}.js`] = d.client_source ?? (actionsJs(p, d.name) || `// Copyright (c) 2026, ${p.publisher} and contributors\n// For license information, please see license.txt\n\n// frappe.ui.form.on(${py(d.name)}, {\n// \trefresh(frm) {\n// \t},\n// });\n`);
    f[`${dir}test_${s}.py`] = `# Copyright (c) 2026, ${p.publisher} and Contributors\n# See license.txt\n\nfrom frappe.tests import UnitTestCase\n\n\nclass UnitTest${camel(d.name)}(UnitTestCase):\n\tpass\n`;
  }
  for (const r of p.reports ?? []) {
    const s = snake(r.name), dir = `${M}report/${s}/`;
    f[`${dir}__init__.py`] = "";
    f[`${dir}${s}.json`] = J({ ...META, add_total_row: 0, columns: [], disabled: 0, doctype: "Report", filters: [], is_standard: "Yes", module: p.module, name: r.name, prepared_report: 0, ref_doctype: r.ref_doctype, report_name: r.name, report_type: r.report_type, roles: [...new Set([...(p.roles ?? []), "Accounts User", "Sales Manager"])].map((role) => ({ role })), ...(r.query ? { query: r.query } : {}) });
    if (r.report_type === "Script Report") {
      f[`${dir}${s}.py`] = `# Copyright (c) 2026, ${p.publisher} and contributors\n# For license information, please see license.txt\n\nimport frappe\nfrom frappe import _\n\n\n${r.script ?? "def execute(filters=None):\n    return [], []\n"}`;
      f[`${dir}${s}.js`] = `// Copyright (c) 2026, ${p.publisher} and contributors\n// For license information, please see license.txt\n\nfrappe.query_reports[${py(r.name)}] = {\n\tfilters: ${JSON.stringify(r.filters ?? [], null, 1).replace(/\n/g, "\n\t")},\n};\n`;
    }
  }
  for (const c of p.number_cards ?? []) {
    const s = snake(c.name);
    f[`${M}number_card/${s}/${s}.json`] = J({ ...META, aggregate_function_based_on: c.aggregate_function_based_on ?? "", color: c.color ?? "#2490EF", doctype: "Number Card", document_type: c.document_type, ...dynFilters(c.document_type, c.filters), function: c.function, is_public: 1, is_standard: 1, label: c.label, module: p.module, name: c.name, show_percentage_stats: 1, stats_time_interval: "Daily", type: "Document Type" });
  }
  for (const c of p.dashboard_charts ?? []) {
    const s = snake(c.name);
    f[`${M}dashboard_chart/${s}/${s}.json`] = J({ ...META, aggregate_function_based_on: c.value_based_on ?? "", chart_name: c.chart_name, chart_type: c.chart_type, doctype: "Dashboard Chart", document_type: c.document_type, ...dynFilters(c.document_type, c.filters), group_by_based_on: c.group_by_based_on ?? "", group_by_type: c.value_based_on ? "Sum" : "Count", is_public: 1, is_standard: 1, module: p.module, name: c.name, number_of_groups: c.limit ?? 0, timeseries: 0, type: c.type, use_report_chart: 0, y_axis: [] });
  }
  for (const w of p.workspaces ?? []) {
    const s = snake(w.name); let i = 0; const id = () => `dsc${(++i).toString(36).padStart(7, "0")}`;
    const content = [
      { id: id(), type: "header", data: { text: `<span class="h4"><b>${w.label}</b></span>`, col: 12 } },
      ...w.number_cards.map((n) => ({ id: id(), type: "number_card", data: { number_card_name: n, col: 4 } })),
      ...w.charts.map((n) => ({ id: id(), type: "chart", data: { chart_name: (p.dashboard_charts ?? []).find((c) => c.name === n)?.chart_name ? n : n, col: 12 } })),
      ...w.shortcuts.map((x) => ({ id: id(), type: "shortcut", data: { shortcut_name: x.label, col: 3 } })),
    ];
    f[`${M}workspace/${s}/${s}.json`] = J({ ...META, charts: w.charts.map((n) => ({ chart_name: n, label: (p.dashboard_charts ?? []).find((c) => c.name === n)?.chart_name ?? n })), content: JSON.stringify(content), custom_blocks: [], doctype: "Workspace", for_user: "", hide_custom: 0, icon: "sell", indicator_color: "", is_hidden: 0, label: w.label, links: [], module: p.module, name: w.name, number_cards: w.number_cards.map((n) => ({ label: (p.number_cards ?? []).find((c) => c.name === n)?.label ?? n, number_card_name: n })), parent_page: "", public: 1, quick_lists: [], roles: [], sequence_id: 50, shortcuts: w.shortcuts.map((x) => ({ color: "Grey", doc_view: x.doc_view ?? (x.type === "DocType" ? "List" : ""), label: x.label, link_to: x.link_to, type: x.type })), title: w.label });
  }

  addFx("Custom Field", (p.custom_fields ?? []).map((c) => ({ ...META, doctype: "Custom Field", name: `${c.dt}-${c.fieldname}`, module: p.module, is_system_generated: 0, allow_on_submit: 0, bold: 0, collapsible: 0, columns: 0, hidden: 0, in_list_view: 0, in_standard_filter: 0, print_hide: 0, read_only: 0, reqd: 0, unique: 0, ...c, label: c.label })));
  addFx("Property Setter", (p.property_setters ?? []).map((x) => ({ ...META, doctype: "Property Setter", name: `${x.doc_type}-${x.field_name ?? "main"}-${x.property}`, module: p.module, is_system_generated: 0, row_name: null, ...x })));
  addFx("Client Script", [...(p.client_scripts ?? []).map((c) => ({ ...META, doctype: "Client Script", name: c.name, dt: c.dt, view: c.view, enabled: c.enabled ?? 1, module: p.module, script: c.script })),
    ...integ.clientScripts.map((c) => ({ ...META, doctype: "Client Script", name: c.name, dt: c.dt, view: "Form", enabled: 0, module: p.module, script: c.script }))]);
  addFx("Server Script", (p.server_scripts ?? []).map((s) => ({ ...META, doctype: "Server Script", name: s.name, script_type: s.script_type, module: p.module, disabled: s.enabled === 0 ? 1 : 0, allow_guest: s.allow_guest ?? 0, script: s.script, ...(s.script_type === "API" ? { api_method: s.api_method } : { reference_doctype: s.reference_doctype, doctype_event: s.doctype_event }) })));
  addFx("Print Format", (p.print_formats ?? []).map((x) => ({ ...META, doctype: "Print Format", name: x.name, doc_type: x.doc_type, module: p.module, standard: "No", custom_format: 1, disabled: 0, print_format_type: x.print_format_type ?? "Jinja", print_format_builder: 0, print_format_builder_beta: 0, raw_printing: 0, html: x.html, css: x.css ?? "", font_size: 14, margin_top: 15, margin_bottom: 15, margin_left: 15, margin_right: 15, page_number: "Hide", align_labels_right: 0, line_breaks: 0, show_section_headings: 0, absolute_value: 0 })));
  addFx("Notification", (p.notifications ?? []).map((n) => ({ ...META, doctype: "Notification", name: n.name, document_type: n.document_type, event: n.event, ...(n.value_changed ? { value_changed: n.value_changed } : {}), ...(n.date_changed ? { date_changed: n.date_changed, days_in_advance: n.days_in_advance ?? 0 } : {}), subject: n.subject.replace(/\{(\w+)\}/g, "{{ doc.$1 }}"), message: n.message.replace(/\{(\w+)\}/g, "{{ doc.$1 }}"), condition: n.condition ? n.condition.replace(/doc\.(\w+)\s*==\s*/g, "doc.$1 == ").replace(/\s*&&\s*/g, " and ").replace(/\s*\|\|\s*/g, " or ") : "", channel: n.channel ?? "System Notification", enabled: 1, is_standard: 0, module: p.module, send_system_notification: 0, recipients: n.recipients.map((r) => ({ ...r })), message_type: "Markdown" })));
  addFx("Workflow", (p.workflows ?? []).map((w) => ({ ...META, doctype: "Workflow", workflow_name: w.name, name: w.name, document_type: w.document_type, workflow_state_field: w.workflow_state_field, is_active: w.is_active ?? 1, send_email_alert: 0, override_status: 0, states: w.states, transitions: w.transitions })));
  addFx("Role", (p.roles ?? []).map((r) => ({ ...META, doctype: "Role", name: r, role_name: r, desk_access: 1, disabled: 0, is_custom: 0, two_factor_auth: 0 })));

  const fx = Object.entries(fixtureNames).map(([dt, names]) => ["Custom Field", "Property Setter", "Client Script", "Server Script"].includes(dt)
    ? `\t{"dt": ${py(dt)}, "filters": [["module", "=", ${py(p.module)}]]},` : `\t{"dt": ${py(dt)}, "filters": [["name", "in", ${JSON.stringify(names)}]]},`).join("\n");
  const dp = p.docperms ?? [];
  if (dp.length) f[`${P}digit_permlevels.py`] = `import frappe\nfrom frappe.permissions import add_permission, update_permission_property\n\n# Permission-level rows the app adds to other apps' DocTypes (applied after every migrate; add_permission keeps the standard rows).\nROWS = ${JSON.stringify(dp.map((x) => [x.parent, x.role, x.permlevel, x.read, x.write ?? 0]))}\n\n\ndef apply():\n\tfor parent, role, level, read, write in ROWS:\n\t\tif not frappe.db.exists("DocType", parent):\n\t\t\tcontinue\n\t\tadd_permission(parent, role, level)\n\t\tupdate_permission_property(parent, role, level, "read", read)\n\t\tupdate_permission_property(parent, role, level, "write", write)\n`;
  f[`${P}hooks.py`] = `app_name = ${py(app)}\napp_title = ${py(p.title)}\napp_publisher = ${py(p.publisher)}\napp_description = ${py(p.description)}\napp_email = ${py(p.email)}\napp_license = ${py(p.license.toLowerCase())}\n\nrequired_apps = ${JSON.stringify(p.required_apps.filter((a) => a !== "frappe"))}\n\n# Fixtures exported from the Digit Virtual Core plugin manifest\nfixtures = [\n${fx}\n]\n${dp.length ? `\nafter_migrate = [${py(`${app}.digit_permlevels.apply`)}]\n` : ""}${integ.hooks ? `\n${integ.hooks}\n` : ""}`;
  const tr = Object.entries(p.translations ?? {});
  f[`${P}translations/ar.csv`] = tr.map(([en, ar]) => `${csvq(en)},${csvq(ar)}`).join("\n") + "\n";
  f[`${R}README.md`] = `# ${p.title}${p.title_ar ? ` — ${p.title_ar}` : ""}\n\n${p.description}\n\n${p.description_ar ?? ""}\n\nExported from Digit Virtual Core (plugin \`${app}\` v${p.version}).\n\n## Install (Frappe bench, ${frappeDependency(p)})\n\n\`\`\`bash\ncd ~/frappe-bench\nbench get-app /path/to/${app}        # or a git URL\nbench --site <site> install-app ${app}\nbench --site <site> migrate\n${(p.server_scripts ?? []).length ? `# Server Scripts are disabled by default in Frappe:\nbench set-config -g server_script_enabled 1\n` : ""}bench build --app ${app}\nbench restart\n\`\`\`\n\nRequires: ${p.required_apps.join(", ")}.\n\n## Contents\n\n${[["DocTypes", p.doctypes?.length], ["Custom Fields", p.custom_fields?.length], ["Property Setters", p.property_setters?.length], ["Client Scripts", p.client_scripts?.length], ["Server Scripts", p.server_scripts?.length], ["Workspaces", p.workspaces?.length], ["Number Cards", p.number_cards?.length], ["Dashboard Charts", p.dashboard_charts?.length], ["Reports", p.reports?.length], ["Print Formats", p.print_formats?.length], ["Notifications", p.notifications?.length], ["Workflows", p.workflows?.length], ["Roles", p.roles?.length]].filter(([, n]) => n).map(([k, n]) => `- ${k}: ${n}`).join("\n")}\n\n## Uninstall\n\n\`\`\`bash\nbench --site <site> uninstall-app ${app}\n\`\`\`\n`;
  return f;
}

export function frappeAppZip(p: PluginManifest): Uint8Array {
  const files = frappeAppFiles(p); const z: Record<string, Uint8Array> = {};
  for (const [k, v] of Object.entries(files)) z[k] = strToU8(v);
  return zipSync(z, { level: 6, mtime: new Date("2026-10-11T00:00:00Z") });
}
export function downloadBytes(bytes: Uint8Array, filename: string, type = "application/zip") {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type }));
  const a = document.createElement("a"); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
