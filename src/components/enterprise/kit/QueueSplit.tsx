/**
 * Enterprise queue → record → next step (Construction phase 4 C4-05): the list stays on the side and the chosen record
 * opens beside it (EntSplit; phones show one pane at a time), with «الخطوة التالية» and a step counter («2 من 5»), plus
 * the shared change log that expands each saved version old → new per field. Apps pass the list, the order of keys and
 * the record pane; nothing here decides or writes.
 */
import { useState, type ReactNode } from "react";
import { EntSplit } from "../Surfaces";
import { changeLog, type ChangeEntry, type FieldChange } from "@/lib/changeLog";
import { translateTo } from "@/i18n";
const DOCSTATUS: Record<string, [string, string]> = { "0": ["Draft", "مسودة"], "1": ["Submitted", "معتمد"], "2": ["Cancelled", "ملغى"] };
import { fmtDate } from "@/lib/format";
import { userName } from "../ApprovalPath";

const tx = (ar: boolean, en: string, a: string) => (ar ? a : en);
/** «حقلًا واحدًا» / «حقلين» / «7 حقول» / «12 حقلًا» (Arabic number agreement). */
const arFields = (k: number) => (k === 1 ? "حقلًا واحدًا" : k === 2 ? "حقلين" : k <= 10 ? `${k} حقول` : `${k} حقلًا`);
export function QueueSplit({ list, keys, open, onOpen, onClose, title, children, ar, attrs }: {
  list: ReactNode; keys: string[]; open?: string | undefined; onOpen: (k: string) => void; onClose: () => void; title?: ReactNode; children?: ReactNode; ar: boolean; attrs?: Record<string, string> | undefined;
}) {
  const pos = open ? keys.indexOf(open) : -1;
  const next = pos >= 0 ? keys[pos + 1] : undefined, prev = pos > 0 ? keys[pos - 1] : undefined;
  const detail = open ? (
    <div className="grid gap-3" data-queue-detail={open}>
      <nav className="ek-qnav" aria-label={tx(ar, "Queue position", "الموضع في القائمة")}>
        <span className="tabular-nums" data-queue-counter={`${pos + 1}/${keys.length}`}>{pos >= 0 ? tx(ar, `${pos + 1} of ${keys.length}`, `${pos + 1} من ${keys.length}`) : tx(ar, "Done — no longer in the queue", "تم — لم يعد في القائمة")}</span>
        <span className="ms-auto flex gap-1.5">
          <button type="button" className="btn-ghost min-h-9 text-xs" disabled={!prev} onClick={() => prev && onOpen(prev)} data-queue-prev>{tx(ar, "‹ Previous", "السابق ›")}</button>
          <button type="button" className="btn-primary min-h-9 text-xs" disabled={!next && !(pos < 0 && keys[0])} onClick={() => { const k = next ?? (pos < 0 ? keys[0] : undefined); if (k) onOpen(k); }} data-queue-next>{tx(ar, "Next step ›", "الخطوة التالية ‹")}</button>
        </span>
      </nav>
      {children}
    </div>
  ) : undefined;
  return <div {...attrs}><EntSplit list={list} detail={detail} onCloseDetail={onClose} detailTitle={title} /></div>;
}

/** The change log of one document: newest version first; each expands to its fields old → new. */
export function ChangeLog({ doctype, name, ar, label, value, limit = 12, extra }: { /** entries from the record's own history the host reads elsewhere (e.g. a CRM deal's stage log), merged newest first */ extra?: ChangeEntry[] | undefined; doctype: string; name: string; ar: boolean; label?: ((field: string, fallback: string) => string) | undefined; /** display of a stored value (e.g. a linked record's name instead of its code); undefined keeps the default */ value?: ((field: string, v: string) => string | undefined) | undefined; limit?: number }) {
  const entries = [...changeLog(doctype, name), ...(extra ?? [])].sort((x, y) => (x.at < y.at ? 1 : x.at > y.at ? -1 : 0)).slice(0, limit);
  // state / Select values are shown in the reader's language (display only); docstatus reads as draft / submitted / cancelled
  const val = (c: FieldChange, v: string) => !v ? "—" : value?.(c.field, v) ?? (c.field === "docstatus" ? (DOCSTATUS[v] ? DOCSTATUS[v]![ar ? 1 : 0] : v) : c.select ? translateTo(v, ar ? "ar" : "en") : v);
  const [openKey, setOpen] = useState<string | null>(entries[0]?.key ?? null);
  if (!entries.length) return <p className="text-xs text-muted-foreground" data-change-log="0">{tx(ar, "No saved changes yet.", "لا توجد تعديلات محفوظة بعد.")}</p>;
  return (
    <ol className="ek-clog" data-change-log={entries.length}>
      {entries.map((e) => {
        const isOpen = openKey === e.key;
        return <li key={e.key} className="ek-clog-item" data-open={isOpen || undefined}>
          <button type="button" className="ek-clog-head" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : e.key)} data-change-entry={e.key}>
            <span aria-hidden>{isOpen ? "▾" : "▸"}</span>
            <bdi data-no-i18n className="font-medium">{userName(e.who)}</bdi>
            <span className="text-muted-foreground" data-no-i18n>{fmtDate(e.at.slice(0, 10))}{e.at.length > 10 ? ` ${e.at.slice(11, 16)}` : ""}</span>
            <span className="ms-auto text-xs text-muted-foreground">{tx(ar, `${e.changes.length} field${e.changes.length === 1 ? "" : "s"} changed`, `عدّل ${arFields(e.changes.length)}`)}{e.added ? tx(ar, ` · ${e.added} row(s) added`, ` · أُضيف ${e.added} صف`) : ""}{e.removed ? tx(ar, ` · ${e.removed} removed`, ` · حُذف ${e.removed}`) : ""}</span>
          </button>
          {isOpen && e.changes.length > 0 && <table className="ek-clog-table"><tbody>{e.changes.map((c, i) => <tr key={`${c.field}:${i}`} data-change-field={c.field}>
            <th scope="row">{label ? label(c.field, c.label) : c.label}{c.table ? <span className="text-muted-foreground"> · {tx(ar, `row ${c.row ?? "?"}`, `صف ${c.row ?? "?"}`)}</span> : null}</th>
            <td className="ek-clog-old" data-no-i18n>{val(c, c.from)}</td><td aria-hidden>{ar ? "←" : "→"}</td><td className="ek-clog-new" data-no-i18n>{val(c, c.to)}</td></tr>)}</tbody></table>}
        </li>;
      })}
    </ol>
  );
}
