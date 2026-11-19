import { moneyInWords } from "./formCalc";
import { resolveName } from "./rename";
const ac = (a: string) => resolveName("Account", a);
/**
 * Mandatory end-to-end scenarios run through the same engines the screens use:
 * form rules/calculations (formRules.ts), Create mapping (engines.mapDoc + form_actions field maps),
 * posting (posting.ts: submit/cancel/amend, GL/SLE, outstanding, status_updater) and CRM convert (crm.ts).
 * Every step asserts a result; records are created in the local store like a user would create them.
 */
import { adapter, type Doc } from "./adapter";
import { TABLE_TYPES, type DocTypeMeta } from "./catalog";
import { applyChange, validateDoc, type RuleMap } from "./formRules";
import { mapDoc, type FormAction } from "./engines";
import { submit, cancel, amend, makePaymentEntry } from "./posting";
import { convertLeadToDeal, type CrmDefaults } from "./crm";
import { makeSchedule, postDepreciation, disposeAsset, restoreAsset, cancelDepreciation, accumulated } from "./assets";

export interface Step { label: string; ok: boolean; detail: string }
export interface Scenario { name: string; ok: boolean; steps: Step[]; docs: string[] }
export interface Ctx { meta: (dt: string) => Promise<DocTypeMeta | undefined>; rules: RuleMap; actions: Record<string, FormAction[]>; crm: CrmDefaults }

const n = (v: unknown) => Number(v) || 0;
const today = () => new Date().toISOString().slice(0, 10);
const plus = (d: number) => new Date(Date.now() + d * 864e5).toISOString().slice(0, 10);

export async function runScenarios(ctx: Ctx): Promise<Scenario[]> {
  const C = resolveName("Company", "Digit Demo Trading Co."); const A = String(adapter.get("Company", C)?.["abbr"] ?? "DDT");
  const wh = adapter.list("Warehouse").filter((w) => w["company"] === C && !n(w["is_group"])).map((w) => w.name);
  const items = adapter.list("Item").filter((i) => n(i["is_stock_item"] ?? 1) && !n(i["has_variants"])).slice(0, 3);
  const cust = adapter.list("Customer").find((c) => c.name.startsWith(A))?.name ?? adapter.list("Customer")[0]!.name;
  const supp = adapter.list("Supplier").find((c) => c.name.startsWith(A))?.name ?? adapter.list("Supplier")[0]!.name;
  const tag = Date.now().toString(36).slice(-5).toUpperCase();

  // ---- helpers ----
  const calc = async (dt: string, name: string, patch: Record<string, unknown>) => {
    const m = (await ctx.meta(dt))!; const d = adapter.get(dt, name)!;
    const st = applyChange(m, ctx.rules[dt], { doc: d, over: {}, applied: [] }, patch);
    adapter.update(dt, name, st.doc); return { doc: adapter.get(dt, name)!, over: st.over, errors: validateDoc(m, ctx.rules[dt], st) };
  };
  const make = async (sdt: string, sname: string, tdt: string, extra: Record<string, unknown> = {}) => {
    const sm = (await ctx.meta(sdt))!; const tm = (await ctx.meta(tdt))!;
    const cms: Record<string, DocTypeMeta> = {};
    for (const f of tm.fields.filter((x) => TABLE_TYPES.has(x.fieldtype) && x.options)) { const m = await ctx.meta(f.options!); if (m) cms[f.options!] = m; }
    const a = (ctx.actions[sdt] ?? []).find((x) => x.target === tdt);
    return adapter.insertDoc(tdt, { ...mapDoc(sm, adapter.get(sdt, sname)!, tm, cms, a?.field_map), docstatus: 0, ...extra });
  };
  const glOf = (v: string, all = false) => adapter.list("GL Entry").filter((g) => g["voucher_no"] === v && (all || !n(g["is_cancelled"])));
  const balanced = (v: string) => { const g = glOf(v); const dr = g.reduce((s, x) => s + n(x["debit"]), 0), cr = g.reduce((s, x) => s + n(x["credit"]), 0); return { ok: g.length > 0 && Math.abs(dr - cr) < 0.005, detail: `${g.length} GL rows, Dr ${dr.toFixed(2)} = Cr ${cr.toFixed(2)}` }; };
  const line = (i: number, qty: number, rate: number, w = wh[0]) => ({ idx: i + 1, item_code: items[i % items.length]!.name, item_name: items[i % items.length]!["item_name"], qty, rate, uom: "Nos", stock_uom: "Nos", conversion_factor: 1, warehouse: w, schedule_date: plus(7), delivery_date: plus(7) });
  const vat = (sales: boolean) => [{ idx: 1, charge_type: "On Net Total", account_head: `VAT 15% ${sales ? "Output" : "Input"} - ${A}`, description: "VAT 15%", rate: 15 }];
  const run = async (name: string, fn: (s: (label: string, ok: boolean, detail: string) => void, docs: string[]) => Promise<void>): Promise<Scenario> => {
    const steps: Step[] = []; const docs: string[] = [];
    try { await fn((label, ok, detail) => steps.push({ label, ok, detail }), docs); } catch (e) { steps.push({ label: "error", ok: false, detail: String(e).slice(0, 200) }); }
    return { name, ok: steps.length > 0 && steps.every((x) => x.ok), steps, docs };
  };

  const out: Scenario[] = [];

  out.push(await run("Sales Invoice: 15% VAT, discount, rounding → submit → partial then full payment", async (s, docs) => {
    const si = adapter.insertDoc("Sales Invoice", { name: `SCN-SINV-${tag}`, company: C, customer: cust, posting_date: today(), due_date: plus(30), currency: "SAR", debit_to: ac(`Debtors - ${A}`), items: [line(0, 3, 333.33), line(1, 2, 150.5)], docstatus: 0 });
    docs.push(si.name);
    const { doc } = await calc("Sales Invoice", si.name, { taxes: vat(true), additional_discount_percentage: 10, apply_discount_on: "Net Total" });
    // total 1300.99 → discount 10% on net 130.10 → net 1170.89 → VAT 175.63 → grand 1346.52 → rounded 1347
    s("totals: total / discount / net / VAT / grand", n(doc["total"]) === 1300.99 && n(doc["discount_amount"]) === 130.1 && n(doc["net_total"]) === 1170.89 && n(doc["total_taxes_and_charges"]) === 175.63 && n(doc["grand_total"]) === 1346.52, `${doc["total"]} / ${doc["discount_amount"]} / ${doc["net_total"]} / ${doc["total_taxes_and_charges"]} / ${doc["grand_total"]}`);
    s("rounding: rounded_total and adjustment", n(doc["rounded_total"]) === 1347 && n(doc["rounding_adjustment"]) === 0.48, `${doc["rounded_total"]} (${doc["rounding_adjustment"]})`);
    s("In Words", String(doc["in_words"]) === moneyInWords(n(doc["rounded_total"]) || n(doc["grand_total"])), String(doc["in_words"]));
    const e = submit("Sales Invoice", si.name); const d1 = adapter.get("Sales Invoice", si.name)!;
    s("submit → docstatus 1, Unpaid, outstanding = rounded total", !e.length && d1.docstatus === 1 && d1["status"] === "Unpaid" && n(d1["outstanding_amount"]) === 1347, `${d1["status"]} ${d1["outstanding_amount"]} ${e.join(";")}`);
    const b = balanced(si.name); s("GL balanced (Debtors, Sales, VAT Output, Round Off)", b.ok && glOf(si.name).some((g) => g["account"] === ac(`Round Off - ${A}`)), b.detail);
    const p1 = makePaymentEntry("Sales Invoice", si.name, 500); docs.push(p1.name); submit("Payment Entry", p1.name);
    const d2 = adapter.get("Sales Invoice", si.name)!;
    s("partial payment 500 → Partly Paid, outstanding 847", d2["status"] === "Partly Paid" && n(d2["outstanding_amount"]) === 847, `${d2["status"]} ${d2["outstanding_amount"]}`);
    const p2 = makePaymentEntry("Sales Invoice", si.name); docs.push(p2.name); submit("Payment Entry", p2.name);
    const d3 = adapter.get("Sales Invoice", si.name)!;
    s("full payment → Paid, outstanding 0", d3["status"] === "Paid" && n(d3["outstanding_amount"]) === 0, `${d3["status"]} ${d3["outstanding_amount"]}`);
    s("payments balanced in GL", balanced(p1.name).ok && balanced(p2.name).ok, `${balanced(p1.name).detail}; ${balanced(p2.name).detail}`);
  }));

  out.push(await run("Quotation → Sales Order → partial Delivery Note → Sales Invoice", async (s, docs) => {
    const q = adapter.insertDoc("Quotation", { name: `SCN-QTN-${tag}`, company: C, quotation_to: "Customer", party_name: cust, customer_name: cust, transaction_date: today(), valid_till: plus(30), currency: "SAR", items: [line(0, 10, 100)], docstatus: 0 });
    docs.push(q.name); await calc("Quotation", q.name, { taxes: vat(true) }); submit("Quotation", q.name);
    const so = await make("Quotation", q.name, "Sales Order", { customer: cust, delivery_date: plus(7), transaction_date: today() }); docs.push(so.name);
    s("Create ▸ Sales Order carries items and Quotation link", (so["items"] as Doc[]).length === 1 && (so["items"] as Doc[])[0]!["prevdoc_docname"] === q.name, `${so.name}: ${(so["items"] as Doc[]).map((r) => `${r["item_code"]}×${r["qty"]}`).join(",")}`);
    await calc("Sales Order", so.name, {}); submit("Sales Order", so.name);
    s("Quotation → Ordered", adapter.get("Quotation", q.name)!["status"] === "Ordered", String(adapter.get("Quotation", q.name)!["status"]));
    // ERPNext refuses a delivery without stock (stock_ledger.py NegativeStockError), so the goods are received first
    const rcv = adapter.insertDoc("Stock Entry", { name: `SCN-STE-SO-${tag}`, company: C, posting_date: today(), docstatus: 0, items: [{ ...line(0, 10, 100), s_warehouse: "", t_warehouse: wh[0], basic_rate: 100 }] });
    docs.push(rcv.name); await calc("Stock Entry", rcv.name, { stock_entry_type: "Material Receipt", purpose: "Material Receipt" });
    const rcvErr = submit("Stock Entry", rcv.name);
    s("Material Receipt +10 puts the item in stock", rcvErr.length === 0 && adapter.get("Stock Entry", rcv.name)!["docstatus"] === 1, rcvErr.join("; "));
    const dn = await make("Sales Order", so.name, "Delivery Note", { posting_date: today() }); docs.push(dn.name);
    const its = (dn["items"] as Doc[]).map((r) => ({ ...r, qty: 4, warehouse: wh[0] }));
    await calc("Delivery Note", dn.name, { items: its }); const dnErr = submit("Delivery Note", dn.name);
    const so2 = adapter.get("Sales Order", so.name)!;
    s("partial delivery 4/10 → SO 40% delivered, To Deliver and Bill", n(so2["per_delivered"]) === 40 && so2["status"] === "To Deliver and Bill", `${so2["per_delivered"]}% ${so2["status"]}${dnErr.length ? ` — ${dnErr.join("; ")}` : ""}`);
    const sle = adapter.list("Stock Ledger Entry").filter((x) => x["voucher_no"] === dn.name);
    s("Delivery Note writes stock ledger −4", sle.length === 1 && n(sle[0]!["actual_qty"]) === -4, sle.map((x) => `${x["warehouse"]} ${x["actual_qty"]}`).join(","));
    const si = await make("Delivery Note", dn.name, "Sales Invoice", { posting_date: today(), due_date: plus(30), debit_to: ac(`Debtors - ${A}`) }); docs.push(si.name);
    const { doc } = await calc("Sales Invoice", si.name, {});
    s("Create ▸ Sales Invoice from DN: qty 4, links DN + SO", (doc["items"] as Doc[])[0]!["qty"] === 4 && (doc["items"] as Doc[])[0]!["delivery_note"] === dn.name, `${si.name} grand ${doc["grand_total"]}`);
    submit("Sales Invoice", si.name);
    const dn2 = adapter.get("Delivery Note", dn.name)!; const so3 = adapter.get("Sales Order", so.name)!;
    s("DN 100% billed → Completed; SO billed share 40%", n(dn2["per_billed"]) === 100 && dn2["status"] === "Completed" && n(so3["per_billed"]) === 40, `DN ${dn2["per_billed"]}% ${dn2["status"]}; SO billed ${so3["per_billed"]}%`);
    s("invoice GL balanced", balanced(si.name).ok, balanced(si.name).detail);
  }));

  out.push(await run("Material Request → Purchase Order → Purchase Receipt → Purchase Invoice → Payment", async (s, docs) => {
    const mr = adapter.insertDoc("Material Request", { name: `SCN-MR-${tag}`, company: C, material_request_type: "Purchase", transaction_date: today(), schedule_date: plus(7), items: [line(1, 20, 0)], docstatus: 0 });
    docs.push(mr.name); submit("Material Request", mr.name);
    const po = await make("Material Request", mr.name, "Purchase Order", { supplier: supp, transaction_date: today(), schedule_date: plus(7) }); docs.push(po.name);
    const its = (po["items"] as Doc[]).map((r) => ({ ...r, rate: 45.5 }));
    const { doc } = await calc("Purchase Order", po.name, { items: its, taxes: vat(false) });
    s("PO from MR: 20 × 45.50 + VAT = 1046.50", n(doc["grand_total"]) === 1046.5 && (doc["items"] as Doc[])[0]!["material_request"] === mr.name, `${po.name} ${doc["grand_total"]}`);
    submit("Purchase Order", po.name);
    s("MR → Ordered (100%)", adapter.get("Material Request", mr.name)!["status"] === "Ordered", `${adapter.get("Material Request", mr.name)!["status"]} ${adapter.get("Material Request", mr.name)!["per_ordered"]}%`);
    const pr = await make("Purchase Order", po.name, "Purchase Receipt", { posting_date: today(), set_warehouse: wh[0] }); docs.push(pr.name);
    await calc("Purchase Receipt", pr.name, { items: (pr["items"] as Doc[]).map((r) => ({ ...r, warehouse: wh[0] })) }); submit("Purchase Receipt", pr.name);
    const sle = adapter.list("Stock Ledger Entry").filter((x) => x["voucher_no"] === pr.name);
    s("PR writes stock ledger +20 at 45.50", sle.length === 1 && n(sle[0]!["actual_qty"]) === 20 && n(sle[0]!["incoming_rate"]) === 45.5, sle.map((x) => `${x["actual_qty"]}@${x["incoming_rate"]}`).join(","));
    s("PO → 100% received, To Bill", adapter.get("Purchase Order", po.name)!["status"] === "To Bill", `${adapter.get("Purchase Order", po.name)!["per_received"]}% ${adapter.get("Purchase Order", po.name)!["status"]}`);
    const pi = await make("Purchase Receipt", pr.name, "Purchase Invoice", { posting_date: today(), due_date: plus(30), credit_to: ac(`Creditors - ${A}`), bill_no: `B-${tag}` }); docs.push(pi.name);
    await calc("Purchase Invoice", pi.name, { taxes: vat(false) }); submit("Purchase Invoice", pi.name);
    const piD = adapter.get("Purchase Invoice", pi.name)!;
    s("PI submitted: Unpaid, outstanding 1046 (Banker's rounding of 1046.50), PO Completed, PR Completed", piD["status"] === "Unpaid" && n(piD["outstanding_amount"]) === 1046 && adapter.get("Purchase Order", po.name)!["status"] === "Completed" && adapter.get("Purchase Receipt", pr.name)!["status"] === "Completed", `${piD["status"]} ${piD["outstanding_amount"]}; PO ${adapter.get("Purchase Order", po.name)!["status"]}; PR ${adapter.get("Purchase Receipt", pr.name)!["status"]}`);
    const pe = makePaymentEntry("Purchase Invoice", pi.name); docs.push(pe.name); submit("Payment Entry", pe.name);
    s("Payment → PI Paid; GL balanced", adapter.get("Purchase Invoice", pi.name)!["status"] === "Paid" && balanced(pi.name).ok && balanced(pe.name).ok, `${adapter.get("Purchase Invoice", pi.name)!["status"]}; ${balanced(pe.name).detail}`);
  }));

  out.push(await run("Stock Entry — Material Receipt, Material Issue, Material Transfer, Manufacture", async (s, docs) => {
    const [w1, w2] = [wh[0]!, wh[1] ?? wh[0]!];
    const cases: [string, Record<string, unknown>[], [string, number][]][] = [
      ["Material Receipt", [{ ...line(2, 10, 20), s_warehouse: "", t_warehouse: w1, basic_rate: 20 }], [[w1, 10]]],
      ["Material Issue", [{ ...line(2, 3, 20), s_warehouse: w1, t_warehouse: "", basic_rate: 20 }], [[w1, -3]]],
      ["Material Transfer", [{ ...line(2, 2, 20), s_warehouse: w1, t_warehouse: w2, basic_rate: 20 }], [[w1, -2], [w2, 2]]],
      ["Manufacture", [{ ...line(2, 4, 20), s_warehouse: w1, t_warehouse: "", basic_rate: 20 }, { ...line(0, 1, 80), idx: 2, s_warehouse: "", t_warehouse: w2, basic_rate: 80, is_finished_item: 1 }], [[w1, -4], [w2, 1]]],
    ];
    for (const [purpose, its, exp] of cases) {
      const se = adapter.insertDoc("Stock Entry", { name: `SCN-STE-${purpose.split(" ").pop()}-${tag}`, company: C, posting_date: today(), docstatus: 0, items: its });
      docs.push(se.name);
      const r = await calc("Stock Entry", se.name, { stock_entry_type: purpose, purpose });
      const vis = ["from_warehouse", "to_warehouse"].map((f) => (r.over[f]?.hidden || r.over[f]?.ro ? "off" : "on")).join("/");
      submit("Stock Entry", se.name);
      const sle = adapter.list("Stock Ledger Entry").filter((x) => x["voucher_no"] === se.name).map((x) => [x["warehouse"], n(x["actual_qty"])] as [string, number]);
      const ok = exp.every(([w, q]) => sle.some(([sw, sq]) => sw === w && sq === q)) && sle.length === exp.length;
      s(`${purpose}: ledger ${exp.map(([w, q]) => `${w} ${q > 0 ? "+" : ""}${q}`).join(", ")}; from/to warehouse ${vis}`, ok, sle.map(([w, q]) => `${w} ${q}`).join(", "));
    }
  }));

  out.push(await run("Unbalanced Journal Entry is blocked", async (s, docs) => {
    const je = adapter.insertDoc("Journal Entry", { name: `SCN-JV-${tag}`, company: C, voucher_type: "Journal Entry", posting_date: today(), docstatus: 0, accounts: [{ idx: 1, account: ac(`Cash - ${A}`), debit_in_account_currency: 1000, credit_in_account_currency: 0 }, { idx: 2, account: ac(`Sales - ${A}`), debit_in_account_currency: 0, credit_in_account_currency: 900 }] });
    docs.push(je.name);
    const r = await calc("Journal Entry", je.name, {});
    s("form shows difference 100 and blocks Save", n(r.doc["difference"]) === 100 && r.errors.some((e) => e.startsWith("Total Debit must be equal")), `difference ${r.doc["difference"]}; ${r.errors.join("; ")}`);
    const e = submit("Journal Entry", je.name);
    s("Submit refused, no GL written", e.length > 0 && adapter.get("Journal Entry", je.name)!.docstatus === 0 && glOf(je.name).length === 0, e.join("; "));
    await calc("Journal Entry", je.name, { accounts: [{ idx: 1, account: ac(`Cash - ${A}`), debit_in_account_currency: 1000, credit_in_account_currency: 0 }, { idx: 2, account: ac(`Sales - ${A}`), debit_in_account_currency: 0, credit_in_account_currency: 1000 }] });
    const e2 = submit("Journal Entry", je.name);
    s("balanced → submits and posts", !e2.length && balanced(je.name).ok, balanced(je.name).detail);
  }));

  out.push(await run("Leave Application → days and balance; Salary Slip → net pay", async (s, docs) => {
    const al = adapter.list("Leave Allocation").find((a) => a.docstatus === 1 && String(a["from_date"]) <= today() && String(a["to_date"]) >= today() && n(a["total_leaves_allocated"] ?? a["new_leaves_allocated"]) >= 5)!;
    const la = adapter.insertDoc("Leave Application", { name: `SCN-LA-${tag}`, employee: al["employee"], leave_type: al["leave_type"], company: C, status: "Open", docstatus: 0, posting_date: today() });
    docs.push(la.name);
    const from = plus(60); const r = await calc("Leave Application", la.name, { from_date: from, to_date: from });
    s("1-day leave: total_leave_days ≥ 0 and balance from allocations", n(r.doc["total_leave_days"]) <= 1 && n(r.doc["leave_balance"]) > 0, `days ${r.doc["total_leave_days"]}, balance ${r.doc["leave_balance"]}`);
    const r2 = await calc("Leave Application", la.name, { to_date: plus(60 + 400) });
    s("over-balance request blocked", r2.errors.some((e) => e.startsWith("Insufficient leave balance")), `days ${r2.doc["total_leave_days"]}; ${r2.errors.join("; ")}`);
    const emp = adapter.list("Employee").find((e) => e["company"] === C)!;
    const ss = adapter.insertDoc("Salary Slip", { name: `SCN-SAL-${tag}`, employee: emp.name, company: C, posting_date: today(), start_date: today().slice(0, 8) + "01", end_date: today(), currency: "SAR", docstatus: 0 });
    docs.push(ss.name);
    const r3 = await calc("Salary Slip", ss.name, { earnings: [{ idx: 1, salary_component: "Basic", amount: 9000 }, { idx: 2, salary_component: "Housing Allowance", amount: 2250 }], deductions: [{ idx: 1, salary_component: "GOSI", amount: 877.5 }] });
    s("gross 11,250 − deductions 877.50 = net 10,372.50", n(r3.doc["gross_pay"]) === 11250 && n(r3.doc["total_deduction"]) === 877.5 && n(r3.doc["net_pay"]) === 10372.5, `${r3.doc["gross_pay"]} − ${r3.doc["total_deduction"]} = ${r3.doc["net_pay"]} (${r3.doc["total_in_words"]})`);
  }));

  out.push(await run("Lead → Deal", async (s, docs) => {
    const lm = (await ctx.meta("CRM Lead"))!, dm = (await ctx.meta("CRM Deal"))!;
    const lead = adapter.insertDoc("CRM Lead", { name: `SCN-LEAD-${tag}`, first_name: "Noura", last_name: "Al-Harbi", lead_name: "Noura Al-Harbi", email: `noura.${tag.toLowerCase()}@example.test`, organization: `Scenario Org ${tag}`, status: "New", lead_owner: "Administrator", converted: 0 });
    docs.push(lead.name);
    const r = convertLeadToDeal(lead, lm, dm, ctx.crm);
    const l2 = adapter.get("CRM Lead", lead.name)!;
    s("deal created from lead (organization, owner, contact)", !!r.deal && r.deal["lead"] === lead.name && r.deal["organization"] === `Scenario Org ${tag}` && r.deal["deal_owner"] === "Administrator" && !!r.deal["contact"], r.deal ? `${r.deal.name} status ${r.deal["status"]}` : String(r.error));
    s("lead marked converted", n(l2["converted"]) === 1, `converted=${l2["converted"]} status=${l2["status"]}`);
    if (r.deal) docs.push(r.deal.name);
  }));

  out.push(await run("Cancel + Amend reverses GL and creates -1", async (s, docs) => {
    const si = adapter.insertDoc("Sales Invoice", { name: `SCN-SINV-C${tag}`, company: C, customer: cust, posting_date: today(), due_date: plus(30), currency: "SAR", debit_to: ac(`Debtors - ${A}`), items: [line(0, 1, 1000)], docstatus: 0 });
    docs.push(si.name); await calc("Sales Invoice", si.name, { taxes: vat(true) }); submit("Sales Invoice", si.name);
    const before = glOf(si.name).length;
    cancel("Sales Invoice", si.name);
    const all = glOf(si.name, true); const net = all.reduce((x, g) => x + n(g["debit"]) - n(g["credit"]), 0);
    const debtors = all.filter((g) => String(g["account"]).startsWith("Debtors")).reduce((x, g) => x + n(g["debit"]) - n(g["credit"]), 0);
    s("cancel: originals flagged cancelled + reversal rows, ledger nets to zero", before > 0 && all.length === before * 2 && all.every((g) => n(g["is_cancelled"])) && Math.abs(net) < 0.005 && Math.abs(debtors) < 0.005, `${before} rows → ${all.length} (reversals), net ${net.toFixed(2)}, Debtors ${debtors.toFixed(2)}`);
    s("status Cancelled, docstatus 2", adapter.get("Sales Invoice", si.name)!.docstatus === 2 && adapter.get("Sales Invoice", si.name)!["status"] === "Cancelled", String(adapter.get("Sales Invoice", si.name)!["status"]));
    const nn = amend("Sales Invoice", si.name)!; docs.push(nn);
    const am = adapter.get("Sales Invoice", nn)!;
    s("amend → draft named -1 with amended_from", nn === `${si.name}-1` && am["amended_from"] === si.name && am.docstatus === 0, `${nn} from ${am["amended_from"]}`);
    submit("Sales Invoice", nn);
    s("amended invoice posts its own balanced GL", balanced(nn).ok, balanced(nn).detail);
  }));

  out.push(await run("Asset: schedule → 3 monthly depreciations → value adjustment → sale gain/loss → reversal", async (s, docs) => {
    const start = `${today().slice(0, 4)}-01-01`; const id = `SCN-AST-${tag}`;
    adapter.insertDoc("Asset", { name: id, asset_name: `Scenario Asset ${tag}`, company: C, asset_category: resolveName("Asset Category", "Machinery"), gross_purchase_amount: 36000, purchase_date: start, available_for_use_date: start, calculate_depreciation: 1, docstatus: 1, status: "Submitted" });
    docs.push(id); makeSchedule(id, "Straight Line", 36, 1);
    const jes = postDepreciation(id, `${start.slice(0, 4)}-03-31`); docs.push(...jes);
    s("3 depreciation JEs, each balanced", jes.length === 3 && jes.every((j) => balanced(j).ok), jes.map((j) => balanced(j).detail).join(" | "));
    s("no duplicate posting on re-run", postDepreciation(id, `${start.slice(0, 4)}-03-31`).length === 0, "0 new");
    s("accumulated 3,000 / NBV 33,000", accumulated(id) === 3000 && n(adapter.get("Asset", id)!["value_after_depreciation"]) === 33000, `acc ${accumulated(id)}`);
    const adj = adapter.insertDoc("Asset Value Adjustment", { name: `SCN-AVA-${tag}`, company: C, asset: id, date: `${start.slice(0, 4)}-04-01`, new_asset_value: 30000, difference_account: ac(`Depreciation - ${A}`), docstatus: 0 }); docs.push(adj.name);
    adapter.update("Asset Value Adjustment", adj.name, { docstatus: 1 });
    const aj = String(adapter.get("Asset Value Adjustment", adj.name)!["journal_entry"] ?? "");
    s("value adjustment posts balanced JE, NBV 30,000", !!aj && balanced(aj).ok && n(adapter.get("Asset", id)!["value_after_depreciation"]) === 30000, `${aj} ${aj ? balanced(aj).detail : ""}`);
    const { journal, gainLoss } = disposeAsset(id, `${start.slice(0, 4)}-04-15`, 31000); docs.push(journal);
    s("sale 31,000 vs NBV 30,000 → gain 1,000, balanced, status Sold", gainLoss === 1000 && balanced(journal).ok && adapter.get("Asset", id)!["status"] === "Sold", `${gainLoss} ${balanced(journal).detail}`);
    restoreAsset(id); cancelDepreciation(id, jes[2]!);
    s("restore + cancel reverse their GL (net zero)", [journal, jes[2]!].every((v) => Math.abs(glOf(v, true).reduce((x, g) => x + n(g["debit"]) - n(g["credit"]), 0)) < 0.005 && glOf(v).length === 0), `acc now ${accumulated(id)}`);
  }));

  return out;
}
