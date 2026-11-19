/**
 * Enterprise «التركيز الآن» list (CRM C3-02, owner 2026-11-17): what needs action on one record now, above its history —
 * filter chips by kind with counts, then rows with a 3px start rule in their tone (red overdue, amber soon, blue to do),
 * a kind tag, the title, a reason and the date. Apps pass the rows (already ordered) and links; nothing here decides.
 */
import { useState, type ReactNode } from "react";

export type FocusTone = "bad" | "warn" | "info";
export interface FocusRow { key: string; kind: string; kindLabel: ReactNode; tone: FocusTone; title: ReactNode; sub?: ReactNode; when?: ReactNode; link?: ((node: ReactNode) => ReactNode) | undefined; /** one-click actions at the row end (CRM C-01) */ actions?: ReactNode; attrs?: Record<string, string> | undefined }
export function FocusList({ title, sub, rows, kinds, ar, empty, attrs }: {
  title: ReactNode; sub?: ReactNode; rows: FocusRow[]; kinds: { key: string; label: ReactNode }[]; ar: boolean; empty?: ReactNode; attrs?: Record<string, string> | undefined;
}) {
  const [kind, setKind] = useState<string>("");
  const shown = kind ? rows.filter((r) => r.kind === kind) : rows;
  const n = (k: string) => rows.filter((r) => r.kind === k).length;
  return (
    <section className="ek-card" data-ek-focus={rows.length} data-ek-focus-kind={kind || "all"} {...attrs}>
      <header className="ek-card-head"><div className="min-w-0"><h3 className="ek-h3">{title}</h3>{sub && <p className="ek-card-sub">{sub}</p>}</div>
        <span className="ek-sb-count tabular-nums" data-no-i18n>{rows.length}</span></header>
      <div className="ek-focus-filters" role="group" aria-label={ar ? "تصفية حسب النوع" : "Filter by kind"}>
        <button type="button" className="ek-focus-chip" aria-pressed={!kind} onClick={() => setKind("")} data-ek-focus-filter="">{ar ? "الكل" : "All"} <b data-no-i18n>{rows.length}</b></button>
        {kinds.map((k) => <button key={k.key} type="button" className="ek-focus-chip" aria-pressed={kind === k.key} disabled={!n(k.key)} onClick={() => setKind(kind === k.key ? "" : k.key)} data-ek-focus-filter={k.key}>{k.label} <b data-no-i18n>{n(k.key)}</b></button>)}
      </div>
      {!shown.length ? <p className="ek-card-pad pt-0 text-sm text-muted-foreground" data-ek-focus-empty>{empty ?? (ar ? "لا يوجد ما يحتاج إجراءً الآن." : "Nothing needs action now.")}</p> :
        <ol className="ek-focus-rows">{shown.map((r) => {
          const body = <><span className="ek-focus-title">{r.title}</span>{r.sub && <span className="ek-focus-sub"> · {r.sub}</span>}</>;
          return <li key={r.key} data-tone={r.tone} data-ek-focus-row={r.kind} data-has-actions={r.actions ? "" : undefined} {...r.attrs}>
            <span className="ek-focus-kind" data-kind={r.kind}>{r.kindLabel}</span>
            <span className="ek-focus-main">{r.link ? r.link(body) : body}</span>
            {r.when && <span className="ek-focus-when" data-no-i18n>{r.when}</span>}
            {r.actions && <span className="ek-focus-act">{r.actions}</span>}
          </li>;
        })}</ol>}
    </section>
  );
}
