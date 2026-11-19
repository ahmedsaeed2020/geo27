/**
 * Frappe CRM setup + extended demo data (insert-if-missing, explicit names, __synthetic).
 * Statuses, lost reasons and communication statuses are the crm/install.py defaults; everything else is
 * labelled demo data («بيانات تجريبية») for the one Saudi demo company.
 */
import defaults from "./crmSourceDefaults.json";

type Rec = [string, string, Record<string, unknown>];
const pad = (n: number, w = 3) => String(n).padStart(w, "0");
const A = "DDT";

export const CRM_USERS: [string, string, string][] = [
  ["noura.sales@digit.test", "Noura", "Al-Harbi"],
  ["fahad.sales@digit.test", "Fahad", "Al-Qahtani"],
  ["sales.user@digit.test", "Salem", "Sales"],
];

export const LOST_REASONS: [string, string][] = [
  ["Pricing", "The prospect found the pricing to be too high or not competitive."],
  ["Competition", "The prospect chose a competitor's product or service."],
  ["Budget Constraints", "The prospect did not have the budget to proceed with the purchase."],
  ["Missing Features", "The prospect felt that the product or service was missing key features they needed."],
  ["Long Sales Cycle", "The sales process took too long, leading to loss of interest."],
  ["No Decision-Maker", "The prospect was not the decision-maker and could not proceed."],
  ["Unresponsive Prospect", "The prospect did not respond to follow-ups."],
  ["Poor Fit", "The prospect was not a good fit for the product or service."],
  ["Other", ""],
];

export const EXTRA_ORGS = ["Al-Hijaz Steel", "Yanbu Petrochem Services", "Abha Tourism Group", "Al-Jouf Olive Co.", "Tabuk Agri Holdings", "Hail Cement Works", "Al-Ahsa Dates Co.", "Najran Marble", "Jazan Port Services", "Al-Qurayyat Trading"];

/** Setup records: run before leads/deals so the engines find statuses, SLAs and assignment rules. */
export function crmSetup(): Rec[] {
  const r: Rec[] = [];
  for (const [email, first, last] of CRM_USERS)
    r.push(["User", email, { email, first_name: first, last_name: last, full_name: `${first} ${last}`, enabled: 1, user_type: "System User", roles: [{ doctype: "Has Role", role: "Sales User" }] }]);
  for (const [s, v] of Object.entries(defaults.lead_statuses)) r.push(["CRM Lead Status", s, { lead_status: s, type: v.type, color: v.color, position: v.position }]);
  for (const [s, v] of Object.entries(defaults.deal_statuses)) r.push(["CRM Deal Status", s, { deal_status: s, type: v.type, color: v.color, position: v.position, probability: v.probability }]);
  for (const s of ["Open", "Replied"]) r.push(["CRM Communication Status", s, { status: s }]);
  for (const [s, d] of LOST_REASONS) r.push(["CRM Lost Reason", s, { lost_reason: s, description: d }]);
  r.push(["FCRM Settings", "FCRM Settings", { currency: "SAR", brand_name: "CRM", crm_timeline_timestamp_format: "Relative", crm_timeline_sort_order: "Newest First", default_calendar_view: "Weekly" }]);
  const holidays = [["2026-02-22", "Founding Day"], ["2026-03-20", "Eid al-Fitr"], ["2026-03-21", "Eid al-Fitr"], ["2026-03-22", "Eid al-Fitr"], ["2026-05-26", "Eid al-Adha"], ["2026-05-27", "Eid al-Adha"], ["2026-05-28", "Eid al-Adha"], ["2026-09-23", "Saudi National Day"]];
  r.push(["CRM Holiday List", "Saudi 2026", { holiday_list_name: "Saudi 2026", from_date: "2026-01-01", to_date: "2026-12-31", weekly_off: "Friday", total_holidays: holidays.length, holidays: holidays.map(([date, description]) => ({ date, description, weekly_off: 0 })) }]);
  const hours = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday"].map((workday) => ({ workday, start_time: "08:00:00", end_time: "17:00:00" }));
  r.push(["CRM Service Level Agreement", "Lead Response — 4h", { sla_name: "Lead Response — 4h", apply_on: "CRM Lead", enabled: 1, default: 1, rolling_responses: 0, holiday_list: "Saudi 2026", working_hours: hours, priorities: [{ priority: "Open", first_response_time: 4 * 3600, default_priority: 1 }, { priority: "Replied", first_response_time: 8 * 3600, default_priority: 0 }], description: "بيانات تجريبية" }]);
  r.push(["CRM Service Level Agreement", "Deal Response — 1 day", { sla_name: "Deal Response — 1 day", apply_on: "CRM Deal", enabled: 1, default: 1, rolling_responses: 1, holiday_list: "Saudi 2026", working_hours: hours, priorities: [{ priority: "Open", first_response_time: 9 * 3600, default_priority: 1 }, { priority: "Replied", first_response_time: 18 * 3600, default_priority: 0 }], description: "بيانات تجريبية" }]);
  const users = CRM_USERS.map(([u]) => ({ user: u }));
  r.push(["Assignment Rule", "CRM Lead — Round Robin", { document_type: "CRM Lead", rule: "Round Robin", priority: 1, disabled: 0, users, description: "بيانات تجريبية", assign_condition: "status == 'New'" }]);
  r.push(["Assignment Rule", "CRM Deal — Load Balancing", { document_type: "CRM Deal", rule: "Load Balancing", priority: 1, disabled: 0, users: users.slice(0, 2), description: "بيانات تجريبية" }]);
  r.push(["Assignment Rule", "CRM Lead — Riyadh", { document_type: "CRM Lead", rule: "Round Robin", priority: 2, disabled: 0, users: users.slice(2), description: "بيانات تجريبية", assign_condition: "territory == 'Riyadh'" }]);
  const tpl: [string, string, string][] = [
    ["Welcome Lead", "Thank you for your interest, {{ lead_name }}", "<p>Dear {{ lead_name }},</p><p>Thank you for contacting us. Our team will reach out shortly.</p>"],
    ["Proposal Follow-up", "Following up on our proposal", "<p>Dear {{ first_name }},</p><p>Following up on the proposal we sent for {{ organization }}.</p>"],
    ["Demo Invitation", "Product demo invitation", "<p>We would like to schedule a short demo at your convenience.</p>"],
    ["Contract Ready", "Your contract is ready", "<p>The contract for {{ organization }} is ready for signature.</p>"],
    ["Lost — Feedback", "We value your feedback", "<p>Thank you for considering us. Could you share why we were not selected?</p>"],
  ];
  tpl.forEach(([n, subject, response], i) => r.push(["Email Template", n, { subject, response, response_html: response, use_html: 1, reference_doctype: i < 1 ? "CRM Lead" : "CRM Deal", enabled: 1 }]));
  r.push(["CRM View Settings", "VIEW-DEALS-PIPELINE", { label: "Pipeline (Kanban)", icon: "", dt: "CRM Deal", type: "kanban", route_name: "Deals", public: 1, pinned: 0, column_field: "status", title_field: "organization", kanban_fields: JSON.stringify(["annual_revenue", "email", "_assign"]), filters: "{}", order_by: "modified desc", user: "" }]);
  r.push(["CRM View Settings", "VIEW-LEADS-RIYADH", { label: "Riyadh leads", icon: "", dt: "CRM Lead", type: "list", route_name: "Leads", public: 1, pinned: 0, filters: JSON.stringify({ territory: "Riyadh" }), order_by: "modified desc", user: "" }]);
  r.push(["CRM View Settings", "VIEW-DEALS-OPEN", { label: "My open deals", icon: "", dt: "CRM Deal", type: "list", route_name: "Deals", public: 0, pinned: 1, filters: JSON.stringify({ status: ["not in", ["Won", "Lost"]] }), order_by: "modified desc", user: "Administrator" }]);
  return r;
}

const DS = ["Qualification", "Demo/Making", "Proposal/Quotation", "Negotiation", "Ready to Close", "Won", "Lost"];
/** Six months of status history ending in the deal's current status. */
export function statusHistory(status: string, createdIso: string): Record<string, unknown>[] {
  const end = DS.indexOf(status); const steps = status === "Lost" ? [0, 1, 2, 6] : DS.slice(0, end + 1).map((_, i) => i);
  const t0 = Date.parse(createdIso); const span = 26 * 86400000;
  return steps.map((si, i) => {
    const from = new Date(t0 + i * span).toISOString(); const nxt = steps[i + 1];
    const to = nxt !== undefined ? new Date(t0 + (i + 1) * span).toISOString() : "";
    const ty = (s: string) => (defaults.deal_statuses as Record<string, { type: string }>)[s]?.type ?? "";
    return { from: DS[si], from_type: ty(DS[si]!), to: nxt !== undefined ? DS[nxt] : "", to_type: nxt !== undefined ? ty(DS[nxt]!) : "", from_date: from, to_date: to, duration: to ? span / 1000 : undefined, log_owner: "Administrator" };
  });
}

/** Extra contacts / notes / tasks / calls / emails / comments on leads, reaching the PROMPT CRM-01 A4 counts. */
export function crmExtra(FIRST: readonly string[], LAST: readonly string[], org: (i: number) => string): Rec[] {
  const r: Rec[] = [];
  const day = (m: number, d: number) => `2026-${pad(m, 2)}-${pad(Math.min(d, 28), 2)}`;
  /** owner rule (no fixed calendar dates): open follow-ups are dated relative to today; `__due_v1` keeps the first fixed value for the seed.ts backfill */
  const rel = (k: number) => new Date(Date.now() + k * 864e5).toISOString().slice(0, 10);
  for (let k = 31; k <= 50; k++) {
    const lead = `${A}-CRM-LEAD-${pad(k - 30)}`;
    r.push(["Contact", `${A}-CRM-CON-${pad(k)}`, { first_name: FIRST[(k * 3) % 30], last_name: LAST[(k * 5) % 10], email_id: `contact${k}@client.example.sa`, mobile_no: `+96655${pad(1200000 + k * 3137, 7)}`, company_name: org(k), designation: ["Procurement Manager", "CFO", "Project Director", "Operations Lead"][k % 4], links: [{ link_doctype: "CRM Lead", link_name: lead }] }]);
  }
  for (let k = 31; k <= 40; k++) r.push(["FCRM Note", `${A}-NOTE-${pad(k)}`, { title: `Call summary ${k}`, content: `<p>Discussed scope and timeline with the client. Demo data.</p>`, reference_doctype: "CRM Lead", reference_docname: `${A}-CRM-LEAD-${pad(k - 30)}`, creation: `${day(1 + (k % 9), 8)}T10:00:00.000Z` }]);
  for (let k = 31; k <= 60; k++) r.push(["CRM Task", `${A}-TASK-${pad(k)}`, { title: ["Call back", "Send brochure", "Qualify budget", "Book meeting", "Share references"][k % 5], status: ["Backlog", "Todo", "In Progress", "Done", "Canceled"][k % 5], priority: ["Low", "Medium", "High"][k % 3], due_date: k % 5 < 3 ? `${rel((k % 14) - 3)} 10:00:00` : `${day(Math.min(12, 2 + (k % 10)), 12)} 10:00:00`, __due_v1: `${day(Math.min(12, 2 + (k % 10)), 12)} 10:00:00`, assigned_to: CRM_USERS[k % 3]![0], reference_doctype: "CRM Lead", reference_docname: `${A}-CRM-LEAD-${pad(k - 30)}` }]);
  for (let k = 31; k <= 40; k++) r.push(["CRM Call Log", `${A}-CALL-${pad(k)}`, { id: `${A}-CALL-${pad(k)}`, type: k % 2 ? "Outgoing" : "Incoming", status: ["Completed", "No Answer", "Completed", "Busy"][k % 4], duration: k % 4 === 1 || k % 4 === 3 ? 0 : 45 + k * 11, from: "+966112345678", to: `+96656${pad(3000000 + (k - 30) * 2777, 7)}`, start_time: `${day(1 + (k % 9), 9)} 13:${pad(k % 60, 2)}:00`, reference_doctype: "CRM Lead", reference_docname: `${A}-CRM-LEAD-${pad(k - 30)}`, caller: "Administrator" }]);
  for (let k = 1; k <= 30; k++) {
    const isDeal = k % 2 === 0; const ref = isDeal ? `${A}-CRM-DEAL-${pad(k)}` : `${A}-CRM-LEAD-${pad(k)}`; const dt = isDeal ? "CRM Deal" : "CRM Lead";
    const received = k % 3 === 0;
    r.push(["Communication", `${A}-COMM-${pad(k)}`, { communication_type: "Communication", communication_medium: "Email", sent_or_received: received ? "Received" : "Sent", subject: received ? `Re: Quotation request ${k}` : `Proposal for ${org(k)}`, content: received ? "<p>Thank you, please share the updated price list.</p>" : "<p>Please find attached our proposal. Demo data.</p>", sender: received ? `buyer${k}@deal.example.test` : "admin@example.test", recipients: received ? "admin@example.test" : `buyer${k}@deal.example.test`, reference_doctype: dt, reference_name: ref, status: "Linked", email_status: received ? "Open" : "Sent", delivery_status: received ? "" : "Sent", communication_date: `${day(1 + (k % 9), 14)}T11:00:00.000Z`, creation: `${day(1 + (k % 9), 14)}T11:00:00.000Z` }]);
    const [mu, mf] = CRM_USERS[k % 3]!;
    r.push(["Comment", `${A}-CMT-CRM-${pad(k)}`, { comment_type: "Comment", reference_doctype: dt, reference_name: ref, content: `<p><span class="mention" data-id="${mu}" data-label="${mf}">@${mf}</span> please follow up on this ${isDeal ? "deal" : "lead"}.</p>`, comment_email: "admin@example.test", owner: "Administrator", creation: `${day(1 + (k % 9), 16)}T12:00:00.000Z` }]);
    r.push(["CRM Notification", `${A}-NOTIF-${pad(k)}`, { notification_text: `mentioned you in a comment in ${isDeal ? "deal" : "lead"} ${ref}`, from_user: "Administrator", to_user: mu, type: "Mention", read: k % 4 === 0 ? 1 : 0, comment: `${A}-CMT-CRM-${pad(k)}`, reference_doctype: dt, reference_name: ref, notification_type_doctype: "Comment", notification_type_doc: `${A}-CMT-CRM-${pad(k)}`, creation: `${day(1 + (k % 9), 16)}T12:00:00.000Z` }]);
    if (k <= 10) r.push(["CRM Notification", `${A}-NOTIF-ADM-${pad(k)}`, { notification_text: `assigned you a new ${isDeal ? "deal" : "lead"} ${ref}`, from_user: CRM_USERS[k % 3]![0], to_user: "Administrator", type: "Assignment", read: k > 6 ? 1 : 0, reference_doctype: dt, reference_name: ref, notification_type_doctype: dt, notification_type_doc: ref, creation: `2026-10-${pad(Math.min(11, k), 2)}T08:00:00.000Z` }]);
  }
  return r;
}
