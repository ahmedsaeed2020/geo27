/**
 * Item 360 document trail (owner gap list A08): for one item, every purchase chain Purchase Order → Purchase Receipt →
 * Purchase Invoice and every sales chain Sales Order → Delivery Note → Sales Invoice that carries it, read from the
 * native item rows (purchase_order / purchase_receipt / against_sales_order / sales_order / delivery_note links) with the
 * ledger lines each invoice posted. Only documents the user may read appear; nothing is stored.
 */
import { type Doc } from "@/lib/adapter";
import { scopedList } from "@/lib/scope";
import { currentUser } from "@/lib/session";

const s = (v: unknown) => String(v ?? "");
const n = (v: unknown) => Number(v) || 0;
const rows = (d: Doc) => (Array.isArray(d["items"]) ? (d["items"] as Doc[]) : []);

export interface TraceStep { doctype: string; name: string; date: string; qty: number; amount: number; status: string; gl: number }
export interface TraceChain { key: string; party: string; steps: TraceStep[]; qty: number; amount: number }
export interface ItemTrace { buying: TraceChain[]; selling: TraceChain[] }

const date = (d: Doc) => s(d["posting_date"] || d["transaction_date"]);
function step(d: Doc, dt: string, item: string, gl: Map<string, number>): TraceStep {
  const mine = rows(d).filter((r) => s(r["item_code"]) === item);
  return { doctype: dt, name: d.name, date: date(d), qty: mine.reduce((t, r) => t + n(r["qty"]), 0), amount: Math.round(mine.reduce((t, r) => t + n(r["amount"] ?? n(r["qty"]) * n(r["rate"])), 0) * 100) / 100, status: s(d["status"]), gl: gl.get(`${dt}\u0000${d.name}`) ?? 0 };
}

export function itemTrace(item: string, user = currentUser(), limit = 12): ItemTrace {
  const live = (dt: string) => scopedList(dt, user).filter((d) => n(d.docstatus) === 1 && rows(d).some((r) => s(r["item_code"]) === item));
  const gl = new Map<string, number>();
  for (const g of scopedList("GL Entry", user)) if (!n(g["is_cancelled"])) { const k = `${s(g["voucher_type"])}\u0000${s(g["voucher_no"])}`; gl.set(k, (gl.get(k) ?? 0) + 1); }
  const chains = (orderDt: string, noteDt: string, invDt: string, partyF: string, noteLink: string, invOrderLink: string, invNoteLink: string): TraceChain[] => {
    const orders = live(orderDt), notes = live(noteDt), invs = live(invDt);
    const usedNotes = new Set<string>(), usedInv = new Set<string>(); const out: TraceChain[] = [];
    const link = (d: Doc, f: string) => new Set(rows(d).filter((r) => s(r["item_code"]) === item).map((r) => s(r[f])).filter(Boolean));
    for (const o of orders) {
      const ns = notes.filter((x) => link(x, noteLink).has(o.name)); ns.forEach((x) => usedNotes.add(x.name));
      const is = invs.filter((x) => link(x, invOrderLink).has(o.name) || ns.some((nn) => link(x, invNoteLink).has(nn.name))); is.forEach((x) => usedInv.add(x.name));
      out.push({ key: o.name, party: s(o[partyF]), steps: [step(o, orderDt, item, gl), ...ns.map((x) => step(x, noteDt, item, gl)), ...is.map((x) => step(x, invDt, item, gl))], qty: 0, amount: 0 });
    }
    for (const x of notes.filter((d) => !usedNotes.has(d.name))) {
      const is = invs.filter((v) => !usedInv.has(v.name) && link(v, invNoteLink).has(x.name)); is.forEach((v) => usedInv.add(v.name));
      out.push({ key: x.name, party: s(x[partyF]), steps: [step(x, noteDt, item, gl), ...is.map((v) => step(v, invDt, item, gl))], qty: 0, amount: 0 });
    }
    for (const v of invs.filter((d) => !usedInv.has(d.name))) out.push({ key: v.name, party: s(v[partyF]), steps: [step(v, invDt, item, gl)], qty: 0, amount: 0 });
    for (const c of out) { c.qty = c.steps[0]!.qty; c.amount = c.steps[0]!.amount; }
    return out.sort((a, b) => b.steps[0]!.date.localeCompare(a.steps[0]!.date) || b.key.localeCompare(a.key)).slice(0, limit);
  };
  return {
    buying: chains("Purchase Order", "Purchase Receipt", "Purchase Invoice", "supplier", "purchase_order", "purchase_order", "purchase_receipt"),
    selling: chains("Sales Order", "Delivery Note", "Sales Invoice", "customer", "against_sales_order", "sales_order", "delivery_note"),
  };
}
