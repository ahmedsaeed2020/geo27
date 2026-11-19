/**
 * R4-R — the eight crosswalk report gaps that need no owner input (CROSSWALK_95.md "Buildable"): read-model Script
 * Reports over existing records only, one row per source line, each row opening its exact source row
 * (`source_doctype` + `source` + `source_table` + `row_no` = child-row anchor). Same read rules as domain/data.ts
 * (construction projects only, session-scoped lists); nothing is stored, nothing posts.
 *
 * Owner-dependent parts of the contracts are NOT inferred: no variance tolerance or percent thresholds (plain
 * differences only), no SLA or completed-step percentiles (paused-time policy unknown), no per-line evidence state
 * (not modelled), no delivery tolerance (0 days, shown), no mixed-unit sums (a unit mismatch shows no difference).
 */
import type { PluginReport } from "../types";
import { effectiveQty, entryQuantity, lineAmount, num, r2, r3, sumBy, validityState } from "./domain/calc";
import { get, isSubmitted, list, rows, today } from "./domain/data";
import { constructionProjects } from "./domain/queues";
import { daysBetween, scheduleOf } from "./domain/scheduleCore";
import { baselineComparison } from "./domain/site";
import { CONSTRUCTION_WORKFLOWS } from "./workflows";
import type { Doc } from "@/lib/adapter";

type F = Record<string, unknown>;
type Row = Record<string, unknown>;
const PF = [{ fieldname: "company", label: "Company", fieldtype: "Link", options: "Company" }, { fieldname: "project", label: "Project", fieldtype: "Link", options: "Project" }];
const PREQ = [PF[0]!, { ...PF[1]!, reqd: 1 } as never];
const C = (fieldname: string, label: string, fieldtype = "Currency", options?: string) => ({ fieldname, label, fieldtype, ...(options ? { options } : {}), width: 130 });
const SRC = [C("source_doctype", "Source Type", "Data"), C("source", "Source Document", "Dynamic Link", "source_doctype"), C("row_no", "Row", "Int")];
const S = (q: string) => `# FRAPPE_SERVER_REQUIRED: the Virtual Core computes this report in digit_construction/reportsGap.ts (${q}).\n# Port it to Python and test it on staging before enabling this report.\n\n\ndef execute(filters=None):\n\tfrappe.throw(_("This report is not implemented on the server yet"))\n`;
const scope = (f: F) => constructionProjects({ company: (f["company"] as string) || undefined, project: (f["project"] as string) || undefined });
const oneProject = (f: F) => (f["project"] ? scope(f)[0]?.name : undefined);
const idxOf = (r: Row, i: number) => num(r["idx"]) || i + 1;
const companyOf = (p: unknown) => String(get("Project", p)?.["company"] ?? "");
const live = (d: Doc) => num(d.docstatus) !== 2;
const eq = (a: number, b: number) => Math.abs(a - b) < 1e-9;
const joinFlags = (fs: string[]) => fs.join("; ");

// ---------------------------------------------------------------- EST-RPT-01 BOQ Estimate Variance
/** One row per BOQ line against the estimate line it came from (source_estimate_line), plus estimate lines the BOQ dropped. */
export function boqEstimateVariance(project: string, boqName?: string): Row[] {
  const out: Row[] = [];
  for (const boq of list("Digit BOQ", (b) => live(b) && b["project"] === project && (!boqName || b.name === boqName))) {
    const est = get("Digit Estimate Version", boq["estimate_version"]);
    const lines = new Map(rows(est, "lines").map((l, i) => [String(l["line_key"] ?? ""), { l, i }]));
    const used = new Set<string>();
    const base = { boq: boq.name, revision: num(boq["revision"]) || null, boq_state: boq["workflow_state"] ?? "", estimate_version: est?.name ?? "", project, company: boq["company"] || companyOf(project) };
    rows(boq, "items").forEach((it, i) => {
      const key = String(it["source_estimate_line"] ?? ""); const m = key ? lines.get(key) : undefined; if (m) used.add(key);
      const bq = num(it["qty"]), br = num(it["rate"]), ba = lineAmount(it["qty"], it["rate"]);
      const row: Row = { ...base, source_doctype: "Digit BOQ", source: boq.name, source_table: "items", row_no: idxOf(it, i), code: it["code"] ?? "", description: it["description"] ?? "", uom: it["uom"] ?? "",
        boq_qty: bq, boq_rate: br, boq_amount: ba, est_qty: null, est_rate: null, est_amount: null, qty_diff: null, rate_diff: null, amount_diff: null };
      if (!est) { out.push({ ...row, variance_status: "No estimate version" }); return; }
      if (!m) { out.push({ ...row, variance_status: "Added in BOQ" }); return; }
      const eqty = num(m.l["qty"]), erate = num(m.l["selling_rate"]), eamt = lineAmount(m.l["qty"], m.l["selling_rate"]);
      const withEst = { ...row, est_line_no: idxOf(m.l, m.i), est_qty: eqty, est_rate: erate, est_amount: eamt };
      if (String(m.l["uom"] ?? "") !== String(it["uom"] ?? "")) { out.push({ ...withEst, variance_status: "Unit differs" }); return; }
      const dq = r3(bq - eqty), dr = r2(br - erate);
      const status = eq(dq, 0) && eq(dr, 0) ? "Unchanged" : !eq(dq, 0) && !eq(dr, 0) ? "Quantity and rate changed" : !eq(dq, 0) ? "Quantity changed" : "Rate changed";
      out.push({ ...withEst, qty_diff: dq, rate_diff: dr, amount_diff: r2(ba - eamt), variance_status: status });
    });
    if (est) for (const [key, { l, i }] of lines) if (!used.has(key)) out.push({ ...base, source_doctype: "Digit Estimate Version", source: est.name, source_table: "lines", row_no: idxOf(l, i), code: l["code"] ?? "", description: l["description"] ?? "", uom: l["uom"] ?? "",
      est_line_no: idxOf(l, i), est_qty: num(l["qty"]), est_rate: num(l["selling_rate"]), est_amount: lineAmount(l["qty"], l["selling_rate"]), boq_qty: null, boq_rate: null, boq_amount: null, qty_diff: null, rate_diff: null, amount_diff: null, variance_status: "Not in BOQ" });
  }
  return out;
}

// ---------------------------------------------------------------- EST-RPT-02 Assembly Components
/** One row per assembly component with the rate master's current rate and validity as of a date (no quantity roll-up across units). */
export function assemblyComponents(f: F = {}): Row[] {
  const on = (f["as_of"] as string) || today(); const cat = String(f["category"] ?? ""), rcat = String(f["rate_category"] ?? "");
  const out: Row[] = [];
  for (const a of list("Digit Assembly", (x) => !cat || x["category"] === cat)) {
    const comps = rows(a, "components"); const unit = num(a["unit_cost"]);
    comps.forEach((c, i) => {
      const rate = get("Digit Construction Rate", c["rate"]);
      if (rcat && rate?.["category"] !== rcat) return;
      const stored = num(c["unit_rate"]), current = rate ? num(rate["current_rate"]) : null, amount = r2(num(c["amount"]) || lineAmount(c["coefficient"], c["unit_rate"]));
      const v = !rate ? "Rate missing" : num(rate["disabled"]) ? "Disabled" : ({ valid: "Valid", expiring: "Expiring", expired: "Expired", unknown: "No validity date" } as const)[validityState(rate["valid_until"], on)];
      const flags: string[] = [];
      if (!rate) flags.push("Rate missing"); else {
        if (current !== null && !eq(r2(current), r2(stored))) flags.push("Stored rate differs from current rate");
        if (v === "Expired" || v === "Disabled") flags.push(v === "Expired" ? "Rate expired" : "Rate disabled");
        if (rate["uom"] && c["uom"] && rate["uom"] !== c["uom"]) flags.push("Unit differs from rate");
      }
      out.push({ assembly: a.name, title: a["title"] ?? "", category: a["category"] ?? "", assembly_uom: a["uom"] ?? "", unit_cost: unit, source_doctype: "Digit Assembly", source: a.name, source_table: "components", row_no: idxOf(c, i),
        rate: c["rate"] ?? "", rate_name: rate?.["rate_name"] ?? c["description"] ?? "", rate_category: rate?.["category"] ?? "", uom: c["uom"] ?? "", coefficient: num(c["coefficient"]), unit_rate: stored, current_rate: current,
        amount, share_pct: unit > 0 ? r2((amount / unit) * 100) : null, valid_until: rate?.["valid_until"] || null, validity: v, flags: joinFlags(flags) });
    });
  }
  return out;
}

// ---------------------------------------------------------------- R-04 BOQ Measurement Reconciliation (client side)
/** Per contract SOV line: quantity, claimed to date (latest live claim), certified to date (confirmed certificates). Client measurement is not a separate document. */
export function measurementReconciliation(f: F): Row[] {
  const ps = new Set(scope(f).map((p) => p.name)); const only = String(f["contract"] ?? "");
  const out: Row[] = [];
  for (const c of list("Digit Client Contract", (x) => ps.has(String(x["project"])) && (!only || x.name === only) && x["workflow_state"] !== "Draft")) {
    const claims = list("Digit Client Claim", (x) => x["contract"] === c.name && num(x.docstatus) === 1 && x["workflow_state"] !== "Rejected").sort((a, b) => num(b["claim_no"]) - num(a["claim_no"]));
    const latest = claims[0];
    const certs = list("Digit Client Certificate", (x) => x["contract"] === c.name && isSubmitted(x));
    rows(c, "sov_lines").forEach((s, i) => {
      const key = String(s["line_key"] ?? ""); const qty = num(s["qty"]);
      const cl = rows(latest, "lines").find((l) => l["sov_line_key"] === key);
      const certLines = certs.flatMap((x) => rows(x, "lines").filter((l) => l["sov_line_key"] === key));
      const claimed = cl ? num(cl["cumulative_qty"]) : 0, accepted = r3(sumBy(certLines, (l) => num(l["accepted_qty"])));
      const flags: string[] = [];
      if (claimed > qty + 1e-9) flags.push("Claimed above contract");
      if (accepted > claimed + 1e-9) flags.push("Certified above claimed");
      if (accepted > qty + 1e-9) flags.push("Certified above contract");
      out.push({ contract: c.name, project: c["project"], company: c["company"] || companyOf(c["project"]), source_doctype: "Digit Client Contract", source: c.name, source_table: "sov_lines", row_no: idxOf(s, i),
        line_key: key, origin: s["origin"] || "Contract", variation: s["variation"] ?? "", related_line: s["origin"] === "Variation" ? s["boq_item"] ?? "" : "", description: s["description"] ?? "", uom: s["uom"] ?? "", rate: num(s["rate"]),
        original_qty: s["origin"] === "Variation" ? 0 : qty, revised_qty: qty, claimed_qty: claimed, latest_claim: latest?.name ?? "", certified_qty: accepted,
        rejected_qty: r3(sumBy(certLines, (l) => num(l["rejected_qty"]))), disputed_qty: r3(sumBy(certLines, (l) => num(l["disputed_qty"]))), remaining_qty: r3(qty - accepted),
        certified_amount: r2(sumBy(certLines, (l) => num(l["amount"]))), recon_status: flags.length ? joinFlags(flags) : claimed > 0 || accepted > 0 ? "Within contract" : "Not claimed" });
    });
  }
  return out;
}

// ---------------------------------------------------------------- R-11 Variations Register
/** One row per client variation line; pending, approved and rejected amounts stay in separate columns (revised contract value counts approved only). */
export function variationsRegister(f: F): Row[] {
  const ps = new Set(scope(f).map((p) => p.name)); const st = String(f["status"] ?? "");
  const out: Row[] = [];
  for (const v of list("Digit Client Variation", (x) => live(x) && ps.has(String(x["project"])) && (!st || x["workflow_state"] === st))) {
    const state = String(v["workflow_state"] ?? "Draft"); const ct = get("Digit Client Contract", v["contract"]);
    const inSov = rows(ct, "sov_lines").some((s) => s["variation"] === v.name);
    const base = { variation: v.name, title: v["title"] ?? "", contract: v["contract"] ?? "", project: v["project"], company: v["company"] || companyOf(v["project"]), change_kind: v["change_kind"] ?? "", origin: v["origin"] ?? "",
      state, requested_on: v["requested_on"] || null, approved_on: v["approved_on"] || null, time_days: v["time_days"] === undefined || v["time_days"] === "" ? null : num(v["time_days"]), in_contract: inSov ? 1 : 0 };
    const ls = rows(v, "lines");
    const money = (a: number) => ({ amount: a, pending_amount: state === "Draft" || state === "Submitted" ? a : 0, approved_amount: state === "Approved" ? a : 0, rejected_amount: state === "Rejected" ? a : 0 });
    if (!ls.length) { out.push({ ...base, source_doctype: "Digit Client Variation", source: v.name, source_table: "", row_no: null, sov_line_key: "", description: "", uom: "", qty: null, rate: null, ...money(0) }); continue; }
    ls.forEach((l, i) => out.push({ ...base, source_doctype: "Digit Client Variation", source: v.name, source_table: "lines", row_no: idxOf(l, i), sov_line_key: l["sov_line_key"] || "New line", description: l["description"] ?? "", uom: l["uom"] ?? "",
      qty: num(l["qty"]), rate: num(l["rate"]), ...money(lineAmount(l["qty"], l["rate"])) }));
  }
  return out;
}

// ---------------------------------------------------------------- R-16 Approval Aging
const AMOUNT_FIELDS = ["net_certified", "this_claim", "amount", "total_amount", "total_value", "total_selling", "accepted_value", "measured_total", "requested_amount", "grand_total", "net_total"];
const amountOf = (d: Doc) => { for (const k of AMOUNT_FIELDS) if (d[k] !== undefined && d[k] !== null && d[k] !== "" && !Number.isNaN(Number(d[k]))) return num(d[k]); return null; };
const titleOf = (d: Doc) => String(d["title"] ?? d["subject"] ?? d["stage_name"] ?? d["expense_title"] ?? d["description"] ?? "");
/** Workflow actions that decide on someone else's work (approval steps). */
export const DECISIONS = new Set(["Approve", "Reject", "Return", "Certify", "Review"]);
export const ageBucket = (days: number) => (days <= 7 ? "0-7" : days <= 14 ? "8-14" : days <= 30 ? "15-30" : "31+");
const projectOfDoc = (d: Doc): string => {
  if (d["project"]) return String(d["project"]);
  for (const [k, dt] of [["contract", "Digit Client Contract"], ["work_order", "Digit Subcontract Work Order"], ["budget", "Digit Project Cost Budget"], ["tender", "Digit Tender"]] as const) { const p = get(dt, d[k])?.["project"]; if (p) return String(p); }
  return "";
};
/**
 * Documents waiting for a decision: not cancelled, in a workflow state that has a decision transition (Approve, Reject,
 * Return, Certify, Review) — operating states (Active, Approved, Completed), negotiation states and rework (Returned)
 * are not approval steps. Entered = the latest Workflow comment that moved the document into its current state, else the last modification
 * (labelled). Waiting on = the roles allowed to act from that state; Assigned to = open ToDo users. No SLA (undefined).
 */
export function approvalAging(f: F, on = today()): Row[] {
  const ps = new Set(scope(f).map((p) => p.name)); const only = String(f["document_type"] ?? "");
  const entered = new Map<string, string>();
  for (const c of list("Comment", (x) => x["comment_type"] === "Workflow")) {
    const k = `${String(c["reference_doctype"])}|${String(c["reference_name"])}|${String(c["content"])}`; const at = String(c["creation"] ?? c["modified"] ?? "");
    if (at && (!entered.has(k) || at > entered.get(k)!)) entered.set(k, at);
  }
  const todo = new Map<string, string[]>();
  for (const t of list("ToDo", (x) => (x["status"] ?? "Open") === "Open" && !!x["reference_name"])) { const k = `${String(t["reference_type"])}|${String(t["reference_name"])}`; todo.set(k, [...(todo.get(k) ?? []), String(t["allocated_to"] ?? "")].filter(Boolean)); }
  const out: Row[] = [];
  for (const w of CONSTRUCTION_WORKFLOWS) {
    if (only && w.document_type !== only) continue;
    const initial = w.states[0]?.state;
    for (const d of list(w.document_type, (x) => num(x.docstatus) !== 2)) {
      const state = String(d[w.workflow_state_field] ?? initial ?? "");
      if (state === initial) continue;
      const ts = w.transitions.filter((t) => t.state === state); if (!ts.some((t) => DECISIONS.has(t.action))) continue;
      const project = projectOfDoc(d); if (!ps.has(project)) continue;
      const logged = entered.get(`${w.document_type}|${d.name}|${state}`);
      const at = (logged ?? String(d["modified"] ?? d["creation"] ?? "")).slice(0, 10);
      const age = at ? Math.max(0, daysBetween(at, on)) : null;
      out.push({ source_doctype: w.document_type, source: d.name, source_table: "", row_no: null, title: titleOf(d), project, company: d["company"] || companyOf(project), state, owner: d["owner"] ?? "",
        waiting_on: [...new Set(ts.filter((t) => DECISIONS.has(t.action)).map((t) => t.allowed))].join("; "), actions: [...new Set(ts.map((t) => t.action))].join("; "), assigned_to: (todo.get(`${w.document_type}|${d.name}`) ?? []).join(", "),
        entered_on: at || null, entered_basis: logged ? "Workflow log" : "Last modified", age_days: age, age_bucket: age === null ? "" : ageBucket(age), amount: amountOf(d) });
    }
  }
  return out.sort((a, b) => num(b["age_days"]) - num(a["age_days"]) || String(a["source_doctype"]).localeCompare(String(b["source_doctype"])) || String(a["source"]).localeCompare(String(b["source"])));
}

// ---------------------------------------------------------------- RPT-CC-05 Measurement Availability and Exceptions
/** Per subcontract work-order line: ordered, measured, pending review, accepted (certified books), billed, and what is still available to measure / bill. */
export function measurementAvailability(f: F): Row[] {
  const ps = new Set(scope(f).map((p) => p.name)); const only = String(f["work_order"] ?? "");
  const out: Row[] = [];
  for (const wo of list("Digit Subcontract Work Order", (x) => live(x) && ps.has(String(x["project"])) && (!only || x.name === only) && x["workflow_state"] !== "Draft")) {
    const books = list("Digit Measurement Book", (b) => b["work_order"] === wo.name && live(b));
    const bills = list("Digit Subcontractor Bill", (b) => b["work_order"] === wo.name && isSubmitted(b));
    rows(wo, "lines").forEach((l, i) => {
      const key = String(l["line_key"] ?? ""); const ordered = num(l["qty"]);
      const entries = (bs: Doc[]) => bs.flatMap((b) => rows(b, "entries").filter((e) => e["wo_line_key"] === key));
      const measured = r3(sumBy(entries(books), (e) => entryQuantity(e)));
      const pending = r3(sumBy(entries(books.filter((b) => b["workflow_state"] === "Submitted")), (e) => entryQuantity(e)));
      const accepted = r3(sumBy(entries(books.filter((b) => b["workflow_state"] === "Certified")), (e) => effectiveQty(e)));
      const billed = r3(sumBy(bills.flatMap((b) => rows(b, "lines").filter((x) => x["wo_line_key"] === key)), (x) => num(x["this_period_qty"])));
      const flags: string[] = [];
      if (measured > ordered + 1e-9) flags.push("Measured above order");
      if (accepted > ordered + 1e-9) flags.push("Accepted above order");
      if (billed > accepted + 1e-9) flags.push("Billed above accepted");
      if (pending > 0) flags.push("Pending QS review");
      if (accepted - billed > 1e-9) flags.push("Accepted not billed");
      out.push({ work_order: wo.name, subcontractor: wo["subcontractor"] ?? "", project: wo["project"], company: wo["company"] || companyOf(wo["project"]), source_doctype: "Digit Subcontract Work Order", source: wo.name, source_table: "lines", row_no: idxOf(l, i),
        line_key: key, scope: l["scope"] ?? "", uom: l["uom"] ?? "", rate: num(l["rate"]), ordered_qty: ordered, measured_qty: measured, pending_qty: pending, accepted_qty: accepted, billed_qty: billed,
        available_to_measure: r3(ordered - accepted), available_to_bill: r3(accepted - billed), accepted_value: r2(lineAmount(accepted, l["rate"])), books: books.filter((b) => entries([b]).length).length, exception: joinFlags(flags) });
    });
  }
  return out;
}

// ---------------------------------------------------------------- RPT-MAT-03 Supply Progress and On-time Delivery
export type DeliveryStatus = "On time" | "Late" | "Open - overdue" | "Open - not due" | "No schedule date";
/**
 * Per purchase-order line: ordered, received, returned, remaining, the date the line was fully received and whether that
 * was on or before the line's schedule date plus the DEC-152 grace days (blank = 0). Supplier on-time % = on-time lines ÷
 * fully received lines with a schedule date, within the report scope; open lines are excluded.
 */
export function supplyOnTime(f: F, on = today()): Row[] {
  // DEC-152: one company-wide grace period (Construction Settings delivery_grace_days; blank = 0 days)
  const grace = Math.max(0, num(get("Digit Construction Settings", "Digit Construction Settings")?.["delivery_grace_days"]));
  const plusDays = (d: string, n: number) => (n ? new Date(Date.parse(d) + n * 86400000).toISOString().slice(0, 10) : d);
  const ps = new Set(scope(f).map((p) => p.name)); const sup = String(f["supplier"] ?? "");
  const prs = list("Purchase Receipt", isSubmitted);
  const out: Row[] = [];
  for (const po of list("Purchase Order", (d) => isSubmitted(d) && (!sup || d["supplier"] === sup))) rows(po, "items").forEach((it, i) => {
    const project = String(it["project"] ?? po["project"] ?? ""); if (!ps.has(project)) return;
    const rowName = String(it["name"] ?? ""); const match = (r: Row) => (rowName && r["purchase_order_item"] ? r["purchase_order_item"] === rowName : r["purchase_order"] === po.name && r["item_code"] === it["item_code"]);
    const moves = prs.flatMap((pr) => rows(pr, "items").filter(match).map((r) => ({ date: String(pr["posting_date"] ?? ""), qty: Math.abs(num(r["qty"])), ret: !!num(pr["is_return"]) }))).sort((a, b) => a.date.localeCompare(b.date));
    const ordered = num(it["qty"]); const received = r3(sumBy(moves.filter((m) => !m.ret), (m) => m.qty)), returned = r3(sumBy(moves.filter((m) => m.ret), (m) => m.qty));
    let acc = 0, completed = ""; for (const m of moves) if (!m.ret) { acc += m.qty; if (!completed && acc >= ordered - 1e-9) completed = m.date; }
    const due = String(it["schedule_date"] ?? po["schedule_date"] ?? "").slice(0, 10);
    const status: DeliveryStatus = !due ? "No schedule date" : completed ? (completed <= plusDays(due, grace) ? "On time" : "Late") : due < on ? "Open - overdue" : "Open - not due";
    const late = !due ? null : completed ? Math.max(0, daysBetween(due, completed)) : due < on ? daysBetween(due, on) : 0;
    out.push({ source_doctype: "Purchase Order", source: po.name, source_table: "items", row_no: idxOf(it, i), purchase_order: po.name, supplier: po["supplier"] ?? "", project, company: po["company"] || companyOf(project), item_code: it["item_code"] ?? "", uom: it["uom"] ?? it["stock_uom"] ?? "",
      schedule_date: due || null, ordered_qty: ordered, received_qty: received, returned_qty: returned, remaining_qty: r3(Math.max(0, ordered - (received - returned))), first_receipt: moves.find((m) => !m.ret)?.date || null, completed_on: completed || null,
      days_late: late, delivery_status: status });
  });
  const by = new Map<string, { on: number; n: number }>();
  for (const r of out) if (r["delivery_status"] === "On time" || r["delivery_status"] === "Late") { const k = String(r["supplier"]); const x = by.get(k) ?? { on: 0, n: 0 }; x.n++; if (r["delivery_status"] === "On time") x.on++; by.set(k, x); }
  return out.map((r) => { const x = by.get(String(r["supplier"])); return { ...r, supplier_on_time_pct: x && x.n ? r2((x.on / x.n) * 100) : null }; });
}

// ---------------------------------------------------------------- RPT-PRJ-BASELINE-FINISH-VARIANCE
/** Current Task dates against the approved stage-plan baseline (calendar days, no float / critical path). No approved baseline → no rows. */
export function baselineFinishVariance(project: string, status = ""): Row[] {
  const s = scheduleOf(project); if (!s.baseline.size) return [];
  const planRow = (plan: string, task: string) => { const d = get("Digit Stage Planning", plan); const rs = rows(d, "stage_planning_tasks"); const i = rs.findIndex((r) => r["task"] === task); return { d, i, r: rs[i] }; };
  const out: Row[] = [];
  const company = companyOf(project);
  for (const t of s.tasks) {
    const b = s.baseline.get(t.name);
    const base = { task: t.name, subject: t.subject, work_package: t.groupLabel, milestone: t.milestone ? 1 : 0, task_status: t.status, current_start: t.start, current_end: t.end, project, company };
    if (!b) { out.push({ ...base, source_doctype: "Task", source: t.name, source_table: "", row_no: null, baseline_plan: "", baseline_start: null, baseline_end: null, start_variance_days: null, finish_variance_days: null, variance_status: "Not in baseline" }); continue; }
    const pr = planRow(b.plan, t.name); const fv = daysBetween(b.end, t.end);
    out.push({ ...base, source_doctype: "Digit Stage Planning", source: b.plan, source_table: "stage_planning_tasks", row_no: pr.r ? idxOf(pr.r, pr.i) : null, baseline_plan: b.plan, baseline_as_of: String(pr.d?.["modified"] ?? "").slice(0, 10) || null,
      baseline_start: b.start, baseline_end: b.end, start_variance_days: daysBetween(b.start, t.start), finish_variance_days: fv, variance_status: fv > 0 ? "Finish later" : fv < 0 ? "Finish earlier" : "On baseline" });
  }
  const shown = new Set(s.tasks.map((t) => t.name));
  for (const b of s.baseline.values()) if (!shown.has(b.task)) {
    const pr = planRow(b.plan, b.task); const t = get("Task", b.task);
    out.push({ task: b.task, subject: t?.["subject"] ?? b.task, work_package: "", milestone: num(t?.["is_milestone"]) ? 1 : 0, task_status: t?.["status"] ?? "", current_start: null, current_end: null, project, company,
      source_doctype: "Digit Stage Planning", source: b.plan, source_table: "stage_planning_tasks", row_no: pr.r ? idxOf(pr.r, pr.i) : null, baseline_plan: b.plan, baseline_as_of: String(pr.d?.["modified"] ?? "").slice(0, 10) || null,
      baseline_start: b.start, baseline_end: b.end, start_variance_days: null, finish_variance_days: null, variance_status: "Not in current schedule" });
  }
  return status ? out.filter((r) => r["variance_status"] === status) : out;
}

export const GAP_REPORTS: PluginReport[] = [
  { name: "BOQ Estimate Variance", ref_doctype: "Digit BOQ", report_type: "Script Report", script: S("boq estimate variance"),
    filters: [...PREQ, { fieldname: "boq", label: "BOQ", fieldtype: "Link", options: "Digit BOQ" }],
    columns: [C("boq", "BOQ", "Link", "Digit BOQ"), C("estimate_version", "Estimate Version", "Link", "Digit Estimate Version"), ...SRC, C("code", "Code", "Data"), C("description", "Description", "Data"), C("uom", "UOM", "Data"),
      C("est_qty", "Estimate Qty", "Float"), C("boq_qty", "BOQ Qty", "Float"), C("qty_diff", "Qty Difference (BOQ − estimate)", "Float"), C("est_rate", "Estimate Selling Rate"), C("boq_rate", "BOQ Rate"), C("rate_diff", "Rate Difference (BOQ − estimate)"),
      C("est_amount", "Estimate Amount"), C("boq_amount", "BOQ Amount"), C("amount_diff", "Amount Difference (BOQ − estimate)"), C("variance_status", "Variance", "Data")],
    run: (f) => { const p = oneProject(f); return p ? boqEstimateVariance(p, (f["boq"] as string) || undefined) : []; } },
  { name: "Assembly Components", ref_doctype: "Digit Assembly", report_type: "Script Report", script: S("assembly components"),
    filters: [{ fieldname: "category", label: "Category", fieldtype: "Data" }, { fieldname: "rate_category", label: "Rate Category", fieldtype: "Data" }, { fieldname: "as_of", label: "As of", fieldtype: "Date" }],
    columns: [C("assembly", "Assembly", "Link", "Digit Assembly"), C("category", "Category", "Data"), C("assembly_uom", "Assembly Unit", "Data"), C("unit_cost", "Assembly Unit Cost"), ...SRC, C("rate", "Rate", "Link", "Digit Construction Rate"),
      C("uom", "UOM", "Data"), C("coefficient", "Coefficient", "Float"), C("unit_rate", "Unit Rate (stored)"), C("current_rate", "Current Rate"), C("amount", "Amount"), C("share_pct", "Share of Unit Cost %", "Percent"),
      C("valid_until", "Valid Until", "Date"), C("validity", "Validity", "Data"), C("flags", "Checks", "Data")],
    run: (f) => assemblyComponents(f) },
  { name: "BOQ Measurement Reconciliation", ref_doctype: "Digit Client Contract", report_type: "Script Report", script: S("contract quantity reconciliation"),
    filters: [...PF, { fieldname: "contract", label: "Client Contract", fieldtype: "Link", options: "Digit Client Contract" }],
    columns: [C("contract", "Client Contract", "Link", "Digit Client Contract"), C("project", "Project", "Link", "Project"), ...SRC, C("line_key", "SOV Line", "Data"), C("origin", "Origin", "Data"), C("description", "Description", "Data"), C("uom", "UOM", "Data"),
      C("original_qty", "Original Qty", "Float"), C("revised_qty", "Revised Qty", "Float"), C("claimed_qty", "Claimed to Date", "Float"), C("certified_qty", "Certified to Date", "Float"), C("rejected_qty", "Rejected Qty", "Float"), C("disputed_qty", "Disputed Qty", "Float"),
      C("remaining_qty", "Remaining Qty", "Float"), C("certified_amount", "Certified Amount (gross)"), C("recon_status", "Reconciliation", "Data")],
    run: (f) => measurementReconciliation(f) },
  { name: "Variations Register", ref_doctype: "Digit Client Variation", report_type: "Script Report", script: S("variations register"),
    filters: [...PF, { fieldname: "status", label: "Status", fieldtype: "Select", options: "\nDraft\nSubmitted\nApproved\nRejected" }],
    columns: [C("variation", "Client Variation", "Link", "Digit Client Variation"), C("contract", "Client Contract", "Link", "Digit Client Contract"), C("project", "Project", "Link", "Project"), C("change_kind", "Change Kind", "Data"), C("state", "Status", "Data"),
      C("requested_on", "Requested On", "Date"), C("approved_on", "Approved On", "Date"), ...SRC, C("sov_line_key", "SOV Line", "Data"), C("description", "Description", "Data"), C("uom", "UOM", "Data"), C("qty", "Qty", "Float"), C("rate", "Rate"),
      C("pending_amount", "Pending Amount"), C("approved_amount", "Approved Amount"), C("rejected_amount", "Rejected Amount"), C("time_days", "Time Impact (days, per variation)", "Int"), C("in_contract", "In Contract SOV", "Check")],
    run: (f) => variationsRegister(f) },
  { name: "Approval Aging", ref_doctype: "Project", report_type: "Script Report", script: S("approval aging"),
    filters: [...PF, { fieldname: "document_type", label: "Document Type", fieldtype: "Select", options: ["", ...new Set(CONSTRUCTION_WORKFLOWS.map((w) => w.document_type))].join("\n") }],
    columns: [...SRC, C("title", "Title", "Data"), C("project", "Project", "Link", "Project"), C("state", "Status", "Data"), C("waiting_on", "Waiting On (roles)", "Data"), C("assigned_to", "Assigned To", "Data"),
      C("entered_on", "In This Step Since", "Date"), C("entered_basis", "Since Basis", "Data"), C("age_days", "Age (days)", "Int"), C("age_bucket", "Age Bucket", "Data"), C("amount", "Amount")],
    run: (f) => approvalAging(f) },
  { name: "Measurement Availability and Exceptions", ref_doctype: "Digit Subcontract Work Order", report_type: "Script Report", script: S("measurement availability"),
    filters: [...PF, { fieldname: "work_order", label: "Work Order", fieldtype: "Link", options: "Digit Subcontract Work Order" }],
    columns: [C("work_order", "Work Order", "Link", "Digit Subcontract Work Order"), C("subcontractor", "Subcontractor", "Link", "Supplier"), C("project", "Project", "Link", "Project"), ...SRC, C("scope", "Scope", "Data"), C("uom", "UOM", "Data"),
      C("ordered_qty", "Ordered Qty", "Float"), C("measured_qty", "Measured Qty", "Float"), C("pending_qty", "Pending Review Qty", "Float"), C("accepted_qty", "Accepted Qty", "Float"), C("billed_qty", "Billed Qty", "Float"),
      C("available_to_measure", "Available to Measure", "Float"), C("available_to_bill", "Accepted Not Billed Qty", "Float"), C("accepted_value", "Accepted Value"), C("exception", "Exceptions", "Data")],
    run: (f) => measurementAvailability(f) },
  { name: "Supply Progress and On-time Delivery", ref_doctype: "Purchase Order", report_type: "Script Report", script: S("supply on time"),
    filters: [...PF, { fieldname: "supplier", label: "Supplier", fieldtype: "Link", options: "Supplier" }],
    columns: [...SRC, C("supplier", "Supplier", "Link", "Supplier"), C("project", "Project", "Link", "Project"), C("item_code", "Item", "Link", "Item"), C("uom", "UOM", "Data"), C("schedule_date", "Schedule Date", "Date"),
      C("ordered_qty", "Ordered Qty", "Float"), C("received_qty", "Received Qty", "Float"), C("returned_qty", "Returned Qty", "Float"), C("remaining_qty", "Remaining Qty", "Float"), C("first_receipt", "First Receipt", "Date"), C("completed_on", "Fully Received On", "Date"),
      C("days_late", "Days Late", "Int"), C("delivery_status", "Delivery Status", "Data"), C("supplier_on_time_pct", "Supplier On-time %", "Percent")],
    run: (f) => supplyOnTime(f) },
  { name: "Baseline Finish Variance", ref_doctype: "Task", report_type: "Script Report", script: S("baseline finish variance"),
    filters: [...PREQ, { fieldname: "status", label: "Variance", fieldtype: "Select", options: "\nFinish later\nFinish earlier\nOn baseline\nNot in baseline\nNot in current schedule" },
      // F02-03-2: a captured schedule baseline (Digit Schedule Baseline) instead of the approved stage plan
      { fieldname: "baseline", label: "Schedule Baseline", fieldtype: "Link", options: "Digit Schedule Baseline" }],
    columns: [C("task", "Task", "Link", "Task"), C("subject", "Subject", "Data"), C("milestone", "Milestone", "Check"), C("task_status", "Task Status", "Data"), ...SRC, C("baseline_start", "Baseline Start", "Date"), C("baseline_end", "Baseline Finish", "Date"),
      C("current_start", "Current Start", "Date"), C("current_end", "Current Finish", "Date"), C("start_variance_days", "Start Variance (days)", "Int"), C("finish_variance_days", "Finish Variance (days)", "Int"), C("baseline_as_of", "Baseline As Of", "Date"), C("progress_pct", "Progress %", "Percent"), C("variance_status", "Variance", "Data")],
    run: (f) => { const p = oneProject(f); if (!p) return []; if (f["baseline"]) { const st = String(f["status"] ?? ""); return baselineComparison(String(f["baseline"])).filter((r) => r["project"] === p && (!st || r["variance_status"] === st)); } return baselineFinishVariance(p, String(f["status"] ?? "")); } },
];
