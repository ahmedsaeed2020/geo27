import { adapter, registerDocHook, type Doc } from "./adapter";
import { evalExpr } from "./expr";
import { matchFilter, parseFilters } from "./desk";
import { assignTo } from "./crmLogic";

export type AutomationStep = { idx: number; step_key: string; step_type: string; action_type: string; target: string; output_alias: string; params: string; step_condition: string; related_condition: string; parent_step: number; branch: string };
export type AutomationTrace = { key: string; status: string; detail: string; duration: number };
const obj = (v: unknown): Record<string, unknown> => {
  const parsed = typeof v === "string" ? JSON["parse"](v || "{}") : v;
  if (!parsed || typeof parsed !== "object" || Array["isArray"](parsed)) throw new Error("Parameters must be an object");
  return parsed as Record<string, unknown>;
};
const list = (v: unknown): string[] => Array["isArray"](v) ? v["map"](String) : typeof v === "string" && v["startsWith"]("[") ? JSON["parse"](v) : String(v ?? "")["split"](",")["map"](x => x["trim"]())["filter"](Boolean);
export function automationSteps(flow: Record<string, unknown>): AutomationStep[] { return Array["isArray"](flow["actions"]) ? flow["actions"] as AutomationStep[] : []; }
export function automationCondition(expression: string, doc: Doc) {
  if (!expression["trim"]()) return true;
  const expressionJs = expression["replace"](/\band\b/g, "&&")["replace"](/\bor\b/g, "||")["replace"](/\bnot\b/g, "!")["replace"](/\bTrue\b/g, "true")["replace"](/\bFalse\b/g, "false")["replace"](/\bNone\b/g, "null");
  const result = evalExpr(expressionJs, doc);
  if (!result["supported"]) throw new Error("Unsupported condition; source expression requires DIGIT");
  return Boolean(result["value"]);
}
export function automationMatches(flow: Record<string, unknown>, doc: Doc, before?: Doc): boolean {
  if (flow["document_type"] !== doc["doctype"] || !Number(flow["enabled"])) return false;
  if (!matchInterleaved(String(flow["filters"] || "[]"), doc)) return false;
  if (!automationCondition(String(flow["condition"] || ""), doc)) return false;
  const trigger = String(flow["trigger_type"]);
  if (trigger === "Doc Created") return !before;
  if (trigger === "Doc Updated") return Boolean(before);
  if (trigger === "Field Value Changed") {
    const field = String(flow["trigger_field"] || "");
    return Boolean(before) && before?.[field] !== doc[field] && (!flow["from_value"] || String(before?.[field]) === String(flow["from_value"])) && (!flow["to_value"] || String(doc[field]) === String(flow["to_value"]));
  }
  if (trigger === "Doc Submitted") return doc["docstatus"] === 1 && before?.["docstatus"] !== 1;
  if (trigger === "Doc Cancelled") return doc["docstatus"] === 2 && before?.["docstatus"] !== 2;
  if (trigger === "Custom Event" && before?.["status"] !== doc["status"]) {
    const events: Record<string, boolean> = { "crm.deal_stage_changed": doc["doctype"] === "CRM Deal", "crm.deal_won": doc["status"] === "Won", "crm.deal_lost": doc["status"] === "Lost", "crm.lead_qualified": doc["status"] === "Qualified", "crm.lead_converted": Boolean(doc["converted"]) };
    return Boolean(events[String(flow["custom_event"])]);
  }
  return false;
}
const template = (v: unknown, doc: Doc) => String(v ?? "")["replace"](/\{\{\s*(?:doc|target)\.([\w]+)\s*\}\}/g, (_, key: string) => String(doc[key] ?? ""));
let executing = false;

/** Local record actions only. I/O, Python scripts and durable waits stay explicitly server-dependent. */
export function runAutomation(flow: Record<string, unknown>, trigger: Doc, trial = false, overrides: Record<string, boolean> = {}) {
  const trace: AutomationTrace[] = [];
  const branches = new Map<number, boolean>();
  const aliases = new Map<string, Doc>([["trigger", { ...trigger }]]);
  const oldExecuting = executing; executing = true;
  try {
    for (const step of automationSteps(flow)) {
      const start = performance["now"]();
      const entry = { key: step["step_key"], status: "Success", detail: "", duration: 0 };
      trace["push"](entry);
      try {
        if (step["parent_step"] && branches["get"](step["parent_step"]) !== (step["branch"] === "If")) { entry["status"] = "Skipped"; continue; }
        const doc = aliases["get"](step["target"] || "trigger");
        if (!doc) throw new Error("Target alias does not exist");
        const passes = overrides[step["step_key"]] ?? automationCondition(step["step_condition"] || "", doc);
        if (step["step_type"] === "If") { branches["set"](step["idx"], passes); entry["detail"] = passes ? "True" : "False"; continue; }
        if (!passes) { entry["status"] = "Skipped"; continue; }
        const params = obj(step["params"]);
        const values = Object["fromEntries"](Object["entries"](params["values"] ? obj(params["values"]) : {})["map"](([k, v]) => [k, template(v, doc)]));
        const apply = (patch: Record<string, unknown>) => { Object["assign"](doc, patch); if (!trial) adapter["update"](doc["doctype"], doc["name"], patch); };
        if (step["step_type"] === "Wait" || step["step_type"] === "WaitForEvent") { entry["status"] = "Server-dependent"; entry["detail"] = "Durable waiting needs a DIGIT worker"; }
        else switch (step["action_type"]) {
          case "CreateDocument": {
            if (!params["doctype"]) throw new Error("Document Type is required");
            const result = trial ? { ...values, name: "trial", doctype: String(params["doctype"]) } : adapter["insertDoc"](String(params["doctype"]), values);
            if (step["output_alias"]) aliases["set"](step["output_alias"], result);
            entry["detail"] = result["name"]; break;
          }
          case "SetFieldValue": {
            const patch = params["field"] ? { [String(params["field"])]: template(params["value"], doc), ...values } : values;
            if (!Object["keys"](patch)["length"]) throw new Error("Set at least one field");
            apply(patch); break;
          }
          case "IncrementFieldValue": if (!params["field"]) throw new Error("Field is required"); else { apply({ [String(params["field"])]: Number(doc[String(params["field"])] || 0) + Number(params["amount"] || 0) }); break; }
          case "AdjustLeadScore": apply({ lead_score: Math["max"](Number(params["min_score"] ?? 0), Math["min"](Number(params["max_score"] ?? 100), Number(doc["lead_score"] || 0) + Number(params["amount"] || 0))) }); break;
          case "SetLeadTemperature": apply({ lead_temperature: params["temperature"] }); break;
          case "AssignToUser": {
            const users = list(params["assign_to"]); if (!users["length"]) throw new Error("At least one assignee is required");
            if (!trial) assignTo(doc["doctype"], doc["name"], users); break;
          }
          case "SendCRMNotification": case "SendNotification": {
            const users = list(params["recipients"])["map"](u => u === "owner" ? String(doc["owner"] || "Administrator") : u);
            if (!users["length"]) throw new Error("At least one recipient is required");
            if (step["action_type"] === "SendNotification" && params["channel"] === "Email") { entry["status"] = "Server-dependent"; entry["detail"] = "Sending email needs a configured mail server"; break; }
            if (!trial) users["forEach"](user => adapter["insertDoc"]("CRM Notification", { to_user: user, from_user: "Administrator", type: "Notification", read: 0, reference_doctype: doc["doctype"], reference_name: doc["name"], notification_text: template(params["notification_text"] || params["subject"], doc), message: template(params["message"], doc) }));
            entry["detail"] = String(users["length"]); break;
          }
          case "SendCRMEmail": case "CallWebhook": case "RunScript": case "ConvertLeadToDeal": entry["status"] = "Server-dependent"; entry["detail"] = "This action requires its DIGIT service/controller"; break;
          default: throw new Error("Pick a supported action");
        }
      } catch (error) { entry["status"] = "Failed"; entry["detail"] = error instanceof Error ? error["message"] : String(error); }
      finally { entry["duration"] = Math["round"](performance["now"]() - start); }
      if (entry["status"] === "Failed" && Number(flow["stop_on_error"] ?? 1)) break;
    }
    const status = trace["some"](t => t["status"] === "Failed") ? "Failed" : trace["some"](t => t["status"] === "Server-dependent") ? "Server-dependent" : "Success";
    if (!trial) adapter["insertDoc"]("Automation Run", { automation: flow["name"], flow: flow["name"], reference_doctype: trigger["doctype"], reference_name: trigger["name"], status, trace, started_at: new Date()["toISOString"]() });
    return { status, trace };
  } finally { executing = oldExecuting; }
}

for (const dt of ["CRM Lead", "CRM Deal", "CRM Task"]) registerDocHook(dt, (doc, before) => ({ doc, after: saved => {
  if (executing || saved["__synthetic"]) return;
  for (const flow of adapter["list"]("Automation Flow")) {
    try { if (automationMatches(flow, saved, before)) runAutomation(flow, saved); }
    catch (error) { adapter["insertDoc"]("Automation Run", { automation: flow["name"], status: "Failed", reference_name: saved["name"], error: String(error) }); }
  }
} }));
// Port of WorkflowAutomations/workflowValidation.js
import workflowSchemas from "@/components/crm/workflowSource.json";
const TRIGGER_REQUIREMENTS: Record<string, { field: string; label: string }> = {
  "Field Value Changed": { field: "trigger_field", label: "a field to watch" },
  Scheduled: { field: "cron_expression", label: "a schedule" },
  "Date Based": { field: "date_field", label: "a date field" },
  "Custom Event": { field: "custom_event", label: "an event" },
};
const isBlank = (v: unknown) => v === undefined || v === null || v === "";
export const hasValues = (v: unknown) => !v ? false : Array.isArray(v) ? v.length > 0 : typeof v === "object" ? Object.keys(v as object).length > 0 : true;
const isEmptyParam = (v: unknown) => isBlank(v) || (typeof v === "object" ? !hasValues(v) : ["[]", "{}"].includes(String(v).trim()));
const stepParams = (s: AutomationStep): Record<string, unknown> => { try { const p = JSON.parse(s.params || "{}"); return p && typeof p === "object" ? p : {}; } catch { return {}; } };
/** Returns [message, argument] so callers can translate the template. */
export function triggerIssue(doc: Record<string, unknown>): string {
  const r = doc["trigger_type"] ? TRIGGER_REQUIREMENTS[String(doc["trigger_type"])] : undefined;
  return r && isBlank(doc[r.field]) ? `Pick ${r.label}` : "";
}
export function stepIssue(step: AutomationStep): string {
  const p = stepParams(step);
  if (step.step_type === "If") return step.step_condition ? "" : "Set a condition";
  if (step.step_type === "Wait") return p["value"] ? "" : "Set how long to wait";
  if (step.step_type === "WaitForEvent") return p["event_name"] ? "" : "Pick an event";
  if (!step.action_type) return "Pick an action";
  if (step.action_type === "SetFieldValue") return p["field"] || hasValues(p["values"]) ? "" : "Choose a field to set";
  const missing = (workflowSchemas.find(s => s.action_type === step.action_type)?.params_schema || []).filter(x => "reqd" in x && x.reqd).find(x => isEmptyParam(p[x.fieldname]));
  return missing ? `${missing.label} is required` : "";
}
export function firstBlockingRow(actions: AutomationStep[]) { for (const row of actions) { const issue = stepIssue(row); if (issue) return { row, issue }; } return undefined; }

/** WorkflowFilters.vue storage: leaf rows [field, op, value] with "and" / "or" between them, nested lists for groups.
 *  "and" binds tighter than "or" (frappe ConditionBuilder evaluation). */
export function evalInterleaved(items: unknown[], doc: Doc): boolean {
  const groups: boolean[][] = [[]];
  for (const it of items) {
    if (it === "or") { groups.push([]); continue; }
    if (it === "and") continue;
    if (!Array.isArray(it)) continue;
    const leaf = it.length >= 3 && typeof it[0] === "string" && typeof it[1] === "string" && !Array.isArray(it[0]);
    groups[groups.length - 1]!.push(leaf ? matchFilter(doc, [String(it[0]), String(it[1]), it[2]]) : evalInterleaved(it, doc));
  }
  return groups.some(g => g.every(Boolean));
}
export function matchInterleaved(json: string, doc: Doc): boolean {
  let raw: unknown; try { raw = JSON.parse(json || "[]"); } catch { return true; }
  if (!Array.isArray(raw)) return parseFilters(json).filters.every(f => matchFilter(doc, f));
  return evalInterleaved(raw, doc);
}

/** Port of workflowCapabilities.aliasTargets + workflowSteps.stepsBefore (flat row order). */
export type AliasTarget = { alias: string; doctype: string | null; label: string };
export function aliasTargets(documentType: string, relationships: unknown, steps: AutomationStep[], step: AutomationStep): AliasTarget[] {
  const out: AliasTarget[] = [{ alias: "trigger", doctype: documentType, label: "Trigger record" }];
  let rel: unknown = relationships; try { if (typeof rel === "string") rel = JSON.parse(rel || "[]"); } catch { rel = []; }
  (Array.isArray(rel) ? rel : []).forEach((r: Record<string, unknown>) => { if (r?.["alias"] && r?.["relationship"]) out.push({ alias: String(r["alias"]), doctype: r["target_doctype"] ? String(r["target_doctype"]) : null, label: String(r["relationship"]) }); });
  const at = steps.indexOf(step); if (at < 0) return out;
  steps.slice(0, at).forEach(s => { if (!s.output_alias) return; const p = stepParams(s); out.push({ alias: s.output_alias, doctype: s.action_type === "CreateDocument" ? (p["doctype"] ? String(p["doctype"]) : null) : s.action_type === "ConvertLeadToDeal" ? "CRM Deal" : null, label: `Output of ${s.step_key || s.action_type}` }); });
  return out;
}
