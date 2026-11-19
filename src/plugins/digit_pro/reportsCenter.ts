/**
 * Reports Center directory — built only from existing manifests and the generated report catalog, so nothing is
 * hand-listed twice: department report groups + DIGIT Pro analytical screens (nav.ts), every catalog report of the
 * department's ERPNext module, and the Compliance/Audit groups of the Reports service.
 */
import type { ReportEntry } from "@/lib/catalog";
import { DEPARTMENTS, SERVICES, type NavItem, type ProRoute } from "./nav";

export type ReportKind = "pro" | "preview" | "server" | "list" | "missing";
export type CenterArea = "accounting" | "selling" | "purchasing" | "inventory" | "assets" | "compliance";
export interface CenterEntry { key: string; label: string; area: CenterArea; kind: ReportKind; featured: boolean; item: NavItem; source?: string | undefined; filters: number; hint?: string | undefined }

const MODULE_AREA: Record<string, CenterArea> = { Accounts: "accounting", Selling: "selling", Buying: "purchasing", Stock: "inventory", Assets: "assets", Regional: "compliance" };

export function buildCenter(reports: ReportEntry[], runnable: (name: string) => boolean): CenterEntry[] {
  const byName = new Map(reports.map((r) => [r.name, r]));
  const out = new Map<string, CenterEntry>();
  const kindOf = (i: NavItem): ReportKind => {
    const t = i.target;
    if (t.kind === "pro") return "pro";
    if (t.kind === "missing") return "missing";
    if (t.kind === "report") { const r = byName.get(t.report); return runnable(t.report) || r?.status === "preview-computable" ? "preview" : "server"; }
    return "list";
  };
  const add = (i: NavItem, area: CenterArea, featured: boolean) => {
    const key = `${area}:${i.target.kind}:${i.label}:${i.target.kind === "pro" ? i.target.to : ""}`;
    const dup = [...out.values()].find((e) => e.label === i.label && e.item.target.kind === i.target.kind);
    if (dup) { if (featured) dup.featured = true; return; }
    const r = i.target.kind === "report" ? byName.get(i.target.report) : undefined;
    out.set(key, { key, label: i.label, area, kind: kindOf(i), featured, item: i, source: r?.ref_doctype, filters: r?.filters?.length ?? 0, hint: i.hint });
  };
  for (const d of DEPARTMENTS) {
    const area = (d.id === "accounting" ? "accounting" : d.id) as CenterArea;
    for (const g of d.groups) {
      const compliance = g.compliance === true;
      for (const i of g.items) {
        if (g.section === "reports") add(i, compliance ? "compliance" : area, true);
        else if (i.target.kind === "pro" || i.target.kind === "report") add(i, area, true);
      }
    }
  }
  const svc = SERVICES.find((s) => s.id === "reports")!;
  for (const g of svc.groups) if (/Tax|Audit/.test(g.label)) for (const i of g.items) add(i, "compliance", true);
  for (const r of reports) {
    const area = MODULE_AREA[r.module];
    if (area && r.app === "erpnext") add({ label: r.name, target: { kind: "report", report: r.name } }, area, false);
  }
  return [...out.values()].sort((a, b) => Number(b.featured) - Number(a.featured) || rank(a.kind) - rank(b.kind) || a.label.localeCompare(b.label));
}
const rank = (k: ReportKind) => ["pro", "preview", "server", "list", "missing"].indexOf(k);

export const AREAS: { id: CenterArea; label: string }[] = [
  { id: "accounting", label: "Accounting" }, { id: "selling", label: "Selling" }, { id: "purchasing", label: "Purchasing" },
  { id: "inventory", label: "Inventory" }, { id: "assets", label: "Fixed Assets" }, { id: "compliance", label: "Tax and Compliance" },
];
export const KIND_LABEL: Record<ReportKind, string> = { pro: "DIGIT Pro screen", preview: "Runs in preview", server: "Runs on DIGIT server", list: "Native list", missing: "Not available" };
export type { ProRoute };
