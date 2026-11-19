/** Minimal, safe Jinja subset for print previews: {{ doc.x }}, {{ row.get_formatted("x") }}, {{ _("..") }}, {% for row in doc.items %}…{% endfor %}, {% if doc.x %}…{% endif %}. No code execution. */
import { formatValue } from "@/lib/format";
import { t } from "@/i18n";

type Ctx = Record<string, unknown>;
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
function guessType(k: string, v: unknown) { if (typeof v === "number" && /(amount|total|rate|price)/.test(k)) return "Currency"; if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v) && /date/.test(k)) return "Date"; return typeof v === "number" ? "Float" : "Data"; }
function expr(e: string, ctx: Ctx): unknown {
  e = e.trim();
  let m = e.match(/^_\((["'])(.*)\1\)$/); if (m) return t(m[2]!);
  m = e.match(/^(\w+)\.get_formatted\((["'])(\w+)\2\)$/); if (m) { const o = ctx[m[1]!] as Ctx | undefined; const v = o?.[m[3]!]; return formatValue(guessType(m[3]!, v), v, { doc: o as never }); }
  const path = e.split("."); let v: unknown = ctx;
  for (const p of path) v = v && typeof v === "object" ? (v as Ctx)[p] : undefined;
  return v;
}
export function renderJinja(tpl: string, ctx: Ctx): string {
  let out = tpl.replace(/\{%\s*for (\w+) in ([\w.]+)\s*%\}([\s\S]*?)\{%\s*endfor\s*%\}/g, (_m, v: string, src: string, body: string) => {
    const arr = expr(src, ctx); return Array.isArray(arr) ? arr.map((row) => renderJinja(body, { ...ctx, [v]: row })).join("") : "";
  });
  out = out.replace(/\{%\s*if ([\w.]+)\s*%\}([\s\S]*?)\{%\s*endif\s*%\}/g, (_m, c: string, body: string) => (expr(c, ctx) ? renderJinja(body, ctx) : ""));
  out = out.replace(/\{\{([\s\S]*?)\}\}/g, (_m, e: string) => { const v = expr(e, ctx); return v == null ? "" : esc(String(v)); });
  // imported templates are untrusted: drop scripts, inline handlers and javascript: URLs
  return out.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "").replace(/javascript:/gi, "");
}
