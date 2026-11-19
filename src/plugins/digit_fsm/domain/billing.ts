import { VISIT_DT } from "@/plugins/digit_fsm/schema";
/**
 * F4-03 / F4-04 / F4-05 parts, labour and billing figures (owner FSM round F4, 2026-11-18). Pure readers over the native
 * documents linked to an FSM job (Material Request, Stock Entry, Stock Ledger Entry, Timesheet, Sales Invoice) and the FSM
 * job / agreement / visits / charge proposal. The van card, the consumption bar, the hours bar, the billing equation, the
 * charge proposal and the draft invoice hand-off all read these functions, so a card, a list and an invoice show one
 * number. Nothing here writes; ledger rows stay with src/lib/posting.ts.
 *
 *  parts     issued   = posted Material Transfer stores → van for the job
 *            used     = posted Material Issue for the job (draft usage is counted apart as «بانتظار الترحيل»)
 *            returned = posted Material Transfer van → stores for the job
 *            open     = issued − used − returned; red when negative, or when the job is done and parts stay unexplained
 *  labour    booked   = reserved FSM Booking hours · logged = Timesheet hours (draft + submitted) · approved = submitted
 *  billing   approved labour + parts used + charges − covered by agreement = to invoice (net), VAT 15 % on top
 */
import { adapter, type Doc } from "@/lib/adapter";
import { list, raw, rows } from "./data";
import { s, type Row } from "./rules";

export const VAT_RATE = 0.15;
export const r2 = (n: number) => Math.round(n * 100) / 100;
const n0 = (v: unknown) => Number(v) || 0;
const ms = (v: unknown) => { const x = s(v).replace(" ", "T").slice(0, 19); return x ? Date.parse(x) : NaN; };
/** Numeric FSM setting with its default (FSM Settings single). */
export function fsmNumber(key: string, dflt: number): number { const v = adapter.get("FSM Settings", "FSM Settings")?.[key]; const n = Number(v); return v === undefined || v === null || v === "" || !Number.isFinite(n) ? dflt : n; }
export const labourRate = () => fsmNumber("labour_rate", 250);
export const calloutFee = () => fsmNumber("callout_fee", 350);
export const LABOUR_ITEM = "FSM-SVC-REPAIR";
export const CALLOUT_ITEM = "FSM-SVC-CALLOUT";
const DONE = new Set(["Completed", "Closed"]);

// ---------------------------------------------------------------- parts
/** Van warehouse → technician (FSM Technician.van_warehouse). */
export function vanWarehouses(): Map<string, string> {
  const m = new Map<string, string>(); for (const t of list("FSM Technician")) { const w = s(t["van_warehouse"]); if (w) m.set(w, t.name); } return m;
}
export type MoveKind = "issue" | "use" | "return" | "other";
/** One Stock Entry line of a job: stores → van = issued; Material Issue = used; van → stores (or a return receipt) = returned. */
export function moveKind(se: Doc, line: Row, vans: Map<string, string>): MoveKind {
  const p = s(se["purpose"]) || s(se["stock_entry_type"]);
  const from = s(line["s_warehouse"]) || s(se["from_warehouse"]); const to = s(line["t_warehouse"]) || s(se["to_warehouse"]);
  if (p === "Material Issue") return "use";
  if (p === "Material Transfer" && vans.has(to) && !vans.has(from)) return "issue";
  if (p === "Material Transfer" && vans.has(from) && !vans.has(to)) return "return";
  if (/receipt|return/i.test(p) && from === "") return "return";
  return "other";
}
export interface PartLine { item: string; item_name: string; uom: string; rate: number; requested: number; issued: number; used: number; returned: number; usedDraft: number; returnedDraft: number; open: number; bad: boolean; waiting: boolean; reason?: [string, string] | undefined }
export interface PartsFlow { job: string; done: boolean; lines: PartLine[]; requested: number; issued: number; used: number; returned: number; open: number; drafts: number; discrepancies: number; waiting: number }
export function partsFlow(job: string): PartsFlow {
  const j = raw("FSM Job", job); const done = DONE.has(s(j?.["workflow_state"]));
  const vans = vanWarehouses(); const m = new Map<string, PartLine>();
  const line = (code: string): PartLine => {
    let L = m.get(code);
    if (!L) { const it = raw("Item", code); L = { item: code, item_name: s(it?.["item_name"]) || code, uom: s(it?.["stock_uom"]) || "Nos", rate: n0(it?.["standard_rate"]), requested: 0, issued: 0, used: 0, returned: 0, usedDraft: 0, returnedDraft: 0, open: 0, bad: false, waiting: false }; m.set(code, L); }
    return L;
  };
  for (const mr of list("Material Request")) if (s(mr["digit_fsm_job"]) === job && n0(mr["docstatus"]) !== 2) for (const it of rows(mr, "items")) line(s(it["item_code"])).requested += n0(it["qty"]);
  for (const se of list("Stock Entry")) {
    if (s(se["digit_fsm_job"]) !== job || n0(se["docstatus"]) === 2) continue; const posted = n0(se["docstatus"]) === 1;
    for (const it of rows(se, "items")) {
      const k = moveKind(se, it, vans); const q = n0(it["qty"]); const L = line(s(it["item_code"]));
      if (k === "issue" && posted) L.issued += q;
      else if (k === "use") { if (posted) L.used += q; else L.usedDraft += q; }
      else if (k === "return") { if (posted) L.returned += q; else L.returnedDraft += q; }
    }
  }
  const lines = [...m.values()];
  for (const L of lines) {
    L.open = L.issued - L.used - L.returned;
    if (L.open < 0) { L.bad = true; L.reason = ["More used or returned than issued", "المستخدم والمرتجع أكثر من المصروف"]; }
    else if (done && L.open > 0 && !L.usedDraft && !L.returnedDraft) { L.bad = true; L.reason = [`${L.open} issued but neither used nor returned`, `${L.open} مصروف لم يُستخدم ولم يُرجع`]; }
    else if (L.requested > L.issued) { L.waiting = true; L.reason = [`${L.requested - L.issued} requested, not issued yet`, `${L.requested - L.issued} مطلوب لم يُصرف بعد`]; }
  }
  const sum = (k: keyof PartLine) => lines.reduce((a, l) => a + n0(l[k]), 0);
  return { job, done, lines, requested: sum("requested"), issued: sum("issued"), used: sum("used"), returned: sum("returned"), open: sum("open"), drafts: sum("usedDraft") + sum("returnedDraft"), discrepancies: lines.filter((l) => l.bad).length, waiting: lines.filter((l) => l.waiting).length };
}
export interface VanLine { item: string; item_name: string; uom: string; qty: number; value: number; pending: number; free: number; low: boolean }
/** Van stock of a technician from the posted stock ledger of the van warehouse; draft usage from the van is shown as pending. */
export function vanStock(tech: string): { warehouse: string; lines: VanLine[]; qty: number; value: number; pending: number; low: number } {
  const wh = s(raw("FSM Technician", tech)?.["van_warehouse"]);
  if (!wh) return { warehouse: "", lines: [], qty: 0, value: 0, pending: 0, low: 0 };
  const m = new Map<string, VanLine>();
  const line = (code: string) => { let L = m.get(code); if (!L) { const it = raw("Item", code); L = { item: code, item_name: s(it?.["item_name"]) || code, uom: s(it?.["stock_uom"]) || "Nos", qty: 0, value: 0, pending: 0, free: 0, low: false }; m.set(code, L); } return L; };
  for (const e of list("Stock Ledger Entry")) { if (s(e["warehouse"]) !== wh || n0(e["is_cancelled"])) continue; const L = line(s(e["item_code"])); L.qty += n0(e["actual_qty"]); L.value += n0(e["stock_value_difference"]); }
  for (const se of list("Stock Entry")) { if (n0(se["docstatus"]) !== 0) continue; for (const it of rows(se, "items")) if ((s(it["s_warehouse"]) || s(se["from_warehouse"])) === wh) line(s(it["item_code"])).pending += n0(it["qty"]); }
  const lines = [...m.values()].map((L) => ({ ...L, qty: r2(L.qty), value: r2(L.value), free: r2(L.qty - L.pending), low: L.qty - L.pending <= 1 })).filter((L) => L.qty !== 0 || L.pending !== 0).sort((a, b) => a.item_name.localeCompare(b.item_name));
  return { warehouse: wh, lines, qty: lines.reduce((a, l) => a + l.qty, 0), value: r2(lines.reduce((a, l) => a + l.value, 0)), pending: lines.reduce((a, l) => a + l.pending, 0), low: lines.filter((l) => l.low).length };
}

// ---------------------------------------------------------------- labour
export interface Hours { booked: number; logged: number; approved: number; pending: number }
const techByEmployee = () => { const m = new Map<string, string>(); for (const t of list("FSM Technician")) if (t["employee"]) m.set(s(t["employee"]), t.name); return m; };
const logHours = (ts: Doc) => { const l = rows(ts, "time_logs"); return l.length ? l.reduce((a, x) => a + n0(x["hours"]), 0) : n0(ts["total_hours"]); };
/** Booked vs logged vs approved hours, optionally for one job, one technician and/or a date window (inclusive). */
export function hoursOf(f: { job?: string | undefined; tech?: string | undefined; from?: string | undefined; to?: string | undefined } = {}): Hours {
  const inWin = (d: string) => (!f.from || d >= f.from) && (!f.to || d <= f.to);
  let booked = 0, logged = 0, approved = 0;
  const visitJob = new Map(list(VISIT_DT).map((v) => [v.name, s(v["job"])]));
  for (const b of list("FSM Booking")) {
    if (s(b["status"]) === "Cancelled") continue; if (f.tech && s(b["technician"]) !== f.tech) continue; if (f.job && visitJob.get(s(b["visit"])) !== f.job) continue;
    if (!inWin(s(b["booking_start"]).slice(0, 10))) continue;
    const h = (ms(b["booking_end"]) - ms(b["booking_start"])) / 3_600_000; if (Number.isFinite(h) && h > 0) booked += h;
  }
  const emp = techByEmployee();
  for (const ts of list("Timesheet")) {
    if (!s(ts["digit_fsm_job"]) || n0(ts["docstatus"]) === 2) continue; if (f.job && s(ts["digit_fsm_job"]) !== f.job) continue;
    if (f.tech && emp.get(s(ts["employee"])) !== f.tech) continue; if (!inWin(s(ts["start_date"]).slice(0, 10))) continue;
    const h = logHours(ts); logged += h; if (n0(ts["docstatus"]) === 1) approved += h;
  }
  return { booked: r2(booked), logged: r2(logged), approved: r2(approved), pending: r2(logged - approved) };
}

// ---------------------------------------------------------------- billing
export type CoverDecision = "Covered" | "Partly Covered" | "Chargeable";
export type BillState = "invoiced" | "ready" | "blocked" | "covered";
export interface BillLine { key: string; kind: "labour" | "part" | "charge"; item_code: string; item_name: string; qty: number; uom: string; rate: number; amount: number; covered: boolean }
export interface JobBilling {
  job: string; customer: string; site: string; company: string; decision: CoverDecision; coverBasis: [string, string];
  labourH: number; labour: number; parts: number; charges: number; covered: number; net: number; vat: number; gross: number;
  lines: BillLine[]; hours: Hours; flow: PartsFlow; state: BillState; blockers: [string, string][];
  proposal?: Doc | undefined; invoice?: Doc | undefined; quotation?: Doc | undefined; proposalDiff: number | null;
}
/** Systems a job works on: its obligations, its runs, its finding and the request it came from. */
export function jobSystems(job: string): Set<string> {
  const j = raw("FSM Job", job); const out = new Set<string>();
  for (const b of rows(j, "obligations")) if (b["system"]) out.add(s(b["system"]));
  for (const r of list("FSM Inspection Run")) if (s(r["job"]) === job && r["system"]) out.add(s(r["system"]));
  const d = raw("FSM Deficiency", j?.["deficiency"]); if (d?.["system"]) out.add(s(d["system"]));
  for (const i of list("Issue")) if (s(i["digit_fsm_job"]) === job && i["digit_fsm_system"]) out.add(s(i["digit_fsm_system"]));
  if (j?.["system"]) out.add(s(j["system"]));
  return out;
}
/** The billing equation of one job (pure): approved labour + parts used + charges − covered by agreement = to invoice. */
export function jobBilling(job: string): JobBilling {
  const j = raw("FSM Job", job); const company = s(j?.["company"]);
  const rate = labourRate(); const lines: BillLine[] = [];
  const logs = list("Timesheet").filter((t) => s(t["digit_fsm_job"]) === job && n0(t["docstatus"]) === 1).flatMap((t) => rows(t, "time_logs").length ? rows(t, "time_logs") : [{ hours: t["total_hours"], billing_rate: rate } as Row]);
  const labourH = r2(logs.reduce((a, l) => a + n0(l["hours"]), 0));
  const labour = r2(logs.reduce((a, l) => a + n0(l["hours"]) * (n0(l["billing_rate"]) || rate), 0));
  const flow = partsFlow(job);
  for (const L of flow.lines) if (L.used > 0) lines.push({ key: `part:${L.item}`, kind: "part", item_code: L.item, item_name: L.item_name, qty: L.used, uom: L.uom, rate: L.rate, amount: r2(L.used * L.rate), covered: false });
  const parts = r2(lines.filter((l) => l.kind === "part").reduce((a, l) => a + l.amount, 0));
  const emergency = list(VISIT_DT).filter((v) => s(v["job"]) === job && s(v["visit_purpose"]) === "Emergency" && ["On Site", "Completed"].includes(s(v["workflow_state"]))).length;
  const fee = calloutFee(); const charges = r2(emergency * fee);
  const ag = raw("FSM Service Agreement", j?.["agreement"]); const agOk = !!ag && !["Draft", "Terminated"].includes(s(ag["workflow_state"]));
  const type = s(j?.["job_type"]);
  // coverage comes from the agreement's own coverage lines: a planned inspection of an active agreement is in the fee; a
  // corrective / emergency job on a system whose «Maintenance» line is included in the fee has its labour covered, while
  // parts and call-out are charged; anything else is chargeable
  const sys = jobSystems(job);
  const maint = agOk && rows(ag, "coverage").some((c) => s(c["service_type"]) === "Maintenance" && n0(c["included"]) === 1 && sys.has(s(c["system"])));
  const decision: CoverDecision = agOk && type === "PM Inspection" ? "Covered" : maint && ["Corrective", "Emergency", "Repair"].includes(type) ? "Partly Covered" : "Chargeable";
  const covered = decision === "Covered" ? r2(labour + parts + charges) : decision === "Partly Covered" ? labour : 0;
  const coverBasis: [string, string] = decision === "Covered" ? [`Planned inspection included in agreement ${ag!.name}`, `فحص مخطط مشمول في الاتفاقية ${ag!.name}`]
    : decision === "Partly Covered" ? [`Maintenance labour is included in the fee of agreement ${ag!.name}; parts and call-out are charged`, `عمالة الصيانة مشمولة في رسوم الاتفاقية ${ag!.name}؛ القطع والاستدعاء تُحصّل`]
      : [ag ? `Agreement ${ag.name} does not cover this work` : "No service agreement on this job", ag ? `الاتفاقية ${ag.name} لا تغطي هذا العمل` : "لا اتفاقية خدمة على أمر العمل"];
  if (labour > 0 || labourH > 0) lines.unshift({ key: "labour", kind: "labour", item_code: LABOUR_ITEM, item_name: s(raw("Item", LABOUR_ITEM)?.["item_name"]) || "Corrective repair labour", qty: labourH, uom: "Hour", rate: labourH ? r2(labour / labourH) : rate, amount: labour, covered: decision !== "Chargeable" });
  if (charges > 0) lines.push({ key: "callout", kind: "charge", item_code: CALLOUT_ITEM, item_name: s(raw("Item", CALLOUT_ITEM)?.["item_name"]) || "Emergency call-out", qty: emergency, uom: "Nos", rate: fee, amount: charges, covered: decision === "Covered" });
  if (decision === "Covered") for (const l of lines) l.covered = true;
  const net = r2(Math.max(0, labour + parts + charges - covered)); const vat = r2(net * VAT_RATE); const gross = r2(net + vat);
  const hours = hoursOf({ job });
  const proposal = list("FSM Charge Proposal").find((c) => s(c["job"]) === job);
  const invoice = raw("Sales Invoice", proposal?.["sales_invoice"]) ?? list("Sales Invoice").find((i) => s(i["digit_fsm_job"]) === job && n0(i["docstatus"]) !== 2);
  const blockers: [string, string][] = [];
  if (!DONE.has(s(j?.["workflow_state"]))) blockers.push(["The job is not completed yet", "أمر العمل لم يكتمل بعد"]);
  if (hours.pending > 0) blockers.push([`${hours.pending} h logged but not approved`, `${hours.pending} ساعة مسجلة غير معتمدة`]);
  if (flow.discrepancies > 0) blockers.push([`${flow.discrepancies} part line(s) with a difference`, `${flow.discrepancies} بند قطع به فرق`]);
  if (flow.drafts > 0) blockers.push(["Part usage waiting to be posted by stores", "استهلاك قطع بانتظار ترحيل المستودع"]);
  const state: BillState = invoice ? "invoiced" : blockers.length ? "blocked" : net <= 0 ? "covered" : "ready";
  const proposalDiff = proposal && !invoice && decision !== "Covered" ? r2(n0(proposal["amount"]) - gross) : null;
  return { job, customer: s(j?.["customer"]), site: s(j?.["site"]), company, decision, coverBasis, labourH, labour, parts, charges, covered, net, vat, gross, lines, hours, flow, state, blockers, proposal, invoice, quotation: raw("Quotation", j?.["quotation"]), proposalDiff };
}
/** Words of the equation for a proposal basis / audit line. */
export const equationText = (b: JobBilling): [string, string] => [
  `Approved labour ${b.labour} + parts ${b.parts} + charges ${b.charges} − covered ${b.covered} = ${b.net} net + VAT ${b.vat} = ${b.gross}`,
  `العمالة المعتمدة ${b.labour} + القطع ${b.parts} + الرسوم ${b.charges} − المغطى ${b.covered} = ${b.net} صافي + ضريبة ${b.vat} = ${b.gross}`,
];
