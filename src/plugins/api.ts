/** Virtual REST / RPC over the adapter — same shapes as Frappe's /api/resource and frappe.client.* (no network). */
import { adapter, type Doc } from "@/lib/adapter";
import { callMethod, logEvent, match, runDocEvent } from "./runtime";
import { currentUser, PermissionError, type PType } from "@/lib/session";
import { assertScoped, scopedList } from "@/lib/scope";

/** Every virtual API read/write passes the shared scope boundary (src/lib/scope.ts → session.ts rules); unknown meta fails closed for non-admin users. */
function guard(dt: string, ptype: PType, doc?: Doc) { assertScoped(dt, ptype, doc); }
/** Readable rows of a DocType; a DocType the user cannot read at all is a 403, not an empty list. */
const readable = (dt: string, _rows?: Doc[]) => { guard(dt, "read"); return scopedList(dt); };

type F = [string, string, string, unknown][];
const toFilters = (dt: string, f: unknown): F => {
  if (!f) return [];
  const v = typeof f === "string" ? JSON.parse(f) : f;
  if (Array.isArray(v)) return v.map((x: unknown[]) => (x.length === 3 ? [dt, ...x] : x) as F[number]);
  return Object.entries(v as Record<string, unknown>).map(([k, x]) => (Array.isArray(x) ? [dt, k, String(x[0]), x[1]] : [dt, k, "=", x]) as F[number]);
};
function pick(d: Doc, fields: unknown) { const fs = typeof fields === "string" ? JSON.parse(fields) : fields; if (!Array.isArray(fs) || fs.includes("*")) return d; const o: Record<string, unknown> = {}; for (const f of fs as string[]) o[f] = d[f]; return o; }
function getList(dt: string, a: Record<string, unknown>) {
  const rows = readable(dt).filter((d) => match(d, toFilters(dt, a["filters"])));
  const [ob, dir] = String(a["order_by"] ?? "modified desc").split(/\s+/);
  rows.sort((x, y) => (String(x[ob!] ?? "") < String(y[ob!] ?? "") ? -1 : 1) * (dir?.toLowerCase() === "asc" ? 1 : -1));
  const start = Number(a["limit_start"] ?? 0), len = Number(a["limit_page_length"] ?? a["limit"] ?? 20);
  return rows.slice(start, len ? start + len : undefined).map((d) => pick(d, a["fields"] ?? ["name"]));
}
export interface ApiResult { status: number; body: unknown }
export function virtualApi(httpMethod: string, path: string, body: Record<string, unknown> = {}): ApiResult {
  const url = new URL(path, "http://virtual"); const q: Record<string, unknown> = Object.fromEntries(url.searchParams.entries());
  const a = { ...q, ...body };
  logEvent({ kind: "api", doctype: "", name: `${httpMethod} ${url.pathname}`, event: "request" });
  try {
    const res = url.pathname.match(/^\/api\/resource\/([^/]+)(?:\/(.+))?$/);
    if (res) {
      const dt = decodeURIComponent(res[1]!), name = res[2] ? decodeURIComponent(res[2]) : undefined;
      if (!name && httpMethod === "GET") return { status: 200, body: { data: getList(dt, a) } };
      if (!name && httpMethod === "POST") { guard(dt, "create", { ...(body as Doc), name: String(body["name"] ?? "") }); const ev = runDocEvent(dt, "before_save", { ...(body as Doc), name: String(body["name"] ?? "") }); if (ev.errors.length) return { status: 417, body: { exc_type: "ValidationError", _server_messages: ev.errors } }; const d = adapter.insertDoc(dt, ev.doc); return { status: 200, body: { data: d } }; }
      const d = name ? adapter.get(dt, name) : undefined;
      if (!d) return { status: 404, body: { exc_type: "DoesNotExistError", message: `${dt} ${name} not found` } };
      guard(dt, httpMethod === "GET" ? "read" : httpMethod === "DELETE" ? "delete" : "write", d);
      if (httpMethod === "PUT") guard(dt, "write", { ...d, ...body } as Doc);
      if (httpMethod === "GET") return { status: 200, body: { data: d } };
      if (httpMethod === "PUT") { adapter.update(dt, name!, body); return { status: 200, body: { data: adapter.get(dt, name!) } }; }
      if (httpMethod === "DELETE") { adapter.remove(dt, name!); return { status: 202, body: { message: "ok" } }; }
    }
    const m = url.pathname.match(/^\/api\/method\/(.+)$/);
    if (m) {
      const method = m[1]!; const dt = String(a["doctype"] ?? "");
      switch (method) {
        case "frappe.client.get_list": return { status: 200, body: { message: getList(dt, a) } };
        case "frappe.client.get_count": return { status: 200, body: { message: readable(dt).filter((d) => match(d, toFilters(dt, a["filters"]))).length } };
        case "frappe.client.get": { const g0 = adapter.get(dt, String(a["name"])); if (g0) guard(dt, "read", g0); const d = adapter.get(dt, String(a["name"])); return d ? { status: 200, body: { message: d } } : { status: 404, body: { exc_type: "DoesNotExistError" } }; }
        // frappe.client.get_value: frappe.get_list(..., limit=1) with permission query → same scoped rows as get_list
        case "frappe.client.get_value": { let d: Doc | undefined; if (a["filters"]) d = readable(dt).find((x) => match(x, toFilters(dt, a["filters"]))); else { d = adapter.get(dt, String(a["name"] ?? "")); if (d) guard(dt, "read", d); } return { status: 200, body: { message: d ? pick(d, typeof a["fieldname"] === "string" && !String(a["fieldname"]).startsWith("[") ? [a["fieldname"]] : a["fieldname"]) : null } }; }
        case "frappe.client.set_value": { const s0 = adapter.get(dt, String(a["name"])); if (s0) guard(dt, "write", s0); adapter.update(dt, String(a["name"]), typeof a["fieldname"] === "object" ? a["fieldname"] as Record<string, unknown> : { [String(a["fieldname"])]: a["value"] }); return { status: 200, body: { message: adapter.get(dt, String(a["name"])) } }; }
        case "frappe.client.insert": { const doc = (typeof a["doc"] === "string" ? JSON.parse(a["doc"] as string) : a["doc"]) as Doc; guard(String(doc.doctype), "create", doc); const d = adapter.insertDoc(String(doc.doctype), doc); return { status: 200, body: { message: d } }; }
        case "frappe.client.delete": { const x0 = adapter.get(dt, String(a["name"])); if (x0) guard(dt, "delete", x0); } adapter.remove(dt, String(a["name"])); return { status: 200, body: { message: null } };
        case "frappe.auth.get_logged_user": return { status: 200, body: { message: currentUser() } };
        case "frappe.ping": return { status: 200, body: { message: "pong" } };
        default: return { status: 200, body: { message: callMethod(method, a) } };
      }
    }
    return { status: 404, body: { message: "Not found" } };
  } catch (e) { if (e instanceof PermissionError) return { status: 403, body: { exc_type: "PermissionError", message: e.message } }; return { status: 500, body: { exc_type: "Exception", message: String((e as Error).message) } }; }
}
export const API_EXAMPLES: [string, string, string][] = [
  ["GET", "/api/resource/Sales Invoice?fields=[\"name\",\"customer\",\"grand_total\",\"status\"]&limit_page_length=5", ""],
  ["GET", "/api/resource/Customer/DDT-CUST-001", ""],
  ["POST", "/api/method/frappe.client.get_count", "{\"doctype\": \"Sales Invoice\", \"filters\": {\"status\": \"Overdue\"}}"],
  ["POST", "/api/method/frappe.client.get_value", "{\"doctype\": \"Company\", \"filters\": {\"abbr\": \"DDT\"}, \"fieldname\": [\"name\", \"default_currency\"]}"],
  ["POST", "/api/method/top_customers", "{\"limit\": 3}"],
  ["GET", "/api/method/frappe.ping", ""],
];
