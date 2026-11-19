/** Search contract for /pro/asset-register (pure; shared by the route and tests). */
import { strSearch } from "./OpsPro";

const KEYS = ["company", "category", "location", "status", "q", "custodian", "from", "to", "book", "asof", "bucket", "view", "cols", "sort", "density", "fs"];
const LEGACY_BUCKETS = new Set(["active", "fully", "maintenance", "draft"]);
const pick = strSearch(KEYS);

/** Older links used view=<asset group>, columns=a,b and sort=<field>&direction=desc; they still open the same register. */
export function assetRegisterSearch(q: Record<string, unknown>): Record<string, string | undefined> {
  const s = pick(q) as Record<string, string | undefined>;
  const str = (v: unknown) => (typeof v === "string" && v ? v : undefined);
  if (s["view"] && LEGACY_BUCKETS.has(s["view"]) && !s["bucket"]) { s["bucket"] = s["view"]; s["view"] = undefined; }
  const legacyCols = str(q["columns"]); if (legacyCols && !s["cols"]) s["cols"] = legacyCols;
  const dir = str(q["direction"]); if (s["sort"] && !s["sort"].includes(":")) s["sort"] = `${s["sort"]}:${dir === "desc" ? "desc" : "asc"}`;
  return s;
}
