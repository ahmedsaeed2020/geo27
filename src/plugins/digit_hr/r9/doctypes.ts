/**
 * HR R9 — the 10 original DocType definitions behind the owner-approved R9 features APR-01/02, POR-03/04, CAS-04, HIR-04,
 * PAY-04 (owner authorization 2026-11-10). The JSON and controller files in ./source are byte copies from digit_hr-main.zip
 * (Mostaad 9cbd7d8, archive sha256 1df9f7fe…; per-file SHA-256 in ./source/SOURCE.md) and are converted here without
 * editing a field, option, permission or name, so the preview forms match the Frappe app exactly. The controller .py files
 * are kept beside them as .py.txt for review only (the native package ships the originals); their rules run as doc hooks
 * in ./hooks.ts. No ?raw import, so the bun generators that load the plugin registry keep working.
 */
import type { DocField } from "@/lib/catalog";
import type { PluginDocType } from "../../types";
import dad from "./source/digit_approval_delegation.json";
import dadi from "./source/digit_approval_delegation_item.json";
import dbc from "./source/digit_bank_change_request.json";
import dcr from "./source/digit_hr_case_routing_rule.json";
import doi from "./source/digit_onboarding_invite.json";
import dpa from "./source/digit_parallel_approval.json";
import dpar from "./source/digit_parallel_approver.json";
import dpl from "./source/digit_payroll_period_lock.json";
import dsce from "./source/digit_service_catalog_eligibility.json";
import dsci from "./source/digit_service_catalog_item.json";

export const DAD = "DIGIT HR Approval Delegation";
export const DAD_ITEM = "DIGIT Approval Delegation Item";
export const DBC = "DIGIT Bank Change Request";
export const DCR = "DIGIT HR Case Routing Rule";
export const DOI = "DIGIT Onboarding Invite";
export const DPA = "DIGIT Parallel Approval";
export const DPA_ROW = "DIGIT Parallel Approver";
export const DPL = "DIGIT Payroll Period Lock";
export const DSC_ELIG = "DIGIT Service Catalog Eligibility";
export const DSC_ITEM = "DIGIT Service Catalog Item";

type SourceJson = { name: string; module?: string; autoname?: string; naming_rule?: string; title_field?: string; istable?: number;
  is_submittable?: number; track_changes?: number; search_fields?: string; fields: Record<string, unknown>[]; permissions?: Record<string, unknown>[] };

const PERM_KEYS = ["read", "write", "create", "delete", "submit", "cancel", "report", "export", "print", "email", "share", "if_owner"] as const;

/** Frappe DocType JSON → manifest DocType: every field kept as written (only the row index `idx` is dropped). */
export function fromSource(j: SourceJson): PluginDocType {
  const fields = j.fields.map((f) => { const { idx: _idx, ...rest } = f; return rest as DocField; });
  const permissions = (j.permissions ?? []).map((p) => {
    const out: PluginDocType["permissions"][number] = { role: String(p["role"]) };
    for (const k of PERM_KEYS) if (Number(p[k] ?? 0) === 1) out[k] = 1;
    return out;
  });
  const d: PluginDocType = { name: j.name, module: j.module ?? "DIGIT HR", fields, permissions };
  if (j.autoname) d.autoname = j.autoname;
  if (j.naming_rule) d.naming_rule = j.naming_rule;
  if (j.title_field) d.title_field = j.title_field;
  if (j.search_fields) d.search_fields = j.search_fields;
  if (j.istable) d.istable = 1;
  if (j.is_submittable) d.is_submittable = 1;
  if (j.track_changes) d.track_changes = 1;
  return d;
}

const SRC: SourceJson[] = [dadi, dpar, dsce, dad, dpa, dsci, dbc, dcr, dpl, doi] as SourceJson[];
export const R9_DOCTYPES: PluginDocType[] = SRC.map(fromSource);

/** Approved R9 feature → the DocTypes it needs (tracker TRACKER_147.csv source_path). */
export const R9_FEATURES: Record<string, string[]> = {
  "APR-01": [DAD, DAD_ITEM], "APR-02": [DPA, DPA_ROW], "POR-03": [DSC_ITEM, DSC_ELIG], "POR-04": [DBC],
  "CAS-04": [DCR], "HIR-04": [DOI], "PAY-04": [DPL],
};

/** Section placement, from each feature's tracker next_step (05.2 delegation register, 05.1 request form, 05.3 HR service
 *  configuration, 04.1 payroll period, 02.2 onboarding invite). Child tables are reached through their parents. */
export const R9_MAP: Record<string, string[]> = {
  "05.1": [DBC], "05.2": [DAD, DPA], "05.3": [DSC_ITEM, DCR], "04.1": [DPL], "02.2": [DOI],
};

/** POR-03 adds `service_item` to DIGIT HR Service Case (digit_hr_service_case.json in the same archive, right after category). */
export const DSC_SERVICE_ITEM_FIELD: DocField = { fieldname: "service_item", fieldtype: "Link", label: "Service", options: DSC_ITEM,
  description: "POR-03: the catalog service this case was opened from (sets category, severity and SLA)" };
