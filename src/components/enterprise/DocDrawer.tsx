/**
 * Document drawer body (Enterprise Visual Round 1 §7), drawn inside the one Quick View host at the end side (480px) while
 * the list stays visible: header — document ID in Space Mono, status pill, party with avatar, total; body — 6–8 key fields,
 * the lines summary (count + top 3), the approval path and the life line (created → submitted → approved → paid / posted,
 * who and when); footer — the main actions (approve, print, pay, open the full document). ↑/↓ walk the list, Esc closes.
 */
import { Link, useNavigate } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { toast } from "sonner";
import { cachedMeta } from "@/lib/catalog";
import type { Doc } from "@/lib/adapter";
import { fmtCurrency, fmtDate, formatValue } from "@/lib/format";
import { hasPerm } from "@/lib/session";
import { docTimeline, type LifeKey } from "@/lib/docTimeline";
import { makePaymentEntry } from "@/lib/posting";
import { stripKey, overdueDays } from "@/lib/statusStrip";
import { t as tr } from "@/i18n";
import { ApprovalPath, userName } from "./ApprovalPath";
import { OverdueTag } from "./StatusStrip";
import { openQuickView, quickSummary } from "./QuickView";

const SKIP = new Set(["name", "naming_series", "amended_from", "status", "docstatus", "workflow_state", "approval_status", "title", "company"]);
const KEY_TYPES = new Set(["Data", "Link", "Date", "Datetime", "Select", "Currency", "Float", "Int", "Percent", "Dynamic Link", "Small Text"]);
const LIFE: Record<LifeKey, [string, string]> = { created: ["Created", "أُنشئ"], submitted: ["Submitted", "قُدّم واعتُمد للترحيل"], approved: ["Approved", "اعتُمد"], rejected: ["Rejected", "رُفض"], paid: ["Paid", "سُدّد"], posted: ["Posted to the ledgers", "رُحّل إلى الدفاتر"], cancelled: ["Cancelled", "أُلغي"] };
const TONE: Record<string, string> = { draft: "neutral", pending: "warn", due: "info", overdue: "bad", paid: "ok", submitted: "ok", cancelled: "bad" };

export function initials(name: string): string {
  const w = name.replace(/[()«»"]/g, " ").trim().split(/\s+/).filter((x) => x.length > 1 && !/^(شركة|مؤسسة|ال|co\.?|ltd\.?)$/i.test(x));
  return (w.slice(0, 2).map((x) => [...x][0]).join("") || [...name][0] || "?").toUpperCase();
}

export function DocDrawerBody({ doctype, d, app, dts, ar, onClose, head }: { doctype: string; d: Doc; app: string; dts: string; ar: boolean; onClose: () => void; head: (title: ReactNode, sub: ReactNode, extra?: ReactNode) => ReactNode }) {
  const t = (en: string, a: string) => (ar ? a : en);
  const nav = useNavigate();
  const meta = cachedMeta(doctype);
  const q = quickSummary(d);
  const key = meta ? stripKey(meta, d) : "";
  const late = meta ? overdueDays(meta, d) : 0;
  const fields = (meta?.fields ?? []).filter((f) => f.fieldname && !SKIP.has(f.fieldname) && KEY_TYPES.has(f.fieldtype) && !f.hidden && (f.in_list_view || f.bold || f.reqd || f.in_standard_filter)
    && d[f.fieldname] !== undefined && d[f.fieldname] !== null && d[f.fieldname] !== "" && f.fieldname !== q.party?.field && f.fieldname !== q.amount?.field).slice(0, 8);
  const table = (meta?.fields ?? []).find((f) => f.fieldtype === "Table" && Array.isArray(d[f.fieldname!]) && (d[f.fieldname!] as Doc[]).length);
  const lines = table ? (d[table.fieldname!] as Doc[]) : [];
  const top = [...lines].sort((a, b) => Number(b["amount"] ?? b["base_amount"] ?? 0) - Number(a["amount"] ?? a["base_amount"] ?? 0)).slice(0, 3);
  const life = docTimeline(doctype, d);
  const canPrint = !!meta && hasPerm(meta, "print", d);
  const pay = (doctype === "Sales Invoice" || doctype === "Purchase Invoice") && Number(d.docstatus ?? 0) === 1 && Number(d["outstanding_amount"] ?? 0) > 0.005;
  const doPay = () => {
    try { const pe = makePaymentEntry(doctype as "Sales Invoice" | "Purchase Invoice", d.name); onClose(); void nav({ to: "/app/$app/$doctype/$name", params: { app: "erpnext", doctype: "payment_entry", name: pe.name } }); }
    catch (e) { toast.error(e instanceof Error ? e.message : String(e)); }
  };
  // names, not codes: the party's name field on the document (customer_name, supplier_name, party_name, employee_name), else the code
  const party = [d["customer_name"], d["supplier_name"], d["party_name"], d["employee_name"], d["title"]].map((x) => (typeof x === "string" ? x.trim() : "")).find(Boolean) || (q.party?.value ?? "");
  // owner notes A-03: the coloured header carries type, number, status pill and the large amount; the body reuses the page
  // pieces (icon tiles, pills, a paid bar) and names the party
  const total = q.amount ? q.amount.value : null;
  const paidPct = total && q.outstanding !== null && total > 0 ? Math.max(0, Math.min(100, Math.round(((total - q.outstanding) / total) * 100))) : null;
  const partyDt = q.party ? (q.party.field === "party" ? String(d["party_type"] ?? "") : q.party.field === "party_name" ? String(d["quotation_to"] ?? "Customer") : q.party.field.replace(/\b\w/g, (c) => c.toUpperCase())) : "";
  return <>
    {head(<bdi className="r1-mono" data-doc-id data-no-i18n>{d.name}</bdi>, <>{tr(doctype)}{q.title && q.title !== d.name ? <> · <bdi data-no-i18n>{q.title}</bdi></> : null}</>,
      <><span className="r3-pill" data-tone={TONE[key] ?? (q.docstatus === 2 ? "bad" : q.docstatus === 1 ? "ok" : "neutral")} data-r1-dr-status>{tr(q.status)}</span>
        {late > 0 && <OverdueTag days={late} ar={ar} />}
        {total !== null && <b className="ent-qv-amount" data-no-i18n data-r1-dr-total={total}>{fmtCurrency(total, q.currency)}</b>}</>)}
    <div className="ent-qv-body r1-drawer" data-qv-doc={`${doctype}:${d.name}`} data-r1-drawer={d.name}>
      {(party || q.date) && <div className="r1-dr-party">
        {party && <span className="r1-avatar" aria-hidden>{initials(party)}</span>}
        <div className="min-w-0 flex-1">{party && (partyDt && q.party ? <button type="button" className="r1-dr-pname r1-dr-plink" onClick={(e) => openQuickView({ kind: "doc", doctype: partyDt, name: q.party!.value }, e.currentTarget)} title={q.party.value} data-qv-party data-no-i18n>{party}</button> : <p className="r1-dr-pname" data-no-i18n>{party}</p>)}
          {q.company && <p className="r1-dr-psub" data-no-i18n>{q.company}</p>}</div>
        {q.date && <span className="ent-qv-chip r1-date" data-no-i18n>{fmtDate(q.date)}</span>}
      </div>}
      {total !== null && <div className="r1-dr-figs" data-r1-dr-figs>
        <div className="r1-dr-fig" data-hue="emerald"><span className="r1-dr-ico" aria-hidden>Σ</span><div><span>{t("Total", "الإجمالي")}</span><b data-no-i18n>{fmtCurrency(total, q.currency)}</b></div></div>
        {q.outstanding !== null && <div className="r1-dr-fig" data-hue="blue"><span className="r1-dr-ico" aria-hidden>✓</span><div><span>{t("Paid", "المدفوع")}</span><b data-no-i18n>{fmtCurrency(Math.max(0, total - q.outstanding), q.currency)}</b></div></div>}
        {q.outstanding !== null && <div className="r1-dr-fig" data-hue={q.outstanding > 0.005 ? (late > 0 ? "rose" : "amber") : "emerald"}><span className="r1-dr-ico" aria-hidden>⏳</span><div><span>{t("Outstanding", "المتبقي")}</span><b data-no-i18n className={q.outstanding > 0.005 ? "text-[var(--negative)]" : undefined}>{fmtCurrency(q.outstanding, q.currency)}</b></div></div>}
        {paidPct !== null && <div className="r1-dr-bar" role="img" aria-label={t(`${paidPct}% paid`, `مدفوع ${paidPct}%`)} data-r1-dr-paid={paidPct}><i style={{ width: `${paidPct}%` }} /><small>{t(`${paidPct}% paid`, `مدفوع ${paidPct}%`)}</small></div>}
      </div>}
      {fields.length > 0 && <dl className="r1-dr-fields" data-r1-dr-fields={fields.length}>{fields.map((f) => <div key={f.fieldname} className="r1-dr-field">
        <dt>{tr(f.label ?? f.fieldname!)}</dt><dd data-no-i18n className={f.fieldtype === "Date" ? "r1-date" : undefined}>{f.fieldtype === "Link" && f.options === "User" ? userName(String(d[f.fieldname!])) : f.fieldtype === "Link" ? String(d[f.fieldname!]) : formatValue(f.fieldtype, d[f.fieldname!], { options: f.options, doc: d })}</dd>
      </div>)}</dl>}
      {lines.length > 0 && <section className="r1-dr-lines" data-r1-dr-lines={lines.length}>
        <h4>{t("Lines", "البنود")} <span className="chip bg-card tabular-nums" data-no-i18n>{lines.length}</span></h4>
        <ul>{top.map((r, i) => <li key={i}><span className="min-w-0 flex-1 truncate" data-no-i18n>{String(r["item_name"] || r["item_code"] || r["description"] || r["account"] || r["salary_component"] || `#${i + 1}`)}</span>
          {r["qty"] !== undefined && <span className="tabular-nums text-xs text-muted-foreground" data-no-i18n>× {String(r["qty"])}</span>}
          {(r["amount"] ?? r["base_amount"]) !== undefined && <span className="tabular-nums" data-no-i18n>{fmtCurrency(Number(r["amount"] ?? r["base_amount"] ?? 0), q.currency)}</span>}</li>)}</ul>
        {lines.length > 3 && <p className="r1-dr-psub">{t(`+${lines.length - 3} more lines`, `و${lines.length - 3} بنود أخرى`)}</p>}
      </section>}
      <ApprovalPath doctype={doctype} doc={d} ar={ar} compact />
      <section className="r1-dr-life" aria-label={t("Life line", "مسار المستند")}>
        <h4>{t("Life line", "مسار المستند")}</h4>
        <ol>{life.map((e, i) => <li key={`${e.key}:${i}`} data-r1-life={e.key}><span className="r1-life-dot" data-key={e.key} aria-hidden />
          <div><p className="r1-life-l">{ar ? LIFE[e.key][1] : LIFE[e.key][0]}{e.ref ? <> · <bdi className="r1-mono" data-no-i18n>{e.ref}</bdi></> : null}{e.amount ? <> · <bdi data-no-i18n>{fmtCurrency(e.amount, q.currency)}</bdi></> : null}</p>
            <p className="r1-dr-psub">{e.who && <bdi data-no-i18n>{userName(e.who)}</bdi>}{e.who ? " · " : ""}<bdi data-no-i18n>{fmtDate(e.at.slice(0, 10))}</bdi></p></div></li>)}</ol>
      </section>
    </div>
    <footer className="ent-qv-foot r1-dr-foot">
      {pay && <button type="button" className="btn-primary" onClick={doPay} data-r1-dr-pay>{t("Pay", "سدّد")}</button>}
      <Link to="/app/$app/$doctype/$name" params={{ app, doctype: dts, name: d.name }} className={pay ? "btn-secondary" : "btn-primary"} onClick={onClose} data-qv-open>{t("Open full ↗", "فتح كامل ↗")}</Link>
      {canPrint && q.docstatus < 2 && <Link to="/printview" search={{ doctype, name: d.name } as never} className="btn-ghost" onClick={onClose} data-qv-print>{t("Print", "طباعة")}</Link>}
      <button type="button" className="btn-ghost" onClick={() => { void navigator.clipboard?.writeText(`${location.origin}/app/${app}/${dts}/${encodeURIComponent(d.name)}`); }} data-qv-copy>{t("Copy link", "نسخ الرابط")}</button>
    </footer>
  </>;
}
