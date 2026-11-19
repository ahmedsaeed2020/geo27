// @ts-nocheck -- DIGIT Pro/HR apps are switched off in the merged site build; their original /pro/* and /hr/* app routes are not in this route tree (re-enabling the app needs those routes, then remove this line)
/**
 * DIGIT Pro — SC-F-04 Journal Entry enhancement panel. Rendered by the native Core form route only while the
 * DIGIT Pro experience is active. Read-only over the SAME Core doc: totals are the values Core's
 * journal_entry.js port (formCalc journalBalance) already wrote; no ledger math, no balancing, no own store.
 */
import { useEffect, useState } from "react";
import { Link, useBlocker } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import type { Doc } from "@/lib/adapter";
import { indexQuery, loadMeta, type DocTypeMeta } from "@/lib/catalog";
import { hasPerm } from "@/lib/session";
import { fmtCurrency } from "@/lib/format";

type Row = Record<string, unknown>;
const UNSAVED_MSG = () => (document.documentElement.lang === "ar" || document.documentElement.dir === "rtl" ? "لديك تغييرات غير محفوظة. هل تريد المغادرة دون حفظ؟" : "You have unsaved changes. Leave without saving?");
const num = (v: unknown) => Number(v ?? 0) || 0;

/** Row-level checks mirroring journal_entry.py validate_debit_credit_amount / mandatory account (feedback only; Save still runs Core validation). */
export function rowIssues(rows: Row[]): { row: number; msg: string }[] {
  const out: { row: number; msg: string }[] = [];
  rows.forEach((r, i) => {
    const d = num(r["debit_in_account_currency"]), c = num(r["credit_in_account_currency"]);
    if (!r["account"]) out.push({ row: i + 1, msg: "Account is required" });
    if (d && c) out.push({ row: i + 1, msg: "You cannot credit and debit same account at the same time" });
    if (!d && !c) out.push({ row: i + 1, msg: "Both Debit and Credit values cannot be zero" });
    if (d < 0 || c < 0) out.push({ row: i + 1, msg: "Negative values are not allowed" });
  });
  return out;
}

const focusRow = (row: number) => {
  const tr = document.querySelector<HTMLElement>(`[data-child-grid="Journal Entry Account"] tbody tr:nth-child(${row})`);
  tr?.scrollIntoView({ block: "center" }); tr?.querySelector<HTMLElement>("input[data-cell],select[data-cell]")?.focus();
};

/** `summary=false`: the shared DocumentSummaryHeader already shows identity, totals, references and the ledger button (saved documents). */
export function JournalEntryPanel({ doc, dirty, canWrite, summary = true }: { doc: Doc; dirty: boolean; canWrite: boolean; summary?: boolean }) {
  const idx = useQuery(indexQuery);
  const [gl, setGl] = useState<DocTypeMeta | null>(null);
  useEffect(() => { if (idx.data) void loadMeta(idx.data, "GL Entry").then((m) => setGl(m ?? null)); }, [idx.data]);
  // unsaved-change guard (frappe form dirty prompt)
  // covers refresh/close (beforeunload) and every in-app navigation: other DIGIT Pro pages, Standard Desk exit, related-document links
  useBlocker({ shouldBlockFn: () => dirty && !window.confirm(UNSAVED_MSG()), enableBeforeUnload: () => dirty, withResolver: false });
  const ds = doc.docstatus ?? 0;
  const rows = (doc["accounts"] as Row[] | undefined) ?? [];
  const td = num(doc["total_debit"]), tc = num(doc["total_credit"]), diff = num(doc["difference"] ?? td - tc);
  const balanced = Math.abs(diff) < 0.005;
  const issues = ds === 0 ? rowIssues(rows) : [];
  const state = ds === 2 ? "Cancelled" : ds === 1 ? "Submitted" : !canWrite ? "Read Only" : dirty ? "Not Saved" : "Draft";
  const tone = ds === 2 ? "bg-destructive/10 text-destructive" : ds === 1 ? "bg-success/15 text-success-text" : dirty ? "bg-warning/20" : "bg-muted";
  const glOk = ds === 1 && gl && hasPerm(gl, "read");
  const refs = Array.from(new Set(rows.filter((r) => r["reference_type"] && r["reference_name"]).map((r) => `${String(r["reference_type"])}|${String(r["reference_name"])}`)));
  const fact = (label: string, v: unknown, option = false) => v ? <div className="min-w-0"><div className="text-[11px] text-muted-foreground">{label}</div><div className="truncate text-sm font-medium" {...(option ? {} : { "data-no-i18n": true })} dir="auto">{String(v)}</div></div> : null;
  return (
    <section className="panel mt-4 p-4" data-dp-je-panel data-dp-je-summary={summary ? 1 : 0} data-dp-balanced={balanced ? 1 : 0} aria-label="Journal Entry summary">
      {summary && <div className="flex flex-wrap items-start gap-x-6 gap-y-3">
        <div className="min-w-0">
          <div className="text-[11px] text-muted-foreground">Journal Entry</div>
          <div className="flex items-center gap-2"><bdi className="text-base font-semibold" data-no-i18n data-dp-je-name>{doc.name}</bdi><span className={`chip ${tone}`} data-dp-je-state={state}>{state}</span></div>
        </div>
        {fact("Entry Type", doc["voucher_type"], true)}
        {fact("Posting Date", doc["posting_date"])}
        {fact("Company", doc["company"])}
        <div className="ms-auto grid grid-cols-3 gap-4 text-end" aria-live="polite">
          <div><div className="text-[11px] text-muted-foreground">Total Debit</div><div className="text-sm font-semibold tabular-nums" data-no-i18n data-dp-total-debit={td}>{fmtCurrency(td)}</div></div>
          <div><div className="text-[11px] text-muted-foreground">Total Credit</div><div className="text-sm font-semibold tabular-nums" data-no-i18n data-dp-total-credit={tc}>{fmtCurrency(tc)}</div></div>
          <div><div className="text-[11px] text-muted-foreground">Difference</div><div className={`text-sm font-semibold tabular-nums ${balanced ? "text-success-text" : "text-destructive"}`} data-no-i18n data-dp-difference={diff}>{fmtCurrency(diff)}</div></div>
        </div>
      </div>}
      <div className={`${summary ? "mt-3 " : ""}flex flex-wrap items-center gap-2 text-xs`}>
        <span className={`chip ${balanced ? "bg-success/15 text-success-text" : "bg-destructive/10 text-destructive"}`} data-dp-balance>{balanced ? "Balanced" : "Not balanced"}</span>
        <span className="chip inline-flex gap-1 bg-muted"><span>Rows</span><span data-no-i18n>{rows.length}</span></span>
        {ds === 0 && canWrite && <span className="text-muted-foreground">Arrow keys move between rows · Enter on the last row adds a row</span>}
        {summary && glOk && <Link to="/pro/general-ledger" search={{ voucher_no: doc.name, company: String(doc["company"] ?? ""), from: "je" } as never} className="btn-ghost ms-auto py-0.5" data-dp-gl-link>General Ledger</Link>}
      </div>
      {summary && refs.length > 0 && <div className="mt-2 flex flex-wrap gap-2 text-xs" data-dp-refs><span className="text-muted-foreground">Reference</span>{refs.map((k) => { const [t, n] = k.split("|"); const e = idx.data?.find((x) => x.name === t); return e ? <Link key={k} to="/app/$app/$doctype/$name" params={{ app: e.app, doctype: e.slug, name: n! }} className="chip bg-accent hover:underline" data-no-i18n>{t} {n}</Link> : <span key={k} className="chip bg-muted" data-no-i18n>{t} {n}</span>; })}</div>}
      {issues.length > 0 && (
        <ul className="mt-3 space-y-1 rounded-md border border-warning/40 bg-warning/10 p-2 text-xs" data-dp-row-issues={issues.length} role="status">
          {issues.map((x, i) => <li key={i}><button type="button" className="text-start hover:underline" onClick={() => focusRow(x.row)}><span>Row</span> <span data-no-i18n>#{x.row}</span>: <span>{x.msg}</span></button></li>)}
        </ul>
      )}
    </section>
  );
}

/** Keyboard navigation inside the native child grid (DIGIT Pro only): ↑/↓ move to the same column, Enter on the last row adds a row via the grid's own "Add row". */
export function gridKeyNav(e: React.KeyboardEvent<HTMLElement>) {
  const t = e.target as HTMLElement;
  if (!t.matches("[data-cell]") || !["ArrowUp", "ArrowDown", "Enter"].includes(e.key) || t.tagName === "SELECT") return;
  const col = t.getAttribute("data-cell"); const tr = t.closest("tr"); if (!tr || !col) return;
  const next = e.key === "ArrowUp" ? tr.previousElementSibling : tr.nextElementSibling;
  const target = next?.querySelector<HTMLElement>(`[data-cell="${col}"]`);
  if (target) { e.preventDefault(); target.focus(); return; }
  if (e.key === "Enter" && !next) {
    e.preventDefault();
    const grid = tr.closest("[data-child-grid]");
    grid?.querySelector<HTMLButtonElement>("[data-grid-add-row], [data-grid-add]")?.click(); // Core ChildGrid "Add row"
    setTimeout(() => grid?.querySelector<HTMLElement>(`tbody tr:last-child [data-cell="${col}"]`)?.focus(), 30);
  }
}
