/**
 * PRO-EXT-07 three-way match read model (purchase order line ↔ submitted receipts ↔ submitted purchase invoices per
 * item) over construction projects. Used by the Invoice matching page and the policy register (P5 variances).
 */
import { matchTolerance, num, r2, sumBy, type MatchTol } from "./calc";
import { isSubmitted, list, rows } from "./data";
import { constructionProjects, settings } from "./queues";

type R = Record<string, unknown>;
export interface MatchRow { [k: string]: unknown; name: string; po: string; supplier: unknown; project: string; item: unknown; ordered: number; received: number; invoiced: number; poRate: number; invRate: number | null; qtyVar: number; priceVar: number | null; status: string; invoices: string[];
  /** P5: "none" = no Finance tolerance (report only), "within" / "beyond" the tolerance; accepted = the Procurement manager's acceptance */
  tolerance: "none" | "within" | "beyond"; acceptance?: string | undefined }
const nn = (v: unknown): number | null => (v === null || v === undefined || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null);
/** P5 Finance values from Construction Settings (blank = not set). */
export const matchTol = (): MatchTol => { const st = settings(); return { qtyPct: nn(st?.["match_qty_tol_pct"]), pricePct: nn(st?.["match_price_tol_pct"]), cap: nn(st?.["match_abs_cap"]) }; };
/** The live acceptance of a PO line's variance (Digit Match Acceptance), if any. */
export const acceptanceOf = (po: string, item: unknown) => list("Digit Match Acceptance", (a) => a["purchase_order"] === po && a["item_code"] === item && Number(a["docstatus"] ?? 0) !== 2)[0];
export function matchingRows(project?: string): MatchRow[] {
  const ps = new Set(constructionProjects().map((p) => p.name));
  const pos = list("Purchase Order", (p) => isSubmitted(p) && rows(p, "items").some((i) => (project ? i["project"] === project : ps.has(String(i["project"] ?? p["project"])))));
  const out: MatchRow[] = []; const tol = matchTol();
  for (const po of pos) {
    const prs = list("Purchase Receipt", (r) => isSubmitted(r) && rows(r, "items").some((i) => i["purchase_order"] === po.name));
    const pis = list("Purchase Invoice", (r) => isSubmitted(r) && rows(r, "items").some((i) => i["purchase_order"] === po.name));
    for (const it of rows(po, "items")) {
      const rec = sumBy(prs.flatMap((r) => rows(r, "items")).filter((i) => i["purchase_order"] === po.name && i["item_code"] === it["item_code"]), (i) => num(i["qty"]));
      const invRows = pis.flatMap((r) => rows(r, "items").map((i): R => ({ ...i, __pi: r.name }))).filter((i) => i["purchase_order"] === po.name && i["item_code"] === it["item_code"]);
      const inv = sumBy(invRows, (i) => num(i["qty"]));
      const invRate = invRows.length ? r2(sumBy(invRows, (i) => num(i["amount"])) / (inv || 1)) : null;
      const qtyVar = r2(inv - rec), priceVar = invRate === null ? null : r2(invRate - num(it["rate"]));
      const raw = !invRows.length ? (rec ? "Received, not invoiced" : "Open") : Math.abs(qtyVar) > 1e-9 ? "Quantity variance" : priceVar !== null && Math.abs(priceVar) > 0.005 ? "Price variance" : "Matched";
      const tolerance = invRows.length ? matchTolerance(rec, inv, num(it["rate"]), invRate, tol) : "none";
      const acc = raw.endsWith("variance") ? acceptanceOf(po.name, it["item_code"]) : undefined;
      // P5: a variance within the Finance tolerance is not an exception; an accepted variance is closed by its acceptance
      const status = raw.endsWith("variance") && tolerance === "within" ? "Within tolerance" : raw.endsWith("variance") && acc ? "Variance accepted" : raw;
      out.push({ name: `${po.name}:${String(it["item_code"])}`, po: po.name, supplier: po["supplier"], project: String(it["project"] ?? po["project"] ?? ""), item: it["item_code"], ordered: num(it["qty"]), received: rec, invoiced: inv, poRate: num(it["rate"]), invRate, qtyVar, priceVar, status, invoices: [...new Set(invRows.map((i) => String(i["__pi"])))], tolerance, acceptance: acc?.name });
    }
  }
  return out;
}
