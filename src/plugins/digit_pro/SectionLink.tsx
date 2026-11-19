import type { MouseEvent } from "react";
import { openQuickView } from "@/components/enterprise/QuickView";
import { isPlainClick } from "@/lib/reportLinks";
/** Shared link + label helpers for section workspaces (kept separate so panels and the page frame import without cycles). */
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import type { Bi, Drill } from "./command";
import { enterContext } from "./navContext";
import { slug, type SectionPage } from "./nav";
import { NavText, useNavResolver } from "./ProSidebar";
import { SourceState } from "./ProFrame";

/** `hub_*` keys hold the Documents & work hub state (register, search, status, open Document 360) so Back restores it. */
export interface SectionSearch { tab?: string | undefined; company?: string | undefined; as_of?: string | undefined; side?: string | undefined; bucket?: string | undefined; q?: string | undefined; due?: string | undefined; hub_dt?: string | undefined; hub_q?: string | undefined; hub_st?: string | undefined; hub_doc?: string | undefined; cmp?: string | undefined }
export const SECTION_KEYS = ["tab", "company", "as_of", "side", "bucket", "q", "due", "hub_dt", "hub_q", "hub_st", "hub_doc", "cmp"] as const;
export const bi = (ar: boolean, x: Bi) => (ar ? x[1] : x[0]);

/** Router link for any Drill that records this section as the destination's context (sidebar highlight, breadcrumb, Back). */
export function SecLink({ drill, page, className, children, title, qvTitle, ...data }: { drill: Drill; page: SectionPage; className?: string | undefined; children: ReactNode; title?: string | undefined; qvTitle?: string | undefined } & Record<`data-${string}`, string | number | undefined>) {
  const { appOf } = useNavResolver();
  const h = drillHref(drill, appOf);
  // Enterprise Quick View: a plain click on a document or KPI/list drill opens it on the same screen (modifier click = full page)
  const quick = (e: MouseEvent<HTMLAnchorElement>) => {
    if (!isPlainClick(e)) return false;
    if (drill.kind === "doc" && drill.name !== "new" && !drill.name.startsWith("new-")) { e.preventDefault(); openQuickView({ kind: "doc", doctype: drill.doctype, name: drill.name }, e.currentTarget); return true; }
    if (drill.kind === "list" && Array.isArray(drill.filters)) { e.preventDefault(); openQuickView({ kind: "list", doctype: drill.doctype, filters: drill.filters as never, title: qvTitle || title || (e.currentTarget.textContent ?? drill.doctype).trim().slice(0, 80) }, e.currentTarget); return true; }
    return false;
  };
  return <Link to={h.to as never} params={h.params as never} search={(h.search ?? {}) as never} className={className} title={title} aria-haspopup={(drill.kind === "doc" && drill.name !== "new" && !drill.name.startsWith("new-")) || drill.kind === "list" ? "dialog" : undefined} onClick={(e) => { if (!quick(e)) enterContext(page.dept, h.path, page.slug); }} {...data}>{children}</Link>;
}
export function drillHref(drill: Drill, appOf: (dt: string) => string | undefined): { to: string; params?: Record<string, string>; search?: Record<string, unknown>; path: string } {
  if (drill.kind === "pro") return { to: drill.to, search: drill.search, path: drill.to };
  if (drill.kind === "list") { const app = appOf(drill.doctype) ?? "erpnext"; return { to: "/app/$app/$doctype", params: { app, doctype: slug(drill.doctype) }, search: { filters: JSON.stringify(drill.filters) }, path: `/app/${app}/${slug(drill.doctype)}` }; }
  if (drill.kind === "doc") { const app = appOf(drill.doctype) ?? "erpnext"; return { to: "/app/$app/$doctype/$name", params: { app, doctype: slug(drill.doctype), name: drill.name }, path: `/app/${app}/${slug(drill.doctype)}/${drill.name}` }; }
  return { to: "/report/$name", params: { name: drill.name }, search: drill.filters, path: `/report/${drill.name}` };
}


/** Source state with the DocType label translated (SourceState prints raw names, which would leave English on Arabic screens). */
export function SecState({ status, doctype }: { status: "denied" | "unavailable" | "empty"; doctype?: string | undefined }) {
  return <div className="flex flex-wrap items-baseline gap-x-1.5" data-dp-sec-state={status}><SourceState status={status} />{doctype && <span className="text-xs text-muted-foreground">· <NavText label={doctype} /></span>}</div>;
}
