/** The V4 department dashboard insights (v4Insights.ts) as visible lines — title · value · drill — near the top of each
 *  department dashboard. Hidden lines (unreadable sources) are simply absent; the first eight show, the rest on demand. */
import { useEffect, useMemo, useState } from "react";
import { useStoreVersion } from "@/lib/adapter";
import { ensureMetas } from "@/lib/catalog";
import { CORE_DT } from "@/lib/coreShared/doctypes";
import { DrillLink } from "./CommandUi";
import { todayIso } from "./finance";
import { sectionCtx } from "./sections";
import { BOARD_LABEL, v4Lines, type Board, type V4Line } from "./v4Insights";

export const V4_SOURCES = ["Company", "Account", "GL Entry", "Journal Entry", "Payment Entry", "Sales Invoice", "Purchase Invoice", "Quotation", "Sales Order", "Delivery Note", "Purchase Order", "Purchase Receipt",
  "Material Request", "Supplier Quotation", "Request for Quotation", "Stock Entry", "Stock Ledger Entry", "Stock Reconciliation", "Warehouse", "Bin", "Batch", "Serial No", "Item", "Item Price", "Asset", "Asset Depreciation Schedule",
  "Asset Maintenance Log", "Asset Repair", "Asset Movement", "Asset Value Adjustment", "Asset Capitalization", "Bank Transaction", "Customer", "Supplier", "Blanket Order", "Landed Cost Voucher", "Budget", "Period Closing Voucher",
  CORE_DT.provider, CORE_DT.integrationLog, CORE_DT.assetCustody, CORE_DT.assetImpairment, CORE_DT.warehouseCapacity];
const FIRST = 8;

/** The visible insight lines of one or more boards (in board order, de-duplicated by id), recomputed on store changes. */
export function useV4Lines(boards: Board[], company: string, currency: string, user: string, ar: boolean, asOf?: string): V4Line[] {
  const v = useStoreVersion();
  const [ready, setReady] = useState(0);
  useEffect(() => { let live = true; void ensureMetas(V4_SOURCES).catch(() => undefined).then(() => { if (live) setReady((x) => x + 1); }); return () => { live = false; }; }, []);
  const key = boards.join(",");
  return useMemo(() => {
    if (!company) return [];
    const c = sectionCtx(company, currency, asOf ?? todayIso()); const seen = new Set<string>();
    return key.split(",").flatMap((b) => v4Lines(b as Board, c, user, ar)).filter((l) => (seen.has(l.id) ? false : (seen.add(l.id), true)));
  }, [key, company, currency, user, ar, v, ready, asOf]);
}

export function V4InsightBoard({ board, company, currency, user, ar }: { board: Board; company: string; currency: string; user: string; ar: boolean }) {
  const [all, setAll] = useState(false);
  const lines = useV4Lines([board], company, currency, user, ar);
  if (!lines.length) return null;
  const shown = all ? lines : lines.slice(0, FIRST); const label = BOARD_LABEL[board];
  return <section className="dp-insight-lines" aria-label={ar ? label[1] : label[0]} data-dp-v4-board={board} data-dp-insight-lines={lines.length}>
    <div className="flex items-center justify-between gap-2">
      <h3 className="dp-insight-lines-h">{ar ? label[1] : label[0]}</h3>
      {lines.length > FIRST && <button type="button" className="dp-insight-more" aria-expanded={all} onClick={() => setAll((x) => !x)} data-dp-v4-more>
        {all ? (ar ? "عرض أقل" : "Show fewer") : ar ? `عرض الكل (${lines.length})` : `Show all (${lines.length})`}
      </button>}
    </div>
    <ul className="dp-insight-grid">{shown.map((l) => <li key={l.id}>
      <DrillLink drill={l.drill} className="dp-insight-line" data-dp-insight-line={l.id} data-dp-v4-insight={l.id} data-status={l.status} title={l.detail || (ar ? "افتح السجلات" : "Open the records")}>
        <span className="dp-insight-title">{ar ? l.title[1] : l.title[0]}</span>
        <bdi className="dp-insight-value" data-no-i18n>{l.value}</bdi>
        {l.detail && <span className="dp-insight-detail" data-no-i18n>{l.detail}</span>}
        <span className="dp-insight-go" aria-hidden>{ar ? "←" : "→"}</span>
      </DrillLink>
    </li>)}</ul>
  </section>;
}
