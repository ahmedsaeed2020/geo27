/**
 * M-05 command discovery (BC Tell Me / SAP search) inside the locked DIGIT Pro shell: the Core awesomebar gains the
 * Pro destinations the user may open — department overviews, the 20 section workspaces, Pro screens, native lists /
 * trees / reports from the navigation manifest — and "New <document>" actions for department quick DocTypes the user
 * may create. Matching folds Arabic letter variants and searches both English and Arabic labels. Active only while
 * DIGIT Pro is the enabled, active experience; permissions use the same rules as the sidebar.
 */
import { registerSearchProvider, matchRank, type SearchHit, type SearchContext } from "@/components/desk/searchProviders";
import { adapter } from "@/lib/adapter";
import { cachedMeta } from "@/lib/catalog";
import { canReadType } from "@/lib/scope";
import { currentUser, hasPerm, userRoles } from "@/lib/session";
import { getActiveExperience } from "../theme";
import { isEnabled } from "../runtime";
import { CONTEXTS, DEPARTMENTS, NAV_AR, PRO_SOURCE, ctxItems, dtOf, pageBySlug, pageItems, slug, targetHref, type NavItem } from "./nav";
import { enterContext } from "./navContext";
import { translateTo } from "@/i18n";

/** Arabic label: navigation dictionary first, then the shared display dictionary / glossary. */
const arOf = (s: string): string | undefined => { const v = NAV_AR[s] ?? translateTo(s, "ar"); return v && v !== s ? v : undefined; };

const ADMIN = "Administrator";
const KIND_HINT: Record<string, [string, string]> = {
  pro: ["Page", "صفحة"], dept: ["Department", "قسم"], section: ["Section workspace", "مساحة عمل"], doctype: ["List", "قائمة"], tree: ["Tree", "شجرة"],
  report: ["Report", "تقرير"], page: ["Page", "صفحة"], core: ["Page", "صفحة"], action: ["Action", "إجراء"],
};

/** Same permission rule as the sidebar resolver (useNavResolver), without React. */
export function itemAllowed(i: NavItem, ctx: Pick<SearchContext, "appOf" | "reportRoles">, user = currentUser()): boolean {
  const t = i.target; const roles = userRoles(user);
  if (t.kind === "missing" || t.kind === "dialog") return false;
  if (i.roles && user !== ADMIN && !i.roles.some((x) => roles.includes(x))) return false;
  if (t.kind === "doctype" || t.kind === "tree") return !!ctx.appOf(t.doctype) && canReadType(t.doctype, user);
  if (t.kind === "pro") { const need = PRO_SOURCE[t.to]; return !need || user === ADMIN || need.every((d) => canReadType(d, user)); }
  if (t.kind === "section") { const pg = pageBySlug(t.dept, t.section); if (!pg) return false; if (user === ADMIN) return true; return [...new Set(pageItems(pg).flatMap((x) => dtOf(x.target)))].some((d) => !!ctx.appOf(d) && canReadType(d, user)); }
  if (t.kind === "report") { const r = ctx.reportRoles?.(t.report); if (r === undefined) return false; return user === ADMIN || !r.length || r.some((x) => roles.includes(x)); }
  return true;
}

export function proSearch(q: string, ctx: SearchContext): SearchHit[] {
  if (getActiveExperience() !== "digit_pro" || !isEnabled("digit_pro")) return [];
  const ar = ctx.lang === "ar"; const user = currentUser();
  const seen = new Set<string>(); const out: SearchHit[] = [];
  for (const c of CONTEXTS) for (const i of ctxItems(c)) {
    const h = targetHref(i.target, ctx.appOf); if (!h) continue;
    const key = JSON.stringify(h); if (seen.has(key)) continue;
    const arLabel = arOf(i.label);
    const rank = Math.max(matchRank(q, i.label), arLabel ? matchRank(q, arLabel) : 0);
    if (!rank || !itemAllowed(i, ctx, user)) continue;
    seen.add(key);
    const kind = i.target.kind; const where = ar ? arOf(c.label) ?? c.label : c.label;
    // department-scoped results keep the department context when opened (same as clicking it in that department)
    out.push({ label: ar ? arLabel ?? i.label : i.label, hint: `${(KIND_HINT[kind] ?? KIND_HINT["page"]!)[ar ? 1 : 0]} · ${where}`, score: rank * 10 + (kind === "section" || kind === "dept" || kind === "pro" ? 3 : 1), href: h,
      ...(c.kind === "department" ? { run: (go) => { enterContext(c.id, hrefPath(h)); go(h); } } : {}) });
  }
  for (const d of DEPARTMENTS) for (const dt of d.quick) {
    const m = cachedMeta(dt); const app = ctx.appOf(dt);
    if (!m || !app || m.issingle || m.istable || !hasPerm(m, "create", undefined, user)) continue;
    const en = `New ${dt}`, arDt = arOf(dt), arL = `جديد: ${arDt ?? dt}`;
    const rank = Math.max(matchRank(q, en), matchRank(q, arL), matchRank(q, dt), arDt ? matchRank(q, arDt) : 0);
    if (!rank || seen.has(`new:${dt}`)) continue;
    seen.add(`new:${dt}`);
    out.push({ label: ar ? arL : en, hint: `${KIND_HINT["action"]![ar ? 1 : 0]} · ${ar ? arOf(d.label) ?? d.label : d.label}`, score: rank * 10,
      run: (go) => { const doc = adapter.insert(m); const path = `/app/${app}/${slug(dt)}/${doc.name}`; enterContext(d.id, path); go({ to: "/app/$app/$doctype/$name", params: { app, doctype: slug(dt), name: doc.name } }); } });
  }
  return out;
}

function hrefPath(h: { to: string; params?: Record<string, string> }): string {
  let p = h.to; for (const [k, v] of Object.entries(h.params ?? {})) p = p.replace(`$${k}`, encodeURIComponent(v)); return p;
}

registerSearchProvider("digit_pro", proSearch);
