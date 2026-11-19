import { VISIT_DT } from "@/plugins/digit_fsm/schema";
/**
 * Read model of DIGIT FSM + ITM. Every read goes through the shared scope boundary (src/lib/scope.ts scopedList →
 * session.ts role permissions + Company / Service Site User Permissions), so lists, 360 pages, KPIs, reports and
 * exports show exactly the records the session user may read. No business value is stored here; everything is derived
 * from canonical records at read time.
 */
import { adapter, type Doc } from "@/lib/adapter";
import { canReadType, scopedList } from "@/lib/scope";
import { s, type Row } from "./rules";

export const APP = "digit_fsm";
export const list = (dt: string): Doc[] => scopedList(dt);
export const canRead = (dt: string) => canReadType(dt);
export const raw = (dt: string, n: unknown) => (n ? adapter.get(dt, String(n)) : undefined);
export const rows = (d: Doc | Row | undefined, f: string) => ((d?.[f] as Row[] | undefined) ?? []);
export const by = <T extends Doc>(xs: T[], f: string) => { const m = new Map<string, T[]>(); for (const x of xs) { const k = s(x[f]); if (!k) continue; const l = m.get(k) ?? []; l.push(x); m.set(k, l); } return m; };
export const idx = <T extends Doc>(xs: T[]) => new Map(xs.map((x) => [x.name, x]));

/** Display title of a record (title field, else name). */
const TITLE: Record<string, string> = { "FSM Service Site": "site_name", "FSM Service System": "system_name", "FSM Device": "device_label", "FSM Service Agreement": "agreement_title", "FSM Job": "job_title", "FSM Deficiency": "title", "FSM Technician": "technician_name", "FSM Inspection Template": "template_name", "FSM Location Node": "node_label", Customer: "customer_name", Employee: "employee_name", Item: "item_name", Supplier: "supplier_name", Issue: "subject" };
/** Records without a title field are named after what they serve (names, not codes, on every list — owner FSM F1-03). */
const DERIVED: Record<string, (d: Doc) => string> = {
  [VISIT_DT]: (d) => titleOf("FSM Job", d["job"]), "FSM Inspection Run": (d) => titleOf("FSM Service System", d["system"]), "FSM Obligation": (d) => titleOf("FSM Service System", d["system"]),
  "FSM Retest": (d) => titleOf("FSM Deficiency", d["deficiency"]), "FSM Impairment": (d) => titleOf("FSM Service System", d["system"]), "FSM Charge Proposal": (d) => titleOf("FSM Job", d["job"]),
  "FSM Renewal Case": (d) => titleOf("FSM Service Agreement", d["agreement"]), "FSM Asset Change": (d) => titleOf("FSM Device", d["device"]), "FSM Booking": (d) => titleOf("FSM Technician", d["technician"]),
};
export function titleOf(dt: string, name: unknown): string {
  const d = raw(dt, name); const f = TITLE[dt];
  if (d && !f && DERIVED[dt]) { const v = DERIVED[dt]!(d); if (v) return v; }
  return (f && d ? s(d[f]) : "") || s(name);
}

export interface Filters { company?: string; site?: string; customer?: string; from?: string; to?: string; as_of?: string; system?: string; technician?: string; device?: string; severity?: string; agreement?: string; [k: string]: string | undefined }
/** Site / company / customer filter shared by every report and queue (a record matches when it carries the field). */
export function inScope(d: Doc | Row, f: Filters): boolean {
  if (f.company && d["company"] && s(d["company"]) !== f.company) return false;
  if (f.site && d["site"] !== undefined && s(d["site"]) !== f.site) return false;
  if (f.customer) {
    const c = d["customer"] !== undefined ? s(d["customer"]) : s(raw("FSM Service Site", d["site"])?.["customer"]);
    if (c && c !== f.customer) return false;
  }
  if (f.system && d["system"] !== undefined && s(d["system"]) !== f.system) return false;
  return true;
}
export const OPEN_VISIT = new Set(["Planned", "Dispatched", "On Site"]);
export const CLOSED_JOB = new Set(["Closed", "Cancelled"]);
