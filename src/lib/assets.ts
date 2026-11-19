/**
 * Asset lifecycle — virtual port of erpnext/assets:
 *  - asset_depreciation_schedule.py make_draft_asset_depr_schedule (Straight Line, Written Down Value, Double Declining Balance, Manual)
 *  - asset/depreciation.py make_depreciation_entry (Journal Entry Dr depreciation_expense / Cr accumulated_depreciation)
 *  - asset/depreciation.py get_gl_entries_on_asset_disposal + get_gain_loss_on_disposal (sale / scrap)
 * All ledger effects go through Journal Entries submitted by src/lib/posting.ts — no direct GL writes.
 */
import { adapter, registerDocHook, type Doc } from "./adapter";
import { resolveName } from "./rename";
import { submit, cancel } from "./posting";

const n = (v: unknown) => Number(v) || 0;
const r2 = (x: number) => Math.round(x * 100) / 100;
type Row = Record<string, unknown>;

export type Method = "Straight Line" | "Written Down Value" | "Double Declining Balance" | "Manual";

const isMonthEnd = (d: string) => { const [y, m, dd] = d.split("-").map(Number) as [number, number, number]; return new Date(Date.UTC(y, m, 0)).getUTCDate() === dd; };
/** frappe.utils add_months; keeps month-end when the start is a month-end (asset_depreciation_schedule get_next_schedule_date). */
export function addMonths(date: string, m: number) {
  const [y, mo, d] = date.split("-").map(Number) as [number, number, number];
  const last = new Date(Date.UTC(y, mo - 1 + m + 1, 0));
  if (!isMonthEnd(date)) last.setUTCDate(Math.min(d, last.getUTCDate()));
  return last.toISOString().slice(0, 10);
}
const days = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5);

export interface Policy { cost: number; salvage?: number; method: Method; count: number; frequency: number; start: string; rate?: number | undefined; opening?: number; availableFrom?: string }
/**
 * Depreciation rows. `start` is the first Depreciation Posting Date (Asset Finance Book depreciation_start_date).
 * Straight Line / Manual: when available_for_use_date falls inside the first period the first row is pro-rated by days
 * and the remainder is booked in one extra final row (asset_depreciation_schedule.py has_pro_rata / get_pro_rata_amt).
 */
export function buildSchedule(o: Policy): Row[] {
  const salvage = n(o.salvage), depreciable = o.cost - salvage; const out: Row[] = [];
  let acc = n(o.opening), value = o.cost - acc;
  const yearsFrac = o.frequency / 12;
  const rate = o.method === "Double Declining Balance" ? 200 / ((o.count * o.frequency) / 12) : n(o.rate);
  const straight = o.method === "Straight Line" || o.method === "Manual";
  const periodStart = addMonths(o.start, -o.frequency);
  const frac = straight && o.availableFrom && o.availableFrom > periodStart && o.availableFrom < o.start ? (days(o.availableFrom, o.start) + 1) / days(periodStart, o.start) : 1;
  const rowsN = o.count + (frac < 1 ? 1 : 0); const per = (depreciable - n(o.opening)) / o.count;
  for (let i = 0; i < rowsN; i++) {
    let amt: number;
    if (i === rowsN - 1) amt = depreciable - acc; // last row closes to salvage (round-off absorbed)
    else if (straight) amt = i === 0 ? per * frac : per;
    else amt = Math.min(value * (rate / 100) * yearsFrac, value - salvage);
    amt = r2(Math.max(amt, 0)); acc = r2(acc + amt); value = r2(value - amt);
    out.push({ idx: i + 1, schedule_date: addMonths(o.start, o.frequency * i), depreciation_amount: amt, accumulated_depreciation_amount: acc, journal_entry: "" });
  }
  return out;
}

const abbrOf = (company: string) => String(adapter.get("Company", resolveName("Company", company))?.["abbr"] ?? "");
const pick = (company: string, ...names: string[]) => { const ab = abbrOf(company); for (const x of names) { const a = resolveName("Account", `${x} - ${ab}`); if (adapter.get("Account", a)) return a; } return resolveName("Account", `${names[names.length - 1]} - ${ab}`); };
/** get_depreciation_accounts: Asset Category Account row, else company defaults. */
export function assetAccounts(a: Doc) {
  const c = String(a["company"] ?? "");
  const cat = adapter.get("Asset Category", String(a["asset_category"] ?? ""));
  const row = ((cat?.["accounts"] as Row[] | undefined) ?? []).find((r) => r["company_name"] === c) ?? {};
  return {
    fixed: String(row["fixed_asset_account"] || pick(c, "Fixed Assets")),
    accumulated: String(row["accumulated_depreciation_account"] || pick(c, "Accumulated Depreciation", "Fixed Assets")),
    expense: String(row["depreciation_expense_account"] || pick(c, "Depreciation")),
    gainLoss: pick(c, "Gain/Loss on Asset Disposal", "Round Off"),
    bank: adapter.list("Account").find((x) => x["company"] === c && x["account_type"] === "Bank")?.name ?? pick(c, "Cash"),
  };
}

const posted = (r: Row) => !!r["journal_entry"] && r["journal_entry"] !== "preview";
const liveSchedules = (asset: string) => adapter.list("Asset Depreciation Schedule").filter((s) => s["asset"] === asset && n(s.docstatus) !== 2);
/** One active schedule per Asset + Finance Book ("" = no book). */
export const scheduleOf = (asset: string, fb = "") => liveSchedules(asset).find((s) => String(s["finance_book"] ?? "") === fb);
const defaultBook = (a: Doc) => { const fb = String(a["default_finance_book"] ?? ""); const xs = liveSchedules(a.name); return xs.some((s) => String(s["finance_book"] ?? "") === fb) ? fb : String(xs[0]?.["finance_book"] ?? ""); };
const costOf = (a: Doc) => n(a["gross_purchase_amount"] ?? a["net_purchase_amount"]);
const lastDayOf = (date: string) => { const [y, m] = date.split("-").map(Number) as [number, number]; return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10); };

/** Create (or replace while nothing is posted) the depreciation schedule of one Finance Book. */
export function makeSchedule(asset: string, method: Method = "Straight Line", count = 12, frequency = 1, rate?: number, fb = "", startDate?: string, salvage?: number, shift = false): Doc {
  const a = adapter.get("Asset", asset); if (!a) throw new Error(`Asset ${asset} not found`);
  if (!n(a["calculate_depreciation"])) throw new Error("Calculate Depreciation is not enabled on this asset");
  if (!(count > 0) || !(frequency > 0)) throw new Error("Total Number of Depreciations and Frequency must be greater than 0");
  if (!["Straight Line", "Written Down Value", "Double Declining Balance", "Manual"].includes(method)) throw new Error(`Depreciation method ${method} is not supported in this preview`);
  const shiftBased = shift || !!n(a["shift_based"]) || !!n(a["depreciation_based_on_shift"]);
  if (shiftBased && method !== "Straight Line") throw new Error("Shift based depreciation is only available for the Straight Line method");
  const defShift = shiftBased ? defaultShift() : "";
  if (shiftBased && !defShift) throw new Error("Set a default Asset Shift Factor before using shift based depreciation");
  if (method === "Written Down Value" && !(n(rate) > 0)) throw new Error("Rate of Depreciation is mandatory for Written Down Value");
  const existing = scheduleOf(asset, fb);
  if (existing && ((existing["depreciation_schedule"] as Row[]) ?? []).some(posted)) throw new Error("Schedule already has posted depreciation; adjust instead of regenerating");
  const avail = String(a["available_for_use_date"] || a["purchase_date"]);
  const start = startDate || lastDayOf(avail);
  if (start < avail) throw new Error("Depreciation Posting Date cannot be before Available-for-use Date");
  const cost = costOf(a), sv = n(salvage ?? a["expected_value_after_useful_life"]);
  if (sv >= cost) throw new Error("Expected Value After Useful Life must be less than the purchase amount");
  // shift based rows start equal (every row on the default shift) and are never pro-rated (get_shift_depr_amount)
  const rows = buildSchedule({ cost, salvage: sv, method, count, frequency, rate, start, opening: n(a["opening_accumulated_depreciation"]), ...(startDate && !shiftBased ? { availableFrom: avail } : {}) }).map((r) => (shiftBased ? { ...r, shift: defShift } : r));
  const doc = { asset, asset_name: a["asset_name"], company: a["company"], finance_book: fb, depreciation_method: method, total_number_of_depreciations: count, frequency_of_depreciation: frequency, rate_of_depreciation: rate ?? 0, expected_value_after_useful_life: sv, net_purchase_amount: cost, opening_accumulated_depreciation: n(a["opening_accumulated_depreciation"]), value_after_depreciation: r2(cost - n(a["opening_accumulated_depreciation"])), depreciation_schedule: rows, status: "Active", docstatus: 1, shift_based: shiftBased ? 1 : 0 };
  if (existing) { adapter.update("Asset Depreciation Schedule", existing.name, doc); return adapter.get("Asset Depreciation Schedule", existing.name)!; }
  return adapter.insertDoc("Asset Depreciation Schedule", { name: fb ? `${asset}-DS-${fb}` : `${asset}-DS`, ...doc });
}

/** make_draft_asset_depr_schedules: one schedule per Asset Finance Book row (or the asset-level policy when none). */
export function makeSchedules(asset: string): Doc[] {
  const a = adapter.get("Asset", asset); if (!a) throw new Error(`Asset ${asset} not found`);
  const books = (a["finance_books"] as Row[] | undefined) ?? [];
  if (!books.length) return [makeSchedule(asset, (a["depreciation_method"] as Method) || "Straight Line", n(a["total_number_of_depreciations"]) || 12, n(a["frequency_of_depreciation"]) || 1)];
  const seen = new Set<string>();
  return books.map((b) => {
    const fb = String(b["finance_book"] ?? ""); if (seen.has(fb)) throw new Error(`Finance Book ${fb || "(default)"} is repeated`); seen.add(fb);
    const sv = b["expected_value_after_useful_life"] !== undefined ? n(b["expected_value_after_useful_life"]) : n(b["salvage_value_percentage"]) ? r2((costOf(a) * n(b["salvage_value_percentage"])) / 100) : undefined;
    return makeSchedule(asset, (b["depreciation_method"] as Method) || "Straight Line", n(b["total_number_of_depreciations"]), n(b["frequency_of_depreciation"]), n(b["rate_of_depreciation"]) || undefined, fb, b["depreciation_start_date"] ? String(b["depreciation_start_date"]) : undefined, sv, !!n(b["shift_based"]));
  });
}

function je(company: unknown, date: string, title: string, lines: Row[], extra: Row = {}): string {
  const d = adapter.insertDoc("Journal Entry", { voucher_type: "Depreciation Entry", company, posting_date: date, title, user_remark: title, accounts: lines.map((l, i) => ({ idx: i + 1, debit: 0, credit: 0, ...l, debit_in_account_currency: l["debit"] ?? 0, credit_in_account_currency: l["credit"] ?? 0 })), docstatus: 0, ...extra });
  const errs = submit("Journal Entry", d.name); if (errs.length) throw new Error(errs.join("; "));
  return d.name;
}

/* ---------------- shift based depreciation (asset_depreciation_schedule.py get_shift_depr_amount, asset_shift_allocation.py) ---------------- */
/** Asset Shift Factor records: shift name → factor. */
export function shiftFactors(): Map<string, number> { return new Map(adapter.list("Asset Shift Factor").map((x) => [x.name, n(x["shift_factor"])] as [string, number])); }
/** The shift marked default (asset_shift_factor.py allows one). */
export const defaultShift = () => adapter.list("Asset Shift Factor").find((x) => n(x["default"]))?.name ?? "";
const near = (a: number, b: number) => Math.abs(a - b) < 1e-9;
/** find_subsets_with_sum: k factors (repetition allowed) adding up to target. */
function subsetsWithSum(nums: number[], k: number, target: number, cur: number[], out: number[][]) {
  if (out.length) return;
  if (k === 0 && near(target, 0)) { out.push([...cur]); return; }
  if (k <= 0 || target <= 1e-9 || !nums.length) return;
  subsetsWithSum(nums, k - 1, target - nums[0]!, [...cur, nums[0]!], out);
  subsetsWithSum(nums.slice(1), k, target, cur, out);
}
/**
 * allocate_shift_diff_in_depr_schedule: the asset's life in shift units stays the same, so when the wanted shifts add up to
 * more than the schedule's, later rows are dropped or lowered; when they add up to less, rows are added (up to the original
 * number) or later rows raised. Booked rows (`locked`) are never touched.
 */
export function allocateShifts(original: string[], wanted: string[], maxRows: number, locked = 0, f = shiftFactors()): string[] {
  const rev = new Map<number, string>(); for (const [k, v] of f) if (!rev.has(r2(v))) rev.set(r2(v), k);
  const sum = (xs: string[]) => r2(xs.reduce((t, x) => t + (f.get(x) ?? 0), 0));
  const out = [...wanted]; let diff = r2(sum(wanted) - sum(original));
  const need = (x: number) => { const nm = rev.get(r2(x)); if (!nm) throw new Error(`Could not auto update shifts. Shift with shift factor ${r2(x)} needed.`); return nm; };
  if (diff > 0) {
    for (let i = out.length - 1; i >= 0 && diff > 0; i--) {
      if (i < locked) throw new Error("Could not auto update shifts without changing booked depreciation.");
      const sf = f.get(out[i]!) ?? 0;
      if (sf <= diff + 1e-9) { out.pop(); diff = r2(diff - sf); } else { out[i] = need(sf - diff); diff = 0; }
    }
  } else if (diff < 0) {
    const factors = [...new Set([...f.values()])]; const desc = [...factors].sort((a, b) => b - a);
    const lenDiff = maxRows - out.length; const subs: number[][] = []; let add = lenDiff;
    while (add > 0 && !subs.length) { subsetsWithSum(factors, add, Math.abs(diff), [], subs); if (subs.length) break; add--; }
    if (subs.length) { for (let i = 0; i < add; i++) out.push(need(subs[0]![i]!)); }
    else {
      for (let i = out.length - 1; i >= 0; i--) {
        diff = Math.abs(diff); if (diff <= 1e-9) break;
        if (i < locked) throw new Error("Could not auto update shifts without changing booked depreciation.");
        const sf = f.get(out[i]!) ?? 0;
        if (sf <= diff + 1e-9) { const up = desc.find((x) => x - sf <= diff + 1e-9); if (up !== undefined) { out[i] = need(up); diff = r2(diff - (up - sf)); } }
        else { out[i] = need(sf + diff); diff = 0; }
      }
    }
  }
  return out;
}
/** Rebuild a shift based schedule for the given shifts: booked rows keep their amounts; open rows book depreciable × factor ÷ the sum of all factors, the last row closing to the salvage value. */
export function applyShifts(scheduleName: string, shifts: string[]): Doc {
  const s = adapter.get("Asset Depreciation Schedule", scheduleName); if (!s) throw new Error(`Asset Depreciation Schedule ${scheduleName} not found`);
  const a = adapter.get("Asset", String(s["asset"]))!; const f = shiftFactors(); const old = (s["depreciation_schedule"] as Row[]) ?? [];
  const cost = n(s["net_purchase_amount"] ?? costOf(a)), sv = n(s["expected_value_after_useful_life"]), opening = n(s["opening_accumulated_depreciation"]);
  const depreciable = cost - opening - sv; const total = shifts.reduce((t, x) => t + (f.get(x) ?? 0), 0); const freq = n(s["frequency_of_depreciation"]) || 1;
  if (!(total > 0)) throw new Error("The shifts must add up to more than zero");
  let acc = opening; let last = String(old[0]?.["schedule_date"] ?? "");
  const out: Row[] = shifts.map((sh, i) => {
    const prev = old[i];
    if (prev && posted(prev)) { acc = r2(acc + n(prev["depreciation_amount"])); last = String(prev["schedule_date"]); return { ...prev, idx: i + 1 }; }
    const date = prev ? String(prev["schedule_date"]) : addMonths(last, freq); last = date;
    const amt = i === shifts.length - 1 ? r2(cost - sv - acc) : r2((depreciable * (f.get(sh) ?? 0)) / total);
    acc = r2(acc + amt);
    return { idx: i + 1, schedule_date: date, depreciation_amount: amt, accumulated_depreciation_amount: acc, journal_entry: "", shift: sh };
  });
  adapter.update("Asset Depreciation Schedule", s.name, { depreciation_schedule: out, total_number_of_depreciations: out.length });
  refreshAsset(a.name);
  return adapter.get("Asset Depreciation Schedule", s.name)!;
}

/** Book values follow the posted rows; the Asset shows its default book (asset.py get_value_after_depreciation). */
function refreshAsset(asset: string) {
  const a = adapter.get("Asset", asset)!; const def = defaultBook(a);
  let assetValue: number | undefined; let status = "Submitted";
  const books = ((a["finance_books"] as Row[] | undefined) ?? []).map((b) => ({ ...b }));
  for (const s of liveSchedules(asset)) {
    const rows = (s["depreciation_schedule"] as Row[]) ?? []; const p = rows.filter(posted);
    const value = r2(n(s["net_purchase_amount"] ?? costOf(a)) - n(s["opening_accumulated_depreciation"]) - p.reduce((t, r) => t + n(r["depreciation_amount"]), 0));
    adapter.update("Asset Depreciation Schedule", s.name, { value_after_depreciation: value });
    const fb = String(s["finance_book"] ?? "");
    const br = books.find((b) => String(b["finance_book"] ?? "") === fb); if (br) { br["value_after_depreciation"] = value; br["total_number_of_booked_depreciations"] = p.length; }
    if (fb === def) { assetValue = value; status = p.length && p.length >= rows.length ? "Fully Depreciated" : p.length ? "Partially Depreciated" : "Submitted"; }
  }
  const patch: Row = { ...(books.length ? { finance_books: books } : {}), ...(assetValue !== undefined ? { value_after_depreciation: assetValue } : {}) };
  if (!["Sold", "Scrapped", "Capitalized", "Out of Order"].includes(String(a["status"]))) patch["status"] = status;
  adapter.update("Asset", asset, patch);
}

/** make_depreciation_entry for every unposted row dated on/before `upTo` (all books, or one). Idempotent per Asset + Finance Book + row. */
export function postDepreciation(asset: string, upTo: string, fb?: string): string[] {
  const a = adapter.get("Asset", asset); if (!a) throw new Error(`Asset ${asset} not found`);
  if (n(a["docstatus"]) !== 1) throw new Error("Asset must be submitted");
  if (["Sold", "Scrapped", "Capitalized"].includes(String(a["status"]))) throw new Error(`Asset ${asset} is ${a["status"]}`);
  const schedules = fb === undefined ? liveSchedules(asset) : [scheduleOf(asset, fb)].filter(Boolean) as Doc[];
  if (!schedules.length) throw new Error("No depreciation schedule");
  const acc = assetAccounts(a); const made: string[] = [];
  for (const s of schedules) {
    const book = String(s["finance_book"] ?? "");
    const rows = ((s["depreciation_schedule"] as Row[]) ?? []).map((r) => ({ ...r }));
    for (const r of rows) {
      if (posted(r) || String(r["schedule_date"]) > upTo) continue;
      const amt = n(r["depreciation_amount"]); if (!amt) continue; const cc = a["cost_center"] ?? "";
      r["journal_entry"] = je(a["company"], String(r["schedule_date"]), `Depreciation ${asset}${book ? ` (${book})` : ""} #${r["idx"]}`, [
        { account: acc.expense, debit: amt, cost_center: cc, reference_type: "Asset", reference_name: asset },
        { account: acc.accumulated, credit: amt, cost_center: cc, reference_type: "Asset", reference_name: asset },
      ], { finance_book: book });
      made.push(String(r["journal_entry"]));
    }
    adapter.update("Asset Depreciation Schedule", s.name, { depreciation_schedule: rows });
  }
  refreshAsset(asset);
  return made;
}

/** Cancel a depreciation Journal Entry and free its schedule row (depreciation.py cancel_depreciation_entries). */
export function cancelDepreciation(asset: string, journal: string) {
  cancel("Journal Entry", journal);
  for (const s of liveSchedules(asset)) adapter.update("Asset Depreciation Schedule", s.name, { depreciation_schedule: ((s["depreciation_schedule"] as Row[]) ?? []).map((r) => (r["journal_entry"] === journal ? { ...r, journal_entry: "" } : r)) });
  refreshAsset(asset);
}

/** Accumulated depreciation of one book (default book when omitted). */
export const accumulated = (asset: string, fb?: string) => {
  const a = adapter.get("Asset", asset)!; const s = scheduleOf(asset, fb ?? defaultBook(a));
  // a schedule without its own net_purchase_amount (seeded / imported) uses the asset cost, as refreshAsset does
  return s ? r2(n(s["net_purchase_amount"] ?? costOf(a)) - n(s["value_after_depreciation"])) : r2(costOf(a) - n(a["value_after_depreciation"]));
};
export const bookValue = (asset: string, fb?: string) => { const a = adapter.get("Asset", asset)!; const s = scheduleOf(asset, fb ?? defaultBook(a)); return n(s ? s["value_after_depreciation"] : a["value_after_depreciation"]); };

/** Sale (amount > 0) or scrap (amount 0) on the default book: Dr accumulated + proceeds, Cr fixed asset, gain/loss balances. */
export function disposeAsset(asset: string, date: string, saleAmount = 0): { journal: string; gainLoss: number } {
  const a = adapter.get("Asset", asset); if (!a) throw new Error(`Asset ${asset} not found`);
  if (["Sold", "Scrapped", "Capitalized"].includes(String(a["status"]))) throw new Error(`Asset ${asset} is already ${a["status"]}`);
  if (n(a["docstatus"]) !== 1) throw new Error("Asset must be submitted");
  if (liveSchedules(asset).length) postDepreciation(asset, date); // depreciate every book up to the disposal date first
  const b = adapter.get("Asset", asset)!; const acc = assetAccounts(b); const def = defaultBook(b); const s = scheduleOf(asset, def);
  const cost = s ? n(s["net_purchase_amount"] ?? costOf(b)) : costOf(b), accum = accumulated(asset), nbv = r2(cost - accum);
  const gainLoss = r2(saleAmount - nbv); // >0 gain (credit), <0 loss (debit)
  const lines: Row[] = [{ account: acc.fixed, credit: cost, reference_type: "Asset", reference_name: asset }];
  if (accum) lines.push({ account: acc.accumulated, debit: accum, reference_type: "Asset", reference_name: asset });
  if (saleAmount) lines.push({ account: acc.bank, debit: r2(saleAmount) });
  if (gainLoss) lines.push({ account: acc.gainLoss, ...(gainLoss > 0 ? { credit: gainLoss } : { debit: -gainLoss }) });
  const journal = je(b["company"], date, `${saleAmount ? "Sale" : "Scrap"} of ${asset}`, lines, { voucher_type: "Journal Entry", finance_book: def });
  adapter.update("Asset", asset, { status: saleAmount ? "Sold" : "Scrapped", disposal_date: date, journal_entry_for_scrap: journal });
  return { journal, gainLoss };
}

/** Restore an asset from disposal (depreciation.py restore_asset): cancels the disposal Journal Entry. */
export function restoreAsset(asset: string) {
  const a = adapter.get("Asset", asset); const j = String(a?.["journal_entry_for_scrap"] ?? ""); if (!a || !j) throw new Error("Asset is not disposed");
  cancel("Journal Entry", j);
  adapter.update("Asset", asset, { journal_entry_for_scrap: "", disposal_date: "", status: "Submitted" });
  refreshAsset(asset);
}

/** Scale the unposted rows of one book so they depreciate `delta` more (or less), keeping posted rows (reschedule_asset_depreciation). */
function reschedule(asset: string, fb: string, delta: number, extraRows = 0) {
  const s = scheduleOf(asset, fb); if (!s) return;
  let rows = ((s["depreciation_schedule"] as Row[]) ?? []).map((r) => ({ ...r }));
  for (let i = 0; i < extraRows; i++) { const last = rows[rows.length - 1]!; rows.push({ idx: rows.length + 1, schedule_date: addMonths(String(last["schedule_date"]), n(s["frequency_of_depreciation"]) || 1), depreciation_amount: 0, journal_entry: "" }); }
  const open = rows.filter((r) => !posted(r)); const remaining = open.reduce((t, r) => t + n(r["depreciation_amount"]), 0) + delta;
  if (open.length) {
    const even = extraRows > 0 || open.every((r) => !n(r["depreciation_amount"]));
    const base = open.reduce((t, r) => t + n(r["depreciation_amount"]), 0);
    let left = r2(remaining);
    open.forEach((r, i) => { const amt = i === open.length - 1 ? left : r2(even || !base ? remaining / open.length : (n(r["depreciation_amount"]) * remaining) / base); r["depreciation_amount"] = Math.max(0, amt); left = r2(left - amt); });
  }
  let acc = n(s["opening_accumulated_depreciation"]);
  rows = rows.map((r) => { acc = r2(acc + n(r["depreciation_amount"])); return { ...r, accumulated_depreciation_amount: acc }; });
  adapter.update("Asset Depreciation Schedule", s.name, { depreciation_schedule: rows, net_purchase_amount: r2(n(s["net_purchase_amount"]) + delta), total_number_of_depreciations: n(s["total_number_of_depreciations"]) + extraRows });
}
/** Change one book's value (value adjustment, capitalized repair): reschedule + refresh; asset cost follows the default book. */
function changeBookValue(asset: string, fb: string, delta: number, extraRows = 0) {
  const a = adapter.get("Asset", asset)!;
  if (scheduleOf(asset, fb)) reschedule(asset, fb, delta, extraRows);
  if (fb === defaultBook(a) || !liveSchedules(asset).length) adapter.update("Asset", asset, { gross_purchase_amount: r2(costOf(a) + delta), ...(!liveSchedules(asset).length ? { value_after_depreciation: r2(n(a["value_after_depreciation"]) + delta) } : {}) });
  refreshAsset(asset);
}

/**
 * asset_value_adjustment.py: on_submit make_asset_revaluation_entry (Dr/Cr fixed asset vs difference_account,
 * reschedule remaining depreciation of that finance book); on_cancel reverses the Journal Entry and the schedule.
 */
export function valueAdjustmentErrors(d: Doc): string[] {
  const a = adapter.get("Asset", String(d["asset"] ?? "")); const e: string[] = [];
  if (!a) return [`Asset ${d["asset"] ?? ""} not found`];
  if (n(a["docstatus"]) !== 1) e.push(`Asset ${a.name} must be submitted`);
  if (["Sold", "Scrapped", "Capitalized"].includes(String(a["status"]))) e.push(`Asset ${a.name} is ${a["status"]}`);
  if (d["company"] && a["company"] !== d["company"]) e.push(`Asset ${a.name} does not belong to company ${d["company"]}`);
  if (!d["difference_account"]) e.push("Difference Account is mandatory");
  const fb = String(d["finance_book"] ?? ""); if (fb && !scheduleOf(a.name, fb)) e.push(`Asset ${a.name} has no schedule for Finance Book ${fb}`);
  const cur = bookValue(a.name, fb || undefined);
  if (!(n(d["new_asset_value"]) >= 0) || n(d["new_asset_value"]) === cur) e.push("New Asset Value must differ from the current asset value");
  return e;
}
export function submitValueAdjustment(name: string) {
  const d = adapter.get("Asset Value Adjustment", name)!; const a = adapter.get("Asset", String(d["asset"]))!;
  const fb = String(d["finance_book"] ?? "") || defaultBook(a);
  const cur = bookValue(a.name, fb), nv = n(d["new_asset_value"]); const diff = r2(nv - cur); const acc = assetAccounts(a);
  const ref = { reference_type: "Asset", reference_name: a.name, cost_center: d["cost_center"] ?? a["cost_center"] ?? "" };
  const lines: Row[] = diff < 0 ? [{ account: String(d["difference_account"]), debit: -diff, ...ref }, { account: acc.fixed, credit: -diff, ...ref }] : [{ account: acc.fixed, debit: diff, ...ref }, { account: String(d["difference_account"]), credit: diff, ...ref }];
  const journal = je(a["company"], String(d["date"] || new Date().toISOString().slice(0, 10)), `Asset Value Adjustment ${name}`, lines, { voucher_type: "Journal Entry", finance_book: fb });
  adapter.update("Asset Value Adjustment", name, { journal_entry: journal, current_asset_value: cur, difference_amount: diff });
  changeBookValue(a.name, fb, diff);
  return journal;
}
export function cancelValueAdjustment(name: string) {
  const d = adapter.get("Asset Value Adjustment", name)!; const a = adapter.get("Asset", String(d["asset"]))!;
  if (d["journal_entry"]) cancel("Journal Entry", String(d["journal_entry"]));
  changeBookValue(a.name, String(d["finance_book"] ?? "") || defaultBook(a), -n(d["difference_amount"]));
}
/** Used by asset repair / capitalization (assetDocs.ts). */
export const assetInternals = { je, changeBookValue, refreshAsset, liveSchedules, defaultBook, costOf, posted };

// controller hooks: submit (docstatus 0→1) and cancel (1→2) from any screen run the source on_submit/on_cancel
registerDocHook("Asset Value Adjustment", (doc, before) => {
  const from = n(before?.docstatus), to = n(doc.docstatus);
  if (from === 0 && to === 1) { const errors = valueAdjustmentErrors(doc); return errors.length ? { doc, errors } : { doc, after: (d) => { if (!d["journal_entry"]) submitValueAdjustment(d.name); } }; }
  if (from === 1 && to === 2) return { doc, after: (d) => cancelValueAdjustment(d.name) };
  return { doc };
});
