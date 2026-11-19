/**
 * CON-03 Contract versions & effective terms (Run 6) — a read-only view derived from the records that already change a
 * client contract; nothing is stored and no version document exists (owner decision OD-06):
 *  - version 1 = the contract's own schedule-of-values lines (origin Contract), current from the contract start date;
 *  - version n+1 = the SOV lines an approved client variation appended (origin Variation, `variation` link), current
 *    from that variation's approval date. Internal scope changes never add SOV lines, so they are not versions;
 *  - terms = the advance / retention / payment terms; an approved terms revision changes one term from its decision
 *    date onwards (prospective, as decideTermsRevision applies it). Requested and rejected revisions are listed apart.
 * The latest version's cumulative value equals the contract's revised value (contractValues) and the terms in effect
 * today equal the stored contract terms; any difference is reported as a consistency check, never corrected here.
 */
import type { Doc } from "@/lib/adapter";
import { lineAmount, num, r2, sumBy } from "./calc";
import { get, list, rows, today } from "./data";

type Row = Record<string, unknown>;
export const REVISABLE_TERMS = ["advance_recovery_pct", "retention_pct", "retention_cap_pct", "payment_days"] as const;
export type Term = (typeof REVISABLE_TERMS)[number];
export interface ContractVersion {
  no: number; kind: "Contract" | "Variation"; reference: string; current_from: string; approved_by: string;
  lines: Row[]; added_amount: number; cumulative: number; line_count: number;
}
export interface TermEvent { idx: number; term: Term; from: number | null; to: number | null; status: string; requested_by: string; decided_by: string; decided_on: string; reason: string }
export interface TermTimeline { term: Term; original: number; current: number; stored: number; events: TermEvent[] }
export interface ContractVersions {
  contract: Doc; versions: ContractVersion[]; current: ContractVersion; stored_version: number;
  terms: TermTimeline[]; requested: TermEvent[]; rejected: TermEvent[];
  pending_variations: Doc[]; internal_changes: Doc[]; checks: string[];
}

const numOrNull = (v: unknown) => (v === null || v === undefined || v === "" || Number.isNaN(Number(v)) ? null : Number(v));
const dateOf = (v: unknown) => String(v ?? "").slice(0, 10);

export function contractVersions(name: string): ContractVersions | undefined {
  const c = list("Digit Client Contract", (x) => x.name === name)[0];
  if (!c) return undefined;
  const sov = rows(c, "sov_lines").map((l, i): Row => ({ ...l, idx: num(l["idx"]) || i + 1, amount: lineAmount(l["qty"], l["rate"]) }));
  const base = sov.filter((l) => (l["origin"] || "Contract") !== "Variation");
  const byVo = new Map<string, Row[]>();
  for (const l of sov) if (l["origin"] === "Variation") { const k = String(l["variation"] ?? ""); byVo.set(k, [...(byVo.get(k) ?? []), l]); }
  const vos = [...byVo.keys()].map((k) => ({ k, d: k ? get("Digit Client Variation", k) : undefined }))
    .sort((a, b) => dateOf(a.d?.["approved_on"]).localeCompare(dateOf(b.d?.["approved_on"])) || num(byVo.get(a.k)![0]!["idx"]) - num(byVo.get(b.k)![0]!["idx"]));
  const versions: ContractVersion[] = [];
  let cumulative = r2(sumBy(base, (l) => num(l["amount"])));
  versions.push({ no: 1, kind: "Contract", reference: c.name, current_from: dateOf(c["start_date"]) || dateOf(c["creation"]), approved_by: "", lines: base, added_amount: cumulative, cumulative, line_count: base.length });
  for (const { k, d } of vos) {
    const lines = byVo.get(k)!; const added = r2(sumBy(lines, (l) => num(l["amount"]))); cumulative = r2(cumulative + added);
    versions.push({ no: versions.length + 1, kind: "Variation", reference: k, current_from: dateOf(d?.["approved_on"]), approved_by: String(d?.["approved_by"] ?? ""), lines, added_amount: added, cumulative, line_count: versions[versions.length - 1]!.line_count + lines.length });
  }
  const revs: TermEvent[] = rows(c, "terms_revisions").map((r, i) => ({ idx: num(r["idx"]) || i + 1, term: String(r["term"]) as Term, from: numOrNull(r["from_value"]), to: numOrNull(r["to_value"]), status: String(r["status"] ?? "Requested"),
    requested_by: String(r["requested_by"] ?? ""), decided_by: String(r["decided_by"] ?? ""), decided_on: dateOf(r["decided_on"]), reason: String(r["reason"] ?? "") }));
  const approved = revs.filter((r) => r.status === "Approved").sort((a, b) => a.decided_on.localeCompare(b.decided_on) || a.idx - b.idx);
  const terms: TermTimeline[] = REVISABLE_TERMS.map((term) => {
    const ev = approved.filter((r) => r.term === term);
    const stored = num(c[term]);
    const original = ev.length && ev[0]!.from !== null ? ev[0]!.from : stored;
    const current = ev.length && ev[ev.length - 1]!.to !== null ? ev[ev.length - 1]!.to! : original;
    return { term, original, current, stored, events: ev };
  });
  const checks: string[] = [];
  const stored = num(c["sov_version"]) || 1;
  if (stored !== versions.length) checks.push(`Stored SOV version ${stored} differs from the ${versions.length} versions derived from approved variations`);
  if (Math.abs(cumulative - r2(sumBy(sov, (l) => num(l["amount"])))) > 0.005) checks.push("Version values do not add up to the schedule of values");
  for (const t of terms) if (Math.abs(t.current - t.stored) > 1e-9) checks.push(`${t.term}: terms in effect today (${t.current}) differ from the stored contract term (${t.stored})`);
  for (const { k, d } of vos) {
    if (!k) checks.push("Variation lines without a variation link are grouped as one version");
    else if (!d) checks.push(`Variation ${k} on the schedule of values was not found or is not readable`);
    else if (d["workflow_state"] !== "Approved" || num(d.docstatus) === 2) checks.push(`Variation ${k} added schedule-of-values lines but is now ${String(d["workflow_state"] ?? "")}${num(d.docstatus) === 2 ? " (cancelled)" : ""}`);
  }
  const allVos = list("Digit Client Variation", (x) => x["contract"] === c.name && num(x.docstatus) !== 2);
  return { contract: c, versions, current: versions[versions.length - 1]!, stored_version: stored, terms,
    requested: revs.filter((r) => r.status === "Requested"), rejected: revs.filter((r) => r.status === "Rejected"),
    pending_variations: allVos.filter((x) => x["workflow_state"] === "Submitted" && x["change_kind"] === "Client Variation"),
    internal_changes: allVos.filter((x) => x["change_kind"] !== "Client Variation"), checks };
}

/** The version current on a date: the last version whose current-from date is on or before it (version 1 always applies). */
export function versionAt(cv: ContractVersions, date = today()): ContractVersion {
  let v = cv.versions[0]!;
  for (const x of cv.versions.slice(1)) if (x.current_from && x.current_from <= date) v = x;
  return v;
}
/** Terms in effect on a date: the original terms with every approved revision decided on or before that date applied. */
export function termsAt(cv: ContractVersions, date = today()): Record<Term, number> {
  return Object.fromEntries(cv.terms.map((t) => { let v = t.original; for (const e of t.events) if (e.decided_on && e.decided_on <= date && e.to !== null) v = e.to; return [t.term, v]; })) as Record<Term, number>;
}
/** Lines and value added between two versions (from < to); versions only add SOV lines, so nothing is removed. */
export function compareVersions(cv: ContractVersions, from: number, to: number): { added: Row[]; delta: number; from: ContractVersion; to: ContractVersion } | undefined {
  const a = cv.versions.find((v) => v.no === from), b = cv.versions.find((v) => v.no === to);
  if (!a || !b || a.no >= b.no) return undefined;
  const added = cv.versions.filter((v) => v.no > a.no && v.no <= b.no).flatMap((v) => v.lines.map((l) => ({ ...l, version: v.no, reference: v.reference })));
  return { added, delta: r2(b.cumulative - a.cumulative), from: a, to: b };
}
/** Contracts the session user may read in construction projects (scoped list). */
export function versionContracts(projects: Set<string>): Doc[] {
  return list("Digit Client Contract", (c) => projects.has(String(c["project"] ?? ""))).sort((a, b) => a.name.localeCompare(b.name));
}
