/**
 * Shared Document Summary header (owner addendum C): one card at the top of every saved document in every DIGIT app,
 * between the title row and the native tabs. Additive and read-only — it shows what the document already stores
 * (registry: ./documentSummary.ts), updates live while a draft is edited, and links to related records and, for
 * submitted documents with ledger impact, the native General Ledger / Stock Ledger reports pre-filtered to this
 * voucher. It never hides or replaces native fields, actions, child tables, timeline, attachments or the side column.
 */
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { adapter, type Doc } from "@/lib/adapter";
import { cachedMeta, indexQuery, type DocTypeMeta } from "@/lib/catalog";
import { fmtDate, formatValue } from "@/lib/format";
import { linkTitle } from "@/lib/linkTitle";
import { canReadType } from "@/lib/scope";
import { t as tr, useLang } from "@/i18n";
import { dueDays } from "@/lib/coreShared/docPath";
import { useGoBack, useNavOrigin } from "@/lib/navOrigin";
import { resolveSummary, summaryStatus, type Amount, type Fact, type SummaryModel } from "./documentSummary";

/** Toolbar actions that the card's ledger buttons replace (owner: keep only the card button). */
export const GL_ACTION_LABELS = ["Ledger", "Accounting Ledger", "General Ledger"];
export const STOCK_ACTION_LABELS = ["Stock Ledger"];

const postedRows = (dt: "GL Entry" | "Stock Ledger Entry", voucherType: string, name: string) =>
  adapter.list(dt).some((r) => r["voucher_no"] === name && r["voucher_type"] === voucherType && !Number(r["is_cancelled"] ?? 0));

/** The card model for a document (pure registry + adapter lookups); used by the form page to hide duplicate toolbar actions. */
export function documentSummaryModel(meta: DocTypeMeta, doc: Doc, workflowState?: string): SummaryModel {
  return resolveSummary(meta, doc, {
    exists: (dt, nm) => !!adapter.get(dt, nm),
    posted: (k) => k === "gl" ? canReadType("GL Entry") && postedRows("GL Entry", meta.name, doc.name) : canReadType("Stock Ledger Entry") && postedRows("Stock Ledger Entry", meta.name, doc.name),
    workflowState,
  });
}

/** Status tone, by the stored status text (display only). */
export function statusTone(s: string | undefined): "ok" | "warn" | "bad" | "info" | "muted" {
  const v = (s ?? "").toLowerCase();
  if (!v) return "muted";
  if (/(cancel|reject|lost|closed|terminated|left|inactive|suspended|expired)/.test(v)) return "bad";
  if (/(overdue|unpaid|not saved|pending|hold|partly|open|to deliver|to bill|to receive|draft|submitted for|review)/.test(v)) return v === "draft" ? "muted" : "warn";
  if (/(paid|submitted|completed|active|approved|confirmed|certified|invoiced|won|converted|delivered|received|billed|issued)/.test(v)) return "ok";
  return "info";
}

/** Optional display-only label for a linked record value (an app's own Arabic display names, e.g. CRM cities and sources). */
export type DisplayValue = (doctype: string | undefined, value: string) => string | undefined;

/** Names, not codes (standard R5): a linked record shows its title (linkTitle, then the DocType's title field, its
 * "<doctype>_name" field or title); the stored code stays the link key and is kept as the hover text. */
function recordTitle(dt: string | undefined, value: unknown): string {
  const v = String(value ?? ""); if (!dt || !v) return v;
  const t = linkTitle(dt, v); if (t !== v) return t;
  const d = adapter.get(dt, v); if (!d) return v;
  const tf = (cachedMeta(dt) as { title_field?: string } | undefined)?.title_field;
  const own = `${dt.replace(/^Digit /, "").toLowerCase().replace(/[^a-z0-9]+/g, "_")}_name`;
  for (const k of [tf, own, "title"]) { const x = k ? d[k] : undefined; if (typeof x === "string" && x.trim() && x !== v) return x; }
  return v;
}
function FactValue({ f, doc, display }: { f: Fact; doc: Doc; display?: DisplayValue | undefined }) {
  if (f.kind === "date") {
    // a range shows only the ends that are set; the arrow appears only between two dates
    const has = (v: unknown) => v !== undefined && v !== null && v !== "";
    const from = has(f.value) ? fmtDate(f.value) : "", to = has(f.to) ? fmtDate(f.to) : "";
    return <span dir="ltr" data-no-i18n>{from}{from && to ? " → " : ""}{to}</span>;
  }
  if (f.kind === "select") return <bdi>{tr(String(f.value))}</bdi>;
  if (f.kind === "link") { const dt = f.fieldtype === "Link" ? f.options : String(doc[f.options ?? ""] ?? ""); const shown = display?.(dt, String(f.value)) ?? recordTitle(dt, f.value); return <bdi data-no-i18n title={shown !== String(f.value) ? String(f.value) : undefined}>{shown}</bdi>; }
  if (f.kind === "currency" || f.kind === "percent" || f.kind === "number") return <span className="tabular-nums" dir="ltr" data-no-i18n>{formatValue(f.fieldtype, f.value, { options: f.options, doc })}</span>;
  return <bdi data-no-i18n>{String(f.value)}</bdi>;
}

/** Summary strip colour per figure (one colour per category): totals emerald, paid blue, open / outstanding amber or rose. */
function amountHue(key: string, v: number): string {
  if (/outstanding|balance|due|unpaid/i.test(key)) return v > 0.005 ? "rose" : "emerald";
  if (/paid|advance|allocated|received/i.test(key)) return "blue";
  if (/tax|vat/i.test(key)) return "violet";
  if (/discount|deduction|return/i.test(key)) return "amber";
  return "emerald";
}
function amountText(a: Amount, doc: Doc) {
  if (a.kind === "currency") return formatValue("Currency", a.value, { options: a.options, doc });
  if (a.kind === "percent") return formatValue("Percent", a.value);
  if (a.kind === "qty") return formatValue("Float", a.value);
  return formatValue(a.fieldtype === "Int" ? "Int" : "Float", a.value);
}

/** "← Back to <page this document was opened from>" above the title row (end side); deep links fall back to the DocType list. */
export function DocumentBackChip({ meta, doc, app, doctypeSlug }: { meta: DocTypeMeta; doc: Doc; app: string; doctypeSlug: string }) {
  const origin = useNavOrigin();
  const goBack = useGoBack();
  const arrow = <span aria-hidden className="dx-docsum-arrow">←</span>;
  const self = `/app/${app}/${doctypeSlug}/${encodeURIComponent(doc.name)}`;
  const back = origin && origin.path !== self && origin.path !== decodeURIComponent(self)
    ? <a href={origin.href} className="dx-docsum-back" data-doc-back={origin.path} onClick={(e) => { if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return; e.preventDefault(); goBack(origin); }}>{arrow}<span>Back to</span> <bdi data-no-i18n>{origin.label || origin.path}</bdi></a>
    : meta.issingle ? null : <Link to="/app/$app/$doctype" params={{ app, doctype: doctypeSlug }} className="dx-docsum-back" data-doc-back="list">{arrow}<span>Back to</span> <span>{meta.name}</span></Link>;
  return back ? <div className="dx-docsum-backrow">{back}</div> : null;
}

export function DocumentSummaryHeader({ meta, doc, dirty, workflowState, model, displayValue, head, below, hideId }: {
  meta: DocTypeMeta; doc: Doc; dirty: boolean; workflowState?: string | undefined; model?: SummaryModel | undefined; displayValue?: DisplayValue | undefined;
  /** DIGIT document frame (owner FINAL WORK LIST): the title row with the actions becomes part of this one header */
  head?: ReactNode; below?: ReactNode; hideId?: boolean;
}) {
  const idx = useQuery(indexQuery);
  const m = model ?? documentSummaryModel(meta, doc, workflowState);
  const status = summaryStatus(meta, doc, workflowState);
  const entry = (dt: string) => idx.data?.find((e) => e.name === dt);
  const company = String(doc["company"] ?? "");
  const date = String(doc["posting_date"] ?? doc["transaction_date"] ?? "");
  const reportSearch = { filters: JSON.stringify({ ...(company ? { company } : {}), ...(date ? { from_date: date, to_date: date } : {}), voucher_no: doc.name }) };
  const facts = m.facts.filter((f) => f.field !== "status" && f.field !== "workflow_state");
  const ar = useLang() === "ar";
  const outstanding = Number(doc["outstanding_amount"] ?? 0);
  const open = Number(doc.docstatus ?? 0) === 1 && outstanding > 0.005;
  const due = m.amounts.length > 0 && doc["due_date"] && Number(doc.docstatus ?? 0) < 2 ? dueDays(doc) : null;
  return (
    <>
      <section className={`dx-docsum${head ? " dx-frame" : ""}`} data-doc-summary={meta.name} data-doc-summary-kind={m.full ? "full" : "generic"} aria-label={tr("Document summary")}>
        {head}
        <div className="dx-docsum-main">
          {!hideId && <div className="dx-docsum-id">
            <div className="dx-docsum-label">{meta.name}</div>
            <div className="dx-docsum-name">
              <bdi data-no-i18n>{doc.name}</bdi>
              {status && <span className="dx-docsum-chip" data-tone={statusTone(status)} data-doc-status={status}><bdi>{tr(status)}</bdi></span>}
              {dirty && <span className="dx-docsum-chip" data-tone="warn" data-doc-not-saved>{tr("Not Saved")}</span>}
            </div>
          </div>}
          {facts.length > 0 && <dl className="dx-docsum-facts">
            {facts.map((f) => <div key={f.field} className="dx-docsum-fact" data-doc-fact={f.field}><dt>{f.label}</dt><dd><FactValue f={f} doc={doc} display={displayValue} /></dd></div>)}
          </dl>}
          {m.amounts.length > 0 && <div className="dx-docsum-amounts" aria-live="polite" data-doc-strip>
            {m.amounts.map((a) => <div key={a.key} className="dx-docsum-amount" data-doc-amount={a.key} data-hue={amountHue(a.key, Number(a.value ?? 0))} data-derived={a.derived ? a.derived.join("-") : undefined}>
              <span>{a.label}</span><strong dir="ltr" data-no-i18n>{amountText(a, doc)}</strong>
            </div>)}
            {/* owner notes A-05: due date and days in the summary strip (total · paid · outstanding · due · days) */}
            {due !== null && <div className="dx-docsum-amount" data-doc-amount="due" data-hue="blue"><span>{tr("Due")}</span><strong dir="ltr" data-no-i18n>{fmtDate(doc["due_date"])}</strong></div>}
            {due !== null && open && <div className="dx-docsum-amount" data-doc-amount="days" data-hue={due < 0 ? "rose" : due <= 7 ? "amber" : "emerald"} data-doc-days={due}>
              <span>{tr("Days")}</span><strong>{due < 0 ? (ar ? `متأخر ${-due} يوم` : `${-due} days overdue`) : due === 0 ? (ar ? "يستحق اليوم" : "Due today") : ar ? `باقي ${due} يوم` : `${due} days left`}</strong></div>}
          </div>}
        </div>
        {(m.links.length > 0 || m.ledger || m.stock) && <div className="dx-docsum-foot">
          {m.links.length > 0 && <div className="dx-docsum-links" data-doc-links={m.links.length}>
            <span className="dx-docsum-links-label">Linked to</span>
            {m.links.map((l) => { const e = entry(l.doctype); const body = <><span className="dx-docsum-link-dt">{l.doctype}</span> <bdi data-no-i18n title={l.name}>{recordTitle(l.doctype, l.name)}</bdi>{l.amount !== undefined ? <span dir="ltr" data-no-i18n> · {formatValue("Currency", l.amount, { doc })}</span> : null}</>;
              return e ? <Link key={`${l.doctype}:${l.name}`} to="/app/$app/$doctype/$name" params={{ app: e.app, doctype: e.slug, name: l.name }} className="dx-docsum-link" data-doc-link={`${l.doctype}:${l.name}`}>{body}</Link>
                : <span key={`${l.doctype}:${l.name}`} className="dx-docsum-link">{body}</span>; })}
          </div>}
          {(m.ledger || m.stock) && <div className="dx-docsum-actions">
            {m.ledger && <Link to="/report/$name" params={{ name: "General Ledger" }} search={reportSearch as never} className="dx-docsum-btn" data-doc-gl>General Ledger</Link>}
            {m.stock && <Link to="/report/$name" params={{ name: "Stock Ledger" }} search={reportSearch as never} className="dx-docsum-btn" data-doc-stock>Stock Ledger</Link>}
          </div>}
        </div>}
        {below}
      </section>
    </>
  );
}
