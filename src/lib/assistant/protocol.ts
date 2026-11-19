/**
 * DIGIT Assistant wire contract shared by the browser panel and the server route (/api/assistant).
 * Tools are declared here (name + strict JSON schema) and executed in the BROWSER (src/lib/assistant/tools.ts),
 * because records live in the browser adapter: the model only ever sees rows the simulated user may read.
 * The assistant is read-only — it can look records up and open screens, never create, edit or delete.
 */

export const ASSISTANT_ENDPOINT = "/api/assistant";

/** Page context the panel sends with every request (validated + size-capped on the server). */
export interface AssistantContext {
  lang: "ar" | "en";
  path: string;
  title: string;
  user: string;
  roles: string[];
  company: string;
  today: string;
  apps: { name: string; title: string; home: string }[];
}

type Schema = Record<string, unknown>;
const str = (description: string): Schema => ({ type: "string", description });
const nullable = (s: Schema): Schema => ({ ...s, type: [s["type"] as string, "null"] });

const FILTERS: Schema = {
  type: ["array", "null"],
  description: "Conditions that must all match. null = no filter.",
  items: {
    type: "object",
    additionalProperties: false,
    required: ["field", "op", "value"],
    properties: {
      field: str("Exact fieldname from find_doctypes (e.g. status, customer, posting_date, grand_total, docstatus)."),
      op: { type: "string", enum: ["=", "!=", ">", "<", ">=", "<=", "like", "not like", "in", "not in", "between", "is"] },
      value: str("Value as text. Numbers as digits; dates as YYYY-MM-DD; 'in' = comma separated; 'between' = 'from,to'; 'is' = set|not set."),
    },
  },
};

const obj = (properties: Record<string, Schema>): Schema => ({
  type: "object",
  additionalProperties: false,
  required: Object.keys(properties),
  properties,
});

/** name → { description, inputSchema } — strict-mode compatible (every property required, optional ones nullable). */
export const ASSISTANT_TOOLS = {
  find_doctypes: {
    description:
      "Find which DocTypes (record types / screens) match a topic, in Arabic or English, e.g. 'فواتير المبيعات', 'employee', 'attendance'. Returns DocType names, labels, record counts the user may read, and the main fieldnames of the best matches. Call this first whenever you are not sure of the exact DocType or fieldnames.",
    inputSchema: obj({ query: str("Topic or DocType name in Arabic or English.") }),
  },
  query_records: {
    description:
      "List records of one DocType that the current user may read, with optional filters, chosen fields and sort. Returns the total matching count plus up to `limit` rows.",
    inputSchema: obj({
      doctype: str("Exact DocType name, e.g. 'Sales Invoice'."),
      filters: FILTERS,
      fields: { type: ["array", "null"], items: { type: "string" }, description: "Fieldnames to return; null = the DocType's main fields." },
      order_by: nullable(str("Fieldname to sort by; null = newest modified first.")),
      descending: { type: ["boolean", "null"], description: "Sort descending (default true)." },
      limit: { type: ["integer", "null"], description: "Rows to return, 1–25 (default 10)." },
    }),
  },
  aggregate_records: {
    description:
      "Count records and sum numeric fields for one DocType, optionally grouped by a field or by month/year of a date field. Use for totals, rankings and trends (e.g. sales per month, invoices per status, top customers).",
    inputSchema: obj({
      doctype: str("Exact DocType name."),
      filters: FILTERS,
      group_by: nullable(str("Fieldname to group by (e.g. status, customer, department); null = one overall group.")),
      date_field: nullable(str("Date fieldname to bucket by period (e.g. posting_date); null = no period bucketing.")),
      period: { type: ["string", "null"], enum: ["month", "year", null], description: "Bucket size when date_field is set." },
      sum_fields: { type: ["array", "null"], items: { type: "string" }, description: "Numeric fieldnames to total (e.g. grand_total, outstanding_amount)." },
      limit: { type: ["integer", "null"], description: "Max groups to return, 1–40 (default 20), largest first." },
    }),
  },
  get_document: {
    description: "Read one record (header fields plus up to 15 rows of each child table) if the user may read it.",
    inputSchema: obj({ doctype: str("Exact DocType name."), name: str("Record ID (name), e.g. ACC-SINV-2026-00012.") }),
  },
  open_list: {
    description: "Open the list screen of a DocType for the user, optionally pre-filtered. Use when the user asks to show / open / go to records.",
    inputSchema: obj({ doctype: str("Exact DocType name."), filters: FILTERS }),
  },
  open_record: {
    description: "Open one record's form screen for the user.",
    inputSchema: obj({ doctype: str("Exact DocType name."), name: str("Record ID (name).") }),
  },
  open_app: {
    description: "Open a DIGIT application's home (one of the apps listed in the context).",
    inputSchema: obj({ app: str("App name from the context's apps list.") }),
  },
  find_reports: {
    description: "Find reports by topic in Arabic or English (e.g. 'receivables ageing', 'الربح الإجمالي', 'stock balance'). Returns only reports the user may open, with their filter fields.",
    inputSchema: obj({ query: str("Topic or report name in Arabic or English.") }),
  },
  run_report: {
    description:
      "Run one report (exact name from find_reports) with filter values and return its columns, row count, column totals and up to `limit` rows. Rows outside the user's role and User Permissions are removed first and the totals cover only those rows; say so when hidden_by_permissions > 0.",
    inputSchema: obj({
      report: str("Exact report name, e.g. 'Accounts Receivable'."),
      filters: {
        type: ["array", "null"], description: "Filter values by filter field from find_reports; null = the report's defaults.",
        items: { type: "object", additionalProperties: false, required: ["field", "value"], properties: { field: str("Filter fieldname."), value: str("Value as text; dates as YYYY-MM-DD.") } },
      },
      limit: { type: ["integer", "null"], description: "Rows to return, 1–25 (default 10)." },
    }),
  },
} as const;

export type AssistantToolName = keyof typeof ASSISTANT_TOOLS;
export const ASSISTANT_TOOL_NAMES = Object.keys(ASSISTANT_TOOLS) as AssistantToolName[];
export const isAssistantTool = (n: string): n is AssistantToolName => n in ASSISTANT_TOOLS;

/** Max automatic tool round-trips per user question (client guard; each round-trip is one model call). */
export const MAX_TOOL_STEPS = 8;
