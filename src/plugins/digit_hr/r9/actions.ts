/**
 * HR R9 actions — TypeScript ports of the whitelisted digit_hr API methods behind the seven owner-approved R9 features:
 * delegation (APR-01), parallel_approval (APR-02), services catalog/classify (POR-03), bank_change (POR-04),
 * cases route/escalate (CAS-04), payroll_lock state (PAY-04) and onboarding_invite (HIR-04, off unless the site flag is set).
 * Same checks, order and messages as the Python source; every write goes through the shared adapter, so the doc hooks
 * (./hooks.ts), Version history and timelines apply. Things only a Frappe server can do are named, never simulated:
 * a DocShare row does not widen access in this preview, and the joiner's guest page /hr-invite is a Frappe www page.
 */
import { adapter, type Doc } from "@/lib/adapter";
import { currentUser } from "@/plugins/digit_hr/compat/session";
import { _, addDays, addInfoComment, can, isHr, nowDatetime, ownEmployees, PermissionError, R9ValidationError, requireApp, s, sha256Hex, toDate, today, tokenUrlsafe, withFlag } from "./core";
import { DAD, DAD_ITEM, DBC, DOI, DPA, DPA_ROW, DPL, DSC_ITEM } from "./doctypes";
import { catalogItems, eligibleReason, evaluate, locksFor, matchRule, openRound, roundFor, slaState, SUPPORTED } from "./logic";

const DSC = "DIGIT HR Service Case";
const n = (v: unknown) => Number(v ?? 0) || 0;
const rowsOf = (d: Doc, f: string) => (Array.isArray(d[f]) ? d[f] : []) as Doc[];
const hash = () => Math.random().toString(36).slice(2, 12);
function child(dt: string, parent: Doc, parentfield: string, idx: number, data: Record<string, unknown>): Doc {
  return { name: hash(), doctype: dt, docstatus: 0, parent: parent.name, parentfield, parenttype: String(parent.doctype ?? ""), idx, ...data };
}
function save(dt: string, name: string, patch: Record<string, unknown>): Doc {
  adapter.update(dt, name, patch);
  return adapter.get(dt, name)!;
}

// ------------------------------------------------------------------ APR-01 delegation
const SOURCES: Record<string, [string, Record<string, string>]> = {
  "Leave Application": ["leave_approver", { status: "Open" }], "Expense Claim": ["expense_approver", { approval_status: "Draft" }],
  "Shift Request": ["approver", { status: "Draft" }],
};
export type DelegationRow = { doctype: string; name: string; employee: string; employee_name: string; skip?: "own_request" | "already_shared" | "delegator_cannot_approve" | "delegate_cannot_read_employee" };
function delegationDoc(name: string, user = currentUser()): Doc {
  requireApp(user);
  const d = name ? adapter.get(DAD, name) : undefined;
  if (!d || !can(DAD, "write", d, user)) throw new PermissionError(_("You do not have permission to change this delegation"));
  return d;
}
export function delegationCandidates(d: Doc): DelegationRow[] {
  const delegator = s(d["delegator"]), delegate = s(d["delegate"]);
  const own = new Set(ownEmployees(delegate));
  const done = new Set(rowsOf(d, "shared").filter((r) => !n(r["revoked"])).map((r) => `${s(r["reference_doctype"])}::${s(r["reference_name"])}`));
  const out: DelegationRow[] = [];
  for (const [dt, [field, open]] of Object.entries(SOURCES)) {
    const rows = adapter.list(dt).filter((r) => s(r[field]) === delegator && n(r.docstatus) === 0 && s(r["company"]) === s(d["company"]) && Object.entries(open).every(([k, v]) => s(r[k]) === v)).slice(0, 500);
    for (const r of rows) {
      const row: DelegationRow = { doctype: dt, name: r.name, employee: s(r["employee"]), employee_name: s(r["employee_name"]) };
      if (own.has(row.employee)) out.push({ ...row, skip: "own_request" });
      else if (done.has(`${dt}::${r.name}`)) out.push({ ...row, skip: "already_shared" });
      else if (!can(dt, "submit", r, delegator)) out.push({ ...row, skip: "delegator_cannot_approve" });
      else if (dt === "Leave Application" && !can("Employee", "read", adapter.get("Employee", row.employee), delegate)) out.push({ ...row, skip: "delegate_cannot_read_employee" });
      else out.push(row);
    }
  }
  return out;
}
export function delegationPreview(name: string, user = currentUser()) {
  const rows = delegationCandidates(delegationDoc(name, user));
  return { delegation: name, would_share: rows.filter((r) => !r.skip), skipped: rows.filter((r) => r.skip) };
}
export function delegationActivate(name: string, user = currentUser()) {
  const d = delegationDoc(name, user);
  const now = today();
  if (s(d["delegation_status"]) === "Revoked") throw new R9ValidationError(_("A revoked delegation cannot be activated again; create a new one"));
  if (!(s(d["from_date"]).slice(0, 10) <= now && now <= s(d["to_date"]).slice(0, 10))) throw new R9ValidationError(_("The delegation period does not include today"));
  const shared: DelegationRow[] = []; const rows = [...rowsOf(d, "shared")];
  for (const r of delegationCandidates(d)) {
    if (r.skip) continue;
    // same share HRMS gives a named approver; in this preview the DocShare row is recorded, the access it grants is Frappe's
    if (!can(r.doctype, "submit", adapter.get(r.doctype, r.name), s(d["delegate"])))
      adapter.insertDoc("DocShare", { share_doctype: r.doctype, share_name: r.name, user: s(d["delegate"]), read: 1, write: 1, submit: 1, share: 0, everyone: 0 });
    rows.push(child(DAD_ITEM, d, "shared", rows.length + 1, { reference_doctype: r.doctype, reference_name: r.name, shared_on: nowDatetime(), revoked: 0 }));
    shared.push(r);
  }
  const back = save(DAD, name, { shared: rows, delegation_status: "Active" });
  addInfoComment(DAD, name, _("Delegation active: {0} request(s) shared with {1}", shared.length, s(d["delegate"])), user);
  return { delegation: name, status: s(back["delegation_status"]), shared };
}
export function delegationRevoke(name: string, user = currentUser()) {
  const d = delegationDoc(name, user);
  let removed = 0;
  const rows = rowsOf(d, "shared").map((row) => {
    if (n(row["revoked"])) return row;
    const share = adapter.list("DocShare").find((x) => s(x["share_doctype"]) === s(row["reference_doctype"]) && s(x["share_name"]) === s(row["reference_name"]) && s(x["user"]) === s(d["delegate"]));
    if (share) { adapter.remove("DocShare", share.name); removed++; }
    return { ...row, revoked: 1 };
  });
  const back = save(DAD, name, { shared: rows, delegation_status: "Revoked" });
  addInfoComment(DAD, name, _("Delegation revoked: {0} share(s) removed from {1}", removed, s(d["delegate"])), user);
  return { delegation: name, status: s(back["delegation_status"]), removed };
}

// ------------------------------------------------------------------ APR-02 parallel approval
export type ApprovalStatus = { state: "no_round"; reference_name: string } | { state: "ok"; round: string; rule: string; quorum: number; approval_status: string;
  approvers: { approver: string; substitute: string; decision: string; decided_by: string; decided_on: string | null; note: string }[] };
export function approvalStatus(dt: string, name: string, user = currentUser()): ApprovalStatus {
  requireApp(user);
  const ref = adapter.get(dt, name);
  if (!SUPPORTED.includes(dt) || !ref || !can(dt, "read", ref, user)) throw new PermissionError(_("You do not have permission to view this document"));
  const round = roundFor(dt, name);
  if (!round) return { state: "no_round", reference_name: name };
  return { state: "ok", round: round.name, rule: s(round["rule"]), quorum: n(round["quorum"]), approval_status: s(round["approval_status"]),
    approvers: rowsOf(round, "approvers").map((r) => ({ approver: s(r["approver"]), substitute: s(r["substitute"]), decision: s(r["decision"]) || "Pending", decided_by: s(r["decided_by"]), decided_on: s(r["decided_on"]) || null, note: s(r["note"]) })) };
}
export function approvalStart(dt: string, name: string, approvers: { approver: string; substitute?: string }[], rule = "All", quorum?: number, user = currentUser()): ApprovalStatus {
  requireApp(user);
  const ref = adapter.get(dt, name);
  if (!SUPPORTED.includes(dt) || !ref) throw new R9ValidationError(_("Parallel approval is available for: {0}", SUPPORTED.map((x) => _(x)).join(", ")));
  if (!can(DPA, "create", undefined, user) || !can(dt, "write", ref, user)) throw new PermissionError(_("You do not have permission to start an approval for this document"));
  if (n(ref.docstatus) !== 0) throw new R9ValidationError(_("Only a draft document can be sent for approval"));
  if (openRound(dt, name)) throw new R9ValidationError(_("This document already has an open approval round"));
  if (!Array.isArray(approvers)) throw new R9ValidationError(_("Invalid value for {0}", "approvers"));
  withFlag("digit_parallel_action", () => {
    const parent = { name: "", doctype: DPA } as Doc;
    adapter.insertDoc(DPA, { reference_doctype: dt, reference_name: name, rule, quorum: quorum ?? 0, approval_status: "Pending", owner: user,
      approvers: approvers.map((r, i) => child(DPA_ROW, parent, "approvers", i + 1, { approver: r.approver, substitute: r.substitute ?? "", decision: "Pending" })) });
  });
  return approvalStatus(dt, name, user);
}
export function approvalDecide(round: string, decision: "Approve" | "Reject", note = "", user = currentUser()): ApprovalStatus {
  requireApp(user);
  if (decision !== "Approve" && decision !== "Reject") throw new R9ValidationError(_("Invalid value for {0}", "decision"));
  const doc = round ? adapter.get(DPA, round) : undefined;
  if (!doc) throw new PermissionError(_("You are not an approver of this document"));
  const rows = rowsOf(doc, "approvers");
  const idx = rows.findIndex((r) => [s(r["approver"]), s(r["substitute"])].includes(user));
  if (idx < 0) throw new PermissionError(_("You are not an approver of this document")); // same answer for a missing round
  const dt = s(doc["reference_doctype"]), refName = s(doc["reference_name"]);
  if (!can(dt, "read", adapter.get(dt, refName), user)) throw new PermissionError(_("You cannot read this document, so cannot approve it"));
  if (s(doc["approval_status"]) !== "Pending") throw new R9ValidationError(_("This approval round is already closed"));
  const row = rows[idx]!;
  if ((s(row["decision"]) || "Pending") !== "Pending") throw new R9ValidationError(_("This approval was already decided by {0}", s(row["decided_by"])));
  if (decision === "Reject" && !note.trim()) throw new R9ValidationError(_("A note is required to reject"));
  const decided = { ...row, decision: decision === "Approve" ? "Approved" : "Rejected", decided_by: user, decided_on: nowDatetime(), note: note.trim().slice(0, 500) };
  const next = rows.map((r, i) => (i === idx ? decided : r));
  const status = evaluate({ ...doc, approvers: next });
  // authorized above: listed approver / substitute of this round only (doc.flags.ignore_permissions)
  withFlag("digit_parallel_action", () => adapter.update(DPA, round, { approvers: next, approval_status: status }));
  addInfoComment(dt, refName, _("{0} {1} (approval round {2}: {3})", user, _(s(decided["decision"])), round, _(status)), user);
  return approvalStatus(dt, refName, user);
}

// ------------------------------------------------------------------ POR-03 service catalog
function who(employee: string | undefined, user: string): [string, boolean] {
  requireApp(user);
  const own = ownEmployees(user);
  if (employee && !own.includes(employee)) {
    if (!(isHr(user) && adapter.get("Employee", employee) && can("Employee", "read", adapter.get("Employee", employee), user)))
      throw new PermissionError(_("You do not have permission to view this employee"));
    return [employee, true];
  }
  if (!own.length) throw new PermissionError(_("No employee record is linked to your user"));
  return [employee || own[0]!, isHr(user)];
}
export type CatalogService = { service: string; title: string; title_en: string; title_ar: string | null; category: string; category_label: string; severity: string;
  sla_hours: number | null; description: string | null; prompts: string[]; create: { doctype: string; values: Record<string, string> } | null; matched?: string[]; score?: number };
function serviceRow(item: Doc, canCreate: boolean, ar: boolean): CatalogService {
  return { service: item.name, title: ar && s(item["title_ar"]) ? s(item["title_ar"]) : s(item["service_title"]), title_en: s(item["service_title"]), title_ar: s(item["title_ar"]) || null,
    category: s(item["category"]), category_label: _(s(item["category"])), severity: s(item["default_severity"]), sla_hours: n(item["sla_hours"]) || null,
    description: (ar && s(item["description_ar"]) ? s(item["description_ar"]) : s(item["description"])) || null,
    prompts: s(item["form_fields"]).split("\n").map((x) => x.trim()).filter(Boolean),
    create: canCreate ? { doctype: DSC, values: { service_item: item.name, category: s(item["category"]) } } : null };
}
export function serviceCatalog(employee?: string, opts: { ar?: boolean } = {}, user = currentUser()) {
  const [emp, showExcluded] = who(employee, user);
  const company = s(adapter.get("Employee", emp)?.["company"]);
  const canCreate = can(DSC, "create", undefined, user);
  const groups = new Map<string, CatalogService[]>(); const excluded: { service: string; title: string; reason: string }[] = [];
  for (const item of catalogItems(company)) {
    const reason = eligibleReason(item, emp, company);
    if (reason) { if (showExcluded) excluded.push({ service: item.name, title: s(item["service_title"]), reason }); continue; }
    const k = s(item["category"]); groups.set(k, [...(groups.get(k) ?? []), serviceRow(item, canCreate, !!opts.ar)]);
  }
  const categories = [...groups].map(([category, services]) => ({ category, label: _(category), services }));
  const state = categories.length ? "ok" : adapter.list(DSC_ITEM).some((i) => n(i["enabled"]) === 1) ? "no_data" : "not_configured";
  return { contract: "digit-hr-service-catalog", version: 1, employee: emp, company, state, can_create_case: canCreate, categories, ...(showExcluded ? { excluded } : {}) };
}
const keywords = (item: Doc) => s(item["keywords"]).split(/[,\n،]/).map((k) => k.trim().toLowerCase()).filter((k) => k.length >= 2);
export function serviceClassify(text: string, employee?: string, opts: { ar?: boolean } = {}, user = currentUser()) {
  const [emp] = who(employee, user);
  const t = (text || "").trim();
  if (!t) throw new R9ValidationError(_("Write a few words about your request"));
  if (t.length > 500) throw new R9ValidationError(_("Use at most {0} characters", 500));
  const low = t.toLowerCase(); const company = s(adapter.get("Employee", emp)?.["company"]); const canCreate = can(DSC, "create", undefined, user);
  const hits: CatalogService[] = [];
  for (const item of catalogItems(company)) {
    if (eligibleReason(item, emp, company)) continue;
    const matched = keywords(item).filter((k) => low.includes(k));
    if (matched.length) hits.push({ ...serviceRow(item, canCreate, !!opts.ar), matched, score: matched.length });
  }
  hits.sort((a, b) => (b.score ?? 0) - (a.score ?? 0) || a.title_en.localeCompare(b.title_en));
  return { contract: "digit-hr-service-classify", version: 1, employee: emp, state: hits.length ? "ok" : "no_match", suggestions: hits.slice(0, 5),
    category: hits[0]?.category ?? null, method: "HR-maintained keywords found in the text; a suggestion only" };
}

// ------------------------------------------------------------------ POR-04 bank change
function bankRequest(name: string, user: string): Doc {
  requireApp(user);
  const d = name ? adapter.get(DBC, name) : undefined;
  if (!d || !can(DBC, "write", d, user)) throw new PermissionError(_("You do not have permission to change this request"));
  return d;
}
function hrOnOther(doc: Doc, user: string) {
  if (!isHr(user)) throw new PermissionError(_("Only HR can decide or apply a bank change request"));
  if (ownEmployees(user).includes(s(doc["employee"]))) throw new PermissionError(_("You cannot decide or apply a request about your own employee record"));
  if (!can("Employee", "write", adapter.get("Employee", s(doc["employee"])), user)) throw new PermissionError(_("You do not have permission to change this employee"));
}
const mask = (v: string) => (v ? `****${v.slice(-4)}` : "");
export function bankSubmit(name: string, user = currentUser()) {
  const d = bankRequest(name, user);
  if ((s(d["request_status"]) || "Draft") !== "Draft") throw new R9ValidationError(_("Only a draft request can be submitted"));
  const back = save(DBC, name, { request_status: "Submitted" });
  return { request: name, status: s(back["request_status"]) };
}
export function bankDecide(name: string, decision: "Approve" | "Reject", note = "", user = currentUser()) {
  const d = bankRequest(name, user); hrOnOther(d, user);
  if (decision !== "Approve" && decision !== "Reject") throw new R9ValidationError(_("Invalid value for {0}", "decision"));
  if (s(d["request_status"]) !== "Submitted") throw new R9ValidationError(_("Only a submitted request can be decided"));
  if (decision === "Reject" && !note.trim()) throw new R9ValidationError(_("A note is required to reject a request"));
  const status = decision === "Approve" ? "Approved" : "Rejected";
  const back = withFlag("digit_bank_action", () => save(DBC, name, { request_status: status, decided_by: user, decided_on: nowDatetime(), decision_note: note.trim().slice(0, 500) }));
  addInfoComment(DBC, name, _("Bank change {0} by {1}", _(status), user), user);
  return { request: name, status: s(back["request_status"]), decided_by: user };
}
export function bankApply(name: string, user = currentUser()) {
  const d = bankRequest(name, user); hrOnOther(d, user);
  if (s(d["request_status"]) !== "Approved") throw new R9ValidationError(_("Only an approved request can be applied"));
  const emp = adapter.get("Employee", s(d["employee"]))!;
  const previous = s(emp["iban"]) || s(emp["bank_ac_no"]);
  const patch: Record<string, unknown> = { bank_name: d["new_bank_name"] };
  if (s(d["new_bank_ac_no"])) patch["bank_ac_no"] = d["new_bank_ac_no"];
  if (s(d["new_iban"])) patch["iban"] = d["new_iban"];
  adapter.update("Employee", emp.name, patch); // native Employee save: its hooks and Version log
  const back = withFlag("digit_bank_action", () => save(DBC, name, { request_status: "Applied", applied_by: user, applied_on: nowDatetime(), previous_account_masked: mask(previous) }));
  addInfoComment(DBC, name, _("Bank details applied to employee {0}", s(d["employee"])), user);
  return { request: name, status: s(back["request_status"]), employee: s(d["employee"]), applied_by: user };
}

// ------------------------------------------------------------------ CAS-04 routing / escalation
function caseDoc(name: string, user: string): Doc {
  requireApp(user);
  const d = name ? adapter.get(DSC, name) : undefined;
  if (!d || !can(DSC, "write", d, user)) throw new PermissionError(_("You do not have permission to change this case"));
  return d;
}
export function caseRoute(name: string, user = currentUser()) {
  const d = caseDoc(name, user);
  const rule = matchRule(d);
  if (!rule) throw new R9ValidationError(_("No enabled routing rule matches this case"));
  if (s(d["assigned_to"]) !== s(rule["assign_to"])) {
    save(DSC, name, { assigned_to: rule["assign_to"] });
    addInfoComment(DSC, name, _("Routed to {0} by rule {1}", s(rule["assign_to"]), rule.name), user);
  }
  return { case: name, assigned_to: s(rule["assign_to"]), rule: rule.name };
}
export function caseEscalate(name: string, reason: string, user = currentUser(), now = new Date()) {
  const d = caseDoc(name, user);
  const why = (reason || "").trim();
  if (!why) throw new R9ValidationError(_("A reason is required to escalate a case"));
  const state = slaState(d, now).state;
  if (state !== "breached" && state !== "at_risk") throw new R9ValidationError(_("Only a case at risk of or past its due date can be escalated"));
  const rule = matchRule(d);
  if (!rule || !s(rule["escalate_to"])) throw new R9ValidationError(_("No escalation handler is configured for this case"));
  save(DSC, name, { assigned_to: rule["escalate_to"] });
  addInfoComment(DSC, name, _("Escalated to {0}: {1}", s(rule["escalate_to"]), why.slice(0, 300)), user);
  return { case: name, assigned_to: s(rule["escalate_to"]), rule: rule.name, sla_state: state };
}

// ------------------------------------------------------------------ PAY-04 payroll period lock
export function payrollLockState(company: string, fromDate: string, toDate?: string, user = currentUser()) {
  requireApp(user);
  // context.resolve_company: the company must be one the user may read (frappe.get_list("Company"))
  const co = adapter.get("Company", company);
  if (!company || !co || !can("Company", "read", co, user)) throw new PermissionError(_("You are not permitted to use company {0}", company));
  if (!can(DPL, "read", undefined, user)) return { state: "denied" as const, locks: [], can_change: false };
  const hit = locksFor(company, fromDate, toDate);
  return { state: hit.length ? ("locked" as const) : ("open" as const), locks: hit.map((h) => ({ name: h.name, from_date: s(h["from_date"]), to_date: s(h["to_date"]), locked_by: s(h["locked_by"]) })), can_change: can(DPL, "write", undefined, user) };
}

// ------------------------------------------------------------------ HIR-04 onboarding invite (off by default)
/** site_config digit_hr_onboarding_invites — this preview has no site config, so the owner's switch is off (owner decision). */
const siteConf: { digit_hr_onboarding_invites: boolean } = { digit_hr_onboarding_invites: false };
export function onboardingInvitesEnabled(): boolean { return siteConf.digit_hr_onboarding_invites; }
/** Test seam standing for the owner's site_config switch. */
export function setOnboardingInvitesSiteFlag(on: boolean): void { siteConf.digit_hr_onboarding_invites = on; }
const CONTACT_FIELDS = ["personal_email", "cell_number", "current_address", "person_to_be_contacted", "emergency_phone_number", "relation"] as const;
function invitesOn() { if (!siteConf.digit_hr_onboarding_invites) throw new PermissionError(_("Onboarding invites are not enabled on this site")); }
function inviteDoc(name: string, user: string): Doc {
  invitesOn(); requireApp(user);
  const d = name ? adapter.get(DOI, name) : undefined;
  if (!d || !can(DOI, "write", d, user)) throw new PermissionError(_("You do not have permission to change this invitation"));
  return d;
}
export function inviteCreate(onboarding: string, days = 7, user = currentUser()) {
  invitesOn(); requireApp(user);
  const ob = onboarding ? adapter.get("Employee Onboarding", onboarding) : undefined;
  if (!can(DOI, "create", undefined, user) || !ob || !can("Employee Onboarding", "write", ob, user)) throw new PermissionError(_("You do not have permission to invite this joiner"));
  if (n(ob.docstatus) === 2) throw new R9ValidationError(_("This onboarding is cancelled"));
  const token = tokenUrlsafe(32);
  const doc = withFlag("digit_invite_action", () => {
    for (const old of adapter.list(DOI).filter((x) => s(x["employee_onboarding"]) === onboarding && s(x["invite_status"]) === "Active")) adapter.update(DOI, old.name, { invite_status: "Revoked" });
    return adapter.insertDoc(DOI, { employee_onboarding: onboarding, token_hash: sha256Hex(token), invite_status: "Active", expires_on: addDays(nowDatetime(), Math.max(1, Math.min(n(days) || 7, 7))), owner: user });
  });
  return { invite: doc.name, url: `/hr-invite?token=${token}`, expires_on: s(doc["expires_on"]), note: "The link is shown once; it is not stored. Send it to the joiner yourself." };
}
/** Guest submit (the Frappe www page /hr-invite posts here); kept for the contract and tests — no guest page exists in this preview. */
export function inviteSubmit(token: string, values: Record<string, string>) {
  invitesOn();
  if (!token || token.length > 100) throw new PermissionError(_("This invitation link is not valid"));
  const h = sha256Hex(token);
  const doc = adapter.list(DOI).find((x) => s(x["token_hash"]) === h);
  if (!doc || s(doc["invite_status"]) !== "Active" || toDate(doc["expires_on"]) < new Date()) throw new PermissionError(_("This invitation link is not valid or has expired"));
  const clean: Record<string, string> = {};
  for (const f of CONTACT_FIELDS) {
    const v = (values[f] ?? "").trim();
    if (v.length > (f === "current_address" ? 500 : 140)) throw new R9ValidationError(_("{0} is too long", f));
    clean[f] = v.replace(/<[^>]*>/g, "");
  }
  if (clean["personal_email"] && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(clean["personal_email"])) throw new R9ValidationError(_("{0} is not a valid Email Address", clean["personal_email"]));
  if (!(clean["cell_number"] || clean["personal_email"])) throw new R9ValidationError(_("Enter at least a mobile number or a personal email"));
  withFlag("digit_invite_action", () => adapter.update(DOI, doc.name, { ...clean, invite_status: "Submitted", submitted_on: nowDatetime() }));
  return { status: "received" };
}
export function inviteApply(name: string, user = currentUser()) {
  const d = inviteDoc(name, user);
  if (s(d["invite_status"]) !== "Submitted") throw new R9ValidationError(_("Only a submitted invitation can be applied"));
  const employee = s(adapter.get("Employee Onboarding", s(d["employee_onboarding"]))?.["employee"]);
  if (!employee) throw new R9ValidationError(_("Create the Employee from the onboarding first"));
  if (!can("Employee", "write", adapter.get("Employee", employee), user)) throw new PermissionError(_("You do not have permission to change this employee"));
  const patch: Record<string, unknown> = {}; for (const f of CONTACT_FIELDS) if (s(d[f])) patch[f] = d[f];
  adapter.update("Employee", employee, patch);
  withFlag("digit_invite_action", () => adapter.update(DOI, name, { invite_status: "Applied", applied_by: user, applied_on: nowDatetime() }));
  return { invite: name, employee, status: "Applied" };
}
export function inviteRevoke(name: string, user = currentUser()) {
  const d = inviteDoc(name, user);
  if (["Applied", "Revoked"].includes(s(d["invite_status"]))) throw new R9ValidationError(_("This invitation is already closed"));
  withFlag("digit_invite_action", () => adapter.update(DOI, name, { invite_status: "Revoked" }));
  return { invite: name, status: "Revoked" };
}
