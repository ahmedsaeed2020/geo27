import { Link } from "@tanstack/react-router";
import { adapter } from "@/lib/adapter";
import { timeAgo } from "@/lib/crm";
import { CrmShell, StatusDot } from "./CrmShell";
import { statusColor, useCrm } from "./useCrm";

/** pages/Notes.vue and pages/Tasks.vue — list of records referencing leads/deals. */
export function CrmRefList({ doctype, label, cols }: { doctype: string; label: string; cols: string[] }) {
  const b = useCrm();
  const header = <span className="text-lg font-semibold">{label}</span>;
  if (!b) return <CrmShell header={header}><p className="p-6 text-crm-muted">Loading…</p></CrmShell>;
  const rows = adapter.list(doctype);
  return (
    <CrmShell header={header}>
      <table className="w-full text-sm">
        <thead className="border-b border-crm-line text-left text-crm-muted"><tr>{[...cols, "reference", "modified"].map((c) => <th key={c} className="px-5 py-2 font-normal capitalize">{c}</th>)}</tr></thead>
        <tbody>
          {rows.map((r) => {
            const lead = r["reference_doctype"] === "CRM Lead";
            return (
              <tr key={r.name} className="border-b border-crm-line">
                {cols.map((c) => <td key={c} className="px-5 py-2">{String(r[c] ?? "")}</td>)}
                <td className="px-5 py-2">{r["reference_docname"] ? <Link to={lead ? "/digit-crm/leads/$leadId" : "/digit-crm/deals/$dealId"} params={lead ? { leadId: String(r["reference_docname"]) } : { dealId: String(r["reference_docname"]) }} className="underline">{String(r["reference_docname"])}</Link> : null}</td>
                <td className="px-5 py-2 text-crm-muted">{timeAgo(r["modified"])}</td>
              </tr>
            );
          })}
          {!rows.length && <tr><td className="px-5 py-6 text-crm-muted" colSpan={cols.length + 2}>No {label.toLowerCase()} yet — add them from a lead or deal page.</td></tr>}
        </tbody>
      </table>
    </CrmShell>
  );
}

/** pages/Dashboard.vue number cards (crm/api/dashboard.py get_total_leads, get_ongoing_deals, get_won_deals, get_average_deal_value…). */
export function CrmDashboard() {
  const b = useCrm();
  const header = <span className="text-lg font-semibold">Dashboard</span>;
  if (!b) return <CrmShell header={header}><p className="p-6 text-crm-muted">Loading…</p></CrmShell>;
  const leads = adapter.list("CRM Lead");
  const deals = adapter.list("CRM Deal");
  const type = (d: (typeof deals)[number]) => b.defaults.deal_statuses[String(d["status"])]?.type;
  const ongoing = deals.filter((d) => type(d) === "Ongoing" || type(d) === "Open");
  const won = deals.filter((d) => type(d) === "Won");
  const val = (d: (typeof deals)[number]) => Number(d["deal_value"] || d["expected_deal_value"] || 0);
  const avg = (a: typeof deals) => (a.length ? a.reduce((s, d) => s + val(d), 0) / a.length : 0);
  const cards = [
    ["Total leads", leads.length], ["Ongoing deals", ongoing.length], ["Avg. ongoing deal value", avg(ongoing).toFixed(0)],
    ["Won deals", won.length], ["Avg. won deal value", avg(won).toFixed(0)], ["Avg. deal value", avg(deals).toFixed(0)],
  ] as const;
  const stages = Object.keys(b.defaults.deal_statuses);
  const max = Math.max(1, ...stages.map((s) => deals.filter((d) => d["status"] === s).length));
  return (
    <CrmShell header={header}>
      <div className="p-5">
        <p className="mb-4 text-xs text-crm-muted">Preview calculations over shared synthetic records, mirroring crm/api/dashboard.py card definitions. Date/user filters and time-to-close metrics need server queries and are not shown.</p>
        <div className="grid grid-cols-3 gap-3">{cards.map(([l, v]) => <div key={l} className="rounded-lg border border-crm-line p-4"><div className="text-sm text-crm-muted">{l}</div><div className="mt-1 text-2xl font-semibold" data-card={l}>{v}</div></div>)}</div>
        <h3 className="mb-2 mt-6 text-sm font-semibold">Deals by stage</h3>
        <div className="space-y-1">{stages.map((s) => { const n = deals.filter((d) => d["status"] === s).length; return (
          <div key={s} className="flex items-center gap-2 text-sm"><span className="flex w-40 items-center gap-2"><StatusDot color={statusColor(b, "deal", s)} />{s}</span>
            <div className="h-3 rounded bg-crm-dark" style={{ width: `${(n / max) * 60}%`, minWidth: n ? 4 : 0 }} /><span className="text-crm-muted">{n}</span></div>); })}</div>
      </div>
    </CrmShell>
  );
}
