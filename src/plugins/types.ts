/**
 * Digit Plugin SDK — manifest shape. Every key maps 1:1 to a Frappe artefact so a plugin
 * exports to a standard Frappe app (see src/plugins/export.ts). Behaviour is declarative and runs
 * through the controlled expression interpreter (src/lib/expr.ts); `script` strings are the code
 * written into the exported app and are never executed in the browser.
 */
import type { AppId, DocField } from "@/lib/catalog";
import type { SourceApplication } from "@/lib/sourceTypes";

export interface PluginDocType {
  name: string; module?: string; istable?: number; issingle?: number; is_submittable?: number; is_tree?: number;
  autoname?: string; title_field?: string; search_fields?: string; naming_rule?: string; track_changes?: number;
  fields: DocField[]; permissions: { role: string; read?: number; write?: number; create?: number; delete?: number; submit?: number; cancel?: number; report?: number; export?: number; print?: number; email?: number; share?: number; if_owner?: number }[];
  /** controller code written to <name>.py on export */
  controller?: string;
  /** Original client source retained for review/export, never browser execution. */
  client_source?: string;
  /** Frappe DocType `links` (Connections): reverse links to documents that point at this one. */
  links?: { link_doctype: string; link_fieldname: string; group?: string }[];
}
export interface CustomField {
  dt: string; fieldname: string; label: string; fieldtype: string; options?: string; insert_after: string;
  reqd?: number; in_list_view?: number; in_standard_filter?: number; default?: string; description?: string; read_only?: number; hidden?: number; depends_on?: string;
}
/** Extra permission-level row an app adds to a native DocType (frappe.permissions.add_permission): overlay appends it to a copy of the meta, the export applies it after migrate. */
export interface PluginDocPerm { parent: string; role: string; permlevel: number; read: 0 | 1; write?: 0 | 1;
  /** optional DocPerm flags of a level-0 app role row (frappe.permissions.add_permission + update_permission_property) */
  create?: 0 | 1; delete?: 0 | 1; submit?: 0 | 1; cancel?: 0 | 1; amend?: 0 | 1; report?: 0 | 1; print?: 0 | 1; export?: 0 | 1; share?: 0 | 1; if_owner?: 0 | 1 }
export interface PropertySetter { doc_type: string; doctype_or_field: "DocField" | "DocType"; field_name?: string; property: string; value: string; property_type: string }
export type ClientAction =
  | { type: "set_value"; values: Record<string, string> }       // value = expression (expr.ts) or literal in quotes
  | { type: "route"; to: string }                               // "/app/erpnext/customer/{customer}"
  | { type: "create"; doctype: string; map: Record<string, string> }
  | { type: "message"; text: string; text_ar?: string }
  | { type: "call"; method: string };                           // virtual whitelisted method
export interface ClientScript {
  name: string; dt: string; view: "Form" | "List"; enabled?: number;
  buttons?: { label: string; label_ar?: string; group?: string; condition?: string; action: ClientAction }[];
  /** fieldname → assignments run when the field changes (frm.set_value) */
  on_change?: Record<string, Record<string, string>>;
  set_query?: { fieldname: string; filters: [string, string, string, unknown][] }[];
  list_indicator?: { condition: string; label: string; color: string }[];
  /** refresh(frm) declarative effects parsed from the script */
  refresh?: { df: { fieldname: string; property: string; value: string }[]; intro?: string; set: Record<string, string> };
  /** JS written to the exported Client Script */
  script: string;
}
export interface ServerScript {
  name: string; script_type: "DocType Event" | "API"; enabled?: number;
  reference_doctype?: string; doctype_event?: "Before Insert" | "Before Validate" | "Before Save" | "After Save" | "Before Submit" | "After Submit" | "Before Cancel" | "After Cancel";
  api_method?: string; allow_guest?: number;
  /** declarative virtual behaviour */
  validate?: { condition: string; message: string }[];
  set?: Record<string, string>;
  /** virtual implementation for API scripts (receives args + adapter helpers) */
  handler?: (args: Record<string, unknown>) => unknown;
  /** Python written to the exported Server Script */
  script: string;
}
export interface NumberCard { name: string; label: string; document_type: string; function: "Count" | "Sum" | "Average"; aggregate_function_based_on?: string; filters: [string, string, string, unknown][]; color?: string }
export interface DashboardChart { name: string; chart_name: string; chart_type: "Count" | "Sum" | "Group By"; document_type: string; based_on?: string; value_based_on?: string; group_by_based_on?: string; type: "Bar" | "Line" | "Pie"; filters: [string, string, string, unknown][]; limit?: number }
export interface PluginWorkspace { name: string; label: string; module?: string; number_cards: string[]; charts: string[]; shortcuts: { label: string; type: "DocType" | "Report" | "Page"; link_to: string; doc_view?: string }[]; links?: { label: string; type: "Card Break" | "Link"; link_to?: string; link_type?: string }[] }
export interface PluginReport {
  name: string; ref_doctype: string; report_type: "Query Report" | "Script Report" | "Report Builder";
  columns: { fieldname: string; label: string; fieldtype: string; options?: string; width?: number }[];
  filters?: { fieldname: string; label: string; fieldtype: string; options?: string; default?: string }[];
  query?: string; script?: string;
  /** virtual implementation; imported reports without it list ref_doctype rows */
  run?: (filters: Record<string, unknown>) => Record<string, unknown>[];
}
export interface PrintFormat { name: string; doc_type: string; html: string; css?: string; default?: number; print_format_type?: "Jinja" }
export interface Notification { name: string; document_type: string; event: "New" | "Save" | "Submit" | "Cancel" | "Value Change" | "Days Before"; /** Value Change: the field whose change fires it (frappe value_changed) */ value_changed?: string; /** Days Before: the date field and the days in advance (frappe date_changed / days_in_advance) */ date_changed?: string; days_in_advance?: number; subject: string; message: string; /** Arabic subject template (same {field} placeholders); display-only, stored on the log as subject_ar */ subject_ar?: string; condition?: string; recipients: { receiver_by_role?: string; receiver_by_document_field?: string }[]; channel?: "System Notification" | "Email" }
export interface Workflow { name: string; document_type: string; workflow_state_field: string; is_active?: number; states: { state: string; doc_status: "0" | "1" | "2"; allow_edit: string }[]; transitions: { state: string; action: string; next_state: string; allowed: string; condition?: string; /** Frappe Workflow Transition allow_self_approval (default 1) */ allow_self_approval?: number }[] }

/**
 * App action declaration (P2.1/P4). `virtual` actions run a declarative ClientAction through the shared write scope;
 * `server` actions declare a whitelisted Python method that only a real Frappe server can execute — the UI shows them
 * as server-dependent and never reports success. Exported as hooks/api stubs + Client Script buttons.
 */
export interface PluginAction {
  name: string; doctype: string; label: string; label_ar?: string; kind: "virtual" | "server";
  /** expr.ts condition over doc fields (UI eligibility) */
  condition?: string; required_docstatus?: 0 | 1 | 2; permission?: "read" | "write" | "create" | "submit" | "cancel";
  effect?: ClientAction; server_method?: string; description?: string; reversal?: string;
}
/** App settings declaration: points at a Single DocType owned by the same plugin (registered in Desk + settings registry). */
export interface PluginSettings { name: string; doctype: string; label: string; label_ar?: string; description?: string }
/** Department subsection injected into an existing department home (finance, hr, projects, crm, insights). */
export interface DepartmentSection { department: string; label: string; label_ar?: string; doctypes: string[]; reports?: string[] }
/**
 * Plugin-owned frontend declaration (P7). Files are collected from src/plugins/<name>/ at export time; the exporter emits a
 * candidate bundle + integration manifest. Frappe asset build and runtime wiring stay SERVER_OR_STAGING_REQUIRED.
 */
export interface PluginFrontend {
  framework: "react" | "vue" | "none"; strategy: "www_spa" | "desk_page" | "none"; route?: string; entry?: string;
  dependencies?: Record<string, string>; build_command?: string; output_dir?: string; routes?: { path: string; component: string }[];
}

/**
 * App-owned virtual pages: `component` is a key resolved in src/plugins/pages.ts (registered by built-in apps only); the
 * manifest stays serializable. Rendered at /plugins/<name>/<path> inside the shared Shell (src/routes/plugins.$name.$.tsx).
 */
export interface PluginPage { path: string; component: string; label: string; label_ar?: string }
/** Contextual app menu item: `to` is a plugin page path ("dept/proc") or "doctype:<DocType>" / "report:<name>". */
export interface PluginNavItem { label: string; label_ar?: string; to: string; /** frequent section in the contextual sidebar; every item stays in the module directory */ featured?: boolean }
export interface PluginNavGroup {
  key: string; label: string; label_ar?: string; items: PluginNavItem[];
  /** module rail layout: rail key this group folds into (default: its own key) */
  module?: string;
  /** module rail layout: short rail label and icon key (src/components/plugins/navIcons.tsx maps keys to official icons) */
  short?: string; short_ar?: string; icon?: string;
  /** plugin page path prefixes that belong to this module when no navigation item matches, e.g. "project/" */
  match?: string[];
  /** plugin page path of the module's full directory ("All <module>") */
  directory?: string;
}
/** App dock entry declared by the manifest. `icon` is a public path. */
export interface PluginDock { label: string; label_ar?: string; icon?: string; to?: string }
/** Semantic design tokens an app may declare (presentation only; the shared DIGIT Enterprise tokens win in the enterprise shell). */
export type ThemeToken =
  | "background" | "foreground" | "card" | "card-foreground" | "popover" | "popover-foreground"
  | "primary" | "primary-foreground" | "secondary" | "secondary-foreground" | "muted" | "muted-foreground"
  | "accent" | "accent-foreground" | "border" | "input" | "ring" | "success" | "warning" | "destructive"
  | "chart-1" | "chart-2" | "chart-3" | "chart-4" | "chart-5" | "app-nav" | "app-nav-foreground" | "app-highlight" | "radius";
/** App theme: either a scoped class + logo (Pro, HR) or declared tokens + module-rail layout (Construction); both optional. */
export interface PluginTheme {
  className?: string; logo?: string; logo_dark?: string;
  tokens?: Partial<Record<ThemeToken, string>>; full_width?: boolean; sidebar?: Partial<Record<ThemeToken, string>>; tablet_drawer?: boolean; module_rail?: boolean;
}

export interface PluginManifest {
  /** python package name (snake_case) */
  name: string; title: string; title_ar?: string; version: string; publisher: string; email: string; license: string;
  description: string; description_ar?: string;
  /** desk app slot whose /app/<app>/... routes host the plugin's DocTypes */
  host_app: AppId; module: string; required_apps: string[];
  doctypes?: PluginDocType[]; custom_fields?: CustomField[]; property_setters?: PropertySetter[]; docperms?: PluginDocPerm[];
  /** List Calendar / Gantt views of the app's own dated DocTypes (same field_map as the source <doctype>_calendar.js); merged with the frozen catalog configs on list routes */
  calendar_views?: Record<string, { field_map: { start: string; end: string; title?: string; progress?: string }; source: string }>;
  client_scripts?: ClientScript[]; server_scripts?: ServerScript[];
  workspaces?: PluginWorkspace[]; number_cards?: NumberCard[]; dashboard_charts?: DashboardChart[];
  reports?: PluginReport[]; print_formats?: PrintFormat[]; notifications?: Notification[]; workflows?: Workflow[];
  roles?: string[]; translations?: Record<string, string>;
  fixtures?: { doctype: string; name: string; data: Record<string, unknown> }[];
  /** Optional source ownership/provenance; host_app remains the existing routing slot. */
  source_application?: SourceApplication;
  source_references?: Record<string, string>;
  actions?: PluginAction[]; settings?: PluginSettings[]; department_sections?: DepartmentSection[]; frontend?: PluginFrontend;
  /** Version compatibility declared by the app (e.g. { frappe: ">=17.0.0-dev" }); checked against the recorded source versions. */
  compatibility?: Record<string, string>;
  /** Optional experience theme: CSS class scope (scoped stylesheet owned by the app) + brand logo shown in its workspace. */
  theme?: PluginTheme;
  /** App-owned virtual pages and manifest navigation/dock (rendered by src/routes/plugins.$name.$.tsx and the enterprise module rail). */
  pages?: PluginPage[]; navigation?: PluginNavGroup[]; dock?: PluginDock;
  /** Virtual-only demo installer (built-in apps): runs on enable after fixtures, insert-if-missing; never exported. */
  install_demo?: () => number;
  /**
   * Optional persistent app experience (src/plugins/theme.ts): while active, generic Core entry points (Home "/",
   * Reports "/report") resolve to these in-app targets. Native list/form/report routes keep their canonical URL and
   * render inside the active app shell.
   */
  experience?: { home: string; aliases?: Record<string, string> };
  /** Enable once on a clean browser so the app appears in the dock; afterwards the administrator's enable/disable choice is kept. */
  default_enabled?: boolean;
  /**
   * App page paths (manifest navigation targets) behind the shared global rail services Compliance and Help. Reports and
   * Settings come from the app's own navigation; a service without a target opens the shared Core page (/compliance, /help).
   */
  rail_services?: { compliance?: string; help?: string };
}
