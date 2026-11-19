/**
 * Blanket order close / re-open (ERPNext blanket_order.js Status ▸ Close / Re-open, owner gap list A38), for the whole
 * order or one line (the Core Check field `digit_row_closed` on Blanket Order Item). Orders made against a blanket order
 * are checked once here as adapter doc hooks on Sales Order / Purchase Order submit (port of
 * blanket_order.validate_against_blanket_order: closed or expired order, closed line, quantity above what is left plus
 * the Selling / Buying Settings allowance) and keep the line's ordered quantity current on submit and cancel
 * (blanket_order.update_ordered_qty), so every screen, import and test applies one rule.
 */
import { adapter, registerDocHook, type Doc } from "@/lib/adapter";
import { cachedMeta } from "@/lib/catalog";
import { currentUser, hasPerm } from "@/lib/session";

type Bi = [string, string];
const s = (v: unknown) => String(v ?? "");
const n = (v: unknown) => Number(v) || 0;
const r3 = (x: number) => Math.round(x * 1000) / 1000;
const rows = (d: Doc | undefined, f = "items") => (Array.isArray(d?.[f]) ? (d![f] as Doc[]) : []);
const today = () => new Date().toISOString().slice(0, 10);

export const BLANKET_ROW_CLOSED = "digit_row_closed";
export const BLANKET_ORDER_DOCS = ["Sales Order", "Purchase Order"] as const;
export interface BlanketLine { idx: number; item_code: string; item_name: string; qty: number; ordered: number; pending: number; rate: number; closed: boolean }
export interface BlanketState { name: string; status: string; closed: boolean; expired: boolean; open: boolean; lines: BlanketLine[] }

export function blanketState(bo: Doc): BlanketState {
  const status = s(bo["status"]) || (n(bo.docstatus) === 1 ? "Submitted" : n(bo.docstatus) === 2 ? "Cancelled" : "Draft");
  const closed = status === "Closed"; const expired = !!s(bo["to_date"]) && s(bo["to_date"]) < today();
  const lines = rows(bo).map((r, i) => ({ idx: n(r["idx"]) || i + 1, item_code: s(r["item_code"]), item_name: s(r["item_name"]), qty: n(r["qty"]), ordered: n(r["ordered_qty"]),
    pending: Math.max(r3(n(r["qty"]) - n(r["ordered_qty"])), 0), rate: n(r["rate"]), closed: !!n(r[BLANKET_ROW_CLOSED]) }));
  return { name: bo.name, status, closed, expired, open: n(bo.docstatus) === 1 && !closed && !expired, lines };
}

/** Close / re-open needs write permission on the blanket order (blanket_order.js shows the buttons to writers only). */
export const mayChangeBlanket = (bo: Doc, user = currentUser()) => { const m = cachedMeta("Blanket Order"); return !!m && n(bo.docstatus) === 1 && hasPerm(m, "write", bo, user); };
const note = (bo: string, content: string, user: string) => adapter.insertDoc("Comment", { comment_type: "Info", reference_doctype: "Blanket Order", reference_name: bo, content, comment_email: user, owner: user });

export function setBlanketClosed(name: string, close: boolean, user = currentUser()): { ok: true } | { ok: false; reason: Bi } {
  const bo = adapter.get("Blanket Order", name);
  if (!bo || n(bo.docstatus) !== 1) return { ok: false, reason: ["Only a submitted blanket order can be closed or re-opened.", "يُقفل أو يُعاد فتح أمر الشراء الإطاري المعتمد فقط."] };
  if (!mayChangeBlanket(bo, user)) return { ok: false, reason: ["You may not change this blanket order.", "لا يحق لك تعديل هذا الأمر الإطاري."] };
  const st = blanketState(bo);
  if (close === st.closed) return { ok: false, reason: close ? ["This blanket order is already closed.", "هذا الأمر الإطاري مقفل بالفعل."] : ["This blanket order is not closed.", "هذا الأمر الإطاري غير مقفل."] };
  adapter.update("Blanket Order", name, { status: close ? "Closed" : "Submitted" });
  note(name, close ? "Blanket order closed" : "Blanket order re-opened", user);
  return { ok: true };
}

export function setBlanketRowClosed(name: string, idx: number, close: boolean, user = currentUser()): { ok: true } | { ok: false; reason: Bi } {
  const bo = adapter.get("Blanket Order", name);
  if (!bo || n(bo.docstatus) !== 1) return { ok: false, reason: ["Only a submitted blanket order can be changed.", "يُعدّل الأمر الإطاري المعتمد فقط."] };
  if (!mayChangeBlanket(bo, user)) return { ok: false, reason: ["You may not change this blanket order.", "لا يحق لك تعديل هذا الأمر الإطاري."] };
  const items = rows(bo).map((r) => ({ ...r }));
  const row = items.find((r, i) => (n(r["idx"]) || i + 1) === idx);
  if (!row) return { ok: false, reason: [`Line ${idx} is not on this blanket order.`, `السطر ${idx} غير موجود في هذا الأمر.`] };
  if (!!n(row[BLANKET_ROW_CLOSED]) === close) return { ok: false, reason: close ? ["This line is already closed.", "هذا السطر مقفل بالفعل."] : ["This line is not closed.", "هذا السطر غير مقفل."] };
  row[BLANKET_ROW_CLOSED] = close ? 1 : 0;
  adapter.update("Blanket Order", name, { items });
  note(name, `${close ? "Line closed" : "Line re-opened"}: ${s(row["item_code"])} (#${idx})`, user);
  return { ok: true };
}

const allowance = (dt: string) => n(adapter.get(dt === "Sales Order" ? "Selling Settings" : "Buying Settings", dt === "Sales Order" ? "Selling Settings" : "Buying Settings")?.["blanket_order_allowance"]);

/** blanket_order.validate_against_blanket_order: errors for one order document about to be submitted. */
export function blanketErrors(dt: string, d: Doc): string[] {
  const errs: string[] = []; const want = new Map<string, number>(); const date = s(d["transaction_date"]) || today();
  for (const r of rows(d)) { const bo = s(r["blanket_order"]); if (!bo) continue; const k = `${bo}\u0000${s(r["item_code"])}`; want.set(k, (want.get(k) ?? 0) + n(r["qty"])); }
  for (const [k, qty] of want) {
    const [name, item] = k.split("\u0000") as [string, string];
    const bo = adapter.get("Blanket Order", name);
    if (!bo || n(bo.docstatus) !== 1) { errs.push(`Blanket Order ${name} is not submitted.`); continue; }
    const st = blanketState(bo);
    if (st.closed) { errs.push(`Blanket Order ${name} is closed. Re-open it before ordering against it.`); continue; }
    if (s(bo["to_date"]) && s(bo["to_date"]) < date) { errs.push(`Blanket Order ${name} expired on ${s(bo["to_date"])}.`); continue; }
    const line = st.lines.find((l) => l.item_code === item);
    if (!line) { errs.push(`Item ${item} is not on Blanket Order ${name}.`); continue; }
    if (line.closed) { errs.push(`Line ${line.idx} (${item}) of Blanket Order ${name} is closed.`); continue; }
    const room = r3(line.pending * (1 + allowance(dt) / 100));
    if (qty > room + 0.0001) errs.push(`Item ${item}: ${qty} ordered but only ${room} is left on Blanket Order ${name}.`);
  }
  return errs;
}

function bumpOrdered(d: Doc, sign: 1 | -1) {
  const by = new Map<string, Map<string, number>>();
  for (const r of rows(d)) { const bo = s(r["blanket_order"]); if (!bo) continue; const m = by.get(bo) ?? new Map<string, number>(); m.set(s(r["item_code"]), (m.get(s(r["item_code"])) ?? 0) + n(r["qty"])); by.set(bo, m); }
  for (const [name, m] of by) {
    const bo = adapter.get("Blanket Order", name); if (!bo) continue;
    adapter.update("Blanket Order", name, { items: rows(bo).map((r) => (m.has(s(r["item_code"])) ? { ...r, ordered_qty: Math.max(r3(n(r["ordered_qty"]) + sign * m.get(s(r["item_code"]))!), 0) } : r)) });
  }
}

let hooked = false;
export function registerBlanketHooks() {
  if (hooked) return; hooked = true;
  for (const dt of BLANKET_ORDER_DOCS) registerDocHook(dt, (doc: Doc, before?: Doc) => {
    const was = n(before?.["docstatus"]), now = n(doc["docstatus"]);
    if (!rows(doc).some((r) => s(r["blanket_order"]))) return { doc };
    if (now === 1 && was !== 1) { const errors = blanketErrors(dt, doc); return errors.length ? { doc, errors } : { doc, after: (d) => bumpOrdered(d, 1) }; }
    if (now === 2 && was === 1) return { doc, after: (d) => bumpOrdered(d, -1) };
    return { doc };
  });
}
