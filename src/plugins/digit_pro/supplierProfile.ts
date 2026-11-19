/**
 * Supplier 360 data (owner OWN-56): directory ranked by payable, and for one supplier its identity (VAT, IBAN), the
 * Supplier360 figures (docFlow.ts, same basis as Accounts Payable), open disputes (Core) and delivery reliability —
 * receipts against their order lines' schedule date. Read-only over native records, permission-scoped.
 */
import { adapter, type Doc } from "@/lib/adapter";
import { scopedList } from "@/lib/scope";
import { currentUser } from "@/lib/session";
import { openDisputes } from "@/lib/coreShared/controls";
import { supplier360 } from "./docFlow";
import { sourceStatus } from "./finance";

const n = (v: unknown) => Number(v ?? 0) || 0;
const s = (v: unknown) => String(v ?? "");
export interface SupplierRow { supplier: string; name: string; group: string; payable: number; openOrders: number; toBill: number; disputes: number }
export function supplierDirectory(today: string, user = currentUser(), q = ""): SupplierRow[] {
  if (sourceStatus("Supplier", user) !== "ok") return [];
  const t = q.trim().toLowerCase();
  return scopedList("Supplier", user).filter((d) => !n(d["disabled"]) && (!t || `${d.name} ${s(d["supplier_name"])}`.toLowerCase().includes(t))).map((d) => {
    const x = supplier360(d.name, today, user);
    return { supplier: d.name, name: s(d["supplier_name"]) || d.name, group: s(d["supplier_group"]), payable: x.invoices.outstanding, openOrders: x.orders.open, toBill: x.receipts.toBill, disputes: openDisputes({ type: "Purchase Invoice" }).filter((p) => p.party === d.name).length };
  }).sort((a, b) => b.payable - a.payable || a.name.localeCompare(b.name));
}
export interface Reliability { receipts: number; onTime: number; late: number; pct: number | null }
/** A receipt line is on time when its posting date is on or before the order line's schedule date. */
export function deliveryReliability(supplier: string, user = currentUser()): Reliability {
  if (sourceStatus("Purchase Receipt", user) !== "ok") return { receipts: 0, onTime: 0, late: 0, pct: null };
  const pos = new Map(scopedList("Purchase Order", user).filter((d) => d["supplier"] === supplier).map((d) => [d.name, d]));
  let onTime = 0, late = 0; const seen = new Set<string>();
  for (const pr of scopedList("Purchase Receipt", user)) {
    if (pr["supplier"] !== supplier || n(pr.docstatus) !== 1 || n(pr["is_return"])) continue;
    for (const it of (pr["items"] as Doc[] | undefined) ?? []) {
      const po = pos.get(s(it["purchase_order"])); if (!po) continue;
      const line = ((po["items"] as Doc[] | undefined) ?? []).find((r) => r.name === it["purchase_order_item"]) ?? ((po["items"] as Doc[] | undefined) ?? []).find((r) => r["item_code"] === it["item_code"]);
      const due = s(line?.["schedule_date"] ?? po["schedule_date"]); if (!due) continue;
      seen.add(pr.name);
      if (s(pr["posting_date"]) <= due) onTime++; else late++;
    }
  }
  const all = onTime + late;
  return { receipts: seen.size, onTime, late, pct: all ? Math.round((onTime / all) * 100) : null };
}
export interface SupplierIdentity { name: string; group: string; vat: string; country: string; ibans: string[]; currency: string }
export function supplierIdentity(supplier: string): SupplierIdentity | null {
  const d = adapter.get("Supplier", supplier); if (!d) return null;
  const ibans = adapter.list("Bank Account").filter((b) => b["party_type"] === "Supplier" && b["party"] === supplier && b["iban"]).map((b) => s(b["iban"])).filter((v, i, a) => a.indexOf(v) === i);
  return { name: s(d["supplier_name"]) || supplier, group: s(d["supplier_group"]), vat: s(d["tax_id"]), country: s(d["country"]), ibans, currency: s(d["default_currency"]) };
}
