import type { FFilter } from "./wf05";

export type DirectorySearch = { q?: string | undefined };
export type ForecastSearch = FFilter & { cat?: "commit" | "best" | "pipeline" | undefined; fy?: string | undefined };
const text = (value: unknown) => typeof value === "string" && value.trim() ? value.trim() : undefined;
const date = (value: unknown) => {
  const s = text(value);
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return undefined;
  const t = Date.parse(s);
  return Number.isFinite(t) && new Date(t).toISOString().slice(0, 10) === s ? s : undefined;
};
export const validateDirectorySearch = (s: Record<string, unknown>): DirectorySearch => ({ q: text(s["q"]) });
export function validateForecastSearch(s: Record<string, unknown>): ForecastSearch {
  const cat = s["cat"];
  return { from: date(s["from"]), to: date(s["to"]), owner: text(s["owner"]), fy: text(s["fy"]), cat: cat === "commit" || cat === "best" || cat === "pipeline" ? cat : undefined };
}

/** Keep matching nodes and their ancestors without changing the source hierarchy or statistics. */
export function searchTree<T extends { children: T[] }>(nodes: T[], query: string | undefined, label: (node: T) => string): T[] {
  const q = query?.trim().toLocaleLowerCase();
  if (!q) return nodes;
  return nodes.flatMap((node) => {
    if (label(node).toLocaleLowerCase().includes(q)) return [node];
    const children = searchTree(node.children, q, label);
    return children.length ? [{ ...node, children }] : [];
  });
}