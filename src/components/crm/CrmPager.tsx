import { useNavigate, useSearch } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Shared CRM list paging (Leads/Deals, directory lists, Follow-up Center). Page lengths follow crm/frontend ListFooter
 * (20 / 50 / 100); DIGIT CRM opens at 50 rows. Page and page length live in the URL (`pg`, 1-based, and `pl`), so Back
 * and deep links return to the same page. Only the visible slice is rendered — counts, totals, selection and filters
 * keep using every matching record.
 */
export const PAGE_LENGTHS = [20, 50, 100] as const;
export const DEFAULT_PAGE_LENGTH = 50;
export type Page = { page: number; size: number; last: number; total: number; from: number; to: number; slice: <T>(rows: T[]) => T[]; go: (page: number) => void; resize: (size: number) => void };

export function pageOf(total: number, search: Record<string, unknown>): Omit<Page, "go" | "resize"> {
  const size = (PAGE_LENGTHS as readonly number[]).includes(Number(search["pl"])) ? Number(search["pl"]) : DEFAULT_PAGE_LENGTH;
  const last = Math.max(0, Math.ceil(total / size) - 1), asked = Math.floor(Number(search["pg"]) || 1) - 1;
  const page = Math.min(Math.max(0, asked), last), from = total ? page * size + 1 : 0, to = Math.min((page + 1) * size, total);
  return { page, size, last, total, from, to, slice: <T,>(rows: T[]) => rows.slice(page * size, page * size + size) };
}

export function usePage(total: number): Page {
  const search = useSearch({ strict: false }) as Record<string, unknown>;
  const nav = useNavigate();
  const p = pageOf(total, search);
  const write = (patch: Record<string, number | undefined>) => void nav({ to: ".", replace: true, search: ((prev: Record<string, unknown>) => {
    const n = { ...prev, ...patch } as Record<string, unknown>;
    if (!n["pg"] || n["pg"] === 1) delete n["pg"];
    if (!n["pl"] || n["pl"] === DEFAULT_PAGE_LENGTH) delete n["pl"];
    return n;
  }) as never });
  return { ...p, go: (page) => write({ pg: page + 1 }), resize: (size) => write({ pl: size, pg: undefined }) };
}

export function CrmPager({ p, lang, className }: { p: Page; lang: string; className?: string }) {
  const ar = lang === "ar";
  return <div className={`flex flex-wrap items-center gap-3 px-5 py-2 text-xs text-crm-muted ${className ?? ""}`} data-crm-pager data-page={p.page + 1} data-total={p.total}>
    <span dir="ltr" data-no-i18n data-crm-pager-range>{p.from.toLocaleString("en-US")}–{p.to.toLocaleString("en-US")} / {p.total.toLocaleString("en-US")}</span>
    <Button size="icon" variant="ghost" aria-label={ar ? "الصفحة السابقة" : "Previous page"} disabled={!p.page} onClick={() => p.go(p.page - 1)}><ChevronLeft className="rtl:rotate-180" /></Button>
    <span dir="ltr" data-no-i18n>{(p.page + 1).toLocaleString("en-US")} / {(p.last + 1).toLocaleString("en-US")}</span>
    <Button size="icon" variant="ghost" aria-label={ar ? "الصفحة التالية" : "Next page"} disabled={p.page >= p.last} onClick={() => p.go(p.page + 1)}><ChevronRight className="rtl:rotate-180" /></Button>
    <label className="ms-auto flex items-center gap-1" data-no-i18n>
      <span>{ar ? "صفوف لكل صفحة" : "Rows per page"}</span>
      <select className="crm-input w-auto py-0.5 text-xs" value={p.size} onChange={(e) => p.resize(Number(e.target.value))} aria-label={ar ? "صفوف لكل صفحة" : "Rows per page"}>
        {PAGE_LENGTHS.map((n) => <option key={n} value={n}>{n}</option>)}
      </select>
    </label>
  </div>;
}
