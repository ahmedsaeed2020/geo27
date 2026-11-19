import { VISIT_DT } from "@/plugins/digit_fsm/schema";
/**
 * F4-06 customer portal preview scope (owner FSM round F4, P01–P08 — built virtually now). What one customer may see is
 * decided only by FSM Portal Grant: Active grants give the sites; per site the grant switches published reports,
 * findings & impairments and service requests. Only Published, current report revisions are ever shown. Pure readers; the
 * staff preview pages and the server publication rules (FRAPPE_DEVELOPER_GUIDE.md) follow this one rule.
 */
import type { Doc } from "@/lib/adapter";
import { list, raw } from "./data";
import { addDays, OPEN_DEFICIENCY, s, today } from "./rules";

export interface PortalScope { customer: string; contacts: string[]; sites: Doc[]; revoked: Doc[]; reports: Set<string>; findings: Set<string>; requests: Set<string> }
/** Customers that have at least one portal grant (active or revoked), in name order. */
export function portalCustomers(): string[] { return [...new Set(list("FSM Portal Grant").map((g) => s(g["customer"])).filter(Boolean))].sort(); }
export function portalScope(customer: string): PortalScope {
  const gs = list("FSM Portal Grant").filter((g) => s(g["customer"]) === customer);
  const active = gs.filter((g) => s(g["status"]) === "Active");
  const ids = new Set(active.map((g) => s(g["site"])));
  const flag = (k: string) => new Set(active.filter((g) => Number(g[k]) === 1).map((g) => s(g["site"])));
  return { customer, contacts: [...new Set(active.map((g) => s(g["contact"])).filter(Boolean))], sites: [...ids].map((x) => raw("FSM Service Site", x)).filter((x): x is Doc => !!x), revoked: gs.filter((g) => s(g["status"]) !== "Active" && !ids.has(s(g["site"]))), reports: flag("access_reports"), findings: flag("access_findings"), requests: flag("access_requests") };
}
/** Everything the customer would see, already filtered by the grants. */
export function portalView(customer: string, asOf = today()) {
  const sc = portalScope(customer); const ids = new Set(sc.sites.map((x) => x.name));
  const reports = list("FSM Report Revision").filter((r) => sc.reports.has(s(r["site"])) && s(r["status"]) === "Current" && s(raw("FSM Inspection Run", r["run"])?.["workflow_state"]) === "Published").sort((a, b) => s(b["published_on"]).localeCompare(s(a["published_on"])));
  const findings = list("FSM Deficiency").filter((d) => sc.findings.has(s(d["site"])) && OPEN_DEFICIENCY.has(s(d["workflow_state"])));
  const impairments = list("FSM Impairment").filter((i) => sc.findings.has(s(i["site"])) && s(i["status"]) === "Active");
  const visits = list(VISIT_DT).filter((v) => ids.has(s(v["site"])) && ["Planned", "Dispatched", "On Site"].includes(s(v["workflow_state"])) && s(v["scheduled_start"]).slice(0, 10) >= asOf && s(v["scheduled_start"]).slice(0, 10) <= addDays(asOf, 14)).sort((a, b) => s(a["scheduled_start"]).localeCompare(s(b["scheduled_start"])));
  const requests = list("Issue").filter((i) => sc.requests.has(s(i["digit_fsm_site"])));
  return { scope: sc, reports, findings, impairments, visits, requests };
}
