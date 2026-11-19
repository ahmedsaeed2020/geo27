/**
 * «+ جديد ▾» (owner closing round CR-01): the create split button in a workspace band. The main part opens the area's first
 * document, the ▾ menu lists every document of that area; each item opens the shared create panel (CreatePanel, with its
 * «فتح الصفحة كاملة» link) with the item's starting values. Only DocTypes the user may create are listed. Core piece:
 * apps pass the documents of the area, nothing else.
 */
import { useEffect, useState } from "react";
import { translateTo } from "@/i18n";
import { cachedMeta, ensureMetas } from "@/lib/catalog";
import { hasPerm } from "@/lib/session";
import { openCreate } from "./CreatePanel";
import { SplitButton } from "./kit/RecordList";

export interface CreateItem { key: string; doctype: string; label?: [string, string] | undefined; values?: Record<string, unknown> | undefined }

/** The documents of every accounting area (owner list: sales invoice, supplier invoice, receipt, payment, journal, credit / debit note). */
export const ACCOUNTING_CREATE: CreateItem[] = [
  { key: "sales-invoice", doctype: "Sales Invoice", label: ["Sales invoice", "فاتورة مبيعات"] },
  { key: "purchase-invoice", doctype: "Purchase Invoice", label: ["Supplier invoice", "فاتورة مورد"] },
  { key: "receipt", doctype: "Payment Entry", label: ["Receipt voucher", "سند قبض"], values: { payment_type: "Receive", party_type: "Customer" } },
  { key: "payment", doctype: "Payment Entry", label: ["Payment voucher", "سند صرف"], values: { payment_type: "Pay", party_type: "Supplier" } },
  { key: "journal-entry", doctype: "Journal Entry", label: ["Journal entry", "قيد يومية"] },
  { key: "credit-note", doctype: "Sales Invoice", label: ["Credit note", "إشعار دائن"], values: { is_return: 1 } },
  { key: "debit-note", doctype: "Purchase Invoice", label: ["Debit note", "إشعار مدين"], values: { is_return: 1 } },
];

/** Items the user may create (DocType loaded, not single / child, create permission). */
export function creatableItems(items: CreateItem[]): CreateItem[] {
  return items.filter((i) => { const m = cachedMeta(i.doctype); return !!m && !m.issingle && !m.istable && hasPerm(m, "create"); });
}

export function itemLabel(i: CreateItem, ar: boolean): string { return i.label ? (ar ? i.label[1] : i.label[0]) : translateTo(i.doctype, ar ? "ar" : "en"); }

export function CreateMenu({ items, ar, attrs }: { items: CreateItem[]; ar: boolean; attrs?: Record<string, string> | undefined }) {
  const [, tick] = useState(0);
  const dts = [...new Set(items.map((i) => i.doctype))];
  useEffect(() => { let live = true; void ensureMetas(dts).then(() => { if (live) tick((n) => n + 1); }); return () => { live = false; }; }, [dts.join("|")]); // eslint-disable-line react-hooks/exhaustive-deps
  const seen = new Set<string>();
  const ok = creatableItems(items).filter((i) => (seen.has(i.key) ? false : (seen.add(i.key), true)));
  if (!ok.length) return null;
  const run = (i: CreateItem) => openCreate(i.doctype, i.values ? { values: i.values } : {});
  const first = ok[0]!;
  return <span title={`${ar ? "جديد" : "New"}: ${itemLabel(first, ar)}`} className="contents">
    <SplitButton label={<>+ {ar ? "جديد" : "New"}</>} onClick={() => run(first)} ar={ar}
      items={ok.map((i) => ({ key: i.key, label: itemLabel(i, ar), run: () => run(i) }))} attrs={{ "data-create-menu": String(ok.length), ...attrs }} />
  </span>;
}
