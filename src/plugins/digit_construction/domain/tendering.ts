/**
 * Department 03 (estimating and tendering) — save rules and read models for Go / No-Go scoring, tender addenda,
 * quantity takeoff (dimensions, CSV import, revision comparison), assembly productivity, estimate resource breakdown,
 * contingency, margin floor, bid packages and invitations, bid submission cut-off, bid leveling with plugs, award
 * decisions and the BOQ / estimate comparisons (owner spec catalog FT-03-01 … FT-03-15, decisions DEC-007,
 * DEC-033 … DEC-044). Rules are pure functions of (doc, before, store) registered as adapter hooks by hooks.ts;
 * rules/tendering.py is the server twin with the same messages and derived fields. Reads go through asSystem so a
 * rule never depends on what the session user may read.
 */
import { adapter, type Doc } from "@/lib/adapter";
import { currentUser, userRoles } from "@/lib/session";
import { lineAmount, num, r2, r3 } from "./calc";
import { asSystem, list, rows, today } from "./data";

type Row = Record<string, unknown>;
export type TndRes = { doc: Doc; errors: string[] };
const s = (v: unknown) => (v === undefined || v === null ? "" : String(v));
const blank = (v: unknown) => v === undefined || v === null || v === "";
const live = (d: Doc | undefined) => !!d && num(d.docstatus) !== 2;
const changedTo = (doc: Doc, before: Doc | undefined, f: string, v: string) => doc[f] === v && before?.[f] !== v;
const all = (dt: string, pred?: (d: Doc) => boolean) => asSystem(() => list(dt, pred));
const get = (dt: string, n: unknown) => (n ? asSystem(() => adapter.get(dt, s(n))) : undefined);
const idx = (rs: Row[]) => rs.map((r, i): Row => ({ ...r, idx: i + 1 }));
const sig = (rs: Row[], fs: string[]) => JSON.stringify(rs.map((r) => fs.map((f) => r[f] ?? null)));
const fmt = (n: number) => String(r2(n));
const SETTINGS = "Digit Construction Settings";
/** A threshold setting; blank or 0 is "not set" (the Frappe server stores an empty Percent / Currency as 0). */
const setting = (k: string): number | undefined => { const v = get(SETTINGS, SETTINGS)?.[k]; return blank(v) || num(v) === 0 ? undefined : num(v); };
const isDirector = (u = currentUser()) => u === "Administrator" || userRoles(u).includes("Digit Director");

export const TND_MSG = {
  weights: "Criteria weights must total 100 (now {0})",
  goJustify: "The Go decision needs a justification: score {0}% is below the {1}% threshold",
  noGo: "No estimate before the Go decision",
  deadlinePast: "The new deadline is before today",
  noDims: "Row {0}: the line has no dimensions",
  reviewFirst: "Review the dimensions first",
  csvColumns: "Missing columns: {0}", csvUom: "Row {0}: unknown unit {1}",
  bimLater: "BIM model import comes in a later phase — import the model quantities as CSV",
  breakdown: "Row {0}: the resource breakdown does not equal the line cost ({1} ≠ {2})",
  margin: "Margin {0}% is below the minimum {1}%",
  notApproved: "{0}: the subcontractor is not approved (policy P8)",
  pkgClosed: "The bid package is closed", pkgLate: "The bid package is closed: the deadline {0} has passed",
  awardSupplier: "Select the awarded supplier",
  awardReason: "Award reason is required: {0} is not the lowest leveled total ({1})",
  selfAward: "No self-award: the person who recommended the award cannot approve it",
  contingencyRef: "A transfer from the contingency line needs a risk or change event reference",
  decisionDirector: "Only the Digit Director records a tender award decision",
  decisionReason: "Reason is required for the award decision",
  decisionEstimate: "A Won decision needs the tender's approved estimate version",
  decisionFrozen: "A submitted award decision cannot be changed",
  noApproved: "The tender has no approved estimate version",
  revisionApproved: "Only an approved BOQ can be revised",
} as const;
export const fill = (t: string, ...a: unknown[]) => t.replace(/\{(\d+)\}/g, (_m, i: string) => s(a[Number(i)]));

/** DEC-035: the Go threshold is the settings value, default 60 %. */
export const GNG_DEFAULT = 60;
export const gngThreshold = () => setting("gng_threshold_pct") ?? GNG_DEFAULT;
/** DEC-037 / DEC-039 / DEC-040 constants. */
export const CONTINGENCY_CODE = "CONTINGENCY";
export const RESOURCE_TYPES = [["Labor", "labor_cost", "Labour"], ["Plant", "plant_cost", "Equipment"], ["Material", "material_cost", "Material"], ["Subcontract", "sub_cost", "Subcontract"]] as const;

// ---------------------------------------------------------------- FT-03-01 / 03-02 tender + Go / No-Go
/** F03-02-1: gng_score = Σ(weight × score ÷ 5); weights must total 100. */
export function gngScore(criteria: Row[]): { score: number; weights: number } {
  return { score: r2(criteria.reduce((a, c) => a + (num(c["weight_pct"]) * num(c["score"])) / 5, 0)), weights: r2(criteria.reduce((a, c) => a + num(c["weight_pct"]), 0)) };
}
export function tenderRule(doc: Doc, before: Doc | undefined): TndRes {
  const e: string[] = [];
  let d: Doc = doc;
  const crit = rows(doc, "criteria");
  if (crit.length) {
    const g = gngScore(crit);
    d = { ...d, criteria: idx(crit), gng_score: g.score };
    if (Math.abs(g.weights - 100) > 0.001) e.push(fill(TND_MSG.weights, fmt(g.weights)));
  }
  const dec = s(doc["gng_decision"]);
  if (dec && dec !== "Pending" && dec !== s(before?.["gng_decision"])) {
    const th = gngThreshold(); const sc = num(d["gng_score"]);
    if (dec === "Go" && sc < th && !s(doc["gng_decision_note"]).trim()) e.push(fill(TND_MSG.goJustify, fmt(sc), fmt(th)));
    d = { ...d, gng_decision_by: currentUser(), gng_decision_on: today() };
  }
  return { doc: d, errors: e };
}
/** F03-02-2: an estimate version is created only after Go. Tenders recorded before Go / No-Go existed (no criteria, no decision) stay open. */
export function goGate(t: Doc): string | undefined {
  const dec = s(t["gng_decision"]);
  if (dec === "Go") return undefined;
  return dec || rows(t, "criteria").length ? TND_MSG.noGo : undefined;
}

// ---------------------------------------------------------------- FT-03-03 addenda
/** F03-03-1: an addendum is applied once on save (tender version + 1, new deadline, item changes, estimate lines flagged). */
export function addendumRule(doc: Doc, before: Doc | undefined): TndRes & { apply: boolean } {
  const e: string[] = [];
  if (num(doc["applied"]) || num(before?.["applied"])) return { doc, errors: e, apply: false };
  const t = get("Digit Tender", doc["tender"]);
  if (doc["new_deadline"] && s(doc["new_deadline"]).slice(0, 10) < today()) e.push(TND_MSG.deadlinePast);
  else if (doc["new_deadline"] && t?.["emd_valid_until"] && s(t["emd_valid_until"]) < s(doc["new_deadline"])) e.push("Bid bond expires before the submission deadline");
  const items = idx(rows(doc, "items").map((c) => ({ ...c, old_qty: !num(c["old_qty"]) ? num(rows(t, "items").find((i) => i["item_key"] === c["item_key"])?.["qty"]) : c["old_qty"] })));
  return { doc: { ...doc, items, ...(e.length ? {} : { applied: 1, applied_on: today() }) }, errors: e, apply: !e.length && !!t };
}
/** The tender and estimate patches an applied addendum makes (pure; the hook writes them). */
export function addendumEffects(add: Doc): { tender?: { name: string; patch: Row }; estimates: { name: string; lines: Row[] }[] } {
  const t = get("Digit Tender", add["tender"]);
  if (!t) return { estimates: [] };
  const items = rows(t, "items").map((r) => ({ ...r }));
  const keys = new Set<string>();
  for (const ch of rows(add, "items")) {
    const k = s(ch["item_key"]); const i = items.findIndex((x) => x["item_key"] === k); const kind = s(ch["change_type"]);
    if (!k) continue;
    keys.add(k);
    if (kind === "Qty Changed" && i >= 0) items[i] = { ...items[i], qty: num(ch["new_qty"]) };
    else if (kind === "Added" && i < 0) items.push({ item_key: k, description: s(ch["description"]), qty: num(ch["new_qty"]) });
    else if (kind === "Removed" && i >= 0) items.splice(i, 1);
    else if (kind === "Spec Changed" && i >= 0) items[i] = { ...items[i], notes: s(ch["description"]) || items[i]!["notes"] };
  }
  const patch: Row = { items: idx(items), version: (num(t["version"]) || 1) + 1 };
  if (add["new_deadline"]) patch["submission_deadline"] = add["new_deadline"];
  const ref = `Addendum ${s(add["addendum_no"]) || s(add.name)}`;
  const estimates = all("Digit Estimate Version", (v) => v["tender"] === t.name && live(v) && v["workflow_state"] !== "Superseded")
    .filter((v) => rows(v, "lines").some((l) => keys.has(s(l["tender_item"]))))
    .map((v) => ({ name: v.name, lines: rows(v, "lines").map((l) => (keys.has(s(l["tender_item"])) ? { ...l, reprice_required: 1, reprice_reason: `${ref}: ${s(rows(add, "items").find((c) => c["item_key"] === l["tender_item"])?.["change_type"])}` } : l)) }));
  return { tender: { name: t.name, patch }, estimates };
}

// ---------------------------------------------------------------- FT-03-04 … 03-06 takeoff
const has = (v: unknown) => !blank(v) && num(v) !== 0;
/** F03-04-1: quantity = nos × (L or 1) × (B or 1) × (D or 1), negative for a deduction; imported rows keep their quantity. */
export function dimQuantity(r: Row): number | undefined {
  if (!["nos", "length", "breadth", "depth"].some((f) => has(r[f]))) return undefined;
  const q = (has(r["nos"]) ? num(r["nos"]) : 1) * (has(r["length"]) ? num(r["length"]) : 1) * (has(r["breadth"]) ? num(r["breadth"]) : 1) * (has(r["depth"]) ? num(r["depth"]) : 1);
  return r3(num(r["is_deduction"]) ? -Math.abs(q) : q);
}
export function takeoffRule(doc: Doc, before: Doc | undefined): TndRes {
  const e: string[] = [];
  const dims = rows(doc, "dimensions").map((r, i): Row => {
    const q = dimQuantity(r);
    if (q === undefined && !s(r["element_id"])) e.push(fill(TND_MSG.noDims, i + 1));
    return { ...r, idx: i + 1, quantity: q ?? r3(num(r["quantity"])) };
  });
  let d: Doc = { ...doc, dimensions: dims, reviewed: doc["status"] === "Reviewed" ? 1 : 0 };
  if (changedTo(doc, before, "status", "Reviewed")) d = { ...d, reviewed_by: currentUser(), reviewed_on: today() };
  return { doc: d, errors: e };
}
/** Item quantity = Σ of its takeoff lines (F03-04-1). */
export function takeoffTotals(sheet: Doc | undefined): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of rows(sheet, "dimensions")) { const k = s(r["item_key"]); if (k) m.set(k, r3((m.get(k) ?? 0) + num(r["quantity"]))); }
  return m;
}
const CSV_REQUIRED = ["element_id", "item_key", "quantity", "uom"];
function parseCsv(text: string): string[][] {
  const out: string[][] = []; let row: string[] = []; let cur = ""; let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (q) { if (c === '"' && text[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; continue; }
    if (c === '"') q = true; else if (c === ",") { row.push(cur); cur = ""; } else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; row.push(cur); out.push(row); row = []; cur = ""; } else cur += c;
  }
  if (cur !== "" || row.length) { row.push(cur); out.push(row); }
  return out.filter((r) => r.some((x) => x.trim() !== ""));
}
/** F03-05-1 / DEC-036: CSV rows become ready-quantity lines keeping element_id; model files (BIM) come in a later phase. */
export function takeoffCsvRows(text: string, fileName = ""): { rows: Row[]; errors: string[] } {
  if (/\.(ifc|ifczip|rvt|nwd|nwc|dwg|dgn)$/i.test(fileName)) return { rows: [], errors: [TND_MSG.bimLater] };
  const t = parseCsv(text);
  const head = (t[0] ?? []).map((h) => h.trim().toLowerCase());
  const missing = CSV_REQUIRED.filter((c) => !head.includes(c));
  if (missing.length) return { rows: [], errors: [fill(TND_MSG.csvColumns, missing.join(", "))] };
  const col = (r: string[], c: string) => (head.indexOf(c) >= 0 ? (r[head.indexOf(c)] ?? "").trim() : "");
  const errors: string[] = []; const out: Row[] = [];
  t.slice(1).forEach((r, i) => {
    const uom = col(r, "uom");
    if (!uom || !get("UOM", uom)) { errors.push(fill(TND_MSG.csvUom, i + 1, uom)); return; }
    out.push({ element_id: col(r, "element_id"), item_key: col(r, "item_key"), description: col(r, "description"), quantity: r3(num(col(r, "quantity"))), uom, origin: "CSV" });
  });
  return { rows: errors.length ? [] : out, errors };
}
/** The estimate version a takeoff prices against: the tender's latest live version (F03-06-1 "latest estimate"). */
export function latestEstimate(tender: unknown): Doc | undefined {
  return all("Digit Estimate Version", (v) => v["tender"] === tender && live(v)).sort((a, b) => num(b["version"]) - num(a["version"]))[0];
}
/** F03-06-1 / RPT-N12: Δqty = new − old per item; Δvalue = Δqty × selling rate in the latest estimate. */
export function takeoffComparison(oldSheet: string, newSheet: string): Row[] {
  const a = get("Digit Takeoff Sheet", oldSheet); const b = get("Digit Takeoff Sheet", newSheet);
  if (!a || !b) return [];
  const qa = takeoffTotals(a); const qb = takeoffTotals(b);
  const est = latestEstimate(b["tender"] || a["tender"]);
  const rateOf = (k: string) => num(rows(est, "lines").find((l) => l["tender_item"] === k || l["line_key"] === k)?.["selling_rate"]);
  const t = get("Digit Tender", b["tender"] || a["tender"]);
  return [...new Set([...qa.keys(), ...qb.keys()])].map((k) => {
    const o = qa.get(k) ?? 0; const n = qb.get(k) ?? 0; const dq = r3(n - o); const rate = rateOf(k);
    return { item: k, description: s(rows(t, "items").find((i) => i["item_key"] === k)?.["description"]), old_qty: o, new_qty: n, delta_qty: dq, selling_rate: rate, delta_value: r2(dq * rate), estimate_version: est?.name ?? "" };
  });
}

// ---------------------------------------------------------------- FT-03-08 / 03-10 assemblies and resource breakdown
/** F03-08-1: labour / equipment coefficient = 1 ÷ productivity when productivity is given; unit rate defaults to the rate master. */
export function assemblyComponents(comps: Row[]): Row[] {
  return comps.map((c, i): Row => {
    const rate = get("Digit Construction Rate", c["rate"]);
    const unit_rate = !num(c["unit_rate"]) && rate ? num(rate["current_rate"]) : c["unit_rate"];
    const prod = num(c["productivity"]);
    const coefficient = ["Labor", "Plant"].includes(s(c["resource_type"])) && prod > 0 ? 1 / prod : c["coefficient"];
    return { ...c, idx: i + 1, unit_rate, coefficient, amount: lineAmount(coefficient, unit_rate) };
  });
}
/** F03-10-1: per resource type qty × Σ(coefficient × rate); man-hours = qty × Σ labour coefficients. */
export function lineBreakdown(line: Row): Row | undefined {
  const asm = get("Digit Assembly", line["assembly"]);
  if (!asm) return undefined;
  const comps = assemblyComponents(rows(asm, "components"));
  const q = num(line["qty"]);
  const out: Row = {};
  for (const [type, field] of RESOURCE_TYPES) out[field] = r2(q * comps.filter((c) => c["resource_type"] === type).reduce((a, c) => a + num(c["coefficient"]) * num(c["unit_rate"]), 0));
  out["man_hours"] = r3(q * comps.filter((c) => c["resource_type"] === "Labor").reduce((a, c) => a + num(c["coefficient"]), 0));
  out["unit_cost"] = comps.reduce((a, c) => a + num(c["coefficient"]) * num(c["unit_rate"]), 0);
  // the breakdown is complete only when every component names its resource type (older assemblies may not)
  out["typed"] = comps.length > 0 && comps.every((c) => RESOURCE_TYPES.some(([t]) => t === c["resource_type"]));
  return out;
}
/**
 * Estimate lines with their resource breakdown (F03-10-1). A blank cost rate takes the assembly unit cost; a set cost
 * rate must agree with the breakdown (within half a cent per unit) when every assembly component names its resource
 * type. Only new or changed lines (qty, cost rate, assembly) are checked, so a version saved before the breakdown
 * existed stays editable.
 */
export function estimateLines(lines: Row[], beforeLines: Row[] = []): { lines: Row[]; errors: string[] } {
  const errors: string[] = [];
  const out = lines.map((l, i): Row => {
    const b = lineBreakdown(l);
    if (!b) return l;
    const { unit_cost, typed, ...fields } = b;
    if (blank(l["cost_rate"]) || num(l["cost_rate"]) === 0) return { ...l, ...fields, cost_rate: r2(num(unit_cost)) };
    const prev = beforeLines.find((x) => l["line_key"] && x["line_key"] === l["line_key"]);
    const same = prev && ["qty", "cost_rate", "assembly"].every((f) => s(prev[f]) === s(l[f]));
    if (typed && !same && Math.abs(num(l["cost_rate"]) - num(unit_cost)) > 0.005 + 1e-9) {
      const types = r2(RESOURCE_TYPES.reduce((a, [, f]) => a + num(fields[f]), 0));
      errors.push(fill(TND_MSG.breakdown, i + 1, fmt(types), fmt(lineAmount(l["qty"], l["cost_rate"]))));
    }
    return { ...l, ...fields };
  });
  return { lines: out, errors };
}
/** F03-15-1: original budget lines — one per cost code × category (resource type) from the breakdown, real cost code kept, plus the contingency line. */
export function budgetLinesFromEstimate(est: Doc, boq: Doc | undefined): Row[] {
  const out = new Map<string, Row>();
  for (const l of rows(est, "lines")) {
    const bi = rows(boq, "items").find((x) => x["source_estimate_line"] === l["line_key"]);
    const code = s(bi?.["cost_code"]) || `CC-${s(l["code"] ?? l["line_key"]) || s(l["line_key"])}`;
    const cost = lineAmount(l["qty"], l["cost_rate"]);
    const parts = RESOURCE_TYPES.map(([, f, cat]) => [cat, num(l[f])] as const).filter(([, v]) => v > 0);
    if (!parts.length) { out.set(`legacy|${s(l["line_key"])}`, { line_key: `BL-${s(l["line_key"])}`, cost_code: code, description: l["description"], category: "Material", original_amount: cost }); continue; }
    const rest = r2(cost - parts.reduce((a, [, v]) => a + v, 0));
    const big = parts.reduce((m, p) => (p[1] > m[1] ? p : m), parts[0]!)[0];
    for (const [cat, v] of parts) {
      const k = `${code}|${cat}`; const add = r2(v + (cat === big ? rest : 0));
      const ex = out.get(k);
      if (ex) ex["original_amount"] = r2(num(ex["original_amount"]) + add);
      // owner ruling: one budget line per cost code × category — the real cost code is kept (no suffix) and the category column splits it; commitments and actuals match on both
      else out.set(k, { line_key: `BL-${code}-${cat}`, cost_code: code, description: `${s(l["description"])} — ${cat}`, category: cat, original_amount: add });
    }
  }
  const res = [...out.values()];
  if (num(est["contingency_amount"]) > 0) res.push({ line_key: "BL-CONTINGENCY", cost_code: CONTINGENCY_CODE, description: "Contingency", category: "Contingency", original_amount: r2(num(est["contingency_amount"])) });
  return res.map((r, i) => ({ ...r, idx: i + 1 }));
}
/** F03-13-1: contingency = Σ expected (probability × impact), else total cost × contingency %; grand total = selling + contingency. */
export function contingency(doc: Doc, totalCost: number, totalSelling: number): Row {
  const risks = rows(doc, "risks").map((r, i): Row => ({ ...r, idx: i + 1, expected: r2((num(r["probability_pct"]) / 100) * num(r["impact"])) }));
  const amount = risks.length ? r2(risks.reduce((a, r) => a + num(r["expected"]), 0)) : r2((totalCost * num(doc["contingency_pct"])) / 100);
  return { risks, contingency_amount: amount, total_direct_cost: totalCost, grand_total: r2(totalSelling + amount) };
}
/** F03-14-1: approval refuses a margin below the minimum set in Construction Settings (blank = no floor). */
export function marginError(marginPct: number): string | undefined {
  const min = setting("min_margin_pct");
  return min !== undefined && r2(marginPct) < min ? fill(TND_MSG.margin, fmt(marginPct), fmt(min)) : undefined;
}
/** RPT-N13: cost per resource type, share of the total and labour man-hours. */
export function estimateResourceSummary(version: string): Row[] {
  const v = get("Digit Estimate Version", version);
  if (!v) return [];
  const ls = rows(v, "lines");
  const total = r2(ls.reduce((a, l) => a + num(l["cost_amount"]), 0));
  const typed = RESOURCE_TYPES.map(([type, f]) => ({ resource_type: type, cost: r2(ls.reduce((a, l) => a + num(l[f]), 0)), man_hours: type === "Labor" ? r3(ls.reduce((a, l) => a + num(l["man_hours"]), 0)) : 0 }));
  const other = r2(total - typed.reduce((a, x) => a + x.cost, 0));
  const out = [...typed, ...(Math.abs(other) > 0.005 ? [{ resource_type: "Not broken down", cost: other, man_hours: 0 }] : [])];
  return out.map((x) => ({ ...x, pct_of_total: total ? r2((x.cost / total) * 100) : 0 }));
}
/** F03-09-2: per line key Δcost, Δselling and the change reason between two estimate versions. */
export function estimateComparison(base: string, target: string): Row[] {
  const a = get("Digit Estimate Version", base); const b = get("Digit Estimate Version", target);
  if (!a || !b) return [];
  const la = rows(a, "lines"); const lb = rows(b, "lines");
  const keys = [...new Set([...la.map((l) => s(l["line_key"])), ...lb.map((l) => s(l["line_key"]))])];
  return keys.map((k) => {
    const x = la.find((l) => l["line_key"] === k); const y = lb.find((l) => l["line_key"] === k);
    const cost = (l?: Row) => (l ? lineAmount(l["qty"], l["cost_rate"]) : 0); const sell = (l?: Row) => (l ? lineAmount(l["qty"], l["selling_rate"]) : 0);
    return { line_key: k, description: s((y ?? x)?.["description"]), status: !x ? "Added" : !y ? "Removed" : "Matched", base_cost: cost(x), target_cost: cost(y), delta_cost: r2(cost(y) - cost(x)), base_selling: sell(x), target_selling: sell(y), delta_selling: r2(sell(y) - sell(x)), reason: s(y?.["change_reason"]) || s(b["revision_reason"]) };
  });
}

// ---------------------------------------------------------------- FT-03-11 / 03-12 bid packages, bids, leveling
export const approvedSubcontractor = (supplier: unknown) => all("Digit Subcontractor Profile", (p) => p["supplier"] === supplier && p["workflow_state"] === "Approved").length > 0;
export function bidPackageRule(doc: Doc, before: Doc | undefined): TndRes {
  const e: string[] = [];
  if (before && ["Closed", "Awarded"].includes(s(before["status"])) && (sig(rows(before, "items"), ["item_key", "qty", "description"]) !== sig(rows(doc, "items"), ["item_key", "qty", "description"]) || sig(rows(before, "invitees"), ["supplier"]) !== sig(rows(doc, "invitees"), ["supplier"]))) e.push(TND_MSG.pkgClosed);
  // P8 (approved subcontractor profile) is checked when the invitations are sent (services sendBidInvitations, F03-11-1)
  return { doc: { ...doc, items: idx(rows(doc, "items")), invitees: idx(rows(doc, "invitees")) }, errors: e };
}
const endOf = (v: unknown) => { const x = s(v).replace("T", " "); return x.length <= 10 ? `${x} 23:59:59` : x.length === 16 ? `${x}:00` : x.slice(0, 19); };
/** DEC-034: amounts are compared without tax in the base currency at the recorded exchange rate. */
export const bidFactor = (b: Doc | undefined) => (num(b?.["conversion_rate"]) || 1) / (num(b?.["tax_included"]) ? 1 + num(b?.["tax_rate"]) / 100 : 1);
const included = (l: Row) => !(l["included"] === 0 || l["included"] === "0");
export function subcontractBidRule(doc: Doc, before: Doc | undefined): TndRes {
  const e: string[] = [];
  const pkg = get("Digit Bid Package", doc["bid_package"]);
  if (pkg && ["Closed", "Awarded"].includes(s(pkg["status"]))) e.push(TND_MSG.pkgClosed);
  else if (pkg?.["due_date"] && doc["submitted_on"] && endOf(doc["submitted_on"]) > endOf(pkg["due_date"])) e.push(fill(TND_MSG.pkgLate, s(pkg["due_date"]).replace("T", " ")));
  void before;
  const lines = rows(doc, "lines").map((l, i): Row => ({ ...l, idx: i + 1, amount: !num(l["unit_rate"]) ? l["amount"] : lineAmount(l["qty"], l["unit_rate"]) }));
  const total = r2(lines.filter(included).reduce((a, l) => a + num(l["amount"]), 0));
  return { doc: { ...doc, lines, total, base_total: r2(total * bidFactor(doc)) }, errors: e };
}
/** F03-12-1 / DEC-037: one cell per package item × bidder; a missing or excluded item gets a plug at the highest other offer. */
export function levelingCells(pkgName: unknown, existing: Row[] = []): Row[] {
  const pkg = get("Digit Bid Package", pkgName);
  const bids = all("Digit Subcontract Bid", (b) => b["bid_package"] === pkgName && live(b));
  if (!pkg || !bids.length) return idx(existing);
  const items = rows(pkg, "items");
  const cells: Row[] = [];
  for (const b of bids) for (const it of items) {
    const l = rows(b, "lines").find((x) => x["item_key"] === it["item_key"]);
    const amt = l ? (!num(l["unit_rate"]) ? num(l["amount"]) : lineAmount(l["qty"], l["unit_rate"])) : 0;
    const inc = !!l && included(l) && amt > 0;
    const prev = existing.find((c) => c["item_key"] === it["item_key"] && c["supplier"] === b["supplier"]);
    cells.push({ item_key: it["item_key"], supplier: b["supplier"], amount: inc ? r2(amt * bidFactor(b)) : 0, included: inc ? 1 : 0, plug: 0, override_amount: prev?.["override_amount"] ?? null, override_reason: prev?.["override_reason"] ?? "" });
  }
  for (const c of cells) if (!c["included"]) { const offers = cells.filter((x) => x["item_key"] === c["item_key"] && x["included"]).map((x) => num(x["amount"])); c["plug"] = 1; c["amount"] = offers.length ? Math.max(...offers) : 0; }
  return idx(cells);
}
export interface LevelRow { supplier: string; submitted_total: number; excluded: number; plugs: number; leveled_total: number; rank: number; exclusions: string; bid: string }
/** Leveled total = Σ (override or amount) of included items + Σ plugs; rank 1 = lowest (RPT-N14). */
export function levelingSummary(cells: Row[], pkgName?: unknown): LevelRow[] {
  const bids = pkgName ? all("Digit Subcontract Bid", (b) => b["bid_package"] === pkgName && live(b)) : [];
  const sups = [...new Set(cells.map((c) => s(c["supplier"])))];
  const out = sups.map((sp): LevelRow => {
    const mine = cells.filter((c) => c["supplier"] === sp);
    const inc = mine.filter((c) => num(c["included"]));
    const plugs = r2(mine.filter((c) => num(c["plug"])).reduce((a, c) => a + num(c["amount"]), 0));
    const b = bids.find((x) => x["supplier"] === sp);
    return { supplier: sp, bid: b?.name ?? "", submitted_total: r2(inc.reduce((a, c) => a + num(c["amount"]), 0)), excluded: mine.filter((c) => !num(c["included"])).length, plugs,
      leveled_total: r2(inc.reduce((a, c) => a + (num(c["override_amount"]) ? num(c["override_amount"]) : num(c["amount"])), 0) + plugs), rank: 0, exclusions: s(b?.["exclusions"]) };
  }).sort((a, b) => a.leveled_total - b.leveled_total || a.supplier.localeCompare(b.supplier));
  out.forEach((r, i) => { r.rank = i + 1; });
  return out;
}
export function levelingRule(doc: Doc, before: Doc | undefined): TndRes & { award: boolean } {
  const e: string[] = [];
  const cells = levelingCells(doc["bid_package"], rows(doc, "cells"));
  let d: Doc = { ...doc, cells };
  if (changedTo(doc, before, "workflow_state", "Recommended")) d = { ...d, recommended_by: currentUser() };
  let award = false;
  if (changedTo(doc, before, "workflow_state", "Awarded")) {
    const sum = levelingSummary(cells);
    const win = s(doc["awarded_supplier"]);
    if (!win) e.push(TND_MSG.awardSupplier);
    else if (sum[0] && sum[0].supplier !== win && !s(doc["award_reason"]).trim()) e.push(fill(TND_MSG.awardReason, win, sum[0].supplier));
    const rec = s(doc["recommended_by"]) || s(before?.["recommended_by"]);
    if (rec && rec === currentUser()) e.push(TND_MSG.selfAward);
    d = { ...d, approved_by: currentUser() };
    award = !e.length;
  }
  return { doc: d, errors: e, award };
}
/** DEC-033: the award opens one draft subcontract work order with the package lines at the awarded bidder's rates. */
export function awardWorkOrder(lev: Doc): Row | undefined {
  const pkg = get("Digit Bid Package", lev["bid_package"]);
  const bid = all("Digit Subcontract Bid", (b) => b["bid_package"] === lev["bid_package"] && b["supplier"] === lev["awarded_supplier"] && live(b))[0];
  if (!pkg || !bid) return undefined;
  const f = bidFactor(bid);
  // F05-02-1: each line takes the cost code of its BOQ line on the project (matched by line key or code)
  const boqItems = all("Digit BOQ", (b) => b["project"] === pkg["project"] && live(b)).sort((a, b) => (a["workflow_state"] === "Approved" ? 0 : 1) - (b["workflow_state"] === "Approved" ? 0 : 1) || a.name.localeCompare(b.name)).flatMap((b) => rows(b, "items"));
  const codeOf = (k: unknown) => s(boqItems.find((x) => s(x["cost_code"]) && (x["line_key"] === k || x["code"] === k))?.["cost_code"]);
  return { subcontractor: lev["awarded_supplier"], project: pkg["project"] ?? "", company: pkg["company"] ?? "", workflow_state: "Draft", wo_date: today(), source_event: lev.name, terms: `Awarded from bid package ${pkg.name} (${lev.name})`,
    lines: rows(pkg, "items").map((it, i) => { const l = rows(bid, "lines").find((x) => x["item_key"] === it["item_key"]); const rate = l && included(l) ? r2(num(l["unit_rate"]) * f) : 0; const code = codeOf(it["item_key"]); return { idx: i + 1, line_key: `${pkg.name}-${s(it["item_key"])}`, scope: it["description"], uom: it["uom"], qty: it["qty"], rate, amount: lineAmount(it["qty"], rate), ...(code ? { cost_code: code } : {}) }; }) };
}

// ---------------------------------------------------------------- FT-03-13 contingency drawdown, DEC-042 award decision
/** F03-13-2: a transfer out of a Contingency budget line needs a risk or change event; the remaining balance is shown. */
export function contingencyTransfer(doc: Doc, fromLine: Row | undefined, available: number): { errors: string[]; balance?: number } {
  if (s(fromLine?.["category"]) !== "Contingency") return { errors: [] };
  return { errors: doc["risk"] || doc["change_event"] ? [] : [TND_MSG.contingencyRef], balance: r2(available - num(doc["amount"])) };
}
export function awardDecisionRule(doc: Doc, before: Doc | undefined): TndRes & { submitted: boolean } {
  if (before && num(before.docstatus) === 1) {
    const same = ["decision", "reason", "approved_estimate", "tender"].every((f) => s(before[f]) === s(doc[f])) && num(doc.docstatus) === 1;
    return { doc, errors: same ? [] : [TND_MSG.decisionFrozen], submitted: false };
  }
  const e: string[] = [];
  if (!isDirector()) e.push(TND_MSG.decisionDirector);
  if (!s(doc["reason"]).trim()) e.push(TND_MSG.decisionReason);
  const t = get("Digit Tender", doc["tender"]);
  const est = s(doc["approved_estimate"]) || s(t?.["approved_estimate"]);
  if (doc["decision"] === "Won" && !est) e.push(TND_MSG.decisionEstimate);
  return { doc: { ...doc, approved_estimate: est, decided_by: currentUser(), decided_on: today() }, errors: e, submitted: num(doc.docstatus) === 1 };
}
export const DECISION_STATUS: Record<string, string> = { Won: "Won", Lost: "Lost", Withdrawn: "Cancelled" };

// ---------------------------------------------------------------- DEC-038 BOQ vs estimate, DEC-007 purchase vs estimate
/** DEC-038: a BOQ line is flagged when |BOQ − estimate| exceeds the lower of the percent and the absolute threshold (blank = plain differences). */
export function boqEstimateFlags(boqName: string): { rows: Row[]; pct?: number; abs?: number } {
  const b = get("Digit BOQ", boqName);
  const est = get("Digit Estimate Version", b?.["estimate_version"]);
  const pct = setting("boq_flag_pct"); const abs = setting("boq_flag_amount");
  const out = rows(b, "items").map((it): Row => {
    const l = rows(est, "lines").find((x) => x["line_key"] === it["source_estimate_line"]);
    const e = l ? lineAmount(l["qty"], l["selling_rate"]) : 0; const a = lineAmount(it["qty"], it["rate"]); const diff = r2(a - e);
    const lim = [pct !== undefined ? r2((Math.abs(e) * pct) / 100) : undefined, abs].filter((x): x is number => x !== undefined);
    const threshold = lim.length ? Math.min(...lim) : undefined;
    return { line_key: it["line_key"], description: it["description"], estimate_amount: e, boq_amount: a, difference: diff, threshold: threshold ?? null, flagged: threshold !== undefined && Math.abs(diff) > threshold ? 1 : 0 };
  });
  return { rows: out, ...(pct !== undefined ? { pct } : {}), ...(abs !== undefined ? { abs } : {}) };
}
/** DEC-007: purchase order rates against the rate of the same Item (rate.item) in the project's approved estimate. */
export function purchaseVsEstimate(project: string): Row[] {
  const tenders = new Set(all("Digit Tender", (t) => t["project"] === project).map((t) => t.name));
  const est = all("Digit Estimate Version", (v) => v["workflow_state"] === "Approved" && (v["project"] === project || tenders.has(s(v["tender"]))))[0];
  if (!est) return [];
  const byItem = new Map<string, { rate: number; rate_code: string }>();
  for (const l of rows(est, "lines")) for (const c of assemblyComponents(rows(get("Digit Assembly", l["assembly"]), "components"))) {
    const r = get("Digit Construction Rate", c["rate"]);
    if (r?.["item"] && !byItem.has(s(r["item"]))) byItem.set(s(r["item"]), { rate: num(c["unit_rate"]), rate_code: r.name });
  }
  const out: Row[] = [];
  for (const po of all("Purchase Order", (p) => num(p.docstatus) === 1 && (p["project"] === project || rows(p, "items").some((i) => i["project"] === project))))
    for (const it of rows(po, "items")) {
      const m = byItem.get(s(it["item_code"])); if (!m || (it["project"] && it["project"] !== project && po["project"] !== project)) continue;
      const rate = num(it["rate"]);
      out.push({ purchase_order: po.name, item_code: it["item_code"], po_rate: rate, estimate_rate: m.rate, rate_code: m.rate_code, estimate_version: est.name, variance: r2(rate - m.rate), variance_pct: m.rate ? r2(((rate - m.rate) / m.rate) * 100) : null });
    }
  return out;
}
