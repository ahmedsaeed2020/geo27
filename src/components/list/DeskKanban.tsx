/**
 * Desk Kanban view (frappe views/kanban): group by a Select field (or a saved Kanban Board), drag one card or every
 * selected card to another column, or use "Move to" (keyboard / phone). Moves go through lib/kanbanBoard.ts moveCards
 * (documentApi.saveDocument), so a refused card states why. Cards preview on hover and open in the shared Quick View;
 * long columns render only the cards in view (v16 card virtualization).
 */
import { useEffect, useMemo, useRef, useState, type DragEvent, type ReactElement } from "react";
import { toast } from "sonner";
import type { Doc } from "@/lib/adapter";
import type { DocField, DocTypeMeta } from "@/lib/catalog";
import { formatValue } from "@/lib/format";
import { cardWindow, defaultKanbanField, kanbanColumns, kanbanFields, moveCards, moveRefusal } from "@/lib/kanbanBoard";
import { useSessionUser } from "@/lib/session";
import { openQuickView } from "@/components/enterprise/QuickView";
import { KanbanBoard, KanbanColumn } from "@/components/kanban";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { COLOR_CLASS } from "@/lib/engines";
import { useLang } from "@/i18n";

const CARD_H = 92; // 84px card + 8px gap
const KEY = (dt: string) => `digit-virtual-core:kanban-field:${dt}`;
interface Props { meta: DocTypeMeta; docs: Doc[]; fields: DocField[]; titleOf: (d: Doc) => string; tone: (d: Doc) => string | undefined }

export function DeskKanban({ meta, docs, fields, titleOf, tone }: Props) {
  const ar = useLang() === "ar"; const user = useSessionUser();
  const options = kanbanFields(meta);
  const [field, setField] = useState<string | null>(() => defaultKanbanField(meta));
  useEffect(() => { try { const v = localStorage.getItem(KEY(meta.name)); if (v && options.some((f) => f.fieldname === v)) setField(v); } catch { /* ignore */ } }, [meta.name]); // eslint-disable-line react-hooks/exhaustive-deps
  const choose = (v: string) => { setField(v); setSel(new Set()); try { localStorage.setItem(KEY(meta.name), v); } catch { /* ignore */ } };
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [over, setOver] = useState<string | null>(null);
  const cols = useMemo(() => (field ? kanbanColumns(meta, field, docs) : []), [meta, field, docs]);
  if (!field) return <p className="panel p-4 text-sm text-muted-foreground" data-kanban-unavailable>{ar ? "لا يحتوي هذا النوع على حقل اختيار يمكن التجميع حسبه." : "This document type has no Select field to group a board by."}</p>;
  const fLabel = (f: DocField) => f.label ?? f.fieldname!;
  const move = (names: string[], value: string) => {
    const r = moveCards(meta, names, field, value, user);
    if (r.moved.length) toast.success(ar ? `نُقل ${r.moved.length} إلى «${value || "غير محدد"}»` : `Moved ${r.moved.length} to “${value || "Not set"}”`);
    if (r.refused.length) toast.error(<div data-kanban-refused>{r.refused.slice(0, 5).map((x) => <div key={x.name}><bdi data-no-i18n>{x.name}</bdi>: <span>{x.reason}</span></div>)}{r.refused.length > 5 ? <div>+{r.refused.length - 5}</div> : null}</div>);
    setSel(new Set());
  };
  const onDrop = (e: DragEvent, value: string) => {
    e.preventDefault(); setOver(null);
    try { const names = JSON.parse(e.dataTransfer.getData("application/x-digit-kanban") || "[]") as string[]; if (names.length) move(names, value); } catch { /* ignore */ }
  };
  const toggle = (n: string) => setSel((s) => { const x = new Set(s); if (x.has(n)) x.delete(n); else x.add(n); return x; });
  const detail = fields.filter((f) => f.fieldname !== field).slice(0, 3);
  return <div data-kanban-view={meta.name} data-kanban-field={field}>
    <div className="mb-2 flex flex-wrap items-center gap-2 text-sm">
      <label className="flex items-center gap-1"><span className="text-muted-foreground">{ar ? "تجميع حسب" : "Group by"}</span>
        <select className="rounded border border-border bg-card px-2 py-1" value={field} onChange={(e) => choose(e.target.value)} data-kanban-field-select>
          {options.map((f) => <option key={f.fieldname} value={f.fieldname}>{fLabel(f)}</option>)}
        </select></label>
      {sel.size > 0 && <div className="flex flex-wrap items-center gap-2 rounded-md bg-primary/10 px-2 py-1" data-kanban-selection={sel.size}>
        <span><bdi data-no-i18n>{sel.size}</bdi> {ar ? "محدد" : "selected"}</span>
        <label className="flex items-center gap-1"><span>{ar ? "نقل إلى" : "Move to"}</span>
          <select className="rounded border border-border bg-card px-2 py-0.5" value="" onChange={(e) => e.target.value !== "__" && move([...sel], e.target.value === "__none" ? "" : e.target.value)} data-kanban-move-to>
            <option value="__">—</option>{cols.map((c) => <option key={c.key || "__none"} value={c.key || "__none"}>{c.key || (ar ? "غير محدد" : "Not set")}</option>)}
          </select></label>
        <button type="button" className="text-xs text-primary hover:underline" onClick={() => setSel(new Set())} data-kanban-clear>{ar ? "إلغاء التحديد" : "Clear selection"}</button>
      </div>}
    </div>
    <KanbanBoard>
      {cols.map((c) => <KanbanColumn key={c.key || "__none"} title={c.key ? <span>{c.label}</span> : (ar ? "غير محدد" : "Not set")} count={c.docs.length}
        indicator={<span aria-hidden className={`inline-block size-2 rounded-full ${c.indicator ? COLOR_CLASS[c.indicator] ?? "bg-muted" : "bg-primary/40"}`} />}
        data-kanban-column={c.key} className={over === c.key ? "outline outline-2 outline-primary/50 rounded" : ""}
        onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; setOver(c.key); }} onDragLeave={() => setOver((o) => (o === c.key ? null : o))} onDrop={(e) => onDrop(e, c.key)}>
        <WindowedCards docs={c.docs} render={(d) => {
          const lock = moveRefusal(meta, field, d, user);
          return <article key={d.name} draggable={!lock} data-kanban-card={d.name} data-kanban-locked={lock ? "1" : undefined} aria-selected={sel.has(d.name)}
            onDragStart={(e) => { const names = sel.has(d.name) ? [...sel] : [d.name]; e.dataTransfer.setData("application/x-digit-kanban", JSON.stringify(names)); e.dataTransfer.effectAllowed = "move"; }}
            className={`core-kanban-card flex h-[84px] flex-col gap-0.5 overflow-hidden ${sel.has(d.name) ? "border-primary bg-primary/5" : ""} ${lock ? "" : "cursor-grab"}`}>
            <div className="flex items-start gap-1.5">
              <input type="checkbox" className="mt-0.5" checked={sel.has(d.name)} onChange={() => toggle(d.name)} aria-label={ar ? `تحديد ${d.name}` : `Select ${d.name}`} data-kanban-check={d.name} />
              <HoverCard openDelay={350} closeDelay={80}>
                <HoverCardTrigger asChild>
                  <button type="button" className="min-w-0 flex-1 truncate text-start font-medium hover:underline" data-kanban-open={d.name}
                    onClick={(e) => openQuickView({ kind: "doc", doctype: meta.name, name: d.name }, e.currentTarget)}><bdi data-no-i18n>{titleOf(d)}</bdi></button>
                </HoverCardTrigger>
                <HoverCardContent className="w-72 text-xs" data-kanban-preview={d.name}>
                  <p className="mb-1 font-semibold" data-no-i18n>{titleOf(d)}</p>
                  <p className="mb-2 text-muted-foreground" data-no-i18n>{d.name}</p>
                  <dl className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-1">
                    {fields.slice(0, 6).map((f) => <div key={f.fieldname} className="contents"><dt className="text-muted-foreground">{fLabel(f)}</dt><dd className="truncate" data-no-i18n>{formatValue(f.fieldtype, d[f.fieldname!], { options: f.options, doc: d }) || "—"}</dd></div>)}
                  </dl>
                  {lock && <p className="mt-2 text-muted-foreground" data-kanban-lock-reason>{lock}</p>}
                </HoverCardContent>
              </HoverCard>
            </div>
            <div className="truncate text-xs text-muted-foreground" data-no-i18n>{d.name}</div>
            <div className="flex min-w-0 gap-2 truncate text-xs" data-no-i18n>{detail.map((f) => { const v = formatValue(f.fieldtype, d[f.fieldname!], { options: f.options, doc: d }); return v ? <span key={f.fieldname} className={`truncate ${f.fieldname === "status" ? `chip ${COLOR_CLASS[tone(d) ?? ""] ?? ""}` : ""}`}>{v}</span> : null; })}</div>
          </article>;
        }} />
      </KanbanColumn>)}
    </KanbanBoard>
  </div>;
}

function WindowedCards({ docs, render }: { docs: Doc[]; render: (d: Doc) => ReactElement }) {
  const ref = useRef<HTMLDivElement>(null);
  const [st, setSt] = useState({ top: 0, h: 640 });
  useEffect(() => { const el = ref.current; if (el) setSt({ top: el.scrollTop, h: el.clientHeight || 640 }); }, [docs.length]);
  const w = cardWindow(docs.length, st.top, st.h, CARD_H);
  return <div ref={ref} className="max-h-[68vh] overflow-y-auto" data-kanban-window={`${w.start}-${w.end}/${docs.length}`}
    onScroll={(e) => { const el = e.currentTarget; setSt({ top: el.scrollTop, h: el.clientHeight }); }}>
    <div style={{ height: w.before }} aria-hidden />
    <div className="flex flex-col gap-2">{docs.slice(w.start, w.end).map(render)}</div>
    <div style={{ height: w.after }} aria-hidden />
  </div>;
}
