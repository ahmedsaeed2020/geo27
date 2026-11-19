import { useState, type HTMLAttributes, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";

/** Presentation only: source grouping and guarded transitions stay with each caller. */
export function KanbanBoard({ children, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div {...props} className={`core-kanban ${props.className ?? ""}`} data-core-kanban>{children}</div>;
}
export function KanbanColumn({ title, count, indicator, summary, onCreate, createLabel, children, ...props }: Omit<HTMLAttributes<HTMLElement>, "title"> & { title: ReactNode; count: number; indicator?: ReactNode; summary?: ReactNode; onCreate?: (() => void) | undefined; createLabel?: string }) {
  return <section {...props} className={`core-kanban-column ${props.className ?? ""}`}>
    <header className="core-kanban-heading"><div className="flex min-w-0 flex-1 items-center gap-2">{indicator}<h3 className="min-w-0 break-words text-sm font-semibold">{title}</h3><span className="ms-auto text-xs text-muted-foreground tabular-nums" data-no-i18n>{count}</span></div>{onCreate && <Button variant="ghost" size="icon" className="h-7 w-7" title={createLabel} aria-label={createLabel} onClick={onCreate}><Plus className="h-4 w-4" /></Button>}</header>
    {summary && <div className="core-kanban-summary">{summary}</div>}
    <div className="core-kanban-cards">{children}</div>
  </section>;
}
export function KanbanCard({ children, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div {...props} className={`core-kanban-card ${props.className ?? ""}`} data-core-kanban-card>{children}</div>;
}

/**
 * Optional incremental card loading per column (crm/frontend KanbanView "Load More": 20 cards per column page).
 * Callers keep the column count and summary on the full group; only the rendered cards are limited. Boards that do not
 * use it render exactly as before.
 */
export const KANBAN_PAGE = 20;
export function useKanbanLimits(step = KANBAN_PAGE) {
  const [shown, setShown] = useState<Record<string, number>>({});
  return {
    limit: (column: string) => shown[column] ?? step,
    more: (column: string) => setShown((s) => ({ ...s, [column]: (s[column] ?? step) + step })),
  };
}
export function KanbanMore({ shown, total, onMore, lang }: { shown: number; total: number; onMore: () => void; lang?: string }) {
  if (shown >= total) return null;
  const rest = total - shown;
  return <Button type="button" variant="ghost" size="sm" className="w-full text-xs" onClick={onMore} data-kanban-more data-remaining={rest}>
    {lang === "ar" ? "تحميل المزيد" : "Load more"} <span dir="ltr" className="tabular-nums" data-no-i18n>({rest.toLocaleString("en-US")})</span>
  </Button>;
}
