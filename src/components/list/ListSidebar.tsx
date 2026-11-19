import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { reportsQuery, slugOf, LAYOUT_TYPES, TABLE_TYPES, type DocTypeMeta } from "@/lib/catalog";
import { adapter, type Doc } from "@/lib/adapter";
import type { Filter } from "@/lib/desk";
import type { ListLayout } from "@/lib/listLayouts";

/**
 * List sidebar (frappe/public/js/frappe/list/list_sidebar.js + list_sidebar_group_by.js): Assigned To,
 * Created By, Tags with counts, group-by fields with counts + "Edit Filters", saved filters (layouts),
 * Kanban boards and Reports for the DocType. Hidden by User Settings › Lists › Show sidebar.
 */
export function ListSidebar({ meta, docs, layouts, onFilter, onLayout }: {
  meta: DocTypeMeta; docs: Doc[]; layouts: ListLayout[]; onFilter: (f: Filter) => void; onLayout: (id: string) => void;
}) {
  const reps = useQuery(reportsQuery);
  const gkey = `digit-virtual-core:group-by:${meta.name}`;
  const candidates = meta.fields.filter((f) => f.fieldname && !LAYOUT_TYPES.has(f.fieldtype) && !TABLE_TYPES.has(f.fieldtype) && ["Link", "Select"].includes(f.fieldtype));
  const [groupBy, setGroupBy] = useState<string[]>(() => {
    try { const s = JSON.parse(localStorage.getItem(gkey) ?? "null"); if (Array.isArray(s)) return s; } catch { /* default */ }
    return candidates.filter((f) => f.in_standard_filter || f.fieldname === "status").slice(0, 3).map((f) => f.fieldname!);
  });
  const [edit, setEdit] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const count = (key: (d: Doc) => string[]) => {
    const m = new Map<string, number>();
    docs.forEach((d) => key(d).forEach((k) => k && m.set(k, (m.get(k) ?? 0) + 1)));
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  };
  const arr = (v: unknown): string[] => { if (Array.isArray(v)) return v.map(String); try { const j = JSON.parse(String(v ?? "[]")); return Array.isArray(j) ? j.map(String) : []; } catch { return String(v ?? "").split(",").filter(Boolean); } };
  const groups: { id: string; label: string; field: string; op: string; rows: [string, number][] }[] = [
    { id: "_assign", label: "Assigned To", field: "_assign", op: "like", rows: count((d) => arr(d["_assign"])) },
    { id: "owner", label: "Created By", field: "owner", op: "=", rows: count((d) => [String(d["owner"] ?? "Administrator")]) },
    { id: "_user_tags", label: "Tags", field: "_user_tags", op: "like", rows: count((d) => String(d["_user_tags"] ?? "").split(",").map((s) => s.trim()).filter(Boolean)) },
    ...groupBy.map((fn) => { const f = candidates.find((c) => c.fieldname === fn); return { id: fn, label: f?.label ?? fn, field: fn, op: "=", rows: count((d) => [String(d[fn] ?? "")]) }; }),
  ];
  const boards = adapter.list("Kanban Board").filter((b) => b["reference_doctype"] === meta.name);
  const reports = (reps.data ?? []).filter((r) => r.ref_doctype === meta.name).slice(0, 12);
  const saved = layouts.filter((l) => l.id !== "default");
  const item = "flex w-full items-center justify-between rounded px-2 py-1 text-start text-sm hover:bg-muted";
  return (
    <aside data-us="list-sidebar" data-list-sidebar className="w-52 shrink-0 space-y-3 text-sm">
      {groups.map((g) => (
        <div key={g.id} className="relative">
          <button type="button" className={item} onClick={() => setOpen(open === g.id ? null : g.id)} data-group-by={g.id}>
            <span>{g.label}</span><span className="text-xs text-muted-foreground">{g.rows.length ? g.rows.length : ""} ▾</span>
          </button>
          {open === g.id && (
            <div className="mt-1 max-h-56 overflow-auto rounded-md border border-border bg-popover p-1 shadow">
              {g.rows.map(([v, n]) => (
                <button key={v} type="button" className={item} onClick={() => { onFilter([g.field, g.op, v]); setOpen(null); }}>
                  <span className="truncate" data-no-i18n>{v}</span><span className="chip bg-muted">{n}</span>
                </button>
              ))}
              {!g.rows.length && <p className="px-2 py-1 text-xs text-muted-foreground">No records found</p>}
            </div>
          )}
        </div>
      ))}
      <div>
        <button type="button" className="px-2 text-xs text-primary hover:underline" onClick={() => setEdit(!edit)}>Edit Filters</button>
        {edit && (
          <div className="mt-1 max-h-48 space-y-0.5 overflow-auto rounded-md border border-border bg-popover p-2 text-xs" role="dialog" aria-label="Edit Filters">
            {candidates.map((f) => (
              <label key={f.fieldname} className="flex items-center gap-1.5">
                <input type="checkbox" checked={groupBy.includes(f.fieldname!)} onChange={(e) => { const n = e.target.checked ? [...groupBy, f.fieldname!] : groupBy.filter((x) => x !== f.fieldname); setGroupBy(n); localStorage.setItem(gkey, JSON.stringify(n)); }} />
                {f.label ?? f.fieldname}
              </label>
            ))}
          </div>
        )}
      </div>
      <Section title="Saved Filters">
        {saved.map((l) => <button key={l.id} type="button" className={item} onClick={() => onLayout(l.id)}><span data-no-i18n={l.builtin ? undefined : ""}>{l.name}</span></button>)}
        {!saved.length && <p className="px-2 text-xs text-muted-foreground">No saved filters</p>}
      </Section>
      <Section title="Kanban Boards">
        {boards.map((b) => <span key={b.name} className={item}>{b.name}</span>)}
        <span className="px-2 text-xs text-muted-foreground">{boards.length ? "" : "No Kanban boards"}</span>
      </Section>
      <Section title="Reports">
        {reports.map((r) => <Link key={r.name} to="/report/$name" params={{ name: r.name }} className={item}>{r.name}</Link>)}
        {!reports.length && <p className="px-2 text-xs text-muted-foreground">No reports</p>}
      </Section>
    </aside>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <div><div className="px-2 pb-1 text-[11px] font-semibold uppercase text-muted-foreground">{title}</div>{children}</div>;
}
export const _slug = slugOf;
