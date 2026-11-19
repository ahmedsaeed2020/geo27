/**
 * ADV-01 Advance & retention hub — schedules and movements read from existing records only.
 * One schedule per contract and kind:
 *  - client advance (Digit Client Contract advance terms): receipts = unallocated customer Payment Entries of the
 *    project (ledger evidence), recoveries = advance_recovery of submitted client certificates;
 *  - client retention: held = retention of submitted certificates, released = approved Digit Retention Release
 *    Requests, reserved = requests pending approval;
 *  - subcontract advance (Digit Subcontract Work Order advance terms): payments = unallocated supplier Payment Entries
 *    of the project, recoveries = advance_recovery of submitted subcontractor bills;
 *  - subcontract retention: held = retention_amount of submitted subcontractor bills (no release document exists).
 * The contractual term (scheduled amount) is never presented as a ledger balance; nothing here writes a record.
 */
import { contractValues, num, r2, retentionEligible, sumBy } from "./calc";
import { isSubmitted, list, policyDefined, retentionAccount, rows } from "./data";
import type { Doc } from "@/lib/adapter";

export type ScheduleKind = "advance" | "retention";
export type Stream = "client" | "subcontract";
export type MoveKind = "receipt" | "payment" | "recovery" | "held" | "released" | "reserved";
export interface Movement { key: string; kind: MoveKind; date: string; amount: number; doctype: string; name: string; table: string; row: number; balance: number; note: string }
export type ScheduleFlag = "ADVANCE_NO_EVIDENCE" | "ADVANCE_OVER_RECOVERED" | "ADVANCE_OPEN_AT_COMPLETION" | "RETENTION_ABOVE_CAP" | "RELEASE_EXCEEDS_HELD" | "RELEASE_BLOCKED_P2" | "MISSING_DATE";
export interface Schedule {
  id: string; kind: ScheduleKind; stream: Stream; contract_doctype: string; contract: string; contract_title: string; project: string; counterparty: string; currency: string; status: string;
  /** contractual basis — terms, not ledger */
  term_amount: number; term_pct: number; cap_pct: number; cap_amount: number;
  /** advance: received/paid evidence and recovered; retention: held, released, reserved */
  evidence: number; processed: number; available: number; reserved: number; eligible: number;
  movements: Movement[]; flags: ScheduleFlag[]; last_event: string; release_capability: "request" | "unavailable" | "n/a";
}
const live = (d: Doc) => num(d.docstatus) === 1;
const dated = (asOf: string | undefined, d: string) => !asOf || (d !== "" && d <= asOf);
function finish(s: Omit<Schedule, "last_event" | "movements"> & { movements: Movement[] }): Schedule {
  const ms = [...s.movements].sort((a, b) => (a.date || "9999").localeCompare(b.date || "9999") || a.key.localeCompare(b.key));
  let bal = 0;
  for (const m of ms) {
    const sign = s.kind === "advance" ? (m.kind === "recovery" ? -1 : m.kind === "reserved" ? 0 : 1) : (m.kind === "held" ? 1 : m.kind === "released" ? -1 : 0);
    bal = r2(bal + sign * m.amount); m.balance = bal;
  }
  return { ...s, movements: ms, last_event: ms.filter((m) => m.date).map((m) => m.date).sort().pop() ?? "" };
}
function unallocatedPayments(party: string, project: string, type: "Receive" | "Pay", asOf?: string): Movement[] {
  return list("Payment Entry", (pe) => isSubmitted(pe) && pe["payment_type"] === type && pe["party"] === party && pe["project"] === project).flatMap((pe) => {
    const refs = rows(pe, "references");
    const amt = refs.length ? num(pe["unallocated_amount"]) : num(pe["unallocated_amount"]) || num(pe["paid_amount"]);
    const date = String(pe["posting_date"] ?? "");
    return amt > 0.005 && dated(asOf, date) ? [{ key: `PE|${pe.name}`, kind: type === "Receive" ? "receipt" as const : "payment" as const, date, amount: r2(amt), doctype: "Payment Entry", name: pe.name, table: "", row: 0, balance: 0, note: String(pe["reference_no"] ?? "") }] : [];
  });
}

/** All advance and retention schedules of a project (client contracts and subcontract work orders). */
export function schedulesOf(project: string, asOf?: string): Schedule[] {
  const out: Schedule[] = [];
  for (const c of list("Digit Client Contract", (x) => x["project"] === project && x["workflow_state"] !== "Draft")) {
    const certs = list("Digit Client Certificate", (x) => x["contract"] === c.name && live(x) && x["workflow_state"] !== "Cancelled");
    const revised = num(c["revised_value"]) || contractValues(rows(c, "sov_lines")).revised;
    const done = ["Completed", "Closed"].includes(String(c["workflow_state"]));
    const base = { contract_doctype: "Digit Client Contract", contract: c.name, contract_title: String(c["title"] ?? c.name), project, counterparty: String(c["customer"] ?? ""), currency: String(c["currency"] ?? "SAR"), status: String(c["workflow_state"] ?? "") };
    // advance
    const advTerm = num(c["advance_amount"]);
    if (advTerm > 0 || certs.some((x) => num(x["advance_recovery"]) > 0)) {
      const rec: Movement[] = certs.filter((x) => num(x["advance_recovery"]) > 0).map((x) => ({ key: `CERT|${x.name}`, kind: "recovery", date: String(x["cert_date"] ?? ""), amount: r2(num(x["advance_recovery"])), doctype: "Digit Client Certificate", name: x.name, table: "", row: 0, balance: 0, note: "" }));
      const receipts = unallocatedPayments(base.counterparty, project, "Receive", asOf);
      const ms = [...receipts, ...rec.filter((m) => dated(asOf, m.date))];
      const recovered = r2(sumBy(ms.filter((m) => m.kind === "recovery"), (m) => m.amount)), evidence = r2(sumBy(receipts, (m) => m.amount));
      const flags: ScheduleFlag[] = [];
      if (advTerm > 0 && evidence <= 0.005) flags.push("ADVANCE_NO_EVIDENCE");
      if (recovered - advTerm > 0.005) flags.push("ADVANCE_OVER_RECOVERED");
      if (done && advTerm - recovered > 0.005) flags.push("ADVANCE_OPEN_AT_COMPLETION");
      if (rec.some((m) => !m.date)) flags.push("MISSING_DATE");
      out.push(finish({ ...base, id: `ADV|${c.name}`, kind: "advance", stream: "client", term_amount: advTerm, term_pct: num(c["advance_recovery_pct"]), cap_pct: 0, cap_amount: 0,
        evidence, processed: recovered, available: r2(Math.max(0, advTerm - recovered)), reserved: 0, eligible: 0, movements: ms, flags, release_capability: "n/a" }));
    }
    // retention
    const pct = num(c["retention_pct"]);
    if (pct > 0 || certs.some((x) => num(x["retention"]) > 0)) {
      const rrr = list("Digit Retention Release Request", (x) => x["contract"] === c.name && num(x.docstatus) !== 2 && x["workflow_state"] !== "Rejected");
      const held: Movement[] = certs.filter((x) => num(x["retention"]) > 0).map((x) => ({ key: `CERT|${x.name}`, kind: "held", date: String(x["cert_date"] ?? ""), amount: r2(num(x["retention"])), doctype: "Digit Client Certificate", name: x.name, table: "", row: 0, balance: 0, note: "" }));
      const rel: Movement[] = rrr.map((x) => ({ key: `RRR|${x.name}`, kind: live(x) ? "released" : "reserved", date: String(x["modified"] ?? x["creation"] ?? "").slice(0, 10), amount: r2(num(x["requested_amount"])), doctype: "Digit Retention Release Request", name: x.name, table: "", row: 0, balance: 0, note: `${String(x["release_type"] ?? "")} · ${String(x["workflow_state"] ?? "")}` }));
      const ms = [...held, ...rel].filter((m) => m.kind === "reserved" || dated(asOf, m.date));
      const h = r2(sumBy(ms.filter((m) => m.kind === "held"), (m) => m.amount)), released = r2(sumBy(ms.filter((m) => m.kind === "released"), (m) => m.amount)), reserved = r2(sumBy(ms.filter((m) => m.kind === "reserved"), (m) => m.amount));
      const capPct = num(c["retention_cap_pct"]), cap = capPct > 0 ? r2(capPct / 100 * revised) : 0;
      const flags: ScheduleFlag[] = [];
      if (cap > 0 && h - cap > 0.5) flags.push("RETENTION_ABOVE_CAP");
      if (released + reserved - h > 0.005) flags.push("RELEASE_EXCEEDS_HELD");
      if (reserved > 0 && (!policyDefined("P2") || !retentionAccount())) flags.push("RELEASE_BLOCKED_P2"); // P2 ruling: no named account = the release stays a draft
      if (held.some((m) => !m.date)) flags.push("MISSING_DATE");
      out.push(finish({ ...base, id: `RET|${c.name}`, kind: "retention", stream: "client", term_amount: cap, term_pct: pct, cap_pct: capPct, cap_amount: cap,
        evidence: h, processed: released, available: r2(Math.max(0, h - released)), reserved, eligible: retentionEligible(h, released, reserved), movements: ms, flags,
        release_capability: "request" }));
    }
  }
  for (const wo of list("Digit Subcontract Work Order", (x) => x["project"] === project && live(x))) {
    const bills = list("Digit Subcontractor Bill", (x) => x["work_order"] === wo.name && live(x) && x["workflow_state"] !== "Cancelled");
    const base = { contract_doctype: "Digit Subcontract Work Order", contract: wo.name, contract_title: wo.name, project, counterparty: String(wo["subcontractor"] ?? ""), currency: String(wo["currency"] ?? "SAR"), status: String(wo["workflow_state"] ?? "") };
    const advTerm = num(wo["advance_amount"]);
    if (advTerm > 0 || bills.some((x) => num(x["advance_recovery"]) > 0)) {
      const payments = unallocatedPayments(base.counterparty, project, "Pay", asOf);
      const rec: Movement[] = bills.filter((x) => num(x["advance_recovery"]) > 0).map((x) => ({ key: `SCB|${x.name}`, kind: "recovery", date: String(x["bill_date"] ?? ""), amount: r2(num(x["advance_recovery"])), doctype: "Digit Subcontractor Bill", name: x.name, table: "", row: 0, balance: 0, note: "" }));
      const ms = [...payments, ...rec.filter((m) => dated(asOf, m.date))];
      const recovered = r2(sumBy(ms.filter((m) => m.kind === "recovery"), (m) => m.amount)), evidence = r2(sumBy(payments, (m) => m.amount));
      const flags: ScheduleFlag[] = [];
      if (advTerm > 0 && evidence <= 0.005) flags.push("ADVANCE_NO_EVIDENCE");
      if (recovered - advTerm > 0.005) flags.push("ADVANCE_OVER_RECOVERED");
      if (wo["workflow_state"] === "Completed" && advTerm - recovered > 0.005) flags.push("ADVANCE_OPEN_AT_COMPLETION");
      out.push(finish({ ...base, id: `ADV|${wo.name}`, kind: "advance", stream: "subcontract", term_amount: advTerm, term_pct: num(wo["advance_recovery_pct"]), cap_pct: 0, cap_amount: 0,
        evidence, processed: recovered, available: r2(Math.max(0, advTerm - recovered)), reserved: 0, eligible: 0, movements: ms, flags, release_capability: "n/a" }));
    }
    const pct = num(wo["retention_percent"]);
    if (pct > 0 || bills.some((x) => num(x["retention_amount"]) > 0)) {
      const held: Movement[] = bills.filter((x) => num(x["retention_amount"]) > 0).map((x) => ({ key: `SCB|${x.name}`, kind: "held", date: String(x["bill_date"] ?? ""), amount: r2(num(x["retention_amount"])), doctype: "Digit Subcontractor Bill", name: x.name, table: "", row: 0, balance: 0, note: "" }));
      const ms = held.filter((m) => dated(asOf, m.date));
      const h = r2(sumBy(ms, (m) => m.amount));
      out.push(finish({ ...base, id: `RET|${wo.name}`, kind: "retention", stream: "subcontract", term_amount: 0, term_pct: pct, cap_pct: 0, cap_amount: 0,
        evidence: h, processed: 0, available: h, reserved: 0, eligible: 0, movements: ms, flags: held.some((m) => !m.date) ? ["MISSING_DATE"] : [], release_capability: "unavailable" }));
    }
  }
  return out.sort((a, b) => a.contract.localeCompare(b.contract) || a.id.localeCompare(b.id));
}
/** Project totals per kind and stream (each equals the sum of its schedules). */
export function scheduleTotals(ss: Schedule[]) {
  const pick = (k: ScheduleKind, s: Stream) => ss.filter((x) => x.kind === k && x.stream === s);
  const t = (xs: Schedule[], f: keyof Schedule) => r2(sumBy(xs, (x) => num(x[f])));
  return {
    client_advance_term: t(pick("advance", "client"), "term_amount"), client_advance_recovered: t(pick("advance", "client"), "processed"), client_advance_remaining: t(pick("advance", "client"), "available"),
    client_retention_held: t(pick("retention", "client"), "evidence"), client_retention_released: t(pick("retention", "client"), "processed"), client_retention_reserved: t(pick("retention", "client"), "reserved"), client_retention_eligible: t(pick("retention", "client"), "eligible"),
    sub_advance_term: t(pick("advance", "subcontract"), "term_amount"), sub_advance_remaining: t(pick("advance", "subcontract"), "available"), sub_retention_held: t(pick("retention", "subcontract"), "evidence"),
    flagged: ss.filter((x) => x.flags.length).length,
  };
}
