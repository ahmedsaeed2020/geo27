/**
 * D8 Quick process (Acumatica "quick processing", owner gap list A14): a submitted Sales Order is delivered and invoiced,
 * a submitted Purchase Order received and billed, in ONE confirmed step. Every document is made by the same native
 * Create ▸ mapping (form_actions.json field_map through engines.mapDoc, remaining quantities only), totals by the source
 * taxes_and_totals rules (formRules.loadState), and saved / submitted through documentApi → posting.ts, so ledgers,
 * stock, outstanding and the order's delivered / billed percentages are written exactly as by hand. Lines delivered by
 * the supplier (drop-ship) never go on a delivery note. If any step is refused, everything this run submitted is
 * cancelled again and its drafts are removed, so a half-done chain never stays. Behind the `ent:quick-process` switch.
 */
import { adapter, type Doc } from "@/lib/adapter";
import { cachedMeta, TABLE_TYPES, type DocTypeMeta } from "@/lib/catalog";
import { cancelDocument, createDraft, saveDocument, submitDocument } from "@/lib/documentApi";
import { mapDoc, type FormAction } from "@/lib/engines";
import { loadState, type RuleMap } from "@/lib/formRules";
import { currentUser, hasPerm } from "@/lib/session";

type Bi = [string, string];
const s = (v: unknown) => String(v ?? "");
const n = (v: unknown) => Number(v) || 0;
const rows = (d: Doc | undefined, f = "items") => (Array.isArray(d?.[f]) ? (d![f] as Doc[]) : []);
const today = () => new Date().toISOString().slice(0, 10);

export const QUICK_FEATURE = "ent:quick-process";
/** Source order → the two documents quick process makes, in order (target, child table DocType, label). */
export const QUICK_CHAIN: Record<string, { target: string; child: string; label: Bi }[]> = {
  "Sales Order": [{ target: "Delivery Note", child: "Delivery Note Item", label: ["Deliver", "تسليم"] }, { target: "Sales Invoice", child: "Sales Invoice Item", label: ["Invoice", "فوترة"] }],
  "Purchase Order": [{ target: "Purchase Receipt", child: "Purchase Receipt Item", label: ["Receive", "استلام"] }, { target: "Purchase Invoice", child: "Purchase Invoice Item", label: ["Bill", "فاتورة المورد"] }],
};
const DONE_PCT: Record<string, [string, string]> = { "Sales Order": ["per_delivered", "per_billed"], "Purchase Order": ["per_received", "per_billed"] };

export interface QuickPlan { applicable: boolean; ok: boolean; steps: { target: string; label: Bi; allowed: boolean; lines: number }[]; reasons: Bi[] }

const metaOf = (dt: string) => cachedMeta(dt) as DocTypeMeta | undefined;
function childMetas(tm: DocTypeMeta): Record<string, DocTypeMeta> {
  const out: Record<string, DocTypeMeta> = {};
  for (const f of tm.fields.filter((x) => TABLE_TYPES.has(x.fieldtype) && x.options)) { const m = metaOf(f.options!); if (m) out[f.options!] = m; }
  return out;
}
function action(actions: Record<string, FormAction[]>, from: string, target: string): FormAction | undefined {
  const all = (actions[from] ?? []).filter((a) => a.target === target && a.field_map);
  return all.find((a) => a.group === "Create") ?? all.at(-1);
}
/** Lines still to deliver / receive (or bill) — drop-ship lines are delivered by the supplier, never by a delivery note. */
const openLines = (dt: string, d: Doc, step: number) => rows(d).filter((r) => {
  if (step === 0 && dt === "Sales Order" && n(r["delivered_by_supplier"])) return false;
  const done = step === 0 ? n(r[dt === "Sales Order" ? "delivered_qty" : "received_qty"]) : n(r["billed_amt"]) >= n(r["amount"]) - 0.005 ? n(r["qty"]) : 0;
  return n(r["qty"]) - done > 0.0001;
});

/** What quick process would do for this order and whether this user may do all of it. */
export function quickPlan(dt: string, d: Doc | undefined, user = currentUser()): QuickPlan {
  const chain = QUICK_CHAIN[dt]; const reasons: Bi[] = [];
  if (!chain || !d) return { applicable: false, ok: false, steps: [], reasons };
  const [p0] = DONE_PCT[dt]!;
  const status = s(d["status"]);
  const applicable = n(d["docstatus"]) === 1 && n(d[p0]) < 100 && !["Closed", "On Hold", "Completed", "Cancelled"].includes(status);
  if (!applicable) return { applicable: false, ok: false, steps: [], reasons };
  const steps = chain.map((c, i) => {
    const tm = metaOf(c.target);
    const allowed = !!tm && hasPerm(tm, "create", undefined, user) && hasPerm(tm, "submit", undefined, user);
    return { target: c.target, label: c.label, allowed, lines: openLines(dt, d, i).length };
  });
  for (const st of steps) if (!st.allowed) reasons.push([`You may not create and submit a ${st.target}.`, `لا يحق لك إنشاء واعتماد ${st.target}.`]);
  if (!steps[0]!.lines) reasons.push(["Nothing is left to deliver or receive on this order.", "لا يوجد ما يُسلَّم أو يُستلم في هذا الأمر."]);
  return { applicable, ok: !reasons.length, steps, reasons };
}

function fillTarget(target: string, src: Doc, mapped: Record<string, unknown>, rules: RuleMap | undefined): Record<string, unknown> {
  const co = adapter.get("Company", s(src["company"])); const ab = s(co?.["abbr"]);
  const date = today();
  const out: Record<string, unknown> = { ...mapped, company: src["company"], posting_date: date, set_posting_time: 1 };
  if (target === "Delivery Note" || target === "Purchase Receipt") out["items"] = rows(mapped as Doc).filter((r) => !(target === "Delivery Note" && n(r["delivered_by_supplier"])));
  if (target === "Sales Invoice") Object.assign(out, { debit_to: s(mapped["debit_to"]) || s(co?.["default_receivable_account"]) || `Debtors - ${ab}`, due_date: s(mapped["due_date"]) > date ? mapped["due_date"] : date });
  if (target === "Purchase Invoice") Object.assign(out, { credit_to: s(mapped["credit_to"]) || s(co?.["default_payable_account"]) || `Creditors - ${ab}`, due_date: s(mapped["due_date"]) > date ? mapped["due_date"] : date, bill_date: date });
  const st = loadState(rules?.[target], out as Doc);
  return st.doc as Record<string, unknown>;
}

export interface QuickResult { ok: boolean; created: { doctype: string; name: string }[]; errors: string[] }

/** Run the chain. `actions` = form_actions.json doctypes map, `rules` = form_rules.json doctypes map. */
export function runQuickProcess(dt: string, name: string, actions: Record<string, FormAction[]>, rules: RuleMap | undefined, user = currentUser()): QuickResult {
  const src0 = adapter.get(dt, name); const plan = quickPlan(dt, src0, user);
  if (!plan.applicable || !plan.ok) return { ok: false, created: [], errors: plan.reasons.length ? plan.reasons.map((r) => r[0]) : ["Quick process does not apply to this document."] };
  const created: { doctype: string; name: string; submitted: boolean }[] = [];
  const undo = () => {
    for (const c of [...created].reverse()) {
      const m = metaOf(c.doctype)!;
      if (c.submitted) cancelDocument(m, c.name, user); else adapter.remove(c.doctype, c.name);
    }
  };
  let from = dt, fromName = name;
  for (const step of QUICK_CHAIN[dt]!) {
    const sm = metaOf(from), tm = metaOf(step.target); const a = action(actions, from, step.target);
    if (!sm || !tm || !a) { undo(); return { ok: false, created: [], errors: [`The ${from} → ${step.target} mapping is not loaded.`] }; }
    const src = adapter.get(from, fromName)!;
    const mapped = fillTarget(step.target, src, mapDoc(sm, src, tm, childMetas(tm), a.field_map), rules);
    if (!rows(mapped as Doc).length) { undo(); return { ok: false, created: [], errors: [`Nothing to put on the ${step.target}.`] }; }
    const dr = createDraft(tm, { mapped });
    if (!dr.doc) { undo(); return { ok: false, created: [], errors: dr.errors }; }
    const saved = saveDocument(tm, dr.doc.name, {}, { user });
    if (saved.errors.length || !saved.name) { if (adapter.get(step.target, dr.doc.name)) adapter.remove(step.target, dr.doc.name); undo(); return { ok: false, created: [], errors: saved.errors }; }
    created.push({ doctype: step.target, name: saved.name, submitted: false });
    const errs = submitDocument(tm, saved.name, user);
    if (errs.length) { undo(); return { ok: false, created: [], errors: errs }; }
    created[created.length - 1]!.submitted = true;
    from = step.target; fromName = saved.name;
  }
  return { ok: true, created: created.map(({ doctype, name }) => ({ doctype, name })), errors: [] };
}
