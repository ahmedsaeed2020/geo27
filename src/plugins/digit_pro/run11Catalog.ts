/**
 * DIGIT Pro's original Run11.1 id catalogs (321 requirement ids, 448 UI placement ids), imported by
 * scripts/pro-run11-catalog.py from byte-identical copies of the owner's knowledge-pack CSVs (docs/run11_1/source/).
 * Each id carries its approved destination — a section workspace (the source's own workspace column), a department home,
 * the executive dashboard, or none (Enterprise-owned shared capability) — and one evidence status. Ids are targets, not
 * screens: nothing here renders, and no id is upgraded without a source locator or a browser receipt.
 */
import CATALOG from "./run11Catalog.generated.json";
import type { TraceStatus } from "../experience/contract";

type Row = [id: string, scope: string, destination: string, status: TraceStatus, reasons: string];
const C = CATALOG as unknown as { meta: { sources: Record<string, string>; evidence: Record<string, string>; browser_checked_at: string }; requirements: Row[]; placements: Row[] };

export const RUN11_CATALOG_META = C.meta;

/** One-line basis for every reason code the generator writes (joined with "; " in the experience register). */
const REASON: Record<string, string> = {
  BROWSER_VISIBLE_SAME_BASIS: "Visible on its workspace after load (browser receipt); the preview figure uses the same basis as the Pro source",
  BROWSER_VISIBLE_DIFFERENT_BASIS: "Visible on its workspace after load (browser receipt); the preview figure uses a different basis, stated on the row",
  BROWSER_VISIBLE_SERVER_ANSWER: "Card or definition visible after load (browser receipt); the answer itself is computed by the DIGIT Pro server",
  BROWSER_HIDDEN_AFTER_LOAD: "Seen right after navigation but no longer visible once loading settled",
  BROWSER_VISIBLE: "Visible on its workspace after load (browser receipt)",
  ENTERPRISE_HOST_UI_SOURCE: "Exact id in the Enterprise host UI source (DIGIT host only); not mounted in this Core",
  PRO_SERVER_SOURCE: "Exact id in DIGIT Pro server source (Python); not rendered in this Core",
  NO_EXACT_LOCATOR: "No exact id locator in the inspected sources; needs a per-id functional check (not a claim of absence)",
  ENTERPRISE_SHARED_CAPABILITY: "Department column names an Enterprise-owned shared capability; no Pro screen is its destination",
  ROLLOUT_PENDING_ROUTE_PRESENT: "The workspace route exists; this placement is mapped per id only after the owner approves the rollout",
  MAPPED_NOT_SEEN: "Mapped in the golden slice but not seen in the browser receipt",
};
const reasonText = (codes: string) => codes.split("|").map((c) => REASON[c] ?? (c.startsWith("IMPL_") ? `Implementation status ${c.slice(5)} (docs/run11_1/03 matrix)` : c)).join("; ");

export interface CatalogRegister { ids: string[]; statuses: Record<string, TraceStatus>; reasons: Record<string, string>; byDestination: Map<string, string[]> }
function register(rows: Row[]): CatalogRegister {
  const byDestination = new Map<string, string[]>();
  for (const [id, , dest] of rows) if (dest) byDestination.set(dest, [...(byDestination.get(dest) ?? []), id]);
  return {
    ids: rows.map((r) => r[0]),
    statuses: Object.fromEntries(rows.map((r) => [r[0], r[3]])),
    reasons: Object.fromEntries(rows.map((r) => [r[0], reasonText(r[4])])),
    byDestination,
  };
}

let cache: { requirements: CatalogRegister; placements: CatalogRegister } | null = null;
export function run11Catalog() { return (cache ??= { requirements: register(C.requirements), placements: register(C.placements) }); }
