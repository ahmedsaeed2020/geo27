/**
 * Controlled interpreter for Frappe `depends_on` / `mandatory_depends_on` / `read_only_depends_on`.
 * Never executes source code. Supported grammar:
 *   literals (number, 'str', "str", true/false/null/undefined), [a, b] arrays,
 *   doc.x / doc["x"] / parent.x, unary ! and -, binary * / + - < > <= >= == != === !== && ||,
 *   ternary a ? b : c, parentheses, in_list(arr, v), arr.includes(v), x.length, frappe.session.user.
 * Anything else (frappe.* calls, cur_frm, erpnext.*, function bodies) -> { supported: false }.
 */
type V = unknown;
export interface EvalResult { value: boolean; supported: boolean; reason?: string }

class Unsupported extends Error {}

function tokenize(src: string): string[] {
  const out: string[] = [];
  const re = /\s*(===|!==|==|!=|<=|>=|&&|\|\||=>|\?\.|[()[\]!<>+\-*/,.?:]|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|\d+(?:\.\d+)?|[A-Za-z_$][\w$]*)/y;
  let i = 0;
  while (i < src.length) {
    if (/\s/.test(src[i]!)) { i++; continue; }
    re.lastIndex = i;
    const m = re.exec(src);
    if (!m) throw new Unsupported(`token at ${i}`);
    out.push(m[1]!);
    i = re.lastIndex;
  }
  return out;
}

export function evalExpr(expr: string, doc: Record<string, unknown>, extra?: Record<string, unknown>): { value: V; supported: boolean; reason?: string } {
  let toks: string[];
  try { toks = tokenize(expr); } catch (e) { return { value: true, supported: false, reason: String((e as Error).message) }; }
  let p = 0;
  const peek = () => toks[p];
  const eat = (t?: string) => { const x = toks[p++]; if (t && x !== t) throw new Unsupported(`expected ${t}`); return x; };
  // Frappe constants: no_value_type from frappe/model/__init__.py; developer_mode is 0 in this preview (no server boot).
  const NO_VALUE_TYPE = ["Section Break", "Column Break", "Tab Break", "HTML", "Table", "Table MultiSelect", "Button", "Image", "Fold", "Heading"];
  let scope: Record<string, V> = {
    doc, parent: doc, cur_frm: { doc },
    frappe: {
      session: { user: "Administrator" },
      boot: { developer_mode: 0 },
      model: { no_value_type: NO_VALUE_TYPE },
      datetime: { now_date: () => new Date().toISOString().slice(0, 10) },
    },
    ...(extra ?? {}),
  };

  function primary(): V {
    const t = eat();
    if (t === undefined) throw new Unsupported("end");
    if (t === "(") { const v = ternary(); eat(")"); return v; }
    if (t === "[") { const arr: V[] = []; while (peek() !== "]") { arr.push(ternary()); if (peek() === ",") eat(); } eat("]"); return arr; }
    if (t === "!") return !unaryPost(primary());
    if (t === "-") return -(Number(unaryPost(primary())));
    if (/^\d/.test(t)) return Number(t);
    if (t[0] === '"' || t[0] === "'") return t.slice(1, -1).replace(/\\(.)/g, "$1");
    if (t === "true") return true; if (t === "false") return false;
    if (t === "null" || t === "undefined") return null;
    if ((t === "cint" || t === "flt" || t === "Boolean") && peek() === "(") { eat("("); const a = ternary(); eat(")"); return t === "Boolean" ? !!a : t === "cint" ? Math.trunc(Number(a) || 0) : Number(a) || 0; }
    if (t === "__html2text" && peek() === "(") { eat("("); const a = ternary(); eat(")"); return String(a ?? "").replace(/<[^>]*>/g, "").trim(); }
    if (t === "in_list") { eat("("); const a = ternary(); eat(","); const b = ternary(); eat(")"); return Array.isArray(a) && a.includes(b); }
    if (t in scope) return scope[t];
    throw new Unsupported(`identifier ${t}`);
  }
  function unaryPost(v: V): V {
    for (;;) {
      if (peek() === "." || peek() === "?.") {
        eat(); const k = eat()!;
        if (k === "includes" && peek() === "(") { eat("("); const a = ternary(); eat(")"); v = Array.isArray(v) || typeof v === "string" ? (v as string).includes(a as string) : false; continue; }
        if (k === "indexOf" && peek() === "(") { eat("("); const a = ternary(); eat(")"); v = Array.isArray(v) || typeof v === "string" ? (v as string).indexOf(a as string) : -1; continue; }
        if (k === "split" && peek() === "(") { eat("("); const a = ternary(); eat(")"); v = typeof v === "string" ? v.split(String(a)) : []; continue; }
        if (k === "pop" && peek() === "(") { eat("("); eat(")"); v = Array.isArray(v) ? [...(v as V[])].pop() : undefined; continue; }
        if (k === "toLowerCase" && peek() === "(") { eat("("); eat(")"); v = typeof v === "string" ? v.toLowerCase() : v; continue; }
        if (k === "toUpperCase" && peek() === "(") { eat("("); eat(")"); v = typeof v === "string" ? v.toUpperCase() : v; continue; }
        if ((k === "some" || k === "every") && peek() === "(") {
          // arr.some((item) => expr) — parse the arrow body once, re-evaluate per element.
          eat("("); eat("("); const param = eat()!; eat(")"); eat("=>");
          const start = p;
          const runBody = (item: V) => { const prev = scope; scope = { ...scope, [param]: item }; try { p = start; return ternary(); } finally { scope = prev; } };
          runBody(undefined); // validate + find body end
          const end = p;
          const arr = Array.isArray(v) ? (v as V[]) : [];
          v = k === "some" ? arr.some((it) => !!runBody(it)) : arr.every((it) => !!runBody(it));
          p = end; eat(")");
          continue;
        }
        if (k === "length") { v = v == null ? 0 : (v as string).length ?? 0; continue; }
        if (peek() === "(") {
          if (v === (scope["frappe"] as Record<string, V>)?.["datetime"] && k === "now_date") { eat("("); eat(")"); v = new Date().toISOString().slice(0, 10); continue; }
          throw new Unsupported(`call .${k}()`);
        }
        if (v === scope["frappe"] && !["session", "boot", "model", "datetime"].includes(k)) throw new Unsupported(`frappe.${k}`);
        v = v == null ? undefined : (v as Record<string, V>)[k];
      } else if (peek() === "[") { eat(); const k = ternary(); eat("]"); v = v == null ? undefined : (v as Record<string, V>)[String(k)]; }
      else if (peek() === "(") throw new Unsupported("function call");
      else return v;
    }
  }
  const PREC: Record<string, number> = { "||": 1, "&&": 2, "==": 3, "!=": 3, "===": 3, "!==": 3, "<": 4, ">": 4, "<=": 4, ">=": 4, "+": 5, "-": 5, "*": 6, "/": 6 };
  function binary(min: number): V {
    let left = unaryPost(primary());
    for (;;) {
      const op = peek(); const pr = op ? PREC[op] : undefined;
      if (pr === undefined || pr < min) return left;
      eat();
      const right = binary(pr + 1);
      const l = left as never, r = right as never;
      switch (op) {
        case "||": left = left || right; break; case "&&": left = left && right; break;
        // eslint-disable-next-line eqeqeq
        case "==": left = l == r; break; case "!=": left = l != r; break;
        case "===": left = l === r; break; case "!==": left = l !== r; break;
        case "<": left = l < r; break; case ">": left = l > r; break; case "<=": left = l <= r; break; case ">=": left = l >= r; break;
        case "+": left = (l as number) + (r as number); break; case "-": left = (l as number) - (r as number); break;
        case "*": left = (l as number) * (r as number); break; case "/": left = (l as number) / (r as number); break;
      }
    }
  }
  function ternary(): V {
    const c = binary(1);
    if (peek() === "?") { eat(); const a = ternary(); eat(":"); const b = ternary(); return c ? a : b; }
    return c;
  }
  try {
    const v = ternary();
    if (p < toks.length) throw new Unsupported(`trailing ${toks[p]}`);
    return { value: v, supported: true };
  } catch (e) {
    return { value: true, supported: false, reason: e instanceof Unsupported ? e.message : "error" };
  }
}

/** Frappe semantics: "eval:<expr>" or a bare fieldname (truthy check). Unsupported expressions default to visible. */
export function evalDependsSafe(expr: string | undefined, doc: Record<string, unknown>): EvalResult {
  if (!expr) return { value: true, supported: true };
  const e = expr.trim();
  if (e.startsWith("eval:")) {
    const r = evalExpr(e.slice(5).trim().replace(/;$/, "").replace(/frappe\.utils\.html2text\s*\(/g, "__html2text("), doc);
    return r.reason !== undefined ? { value: !!r.value, supported: r.supported, reason: r.reason } : { value: !!r.value, supported: r.supported };
  }
  if (e.startsWith("fn:")) return { value: true, supported: false, reason: "fn: form script (server/client controller)" };
  // frappe form/layout.js evaluate_depends_on_value: any other string is a literal doc[expression] lookup
  // (so "doc.x" without eval: resolves to undefined in Frappe too and the field stays hidden).
  const v = doc[e]; return { value: Array.isArray(v) ? v.length > 0 : !!v, supported: true };
}
