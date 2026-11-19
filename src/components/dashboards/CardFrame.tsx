/**
 * The Enterprise card frame (Visual Round 1 §5) every dashboard card and chart card wears: title · its own period dropdown
 * («هذه السنة المالية ▾», independent of the page period, saved per user on the layout) · one sub-line sentence · freshness
 * «آخر تحديث منذ 17 دقيقة» · a segmented toggle when the card has two views · a footer action naming the action and its count
 * · the ⋯ menu (period, compare, size S/M/L, export PNG/Excel, hide). Apps pass data only.
 */
import { createContext, useContext, type ReactNode } from "react";
import { FRAME_PERIODS, blockLabel } from "@/lib/dashboards/registry";
import { freshnessLine, lastChange } from "@/lib/dashboards/freshness";
import type { Bi } from "@/lib/dashboards/views";

const pick = (ar: boolean, b: Bi) => (ar ? b[1] : b[0]);

/** Freshness of the card being drawn (set by the Dashboard Designer per block; read by kit ChartCard). */
export const FrameCtx = createContext<{ fresh: string } | null>(null);
export const useFrame = () => useContext(FrameCtx);

/** DocTypes an app's page blocks read when a block declares none (used only for the freshness line). */
const APP_SOURCES: [RegExp, string[]][] = [
  [/pro|erpnext|enterprise/i, ["GL Entry", "Sales Invoice", "Purchase Invoice", "Payment Entry", "Journal Entry", "Stock Ledger Entry", "Sales Order", "Purchase Order"]],
  [/hr/i, ["Employee", "Attendance", "Salary Slip", "Leave Application", "Payroll Entry"]],
  [/construction/i, ["Project", "Digit Client Claim", "Digit Client Variation", "Material Request", "Purchase Order"]],
  [/crm/i, ["CRM Lead", "CRM Deal"]],
];
export function frameSources(app: string, own: readonly string[], page: readonly string[]): string[] {
  if (own.length) return [...own];
  if (page.length) return [...page];
  return APP_SOURCES.find(([re]) => re.test(app))?.[1] ?? [];
}
/** The freshness line of a card reading these DocTypes ("" when they hold no record). */
export function freshOf(sources: readonly string[], ar: boolean): string {
  const at = sources.length ? lastChange(sources) : "";
  return at ? freshnessLine(at, ar) : "";
}

/** The card's own period dropdown. */
export function FramePeriod({ value, opts, ar, label, onPick }: { value: string; opts: Record<string, string | undefined>; ar: boolean; label: string; onPick: (v: string) => void }) {
  const known = FRAME_PERIODS.some((p) => p.value === value);
  return <label className="r1-per" data-r1-period={value || "page"} title={ar ? "فترة هذه البطاقة (تُحفظ لك)" : "This card's period (saved for you)"}>
    <span className="sr-only">{ar ? `فترة ${label}` : `Period of ${label}`}</span>
    <select value={value} onChange={(e) => onPick(e.target.value)} aria-label={ar ? `فترة ${label}` : `Period of ${label}`}>
      {!known && <option value={value}>{blockLabel(opts, ar)}</option>}
      {FRAME_PERIODS.map((p) => <option key={p.value} value={p.value}>{pick(ar, p.label)}</option>)}
    </select>
    <span aria-hidden className="r1-per-caret">▾</span>
  </label>;
}

/** Segmented toggle between a card's two (or three) views. */
export function FrameToggle({ items, active, onPick, label }: { items: { id: string; label: string }[]; active: string; onPick: (id: string) => void; label: string }) {
  if (items.length < 2) return null;
  return <div className="r1-seg" role="radiogroup" aria-label={label} data-r1-toggle>
    {items.map((x) => <button key={x.id} type="button" role="radio" aria-checked={x.id === active} className="r1-seg-b" onClick={() => onPick(x.id)} data-r1-toggle-opt={x.id}>{x.label}</button>)}
  </div>;
}

/** Sub-line sentence + freshness under a card title. */
export function FrameSub({ sub, fresh, toggle }: { sub?: ReactNode; fresh?: string | undefined; toggle?: ReactNode }) {
  if (!sub && !fresh && !toggle) return null;
  return <div className="r1-card-subrow">
    <p className="r1-card-sub">{sub}{sub && fresh ? <span aria-hidden> · </span> : null}{fresh && <span className="r1-fresh" data-r1-fresh>{fresh}</span>}</p>
    {toggle}
  </div>;
}

/** Footer action at the start of the card: names the action and its count, opening the filtered list. */
export function FrameAction({ children }: { children: ReactNode }) {
  return <footer className="r1-card-foot" data-r1-foot>{children}</footer>;
}
