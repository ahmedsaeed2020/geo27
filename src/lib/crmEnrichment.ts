import { adapter, type Doc } from "./adapter";

export type EnrichmentKind = "Social" | "Industry";
export function parseKeywords(value: string): string[] {
  return [...new Set(value.split(",").map(s => s.trim()).filter(Boolean))];
}
/** Source useSocialRules/useIndustryRules: normalize duplicates and preserve hidden child patterns. */
export function enrichmentValues(kind: EnrichmentKind, target: string, pattern: string, existing?: Doc): Record<string, unknown> {
  const key = kind === "Social" ? "target_value" : "industry";
  const trimmed = target.trim();
  if (!trimmed) throw new Error(kind === "Social" ? "Platform is required" : "Industry is required");
  if (adapter.list("CRM Enrichment Rule").some(r => r.name !== existing?.name && r["rule_type"] === kind && String(r[key] ?? "").trim().toLowerCase() === trimmed.toLowerCase())) throw new Error("A rule already exists");
  const patterns = (Array.isArray(existing?.["patterns"]) ? existing["patterns"] : []) as Record<string, unknown>[];
  if (kind === "Social") {
    if (!pattern.trim()) throw new Error("Pattern is required");
    return { rule_type: kind, target_value: trimmed, match_scope: "HTML", patterns: [{ ...patterns.find(p => Number(p["is_regex"]) === 1), pattern: pattern.trim(), is_regex: 1 }, ...patterns.filter(p => Number(p["is_regex"]) !== 1)] };
  }
  const keywords = parseKeywords(pattern);
  if (!keywords.length) throw new Error("At least one keyword is required");
  return { rule_type: kind, industry: trimmed, ...(existing ? {} : { weight: 1, match_scope: "Headline" }), patterns: [...keywords.map(keyword => ({ ...patterns.find(p => Number(p["is_regex"]) !== 1 && p["pattern"] === keyword), pattern: keyword, is_regex: 0 })), ...patterns.filter(p => Number(p["is_regex"]) === 1)] };
}