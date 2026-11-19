// @ts-nocheck -- DIGIT Pro/HR apps are switched off in the merged site build; their original /pro/* and /hr/* app routes are not in this route tree (re-enabling the app needs those routes, then remove this line)
/**
 * RXP-03 shared presentation for the quote-to-cash screens (Order Fulfilment, Quotation Pipeline, Sales Returns,
 * Customer 360). Bilingual labels are passed as [English, Arabic] pairs and rendered for the active language; record
 * values (names, codes, amounts) are marked data-no-i18n so the display translation layer never rewrites them.
 */
import { KPI_TILE, Meter, StackedColumns, type Tone } from "@/components/enterprise/kit";
import { hasMasterName, masterName } from "@/lib/coreShared/masterName";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { fmtCurrency } from "@/lib/format";
import { useLang } from "@/i18n";
import type { Bi, Filter } from "./command";
import { slug } from "./finance";
import type { SourceStatus } from "./finance";

export function useBi() {
  const ar = useLang() === "ar";
  return { ar, t: (en: string, a: string) => (ar ? a : en), b: (x: Bi) => (ar ? x[1] : x[0]) };
}
export const ISO = /^\d{4}-\d{2}-\d{2}$/;
export const validIso = (v: string | undefined): v is string => !!v && ISO.test(v) && Number.isFinite(Date.parse(v)) && new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v;
export const qty = (v: number) => v.toLocaleString("en-US", { maximumFractionDigits: 3 });

/** Native DocType names in Arabic for the documents these screens show (labels only; links use the DocType). */
export const DT_AR: Record<string, string> = {
  Quotation: "عرض سعر", "Sales Order": "أمر بيع", "Delivery Note": "إذن تسليم", "Sales Invoice": "فاتورة مبيعات", "Payment Entry": "سند دفع",
  Customer: "عميل", Item: "صنف", Contact: "جهة اتصال", Address: "عنوان",
};
/** Native document status values in Arabic (ERPNext Select options shown on these screens). Unknown values fall back to the source text. */
export const STATUS_AR: Record<string, string> = {
  Draft: "مسودة", Submitted: "معتمد", Cancelled: "ملغى", Open: "مفتوح", Replied: "تم الرد", "Partially Ordered": "طُلب جزئيًا", Ordered: "تم الطلب", Lost: "مفقود", Expired: "منتهي الصلاحية",
  "To Deliver and Bill": "بانتظار التسليم والفوترة", "To Deliver": "بانتظار التسليم", "To Bill": "بانتظار الفوترة", Completed: "مكتمل", Closed: "مغلق", "On Hold": "معلّق",
  Paid: "مدفوعة", "Partly Paid": "مدفوعة جزئيًا", Unpaid: "غير مدفوعة", Overdue: "متأخرة", Return: "مرتجع", "Credit Note Issued": "صدر إشعار دائن", "Return Issued": "صدر مرتجع",
  "Partially Billed": "مفوتر جزئيًا", Reconciled: "مسوّى", Unreconciled: "غير مسوّى", "Internal Transfer": "تحويل داخلي",
};

export function StatusText({ status }: { status: string }) {
  const { ar } = useBi();
  return <span data-no-i18n>{ar ? STATUS_AR[status] ?? status : status}</span>;
}
export function DtText({ dt }: { dt: string }) {
  const { ar } = useBi();
  return <span data-no-i18n>{ar ? DT_AR[dt] ?? dt : dt}</span>;
}

/** Not Permitted / unavailable / empty states with bilingual help (never rendered as a zero figure). */
export function Q2cState({ status, what }: { status: SourceStatus | "empty" | "missing"; what?: Bi | undefined }) {
  const { t, b } = useBi();
  const msg = status === "denied" ? t("Not Permitted", "غير مسموح") : status === "unavailable" ? t("Source unavailable", "المصدر غير متاح") : status === "missing" ? t("Record not found", "السجل غير موجود") : t("Nothing to show", "لا توجد بيانات");
  const help = status === "denied" ? t("Some of these records are hidden by your permissions, so no partial figure is shown.", "بعض هذه السجلات محجوبة بصلاحياتك، لذا لا يُعرض رقم جزئي.")
    : status === "unavailable" ? t("This source is not loaded in this site.", "هذا المصدر غير محمّل في هذا الموقع.") : "";
  return <div className="dp-state" data-dp-state={status} role="status"><span>{msg}</span>{what && <span className="text-muted-foreground"> · {b(what)}</span>}{help && <span className="basis-full text-xs">{help}</span>}</div>;
}

export function Money({ totals, empty = "—" }: { totals: { currency: string; amount: number }[]; empty?: string }) {
  if (!totals.length) return <span className="text-muted-foreground">{empty}</span>;
  return <span className="inline-flex flex-wrap gap-x-2" data-no-i18n>{totals.map((x) => <bdi key={x.currency} className="tabular-nums">{fmtCurrency(x.amount, x.currency === "—" ? undefined : x.currency)}</bdi>)}</span>;
}

export function DocLink({ dt, name, className = "" }: { dt: string; name: string; className?: string }) {
  if (!name) return <span className="text-muted-foreground">—</span>;
  return <Link to="/app/$app/$doctype/$name" params={{ app: "erpnext", doctype: slug(dt), name }} className={`text-primary hover:underline ${className}`} data-no-i18n data-dp-doc={`${dt}|${name}`} title={hasMasterName(dt) ? name : undefined}><bdi>{hasMasterName(dt) ? masterName(dt, name) : name}</bdi></Link>;
}
export function CustomerLink({ customer, name, company }: { customer: string; name?: string | undefined; company?: string | undefined }) {
  if (!customer) return <span className="text-muted-foreground">—</span>;
  return <Link to="/pro/customer-360" search={{ customer, company } as never} className="hover:underline" data-no-i18n data-dp-c360-link={customer}><bdi>{name || customer}</bdi></Link>;
}
export function NativeList({ doctype, filters, children, className = "dp-link text-xs" }: { doctype: string; filters: Filter[]; children: ReactNode; className?: string }) {
  return <Link to="/app/$app/$doctype" params={{ app: "erpnext", doctype: slug(doctype) }} search={{ filters: JSON.stringify(filters) } as never} className={className} data-dp-native-list={doctype}>{children}</Link>;
}

/** KPI card that toggles an in-page filter (aria-pressed), styled like the command-center signals. */
export function FilterCard({ label, value, meta, tone, active, onClick, disabled, testId }: { label: string; value: ReactNode; meta?: ReactNode; tone?: "warn" | "bad" | undefined; active: boolean; onClick: () => void; disabled?: boolean; testId: string }) {
  return <button type="button" className={`${KPI_TILE} dp-q2c-card text-start`} data-tone={tone} aria-pressed={active} disabled={disabled} onClick={onClick} data-dp-q2c-card={testId}>
    <span className="dp-cc-label">{label}</span><span className="dp-cc-value" data-no-i18n>{value}</span>{meta && <span className="dp-cc-meta">{meta}</span>}
  </button>;
}

/** Horizontal bar list; each bar toggles a filter or follows a link. */
export interface BarItem { key: string; label: ReactNode; value: number; count: ReactNode; tone?: "warn" | "bad" | "muted" | undefined; active?: boolean; onClick?: () => void }
export function BarList({ items, testId }: { items: BarItem[]; testId: string }) {
  const max = Math.max(1, ...items.map((i) => Math.abs(i.value)));
  return <div className="dp-cc-bars" role="list" data-dp-q2c-bars={testId}>{items.map((i) => (
    <button key={i.key} type="button" role="listitem" className="dp-cc-bar dp-q2c-bar text-start" aria-pressed={!!i.active} onClick={i.onClick} data-dp-q2c-bar={i.key}>
      <span className="truncate">{i.label}</span>
      <Meter value={i.value} max={max} tone={Q2C_TONE[i.tone ?? ""] ?? "good"} minPct={3} label={String(i.value)} />
      <span className="text-xs tabular-nums" data-no-i18n>{i.count}</span>
    </button>))}</div>;
}
/** Q2C tone names (row bars, stacked columns) → shared kit tones. */
const Q2C_TONE: Record<string, Tone> = { warn: "attention", bad: "risk", muted: "neutral", "t-primary": "good", "t-success": "secondary", "t-soft": "info", "t-warn": "attention", "t-bad": "risk", "t-muted": "neutral", "t-info": "info" };

/** Stacked vertical columns (one per period); segments are counts or amounts already computed by the selector. */
export interface ColSeg { key: string; value: number; tone: string; label: string }
export function StackCols({ cols, legend, testId, onPick, picked }: { cols: { key: string; label: string; segs: ColSeg[]; caption?: string }[]; legend: { tone: string; label: string }[]; testId: string; onPick?: (k: string) => void; picked?: string | undefined }) {
  const ar = useLang() === "ar";
  // parts follow the legend order (the selector's segment keys); a segment tone missing from the legend is appended
  const tones = [...legend.map((l) => l.tone), ...cols.flatMap((c) => c.segs.map((x) => x.tone))].filter((t, i, a) => a.indexOf(t) === i);
  const labelOf = (tone: string) => legend.find((l) => l.tone === tone)?.label ?? cols.flatMap((c) => c.segs).find((x) => x.tone === tone)?.label ?? tone;
  return <StackedColumns ar={ar} attrs={{ "data-dp-q2c-cols": testId }} colAttr="data-dp-q2c-col" onPick={onPick} picked={picked}
    parts={tones.map((t) => ({ label: labelOf(t), tone: Q2C_TONE[t] }))}
    cols={cols.map((c) => ({ key: c.key, label: c.label, caption: c.caption, values: tones.map((t) => c.segs.filter((x) => x.tone === t).reduce((a, x) => a + Math.max(0, x.value), 0)) }))} />;
}

/** Two-part progress (done vs remaining) for a row. */
export function Progress({ done, total, label }: { done: number; total: number; label: string }) {
  const p = total > 0 ? Math.min(100, Math.max(0, Math.round((done / total) * 100))) : 0;
  return <span className="dp-q2c-prog"><Meter value={p} max={100} showPct size="sm" label={`${label}: ${p}%`} /></span>;
}

export function Chip({ tone, children, ...data }: { tone?: "warn" | "bad" | "ok" | "muted" | undefined; children: ReactNode } & Record<`data-${string}`, string | undefined>) {
  return <span className="dp-q2c-chip" data-tone={tone} {...data}>{children}</span>;
}
