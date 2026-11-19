/**
 * FIN-06 Reporting governance & audit (Run 6) — read-only diagnostics over what already exists; no policy is set here
 * (report freshness thresholds, field masking and export policy wait on owner decision OD-32):
 *  - report register: every app report, its source DocType and related sources, how it runs (Virtual Core read model;
 *    the Frappe Script Report is a raising stub until ported), whether it needs an explicit project;
 *  - source availability: per source DocType whether the session user may read it and, only then, how many records
 *    and the raw latest change (timestamp and user) — no "stale" judgement without a threshold;
 *  - permission matrix: the DocType permission rules (role, permlevel 0) for the construction roles, as stored;
 *  - live check: runs each report now for the session user through the same row source as cards and charts;
 *  - audit trail: Framework Version records of governance records (policy decisions, settings, published dashboard
 *    layouts, print artifacts, cost allocations / reviews) the user may read.
 */
import { adapter, type Doc } from "@/lib/adapter";
import { cachedMeta } from "@/lib/catalog";
import { currentUser, permRules } from "@/lib/session";
import { canReadType } from "@/lib/scope";
import type { PluginReport } from "@/plugins/types";
import { CONSTRUCTION_REPORTS } from "../reports";
import { projectRequired, reportRows } from "../analytics/reportRows";
import { list } from "./data";

export const GOVERNANCE_ROLES = ["Digit Director", "Digit Project Manager", "Digit QS", "Digit Estimator", "Digit Procurement Officer", "Digit Site Engineer", "Digit Accountant", "System Manager"] as const;
export const AUDITED_DOCTYPES = ["Digit Policy Decision", "Digit Construction Settings", "Digit Dashboard Layout", "Digit Print Artifact", "Digit Cost Allocation", "Digit Cost Exception Review"];

export interface ReportEntry { name: string; ref_doctype: string; sources: string[]; project_required: boolean; filters: string[]; runs: "VIRTUAL_READ_MODEL"; server: "SCRIPT_REPORT_STUB" | "NONE"; can_read_source: boolean }
const isFieldRef = (r: PluginReport, o: string) => r.columns.some((c) => c.fieldname === o) || o === "source_doctype";
/** Sources of a report: its ref DocType plus every Link target of its columns and filters (Dynamic Link targets vary per row). */
export function reportSources(r: PluginReport): string[] {
  const links = [...r.columns, ...(r.filters ?? [])].filter((c) => c.fieldtype === "Link" && c.options && !isFieldRef(r, String(c.options))).map((c) => String(c.options));
  return [...new Set([r.ref_doctype, ...links])];
}
const canRead = (dt: string, user: string) => canReadType(dt, user);
export function reportRegister(user = currentUser()): ReportEntry[] {
  return CONSTRUCTION_REPORTS.map((r) => ({ name: r.name, ref_doctype: r.ref_doctype, sources: reportSources(r), project_required: projectRequired(r), filters: (r.filters ?? []).map((f) => f.fieldname),
    runs: "VIRTUAL_READ_MODEL" as const, server: r.script && /FRAPPE_SERVER_REQUIRED/.test(r.script) ? "SCRIPT_REPORT_STUB" as const : "NONE" as const, can_read_source: canRead(r.ref_doctype, user) }));
}

export interface SourceInfo { doctype: string; owned: boolean; readable: boolean; records: number | null; latest: string | null; latest_by: string | null; reports: string[] }
/** Per source DocType: readable by the user, and only then the record count and raw latest change (no threshold). */
export function sourceAvailability(user = currentUser()): SourceInfo[] {
  const by = new Map<string, string[]>();
  for (const r of CONSTRUCTION_REPORTS) for (const s of reportSources(r)) by.set(s, [...(by.get(s) ?? []), r.name]);
  return [...by.entries()].map(([doctype, reports]) => {
    const readable = canRead(doctype, user);
    const owned = doctype.startsWith("Digit ");
    if (!readable) return { doctype, owned, readable, records: null, latest: null, latest_by: null, reports };
    const rows = list(doctype);
    let latest: Doc | undefined;
    for (const d of rows) if (!latest || String(d["modified"] ?? d["creation"] ?? "") > String(latest["modified"] ?? latest["creation"] ?? "")) latest = d;
    return { doctype, owned, readable, records: rows.length, latest: latest ? String(latest["modified"] ?? latest["creation"] ?? "") || null : null, latest_by: latest ? String(latest["modified_by"] ?? latest["owner"] ?? "") || null : null, reports };
  }).sort((a, b) => Number(b.owned) - Number(a.owned) || a.doctype.localeCompare(b.doctype));
}

/** Stored DocType permission rules (permlevel 0) per role: r read · w write · c create · s submit · e export · p print; "own" = if_owner. */
export function permissionCell(doctype: string, role: string): string {
  const meta = cachedMeta(doctype); if (!meta) return "?";
  const rules = permRules(meta).filter((p) => p.role === role && Number(p.permlevel ?? 0) === 0);
  if (!rules.length) return "";
  const has = (k: string) => rules.some((p) => Number(p[k] ?? 0) === 1);
  const letters = [["read", "r"], ["write", "w"], ["create", "c"], ["submit", "s"], ["export", "e"], ["print", "p"]].filter(([k]) => has(k!)).map(([, l]) => l).join("");
  return rules.every((p) => Number(p.if_owner ?? 0) === 1) ? `${letters} own` : letters;
}

export interface LiveCheck { report: string; status: "OK" | "EMPTY" | "DENIED" | "ERROR"; rows: number; ms: number; error?: string }
/** Runs a report now for the session user (the only user reportRows can run as) through the shared row source
 *  (project-required reports per readable project). */
export function liveCheck(name: string): LiveCheck {
  const r = CONSTRUCTION_REPORTS.find((x) => x.name === name);
  if (!r) return { report: name, status: "ERROR", rows: 0, ms: 0, error: "Report not registered" };
  if (!canRead(r.ref_doctype, currentUser())) return { report: name, status: "DENIED", rows: 0, ms: 0 };
  const t0 = typeof performance !== "undefined" ? performance.now() : Date.now();
  try {
    const rows = reportRows(name, {});
    const ms = Math.round((typeof performance !== "undefined" ? performance.now() : Date.now()) - t0);
    return { report: name, status: rows.length ? "OK" : "EMPTY", rows: rows.length, ms };
  } catch (e) { return { report: name, status: "ERROR", rows: 0, ms: 0, error: (e as Error).message }; }
}

export interface AuditEntry { version: string; at: string; doctype: string; docname: string; by: string; created: boolean; changes: [string, unknown, unknown][] }
// an empty field saved as "" (undefined → "") is not a change
const blank = (v: unknown) => v === null || v === undefined || v === "";
const parse = (v: unknown): { changed?: [string, unknown, unknown][]; created?: boolean } => { try { return JSON.parse(String(v ?? "{}")) as never; } catch { return {}; } };
/** Version records of governance DocTypes whose document the user may read, newest first. */
export function auditTrail(limit = 100, user = currentUser()): AuditEntry[] {
  const readable = new Map<string, Set<string>>();
  // personal dashboard layouts stay private to their owner even for roles that may read them (FIN-05 rule)
  const personal = (d: Doc) => d["level"] === "User" && String(d["owner"] ?? "") !== user;
  for (const dt of AUDITED_DOCTYPES) readable.set(dt, canRead(dt, user) ? new Set(list(dt).filter((d) => dt !== "Digit Dashboard Layout" || !personal(d)).map((d) => d.name)) : new Set());
  return adapter.list("Version").filter((v) => readable.get(String(v["ref_doctype"]))?.has(String(v["docname"]))).map((v) => {
    const data = parse(v["data"]); const ch = data.changed ?? [];
    const by = String(ch.find((c) => c[0] === "modified_by")?.[2] ?? (data.created ? adapter.get(String(v["ref_doctype"]), String(v["docname"]))?.["owner"] ?? "" : ""));
    return { version: v.name, at: String(v["creation"] ?? ""), doctype: String(v["ref_doctype"]), docname: String(v["docname"]), by, created: !!data.created, changes: ch.filter((c) => c[0] !== "modified" && c[0] !== "modified_by" && !(blank(c[1]) && blank(c[2]))) };
  }).filter((e) => e.created || e.changes.length).sort((a, b) => b.at.localeCompare(a.at) || b.version.localeCompare(a.version)).slice(0, limit);
}
