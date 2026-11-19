/**
 * PU3-b / PUR-003-b — award by line → one Purchase Order per winning supplier (D365 award pattern) over the source
 * Supplier Quotation → Purchase Order mapping (supplier_quotation.js make_purchase_order → engines.mapDoc). Each PO
 * is saved as a DRAFT through documentApi (create permission, naming, insert hooks); approval and submit stay native.
 */
import { adapter, type Doc } from "@/lib/adapter";
import { cachedMeta, TABLE_TYPES, type DocTypeMeta } from "@/lib/catalog";
import { createDraft, saveDocument } from "@/lib/documentApi";
import { mapDoc } from "@/lib/engines";
import { currentUser } from "@/lib/session";

export interface AwardLine { item: string; sq: string }
export interface AwardGroup { supplier: string; currency: string; quotations: string[]; items: string[] }

/** Group the awarded lines by supplier + currency (one PO each), keeping quotation and item order. */
export function awardPlan(awards: AwardLine[], getDoc: (dt: string, name: string) => Doc | undefined = (dt, n) => adapter.get(dt, n)): AwardGroup[] {
  const groups = new Map<string, AwardGroup>();
  for (const a of awards) {
    const sq = getDoc("Supplier Quotation", a.sq); if (!sq || Number(sq["docstatus"]) !== 1) continue;
    const k = `${sq["supplier"]}\u0000${sq["currency"] ?? ""}`;
    const g = groups.get(k) ?? { supplier: String(sq["supplier"] ?? ""), currency: String(sq["currency"] ?? ""), quotations: [], items: [] };
    if (!g.quotations.includes(a.sq)) g.quotations.push(a.sq);
    g.items.push(`${a.sq}\u0000${a.item}`); groups.set(k, g);
  }
  return [...groups.values()];
}

export interface AwardResult { created: { supplier: string; name: string; lines: number }[]; errors: string[] }
/** Create one draft Purchase Order per group with only the awarded quotation lines. */
export function createAwardOrders(groups: AwardGroup[], metaOf: (dt: string) => DocTypeMeta | undefined = cachedMeta, user = currentUser()): AwardResult {
  const sqm = metaOf("Supplier Quotation"), pom = metaOf("Purchase Order");
  const res: AwardResult = { created: [], errors: [] };
  if (!sqm || !pom) { res.errors.push("Supplier Quotation / Purchase Order definitions are not loaded"); return res; }
  const childMetas: Record<string, DocTypeMeta> = {};
  for (const f of pom.fields.filter((x) => TABLE_TYPES.has(x.fieldtype) && x.options)) { const m = metaOf(f.options!); if (m) childMetas[f.options!] = m; }
  for (const g of groups) {
    let header: Record<string, unknown> | null = null; const items: Record<string, unknown>[] = [];
    for (const sqName of g.quotations) {
      const sq = adapter.get("Supplier Quotation", sqName); if (!sq) continue;
      const mapped = mapDoc(sqm, sq, pom, childMetas);
      header ??= mapped;
      const keep = new Set(g.items.filter((k) => k.startsWith(`${sqName}\u0000`)).map((k) => k.split("\u0000")[1]));
      for (const r of (mapped["items"] as Record<string, unknown>[] | undefined) ?? []) if (keep.has(String(r["item_code"]))) items.push(r);
    }
    if (!header || !items.length) { res.errors.push(`Nothing to order from ${g.supplier}`); continue; }
    const draft = createDraft(pom, { mapped: { ...header, items: items.map((r, i) => ({ ...r, idx: i + 1 })) } });
    if (!draft.doc) { res.errors.push(...draft.errors); continue; }
    const { name: _n, ...values } = draft.doc;
    const saved = saveDocument(pom, draft.doc.name, values, { user });
    if (saved.errors.length) { res.errors.push(...saved.errors); adapter.remove("Purchase Order", draft.doc.name); continue; }
    res.created.push({ supplier: g.supplier, name: saved.name, lines: items.length });
  }
  return res;
}
