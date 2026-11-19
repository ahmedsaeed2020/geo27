/**
 * Controlled Jinja subset for source Print Formats (no eval / new Function).
 * Supports: {{ expr | filter }}, {% if/elif/else/endif %}, {% for x in expr %}…{% else %}…{% endfor %} (loop.index etc.),
 * {% set x = expr %}, whitespace control ({%- -%}), comments {# #}, {% raw %}. Macros/imports/includes are skipped.
 * Expressions: paths, indexes, literals, lists, comparisons, and/or/not, in, ~, + - * /, ternary (a if c else b),
 * calls to whitelisted helpers given in ctx (e.g. _, get_formatted, frappe.utils.*). Unknown names render as "".
 */
type Ctx = Record<string, unknown>;
type Tok = { t: "text" | "out" | "stmt"; v: string };

function tokenize(src: string): Tok[] {
  const out: Tok[] = []; const re = /\{\{-?([\s\S]*?)-?\}\}|\{%-?([\s\S]*?)-?%\}|\{#[\s\S]*?#\}/g;
  let last = 0, m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    let text = src.slice(last, m.index);
    if (m[0].startsWith("{{-") || m[0].startsWith("{%-")) text = text.replace(/\s+$/, "");
    if (out.length && out[out.length - 1]!.t !== "text" && (out as Tok[] & { trimNext?: boolean }).trimNext) text = text.replace(/^\s+/, "");
    if (text) out.push({ t: "text", v: text });
    (out as Tok[] & { trimNext?: boolean }).trimNext = m[0].endsWith("-}}") || m[0].endsWith("-%}");
    if (m[1] !== undefined) out.push({ t: "out", v: m[1].trim() });
    else if (m[2] !== undefined) out.push({ t: "stmt", v: m[2].trim() });
    last = re.lastIndex;
  }
  let tail = src.slice(last);
  if ((out as Tok[] & { trimNext?: boolean }).trimNext) tail = tail.replace(/^\s+/, "");
  if (tail) out.push({ t: "text", v: tail });
  return out;
}

// ---------- expression parser ----------
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Node = any;
const OPS = ["==", "!=", ">=", "<=", ">", "<", "~", "+", "-", "*", "//", "/", "%", "(", ")", "[", "]", ",", ".", "|", ":", "{", "}", "="];
function lex(s: string): string[] {
  const t: string[] = []; let i = 0;
  while (i < s.length) {
    const c = s[i] as string;
    if (/\s/.test(c)) { i++; continue; }
    if (c === '"' || c === "'") { let j = i + 1, v = ""; while (j < s.length && s[j] !== c) { if (s[j] === "\\") j++; v += s[j++]; } t.push("\u0000" + v); i = j + 1; continue; }
    if (/[0-9]/.test(c)) { const m = /^[0-9]+(\.[0-9]+)?/.exec(s.slice(i))!; t.push(m[0]); i += m[0].length; continue; }
    if (/[A-Za-z_]/.test(c)) { const m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(s.slice(i))!; t.push(m[0]); i += m[0].length; continue; }
    const op = OPS.find((o) => s.startsWith(o, i)); if (op) { t.push(op); i += op.length; continue; }
    i++;
  }
  return t;
}
class P {
  i = 0; constructor(public t: string[]) {}
  peek(): string { return this.t[this.i] as string; } next(): string { return this.t[this.i++] as string; } eat(x: string) { if (this.peek() === x) { this.i++; return true; } return false; }
  parse(): Node { return this.cond(); }
  cond(): Node { const a = this.or(); if (this.peek() === "if") { this.next(); const c = this.or(); let b: Node = { k: "lit", v: "" }; if (this.eat("else")) b = this.cond(); return { k: "tern", a, c, b }; } return a; }
  or(): Node { let a = this.and(); while (this.eat("or")) a = { k: "or", a, b: this.and() }; return a; }
  and(): Node { let a = this.not(); while (this.eat("and")) a = { k: "and", a, b: this.not() }; return a; }
  not(): Node { if (this.eat("not")) return { k: "not", a: this.not() }; return this.cmp(); }
  cmp(): Node {
    let a = this.add();
    for (;;) {
      const p = this.peek();
      if (["==", "!=", ">=", "<=", ">", "<"].includes(p)) { this.next(); a = { k: "cmp", op: p, a, b: this.add() }; }
      else if (p === "in") { this.next(); a = { k: "in", a, b: this.add() }; }
      else if (p === "not" && this.t[this.i + 1] === "in") { this.i += 2; a = { k: "not", a: { k: "in", a, b: this.add() } }; }
      else if (p === "is") { this.next(); const neg = this.eat("not"); const test = this.next(); a = { k: "is", a, test, neg }; }
      else return a;
    }
  }
  add(): Node { let a = this.mul(); for (;;) { const p = this.peek(); if (p === "+" || p === "-" || p === "~") { this.next(); a = { k: "bin", op: p, a, b: this.mul() }; } else return a; } }
  mul(): Node { let a = this.unary(); for (;;) { const p = this.peek(); if (p === "*" || p === "/" || p === "//" || p === "%") { this.next(); a = { k: "bin", op: p, a, b: this.unary() }; } else return a; } }
  unary(): Node { if (this.eat("-")) return { k: "neg", a: this.unary() }; return this.filter(); }
  filter(): Node {
    let a = this.postfix();
    while (this.eat("|")) { const name = this.next(); const args: Node[] = []; if (this.eat("(")) { while (!this.eat(")") && this.peek() !== undefined) { args.push(this.parse()); this.eat(","); } } a = { k: "filter", name, a, args }; }
    return a;
  }
  postfix(): Node {
    let a = this.atom();
    for (;;) {
      if (this.eat(".")) a = { k: "get", a, key: { k: "lit", v: this.next() } };
      else if (this.eat("[")) { const key = this.parse(); this.eat("]"); a = { k: "get", a, key }; }
      else if (this.eat("(")) { const args: Node[] = []; const kw: Record<string, Node> = {}; while (!this.eat(")") && this.peek() !== undefined) { if (/^[A-Za-z_]/.test(this.peek()) && this.t[this.i + 1] === "=") { const n = this.next(); this.next(); kw[n] = this.parse(); } else args.push(this.parse()); this.eat(","); } a = { k: "call", f: a, args, kw }; }
      else return a;
    }
  }
  atom(): Node {
    const t = this.next();
    if (t === undefined) return { k: "lit", v: "" };
    if (t === "(") { const e = this.parse(); this.eat(")"); return e; }
    if (t === "[") { const items: Node[] = []; while (!this.eat("]") && this.peek() !== undefined) { items.push(this.parse()); this.eat(","); } return { k: "list", items }; }
    if (t === "{") { const items: [Node, Node][] = []; while (!this.eat("}") && this.peek() !== undefined) { const k = this.parse(); this.eat(":"); items.push([k, this.parse()]); this.eat(","); } return { k: "dict", items }; }
    if (t[0] === "\u0000") return { k: "lit", v: t.slice(1) };
    if (/^[0-9]/.test(t)) return { k: "lit", v: Number(t) };
    if (t === "true" || t === "True") return { k: "lit", v: true };
    if (t === "false" || t === "False") return { k: "lit", v: false };
    if (t === "none" || t === "None") return { k: "lit", v: null };
    return { k: "name", n: t };
  }
}
const truthy = (v: unknown) => Array.isArray(v) ? v.length > 0 : !!v && v !== "0";
const num = (v: unknown) => Number(v) || 0;
function getAttr(o: any, k: any): unknown {
  if (o == null) return undefined;
  if (typeof o === "object" && k in o) return o[k];
  if (k === "get" && typeof o === "object") return (f: string, d?: unknown) => (o[f] ?? d);
  if (k === "items" && typeof o === "object" && !Array.isArray(o)) return () => Object.entries(o);
  if (typeof o === "string") { if (k === "upper") return () => o.toUpperCase(); if (k === "lower") return () => o.toLowerCase(); if (k === "strip") return () => o.trim(); if (k === "replace") return (a: string, b: string) => o.split(a).join(b); if (k === "split") return (s = " ") => o.split(s); if (k === "startswith") return (s: string) => o.startsWith(s); }
  return undefined;
}
const FILTERS: Record<string, (v: any, ...a: any[]) => unknown> = {
  safe: (v) => v, e: (v) => v, escape: (v) => v, string: (v) => String(v ?? ""), int: (v) => Math.trunc(num(v)), float: (v) => num(v),
  upper: (v) => String(v ?? "").toUpperCase(), lower: (v) => String(v ?? "").toLowerCase(), title: (v) => String(v ?? "").replace(/\b\w/g, (c) => c.toUpperCase()),
  length: (v) => (v?.length ?? 0), count: (v) => (v?.length ?? 0), default: (v, d = "") => (v == null || v === "" ? d : v), d: (v, d = "") => (v == null || v === "" ? d : v),
  join: (v, s = "") => (Array.isArray(v) ? v.join(s) : v), round: (v, n = 0) => Number(num(v).toFixed(n)), abs: (v) => Math.abs(num(v)), first: (v) => v?.[0], last: (v) => v?.[v.length - 1],
  trim: (v) => String(v ?? "").trim(), replace: (v, a, b) => String(v ?? "").split(a).join(b), striptags: (v) => String(v ?? "").replace(/<[^>]+>/g, ""), list: (v) => Array.from(v ?? []),
  sum: (v, attribute?: string) => (v ?? []).reduce((s: number, x: any) => s + num(attribute ? x?.[attribute] : x), 0),
  selectattr: (v, a) => (v ?? []).filter((x: any) => truthy(x?.[a])), map: (v, ...a) => (v ?? []).map((x: any) => x?.[a[0]]), batch: (v, n) => { const o: unknown[][] = []; (v ?? []).forEach((x: unknown, i: number) => { if (i % n === 0) o.push([]); o[o.length - 1]!.push(x); }); return o; },
};
function ev(n: Node, c: Ctx): any {
  switch (n.k) {
    case "lit": return n.v;
    case "name": return n.n in c ? c[n.n] : undefined;
    case "get": return getAttr(ev(n.a, c), ev(n.key, c));
    case "call": { const f = ev(n.f, c); if (typeof f !== "function") return undefined; try { const args = n.args.map((a: Node) => ev(a, c)); if (Object.keys(n.kw).length) args.push(Object.fromEntries(Object.entries(n.kw).map(([k, v]) => [k, ev(v as Node, c)]))); return f(...args); } catch { return undefined; } }
    case "list": return n.items.map((a: Node) => ev(a, c));
    case "dict": return Object.fromEntries(n.items.map(([k, v]: [Node, Node]) => [ev(k, c), ev(v, c)]));
    case "or": { const a = ev(n.a, c); return truthy(a) ? a : ev(n.b, c); }
    case "and": { const a = ev(n.a, c); return truthy(a) ? ev(n.b, c) : a; }
    case "not": return !truthy(ev(n.a, c));
    case "neg": return -num(ev(n.a, c));
    case "tern": return truthy(ev(n.c, c)) ? ev(n.a, c) : ev(n.b, c);
    case "in": { const b = ev(n.b, c), a = ev(n.a, c); return Array.isArray(b) || typeof b === "string" ? b.includes(a) : b && typeof b === "object" ? a in b : false; }
    case "is": { const a = ev(n.a, c); const r = n.test === "defined" ? a !== undefined : n.test === "none" ? a == null : n.test === "string" ? typeof a === "string" : n.test === "number" ? typeof a === "number" : truthy(a); return n.neg ? !r : r; }
    case "cmp": { const a = ev(n.a, c), b = ev(n.b, c); switch (n.op) { case "==": return a == b; case "!=": return a != b; case ">": return num(a) > num(b); case "<": return num(a) < num(b); case ">=": return num(a) >= num(b); default: return num(a) <= num(b); } }
    case "bin": { const a = ev(n.a, c), b = ev(n.b, c); switch (n.op) { case "~": return String(a ?? "") + String(b ?? ""); case "+": return typeof a === "string" || typeof b === "string" ? String(a ?? "") + String(b ?? "") : num(a) + num(b); case "-": return num(a) - num(b); case "*": return num(a) * num(b); case "/": return num(b) ? num(a) / num(b) : 0; case "//": return num(b) ? Math.floor(num(a) / num(b)) : 0; default: return num(b) ? num(a) % num(b) : 0; } }
    case "filter": { const f = FILTERS[n.name]; const v = ev(n.a, c); return f ? f(v, ...n.args.map((a: Node) => ev(a, c))) : v; }
  }
  return undefined;
}
const cache = new Map<string, Node>();
export function evalJinjaExpr(src: string, c: Ctx): unknown {
  let n = cache.get(src); if (!n) { n = new P(lex(src)).parse(); cache.set(src, n); }
  return ev(n, c);
}

// ---------- template tree ----------
type TNode = { k: "text"; v: string } | { k: "out"; e: string } | { k: "if"; branches: [string | null, TNode[]][] } | { k: "for"; v: string; e: string; cond?: string | undefined; body: TNode[]; empty: TNode[] } | { k: "set"; v: string; e: string };
function build(toks: Tok[]): TNode[] {
  let i = 0;
  function block(stop: string[]): [TNode[], string] {
    const out: TNode[] = [];
    while (i < toks.length) {
      const t = toks[i++]!;
      if (t.t === "text") { out.push({ k: "text", v: t.v }); continue; }
      if (t.t === "out") { out.push({ k: "out", e: t.v }); continue; }
      const kw = t.v.split(/\s+/)[0] ?? ""; const arg = t.v.slice(kw.length).trim();
      if (stop.includes(kw)) return [out, t.v];
      if (kw === "if") {
        const branches: [string | null, TNode[]][] = []; let cond: string | null = arg;
        for (;;) { const [b, end] = block(["elif", "else", "endif"]); branches.push([cond, b]); const ek = end.split(/\s+/)[0] ?? ""; if (ek === "elif") cond = end.slice(4).trim(); else if (ek === "else") cond = null; else break; if (i >= toks.length) break; }
        out.push({ k: "if", branches });
      } else if (kw === "for") {
        const m = /^(.+?)\s+in\s+(.+?)(?:\s+if\s+(.+))?$/.exec(arg) ?? ["", "_", "[]"];
        const [body, end] = block(["else", "endfor"]); let empty: TNode[] = [];
        if (end.startsWith("else")) [empty] = block(["endfor"]);
        out.push({ k: "for", v: (m[1] ?? "_").trim(), e: m[2] ?? "[]", cond: m[3], body, empty });
      } else if (kw === "set" && arg.includes("=")) { const [v, ...e] = arg.split("="); out.push({ k: "set", v: (v ?? "").trim(), e: e.join("=") }); }
      else if (kw === "macro" || kw === "call" || kw === "filter" || kw === "block" && false) { block(["end" + kw]); }
      else if (kw === "raw") { let s = ""; while (i < toks.length && !(toks[i]!.t === "stmt" && toks[i]!.v === "endraw")) { const x = toks[i++]!; s += x.t === "text" ? x.v : x.t === "out" ? `{{ ${x.v} }}` : `{% ${x.v} %}`; } i++; out.push({ k: "text", v: s }); }
      // import / from / include / extends / block / endblock / trans → skipped (server-side template features)
    }
    return [out, ""];
  }
  return block([])[0];
}
function run(nodes: TNode[], c: Ctx, out: string[]) {
  for (const n of nodes) {
    if (n.k === "text") out.push(n.v);
    else if (n.k === "out") { const v = evalJinjaExpr(n.e, c); out.push(v == null || typeof v === "function" ? "" : typeof v === "object" ? "" : String(v)); }
    else if (n.k === "set") { const names = n.v.split(",").map((x) => x.trim()); const v = evalJinjaExpr(n.e, c); if (names.length > 1 && Array.isArray(v)) names.forEach((nm, i) => (c[nm] = v[i])); else c[names[0]!] = v; }
    else if (n.k === "if") { for (const [cond, body] of n.branches) if (cond === null || truthy(evalJinjaExpr(cond, c))) { run(body, c, out); break; } }
    else if (n.k === "for") {
      let it = evalJinjaExpr(n.e, c) as unknown; if (it && typeof it === "object" && !Array.isArray(it)) it = Object.entries(it);
      let arr = Array.isArray(it) ? it : []; const names = n.v.split(",").map((x) => x.trim());
      const sub = (x: unknown) => { const cc = Object.create(c); if (names.length > 1 && Array.isArray(x)) names.forEach((nm, i) => (cc[nm] = x[i])); else cc[names[0]!] = x; return cc; };
      if (n.cond) arr = arr.filter((x) => truthy(evalJinjaExpr(n.cond!, sub(x))));
      if (!arr.length) { run(n.empty, c, out); continue; }
      arr.forEach((x, i) => { const cc = sub(x); cc.loop = { index: i + 1, index0: i, first: i === 0, last: i === arr.length - 1, length: arr.length, revindex: arr.length - i }; run(n.body, cc, out); });
    }
  }
}
const tplCache = new Map<string, TNode[]>();
export function renderJinjaTemplate(tpl: string, ctx: Ctx): string {
  let t = tplCache.get(tpl); if (!t) { t = build(tokenize(tpl)); tplCache.set(tpl, t); }
  const out: string[] = []; run(t, Object.assign(Object.create(null), ctx), out);
  return sanitizeHtml(out.join(""));
}
/** Strip scripts, inline handlers and javascript: URLs from rendered print HTML. */
export function sanitizeHtml(h: string): string {
  return h.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "").replace(/javascript:/gi, "");
}
