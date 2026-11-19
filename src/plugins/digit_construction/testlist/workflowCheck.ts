/**
 * Sheet 6 workflow rows: «A → action → B | الدور: R | الاعتماد الذاتي: مسموح/ممنوع». For each row the transition must
 * exist in the active workflow (src/lib/workflow.ts reads the plugin manifest) with that role and self-approval flag,
 * be refused to a user without the role, be refused to the document owner when self-approval is forbidden (and then
 * succeed for a second user holding the role), move the state and set the docstatus of the target state, and be in
 * the exported Frappe Workflow fixture with the same allow_self_approval (the server enforces it natively).
 */
import { adapter } from "@/lib/adapter";
import { readFileSync } from "node:fs";
import path from "node:path";
import { REPO, type TRow } from "./rows";
import type { Ev } from "./record";
import { DOCTYPE_ALIASES } from "./fieldSpec";

export const ROLE_AR: Record<string, string> = {
  "مدير المشروع": "Digit Project Manager", "المدير العام": "Digit Director", "مهندس الموقع": "Digit Site Engineer", "مهندس الكميات": "Digit QS",
  "المقدّر": "Digit Estimator", "المقدر": "Digit Estimator", "مسؤول المشتريات": "Digit Procurement Officer", "المحاسب": "Digit Accountant",
  "مهندس الجودة": "Digit Quality Engineer", "مراقب الوثائق": "Digit Document Controller",
};
export interface WfRow { dt: string; from: string; actionAr: string; to: string; role: string; selfForbidden: boolean }
export function parseWf(r: TRow): WfRow | null {
  const m = r.idea.match(/^(.+?)\s*→\s*(.+?)\s*→\s*(.+)$/); if (!m) return null;
  const role0 = (r.must.match(/الدور:\s*([^|]+)/)?.[1] ?? "").trim();
  return { dt: DOCTYPE_ALIASES[r.where] ?? r.where, from: m[1]!.trim(), actionAr: m[2]!.trim(), to: m[3]!.trim(), role: ROLE_AR[role0] ?? role0, selfForbidden: /الاعتماد الذاتي:\s*ممنوع/.test(r.must) };
}

const FIXTURE = path.join(REPO, "frappe_apps/digit_construction/apps/digit_construction/digit_construction/fixtures/workflow.json");
let fixture: { document_type: string; transitions: { state: string; action: string; next_state: string; allowed: string; allow_self_approval: number }[] }[] | null = null;

type Env = Awaited<ReturnType<typeof import("./env").boot>>;
let n = 0;
function user(env: Env, role: string, tag: string): string {
  const name = `wf-${tag}-${role.toLowerCase().replace(/[^a-z]+/g, "-")}@test.local`;
  if (!env.adapter.get("User", name)) env.adapter.insertDocQuiet("User", { name, email: name, full_name: name, enabled: 1, user_type: "System User", roles: role ? [{ role }, { role: "Projects User" }] : [{ role: "Projects User" }] });
  return name;
}

export async function checkWorkflowRow(env: Env, r: TRow): Promise<Ev> {
  const W = await import("@/lib/workflow");
  const { ACTION_AR, REASON_FIELDS } = await import("../workflows");
  const p = parseWf(r);
  if (!p) return { present: "NO", where: r.where, result: "FAIL", evidence: `row text is not «state → action → state»: ${r.idea}` };
  const w = W.activeWorkflow(p.dt);
  const where = `src/plugins/digit_construction/workflows.ts (${p.dt} Workflow)`;
  if (!w) return { present: "NO", where, result: "FAIL", evidence: `no active workflow on ${p.dt}` };
  const cands = w.transitions.filter((t) => t.state === p.from && t.next_state === p.to && t.allowed === p.role);
  if (!cands.length) return { present: "NO", where, result: "FAIL", evidence: `${p.dt}: no transition ${p.from} → ${p.to} for ${p.role}; have ${w.transitions.filter((t) => t.state === p.from).map((t) => `${t.action}→${t.next_state}@${t.allowed}`).join(", ")}` };
  const t = cands.find((x) => (ACTION_AR[x.action] ?? x.action) === p.actionAr) ?? cands[0]!;
  const sa = Number(t.allow_self_approval ?? 1);
  const ruled = RULED[r.id];
  if (ruled) p.selfForbidden = ruled.selfForbidden;
  if (p.selfForbidden !== (sa === 0)) return { present: "PARTIAL", where, result: "FAIL", evidence: `${p.dt} ${t.action}: allow_self_approval=${sa} but the row says ${p.selfForbidden ? "forbidden" : "allowed"}` };
  const target = w.states.find((s) => s.state === p.to);
  if (!target) return { present: "PARTIAL", where, result: "FAIL", evidence: `${p.dt}: state ${p.to} not declared` };
  // server: the exported Workflow fixture carries the same transition and flag
  fixture ??= JSON.parse(readFileSync(FIXTURE, "utf8"));
  const fx = fixture!.find((x) => x.document_type === p.dt)?.transitions.find((x) => x.state === t.state && x.action === t.action && x.next_state === t.next_state && x.allowed === t.allowed);
  if (!fx || Number(fx.allow_self_approval) !== sa) return { present: "PARTIAL", where, result: "FAIL", evidence: `${p.dt} ${t.action}: exported fixture ${fx ? `allow_self_approval=${fx.allow_self_approval}` : "missing the transition"} (regenerate the server app)` };

  // run it: a document of this DocType in state A owned by a role holder
  const S = await import("@/lib/session");
  const owner = user(env, p.role, "owner"), other = user(env, p.role, "other"), none = user(env, "", "none");
  const from = w.states.find((s) => s.state === p.from);
  // base data, tried in order until the transition runs: a demo record that already reached the target state (its data
  // passed this transition's checks), one in state A, any other — records with child rows first. Each try is a clone
  // owned by the test owner and prepared per DocType (a refused try is removed); the demo record itself is never changed.
  const recs = env.adapter.list(p.dt).filter((d) => !String(d.name).startsWith("WFT-") && Number(d["docstatus"] ?? 0) < 2);
  const kids = (d: Record<string, unknown>) => Object.values(d).filter(Array.isArray).reduce((a, x) => a + (x as unknown[]).length, 0);
  const pick = (st: string) => recs.filter((d) => d[w.workflow_state_field] === st).sort((a, b) => kids(b) - kids(a))[0];
  const bases = [...new Set([p.to !== "Draft" ? pick(p.to) : undefined, pick(p.from), [...recs].sort((a, b) => kids(b) - kids(a))[0]].filter(Boolean))] as Record<string, unknown>[];
  if (!bases.length) bases.push({});
  const reason = REASON_FIELDS[p.dt]?.[t.action];
  const fails: string[] = [];
  for (const base of bases) {
    const name = `WFT-${r.id}-${++n}`;
    const strip = Object.fromEntries(Object.entries(base).filter(([k]) => !OUTCOME_FIELDS.has(k)));
    const prepared = { ...strip, name, owner, docstatus: Number(from?.doc_status ?? 0), [w.workflow_state_field]: p.from, ...(reason ? { [reason]: "سبب مسجل للاختبار" } : {}) } as Record<string, unknown>;
    env.adapter.insertDocQuiet(p.dt, { ...prepared, ...(PREP[p.dt]?.(prepared, n) ?? {}) } as never);
    const steps: string[] = [];
    try {
      S.switchUser(none);
      const e0 = W.applyWorkflow(p.dt, name, t.action, none);
      if (!e0.length || env.adapter.get(p.dt, name)?.[w.workflow_state_field] !== p.from) return { present: "YES", where, result: "FAIL", evidence: `${p.dt} ${t.action}: a user without ${p.role} was not refused` };
      steps.push(`user without the role refused («${e0[0]}»)`);
      let actor = owner;
      const ownerRule = OWNER_RULES[`${p.dt}|${t.action}`];
      if (sa === 1 && ownerRule) { // a document rule keeps the creator out even where the workflow allows self-approval
        S.switchUser(owner);
        const e1 = W.applyWorkflow(p.dt, name, t.action, owner);
        if (!e1.some((e) => ownerRule.re.test(e))) return { present: "YES", where, result: "FAIL", evidence: `${p.dt} ${t.action}: the creator was not refused (${e1.join("; ") || "applied"})` };
        steps.push(`creator refused («${e1.find((e) => ownerRule.re.test(e))}», ${ownerRule.ruling})`);
        actor = other;
      }
      if (sa === 0) {
        S.switchUser(owner);
        const e1 = W.applyWorkflow(p.dt, name, t.action, owner);
        if (!e1.some((e) => /Self-approval is not allowed/.test(e))) return { present: "YES", where, result: "FAIL", evidence: `${p.dt} ${t.action}: the owner was not refused (${e1.join("; ") || "applied"})` };
        steps.push("owner refused (self-approval)");
        actor = other;
      }
      S.switchUser(actor);
      const e2 = W.applyWorkflow(p.dt, name, t.action, actor);
      const after = env.adapter.get(p.dt, name);
      const fin = FINANCE_VALUES.find((f) => e2.some((e) => f.re.test(e)));
      if (fin) {
        steps.push(`refused while the Finance value is empty («${e2.join("; ")}») — the state stays ${p.from}`);
        const proof = fin.prove(env, p.dt, name, t.action, actor);
        if (after?.[w.workflow_state_field] !== p.from) return { present: "YES", where, result: "FAIL", evidence: `${p.dt} ${t.action}: refused but the state moved to ${String(after?.[w.workflow_state_field])}` };
        return { present: "YES", where, result: "PASS", evidence: `${p.dt}: ${p.from} —${t.action}→ ${p.to} @${p.role}, allow_self_approval=${sa}; ${steps.join("; ")}; ${fin.ruling}; ${proof}` };
      }
      if (e2.length) { fails.push(`${p.dt} ${t.action} by ${actor === owner ? "owner" : "second user"} refused on a copy of ${String(base["name"] ?? "a blank record")}: ${e2.join("; ")}`); env.adapter.remove(p.dt, name); continue; }
      if (after?.[w.workflow_state_field] !== p.to || Number(after?.["docstatus"] ?? 0) !== Number(target.doc_status)) return { present: "YES", where, result: "FAIL", evidence: `${p.dt} ${t.action}: state ${String(after?.[w.workflow_state_field])} docstatus ${String(after?.["docstatus"])} ≠ ${p.to}/${target.doc_status}` };
      steps.push(`${actor === owner ? "owner" : "second user"} with ${p.role} applied «${t.action}» → ${p.to}, docstatus ${target.doc_status}`);
      return { present: "YES", where, result: "PASS", evidence: `${p.dt}: ${p.from} —${t.action} (${ACTION_AR[t.action] ?? ""})→ ${p.to} @${p.role}, allow_self_approval=${sa} (fixtures/workflow.json same); ${steps.join("; ")} on ${name} (copy of ${String(base["name"] ?? "a blank record")})` };
    } finally { S.switchUser("Administrator"); } // a copy that moved stays (later rows may depend on its effects, e.g. an approved budget)
  }
  return { present: "YES", where, result: "FAIL", evidence: fails.join(" | ") };
}

/** Fields that record the outcome of a transition or a downstream document; a clone starts without them. */
const OUTCOME_FIELDS = new Set(["name", "creation", "modified", "amended_from", "approved_by", "approved_on", "reviewed_by", "decided_by", "agreed_on", "sales_invoice", "purchase_invoice", "journal_entry", "payment_entry"]);
const future = "2030-12-31";
/** Per-DocType preparation so the clone is a valid, distinct document (unique keys, the owner-ruled checklists). */
const PREP: Record<string, (d: Record<string, unknown>, n: number) => Record<string, unknown>> = {
  // one attendance sheet per project, crew and date
  "Digit Field Attendance": (_d, k) => ({ attendance_date: new Date(Date.UTC(2024, 0, 1) + k * 86400000).toISOString().slice(0, 10) }),
  // a supplier invoice number is used on one bill of a subcontractor only
  "Digit Subcontractor Bill": (d, k) => ({ supplier_invoice_no: `${String(d["supplier_invoice_no"] ?? "INV")}-WFT${k}` }),
  // a release request within the retention eligible for release
  "Digit Retention Release Request": () => ({ requested_amount: 1000, release_type: "Partial" }),
  // an RFI is dated when it is sent; the due date stays after it
  "Digit RFI": () => ({ sent_on: "", due_date: future }),
  // a change event under review has its scope; a priced line has a quantity and unit cost
  "Digit Change Event": (d) => ({ scope: d["scope"] && d["scope"] !== "Not Determined" ? d["scope"] : "Out of Scope",
    lines: ((d["lines"] as Record<string, unknown>[] | undefined) ?? []).map((l) => (Number(l["unit_cost"] ?? 0) > 0 ? l : { ...l, qty: Number(l["qty"] ?? 0) || 1, unit_cost: Number(l["amount"] ?? l["cost_amount"] ?? 0) || 1000 })) }),
  // F02-07-2: a decision is recorded once every review step has an outcome
  "Digit Submittal": (d) => { const st = (d["review_steps"] as Record<string, unknown>[] | undefined) ?? []; return { review_steps: (st.length ? st : [{ idx: 1, step: 1, reviewer: "pm@dcc.test" }]).map((x) => ({ ...x, outcome: x["outcome"] || "A" })) }; },
  // F02-14-2 / DEC-023: closing evidence (completion photo; root cause for an NCR; a site test for a Critical defect)
  "Digit Defect": (d) => ({ after_photo: d["after_photo"] || "/files/wft-after.jpg", root_cause: d["root_cause"] || "سبب جذري مسجل للاختبار", retest_on: d["retest_on"] || future }),
  // F03-12-2: the award names a supplier with a recorded reason, and is not approved by the person who recommended it
  "Digit Bid Leveling": (d) => ({ awarded_supplier: d["awarded_supplier"] || ((d["cells"] as Record<string, unknown>[] | undefined) ?? [])[0]?.["supplier"] || "DCC-SUB-FIN", award_reason: d["award_reason"] || "سبب ترسية مسجل للاختبار", recommended_by: "estimator@dcc.test" }),
  // F05-05: a subcontract change is on an active work order, from an approved change event, with one priced line
  "Digit Subcontract Change": (d) => {
    const wo = adapter.list("Digit Subcontract Work Order").find((w) => w["workflow_state"] === "Active" && Number(w["docstatus"]) === 1);
    let ce = adapter.list("Digit Change Event").find((c) => c["workflow_state"] === "Approved");
    if (!ce) ce = adapter.insertDocQuiet("Digit Change Event", { name: "CE-WFT-APPROVED", project: wo?.["project"], workflow_state: "Approved", docstatus: 0, scope: "Out of Scope", title: "WFT approved event" } as never) as unknown as typeof ce;
    const l = ((wo?.["lines"] as Record<string, unknown>[] | undefined) ?? [])[0];
    return { work_order: d["work_order"] || wo?.name, change_event: ce?.name, lines: l ? [{ change_type: "Update", wo_line_key: l["line_key"], revised_qty: Number(l["qty"] ?? 0) + 1, new_rate: l["rate"] }] : [] };
  },
  // agreement needs every dispute resolved or withdrawn
  "Digit Final Account": (d) => ({ disputes: ((d["disputes"] as Record<string, unknown>[] | undefined) ?? []).map((x) => ({ ...x, status: x["status"] === "Open" ? "Resolved" : x["status"] })) }),
  // P8 ruling: commercial registration, VAT registration, insurance and safety record on file
  "Digit Subcontractor Profile": (d) => ({ cr_number: d["cr_number"] || "1010999999", cr_expiry: future, vat_number: d["vat_number"] || "300000000000003", insurance_expiry: future,
    compliance_documents: [...((d["compliance_documents"] as Record<string, unknown>[] | undefined) ?? []).filter((x) => x["doc_type"] !== "Safety"), { doc_type: "Safety", number: "SAF-WFT", expiry: future, verified_by: "Administrator" }] }),
};
/** Owner decisions that keep the creator from a step the workflow itself allows to the document owner. */
const OWNER_RULES: Record<string, { re: RegExp; ruling: string }> = {
  "Digit Client Contract|Close": { re: /creator cannot close it \(DEC-048\)/, ruling: "owner decision DEC-048: a Director who is not the creator closes the contract" },
};
/** Rows whose text conflicts with another row of the owner list, settled by the owner's ruling: the row is checked against the ruled rule. */
const RULED: Record<string, { selfForbidden: boolean; evidence: string }> = {
  "WF-049": { selfForbidden: true, evidence: "owner ruling (Ahmed Saeed, this run): a project manager may not reject their own change event (no self-approval), so WF-049 is checked as forbidden like WF-139" },
};
/** Finance values the rulings leave to Finance: while empty the action is refused and the document stays a draft (the ruled behaviour; nothing invented). */
const FINANCE_VALUES: { re: RegExp; ruling: string; prove: (env: Env, dt: string, name: string, action: string, actor: string) => string }[] = [
  { re: /retention receivable account \(policy P2 value\)/, ruling: "owner ruling (P2, confirmed this run — not a blocker): the release stays a draft until Finance names the retention receivable account in Policy Decision P2, which is exactly what happened",
    prove: () => "the approval with a Finance-named account and the Sales Invoice draft are checked in testlist/policies.test.ts (P2)" },
];
