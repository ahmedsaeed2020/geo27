import { Link } from "@tanstack/react-router";
import { EntTable } from "@/components/enterprise/kit/EntTable";
import { DataReadiness, DeptPanel, IaCoverage } from "./Workspace";
import { useState } from "react";
import { toast } from "sonner";
import { adapter, type Doc } from "@/lib/adapter";
import { scopedList } from "@/lib/scope";
import { CrmFrame } from "./CrmApp";
import { isManager, userLabel } from "./wf01";
import { dealStatusType, scopedDeals, homeKpis, isOpenDeal, dealValue } from "./wf02";
import {
  addTarget, attainment, AUTOMATION_SOURCES, createQuotation, dealPriceList, docCount, lastActivity, nextAction, partyFor, priceFor,
  quotationsOf, saveDealLines, sellableItems, sellingPriceLists, SETTINGS_SOURCES, sourceResults, stageAgeDays, stageHistory, targets,
  type Line, type LineError,
} from "./wf03";
import { DeskLink, Empty, Kpi, money, Num, Section } from "./Wave2";
import { DemoControls } from "./DemoControls";
import { DemoOperations } from "./DemoOperations";
import { demoEnabled } from "./demoAnalytics";
import { linkTitle } from "@/lib/linkTitle";
import { useLang } from "@/i18n";
import { QuickLink } from "@/components/enterprise/QuickView";
import { WorkingRules } from "./SalesDesk";
import { CrmAdminSettings } from "./CrmAdminSettings";
import { LeadRulesCard } from "./LeadRulesCard";

const slug = (dt: string) => dt.toLowerCase().replace(/[^a-z0-9]+/g, "_");
const fmtDate = (s: string) => { const t = Date.parse(s); return Number.isFinite(t) ? new Date(t).toLocaleDateString(typeof window !== "undefined" && localStorage.getItem("digit-virtual-core:lang") !== "en" ? "ar-SA-u-ca-gregory-nu-latn" : "en-US", { dateStyle: "medium" }) : "—"; };

/* ---------- Deal products (CRM Products ← ERPNext Item) ---------- */
export function DealLines({ deal, user }: { deal: Doc; user: string }) {
  const locked = dealStatusType(deal["status"]) === "Lost" || !(isManager(user) || deal["deal_owner"] === user);
  const init = (): Line[] => ((deal["products"] as Doc[] | undefined) ?? []).map((p) => ({ item_code: String(p["product_code"] ?? ""), qty: Number(p["qty"] ?? 1), rate: Number(p["rate"] ?? 0), discount_percentage: Number(p["discount_percentage"] ?? 0) }));
  const [edit, setEdit] = useState(false);
  const [lines, setLines] = useState<Line[]>(init);
  const [pl, setPl] = useState(dealPriceList(deal));
  const [errs, setErrs] = useState<LineError[]>([]);
  const items = sellableItems(), pls = sellingPriceLists();
  const saved = (deal["products"] as Doc[] | undefined) ?? [];
  const errOf = (row: number, f: string) => errs.find((e) => e.row === row && e.field === f)?.error;
  const set = (i: number, patch: Partial<Line>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const pick = (i: number, code: string) => set(i, { item_code: code, rate: priceFor(code, pl) ?? 0 });
  const save = () => {
    const r = saveDealLines(deal.name, lines, pl, user);
    if (r.ok) { setErrs([]); setEdit(false); toast.success("Products saved", { description: deal.name }); }
    else { setErrs(r.rows ?? []); toast.error(r.error); }
  };
  const cancel = () => { setLines(init()); setPl(dealPriceList(deal)); setErrs([]); setEdit(false); };
  return <Section title="Products" right={!edit && !locked && <button className="btn-ghost" onClick={() => { setLines(init().length ? init() : [{ item_code: "", qty: 1, rate: 0 }]); setEdit(true); }} data-crm-action="edit-products">{saved.length ? "Edit products" : "Add products"}</button>}>
    {!edit ? (!saved.length ? <Empty>No products yet. Add DIGIT items to prepare a quotation.</Empty> :
      <table className="dp-table w-full text-sm" data-crm-lines><thead><tr><th>Item</th><th className="text-end">Qty</th><th className="text-end">Rate</th><th className="text-end">Discount %</th><th className="text-end">Net Amount</th></tr></thead>
        <tbody>{saved.map((p, i) => <tr key={i}><td><DeskLink app="erpnext" dt="Item" name={String(p["product_code"])} /> <span className="text-muted-foreground" data-no-i18n>{String(p["product_name"] ?? "")}</span></td><td className="text-end"><Num v={Number(p["qty"])} /></td><td className="text-end"><Num v={money(Number(p["rate"]))} /></td><td className="text-end"><Num v={Number(p["discount_percentage"] ?? 0)} /></td><td className="text-end"><Num v={money(Number(p["net_amount"] ?? 0))} /></td></tr>)}
          <tr className="font-semibold"><td colSpan={4}>Net Total <span className="text-xs font-normal text-muted-foreground" data-no-i18n>· {dealPriceList(deal)}</span></td><td className="text-end"><Num v={`${money(Number(deal["net_total"] ?? 0))} ${deal["currency"] ?? ""}`} /></td></tr></tbody></table>)
    : <div className="space-y-2" data-crm-lines-editor>
      <label className="flex items-center gap-2 text-sm"><span className="text-muted-foreground">Price List</span>
        <select className="input" value={pl} onChange={(e) => setPl(e.target.value)} aria-invalid={!!errOf(0, "price_list") || !!errOf(0, "currency")}>{pls.map((p) => <option key={p.name} value={p.name} data-no-i18n>{p.name} ({String(p["currency"] ?? "")})</option>)}</select></label>
      {(errOf(0, "price_list") || errOf(0, "currency")) && <p className="text-xs text-destructive" role="alert">{errOf(0, "price_list") || errOf(0, "currency")}</p>}
      <div className="overflow-x-auto"><table className="dp-table w-full text-sm"><thead><tr><th>Item</th><th>Qty</th><th>Rate</th><th>Discount %</th><th /></tr></thead><tbody>
        {lines.map((l, i) => <tr key={i} data-line={i + 1}>
          <td><select className="input min-w-48" value={l.item_code} onChange={(e) => pick(i, e.target.value)} aria-label="Item" aria-invalid={!!errOf(i + 1, "item_code")}><option value="">Select item…</option>{items.map((it) => <option key={it.name} value={it.name} data-no-i18n>{it.name} — {String(it["item_name"] ?? "")}</option>)}</select>{errOf(i + 1, "item_code") && <div className="text-xs text-destructive" role="alert">{errOf(i + 1, "item_code")}</div>}</td>
          <td><input className="input w-20" type="number" min={0} step="any" value={l.qty} onChange={(e) => set(i, { qty: Number(e.target.value) })} aria-label="Qty" aria-invalid={!!errOf(i + 1, "qty")} />{errOf(i + 1, "qty") && <div className="text-xs text-destructive" role="alert">{errOf(i + 1, "qty")}</div>}</td>
          <td><input className="input w-28" type="number" min={0} step="any" value={l.rate} onChange={(e) => set(i, { rate: Number(e.target.value) })} aria-label="Rate" aria-invalid={!!errOf(i + 1, "rate")} />{errOf(i + 1, "rate") && <div className="text-xs text-destructive" role="alert">{errOf(i + 1, "rate")}</div>}</td>
          <td><input className="input w-20" type="number" min={0} max={100} value={l.discount_percentage ?? 0} onChange={(e) => set(i, { discount_percentage: Number(e.target.value) })} aria-label="Discount %" /></td>
          <td><button className="btn-ghost" onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))} aria-label="Remove line">✕</button></td></tr>)}
      </tbody></table></div>
      <div className="flex flex-wrap gap-2"><button className="btn-ghost" onClick={() => setLines((ls) => [...ls, { item_code: "", qty: 1, rate: 0 }])} data-crm-action="add-line">Add line</button>
        <span className="ms-auto" /><button className="btn-ghost" onClick={cancel}>Cancel</button><button className="btn-primary" onClick={save} data-crm-action="save-products">Save</button></div>
    </div>}
  </Section>;
}

/* ---------- Quotation handoff + readback ---------- */
export function DealQuotation({ deal, user }: { deal: Doc; user: string }) {
  const [busy, setBusy] = useState(false);
  const ar = useLang() === "ar";
  // CR1-03: create-from is idempotent — a repeat returns the live quotation and says «موجود مسبقاً» (no second document)
  const [repeat, setRepeat] = useState<string | null>(null);
  const quotes = quotationsOf(deal.name), party = partyFor(deal);
  const live = quotes.find((q) => Number(q["docstatus"]) !== 2);
  const noLines = !((deal["products"] as unknown[] | undefined) ?? []).length;
  const lost = dealStatusType(deal["status"]) === "Lost";
  const go = () => {
    setBusy(true);
    try {
      const r = createQuotation(deal.name, user);
      if (!r.ok) toast.error(r.error);
      else if (r.existing) { setRepeat(r.name); toast.message(ar ? "موجود مسبقاً" : "Already exists", { description: ar ? `عرض السعر ${r.name} موجود لهذه الصفقة — لم يُنشأ عرض جديد.` : `Quotation ${r.name} already exists for this deal — no new one was created.` }); }
      else { setRepeat(null); toast.success(ar ? "أُنشئ عرض سعر كمسودة" : "Draft quotation created", { description: r.name }); }
    }
    catch (e) { toast.error(String((e as Error).message || e)); }
    finally { setBusy(false); }
  };
  const st = (q: Doc) => Number(q["docstatus"]) === 1 ? "Submitted" : Number(q["docstatus"]) === 2 ? "Cancelled" : "Draft";
  return <Section title="Quotation" right={<button className="btn-primary" disabled={busy || lost || noLines} onClick={go} data-crm-action="create-quotation" data-crm-quote-live={live?.name ?? ""}>{ar ? "إنشاء عرض سعر" : "Create Quotation"}</button>}>
    {repeat && <p className="mb-2 flex flex-wrap items-center gap-2 rounded-md bg-warning/15 px-3 py-2 text-sm" role="status" data-crm-quote-exists={repeat}>
      <span className="ek-sb-flag" data-tone="warn">{ar ? "موجود مسبقاً" : "Already exists"}</span>
      <span>{ar ? "هذه الصفقة لها عرض سعر قائم؛ إعادة الإنشاء تفتحه ولا تنشئ عرضًا ثانيًا:" : "This deal already has a live quotation; creating again opens it instead of a second one:"}</span>
      <QuickLink doctype="Quotation" name={repeat}><bdi>{repeat}</bdi></QuickLink></p>}
    {lost ? <p className="text-xs text-muted-foreground">Lost deals cannot be quoted</p> : noLines ? <p className="text-xs text-muted-foreground" data-dc-state="blocked">Add products to the deal before creating a quotation</p>
      : <p className="text-xs text-muted-foreground">Created as Draft in DIGIT; review taxes and submit from the native Quotation form.</p>}
    <dl className="my-2 grid grid-cols-2 gap-y-1 text-sm"><dt className="text-muted-foreground">Quotation To</dt><dd>{party ? <><span>{party.type}</span> · <DeskLink app="erpnext" dt={party.type} name={party.name} /></> : <span className="text-muted-foreground">Prospect is created on first quotation</span>}</dd></dl>
    {!quotes.length ? <Empty>No quotations yet.</Empty> : <EntTable id="crm-quotes" wrap><table className="dp-table w-full text-sm" data-crm-quotes><thead><tr><th>Quotation</th><th>Status</th><th>Date</th><th className="text-end">Items</th><th className="text-end">Grand Total</th></tr></thead>
      <tbody>{quotes.map((q) => <tr key={q.name} data-quote={q.name}><td><DeskLink app="erpnext" dt="Quotation" name={q.name} /></td><td>{st(q)}</td><td><Num v={String(q["transaction_date"] ?? "")} /></td><td className="text-end"><Num v={((q["items"] as unknown[]) ?? []).length} /></td><td className="text-end"><Num v={`${money(Number(q["grand_total"] ?? 0))} ${q["currency"] ?? ""}`} /></td></tr>)}</tbody></table></EntTable>}
  </Section>;
}

/* ---------- Stage history / aging / next action ---------- */
export function DealTimeline({ deal }: { deal: Doc }) {
  const h = stageHistory(deal), age = stageAgeDays(deal), nx = nextAction(deal.name), last = lastActivity(deal.name);
  return <Section title="Stage history">
    <div className="mb-3 grid grid-cols-3 gap-2 text-sm">
      <div><div className="text-xs text-muted-foreground">Days in stage</div><Num v={age ?? "—"} /></div>
      <div><div className="text-xs text-muted-foreground">Last activity</div><Num v={last ? fmtDate(last) : "—"} /></div>
      <div><div className="text-xs text-muted-foreground">Next action</div>{nx ? <span data-no-i18n>{String(nx["title"] ?? nx.name)} · <Num v={fmtDate(String(nx["due_date"] ?? ""))} /></span> : <span className="text-destructive">No next action</span>}</div>
    </div>
    {!h.length ? <Empty>No stage changes recorded.</Empty> : <ol className="space-y-1 text-sm" data-crm-stage-history>{[...h].reverse().map((r, i) =>
      <li key={i} className="flex gap-2"><span className="w-28 shrink-0 text-muted-foreground"><Num v={fmtDate(r.from_date)} /></span><span>{r.from}</span>{r.to && <><span>→</span><span>{r.to}</span></>}{!r.to && <span className="rounded bg-primary/15 px-1 text-xs text-primary">Current</span>}<span className="ms-auto text-xs text-muted-foreground" data-no-i18n>{userLabel(r.owner)}</span></li>)}</ol>}
  </Section>;
}

/* ---------- Targets ---------- */
export function Targets() {
  const [f, setF] = useState({ sp: "", fy: "", ig: "", amt: "" });
  return <CrmFrame title="Targets" subtitle="Sales Person targets from DIGIT Target Detail; achievement only where orders carry a sales team.">{(user) => {
    const rows = targets(user), sps = scopedList("Sales Person", user).filter((s) => !Number(s["is_group"])), fys = adapter.list("Fiscal Year"), igs = adapter.list("Item Group");
    const save = () => { const r = addTarget(f.sp, { fiscal_year: f.fy, item_group: f.ig, target_amount: Number(f.amt) }, user); r.ok ? (toast.success("Target saved"), setF({ sp: "", fy: "", ig: "", amt: "" })) : toast.error(r.error); };
    return <>
      <DeptPanel dept="targets" />
      <DemoOperations kind="target" user={user} />
      {isManager(user) && <Section title="New target"><div className="flex flex-wrap items-end gap-2 text-sm">
        <select className="input" value={f.sp} onChange={(e) => setF({ ...f, sp: e.target.value })} aria-label="Sales Person"><option value="">Sales Person…</option>{sps.map((s) => <option key={s.name} value={s.name} data-no-i18n>{s.name}</option>)}</select>
        <select className="input" value={f.fy} onChange={(e) => setF({ ...f, fy: e.target.value })} aria-label="Fiscal Year"><option value="">Fiscal Year…</option>{fys.map((s) => <option key={s.name} value={s.name} data-no-i18n>{s.name}</option>)}</select>
        <select className="input" value={f.ig} onChange={(e) => setF({ ...f, ig: e.target.value })} aria-label="Item Group"><option value="">All item groups</option>{igs.map((s) => <option key={s.name} value={s.name} data-no-i18n>{s.name}</option>)}</select>
        <input className="input w-36" type="number" min={0} placeholder="Target Amount" value={f.amt} onChange={(e) => setF({ ...f, amt: e.target.value })} aria-label="Target Amount" />
        <button className="btn-primary" onClick={save} data-crm-action="save-target">Save</button></div></Section>}
      <Section title="Targets">{!rows.length ? <Empty>No targets defined. Targets are set per Sales Person and fiscal year.</Empty> :
        <EntTable id="crm-targets" wrap><table className="dp-table w-full text-sm" data-crm-targets><thead><tr><th>Sales Person</th><th>Fiscal Year</th><th>Item Group</th><th className="text-end">Target Amount</th><th className="text-end">Achieved</th></tr></thead>
          <tbody>{rows.map((t, i) => { const { achieved: a, pct } = attainment(t, user); return <tr key={i} data-target-row={`${t.salesPerson}|${t.fiscalYear}`}><td><DeskLink app="erpnext" dt="Sales Person" name={t.salesPerson} />{t.user && <span className="ms-2 text-xs text-muted-foreground" data-no-i18n>{userLabel(t.user)}</span>}</td><td><Num v={t.fiscalYear} /></td><td data-no-i18n>{t.itemGroup || "—"}</td><td className="text-end"><Num v={money(t.amount)} /></td>
            <td className="text-end">{a == null ? <span className="text-xs text-muted-foreground">No attributed orders</span> : <Num v={`${money(a)} · ${pct ?? 0}%`} />}</td></tr>; })}</tbody></table></EntTable>}
        <p className="mt-2 text-xs text-muted-foreground">Achievement counts submitted Sales Orders with this person in the sales team. Booking basis (order vs invoice) awaits your approval.</p>
      </Section>
    </>;
  }}</CrmFrame>;
}

/* ---------- Commissions (policy-gated) ---------- */
export function Commissions() {
  return <CrmFrame title="Commissions" subtitle={demoEnabled() ? "" : "Blocked until commission rules are approved — nothing is calculated or paid."}>{(user) => {
    if (demoEnabled()) return <><DeptPanel dept="commissions" /><DemoOperations kind="commission" user={user} /></>;
    const sps = adapter.list("Sales Person").filter((s) => !Number(s["is_group"]));
    return <>
      <DeptPanel dept="commissions" />
      <div className="panel border-amber-500/40 p-4 text-sm" data-dc-state="policy-blocked"><h2 className="font-semibold">Commission rules not yet approved</h2>
        <p className="text-muted-foreground">To enable this screen, approve: rate basis (order, invoice or payment), tiers, approval steps, and reversal on returns. Until then no amount is calculated.</p></div>
      <Section title="Commission rate on Sales Person (DIGIT field)">
        <table className="dp-table w-full text-sm"><thead><tr><th>Sales Person</th><th className="text-end">Commission Rate</th></tr></thead>
          <tbody>{sps.map((s) => <tr key={s.name}><td><DeskLink app="erpnext" dt="Sales Person" name={s.name} /></td><td className="text-end"><Num v={s["commission_rate"] != null && s["commission_rate"] !== "" ? `${s["commission_rate"]}%` : "—"} /></td></tr>)}</tbody></table>
      </Section>
    </>;
  }}</CrmFrame>;
}

/* ---------- Campaign / source results ---------- */
export function CampaignResults() {
  return <CrmFrame title="Campaign Results" subtitle={demoEnabled() ? "" : "Leads, pipeline and won value by lead source. Cost and ROI stay unknown until campaign costs are recorded."}>{(user) => {
    if (demoEnabled()) return <><DeptPanel dept="campaigns" /><DemoOperations kind="campaign" user={user} /></>;
    const rows = sourceResults(user), camps = adapter.list("Campaign");
    return <>
      <DeptPanel dept="campaigns" />
      <Section title="Results by source">{!rows.length ? <Empty>No leads or deals yet.</Empty> :
        <EntTable id="crm-campaign-results" wrap><table className="dp-table w-full text-sm" data-crm-campaign-results><thead><tr><th>Source</th><th className="text-end">Leads</th><th className="text-end">Converted</th><th className="text-end">Rate</th><th className="text-end">Deals</th><th className="text-end">Open pipeline</th><th className="text-end">Won value</th><th className="text-end">ROI</th></tr></thead>
          <tbody>{rows.map((r) => <tr key={r.source}><td>{r.source === "Not set" ? r.source : <Link to="/digit-crm/leads" className="text-primary hover:underline" data-no-i18n>{r.source}</Link>}</td><td className="text-end"><Num v={r.leads} /></td><td className="text-end"><Num v={r.converted} /></td><td className="text-end"><Num v={r.conversion == null ? "—" : `${r.conversion}%`} /></td><td className="text-end"><Num v={r.deals} /></td><td className="text-end"><Num v={money(r.openPipeline)} /></td><td className="text-end"><Num v={money(r.wonValue)} /></td><td className="text-end text-muted-foreground">Unknown</td></tr>)}</tbody></table></EntTable>}
        <p className="mt-2 text-xs text-muted-foreground">CRM leads carry a source, not a campaign link; results are grouped by source. ROI needs recorded campaign cost.</p>
      </Section>
      <Section title="Campaigns" right={<Link to="/app/$app/$doctype" params={{ app: "erpnext", doctype: "campaign" }} className="text-xs text-primary">Campaigns</Link>}>{!camps.length ? <Empty>No campaigns recorded.</Empty> : <ul className="text-sm">{camps.map((c) => <li key={c.name}><DeskLink app="erpnext" dt="Campaign" name={c.name} /></li>)}</ul>}</Section>
    </>;
  }}</CrmFrame>;
}

/* ---------- Automation / Settings (native configuration records) ---------- */
function SourceTable({ items }: { items: { dt: string; app: string; note: string }[] }) {
  return <table className="dp-table w-full text-sm"><thead><tr><th>Setting</th><th>Purpose</th><th className="text-end">Records</th></tr></thead>
    <tbody>{items.map((s) => <tr key={s.dt}><td><Link to="/app/$app/$doctype" params={{ app: s.app, doctype: slug(s.dt) }} className="text-primary hover:underline">{s.dt}</Link></td><td className="text-muted-foreground">{s.note}</td><td className="text-end"><Num v={docCount(s.dt)} /></td></tr>)}</tbody></table>;
}
export function Automation() {
  return <CrmFrame title="Automation" subtitle="Assignment, alerts and response-time rules from the standard DIGIT records.">{() => <>
    <DeptPanel dept="admin" />
    <Section title="Automation rules"><SourceTable items={AUTOMATION_SOURCES} /></Section>
    <p className="text-xs text-muted-foreground">Rules run on the server in DIGIT. This preview simulates assignment and response-time rules only.</p>
  </>}</CrmFrame>;
}
export function Settings() {
  return <CrmFrame title="Settings" subtitle="Pipeline stages, sources, reasons and price lists used by DIGIT CRM.">{(user) => <>
    <CrmAdminSettings user={user} ar={useLang() === "ar"} />
    <DemoControls />
    <WorkingRules user={user} />
    <LeadRulesCard user={user} />
    <DeptPanel dept="admin" />
    <DataReadiness user={user} />
    <IaCoverage />
    <Section title="CRM configuration"><SourceTable items={SETTINGS_SOURCES} /></Section>
    <Section title="Integration"><ul className="space-y-1 text-sm"><li><Link to="/app/$app/$doctype" params={{ app: "crm", doctype: "fcrm_settings" }} className="text-primary hover:underline">CRM Settings</Link></li><li><Link to="/app/$app/$doctype" params={{ app: "crm", doctype: "erpnext_crm_settings" }} className="text-primary hover:underline">DIGIT Integration</Link></li></ul></Section>
  </>}</CrmFrame>;
}

/* ---------- Mobile CRM (responsive entry; no offline queue) ---------- */
export function MobileCrm() {
  return <CrmFrame title="Mobile CRM" subtitle="Quick access for phones. Works online only.">{(user) => {
    const k = homeKpis(user), deals = scopedDeals(user).filter(isOpenDeal).sort((a, b) => String(b["modified"] ?? "").localeCompare(String(a["modified"] ?? ""))).slice(0, 8);
    const tiles: [string, string, string | number][] = [["My Work", "/digit-crm", k.dueToday], ["Follow-up Center", "/digit-crm/follow-ups", k.overdueTasks], ["Leads", "/digit-crm/leads", k.openLeads], ["Pipeline", "/digit-crm/pipeline", k.openDeals], ["Activities", "/digit-crm/activities", ""], ["Customer 360", "/digit-crm/customers", ""]];
    return <div className="mx-auto max-w-md space-y-3" data-crm-mobile>
      <div className="grid grid-cols-2 gap-2">{tiles.map(([l, to, n]) => <Link key={l} to={to as never} className="panel flex min-h-14 items-center p-3 text-sm font-medium hover:bg-muted">{l}{n !== "" && <span className="ms-auto"><Num v={n} /></span>}</Link>)}</div>
      <Section title="Open opportunities">{!deals.length ? <Empty>No opportunities.</Empty> : <ul className="divide-y divide-border">{deals.map((d) =>
        <li key={d.name}><Link to="/digit-crm/deals/$dealId" params={{ dealId: d.name }} className="flex min-h-12 items-center gap-2 py-2 text-sm"><span className="min-w-0 truncate" data-no-i18n>{linkTitle("CRM Organization", d["organization"]) || d.name}</span><span className="ms-auto shrink-0 text-xs text-muted-foreground">{String(d["status"] ?? "")}</span><Num v={money(dealValue(d))} /></Link></li>)}</ul>}</Section>
    </div>;
  }}</CrmFrame>;
}
