/**
 * DIGIT CRM C4 deal desk (owner 2026-11-17): read models and writes behind the deal record (D-01 … D-10). Native objects
 * stay the owners — CRM Deal (stage, value, products, contacts), Quotation → Sales Order → Sales Invoice → Payment Entry
 * keep their own lifecycle; this module only reads the chain and writes the deal.
 *  - stage gate: the fields a stage needs (leadRules custom_stage_requirements, cumulative up to the target stage)
 *  - win / lose: loss needs a reason and the competitor (or «no competitor»)
 *  - summary: value, probability (stage default unless overridden), weighted, close (red when past), forecast category
 *  - products: net total = deal value unless the value was typed by hand («القيمة يدوية»); VAT from the company's sales template
 *  - buying committee: CRM Contacts rows carry custom_role (decision / influencer / user / finance)
 *  - documents chain amounts need the finance permission (salesDesk.canSeeFinance)
 */
import { adapter, type Doc } from "@/lib/adapter";
import { scopedList } from "@/lib/scope";
import { canUseCrm, isManager, OPEN_TASK } from "./wf01";
import { dealStages, dealStatusType, dealValue, moveDeal, scopedDeals } from "./wf02";
import { handoffCompany, quotationsOf } from "./wf03";
import { FORECAST_CATS } from "./wf05";
import { canSeeFinance, crmRules } from "./salesDesk";
import { leadRules, STAGE_NEED_LABEL, type StageNeed } from "./leadRules";
import { lastActivityAt, type Msg, type Res } from "./leadDesk";

const s = (v: unknown) => String(v ?? "");
const kids = (v: unknown) => (Array.isArray(v) ? v as Doc[] : []);
const daysSince = (v: unknown, now = Date.now()) => { const t = Date.parse(s(v)); return Number.isFinite(t) ? Math.max(0, Math.floor((now - t) / 864e5)) : null; };
const pad = (n: number) => String(n).padStart(2, "0");
const localDay = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fail = (en: string, ar: string, errors?: Record<string, Msg>): { ok: false; error: Msg; errors?: Record<string, Msg> } => ({ ok: false, error: [en, ar], ...(errors ? { errors } : {}) });
const canEdit = (d: Doc, user: string) => canUseCrm(user) && (isManager(user) || d["deal_owner"] === user);
export const dealTitle = (d: Doc) => s(d["custom_deal_name"]) || s(d["organization"]) || s(d["lead_name"]) || d.name;

/* ------------------------------------------------------------------ summary (D-03) ------------------------------------------------------------------ */
export const FORECAST_AR: Record<string, string> = { commit: "مؤكد", best: "أفضل حالة", pipeline: "قيد المتابعة", closed: "مغلق — ربح", omitted: "مستبعد" };
export const FORECAST_EN: Record<string, string> = { commit: "Commit", best: "Best case", pipeline: "Pipeline", closed: "Closed won", omitted: "Omitted" };
export function stageProb(stage: unknown) { return Number(adapter.get("CRM Deal Status", s(stage))?.["probability"] ?? 0); }
export interface DealSummary { value: number; currency: string; prob: number; stageProb: number; probOwn: boolean; weighted: number; close: string; closeLate: boolean; forecast: string; forecastOwn: boolean; source: string; ageDays: number | null; lastAt: string; lastAge: number | null; open: boolean; type: string }
export function dealSummary(d: Doc, now = new Date()): DealSummary {
  const type = dealStatusType(d["status"]), open = !["Won", "Lost"].includes(type), sp = stageProb(d["status"]);
  const own = s(d["custom_probability_override"]) === "1";
  const prob = own ? Number(d["probability"] ?? sp) : sp, value = dealValue(d), close = s(d["expected_closure_date"]).slice(0, 10);
  const auto = type === "Won" ? "closed" : type === "Lost" ? "omitted" : FORECAST_CATS.find((c) => c.test(prob))?.id ?? "pipeline";
  const fc = s(d["custom_forecast_category"]); const lastAt = lastActivityAt("CRM Deal", d.name, now.getTime());
  return { value, currency: s(d["currency"]) || "SAR", prob, stageProb: sp, probOwn: own, weighted: Math.round(value * prob) / 100, close, closeLate: open && !!close && close < localDay(now),
    forecast: open && fc && FORECAST_EN[fc] ? fc : auto, forecastOwn: open && !!fc && !!FORECAST_EN[fc], source: s(d["source"]), ageDays: daysSince(d["creation"], now.getTime()), lastAt, lastAge: daysSince(lastAt, now.getTime()), open, type };
}
export function setDealProbability(name: string, prob: number | null, user: string): Res {
  const d = adapter.get("CRM Deal", name); if (!d || !canEdit(d, user)) return fail("Not permitted", "غير مسموح");
  if (prob === null) { adapter.update("CRM Deal", name, { probability: stageProb(d["status"]), custom_probability_override: 0 }); return { ok: true, name }; }
  if (!(prob >= 0 && prob <= 100)) return fail("Probability is between 0 and 100", "الاحتمالية بين 0 و100");
  adapter.update("CRM Deal", name, { probability: Math.round(prob), custom_probability_override: 1 }); return { ok: true, name };
}
export function setForecast(name: string, cat: string, user: string): Res {
  const d = adapter.get("CRM Deal", name); if (!d || !canEdit(d, user)) return fail("Not permitted", "غير مسموح");
  if (cat && !["commit", "best", "pipeline"].includes(cat)) return fail("Pick Commit, Best case or Pipeline", "اختر مؤكد أو أفضل حالة أو قيد المتابعة");
  adapter.update("CRM Deal", name, { custom_forecast_category: cat }); return { ok: true, name };
}
export const DEAL_EDITABLE = ["custom_deal_name", "deal_value", "expected_closure_date", "next_step", "source", "territory", "industry", "no_of_employees", "website", "custom_pipeline"] as const;
export function updateDealField(name: string, field: string, value: string, user: string): Res<{ name: string; before: unknown }> {
  const d = adapter.get("CRM Deal", name); if (!d || !canEdit(d, user)) return fail("Not permitted", "غير مسموح");
  if (!(DEAL_EDITABLE as readonly string[]).includes(field)) return fail("This field is not editable here", "هذا الحقل لا يُعدّل هنا");
  if (!["Open", "Ongoing"].includes(dealStatusType(d["status"])) && field !== "next_step") return fail("A won or lost deal is read-only", "الصفقة الرابحة أو الخاسرة للقراءة فقط");
  let out: unknown = value.trim();
  if (field === "deal_value") { const n = Number(value || 0); if (!(n >= 0)) return fail("Enter an amount of zero or more", "أدخل مبلغًا صفرًا أو أكثر"); out = n; }
  if (field === "expected_closure_date" && value && !/^\d{4}-\d{2}-\d{2}$/.test(value)) return fail("Pick a date", "اختر تاريخًا");
  const before = d[field]; adapter.update("CRM Deal", name, { [field]: out, ...(field === "deal_value" ? { expected_deal_value: out } : {}) });
  return { ok: true, name, before };
}

/* ------------------------------------------------------------------ products (D-04) ------------------------------------------------------------------ */
export function vatRate(): number {
  const co = handoffCompany();
  const t = adapter.list("Sales Taxes and Charges Template").find((x) => x["company"] === co && Number(x["is_default"])) ?? adapter.list("Sales Taxes and Charges Template").find((x) => /15%/.test(s(x.name)));
  const r = kids(t?.["taxes"]).reduce((a, x) => a + (Number(x["rate"]) || 0), 0);
  return r > 0 ? r : 15;
}
export function productTotals(d: Doc) {
  const rows = kids(d["products"]); const net = rows.length ? Number(d["net_total"] ?? rows.reduce((a, p) => a + (Number(p["net_amount"] ?? p["amount"]) || 0), 0)) : 0;
  const rate = vatRate(), vat = Math.round(net * rate) / 100, value = dealValue(d);
  return { rows, net, rate, vat, gross: Math.round((net + vat) * 100) / 100, value, manual: rows.length > 0 && Math.abs(value - net) > 0.5 };
}
/** «القيمة يدوية» → back to the products total. */
export function syncDealValue(name: string, user: string): Res {
  const d = adapter.get("CRM Deal", name); if (!d || !canEdit(d, user)) return fail("Not permitted", "غير مسموح");
  const t = productTotals(d); if (!t.rows.length) return fail("Add products first", "أضف المنتجات أولًا");
  adapter.update("CRM Deal", name, { deal_value: t.net, expected_deal_value: t.net }); return { ok: true, name };
}

/* ------------------------------------------------------------------ contacts with roles (D-05) ------------------------------------------------------------------ */
export const ROLES = [["decision", "Decision maker", "صاحب القرار"], ["influencer", "Influencer", "مؤثر"], ["user", "User", "مستخدم"], ["finance", "Finance", "مالي"]] as const;
export type RoleKey = (typeof ROLES)[number][0];
export function dealContacts(d: Doc) {
  return kids(d["contacts"]).map((r) => { const c = adapter.get("Contact", s(r["contact"])); return { row: r, contact: s(r["contact"]), name: s(r["full_name"]) || s(c?.["full_name"]) || [c?.["first_name"], c?.["last_name"]].filter(Boolean).join(" ") || s(r["contact"]), role: s(r["custom_role"]), primary: !!Number(r["is_primary"]), email: s(r["email"] || c?.["email_id"]), mobile: s(r["mobile_no"] || c?.["mobile_no"]), title: s(c?.["designation"]) }; });
}
export function committee(d: Doc) { const cs = dealContacts(d); return ROLES.map(([k, en, ar]) => ({ key: k, en, ar, names: cs.filter((c) => c.role === k).map((c) => c.name) })); }
export function addDealContact(name: string, contact: string, role: string, user: string): Res {
  const d = adapter.get("CRM Deal", name); if (!d || !canEdit(d, user)) return fail("Not permitted", "غير مسموح");
  if (!adapter.get("Contact", contact)) return fail("Pick a contact", "اختر جهة اتصال");
  if (role && !ROLES.some(([k]) => k === role)) return fail("Pick a role", "اختر دورًا");
  const rows: Record<string, unknown>[] = kids(d["contacts"]).map((r) => ({ ...r }));
  if (rows.some((r) => r["contact"] === contact)) return fail("Already on the deal", "موجودة في الصفقة مسبقًا");
  rows.push({ contact, is_primary: rows.length ? 0 : 1, custom_role: role });
  adapter.update("CRM Deal", name, { contacts: rows, ...(rows.length === 1 ? { contact } : {}) }); return { ok: true, name };
}
export function setContactRole(name: string, contact: string, role: string, user: string): Res {
  const d = adapter.get("CRM Deal", name); if (!d || !canEdit(d, user)) return fail("Not permitted", "غير مسموح");
  if (role && !ROLES.some(([k]) => k === role)) return fail("Pick a role", "اختر دورًا");
  const rows: Record<string, unknown>[] = kids(d["contacts"]).map((r) => (r["contact"] === contact ? { ...r, custom_role: role } : { ...r }));
  if (!rows.some((r) => r["contact"] === contact)) return fail("Contact not on the deal", "جهة الاتصال ليست في الصفقة");
  adapter.update("CRM Deal", name, { contacts: rows }); return { ok: true, name };
}

/* ------------------------------------------------------------------ documents chain (D-06) ------------------------------------------------------------------ */
export interface ChainDocRow { dt: string; name: string; status: string; tone: "ok" | "warn" | "bad" | "info" | "neutral"; amount: number | null; currency: string; date: string }
const ds = (x: Doc) => Number(x["docstatus"]);
export function dealChain(d: Doc, user: string, now = new Date(), read: (dt: string, user: string) => Doc[] = scopedList) {
  const fin = canSeeFinance(user), today = localDay(now);
  const amt = (x: Doc, f = "grand_total") => (fin ? Number(x[f] ?? 0) : null);
  const qs = quotationsOf(d.name).filter((q) => read("Quotation", user).some((x) => x.name === q.name));
  const qn = new Set(qs.filter((q) => ds(q) === 1).map((q) => q.name));
  const sos = read("Sales Order", user).filter((o) => ds(o) !== 2 && kids(o["items"]).some((i) => qn.has(s(i["prevdoc_docname"]))));
  const on = new Set(sos.filter((o) => ds(o) === 1).map((o) => o.name));
  const sis = read("Sales Invoice", user).filter((x) => ds(x) !== 2 && !Number(x["is_return"]) && kids(x["items"]).some((i) => on.has(s(i["sales_order"]))));
  const sn = new Set(sis.filter((x) => ds(x) === 1).map((x) => x.name));
  const pes = read("Payment Entry", user).filter((p) => ds(p) === 1 && kids(p["references"]).some((r) => sn.has(s(r["reference_name"]))));
  const st = (x: Doc): [string, ChainDocRow["tone"]] => ds(x) === 0 ? ["Draft", "neutral"] : ds(x) === 2 ? ["Cancelled", "bad"] : ["Submitted", "info"];
  const inv = (x: Doc): [string, ChainDocRow["tone"]] => { if (ds(x) === 0) return ["Draft", "neutral"]; const out = Number(x["outstanding_amount"] ?? 0); return out <= 0.005 ? ["Paid", "ok"] : s(x["due_date"]) && s(x["due_date"]) < today ? ["Overdue", "bad"] : ["Unpaid", "warn"]; };
  const row = (dt: string, x: Doc, [status, tone]: [string, ChainDocRow["tone"]], f = "grand_total", date = "transaction_date"): ChainDocRow => ({ dt, name: x.name, status, tone, amount: amt(x, f), currency: s(x["currency"] || x["paid_to_account_currency"]) || "SAR", date: s(x[date] || x["posting_date"]).slice(0, 10) });
  return { finance: fin,
    quotes: qs.map((q) => row("Quotation", q, ds(q) === 1 ? ["Sent", "info"] : st(q))),
    orders: sos.map((o) => row("Sales Order", o, st(o))),
    invoices: sis.map((x) => row("Sales Invoice", x, inv(x), "grand_total", "posting_date")),
    payments: pes.map((p) => row("Payment Entry", p, ["Received", "ok"], "paid_amount", "posting_date")) };
}
export const quoteSent = (d: Doc) => quotationsOf(d.name).some((q) => ds(q) === 1);

/* ------------------------------------------------------------------ stage gate, win / lose (D-01 / D-02) ------------------------------------------------------------------ */
export function needMet(d: Doc, n: StageNeed): boolean {
  switch (n) {
    case "value": return dealValue(d) > 0;
    case "products": return kids(d["products"]).length > 0;
    case "close_date": return !!s(d["expected_closure_date"]);
    case "contact": return !!d["contact"] || kids(d["contacts"]).length > 0;
    case "decision_maker": return kids(d["contacts"]).some((r) => r["custom_role"] === "decision");
    case "quote_sent": return quoteSent(d);
    case "next_step": return adapter.list("CRM Task").some((t) => t["reference_doctype"] === "CRM Deal" && t["reference_docname"] === d.name && OPEN_TASK.includes(s(t["status"])));
  }
}
/** Needs of every open stage up to the target (and the target itself), so skipping a stage never skips its requirement. */
export function stageNeeds(to: string): StageNeed[] {
  const R = leadRules().stages.needs, order = dealStages(), ti = order.findIndex((x) => x.name === to); const out = new Set<StageNeed>();
  order.forEach((st, i) => { if (i <= ti && (st.name === to || !["Won", "Lost"].includes(s(st["type"])))) for (const n of R[st.name] ?? []) out.add(n); });
  return [...out];
}
export function stageGate(d: Doc, to: string) { const needs = stageNeeds(to); return { needs, missing: needs.filter((n) => !needMet(d, n)), mode: leadRules().stages.mode }; }
export const needLabel = (n: StageNeed, ar: boolean) => STAGE_NEED_LABEL[n][ar ? 1 : 0];
export interface StageFill { value?: number | undefined; close?: string | undefined }
export function moveDealGated(name: string, to: string, user: string, fill: StageFill = {}, lost?: { reason: string; competitor: string; notes?: string | undefined }): Res<{ name: string; warned: StageNeed[] }> {
  const d0 = adapter.get("CRM Deal", name); if (!d0 || !scopedDeals(user).some((x) => x.name === name) || !canEdit(d0, user)) return fail("Not permitted", "غير مسموح");
  const st = adapter.get("CRM Deal Status", to); if (!st) return fail("Unknown stage", "مرحلة غير معروفة");
  const patch: Record<string, unknown> = {};
  if (fill.value !== undefined) { if (!(fill.value > 0)) return fail("Enter the deal value", "أدخل قيمة الصفقة", { value: ["Enter an amount above zero", "أدخل مبلغًا أكبر من صفر"] }); patch["deal_value"] = fill.value; patch["expected_deal_value"] = fill.value; }
  if (fill.close !== undefined) { if (!/^\d{4}-\d{2}-\d{2}$/.test(fill.close)) return fail("Pick the expected close date", "اختر تاريخ الإغلاق المتوقع", { close: ["Pick a date", "اختر تاريخًا"] }); patch["expected_closure_date"] = fill.close; }
  if (Object.keys(patch).length) adapter.update("CRM Deal", name, patch);
  const d = adapter.get("CRM Deal", name)!;
  if (s(st["type"]) === "Lost") {
    if (!lost?.reason) return fail("Pick the loss reason", "اختر سبب الخسارة", { reason: ["The loss reason is required", "سبب الخسارة مطلوب"] });
    if (!lost.competitor.trim()) return fail("Name the competitor (or «No competitor»)", "اذكر المنافس (أو «لا يوجد منافس»)", { competitor: ["The competitor is required", "المنافس مطلوب"] });
    const r = moveDeal(name, to, user, { reason: lost.reason, ...(lost.notes ? { notes: lost.notes } : {}) });
    if (!r.ok) return fail(r.error, r.error === "Lost reason is required" ? "سبب الخسارة مطلوب" : "تعذّر نقل الصفقة");
    adapter.update("CRM Deal", name, { custom_competitor: lost.competitor.trim() }); return { ok: true, name, warned: [] };
  }
  const g = stageGate(d, to);
  if (g.missing.length && g.mode === "block") return fail(`Before ${to}: ${g.missing.map((n) => needLabel(n, false)).join(", ")}`, `قبل الانتقال: ${g.missing.map((n) => needLabel(n, true)).join("، ")}`, Object.fromEntries(g.missing.map((n) => [n, STAGE_NEED_LABEL[n]])) as Record<string, Msg>);
  const r = moveDeal(name, to, user); if (!r.ok) return fail(r.error, "تعذّر نقل الصفقة");
  if (s(d["custom_probability_override"]) === "1") adapter.update("CRM Deal", name, { custom_probability_override: 0 });
  return { ok: true, name, warned: g.missing };
}
export const wonStage = () => dealStages().find((x) => x["type"] === "Won")?.name ?? "Won";
export const lostStage = () => dealStages().find((x) => x["type"] === "Lost")?.name ?? "Lost";
export const lostReasons = () => adapter.list("CRM Lost Reason").map((r) => r.name);
export const LOST_AR: Record<string, string> = { Pricing: "السعر", Competition: "المنافسة", "Budget Constraints": "قيود الميزانية", "Missing Features": "ميزات غير متوفرة", "Long Sales Cycle": "دورة بيع طويلة", "No Decision-Maker": "لا يوجد صاحب قرار", "Unresponsive Prospect": "العميل لا يستجيب", "Poor Fit": "عدم ملاءمة", Other: "أخرى" };
export const competitorsSeen = () => [...new Set(adapter.list("CRM Deal").map((d) => s(d["custom_competitor"]).trim()).filter((x) => x && x !== "None"))].sort();

/* ------------------------------------------------------------------ focus block (D-08) ------------------------------------------------------------------ */
export function dealFocus(d: Doc, now = new Date()) {
  const tasks = adapter.list("CRM Task").filter((t) => t["reference_doctype"] === "CRM Deal" && t["reference_docname"] === d.name && OPEN_TASK.includes(s(t["status"])));
  const sorted = [...tasks].sort((a, b) => s(a["due_date"] || "9").localeCompare(s(b["due_date"] || "9")));
  const tnow = now.getTime(); const overdue = sorted.filter((t) => { const x = Date.parse(s(t["due_date"]).replace(" ", "T")); return Number.isFinite(x) && x < tnow; });
  const sm = dealSummary(d, now);
  return { next: sorted[0], overdue, stale: sm.open && sm.lastAge !== null && sm.lastAge >= crmRules().inactivityDays ? sm.lastAge : null, summary: sm };
}

/* ------------------------------------------------------------------ header actions (D-01 ⋯) ------------------------------------------------------------------ */
export function setDealOwner(name: string, owner: string, user: string): Res {
  const d = adapter.get("CRM Deal", name); if (!d) return fail("Not found", "غير موجود");
  if (!isManager(user)) return fail("Only a Sales Manager can change the owner", "تغيير المالك لمدير المبيعات فقط");
  if (!adapter.get("User", owner)) return fail("Pick a sales user", "اختر مستخدم مبيعات");
  adapter.update("CRM Deal", name, { deal_owner: owner }); return { ok: true, name };
}
export function setArchived(dt: "CRM Lead" | "CRM Deal", name: string, on: boolean, user: string): Res {
  const d = adapter.get(dt, name); if (!d || !canUseCrm(user)) return fail("Not permitted", "غير مسموح");
  if (dt === "CRM Deal" && !canEdit(d, user)) return fail("Not permitted", "غير مسموح");
  adapter.update(dt, name, { custom_archived: on ? 1 : 0 }); return { ok: true, name };
}
/** «تكرار»: a new deal in the first open stage with the same company, contacts and products (no lead, no documents). */
export function duplicateDeal(name: string, user: string): Res {
  const d = adapter.get("CRM Deal", name); if (!d || !canUseCrm(user)) return fail("Not permitted", "غير مسموح");
  const first = dealStages().find((x) => !["Won", "Lost"].includes(s(x["type"])));
  const keep = ["organization", "currency", "source", "territory", "industry", "no_of_employees", "website", "email", "mobile_no", "contact", "custom_pipeline", "deal_value", "expected_deal_value", "digit_price_list"];
  const data: Record<string, unknown> = Object.fromEntries(keep.map((k) => [k, d[k] ?? ""]));
  const n = adapter.insertDoc("CRM Deal", { ...data, naming_series: "CRM-DEAL-.YYYY.-", custom_deal_name: `${dealTitle(d)} (2)`, status: first?.name ?? "Qualification", probability: Number(first?.["probability"] ?? 0), deal_owner: user,
    contacts: kids(d["contacts"]).map((r) => ({ contact: r["contact"], is_primary: r["is_primary"], custom_role: r["custom_role"] ?? "" })), products: kids(d["products"]).map((p) => ({ product_code: p["product_code"], product_name: p["product_name"], qty: p["qty"], rate: p["rate"], discount_percentage: p["discount_percentage"] ?? 0 })) });
  return { ok: true, name: n.name };
}
const DEAL_REFS: [string, string, string][] = [["CRM Task", "reference_doctype", "reference_docname"], ["FCRM Note", "reference_doctype", "reference_docname"], ["CRM Call Log", "reference_doctype", "reference_docname"], ["Communication", "reference_doctype", "reference_name"], ["Event", "reference_doctype", "reference_docname"], ["Comment", "reference_doctype", "reference_name"], ["File", "attached_to_doctype", "attached_to_name"]];
/** «دمج»: keeps this deal, adds the other deal's contacts and moves its activities and attachments, then removes it.
 *  A deal with quotations or a customer hand-off is never removed (its documents keep pointing at it). */
export function mergeDeals(keep: string, drop: string, user: string): Res {
  if (keep === drop) return fail("Pick another deal", "اختر صفقة أخرى");
  const a = adapter.get("CRM Deal", keep), b = adapter.get("CRM Deal", drop);
  if (!a || !b || !canEdit(a, user) || !canEdit(b, user)) return fail("Not permitted", "غير مسموح");
  if (quotationsOf(drop).length || adapter.list("Customer").some((c) => c["crm_deal"] === drop)) return fail("The other deal has quotations or a customer — keep it instead", "الصفقة الأخرى لها عروض أسعار أو عميل — احتفظ بها بدلًا منها");
  const rows: Record<string, unknown>[] = kids(a["contacts"]).map((r) => ({ ...r })); for (const r of kids(b["contacts"])) if (!rows.some((x) => x["contact"] === r["contact"])) rows.push({ ...r, is_primary: 0 });
  adapter.update("CRM Deal", keep, { contacts: rows });
  for (const [dt, rdt, rn] of DEAL_REFS) for (const x of adapter.list(dt)) if (x[rdt] === "CRM Deal" && x[rn] === drop) adapter.update(dt, x.name, { [rn]: keep, ...(dt === "Communication" ? { reference_docname: keep } : {}) });
  adapter.insertDoc("Comment", { comment_type: "Info", reference_doctype: "CRM Deal", reference_name: keep, comment_email: user, content: `Merged deal ${drop} (${dealTitle(b)}) into this deal` });
  adapter.remove("CRM Deal", drop); return { ok: true, name: keep };
}
export function dealCsv(d: Doc, ar: boolean) {
  const sm = dealSummary(d), t = productTotals(d);
  const rows: (string | number)[][] = [ar ? ["البند", "القيمة"] : ["Field", "Value"], [ar ? "الصفقة" : "Deal", d.name], [ar ? "الاسم" : "Name", dealTitle(d)], [ar ? "المرحلة" : "Stage", s(d["status"])], [ar ? "القيمة (SAR)" : "Value (SAR)", sm.value], [ar ? "الاحتمالية %" : "Probability %", sm.prob], [ar ? "المرجّحة (SAR)" : "Weighted (SAR)", sm.weighted], [ar ? "الإغلاق المتوقع" : "Expected close", sm.close], [ar ? "فئة التوقع" : "Forecast", ar ? FORECAST_AR[sm.forecast] ?? sm.forecast : FORECAST_EN[sm.forecast] ?? sm.forecast],
    ...t.rows.map((p) => [`${ar ? "منتج" : "Product"}: ${s(p["product_code"])}`, `${s(p["qty"])} × ${s(p["rate"])}`]), [ar ? "الصافي" : "Net", t.net], [ar ? `ضريبة ${t.rate}%` : `VAT ${t.rate}%`, t.vat], [ar ? "الإجمالي" : "Gross", t.gross]];
  return rows.map((r) => r.map((x) => { const v = String(x); return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v; }).join(",")).join("\n");
}
