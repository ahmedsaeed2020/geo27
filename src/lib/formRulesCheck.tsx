/**
 * Behaves checks for form_rules.json — one check per rule, run in the browser by /developer/form-rules.
 * Each check sets an input (witness documents found by searching candidate values), runs the SAME engine the
 * form page uses (formRules.ts) and asserts the result — for UI rules on the rendered FormView DOM.
 */
import { moneyInWords } from "./formCalc";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import { RouterContextProvider, type AnyRouter } from "@tanstack/react-router";
import { FormView, layout } from "@/components/FormView";
import { adapter, type Doc } from "./adapter";
import { loadMeta, type DocField, type DocTypeMeta, type IndexEntry } from "./catalog";
import { evalExpr, evalDependsSafe } from "./expr";
import { applyChange, loadState, fieldState, validateDoc, type FormRule, type Over, type FormState } from "./formRules";

export type CheckStatus = "pass" | "fail" | "unsupported" | "server" | "no_witness" | "na";
export interface CheckResult { id: string; doctype: string; kind: string; field: string; status: CheckStatus; note: string; src: string }

const LAYOUT = new Set(["Column Break", "Fold", "HTML", "Button", "Heading", "Image"]);
const refs = (e: string | null | undefined, prefix = "doc") => {
  if (!e) return [] as string[];
  const out = new Set<string>();
  for (const m of e.matchAll(new RegExp(`\\b${prefix}\\.(\\w+)`, "g"))) out.add(m[1]!);
  for (const m of e.matchAll(new RegExp(`\\b${prefix}\\[["'](\\w+)["']\\]`, "g"))) out.add(m[1]!);
  return [...out];
};
const literals = (e: string) => [...e.matchAll(/"([^"]*)"|'([^']*)'/g)].map((m) => m[1] ?? m[2] ?? "");
const numbers = (e: string) => [...e.matchAll(/(?<![\w.])(\d+(?:\.\d+)?)/g)].map((m) => Number(m[1]));

function candidates(meta: DocTypeMeta, fn: string, expr: string): unknown[] {
  const f = meta.fields.find((x) => x.fieldname === fn);
  const lits = literals(expr); const nums = numbers(expr);
  const base: unknown[] = ["", ...lits];
  if (!f) return [...base, 0, 1, ...nums, "x"];
  switch (f.fieldtype) {
    case "Check": return [0, 1];
    case "Select": return ["", ...(f.options || "").split("\n").filter(Boolean), ...lits];
    case "Int": case "Float": case "Currency": case "Percent": return [0, 1, ...nums, ...nums.map((x) => x + 1), 100];
    case "Table": case "Table MultiSelect": return [[], [{ name: "row-1", doctype: f.options, idx: 1 }]];
    case "Link": { const ex = f.options ? adapter.list(f.options)[0]?.name : undefined; return ["", ...lits, ...(ex ? [ex] : []), "x"]; }
    case "Date": return ["", "2026-01-15", "2030-01-01"];
    default: return [...base, "x"];
  }
}

/** Cartesian search (capped) for documents where pred is true / false. */
function search(meta: DocTypeMeta, fields: string[], expr: string, base: Doc, pred: (d: Doc) => boolean | null, want: boolean, cap = 600): Doc | null {
  const fs = fields.slice(0, 4); const cs = fs.map((f) => [...new Map(candidates(meta, f, expr).map((v) => [JSON.stringify(v), v])).values()]);
  let tried = 0;
  const rec = (i: number, d: Doc): Doc | null => {
    if (tried++ > cap) return null;
    if (i === fs.length) { const r = pred(d); return r === want ? d : null; }
    for (const v of cs[i]!) { const x = rec(i + 1, { ...d, [fs[i]!]: v }); if (x) return x; }
    return null;
  };
  return rec(0, base);
}

/** Field is on screen: own state + its section and tab visible. */
function onScreen(meta: DocTypeMeta, fn: string, doc: Doc, over?: Over): boolean {
  for (const t of layout(meta.fields)) {
    const tv = t.fieldname && over?.[t.fieldname]?.hidden !== undefined ? !over[t.fieldname]!.hidden : evalDependsSafe(t.depends_on, doc).value;
    for (const s of t.sections) {
      const sv = s.fieldname && over?.[s.fieldname]?.hidden !== undefined ? !over[s.fieldname]!.hidden : evalDependsSafe(s.depends_on, doc).value;
      if (t.fieldname === fn) return tv; if (s.fieldname === fn) return tv && sv;
      for (const col of s.columns) for (const f of col) if (f.fieldname === fn) return tv && sv && !fieldState(f, doc, over).hidden;
    }
  }
  return false;
}

let host: HTMLDivElement | null = null;
export let checkRouter: AnyRouter | null = null;
export const setCheckRouter = (r: AnyRouter) => { checkRouter = r; };
function renderDom(qc: QueryClient, meta: DocTypeMeta, doc: Doc, over?: Over): HTMLElement {
  if (!host) { host = document.createElement("div"); host.setAttribute("data-rules-host", ""); host.style.cssText = "position:absolute;left:-99999px;top:0;width:1200px"; document.body.appendChild(host); }
  const el = document.createElement("div"); host.appendChild(el);
  const root = createRoot(el);
  const form = <QueryClientProvider client={qc}><FormView meta={meta} doc={doc} dev={false} over={over} allTabs onChange={() => {}} /></QueryClientProvider>;
  flushSync(() => root.render(checkRouter ? <RouterContextProvider router={checkRouter}>{form}</RouterContextProvider> : form));
  const snap = el.cloneNode(true) as HTMLElement;
  root.unmount(); el.remove();
  return snap;
}
const domField = (el: HTMLElement, fn: string) => el.querySelector(`[data-field="${CSS.escape(fn)}"]`) as HTMLElement | null;

const blank = (meta: DocTypeMeta): Doc => ({ name: "rules-check", doctype: meta.name, docstatus: 0 });

export async function checkDocType(qc: QueryClient, index: IndexEntry[], meta: DocTypeMeta, rules: FormRule[]): Promise<CheckResult[]> {
  const out: CheckResult[] = [];
  const res = (r: FormRule, status: CheckStatus, note: string) => out.push({ id: r.id, doctype: meta.name, kind: r.kind, field: r.fields?.join(",") ?? r.profile ?? "", status, note: note.slice(0, 220), src: r.src });
  const fmap = new Map(meta.fields.map((f) => [f.fieldname, f] as [string | undefined, DocField]));
  for (const r of rules) {
    try {
      if (r.server) { res(r, "server", "reads server callback data"); continue; }
      if (r.kind === "calc") { res(r, ...(await checkCalc(meta, rules, r))); continue; }
      const fn = r.fields[0]!; const f = fmap.get(fn);
      if (r.kind === "depends_on" || r.kind === "mandatory_depends_on" || r.kind === "read_only_depends_on") {
        if (meta.istable) { res(r, "na", "child-table field (evaluated inside grid rows)"); continue; }
        if (!f || LAYOUT.has(f.fieldtype)) { res(r, "na", "layout element without a rendered control"); continue; }
        const expr = r.value!;
        if (!evalDependsSafe(expr, {}).supported) { res(r, "unsupported", "expression outside interpreter grammar: " + expr); continue; }
        if (r.kind === "depends_on" && f.hidden) { res(r, "na", "field is statically hidden"); continue; }
        const e = expr.startsWith("eval:") ? expr.slice(5) : `doc.${expr}`;
        const fields = refs(e);
        const truth = (d: Doc) => evalDependsSafe(expr, d).value;
        let T: Doc | null, F: Doc | null;
        if (r.kind === "depends_on") {
          T = search(meta, fields, e, blank(meta), (d) => truth(d) && onScreen(meta, fn, d), true);
          F = search(meta, fields, e, blank(meta), (d) => !truth(d), true);
        } else {
          T = search(meta, fields, e, blank(meta), (d) => truth(d) && onScreen(meta, fn, d), true);
          F = search(meta, fields, e, blank(meta), (d) => !truth(d) && onScreen(meta, fn, d), true);
        }
        if (!T || !F) { res(r, "no_witness", `no input found making it ${T ? "false" : "true"} with the field on screen`); continue; }
        const dt = renderDom(qc, meta, T), df = renderDom(qc, meta, F);
        const a = domField(dt, fn), b = domField(df, fn);
        const show = (d: Doc) => JSON.stringify(Object.fromEntries(fields.map((k) => [k, d[k]])));
        if (r.kind === "depends_on") {
          const ok = !!a && !b; res(r, ok ? "pass" : "fail", `${show(T)} → shown=${!!a}; ${show(F)} → shown=${!!b}`);
        } else {
          const attr = r.kind === "mandatory_depends_on" ? "data-reqd" : "data-ro";
          if (r.kind === "read_only_depends_on" && (f.read_only || f.fetch_from)) { res(r, "na", "field is statically read-only"); continue; }
          if (r.kind === "mandatory_depends_on" && f.reqd) { res(r, "na", "field is statically mandatory"); continue; }
          const ok = a?.getAttribute(attr) === "1" && b?.getAttribute(attr) === "0";
          res(r, ok ? "pass" : "fail", `${show(T)} → ${attr}=${a?.getAttribute(attr)}; ${show(F)} → ${attr}=${b?.getAttribute(attr)}`);
        }
        continue;
      }
      if (r.kind === "fetch_from") {
        if (meta.istable) { res(r, "na", "child-table fetch (applied in grid rows)"); continue; }
        const link = fmap.get(r.link);
        if (!link || link.fieldtype !== "Link" || !link.options) { res(r, "na", `link ${r.link} is ${link?.fieldtype ?? "missing"}`); continue; }
        const tm = await loadMeta(index, link.options);
        if (!tm) { res(r, "na", `target ${link.options} not in catalog`); continue; }
        if (!tm.issingle) adapter.ensureSeed(tm);
        const sf = r.source_field!.split(".")[0]!;
        const tgt = adapter.list(tm.name).find((x) => x[sf] !== undefined && x[sf] !== "" && x[sf] !== null && typeof x[sf] !== "object");
        if (!tgt) { res(r, "no_witness", `no ${tm.name} record with ${sf}`); continue; }
        const st = applyChange(meta, rules, { doc: blank(meta), over: {}, applied: [] }, { [r.link!]: tgt.name });
        const ok = st.doc[fn] === tgt[sf] || (typeof st.doc[fn] === "number" && Number(tgt[sf]) === st.doc[fn]);
        res(r, ok ? "pass" : "fail", `${r.link}=${tgt.name} → ${fn}=${JSON.stringify(st.doc[fn])} (source ${JSON.stringify(tgt[sf])})`);
        continue;
      }
      if (r.kind === "row_set_value") {
        const tf = meta.fields.find((x) => x.fieldtype?.startsWith("Table") && x.options === r.child);
        if (!tf) { res(r, "na", "child table not on this form"); continue; }
        const cm = await loadMeta(index, r.child!);
        if (!cm) { res(r, "na", "child meta missing"); continue; }
        const trig = r.triggers?.find((t) => t === `${tf.fieldname}_add` || cm.fields.some((x) => x.fieldname === t));
        if (!trig) { res(r, "na", `handler ${r.trigger} is not reached by a row field change`); continue; }
        const expr = `${r.cond ?? ""} ${r.value}`;
        const v0 = evalExpr(r.value!, {}, { row: {} }); const c0 = r.cond ? evalExpr(r.cond, {}, { row: {} }) : { supported: true };
        if (!v0.supported || !c0.supported) { res(r, "unsupported", "statement outside interpreter grammar"); continue; }
        const rf = refs(expr, "row").filter((x) => x !== trig);
        const df = refs(expr);
        let found: { row: Doc; doc: Doc; got: unknown; want: unknown } | null = null;
        const rowBase: Doc = { name: "row-new", doctype: r.child!, idx: 1, [trig.endsWith("_add") ? "item_code" : trig]: trig.endsWith("_add") ? "" : 1 };
        const rowDoc = search(cm, [...rf, ...(trig.endsWith("_add") ? [] : [trig])], expr, rowBase, (row) => {
          const docW = search(meta, df, expr, blank(meta), (d) => { const c = r.cond ? evalExpr(r.cond, d, { row }) : { value: true, supported: true }; return !!c.value; }, true, 80);
          if (!docW) return false;
          const want = evalExpr(r.value!, docW, { row }).value;
          const st = applyChange(meta, rules.filter((x) => x.kind !== "calc"), { doc: { ...docW, [tf.fieldname!]: [] }, over: {}, applied: [] }, { [tf.fieldname!]: [row] });
          const got = (st.doc[tf.fieldname!] as Doc[])[0]?.[r.fields[0]!];
          if (st.applied.includes(r.id)) { found = { row, doc: docW, got, want }; return true; }
          return false;
        }, true, 200);
        if (!rowDoc || !found) { res(r, "no_witness", "no row input reaching the statement"); continue; }
        const fx = found as { got: unknown; want: unknown; row: Doc };
        const ok = JSON.stringify(fx.got) === JSON.stringify(fx.want);
        res(r, ok ? "pass" : "fail", `row ${trig} → ${r.fields[0]}=${JSON.stringify(fx.got)} (expected ${JSON.stringify(fx.want)})`);
        continue;
      }
      // form-script UI statements and set_value
      if (meta.istable) { res(r, "na", "child DocType script (grid row)"); continue; }
      const trig = r.triggers?.find((t) => fmap.has(t) && !fmap.get(t)!.fieldtype.startsWith("Table"));
      if (!trig && !r.load) { res(r, "na", `handler ${r.trigger} is not reached by a field change or form load`); continue; }
      const expr = `${r.cond ?? ""} ${r.value ?? ""}`;
      const sup = (x?: string | null) => !x || evalExpr(x, {}).supported;
      if (!sup(r.cond) || !sup(r.value)) { res(r, "unsupported", "statement outside interpreter grammar"); continue; }
      const fields = [...new Set([...refs(expr), ...(trig ? [trig] : [])])];
      const run = (d: Doc): FormState => (trig ? applyChange(meta, rules.filter((x) => x.kind !== "calc"), { doc: d, over: {}, applied: [] }, { [trig]: d[trig] ?? "" }) : loadState(rules, d));
      if (r.kind === "set_value") {
        const fn2 = r.fields[0]!;
        let got: unknown, want: unknown;
        const writers = new Set(rules.filter((x) => (x.kind === "set_value" || x.kind === "fetch_from") && x.fields[0] === fn2).map((x) => x.id));
        const W = search(meta, fields, expr, blank(meta), (d) => { const st = run(d); if (!st.applied.includes(r.id)) return false; if ([...st.applied].reverse().find((id) => writers.has(id)) !== r.id) return false; want = evalExpr(r.value!, d).value; got = st.doc[fn2]; return JSON.stringify(d[fn2]) !== JSON.stringify(want); }, true);
        if (!W) { res(r, "no_witness", "no input reaching the statement with a changed value"); continue; }
        const ok = JSON.stringify(got) === JSON.stringify(want);
        res(r, ok ? "pass" : "fail", `${trig ?? "load"} → ${fn2}=${JSON.stringify(got)} (expected ${JSON.stringify(want)})`);
        continue;
      }
      const fn2 = r.fields.find((x) => fmap.has(x));
      if (!fn2) { res(r, "na", "target field not in this DocType"); continue; }
      const prop = r.kind === "toggle_display" || r.kind === "df_hidden" ? "hidden" : r.kind.includes("reqd") ? "reqd" : "ro";
      const f2 = fmap.get(fn2)!;
      let expect: boolean | undefined;
      const W = search(meta, fields, expr, blank(meta), (d) => {
        const st = run(d); if (!st.applied.includes(r.id)) return false;
        const o = st.over[fn2]?.[prop]; const v = !!evalExpr(r.value ?? "true", d).value;
        const mine = r.kind === "toggle_display" ? !v : r.kind === "toggle_enable" ? !v : v;
        if (o !== mine) return false; // overridden by a later statement of the same handler
        const stat = prop === "hidden" ? !!f2.hidden || !evalDependsSafe(f2.depends_on, d).value : prop === "reqd" ? !!f2.reqd : !!f2.read_only;
        if (mine === stat) return false;
        if (prop !== "hidden" && !onScreen(meta, fn2, d, st.over)) return false;
        if (prop === "hidden" && !mine && !onScreen(meta, fn2, d, st.over)) return false;
        expect = mine; return true;
      }, true);
      if (!W) { res(r, "no_witness", "no input where the statement changes the field state"); continue; }
      const st = run(W);
      const dom = renderDom(qc, meta, st.doc, st.over);
      const el = domField(dom, fn2);
      const ok = prop === "hidden" ? (expect ? !el : !!el) : el?.getAttribute(prop === "reqd" ? "data-reqd" : "data-ro") === (expect ? "1" : "0");
      res(r, ok ? "pass" : "fail", `${trig ?? "load"} with ${JSON.stringify(Object.fromEntries(fields.map((k) => [k, W[k]])))} → ${fn2}.${prop}=${expect} (DOM ${el ? "present" : "absent"})`);
    } catch (e) { res(r, "fail", "error " + String((e as Error).message)); }
  }
  return out;
}

// ---- calculation profiles: concrete inputs → expected outputs (worked by hand from the ported source formulas) ----
const near = (a: unknown, b: number) => Math.abs(Number(a) - b) < 0.005;
async function checkCalc(meta: DocTypeMeta, rules: FormRule[], r: FormRule): Promise<[CheckStatus, string]> {
  const base = blank(meta);
  const fail: string[] = [];
  const exp = (label: string, got: unknown, want: number | string) => { if (typeof want === "number" ? !near(got, want) : got !== want) fail.push(`${label}=${JSON.stringify(got)}≠${JSON.stringify(want)}`); };
  const ch = (p: Record<string, unknown>, d: Doc = base) => applyChange(meta, rules, { doc: d, over: {}, applied: [] }, p).doc;
  switch (r.profile) {
    case "transaction_totals": {
      const items = [{ name: "i1", qty: 2, rate: 50 }, { name: "i2", qty: 1, price_list_rate: 100, discount_percentage: 10 }];
      const taxes = [{ name: "t1", charge_type: "On Net Total", rate: 15 }, { name: "t2", charge_type: "Actual", tax_amount: 10 }];
      const d = ch({ [r.items!]: items, taxes, currency: "SAR", conversion_rate: 1 });
      const it = d[r.items!] as Doc[];
      exp("amount[1]", it[0]?.["amount"], 100); exp("rate[2]", it[1]?.["rate"], 90); exp("total", d["total"], 190); exp("net_total", d["net_total"], 190);
      exp("tax1", (d["taxes"] as Doc[])[0]?.["tax_amount"], 28.5); exp("tax2.total", (d["taxes"] as Doc[])[1]?.["total"], 228.5);
      exp("total_taxes_and_charges", d["total_taxes_and_charges"], 38.5); exp("grand_total", d["grand_total"], 228.5);
      if (r.has_rounding) { exp("rounded_total", d["rounded_total"], 228); exp("rounding_adjustment", d["rounding_adjustment"], -0.5); }
      if (r.has_in_words) exp("in_words", d["in_words"], moneyInWords(r.has_rounding ? 228 : 228.5));
      const d2 = ch({ additional_discount_percentage: 10, apply_discount_on: "Grand Total" }, d);
      exp("discount_amount", d2["discount_amount"], 22.85); exp("grand_total(disc)", d2["grand_total"], 205.65);
      if (r.has_rounding) exp("rounded_total(disc)", d2["rounded_total"], 206);
      const d3 = ch({ additional_discount_percentage: 10, apply_discount_on: "Net Total" }, d);
      exp("net_total(disc on net)", d3["net_total"], 171); exp("grand_total(disc on net)", d3["grand_total"], 206.65);
      return [fail.length ? "fail" : "pass", fail.length ? fail.join("; ") : "qty×rate, price-list discount, On Net Total + Actual taxes, Grand/Net Total discount, banker's rounding, In Words"];
    }
    case "payment_allocation": {
      const refs = [{ name: "r1", outstanding_amount: 600 }, { name: "r2", outstanding_amount: 700 }];
      const d = ch({ references: refs, paid_amount: 1000 });
      exp("alloc1", (d["references"] as Doc[])[0]?.["allocated_amount"], 600); exp("alloc2", (d["references"] as Doc[])[1]?.["allocated_amount"], 400);
      exp("total_allocated_amount", d["total_allocated_amount"], 1000); exp("unallocated_amount", d["unallocated_amount"], 0);
      const d2 = ch({ paid_amount: 1500 }, d);
      exp("total_allocated(1500)", d2["total_allocated_amount"], 1300); exp("unallocated(1500)", d2["unallocated_amount"], 200);
      exp("in_words", d2["in_words"], moneyInWords(1500));
      return [fail.length ? "fail" : "pass", fail.length ? fail.join("; ") : "paid 1000 → 600+400 allocated; paid 1500 → 1300 allocated, 200 unallocated"];
    }
    case "journal_balance": {
      const d = ch({ accounts: [{ name: "a1", debit_in_account_currency: 500 }, { name: "a2", credit_in_account_currency: 300 }] });
      exp("total_debit", d["total_debit"], 500); exp("total_credit", d["total_credit"], 300); exp("difference", d["difference"], 200);
      const errs = validateDoc({ ...meta, fields: [] }, rules, { doc: d, over: {}, applied: [] });
      if (!errs.some((e) => e.startsWith("Total Debit must be equal to Total Credit"))) fail.push("unbalanced entry not blocked");
      const ok = ch({ accounts: [{ name: "a1", debit_in_account_currency: 500 }, { name: "a2", credit_in_account_currency: 500 }] });
      if (validateDoc({ ...meta, fields: [] }, rules, { doc: ok, over: {}, applied: [] }).length) fail.push("balanced entry blocked");
      return [fail.length ? "fail" : "pass", fail.length ? fail.join("; ") : "debit 500 / credit 300 → difference 200 and save blocked; 500/500 saves"];
    }
    case "stock_entry_totals": {
      const d = ch({ [r.items!]: [{ name: "s1", qty: 2, basic_rate: 10, s_warehouse: "Stores" }, { name: "s2", qty: 3, basic_rate: 5, t_warehouse: "Finished Goods" }] });
      const it = d[r.items!] as Doc[];
      exp("amount1", it[0]?.["amount"], 20); exp("amount2", it[1]?.["amount"], 15); exp("total_outgoing_value", d["total_outgoing_value"], 20);
      exp("total_incoming_value", d["total_incoming_value"], 15); exp("value_difference", d["value_difference"], -5); exp("total_amount", d["total_amount"], 35);
      return [fail.length ? "fail" : "pass", fail.length ? fail.join("; ") : "basic_rate×qty, incoming/outgoing values, value difference"];
    }
    case "leave_days": {
      const d = ch({ from_date: "2026-03-01", to_date: "2026-03-05" });
      exp("total_leave_days", d["total_leave_days"], 5);
      const h = ch({ half_day: 1 }, d); exp("total_leave_days(half)", h["total_leave_days"], 4.5);
      // balance check over adapter Leave Allocation records (temporary test allocation, removed afterwards)
      const emp = "RULES-CHECK-EMP", lt = "RULES-CHECK-LT";
      adapter.insertDocQuiet("Leave Allocation", { name: "RULES-CHECK-LA", employee: emp, leave_type: lt, from_date: "2026-01-01", to_date: "2026-12-31", total_leaves_allocated: 3, docstatus: 1 });
      const b = ch({ employee: emp, leave_type: lt }, d);
      exp("leave_balance", b["leave_balance"], 3);
      const errs = validateDoc({ ...meta, fields: [] }, rules, { doc: b, over: {}, applied: [] });
      if (!errs.some((e) => e.startsWith("Insufficient leave balance"))) fail.push("5 days on balance 3 not blocked");
      const ok = ch({ to_date: "2026-03-02" }, b);
      if (validateDoc({ ...meta, fields: [] }, rules, { doc: ok, over: {}, applied: [] }).length) fail.push("2 days on balance 3 blocked");
      adapter.remove("Leave Allocation", "RULES-CHECK-LA");
      return [fail.length ? "fail" : "pass", fail.length ? fail.join("; ") : "1–5 Mar → 5 days, half day → 4.5, balance 3 → 5 days blocked, 2 days allowed"];
    }
    case "salary_totals": {
      const d = ch({ earnings: [{ name: "e1", amount: 5000 }, { name: "e2", amount: 1000 }], deductions: [{ name: "d1", amount: 500.4 }], currency: "SAR" });
      exp("gross_pay", d["gross_pay"], 6000); exp("total_deduction", d["total_deduction"], 500.4); exp("net_pay", d["net_pay"], 5499.6);
      exp("rounded_total", d["rounded_total"], 5500); exp("total_in_words", d["total_in_words"], moneyInWords(5500));
      return [fail.length ? "fail" : "pass", fail.length ? fail.join("; ") : "earnings 6000 − deductions 500.40 → net 5499.60, rounded 5500, In Words"];
    }
    case "employee_retirement": {
      const d = ch({ date_of_birth: "1990-05-10" });
      const age = Number(adapter.get("HR Settings", "HR Settings")?.["retirement_age"]) || 60;
      exp("date_of_retirement", d["date_of_retirement"], `${1990 + age}-05-10`);
      return [fail.length ? "fail" : "pass", fail.length ? fail.join("; ") : `born 1990-05-10 → retires ${1990 + age}-05-10`];
    }
  }
  return ["na", "unknown profile"];
}
