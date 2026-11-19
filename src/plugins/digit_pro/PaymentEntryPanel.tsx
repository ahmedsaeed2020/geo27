// @ts-nocheck -- DIGIT Pro/HR apps are switched off in the merged site build; their original /pro/* and /hr/* app routes are not in this route tree (re-enabling the app needs those routes, then remove this line)
/**
 * DIGIT Pro — SC-F-05 Payment Entry enhancement panel, shown on the native Core form while DIGIT Pro is active.
 * Reads the SAME Core doc; "Add" builds a references patch through the form's own change() so Core's
 * payment_entry.js port allocates and Save/Submit/Cancel stay native (posting.ts validates and updates outstanding).
 */
import { useState } from "react";
import { Link, useBlocker } from "@tanstack/react-router";
import { adapter, type Doc } from "@/lib/adapter";
import { fmtCurrency } from "@/lib/format";
import { addRefs, candidatesFor, peTotals, referenceIssues, type Candidate } from "./paymentEntry";
import { can, slug } from "./finance";

const UNSAVED_MSG = () => (document.documentElement.lang === "ar" || document.documentElement.dir === "rtl" ? "لديك تغييرات غير محفوظة. هل تريد المغادرة دون حفظ؟" : "You have unsaved changes. Leave without saving?");
const focusRef = (row: number) => {
  const tr = document.querySelector<HTMLElement>(`[data-child-grid="Payment Entry Reference"] tbody tr:nth-child(${row})`);
  tr?.scrollIntoView({ block: "center" }); tr?.querySelector<HTMLElement>("input[data-cell],select[data-cell]")?.focus();
};

/** `summary=false`: the shared DocumentSummaryHeader already shows identity, totals, allocations and the ledger button (saved documents). */
export function PaymentEntryPanel({ doc, dirty, canWrite, onChange, summary = true }: { doc: Doc; dirty: boolean; canWrite: boolean; onChange: (p: Record<string, unknown>) => void; summary?: boolean }) {
  useBlocker({ shouldBlockFn: () => dirty && !window.confirm(UNSAVED_MSG()), enableBeforeUnload: () => dirty, withResolver: false });
  const [pick, setPick] = useState<Set<string>>(new Set());
  const ds = doc.docstatus ?? 0;
  const t = peTotals(doc);
  const cur = String(doc["paid_from_account_currency"] || doc["paid_to_account_currency"] || "");
  const money = (v: number) => fmtCurrency(v, cur || undefined);
  const issues = referenceIssues(doc, (dt, nm) => adapter.get(dt, nm));
  const cands: Candidate[] = ds === 0 ? candidatesFor(doc) : [];
  const refs = (Array.isArray(doc["references"]) ? (doc["references"] as Record<string, unknown>[]) : []);
  const state = ds === 2 ? "Cancelled" : ds === 1 ? "Submitted" : !canWrite ? "Read Only" : dirty ? "Not Saved" : "Draft";
  const tone = ds === 2 ? "bg-destructive/10 text-destructive" : ds === 1 ? "bg-success/15 text-success-text" : dirty ? "bg-warning/20" : "bg-muted";
  const add = (list: Candidate[]) => { if (!list.length) return; onChange(addRefs(doc, list)); setPick(new Set()); };
  const toggle = (nm: string) => setPick((p) => { const x = new Set(p); x.has(nm) ? x.delete(nm) : x.add(nm); return x; });
  const fact = (label: string, v: unknown, option = false) => v ? <div className="min-w-0"><div className="text-[11px] text-muted-foreground">{label}</div><div className="truncate text-sm font-medium" {...(option ? {} : { "data-no-i18n": true })} dir="auto">{String(v)}</div></div> : null;
  const tot = (label: string, v: number, key: string, warn = false) => <div><div className="text-[11px] text-muted-foreground">{label}</div><div className={`text-sm font-semibold tabular-nums ${warn ? "text-destructive" : ""}`} data-no-i18n {...{ [`data-dp-pe-${key}`]: v }}>{money(v)}</div></div>;
  if (!summary && !issues.length && !(ds === 0 && canWrite)) return null;
  return (
    <section className="panel mt-4 p-4" data-dp-pe-panel data-dp-pe-summary={summary ? 1 : 0} aria-label="Payment Entry summary">
      {summary && <>
      <div className="flex flex-wrap items-start gap-x-6 gap-y-3">
        <div className="min-w-0">
          <div className="text-[11px] text-muted-foreground">Payment Entry</div>
          <div className="flex items-center gap-2"><bdi className="text-base font-semibold" data-no-i18n>{doc.name}</bdi><span className={`chip ${tone}`} data-dp-pe-state={state}>{state}</span></div>
        </div>
        {fact("Payment Type", doc["payment_type"], true)}
        {fact("Party", doc["party"])}
        {fact("Company", doc["company"])}
        {fact("Posting Date", doc["posting_date"])}
        {fact("Currency", cur)}
        <div className="ms-auto grid grid-cols-2 gap-4 text-end sm:grid-cols-4" aria-live="polite">
          {tot(doc["payment_type"] === "Receive" ? "Received" : "Paid", t.paid, "paid")}
          {tot("Allocated", t.allocated, "allocated")}
          {tot("Unallocated", t.unallocated, "unallocated")}
          {tot("Difference", t.difference, "difference", Math.abs(t.difference) >= 0.005)}
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
        {fact("Account Paid From", doc["paid_from"])}{fact("Account Paid To", doc["paid_to"])}
        {ds === 1 && can("GL Entry", "read") && <Link to="/pro/general-ledger" search={{ voucher_no: doc.name, company: String(doc["company"] ?? "") } as never} className="btn-ghost ms-auto py-0.5" data-dp-gl-link>General Ledger</Link>}
      </div>

      {refs.length > 0 && <div className="mt-3 flex flex-wrap gap-2 text-xs" data-dp-pe-refs><span className="text-muted-foreground">Allocated to</span>
        {refs.map((r, i) => { const dt = String(r["reference_doctype"] ?? ""), nm = String(r["reference_name"] ?? ""); return dt && nm
          ? <Link key={i} to="/app/$app/$doctype/$name" params={{ app: "erpnext", doctype: slug(dt), name: nm }} className="chip bg-accent hover:underline" data-no-i18n>{nm} · {money(Number(r["allocated_amount"]) || 0)}</Link>
          : null; })}</div>}
      </>}

      {issues.length > 0 && <ul className="mt-3 space-y-1 rounded-md border border-warning/40 bg-warning/10 p-2 text-xs" data-dp-pe-issues={issues.length} role="status">
        {issues.map((x, i) => <li key={i}><button type="button" className="text-start hover:underline" onClick={() => focusRef(x.row)}><span>Row</span> <span data-no-i18n>#{x.row}</span>: <span>{x.msg}</span></button></li>)}
      </ul>}

      {ds === 0 && canWrite && (
        <div className="mt-3" data-dp-pe-outstanding={cands.length}>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold">Outstanding invoices</h3>
            <span className="text-xs text-muted-foreground">Same party, company and currency · submitted only</span>
            {cands.length > 0 && <div className="ms-auto flex gap-2">
              <button type="button" className="btn-ghost py-0.5 text-xs" disabled={!pick.size} onClick={() => add(cands.filter((c) => pick.has(c.name)))} data-dp-pe-add>Add selected</button>
              <button type="button" className="btn-primary py-0.5 text-xs" onClick={() => add(cands)} data-dp-pe-add-all>Add all</button>
            </div>}
          </div>
          {!doc["party"] ? <p className="mt-1 text-xs text-muted-foreground" data-dp-pe-need-party>Select a party</p>
            : !cands.length ? <p className="mt-1 text-xs text-muted-foreground">Nothing to show</p>
            : <table className="mt-2 w-full text-sm"><thead><tr className="border-b border-border text-xs text-muted-foreground"><th className="w-8" /><th className="py-1 text-start">Invoices</th><th className="text-start">Due Date</th><th className="text-end">Grand Total</th><th className="text-end">Outstanding</th></tr></thead>
              <tbody>{cands.map((c) => <tr key={c.name} className="border-b border-border" data-dp-pe-cand={c.name}>
                <td><input type="checkbox" aria-label={c.name} checked={pick.has(c.name)} onChange={() => toggle(c.name)} /></td>
                <td className="py-1"><Link to="/app/$app/$doctype/$name" params={{ app: "erpnext", doctype: slug(c.doctype), name: c.name }} className="hover:underline" data-no-i18n>{c.name}</Link></td>
                <td className="tabular-nums" data-no-i18n>{c.due}</td>
                <td className="text-end tabular-nums" data-no-i18n>{money(c.total)}</td>
                <td className="text-end font-medium tabular-nums" data-no-i18n>{money(c.outstanding)}</td></tr>)}</tbody></table>}
        </div>
      )}
    </section>
  );
}
