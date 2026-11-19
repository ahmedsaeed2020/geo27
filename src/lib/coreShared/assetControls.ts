/**
 * DIGIT shared Core fixed-asset controls (Part B: FA6-b custody approval, FIX-007-b physical verification, FA9-b category
 * change, FIX-002-b category templates, FIX-011-b impairment, FA11-b / FIX-014-b capital work in progress).
 * Records are the Core DocTypes Digit Asset Custody / Verification / Impairment / Category Template; every ledger or
 * custodian effect goes through a native document (Asset Movement, Asset Value Adjustment, Journal Entry, Asset) submitted
 * by the shared posting engine, so asset screens, reports and the ledger read one set of records. Shift based depreciation
 * lives in src/lib/assets.ts + the Asset Shift Allocation controller in src/lib/assetDocs.ts.
 */
import { adapter, registerDocHook, type Doc } from "@/lib/adapter";
import { cachedMeta } from "@/lib/catalog";
import { currentUser, hasPerm, userRoles } from "@/lib/session";
import { submit, cancel } from "@/lib/posting";
import { assetAccounts, assetInternals, bookValue, accumulated } from "@/lib/assets";
import "@/lib/assetDocs";
import { CORE_DT } from "./doctypes";
import { controlPolicy } from "./controls";

export type Bi = [string, string];
export type Res<T = object> = ({ ok: true } & T) | { ok: false; reason: Bi };
const s = (v: unknown) => String(v ?? "");
const n = (v: unknown) => Number(v) || 0;
const r2 = (x: number) => Math.round(x * 100) / 100;
const rows = (d: Doc | undefined, f: string) => (Array.isArray(d?.[f]) ? (d![f] as Doc[]) : []);
const today = () => new Date().toISOString().slice(0, 10);
const nowStamp = () => new Date().toISOString().slice(0, 19).replace("T", " ");
const addDays = (d: string, k: number) => new Date(Date.parse(d) + k * 864e5).toISOString().slice(0, 10);
export const DEAD = ["Sold", "Scrapped", "Capitalized", "Cancelled"];
const may = (dt: string, ptype: "read" | "write" | "create" | "submit" | "cancel", user: string, doc?: Doc) => { const m = cachedMeta(dt); return !!m && hasPerm(m, ptype, doc, user); };
const fail = (en: string, ar: string): { ok: false; reason: Bi } => ({ ok: false, reason: [en, ar] });
const comment = (dt: string, name: string, user: string, content: string) => adapter.insertDoc("Comment", { comment_type: "Comment", reference_doctype: dt, reference_name: name, comment_email: user, owner: user, creation: nowStamp(), content });
const liveAsset = (a: Doc | undefined) => !!a && n(a.docstatus) === 1 && !DEAD.includes(s(a["status"]));
export const companyAssets = (company: string) => adapter.list("Asset").filter((a) => s(a["company"]) === company && liveAsset(a)).sort((a, b) => a.name.localeCompare(b.name));

/* ------------------------------------------------------------------ custody ------------------------------------------------------------------ */
export const custodyOf = (company: string) => adapter.list(CORE_DT.assetCustody).filter((c) => s(c["company"]) === company).sort((a, b) => s(b["from_date"]).localeCompare(s(a["from_date"])) || b.name.localeCompare(a.name));
const openCustody = (asset: string) => adapter.list(CORE_DT.assetCustody).find((c) => s(c["asset"]) === asset && s(c["status"]) === "Approved" && !s(c["to_date"]));

/** A custody handover request: the asset goes to the employee only after someone other than the requester approves it. */
export function requestCustody(asset: string, custodian: string, fromDate: string, user = currentUser(), remarks = ""): Res<{ name: string }> {
  const a = adapter.get("Asset", asset); if (!liveAsset(a)) return fail("Only a submitted asset in use can be handed over.", "لا يُسلَّم إلا أصل معتمد قيد الاستخدام.");
  const e = adapter.get("Employee", custodian); if (!e) return fail("Choose the employee who will hold the asset.", "اختر الموظف الذي سيتسلم الأصل.");
  if (s(e["status"]) && s(e["status"]) !== "Active") return fail("The employee is not active.", "الموظف غير نشط.");
  if (s(a!["custodian"]) === custodian) return fail("The employee already holds this asset.", "الموظف يحمل هذا الأصل بالفعل.");
  if (!may(CORE_DT.assetCustody, "create", user)) return fail("You may not request asset custody.", "لا يحق لك طلب عهدة أصل.");
  if (adapter.list(CORE_DT.assetCustody).some((c) => s(c["asset"]) === asset && s(c["status"]) === "Requested")) return fail("This asset already has a custody request waiting for approval.", "لهذا الأصل طلب عهدة بانتظار الاعتماد.");
  const d = adapter.insertDoc(CORE_DT.assetCustody, { asset, company: a!["company"], custodian, from_date: fromDate || today(), status: "Requested", remarks, owner: user });
  return { ok: true, name: d.name };
}
export function mayApproveCustody(d: Doc, user = currentUser()): Res {
  const role = controlPolicy(s(d["company"])).custody_approver_role || "Accounts Manager";
  if (s(d["owner"]) && s(d["owner"]) === user) return fail("The requester cannot approve their own custody request.", "لا يعتمد مقدّم الطلب طلبه.");
  const roles = userRoles(user); if (user !== "Administrator" && !roles.includes(role) && !roles.includes("System Manager")) return fail(`Only a ${role} can approve custody.`, `لا يعتمد العهدة إلا ${role}.`);
  return { ok: true };
}
/** Approve: the native Asset Movement (Issue) is created and submitted, which sets the asset's custodian. Reject needs a reason. */
export function decideCustody(name: string, decision: "Approved" | "Rejected", user = currentUser(), remarks = ""): Res<{ movement?: string }> {
  const d = adapter.get(CORE_DT.assetCustody, name); if (!d) return fail("Custody request not found.", "طلب العهدة غير موجود.");
  if (s(d["status"]) !== "Requested") return fail("Only a waiting request can be decided.", "لا يُبت إلا في طلب منتظر.");
  const m = mayApproveCustody(d, user); if (!m.ok) return m;
  if (decision === "Rejected") {
    if (!remarks.trim()) return fail("Say why the request is rejected.", "اذكر سبب رفض الطلب.");
    adapter.update(CORE_DT.assetCustody, name, { status: "Rejected", approver: user, remarks }); comment("Asset", s(d["asset"]), user, `Custody request ${name} rejected — ${remarks}`);
    return { ok: true };
  }
  const a = adapter.get("Asset", s(d["asset"])); if (!liveAsset(a)) return fail("The asset is no longer in use.", "الأصل لم يعد قيد الاستخدام.");
  const mv = adapter.insertDoc("Asset Movement", { company: a!["company"], purpose: "Issue", transaction_date: s(d["from_date"]) || today(), owner: user,
    assets: [{ idx: 1, asset: a!.name, asset_name: a!["asset_name"], source_location: a!["location"] ?? "", ...(a!["custodian"] ? { from_employee: a!["custodian"] } : {}), to_employee: d["custodian"] }], docstatus: 0 });
  const prev = openCustody(a!.name);
  adapter.update(CORE_DT.assetCustody, name, { status: "Approved", approver: user, asset_movement: mv.name, ...(remarks ? { remarks } : {}) });
  const errs = submit("Asset Movement", mv.name);
  if (errs.length) { adapter.update(CORE_DT.assetCustody, name, { status: "Requested", approver: "", asset_movement: "" }); adapter.remove("Asset Movement", mv.name); return { ok: false, reason: [errs.join("; "), errs.join("؛ ")] }; }
  if (prev && prev.name !== name) adapter.update(CORE_DT.assetCustody, prev.name, { status: "Returned", to_date: s(d["from_date"]) || today() });
  comment("Asset", a!.name, user, `Custody approved: ${s(d["custodian"])} holds the asset from ${s(d["from_date"])} (${name}, ${mv.name})`);
  return { ok: true, movement: mv.name };
}
/** The custodian hands the asset back: native Asset Movement (Receipt) to a location, custody closed. */
export function returnCustody(name: string, date: string, user = currentUser(), location = ""): Res<{ movement: string }> {
  const d = adapter.get(CORE_DT.assetCustody, name); if (!d || s(d["status"]) !== "Approved" || s(d["to_date"])) return fail("Only a custody in force can be returned.", "لا تُعاد إلا عهدة سارية.");
  const a = adapter.get("Asset", s(d["asset"])); if (!liveAsset(a)) return fail("The asset is no longer in use.", "الأصل لم يعد قيد الاستخدام.");
  if (!may("Asset Movement", "submit", user)) return fail("You may not submit asset movements.", "لا يحق لك اعتماد حركات الأصول.");
  const target = location || s(a!["location"]); if (!target) return fail("Choose the location the asset is returned to.", "اختر الموقع الذي يعاد إليه الأصل.");
  const mv = adapter.insertDoc("Asset Movement", { company: a!["company"], purpose: "Receipt", transaction_date: date || today(), owner: user,
    assets: [{ idx: 1, asset: a!.name, asset_name: a!["asset_name"], from_employee: d["custodian"], target_location: target }], docstatus: 0 });
  const errs = submit("Asset Movement", mv.name); if (errs.length) return { ok: false, reason: [errs.join("; "), errs.join("؛ ")] };
  adapter.update(CORE_DT.assetCustody, name, { status: "Returned", to_date: date || today(), return_movement: mv.name });
  return { ok: true, movement: mv.name };
}
/** Submit gate: with custody approval on, issuing an asset to an employee needs that employee's approved custody request. */
export function custodyErrors(d: Doc): string[] {
  if (!n(controlPolicy(s(d["company"])).custody_approval_required)) return [];
  const e: string[] = [];
  for (const r of rows(d, "assets")) {
    const emp = s(r["to_employee"]); if (!emp) continue; const asset = s(r["asset"]);
    const ok = adapter.list(CORE_DT.assetCustody).some((c) => s(c["asset"]) === asset && s(c["custodian"]) === emp && s(c["status"]) === "Approved" && (!s(c["asset_movement"]) || s(c["asset_movement"]) === d.name));
    if (!ok) e.push(`Row #${r["idx"] ?? 1}: Asset ${asset} goes into the custody of ${emp}: an approved custody request is required before this movement is submitted.`);
  }
  return e;
}

/* ------------------------------------------------------------------ physical verification ------------------------------------------------------------------ */
export type VerifyState = "Verified" | "Damaged" | "Missing" | "Location differs" | "Not verified";
export interface VerifyRow { asset: Doc; last?: Doc; state: VerifyState }
export const verificationsOf = (asset: string) => adapter.list(CORE_DT.assetVerification).filter((v) => s(v["asset"]) === asset).sort((a, b) => s(b["verified_on"]).localeCompare(s(a["verified_on"])) || b.name.localeCompare(a.name));
/** Every asset in use with its latest verification inside the company's verification window. */
export function verificationRound(company: string, asOf = today(), location = ""): VerifyRow[] {
  const since = addDays(asOf, -Math.max(1, controlPolicy(company).asset_verification_days || 365));
  return companyAssets(company).filter((a) => !location || s(a["location"]) === location).map((a) => {
    const last = verificationsOf(a.name).find((v) => s(v["verified_on"]) >= since && s(v["verified_on"]) <= asOf);
    const r = s(last?.["result"]);
    const state: VerifyState = !last ? "Not verified" : r === "Found" ? "Verified" : r === "Found - Damaged" ? "Damaged" : r === "Missing" ? "Missing" : "Location differs";
    return { asset: a, ...(last ? { last } : {}), state };
  });
}
export type VerifyResult = "Found" | "Found - Damaged" | "Missing" | "Location differs";
/** Record what the count found. A different location prepares a transfer for a person to confirm; damaged or missing opens a correction task. */
export function recordVerification(asset: string, result: VerifyResult, opts: { location?: string; notes?: string; date?: string } = {}, user = currentUser()): Res<{ name: string; follow?: { doctype: string; name: string } }> {
  const a = adapter.get("Asset", asset); if (!liveAsset(a)) return fail("Only a submitted asset in use can be verified.", "لا يُجرد إلا أصل معتمد قيد الاستخدام.");
  if (!may(CORE_DT.assetVerification, "create", user)) return fail("You may not record physical verification.", "لا يحق لك تسجيل الجرد الفعلي.");
  const loc = s(opts.location);
  if (result === "Location differs" && (!loc || loc === s(a!["location"]))) return fail("Choose the location where the asset was found.", "اختر الموقع الذي وُجد فيه الأصل.");
  if ((result === "Missing" || result === "Found - Damaged") && !s(opts.notes).trim()) return fail("Describe what was found.", "صف ما وُجد.");
  const date = opts.date || today();
  const v = adapter.insertDoc(CORE_DT.assetVerification, { asset, company: a!["company"], location: result === "Location differs" ? loc : s(a!["location"]), custodian: a!["custodian"] ?? "", verified_on: date, verified_by: user, result, notes: s(opts.notes), owner: user });
  let follow: { doctype: string; name: string } | undefined;
  if (result === "Location differs") {
    const mv = adapter.insertDoc("Asset Movement", { company: a!["company"], purpose: "Transfer", transaction_date: date, owner: user, remarks: `Physical verification ${v.name}`,
      assets: [{ idx: 1, asset, asset_name: a!["asset_name"], source_location: a!["location"] ?? "", target_location: loc }], docstatus: 0 });
    follow = { doctype: "Asset Movement", name: mv.name };
  } else if (result !== "Found") {
    const t = adapter.insertDoc(CORE_DT.correctionTask, { company: a!["company"], reference_doctype: "Asset", reference_name: asset, assigned_to: user, due_date: addDays(date, 7), status: "Open",
      issue: result === "Missing" ? `Asset ${asset} was not found at physical verification ${v.name}: trace it, then recover or dispose of it. ${s(opts.notes)}`.trim() : `Asset ${asset} was found damaged at physical verification ${v.name}: arrange a repair. ${s(opts.notes)}`.trim() });
    follow = { doctype: CORE_DT.correctionTask, name: t.name };
  }
  comment("Asset", asset, user, `Physical verification ${v.name}: ${result}${loc && result === "Location differs" ? ` at ${loc}` : ""}`);
  return { ok: true, name: v.name, ...(follow ? { follow } : {}) };
}

/* ------------------------------------------------------------------ category templates + category change ------------------------------------------------------------------ */
type Accts = { fixed: string; accumulated: string; expense: string };
export const templatesOf = (category: string) => adapter.list(CORE_DT.assetCategoryTemplate).filter((t) => s(t["asset_category"]) === category).sort((a, b) => a.name.localeCompare(b.name));
/** Depreciation rows a new asset of the category starts with: the category's own finance books (asset.py get_item_details), else its template. */
export function categoryBooks(category: string, amount = 0, start = ""): Record<string, unknown>[] {
  const cat = adapter.get("Asset Category", category); const books = rows(cat, "finance_books");
  const base = books.length ? books : templatesOf(category).slice(0, 1).map((t) => ({ finance_book: "", depreciation_method: t["depreciation_method"] || "Straight Line", total_number_of_depreciations: n(t["total_number_of_depreciations"]) || 60, frequency_of_depreciation: n(t["frequency_of_depreciation"]) || 1 } as Record<string, unknown>));
  return base.map((b, i) => ({ idx: i + 1, finance_book: b["finance_book"] ?? "", depreciation_method: b["depreciation_method"] || "Straight Line", total_number_of_depreciations: n(b["total_number_of_depreciations"]), frequency_of_depreciation: n(b["frequency_of_depreciation"]) || 1,
    ...(n(b["rate_of_depreciation"]) ? { rate_of_depreciation: n(b["rate_of_depreciation"]) } : {}), ...(n(b["shift_based"]) ? { shift_based: 1 } : {}), ...(n(b["daily_prorata_based"]) ? { daily_prorata_based: 1 } : {}),
    ...(n(b["salvage_value_percentage"]) ? { salvage_value_percentage: n(b["salvage_value_percentage"]), expected_value_after_useful_life: r2((amount * n(b["salvage_value_percentage"])) / 100) } : {}),
    ...(start ? { depreciation_start_date: start } : {}) }));
}
/** A draft asset with depreciation on and no finance books takes them from its category (set_missing_values). */
export function withCategoryBooks(d: Doc): Doc {
  if (n(d.docstatus) !== 0 || !n(d["calculate_depreciation"]) || !s(d["asset_category"]) || rows(d, "finance_books").length) return d;
  const books = categoryBooks(s(d["asset_category"]), n(d["gross_purchase_amount"] ?? d["net_purchase_amount"]), s(d["available_for_use_date"]));
  return books.length ? { ...d, finance_books: books } : d;
}
/** Stamp a template's depreciation rows and accounts onto its category for one company, filling only what the category lacks. */
export function applyTemplate(template: string, company: string, user = currentUser()): Res<{ filled: string[] }> {
  const t = adapter.get(CORE_DT.assetCategoryTemplate, template); const cat = t ? adapter.get("Asset Category", s(t["asset_category"])) : undefined;
  if (!t || !cat) return fail("The template has no asset category.", "القالب بلا فئة أصل.");
  if (!may("Asset Category", "write", user, cat)) return fail("You may not change asset categories.", "لا يحق لك تعديل فئات الأصول.");
  const patch: Doc = {} as Doc; const filled: string[] = [];
  if (!rows(cat, "finance_books").length) { patch["finance_books"] = [{ idx: 1, finance_book: "", depreciation_method: t["depreciation_method"] || "Straight Line", total_number_of_depreciations: n(t["total_number_of_depreciations"]) || 60, frequency_of_depreciation: n(t["frequency_of_depreciation"]) || 1 }]; filled.push("finance_books"); }
  const acc = rows(cat, "accounts"); const row = acc.find((r) => s(r["company_name"]) === company);
  const want = { fixed_asset_account: s(t["fixed_asset_account"]), accumulated_depreciation_account: s(t["accumulated_depreciation_account"]), depreciation_expense_account: s(t["depreciation_expense_account"]) };
  if (Object.values(want).some(Boolean)) {
    const merged = { ...(row ?? { company_name: company }) } as Doc; let changed = false;
    for (const [k, v] of Object.entries(want)) if (v && !s(merged[k]) && adapter.get("Account", v)) { merged[k] = v; changed = true; }
    if (changed) { patch["accounts"] = row ? acc.map((r) => (r === row ? merged : r)) : [...acc, { ...merged, idx: acc.length + 1 }]; filled.push("accounts"); }
  }
  if (!filled.length) return fail("The category already has everything this template sets.", "الفئة تحتوي بالفعل على كل ما يضبطه القالب.");
  adapter.update("Asset Category", cat.name, patch); comment("Asset Category", cat.name, user, `Template ${template} applied for ${company}: ${filled.join(", ")}`);
  return { ok: true, filled };
}
const accountsFor = (company: string, category: string): Accts => { const x = assetAccounts({ name: "", doctype: "Asset", company, asset_category: category } as Doc); return { fixed: x.fixed, accumulated: x.accumulated, expense: x.expense }; };
export interface CategoryPlan { errors: Bi[]; from: string; to: string; cost: number; accumulated: number; lines: { account: string; debit: number; credit: number }[] }
/** What moving an asset to another category books: its cost and accumulated depreciation move to the new category's accounts. */
export function categoryChangePlan(asset: string, to: string): CategoryPlan {
  const a = adapter.get("Asset", asset); const from = s(a?.["asset_category"]); const base = { from, to, cost: 0, accumulated: 0, lines: [] as CategoryPlan["lines"] };
  if (!a) return { ...base, errors: [["Asset not found.", "الأصل غير موجود."]] };
  if (!adapter.get("Asset Category", to)) return { ...base, errors: [["Choose the new category.", "اختر الفئة الجديدة."]] };
  if (to === from) return { ...base, errors: [["The asset is already in this category.", "الأصل في هذه الفئة بالفعل."]] };
  if (n(a.docstatus) === 2 || DEAD.includes(s(a["status"]))) return { ...base, errors: [[`The asset is ${s(a["status"]) || "cancelled"}.`, `الأصل ${s(a["status"]) || "ملغى"}.`]] };
  if (n(a.docstatus) === 0) return { ...base, errors: [] };
  const o = accountsFor(s(a["company"]), from), nw = accountsFor(s(a["company"]), to);
  const cost = r2(assetInternals.costOf(a)), acc = assetInternals.liveSchedules(a.name).length ? accumulated(a.name) : r2(n(a["opening_accumulated_depreciation"]));
  const lines: CategoryPlan["lines"] = [];
  if (o.fixed !== nw.fixed && cost) lines.push({ account: nw.fixed, debit: cost, credit: 0 }, { account: o.fixed, debit: 0, credit: cost });
  if (o.accumulated !== nw.accumulated && acc) lines.push({ account: o.accumulated, debit: acc, credit: 0 }, { account: nw.accumulated, debit: 0, credit: acc });
  return { errors: [], from, to, cost, accumulated: acc, lines };
}
/** Change an asset's category as one action: one journal entry moves the balances (when the accounts differ), then the category is set. */
export function changeCategory(asset: string, to: string, date: string, reason: string, user = currentUser()): Res<{ journal?: string }> {
  const a = adapter.get("Asset", asset); if (!a) return fail("Asset not found.", "الأصل غير موجود.");
  if (!may("Asset", "write", user, a)) return fail("You may not change this asset.", "لا يحق لك تعديل هذا الأصل.");
  if (!reason.trim()) return fail("Say why the category changes.", "اذكر سبب تغيير الفئة.");
  const p = categoryChangePlan(asset, to); if (p.errors.length) return { ok: false, reason: p.errors[0]! };
  let journal: string | undefined;
  if (p.lines.length) {
    if (!may("Journal Entry", "submit", user)) return fail("Moving the balances needs a user who may submit journal entries.", "نقل الأرصدة يحتاج مستخدمًا يحق له اعتماد القيود.");
    const ref = { reference_type: "Asset", reference_name: asset, cost_center: a["cost_center"] ?? "" };
    try { journal = assetInternals.je(a["company"], date || today(), `Asset category change ${asset}: ${p.from} → ${to}`, p.lines.map((l) => ({ ...l, ...ref })), { voucher_type: "Journal Entry" }); }
    catch (x) { return { ok: false, reason: [(x as Error).message, (x as Error).message] }; }
  }
  adapter.update("Asset", asset, { asset_category: to });
  comment("Asset", asset, user, `Category changed from ${p.from} to ${to}${journal ? ` (${journal})` : ""} — ${reason}`);
  return { ok: true, ...(journal ? { journal } : {}) };
}

/* ------------------------------------------------------------------ impairment ------------------------------------------------------------------ */
/** Impairment loss account: an expense account named for impairment, else the category's depreciation expense account. */
export function impairmentAccount(company: string, category = ""): string {
  const x = adapter.list("Account").find((a) => s(a["company"]) === company && !n(a["is_group"]) && s(a["root_type"]) === "Expense" && /impairment|انخفاض القيمة|اضمحلال/i.test(`${s(a["account_name"])} ${a.name}`));
  return x?.name ?? accountsFor(company, category).expense;
}
export function impairmentFill(d: Doc): Doc {
  const a = adapter.get("Asset", s(d["asset"])); if (!a) return d;
  const book = n(a.docstatus) === 1 ? bookValue(a.name) : r2(assetInternals.costOf(a)); const rec = d["recoverable_amount"] === undefined || d["recoverable_amount"] === "" ? undefined : n(d["recoverable_amount"]);
  return { ...d, company: d["company"] || a["company"], book_value: book, impairment_loss: rec === undefined ? 0 : r2(Math.max(book - rec, 0)), impairment_account: d["impairment_account"] || impairmentAccount(s(a["company"]), s(a["asset_category"])), impairment_date: d["impairment_date"] || today() };
}
export function impairmentErrors(d: Doc): string[] {
  const a = adapter.get("Asset", s(d["asset"])); if (!a) return ["Asset is mandatory"];
  const e: string[] = [];
  if (!liveAsset(a)) e.push(`Asset ${a.name} must be submitted and in use`);
  if (d["company"] && s(a["company"]) !== s(d["company"])) e.push(`Asset ${a.name} does not belong to company ${d["company"]}`);
  if (d["recoverable_amount"] === undefined || d["recoverable_amount"] === "" || n(d["recoverable_amount"]) < 0) e.push("Recoverable Amount is mandatory and cannot be negative");
  else if (liveAsset(a) && !(bookValue(a.name) - n(d["recoverable_amount"]) > 0.005)) e.push(`The recoverable amount ${n(d["recoverable_amount"])} is not below the book value ${bookValue(a.name)}: there is no impairment to book`);
  const acc = adapter.get("Account", s(d["impairment_account"]));
  if (!acc) e.push("Impairment Loss Account is mandatory"); else if (s(acc["root_type"]) !== "Expense" || n(acc["is_group"])) e.push(`Impairment Loss Account ${acc.name} must be a ledger expense account`);
  return e;
}
function bookImpairment(name: string) {
  const d = adapter.get(CORE_DT.assetImpairment, name)!; const a = adapter.get("Asset", s(d["asset"]))!;
  const ava = adapter.insertDoc("Asset Value Adjustment", { company: a["company"], asset: a.name, asset_category: a["asset_category"], date: d["impairment_date"], new_asset_value: n(d["recoverable_amount"]), difference_account: d["impairment_account"], cost_center: a["cost_center"] ?? "", docstatus: 0 });
  const errs = submit("Asset Value Adjustment", ava.name); if (errs.length) throw new Error(errs.join("; "));
  const v = adapter.get("Asset Value Adjustment", ava.name)!;
  adapter.update(CORE_DT.assetImpairment, name, { value_adjustment: ava.name, journal_entry: v["journal_entry"] ?? "", impairment_loss: r2(-n(v["difference_amount"])), book_value: n(v["current_asset_value"]) });
}

/* ------------------------------------------------------------------ capital work in progress ------------------------------------------------------------------ */
/** CWIP account: the category's account row, else the company default, else the company's Capital Work in Progress ledger. */
export function cwipAccount(company: string, category = ""): string {
  const row = rows(adapter.get("Asset Category", category), "accounts").find((r) => s(r["company_name"]) === company);
  return s(row?.["capital_work_in_progress_account"]) || s(adapter.get("Company", company)?.["capital_work_in_progress_account"]) ||
    (adapter.list("Account").find((a) => s(a["company"]) === company && !n(a["is_group"]) && s(a["account_type"]) === "Capital Work in Progress")?.name ?? "");
}
export const cwipEnabled = (category: string) => !!n(adapter.get("Asset Category", category)?.["enable_cwip_accounting"]);
const itemCategory = (r: Doc) => s(r["asset_category"]) || s(adapter.get("Item", s(r["item_code"]))?.["asset_category"]);
/** Purchase invoice lines for fixed-asset items book to work in progress (CWIP categories) or straight to the fixed asset account. */
export function withAssetAccounts(dt: string, d: Doc): Doc {
  if (n(d.docstatus) !== 0) return d; let changed = false;
  const items = rows(d, "items").map((r) => {
    const it = adapter.get("Item", s(r["item_code"])); if (!n(it?.["is_fixed_asset"]) && !n(r["is_fixed_asset"])) return r;
    const cat = itemCategory(r); if (!cat) return r;
    const acc = cwipEnabled(cat) ? cwipAccount(s(d["company"]), cat) : accountsFor(s(d["company"]), cat).fixed;
    if (!acc || s(r["expense_account"]) === acc) return r; changed = true;
    return { ...r, is_fixed_asset: 1, asset_category: cat, expense_account: acc };
  });
  return changed ? { ...d, items } : d;
}
export interface CwipLine { invoice: string; idx: number; item: string; itemName: string; amount: number; date: string; asset?: Doc }
/** Work in progress: the CWIP ledger balance and every invoice line booked to it with the asset that will take it out. */
export function cwipQueue(company: string): { account: string; balance: number; lines: CwipLine[]; awaiting: Doc[] } {
  const accounts = new Set([cwipAccount(company), ...adapter.list("Asset Category").map((c) => cwipAccount(company, c.name))].filter(Boolean));
  const balance = r2(adapter.list("GL Entry").filter((g) => s(g["company"]) === company && !n(g["is_cancelled"]) && accounts.has(s(g["account"]))).reduce((t, g) => t + n(g["debit"]) - n(g["credit"]), 0));
  const assets = adapter.list("Asset").filter((a) => s(a["company"]) === company && n(a.docstatus) !== 2);
  const lines: CwipLine[] = [];
  for (const pi of adapter.list("Purchase Invoice").filter((p) => s(p["company"]) === company && n(p.docstatus) === 1)) for (const r of rows(pi, "items")) {
    if (!accounts.has(s(r["expense_account"]))) continue;
    const asset = assets.find((a) => s(a["purchase_invoice"]) === pi.name && s(a["item_code"]) === s(r["item_code"]));
    lines.push({ invoice: pi.name, idx: n(r["idx"]), item: s(r["item_code"]), itemName: s(r["item_name"]) || s(r["item_code"]), amount: r2(n(r["base_net_amount"] ?? r["net_amount"] ?? r["amount"])), date: s(pi["posting_date"]), ...(asset ? { asset } : {}) });
  }
  const awaiting = assets.filter((a) => cwipEnabled(s(a["asset_category"])) && !n(a["booked_fixed_asset"]) && n(a.docstatus) === 0);
  return { account: [...accounts][0] ?? "", balance, lines: lines.sort((a, b) => b.date.localeCompare(a.date)), awaiting };
}
/** A draft asset for an invoice line on work in progress, ready to be capitalised. */
export function assetFromCwip(invoice: string, idx: number, user = currentUser(), location = ""): Res<{ name: string }> {
  const pi = adapter.get("Purchase Invoice", invoice); const r = rows(pi, "items").find((x) => n(x["idx"]) === idx);
  if (!pi || !r) return fail("Invoice line not found.", "سطر الفاتورة غير موجود.");
  if (!may("Asset", "create", user)) return fail("You may not create assets.", "لا يحق لك إنشاء الأصول.");
  if (adapter.list("Asset").some((a) => n(a.docstatus) !== 2 && s(a["purchase_invoice"]) === invoice && s(a["item_code"]) === s(r["item_code"]))) return fail("An asset already exists for this invoice line.", "يوجد أصل لسطر الفاتورة هذا.");
  const cat = itemCategory(r); const amount = r2(n(r["base_net_amount"] ?? r["net_amount"] ?? r["amount"]));
  const draft = withCategoryBooks({ company: pi["company"], item_code: r["item_code"], item_name: r["item_name"] ?? r["item_code"], asset_name: s(r["item_name"]) || s(r["item_code"]), asset_category: cat,
    purchase_invoice: invoice, purchase_invoice_item: s(r["name"] ?? ""), purchase_date: pi["posting_date"], available_for_use_date: pi["posting_date"], gross_purchase_amount: amount, net_purchase_amount: amount, purchase_amount: amount,
    asset_quantity: n(r["qty"]) || 1, location: location || "", status: "Draft", docstatus: 0, owner: user, calculate_depreciation: categoryBooks(cat).length ? 1 : 0 } as unknown as Doc);
  const d = adapter.insertDoc("Asset", draft);
  return { ok: true, name: d.name };
}
function bookCwip(name: string) {
  const a = adapter.get("Asset", name)!; const acc = assetAccounts(a); const cw = cwipAccount(s(a["company"]), s(a["asset_category"])); const amt = r2(assetInternals.costOf(a));
  const je = assetInternals.je(a["company"], s(a["available_for_use_date"]) || s(a["purchase_date"]) || today(), `Capitalisation of ${name} from work in progress`,
    [{ account: acc.fixed, debit: amt, reference_type: "Asset", reference_name: name, cost_center: a["cost_center"] ?? "" }, { account: cw, credit: amt, reference_type: "Asset", reference_name: name, cost_center: a["cost_center"] ?? "" }], { voucher_type: "Journal Entry" });
  adapter.update("Asset", name, { booked_fixed_asset: 1, __cwip_journal: je });
}
export function cwipErrors(a: Doc): string[] {
  const cat = s(a["asset_category"]); if (!cwipEnabled(cat) || n(a["booked_fixed_asset"]) || (!s(a["purchase_invoice"]) && !s(a["purchase_receipt"]))) return [];
  if (!cwipAccount(s(a["company"]), cat)) return [`Please set the Capital Work in Progress account in Asset Category ${cat} or Company ${s(a["company"])}`];
  if (!(assetInternals.costOf(a) > 0)) return ["Gross Purchase Amount is mandatory to capitalise work in progress"];
  return [];
}

/* ------------------------------------------------------------------ hooks ------------------------------------------------------------------ */
let hooked = false;
export function registerAssetControlHooks() {
  if (hooked) return; hooked = true;
  registerDocHook("Asset Movement", (doc, before) => {
    if (n(doc.docstatus) !== 1 || n(before?.docstatus) === 1) return { doc };
    const e = custodyErrors(doc); return e.length ? { doc, errors: e } : { doc };
  });
  registerDocHook("Asset", (doc, before) => {
    const from = n(before?.docstatus), to = n(doc.docstatus);
    if (to === 0) return { doc: withCategoryBooks(doc) };
    if (from === 0 && to === 1) { const e = cwipErrors(doc); if (e.length) return { doc, errors: e }; const need = cwipEnabled(s(doc["asset_category"])) && !n(doc["booked_fixed_asset"]) && (!!s(doc["purchase_invoice"]) || !!s(doc["purchase_receipt"]));
      return need ? { doc, after: (x) => { if (!n(adapter.get("Asset", x.name)?.["booked_fixed_asset"])) bookCwip(x.name); } } : { doc }; }
    if (from === 1 && to === 2 && s(doc["__cwip_journal"])) return { doc, after: (x) => { const je = s(adapter.get("Asset", x.name)?.["__cwip_journal"]); if (je && n(adapter.get("Journal Entry", je)?.docstatus) === 1) cancel("Journal Entry", je); adapter.update("Asset", x.name, { booked_fixed_asset: 0 }); } };
    return { doc };
  });
  for (const dt of ["Purchase Invoice", "Purchase Receipt"]) registerDocHook(dt, (doc) => ({ doc: withAssetAccounts(dt, doc) }));
  registerDocHook(CORE_DT.assetImpairment, (doc, before) => {
    const from = n(before?.docstatus), to = n(doc.docstatus);
    if (to === 0) return { doc: impairmentFill(doc) };
    if (from === 0 && to === 1) { const d = impairmentFill(doc); const e = impairmentErrors(d); return e.length ? { doc: d, errors: e } : { doc: d, after: (x) => { if (!s(adapter.get(CORE_DT.assetImpairment, x.name)?.["value_adjustment"])) bookImpairment(x.name); } }; }
    if (from === 1 && to === 2) return { doc, after: (x) => { const v = s(adapter.get(CORE_DT.assetImpairment, x.name)?.["value_adjustment"]); if (v && n(adapter.get("Asset Value Adjustment", v)?.docstatus) === 1) { const e = cancel("Asset Value Adjustment", v); if (e.length) throw new Error(e.join("; ")); } } };
    return { doc };
  });
}
