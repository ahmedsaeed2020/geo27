/**
 * Frappe CRM server + form logic ported onto the core adapter (Layer O).
 * Sources: crm/fcrm/doctype/{crm_lead,crm_deal,crm_service_level_agreement,crm_status_change_log,...}/*.py and *.js,
 * crm/api/{activities,comment,notifications}.py, frappe Assignment Rule. Registered as adapter doc hooks so the
 * CRM SPA and the Desk form apply identical behaviour. Conditions go through the controlled expr.ts interpreter.
 */
import { adapter, registerDocHook, type Doc } from "./adapter";
import { evalExpr } from "./expr";
import { currentUser } from "./session";
import { matchFilter, parseFilters } from "./desk";

type Row = Record<string, unknown>;
const rows = (v: unknown): Row[] => (Array.isArray(v) ? (v as Row[]) : []);
const num = (v: unknown) => Number(v ?? 0) || 0;
const nowIso = () => new Date().toISOString();
const today = () => nowIso().slice(0, 10);

/** Inventory of every source form/server event and how it runs here (A2 report). */
export const CRM_FORM_EVENTS: { doctype: string; event: string; source: string; status: "behaves" | "server-dependent" | "n/a"; note?: string }[] = [
  { doctype: "CRM Lead", event: "refresh → add_web_link Open in Portal", source: "crm_lead.js", status: "behaves" },
  { doctype: "CRM Lead", event: "update_total", source: "crm_lead.js", status: "behaves" },
  { doctype: "CRM Lead", event: "CRM Products products_add/products_remove", source: "crm_lead.js", status: "behaves" },
  { doctype: "CRM Lead", event: "CRM Products product_code", source: "crm_lead.js", status: "behaves" },
  { doctype: "CRM Lead", event: "CRM Products rate/qty", source: "crm_lead.js", status: "behaves" },
  { doctype: "CRM Lead", event: "CRM Products discount_percentage", source: "crm_lead.js", status: "behaves" },
  { doctype: "CRM Deal", event: "refresh → add_web_link Open in Portal", source: "crm_deal.js", status: "behaves" },
  { doctype: "CRM Deal", event: "update_total", source: "crm_deal.js", status: "behaves" },
  { doctype: "CRM Deal", event: "CRM Products products_add/products_remove", source: "crm_deal.js", status: "behaves" },
  { doctype: "CRM Deal", event: "CRM Products product_code", source: "crm_deal.js", status: "behaves" },
  { doctype: "CRM Deal", event: "CRM Products rate/qty", source: "crm_deal.js", status: "behaves" },
  { doctype: "CRM Deal", event: "CRM Products discount_percentage", source: "crm_deal.js", status: "behaves" },
  { doctype: "CRM Service Level Agreement", event: "refresh → Rolling Response Time label", source: "crm_service_level_agreement.js", status: "behaves" },
  { doctype: "CRM Service Level Agreement", event: "validate → one default priority", source: "crm_service_level_agreement.js", status: "behaves" },
  { doctype: "CRM Holiday List", event: "clear_table", source: "crm_holiday_list.js", status: "behaves" },
  { doctype: "CRM Holiday List", event: "add_to_holidays (get_weekly_off_dates)", source: "crm_holiday_list.js", status: "behaves" },
  { doctype: "FCRM Settings", event: "refresh → restore_demo_data visibility", source: "fcrm_settings.js", status: "behaves" },
  { doctype: "FCRM Settings", event: "restore_defaults", source: "fcrm_settings.js", status: "behaves", note: "re-inserts default statuses/layout records if missing" },
  { doctype: "FCRM Settings", event: "restore_demo_data", source: "fcrm_settings.js", status: "behaves", note: "re-runs insert-if-missing seed" },
  { doctype: "CRM Form Script", event: "refresh → set_query dt istable=0", source: "crm_form_script.js", status: "behaves" },
  { doctype: "CRM Form Script", event: "refresh → standard script read-only", source: "crm_form_script.js", status: "behaves" },
  { doctype: "CRM Form Script", event: "add_enable_button", source: "crm_form_script.js", status: "behaves" },
  { doctype: "CRM Form Script", event: "view → boilerplate", source: "crm_form_script.js", status: "behaves" },
  { doctype: "CRM Product", event: "onload → DIGIT item redirect", source: "crm_product.js", status: "behaves" },
  { doctype: "CRM Product", event: "product_code → product_name", source: "crm_product.js", status: "behaves" },
  { doctype: "CRM Product", event: "list onload → Add CRM Product", source: "crm_product_list.js", status: "behaves" },
  { doctype: "CRM Invitation", event: "refresh → Accept Invitation", source: "crm_invitation.js", status: "behaves" },
  { doctype: "ERPNext CRM Settings", event: "refresh → Reset DIGIT Form Script", source: "erpnext_crm_settings.js", status: "behaves" },
  { doctype: "Failed Lead Sync Log", event: "refresh → Retry Sync", source: "failed_lead_sync_log.js", status: "server-dependent", note: "Facebook Graph API fetch" },
  { doctype: "Lead Sync Source", event: "refresh → Sync Now", source: "lead_sync_source.js", status: "server-dependent", note: "Facebook Graph API fetch" },
  { doctype: "CRM Enrichment Run", event: "refresh → Retry Enrichment", source: "crm_enrichment_run.js", status: "server-dependent", note: "website fetch" },
  { doctype: "Facebook Lead Form", event: "refresh (empty)", source: "facebook_lead_form.js", status: "n/a" },
  // server controllers
  { doctype: "CRM Deal", event: "validate_status / set_primary_contact / set_primary_email_mobile_no", source: "crm_deal.py", status: "behaves" },
  { doctype: "CRM Deal", event: "add_status_change_log + closed_date on Won", source: "crm_deal.py / crm_status_change_log.py", status: "behaves" },
  { doctype: "CRM Deal", event: "validate_forecasting_fields (probability, expected value)", source: "crm_deal.py", status: "behaves" },
  { doctype: "CRM Deal", event: "validate_lost_reason", source: "crm_deal.py", status: "behaves" },
  { doctype: "CRM Deal", event: "update_exchange_rate", source: "crm_deal.py", status: "behaves", note: "rate 1 for system currency; other currencies use the stored Currency Exchange record" },
  { doctype: "CRM Deal", event: "set_sla / apply_sla", source: "crm_deal.py + crm_service_level_agreement.py", status: "behaves" },
  { doctype: "CRM Deal", event: "after_insert → assign_agent / Assignment Rule", source: "crm_deal.py + frappe assignment_rule", status: "behaves" },
  { doctype: "CRM Lead", event: "set_full_name / set_lead_name / validate_email", source: "crm_lead.py", status: "behaves" },
  { doctype: "CRM Lead", event: "set_sla / apply_sla", source: "crm_lead.py", status: "behaves" },
  { doctype: "CRM Lead", event: "after_insert → assign_agent / Assignment Rule", source: "crm_lead.py", status: "behaves" },
  { doctype: "CRM Lead", event: "convert_to_deal", source: "crm_lead.py", status: "behaves" },
  { doctype: "CRM Service Level Agreement", event: "validate_default", source: "crm_service_level_agreement.py", status: "behaves" },
  { doctype: "Comment", event: "on_update → notify_mentions (CRM Notification)", source: "crm/api/comment.py", status: "behaves" },
];

// ---------- status helpers ----------
const statusType = (dt: "CRM Deal Status" | "CRM Lead Status", s: unknown) => String(adapter.get(dt, String(s ?? ""))?.["type"] ?? "");

// ---------- products (crm_deal.js / crm_lead.js update_total + row events) ----------
export function updateProducts(doc: Doc): Doc {
  const products = rows(doc["products"]).map((d) => {
    const r = { ...d };
    if (r["product_code"] && !r["product_name"]) r["product_name"] = r["product_code"];
    r["amount"] = num(r["rate"]) * num(r["qty"]);
    r["discount_amount"] = (num(r["discount_percentage"]) / 100) * num(r["amount"]);
    r["net_amount"] = num(r["amount"]) - num(r["discount_amount"]);
    return r;
  });
  if (!products.length && doc["products"] === undefined) return doc;
  const total = products.reduce((a, d) => a + num(d["amount"]), 0);
  const net = products.reduce((a, d) => a + num(d["net_amount"]), 0);
  return { ...doc, products, total, net_total: net };
}

// ---------- SLA (crm_service_level_agreement.py) ----------
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const toSec = (t: unknown) => { const [h, m, s] = String(t ?? "0:0:0").split(":").map(Number); return (h || 0) * 3600 + (m || 0) * 60 + (s || 0); };
function holidaysOf(sla: Doc): Set<string> {
  const hl = sla["holiday_list"] ? adapter.get("CRM Holiday List", String(sla["holiday_list"])) : undefined;
  return new Set((hl ? weeklyOffDates(hl) : []).map((h) => String(h["date"]).slice(0, 10)));
}
/** calc_time: walk working hours on workdays, skipping holidays. */
export function slaCalcTime(sla: Doc, startIso: string, seconds: number): string | undefined {
  const hours = rows(sla["working_hours"]);
  if (!hours.length || !seconds) return undefined;
  const holidays = holidaysOf(sla);
  let t = new Date(startIso); let need = seconds; let guard = 0;
  while (need > 0 && guard++ < 800) {
    const day = t.toISOString().slice(0, 10);
    const wd = hours.find((h) => h["workday"] === WEEKDAYS[t.getUTCDay()]);
    if (!wd || holidays.has(day)) { t = new Date(`${day}T00:00:00Z`); t.setUTCDate(t.getUTCDate() + 1); continue; }
    const st = toSec(wd["start_time"]), en = toSec(wd["end_time"]);
    const cur = t.getUTCHours() * 3600 + t.getUTCMinutes() * 60 + t.getUTCSeconds();
    const from = Math.max(cur, st);
    if (from >= en) { t = new Date(`${day}T00:00:00Z`); t.setUTCDate(t.getUTCDate() + 1); continue; }
    const take = Math.min(need, en - from);
    need -= take;
    t = new Date(new Date(`${day}T00:00:00Z`).getTime() + (from + take) * 1000);
  }
  return t.toISOString();
}
const defaultPriority = (sla: Doc) => String(rows(sla["priorities"]).find((p) => num(p["default_priority"]))?.["priority"] ?? "");
/** get_sla: enabled SLAs for the DocType within dates, matching priority, condition true; default last. */
export function getSla(doc: Doc): Doc | undefined {
  const now = today();
  const list = adapter.list("CRM Service Level Agreement").filter((s) => s["apply_on"] === doc.doctype && num(s["enabled"])
    && (!s["start_date"] || String(s["start_date"]) <= now) && (!s["end_date"] || String(s["end_date"]) >= now)
    && (!doc["communication_status"] || rows(s["priorities"]).some((p) => p["priority"] === doc["communication_status"])));
  list.sort((a, b) => num(a["default"]) - num(b["default"]));
  return list.find((s) => (!s["condition"] || !!evalExpr(String(s["condition"]), doc).value) && parseFilters(String(s["condition_json"] || "[]")).filters.every(f => matchFilter(doc, f)));
}
export function applySla(doc: Doc, before: Doc | undefined): Doc {
  let d = { ...doc };
  if (!d["sla"]) { const s = getSla(d); if (!s) return d; d["sla"] = s.name; }
  const sla = adapter.get("CRM Service Level Agreement", String(d["sla"]));
  if (!sla) return d;
  d["communication_status"] ??= defaultPriority(sla) || "Open";
  d["sla_creation"] ??= d["creation"] ?? nowIso();
  if (before && before["communication_status"] !== d["communication_status"] && d["communication_status"] !== defaultPriority(sla)) {
    d["first_responded_on"] ??= nowIso();
    d["last_responded_on"] ??= d["first_responded_on"];
    if (d["first_response_time"] == null) d["first_response_time"] = Math.round((Date.parse(String(d["first_responded_on"])) - Date.parse(String(d["sla_creation"]))) / 1000);
  }
  if (!d["response_by"]) {
    const p = rows(sla["priorities"]).find((x) => x["priority"] === d["communication_status"]);
    if (p) d["response_by"] = slaCalcTime(sla, String(d["sla_creation"]), num(p["first_response_time"]));
  }
  const failed = d["response_by"] ? (d["first_responded_on"] ? String(d["response_by"]) < String(d["first_responded_on"]) : String(d["response_by"]) < nowIso()) : false;
  d["sla_status"] = failed ? "Failed" : !d["first_responded_on"] ? "First Response Due" : "Fulfilled";
  return d;
}

// ---------- status change log (crm_status_change_log.py add_status_change_log) ----------
function addStatusChangeLog(d: Doc, before: Doc | undefined, at = nowIso()): Doc {
  const sdt = d.doctype === "CRM Lead" ? "CRM Lead Status" : "CRM Deal Status";
  const toType = statusType(sdt, d["status"]);
  const log = rows(d["status_change_log"]).map((r) => ({ ...r }));
  if (before) {
    const prev = before["status"];
    if (!log.length && prev) log.push({ from: prev, from_type: statusType(sdt, prev), to: "", to_type: "", from_date: new Date(Date.parse(at) - 60000).toISOString(), to_date: "", log_owner: currentUser() });
    const last = log[log.length - 1];
    if (last) Object.assign(last, { to: d["status"], to_type: toType, to_date: at, log_owner: currentUser(), duration: Math.round((Date.parse(at) - Date.parse(String(last["from_date"]))) / 1000) });
  }
  log.push({ from: d["status"], from_type: toType, to: "", to_type: "", from_date: at, to_date: "", log_owner: currentUser() });
  return { ...d, status_change_log: log };
}

// ---------- assignment (frappe Assignment Rule + crm assign_agent) ----------
const assignees = (d: Doc): string[] => { try { return JSON.parse(String(d["_assign"] || "[]")); } catch { return []; } };
export function assignTo(dt: string, name: string, users: string[], by = currentUser()) {
  const doc = adapter.get(dt, name); if (!doc) return;
  const cur = assignees(doc); const add = users.filter((u) => u && !cur.includes(u)); if (!add.length) return;
  adapter.update(dt, name, { _assign: JSON.stringify([...cur, ...add]) });
  for (const u of add) {
    adapter.insertDoc("ToDo", { allocated_to: u, reference_type: dt, reference_name: name, status: "Open", description: `${dt} ${name}`, assigned_by: by, date: today() });
    adapter.insertDoc("CRM Notification", { notification_text: `assigned you a new ${dt === "CRM Lead" ? "lead" : "deal"} ${name}`, from_user: by, to_user: u, type: "Assignment", read: 0, reference_doctype: dt, reference_name: name, notification_type_doctype: dt, notification_type_doc: name });
  }
}
export function clearAssignment(dt: string, name: string) {
  adapter.update(dt, name, { _assign: "[]" });
  for (const t of adapter.list("ToDo")) if (t["reference_type"] === dt && t["reference_name"] === name && t["status"] === "Open") adapter.update("ToDo", t.name, { status: "Cancelled" });
}
function applyAssignmentRules(d: Doc) {
  if (assignees(d).length) return;
  const rules = adapter.list("Assignment Rule").filter((r) => r["document_type"] === d.doctype && !num(r["disabled"])).sort((a, b) => num(b["priority"]) - num(a["priority"]));
  for (const r of rules) {
    const scheduledDays = rows(r["assignment_days"]).map(day => String(day["day"]));
    if (scheduledDays.length && !scheduledDays.includes(WEEKDAYS[new Date().getUTCDay()] || "")) continue;
    if (!parseFilters(String(r["assign_condition_json"] || "[]")).filters.every(f => matchFilter(d, f))) continue;
    if (r["assign_condition"] && !evalExpr(String(r["assign_condition"]), d).value) continue;
    const users = rows(r["users"]).map((u) => String(u["user"]));
    if (!users.length) continue;
    let pick: string;
    if (r["rule"] === "Load Balancing") {
      const load = (u: string) => adapter.list("ToDo").filter((t) => t["allocated_to"] === u && t["status"] === "Open" && t["reference_type"] === d.doctype).length;
      const selected = [...users].sort((a, b) => load(a) - load(b))[0]; if (!selected) continue; pick = selected;
    } else if (r["rule"] === "Based on Field" && r["field"]) pick = String(d[String(r["field"])] ?? users[0]);
    else { const i = users.indexOf(String(r["last_user"] ?? "")); const selected = users[(i + 1) % users.length]; if (!selected) continue; pick = selected; }
    adapter.update("Assignment Rule", r.name, { last_user: pick });
    assignTo(d.doctype, d.name, [pick], "Administrator");
    return;
  }
  const owner = d[d.doctype === "CRM Lead" ? "lead_owner" : "deal_owner"];
  if (owner) assignTo(d.doctype, d.name, [String(owner)]);
}

// ---------- primary contact (set_primary_contact / set_primary_email_mobile_no) ----------
function primaryContact(d: Doc): Doc {
  if (d["contacts"] === undefined) return d;
  const cs: Row[] = rows(d["contacts"]).map((r): Row => {
    const c = r["contact"] ? adapter.get("Contact", String(r["contact"])) : undefined;
    return { ...r, full_name: r["full_name"] ?? (c ? [c["first_name"], c["last_name"]].filter(Boolean).join(" ") : undefined), email: r["email"] ?? c?.["email_id"], mobile_no: r["mobile_no"] ?? c?.["mobile_no"], phone: r["phone"] ?? c?.["phone"] };
  });
  if (cs.length === 1) cs[0]!["is_primary"] = 1;
  const prim = cs.filter((c) => num(c["is_primary"]));
  if (prim.length > 1) return { ...d, contacts: cs, __err: "Only one Contact can be set as primary." } as Doc;
  const p = prim[0];
  return { ...d, contacts: cs, email: String(p?.["email"] ?? "").trim() || (cs.length ? "" : d["email"]), mobile_no: String(p?.["mobile_no"] ?? "").trim() || (cs.length ? "" : d["mobile_no"]), phone: String(p?.["phone"] ?? "").trim() };
}

function dealHook(doc: Doc, before: Doc | undefined) {
  const errors: string[] = [];
  let d = updateProducts(doc);
  if (!before && !d["status"]) d["status"] = adapter.get("CRM Deal Status", "Qualification") ? "Qualification" : adapter.list("CRM Deal Status").find((s) => s["type"] === "Open")?.name;
  d = primaryContact(d); if (d["__err"]) { errors.push(String(d["__err"])); delete d["__err"]; }
  if (!before || before["status"] !== d["status"]) {
    d = addStatusChangeLog(d, before);
    if (statusType("CRM Deal Status", d["status"]) === "Won") d["closed_date"] = today();
  }
  if (!num(d["probability"])) d["probability"] = num(adapter.get("CRM Deal Status", String(d["status"] ?? ""))?.["probability"]);
  const settings = adapter.get("FCRM Settings", "FCRM Settings");
  if (num(settings?.["auto_update_expected_deal_value"]) && (num(d["net_total"]) || num(d["total"])) && d["expected_deal_value"]) d["expected_deal_value"] = num(d["net_total"]) || num(d["total"]);
  if (num(settings?.["enable_forecasting"])) {
    if (!num(d["expected_deal_value"])) errors.push("Expected deal value is required.");
    if (!d["expected_closure_date"]) errors.push("Expected closure date is required.");
  }
  if (statusType("CRM Deal Status", d["status"]) === "Lost") {
    if (!d["lost_reason"]) errors.push("Please specify a reason for losing the deal.");
    else if (d["lost_reason"] === "Other" && !d["lost_notes"]) errors.push("Please specify the reason for losing the deal.");
  }
  if (!before || before["currency"] !== d["currency"] || !num(d["exchange_rate"])) {
    const sys = String(settings?.["currency"] || "SAR");
    const ex = adapter.list("Currency Exchange").find((x) => x["from_currency"] === d["currency"] && x["to_currency"] === sys);
    d["exchange_rate"] = !d["currency"] || d["currency"] === sys ? 1 : num(ex?.["exchange_rate"]) || 1;
  }
  d = applySla(d, before);
  return { doc: d, errors, after: before ? (x: Doc) => { if (before["deal_owner"] !== x["deal_owner"] && x["deal_owner"]) assignTo("CRM Deal", x.name, [String(x["deal_owner"])]); } : applyAssignmentRules };
}

function leadHook(doc: Doc, before: Doc | undefined) {
  let d = updateProducts(doc);
  const errors: string[] = [];
  if (!d["first_name"] && !d["last_name"] && !d["email"] && !d["lead_name"] && !d["organization"]) errors.push("A Lead requires either a person's name or an organization's name");
  const full = [d["salutation"], d["first_name"], d["middle_name"], d["last_name"]].filter(Boolean).join(" ");
  if (!d["lead_name"] || (before && (["first_name", "last_name", "middle_name", "salutation"] as const).some((k) => before[k] !== d[k]))) d["lead_name"] = full || d["organization"] || String(d["email"] ?? "").split("@")[0];
  if (!before && !d["status"]) d["status"] = adapter.list("CRM Lead Status").sort((a, b) => num(a["position"]) - num(b["position"]))[0]?.name ?? "New";
  if (d["email"] && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(d["email"]))) errors.push(`${d["email"]} is not a valid email address`);
  if (!before || before["status"] !== d["status"]) d = addStatusChangeLog(d, before);
  d = applySla(d, before);
  return { doc: d, errors, after: before ? (x: Doc) => { if (before["lead_owner"] !== x["lead_owner"] && x["lead_owner"]) assignTo("CRM Lead", x.name, [String(x["lead_owner"])]); } : applyAssignmentRules };
}

function slaHook(doc: Doc) {
  const errors: string[] = [];
  if (rows(doc["priorities"]).filter((r) => num(r["default_priority"])).length > 1) errors.push("There can only be one default priority in Priorities table");
  if (num(doc["default"]) && adapter.list("CRM Service Level Agreement").some((s) => s.name !== doc.name && s["apply_on"] === doc["apply_on"] && num(s["default"]))) errors.push(`Default Service Level Agreement already exists for ${doc["apply_on"]}`);
  return { doc, errors };
}

/** crm/api/comment.py notify_mentions: @user mentions in a CRM comment create CRM Notification rows. */
function commentHook(doc: Doc, before: Doc | undefined) {
  if (before || !["CRM Lead", "CRM Deal"].includes(String(doc["reference_doctype"]))) return { doc };
  return { doc, after: (c: Doc) => notifyMentions(c) };
}
export function notifyMentions(c: Doc) {
  const html = String(c["content"] ?? "");
  const users = new Set([...html.matchAll(/data-id="([^"]+)"/g)].map((m) => m[1]!).concat([...html.matchAll(/@([\w.+-]+@[\w.-]+\.\w+)/g)].map((m) => m[1]!)));
  for (const u of users) {
    if (u === (c["owner"] ?? currentUser())) continue;
    adapter.insertDoc("CRM Notification", { notification_text: `mentioned you in a comment in ${c["reference_doctype"] === "CRM Lead" ? "lead" : "deal"} ${c["reference_name"]}`, from_user: c["owner"] ?? currentUser(), to_user: u, type: "Mention", read: 0, comment: c.name, reference_doctype: c["reference_doctype"], reference_name: c["reference_name"], notification_type_doctype: "Comment", notification_type_doc: c.name, message: html });
  }
}

/** CRM Holiday List get_weekly_off_dates. */
export function weeklyOffDates(hl: Doc): Row[] {
  const out = rows(hl["holidays"]).slice(); const wd = WEEKDAYS.indexOf(String(hl["weekly_off"] ?? ""));
  if (wd < 0 || !hl["from_date"] || !hl["to_date"]) return out;
  const have = new Set(out.map((h) => String(h["date"])));
  for (let t = new Date(`${hl["from_date"]}T00:00:00Z`); t <= new Date(`${hl["to_date"]}T00:00:00Z`); t.setUTCDate(t.getUTCDate() + 1)) {
    const ds = t.toISOString().slice(0, 10);
    if (t.getUTCDay() === wd && !have.has(ds)) out.push({ date: ds, weekly_off: 1, description: hl["weekly_off"] });
  }
  return out.sort((a, b) => String(a["date"]).localeCompare(String(b["date"])));
}

/** Seed pass: run the Lead/Deal controllers once over synthetic records (flag __crm_v1); never touches user records. */
export function runCrmEngines(): boolean {
  let n = 0;
  for (const [dt, hook] of [["CRM Lead", leadHook], ["CRM Deal", dealHook]] as const) for (const d of adapter.list(dt)) {
    if (!d["__synthetic"] || d["__crm_v1"]) continue;
    let x: Doc = { ...d };
    if (dt === "CRM Deal" && x["lost_reason"] === "Price") x["lost_reason"] = "Pricing";
    // existing history is kept: the controller only appends a log on status change
    const r = hook({ ...x, status_change_log: rows(x["status_change_log"]).length ? x["status_change_log"] : undefined }, rows(x["status_change_log"]).length ? x : undefined);
    x = { ...r.doc, __crm_v1: 1 };
    // demo SLA: two of three records responded within target, the rest breached
    if (num(String(d.name).slice(-3)) % 3 && x["sla_creation"]) { x["first_responded_on"] = new Date(Date.parse(String(x["sla_creation"])) + 2 * 3600000).toISOString(); x["sla_status"] = String(x["response_by"] ?? "") >= String(x["first_responded_on"]) ? "Fulfilled" : "Failed"; x["first_response_time"] = 7200; }
    adapter.insertDocQuiet(dt, { ...x, modified: d.modified });
    if (!assignees(x).length) {
      const users = ["noura.sales@digit.test", "fahad.sales@digit.test", "sales.user@digit.test"];
      adapter.insertDocQuiet(dt, { ...adapter.get(dt, d.name)!, _assign: JSON.stringify([users[n % 3]]), modified: d.modified });
    }
    n++;
  }
  return n > 0;
}

let registered = false;
export function registerCrmLogic() {
  if (registered) return; registered = true;
  registerDocHook("CRM Deal", dealHook);
  registerDocHook("CRM Lead", leadHook);
  registerDocHook("CRM Service Level Agreement", slaHook);
  registerDocHook("CRM Product", (doc) => ({ doc: doc["product_code"] && !doc["product_name"] ? { ...doc, product_name: doc["product_code"] } : doc }));
  registerDocHook("CRM Holiday List", (doc) => ({ doc: { ...doc, total_holidays: rows(doc["holidays"]).length } }));
  registerDocHook("Comment", commentHook);
}
registerCrmLogic();
