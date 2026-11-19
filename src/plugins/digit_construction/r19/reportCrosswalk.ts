/**
 * R19 report-design crosswalk: for each design-contract report with no built report of the same name, the closest
 * built report that answers part of the same question (PARTIAL) or GAP when none does. Data only; the Full reports
 * tab and scripts/construction-r19-docs.ts read it, so a design never claims a report it does not have.
 * A PARTIAL cover is never presented as the design itself: the screen labels it "Partly covered by …".
 */
import type { Bi } from "@/lib/dashboards/views";

export type DesignCover = { cover: "PARTIAL"; report: string; note: Bi } | { cover: "GAP"; note: Bi };
const P = (report: string, en: string, ar: string): DesignCover => ({ cover: "PARTIAL", report, note: [en, ar] });
const G = (en: string, ar: string): DesignCover => ({ cover: "GAP", note: [en, ar] });

export const REPORT_DESIGN_COVER: Record<string, DesignCover> = {
};

// the design-contract reports above are all built now; the helpers stay for the next gap
void P; void G;
