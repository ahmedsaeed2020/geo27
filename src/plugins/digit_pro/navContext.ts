/**
 * DIGIT Pro source-aware navigation context.
 * Each history entry remembers (a) where it was opened FROM (href + history index) and (b) which DIGIT Pro context
 * (department / shared service) it belongs to, both stored per entry key (`__TSR_key` in history.state) in
 * sessionStorage — so refresh, browser Back/Forward and one document reached from different contexts all restore the
 * same menu, heading and breadcrumb. No global "last department" variable decides ownership: a cold deep link resolves
 * to the canonical owner (resolveLocation in nav.ts).
 */
import type { AnyRouter, ParsedLocation } from "@tanstack/react-router";
import { ctxById, DEPARTMENTS, pageBySlug, resolveLocation, SERVICES, isServicePath, type CtxId, type NavResolution } from "./nav";

export interface Origin { href: string; path: string; index: number }
const KEY = "digit-pro:origins";
const CKEY = "digit-pro:ctx";
const read = <T,>(k: string): Record<string, T> => { try { return JSON.parse(sessionStorage.getItem(k) ?? "{}"); } catch { return {}; } };
const write = (k: string, m: Record<string, unknown>) => { const keys = Object.keys(m); if (keys.length > 300) delete m[keys[0]!]; try { sessionStorage.setItem(k, JSON.stringify(m)); } catch { /* storage full: context falls back to the resolver */ } };
const store = () => read<Origin>(KEY);
const st = (l: ParsedLocation) => (l.state ?? {}) as { __TSR_key?: string; __TSR_index?: number; key?: string };
export const entryKey = (l: ParsedLocation) => st(l).__TSR_key ?? st(l).key ?? "";

/** Pure rule: record an origin only on a forward push to a different page (not Back, not replace, not same-page search edits). */
export function shouldRecord(from: { path: string; index?: number | undefined } | undefined, to: { path: string; index?: number | undefined }) {
  return !!from && from.path !== to.path && (to.index ?? 0) > (from.index ?? 0);
}

/* ---------- Per-entry DIGIT Pro context ---------- */
// Stored per history entry as "ctx" or "ctx|section-slug" (the section workspace that hosts the location).
let lastCtx: CtxId | undefined;
let lastPage: string | undefined;
let pending: { path: string; ctx: CtxId; page?: string | undefined } | undefined;
const norm = (p: string) => { let x = p; try { x = decodeURIComponent(p); } catch { /* raw */ } return x.replace(/(.)\/$/, "$1"); };
const parse = (v: string | undefined): { ctx?: CtxId; page?: string } => { if (!v) return {}; const [c, pg] = v.split("|"); return ctxById(c) ? { ctx: c as CtxId, ...(pg ? { page: pg } : {}) } : {}; };
/** A menu/workspace click inside context `ctx` (and optionally section page `page`) is about to open `path`. */
export function enterContext(ctx: CtxId, path: string, page?: string) { pending = { ctx, path: norm(path), page }; }
/** Context + highlighted item for a location (render-time; reads the entry's stored context first). */
export function contextOf(l: ParsedLocation): NavResolution {
  const search = (l.search ?? {}) as Record<string, unknown>;
  if (typeof window === "undefined") return resolveLocation(l.pathname, search);
  const k = entryKey(l); const stored = parse(k ? read<string>(CKEY)[k] : undefined);
  const pend = pending && pending.path === norm(l.pathname) ? pending : undefined;
  const forced = stored.ctx ?? pend?.ctx;
  const page = stored.ctx ? stored.page : pend?.page;
  return resolveLocation(l.pathname, search, { forced, last: lastCtx, page, lastPage: lastCtx && (!forced || forced === lastCtx) ? lastPage : undefined });
}
function commit(l: ParsedLocation) {
  const k = entryKey(l); const r = contextOf(l);
  const val = r.page ? `${r.ctx}|${r.page.slug}` : r.ctx;
  if (k) { const m = read<string>(CKEY); if (!m[k] || pending?.path === norm(l.pathname)) { m[k] = val; write(CKEY, m); } const st = parse(m[k]); lastCtx = st.ctx ?? r.ctx; lastPage = st.ctx ? st.page : r.page?.slug; }
  else { lastCtx = r.ctx; lastPage = r.page?.slug; }
  pending = undefined;
}
/** Test hook: forget the in-memory tab context. */
export function resetContextMemory() { lastCtx = undefined; lastPage = undefined; pending = undefined; }

export function recordOrigins(router: AnyRouter): () => void {
  if (typeof window !== "undefined") commit(router.state.location);
  return router.subscribe("onResolved", (e) => {
    const from = e.fromLocation, to = e.toLocation; if (typeof window === "undefined") return;
    // A replace (same history slot, new entry key — e.g. a list writing its filters into the URL) keeps the slot's origin and context.
    const fk = from ? entryKey(from) : "", tk = entryKey(to);
    if (from && fk && tk && fk !== tk && (st(to).__TSR_index ?? 0) === (st(from).__TSR_index ?? 0)) {
      const o = store(); if (o[fk] && !o[tk]) { o[tk] = o[fk]; write(KEY, o); }
      const c = read<string>(CKEY); if (c[fk] && !c[tk]) { c[tk] = c[fk]; write(CKEY, c); }
    }
    commit(to);
    if (!from || !shouldRecord({ path: from.pathname, index: st(from).__TSR_index }, { path: to.pathname, index: st(to).__TSR_index })) return;
    const k = entryKey(to); if (!k) return;
    const m = store(); if (m[k]) return;
    m[k] = { href: from.href, path: from.pathname, index: st(from).__TSR_index ?? 0 };
    write(KEY, m);
  });
}

export const originOf = (l: ParsedLocation): Origin | undefined => (typeof window === "undefined" ? undefined : store()[entryKey(l)]);

export type PathKind = { kind: "form"; slug: string; app: string; name: string } | { kind: "list"; slug: string; app: string } | { kind: "dept"; id: string } | { kind: "section"; dept: string; slug: string } | { kind: "pro"; path: string } | { kind: "report"; name: string } | { kind: "other" };
export function classify(path: string): PathKind {
  let p = path; try { p = decodeURIComponent(path); } catch { /* raw */ }
  p = p.replace(/\/$/, "");
  let m = /^\/app\/([^/]+)\/([^/]+)\/(?!view\/)([^/]+)$/.exec(p); if (m && !["data-import"].includes(m[1]!)) return { kind: "form", app: m[1]!, slug: m[2]!, name: m[3]! };
  m = /^\/app\/([^/]+)\/([^/]+)(\/view\/tree)?$/.exec(p); if (m && !m[1]!.startsWith("data-")) return { kind: "list", app: m[1]!, slug: m[2]! };
  m = /^\/pro\/([^/]+)$/.exec(p); if (m && DEPARTMENTS.some((d) => d.id === m![1])) return { kind: "dept", id: m[1]! };
  m = /^\/pro\/([^/]+)\/([^/]+)$/.exec(p); if (m && pageBySlug(m[1]!, m[2]!)) return { kind: "section", dept: m[1]!, slug: m[2]! };
  if (/^\/pro\//.test(p)) return { kind: "pro", path: p };
  m = /^\/report\/(.+)$/.exec(p); if (m) return { kind: "report", name: m[1]! };
  return { kind: "other" };
}

const PRO_LABEL: Record<string, string> = {
  "/pro/finance": "Accounting Overview", "/pro/finance-intelligence": "Finance Intelligence", "/pro/accounts": "Chart of Accounts", "/pro/general-ledger": "General Ledger", "/pro/receivables": "Receivables", "/pro/payables": "Payables",
  "/pro/payments": "Payments & Allocation", "/pro/bank-reconciliation": "Bank Reconciliation", "/pro/cost-centers": "Cost Centers & Dimensions", "/pro/period-control": "Period Control",
  "/pro/trial-balance": "Trial Balance", "/pro/statements": "Financial Statements", "/pro/vat": "VAT Reports", "/pro/audit": "Audit & Exceptions", "/pro/dashboard": "Executive Dashboard",
  "/pro/selling-overview": "Selling Overview", "/pro/purchasing-overview": "Purchasing Overview", "/pro/inventory-overview": "Inventory Overview", "/pro/assets-overview": "Assets Overview",
  "/pro/collections": "Collections", "/pro/sales-analytics": "Sales Analytics", "/pro/delivered-not-billed": "Delivered Not Billed", "/pro/received-not-billed": "Received Not Billed",
  "/pro/open-purchase-orders": "Open Purchase Orders", "/pro/stock-balance": "Stock Balance", "/pro/stock-ledger": "Stock Ledger", "/pro/stock-value-reconciliation": "Stock Value Reconciliation", "/pro/warehouses": "Warehouses",
  "/pro/asset-register": "Asset Register", "/pro/depreciation": "Depreciation Review", "/pro/asset-disposal": "Sell or Scrap Asset",
  "/pro/order-fulfilment": "Order Fulfilment", "/pro/quotation-pipeline": "Quotation Pipeline", "/pro/sales-returns": "Returns & Credit Notes", "/pro/customer-360": "Customer 360", "/pro/item-360": "Item 360", "/pro/asset-360": "Asset 360", "/pro/supplier-360": "Supplier 360",
  ...Object.fromEntries(SERVICES.map((s) => [s.to, s.label])), "/pro/reports": "Reports Center",
};

/** Human label of a location (DocType names resolved through `dtName`, slug → DocType). */
export function labelOf(path: string, dtName: (slug: string) => string): string {
  const c = classify(path);
  switch (c.kind) {
    case "form": return decodeURIComponent(c.name);
    case "list": return dtName(c.slug);
    case "dept": return DEPARTMENTS.find((d) => d.id === c.id)!.all.label;
    case "section": return pageBySlug(c.dept, c.slug)!.label;
    case "pro": return PRO_LABEL[c.path] ?? "DIGIT Pro";
    case "report": return decodeURIComponent(c.name);
    default: return "DIGIT Pro";
  }
}

/** Canonical parent for a direct deep link (no recorded origin): form → its list; department screen → department overview. */
export function canonicalParent(path: string, prefer?: string): { to: string; params?: Record<string, string>; path: string } | undefined {
  const c = classify(path);
  if (c.kind === "form") return { to: "/app/$app/$doctype", params: { app: c.app, doctype: c.slug }, path: `/app/${c.app}/${c.slug}` };
  if (isServicePath(path)) return undefined;
  const r = resolveLocation(path, {}, { last: prefer as CtxId | undefined });
  const home = ctxById(r.ctx)?.home;
  if (!home || home.target.kind !== "pro" || home.target.to === path.replace(/\/$/, "") || r.where === "home") return undefined;
  if (c.kind === "dept" || c.kind === "section") return { to: home.target.to, path: home.target.to };
  if (c.kind === "pro" && !DEPARTMENTS.some((d) => d.id === r.ctx)) return undefined;
  return { to: home.target.to, path: home.target.to };
}

/** Business section workspace (else directory group) that owns a location inside a context, for the breadcrumb's third level. */
export function areaOf(ctx: string | undefined, path: string, search: Record<string, unknown> = {}): string | undefined {
  const c = ctxById(ctx); if (!c) return undefined;
  const r = resolveLocation(path, search, { forced: c.id });
  if (r.page) return r.page.label;
  if (r.section) return c.sections.find((s) => s.id === r.section)?.label;
  const d = DEPARTMENTS.find((x) => x.id === c.id);
  if (!d) return undefined;
  // Directory-only resources: name the directory group that lists them.
  const hit = d.groups.find((g) => g.items.some((i) => {
    const t = i.target; const p = path.replace(/\/$/, "");
    if (t.kind === "doctype" || t.kind === "tree") return new RegExp(`^/app/[^/]+/${t.doctype.toLowerCase().replace(/[^a-z0-9]+/g, "_")}(/|$)`).test(p);
    if (t.kind === "pro") return t.to === p;
    if (t.kind === "report") return p === `/report/${t.report}` || decodeURIComponent(p) === `/report/${t.report}`;
    return false;
  }));
  return hit?.label;
}
