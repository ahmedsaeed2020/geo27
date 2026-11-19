/**
 * Controlled parser for Desk Client Script records (`frappe.ui.form.on(dt, { refresh(frm) {...}, field(frm) {...} })`).
 * Never executes JS: recognised statements become declarative rules (buttons, on_change assignments,
 * set_query filters, refresh set_df_property / set_intro). Unrecognised statements are reported, not run.
 */
import type { ClientScript } from "./types";

export interface ParsedClientScript {
  buttons: NonNullable<ClientScript["buttons"]>;
  on_change: Record<string, Record<string, string>>;
  set_query: { fieldname: string; filters: [string, string, string, unknown][] }[];
  refresh: { df: { fieldname: string; property: string; value: string }[]; intro?: string; set: Record<string, string> };
  unsupported: string[];
}

/** Body of the brace block opening at s[i] === "{" (string-aware). */
function block(s: string, i: number): [string, number] {
  let d = 0, q = "";
  for (let k = i; k < s.length; k++) {
    const c = s[k]!;
    if (q) { if (c === "\\") k++; else if (c === q) q = ""; continue; }
    if (c === '"' || c === "'" || c === "`") q = c;
    else if (c === "{") d++;
    else if (c === "}" && --d === 0) return [s.slice(i + 1, k), k];
  }
  return [s.slice(i + 1), s.length];
}
const str = (x: string) => x.replace(/^__\(\s*/, "").replace(/\s*\)$/, "").trim().replace(/^(['"`])(.*)\1$/, "$2");
/** JS value expression → controlled-expression syntax (frm.doc.x → doc.x, === → ==). */
export const jsExpr = (e: string) => e.trim().replace(/frm\.doc\./g, "doc.").replace(/===/g, "==").replace(/!==/g, "!=").replace(/;$/, "");

function statements(body: string, out: ParsedClientScript, into: Record<string, string>) {
  for (const m of body.matchAll(/frm\.set_value\(\s*["'](\w+)["']\s*,\s*([^;]+?)\)\s*;/g)) into[m[1]!] = jsExpr(m[2]!);
  for (const m of body.matchAll(/frm\.set_query\(\s*["'](\w+)["'][\s\S]*?filters\s*:\s*\{([^}]*)\}/g)) {
    const filters: [string, string, string, unknown][] = [];
    for (const kv of m[2]!.matchAll(/["']?(\w+)["']?\s*:\s*([^,]+)/g)) {
      const raw = kv[2]!.trim();
      const v: unknown = /^(['"]).*\1$/.test(raw) ? raw.slice(1, -1) : /^-?\d+(\.\d+)?$/.test(raw) ? Number(raw) : `eval:${jsExpr(raw)}`;
      filters.push(["", kv[1]!, "=", v]);
    }
    out.set_query.push({ fieldname: m[1]!, filters });
  }
}

export function parseClientScript(src: string): ParsedClientScript {
  const out: ParsedClientScript = { buttons: [], on_change: {}, set_query: [], refresh: { df: [], set: {} }, unsupported: [] };
  const on = src.indexOf("frappe.ui.form.on(");
  if (on < 0) { if (src.trim()) out.unsupported.push("no frappe.ui.form.on"); return out; }
  const open = src.indexOf("{", on); if (open < 0) return out;
  const [obj] = block(src, open);
  const hre = /(\w+)\s*(?::\s*(?:function\s*)?\(\s*frm[^)]*\)\s*(?:=>\s*)?|\(\s*frm[^)]*\)\s*)\{/g; let h;
  while ((h = hre.exec(obj))) {
    const name = h[1]!; const [body, end] = block(obj, h.index + h[0].length - 1); hre.lastIndex = end + 1;
    if (name === "refresh" || name === "onload" || name === "setup" || name === "onload_post_render") {
      let rest = body;
      const bre = /frm\.add_custom_button\(\s*((?:__\()?["'][^"']+["']\)?)\s*,\s*(?:function\s*\(\s*\)|\(\s*\)\s*=>)\s*\{/g; let b;
      while ((b = bre.exec(body))) {
        const [bb, be] = block(body, b.index + b[0].length - 1);
        const tail = /^\s*(?:,\s*((?:__\()?["'][^"']+["']\)?))?\s*\)\s*;?/.exec(body.slice(be + 1));
        const values: Record<string, string> = {}; statements(bb, out, values);
        const msg = /frappe\.(?:msgprint|show_alert)\(\s*((?:__\()?["'][^"']+["']\)?)/.exec(bb);
        const route = /frappe\.set_route\(\s*["']([^"']+)["']\s*(?:,\s*["']([^"']+)["'])?/.exec(bb);
        const action = Object.keys(values).length ? { type: "set_value" as const, values } : route ? { type: "route" as const, to: route[2] ? `/app/${route[2].toLowerCase().replace(/\s+/g, "-")}` : `/${route[1]}` } : { type: "message" as const, text: msg ? str(msg[1]!) : str(b[1]!) };
        out.buttons.push({ label: str(b[1]!), ...(tail?.[1] ? { group: str(tail[1]) } : {}), action } as never);
        rest = rest.replace(body.slice(b.index, be + 1 + (tail?.[0].length ?? 0)), "");
        bre.lastIndex = be + 1;
      }
      statements(rest, out, out.refresh.set);
      for (const m of rest.matchAll(/frm\.set_df_property\(\s*["'](\w+)["']\s*,\s*["'](\w+)["']\s*,\s*([^)]+)\)/g)) out.refresh.df.push({ fieldname: m[1]!, property: m[2]!, value: jsExpr(m[3]!) });
      for (const m of rest.matchAll(/frm\.toggle_display\(\s*["'](\w+)["']\s*,\s*([^)]+)\)/g)) out.refresh.df.push({ fieldname: m[1]!, property: "hidden", value: `!(${jsExpr(m[2]!)})` });
      for (const m of rest.matchAll(/frm\.toggle_reqd\(\s*["'](\w+)["']\s*,\s*([^)]+)\)/g)) out.refresh.df.push({ fieldname: m[1]!, property: "reqd", value: jsExpr(m[2]!) });
      const intro = /frm\.set_intro\(\s*((?:__\()?["'][^"']+["']\)?)/.exec(rest); if (intro) out.refresh.intro = str(intro[1]!);
    } else {
      const set: Record<string, string> = {}; statements(body, out, set);
      if (Object.keys(set).length) out.on_change[name] = set; else if (body.trim()) out.unsupported.push(name);
    }
  }
  return out;
}
