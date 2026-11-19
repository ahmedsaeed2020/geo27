/**
 * IN6-b Sales Order reservation lines and IN9-b near-expiry timeline (DIGIT Pro experience only). Both are
 * read-only views over native records; reserving / unreserving stays on the native Sales Order buttons.
 */
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import type { Doc } from "@/lib/adapter";
import { useScopeMetas } from "@/lib/scope";
import { currentUser } from "@/lib/session";
import { useLang } from "@/i18n";
import { SourceState } from "./ProFrame";
import { orderReservations, type LineState } from "./reservations";
import { expiryTimeline } from "./expiry";
import { Meter } from "@/components/enterprise/kit";

const num = (v: number) => v.toLocaleString("en-US", { maximumFractionDigits: 3 });
const STATE: Record<LineState, [string, string, string]> = {
  reserved: ["Reserved", "محجوز", "bg-success/15 text-success-text"], partial: ["Partly reserved", "محجوز جزئيًا", "bg-warning/20"],
  backorder: ["Backorder", "طلب متأخر", "bg-destructive/10 text-destructive"], can_reserve: ["Stock free to reserve", "مخزون متاح للحجز", "bg-primary/10 text-primary"],
  delivered: ["Delivered", "مُسلّم", "bg-muted"], non_stock: ["Not a stock item", "ليس صنف مخزون", "bg-muted"],
};

export function OrderReservationPanel({ doc }: { doc: Doc }) {
  useScopeMetas(["Stock Reservation Entry", "Delivery Note", "Stock Settings"]);
  const ar = useLang() === "ar"; const t = (en: string, a: string) => (ar ? a : en);
  const r = orderReservations(doc, currentUser());
  const back = r.lines.reduce((a, l) => a + l.backorder, 0);
  return <section className="panel mt-4 p-4" data-dp-reservations={r.entries} aria-label={t("Stock reservation", "حجز المخزون")}>
    <div className="flex flex-wrap items-center gap-2"><h2 className="text-sm font-semibold">{t("Stock reservation", "حجز المخزون")}</h2>
      {r.status === "ok" && <span className="chip bg-muted text-xs">{r.entries} {t(r.entries === 1 ? "reservation entry" : "reservation entries", "قيد حجز")}</span>}
      {back > 0 && <span className="chip bg-destructive/10 text-xs text-destructive" data-dp-backorder={back}>{t("Backorder", "طلب متأخر")} <bdi className="ms-1" data-no-i18n>{num(back)}</bdi></span>}
      {r.entries > 0 && <Link to="/app/$app/$doctype" params={{ app: "erpnext", doctype: "stock_reservation_entry" }} search={{ voucher_no: doc.name } as never} className="btn-ghost ms-auto py-0.5 text-xs">{t("Open reservation entries", "فتح قيود الحجز")}</Link>}</div>
    {r.status !== "ok" ? <SourceState status={r.status} doctype="Stock Reservation Entry" /> : <>
      {!r.enabled && <p className="mt-1 text-xs text-muted-foreground" data-dp-reservation-off>{t("Stock reservation is off in Stock Settings (Allow Stock Reservation), so the Reserve button refuses.", "حجز المخزون غير مفعّل في إعدادات المخزون (السماح بحجز المخزون)، لذلك يرفض زر الحجز.")}</p>}
      <div className="mt-2 overflow-x-auto"><table className="w-full text-xs [&_td]:whitespace-nowrap [&_td]:px-1"><thead><tr className="text-muted-foreground">
        <th className="py-1 text-start">#</th><th className="text-start">{t("Item", "الصنف")}</th><th className="text-start">{t("Warehouse", "المستودع")}</th>
        <th className="text-end">{t("Ordered", "المطلوب")}</th><th className="text-end">{t("Delivered", "المُسلّم")}</th><th className="text-end">{t("Reserved for this order", "محجوز لهذا الطلب")}</th>
        <th className="text-end">{t("Free to reserve", "متاح للحجز")}</th><th className="text-end">{t("Backorder", "طلب متأخر")}</th><th className="text-start">{t("State", "الحالة")}</th></tr></thead>
        <tbody>{r.lines.map((l) => <tr key={`${l.idx}-${l.item}`} className="border-t border-border" data-dp-res-line={l.state} data-item={l.item}>
          <td className="py-1" data-no-i18n>{l.idx}</td><td data-no-i18n>{l.item}</td><td data-no-i18n>{l.warehouse || "—"}</td>
          <td className="text-end tabular-nums" data-no-i18n>{num(l.ordered)}</td><td className="text-end tabular-nums" data-no-i18n>{num(l.delivered)}</td>
          <td className="text-end tabular-nums font-medium" data-no-i18n>{num(l.reserved)}</td><td className="text-end tabular-nums" data-no-i18n>{num(l.free)}</td>
          <td className={`text-end tabular-nums ${l.backorder > 0 ? "text-destructive" : ""}`} data-no-i18n>{num(l.backorder)}</td>
          <td><span className={`chip text-[11px] ${STATE[l.state][2]}`}>{t(STATE[l.state][0], STATE[l.state][1])}</span></td></tr>)}</tbody></table></div>
      <p className="mt-2 text-[11px] text-muted-foreground">{t("Use the order's Reserve, Unreserve and Reserved Stock buttons; a delivery against this order consumes its reservation.", "استخدم أزرار الطلب: حجز، إلغاء الحجز، المخزون المحجوز؛ والتسليم مقابل هذا الطلب يستهلك حجزه.")}</p>
    </>}
  </section>;
}

export function ExpiryTimelinePanel({ asOf, user }: { asOf: string; user: string }) {
  useScopeMetas(["Batch", "Stock Entry", "Purchase Receipt", "Delivery Note"]);
  const ar = useLang() === "ar"; const t = (en: string, a: string) => (ar ? a : en);
  const tl = expiryTimeline(asOf, user);
  const [open, setOpen] = useState<string | null>(null);
  const max = Math.max(1, ...tl.buckets.map((b) => b.qty));
  const sel = tl.buckets.find((b) => b.key === open);
  return <section className="dp-card mt-4" data-dp-expiry-timeline={tl.total} aria-label={t("Near-expiry timeline", "الجدول الزمني لقرب الانتهاء")}>
    <h2 className="font-semibold">{t("Near-expiry timeline", "الجدول الزمني لقرب الانتهاء")}</h2>
    <p className="text-xs text-muted-foreground">{t("Batches with stock on hand by expiry month. Quantity = submitted stock movements of each batch; disabled batches and batches without an expiry date are left out.", "الدفعات التي لها رصيد حسب شهر الانتهاء. الكمية = حركات المخزون المعتمدة لكل دفعة؛ تُستبعد الدفعات المعطلة وبلا تاريخ انتهاء.")}</p>
    {tl.status !== "ok" ? <SourceState status={tl.status} doctype="Batch" /> : !tl.total ? <SourceState status="empty" doctype="Batch" /> : <>
      <ol className="mt-3 grid gap-1.5" data-dp-expiry-buckets>{tl.buckets.map((b) => <li key={b.key}>
        <button type="button" className="grid w-full grid-cols-[7rem_1fr_auto] items-center gap-2 text-start text-xs disabled:cursor-default" disabled={!b.batches.length} onClick={() => setOpen(open === b.key ? null : b.key)} aria-expanded={open === b.key} data-dp-expiry-bucket={b.key} data-qty={b.qty}>
          <span className={b.key === "expired" ? "font-medium text-destructive" : ""} data-no-i18n>{ar ? b.label[1] : b.label[0]}</span>
          <Meter size="lg" value={b.qty} max={max} tone={b.key === "expired" ? "risk" : b.key === "later" ? "neutral" : "attention"} label={String(b.qty)} />
          <span className="tabular-nums" data-no-i18n>{num(b.qty)} · {b.batches.length}</span></button></li>)}</ol>
      <p className="mt-1 text-[11px] text-muted-foreground">{t("Quantity · batches. Select a month to list its batches.", "الكمية · عدد الدفعات. اختر شهرًا لعرض دفعاته.")}</p>
      {sel && <ul className="mt-2 divide-y divide-border text-xs" data-dp-expiry-list={sel.key}>{sel.batches.slice(0, 30).map((b) => <li key={b.name} className="flex flex-wrap gap-2 py-1">
        <Link to="/app/$app/$doctype/$name" params={{ app: "erpnext", doctype: "batch", name: b.name }} className="font-medium text-primary hover:underline" data-no-i18n>{b.name}</Link>
        <span data-no-i18n>{b.item}</span><span className="tabular-nums" data-no-i18n>{b.expiry}</span><span className="ms-auto tabular-nums" data-no-i18n>{num(b.qty)}</span></li>)}</ul>}
    </>}
  </section>;
}
