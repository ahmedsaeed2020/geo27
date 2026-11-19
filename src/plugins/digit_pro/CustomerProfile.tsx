// @ts-nocheck -- DIGIT Pro/HR apps are switched off in the merged site build; their original /pro/* and /hr/* app routes are not in this route tree (re-enabling the app needs those routes, then remove this line)
/**
 * RXP-03 / SC-S-02 — Customer 360 (/pro/customer-360). Without `customer`: a customer directory ranked by open
 * receivables. With `customer`: identity, receivable ageing (same rows as /pro/receivables), credit exposure on Core's
 * credit-check basis, invoicing trend, open order lines and the customer's Quotations / Orders / Deliveries / Invoices /
 * Payments / Returns — every figure opens the filtered register or native document behind it. New quotation / order
 * open the native form with the customer and company already filled in. Read-only otherwise.
 */
import { ContextStrip, KPI_TILE } from "@/components/enterprise/kit";
import { EntTable } from "@/components/enterprise/kit/EntTable";
import { customerHold } from "@/lib/coreShared/customerHold";
import { useCallback, useState, type ReactNode } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { adapter } from "@/lib/adapter";
import { cachedMeta } from "@/lib/catalog";
import { currentUser, hasPerm } from "@/lib/session";
import { PartyScoreCard, UpcomingDueCard } from "./ArInsights";
import { CREDIT_SEGMENT, SEGMENTS, SEGMENTS_AR } from "./aging";
import { ProFrame } from "./ProFrame";
import { financeContext, slug, sourceStatus, todayIso } from "./finance";
import { CUST_TAB_LABEL, CUST_TABS, customerDirectory, customerProfile, type CustTab, type CustomerProfile } from "./customerProfile";
import { STATE_LABEL } from "./orderFulfilment";
import type { Bi } from "./command";
import { BarList, Chip, DocLink, DtText, Money, NativeList, Q2cState, qty, StackCols, StatusText, useBi, validIso } from "./Q2cUi";
import { ViewToolbar } from "./ViewToolbar";
import { C360_SPEC } from "./viewSpecs";
import { VIEW_KEYS, type Search, type ViewSearchKeys } from "./savedViews";
import { DateInput } from "@/components/form/DateInput";

export interface C360Search extends ViewSearchKeys { customer?: string | undefined; company?: string | undefined; as_of?: string | undefined; tab?: string | undefined; q?: string | undefined; disabled?: string | undefined }
export const C360_KEYS = ["customer", "company", "as_of", "tab", "q", "disabled", ...VIEW_KEYS];
const DTS = ["Customer", "Quotation", "Sales Order", "Delivery Note", "Sales Invoice", "Payment Entry", "Contact", "Address", "GL Entry", "Customer Group", "Company"];
/** Native Customer.customer_type options (stored value stays English; label only). */
const CUSTOMER_TYPE: Record<string, Bi> = { Company: ["Company", "شركة"], Individual: ["Individual", "فرد"], Partnership: ["Partnership", "شراكة"] };
const PAGE = 50;

export function CustomerProfilePro({ search }: { search: C360Search }) {
  const nav = useNavigate();
  const { t } = useBi();
  const set = (p: Partial<C360Search>) => void nav({ to: "/pro/customer-360", search: (prev: C360Search) => ({ ...prev, ...p }) as never, replace: true });
  // EQ-01 P3: personal Saved Views (filters only) — the URL stays the effective state, so Back/refresh keep the view.
  const apply = useCallback((next: Search) => void nav({ to: "/pro/customer-360", search: ((prev: C360Search) => ({ ...prev, ...next })) as never, replace: true }), [nav]);
  return (
    <ProFrame band={!search.customer} title={t("Customer 360", "ملف العميل 360")} subtitle={t("One customer's quotations, orders, deliveries, invoices, payments and returns — with receivables and credit from the native records.", "عروض العميل وأوامره وتسليماته وفواتيره ومدفوعاته ومرتجعاته — مع الذمم والائتمان من السجلات الأصلية.")} tabs={false} doctypes={DTS}>
      {({ user }) => {
        const ctx = financeContext(search.company, user);
        if (!ctx.companies.length) return <Q2cState status={sourceStatus("Company", user) === "ok" ? "empty" : "denied"} />;
        const asOf = validIso(search.as_of) ? search.as_of : todayIso();
        const bar = <section className="dp-context flex-wrap" data-dp-context>
          <label className="dp-ctx-item"><span>{t("Company", "الشركة")}</span>
            <select className="field-input" value={ctx.company} onChange={(e) => set({ company: e.target.value })} data-no-i18n>{ctx.companies.map((c) => <option key={c}>{c}</option>)}</select></label>
          <label className="dp-ctx-item"><span>{t("As of", "حتى تاريخ")}</span><DateInput className="field-input" value={asOf} onChange={(e) => validIso(e.target.value) && set({ as_of: e.target.value })} /></label>
          {search.customer && <Link to="/pro/customer-360" search={{ company: search.company, as_of: search.as_of } as never} className="btn-ghost ms-auto text-xs" data-dp-c360-directory>{t("All customers", "كل العملاء")}</Link>}
        </section>;
        return <div className="dp-cc" data-dp-screen="C360">{bar}<ViewToolbar spec={C360_SPEC} search={search as Search} companies={ctx.companies} onApply={apply} />{search.customer
          ? <Profile p={customerProfile(search.customer, ctx.company, asOf, user)} customer={search.customer} company={ctx.company} currency={ctx.currency} asOf={asOf} tab={search.tab} onTab={(tab) => set({ tab })} />
          : <Directory company={ctx.company} asOf={asOf} q={search.q} showDisabled={search.disabled === "1"} onQ={(q) => set({ q: q || undefined })} onDisabled={(v) => set({ disabled: v ? "1" : undefined })} user={user} />}</div>;
      }}
    </ProFrame>
  );
}

function Directory({ company, asOf, q, showDisabled, onQ, onDisabled, user }: { company: string; asOf: string; q?: string | undefined; showDisabled: boolean; onQ: (q: string) => void; onDisabled: (v: boolean) => void; user: string }) {
  const { t } = useBi();
  const [shown, setShown] = useState(PAGE);
  const d = customerDirectory(company, asOf, user);
  if (d.status !== "ok") return <Q2cState status={d.status} what={["Customer", "عميل"]} />;
  const s = (q ?? "").trim().toLowerCase();
  const rows = d.rows.filter((r) => (showDisabled || !r.disabled) && (!s || `${r.customer} ${r.customerName} ${r.group} ${r.territory}`.toLowerCase().includes(s)));
  return <section className="dp-cc-panel" data-dp-c360-dir>
    <div className="dp-cc-panel-h"><h2>{t("Customers", "العملاء")}</h2><span className="dp-cc-note">{t("Ranked by open receivable as of the date; choose a customer to open the profile.", "مرتبون حسب الذمة المفتوحة حتى التاريخ؛ اختر عميلًا لفتح ملفه.")}</span>
      <input type="search" className="field-input ms-auto max-w-xs" value={q ?? ""} onChange={(e) => { setShown(PAGE); onQ(e.target.value); }} placeholder={t("Find customer, group or territory", "بحث عن عميل أو مجموعة أو منطقة")} aria-label={t("Find customer, group or territory", "بحث عن عميل أو مجموعة أو منطقة")} />
      <label className="flex items-center gap-1.5 text-xs"><input type="checkbox" checked={showDisabled} onChange={(e) => onDisabled(e.target.checked)} />{t("Include disabled", "تضمين المعطّلين")}</label></div>
    {d.arStatus !== "ok" && <p className="dp-cc-note px-4 pt-2 text-warning">{t("Receivables are hidden by your permissions; balances are not shown.", "الذمم محجوبة بصلاحياتك؛ لا تُعرض الأرصدة.")}</p>}
    {!rows.length ? <div className="dp-cc-panel-b"><Q2cState status="empty" /></div> : <div className="overflow-x-auto"><EntTable id="pro-customer-directory" wrap><table className="dp-cc-table dp-q2c-table min-w-[820px]" data-dp-c360-dir-table>
      <thead><tr><th>{t("Customer", "العميل")}</th><th>{t("Group", "المجموعة")}</th><th>{t("Territory", "المنطقة")}</th><th className="num">{t("Outstanding", "المستحق")}</th><th className="num">{t("Overdue", "المتأخر")}</th><th className="num">{t("Open orders", "أوامر مفتوحة")}</th><th>{t("Last invoice", "آخر فاتورة")}</th><th className="num">{t("Invoiced, 12 months (net)", "المفوتر خلال 12 شهرًا (صافي)")}</th></tr></thead>
      <tbody>{rows.slice(0, shown).map((r) => <tr key={r.customer} data-dp-c360-dir-row={r.customer}>
        <td><Link to="/pro/customer-360" search={{ customer: r.customer, company, as_of: asOf === todayIso() ? undefined : asOf } as never} className="font-medium text-primary hover:underline" data-no-i18n><bdi>{r.customerName}</bdi></Link>
          <div className="text-[11px] text-muted-foreground" data-no-i18n>{r.customer}</div>{r.disabled && <Chip tone="muted">{t("Disabled", "معطّل")}</Chip>}</td>
        <td data-no-i18n>{r.group || "—"}</td><td data-no-i18n>{r.territory || "—"}</td>
        <td className="num">{d.arStatus === "ok" ? <Money totals={r.outstanding} /> : "—"}</td><td className="num">{d.arStatus === "ok" ? <Money totals={r.overdue} /> : "—"}</td>
        <td className="num" data-no-i18n>{d.orderStatus === "ok" ? r.openOrders : "—"}</td><td className="tabular-nums whitespace-nowrap" data-no-i18n>{r.lastInvoice || "—"}</td>
        <td className="num">{d.arStatus === "ok" ? <Money totals={r.invoiced12 ? [{ currency: "", amount: r.invoiced12 }] : []} /> : "—"}</td></tr>)}</tbody></table></EntTable></div>}
    {rows.length > shown && <div className="p-3 text-center"><button type="button" className="btn-ghost text-xs" onClick={() => setShown(shown + PAGE)}>{t(`Show more (${rows.length - shown} left)`, `عرض المزيد (متبقٍ ${rows.length - shown})`)}</button></div>}
  </section>;
}

function Profile({ p, customer, company, currency, asOf, tab, onTab }: { p: CustomerProfile; customer: string; company: string; currency: string; asOf: string; tab?: string | undefined; onTab: (t: CustTab) => void }) {
  const nav = useNavigate();
  const { ar, t, b } = useBi();
  const [shown, setShown] = useState(PAGE);
  if (p.status !== "ok" || !p.identity) return <Q2cState status={p.status} what={["Customer", "عميل"]} />;
  const id = p.identity;
  const active: CustTab = (CUST_TABS as string[]).includes(tab ?? "") ? (tab as CustTab) : "invoices";
  const td = p.tabs.find((x) => x.tab === active)!;
  const create = (dt: "Quotation" | "Sales Order") => {
    const m = cachedMeta(dt); if (!m || !hasPerm(m, "create")) return;
    const d = adapter.insert(m);
    adapter.update(dt, d.name, dt === "Quotation" ? { company, quotation_to: "Customer", party_name: customer, customer_name: id.customerName } : { company, customer, customer_name: id.customerName });
    void nav({ to: "/app/$app/$doctype/$name", params: { app: "erpnext", doctype: slug(dt), name: d.name } });
  };
  const canCreate = (dt: string) => { const m = cachedMeta(dt); return !!m && hasPerm(m, "create") && !id.disabled; };
  const late = p.lines.filter((l) => l.state === "late").length, toDeliver = p.lines.filter((l) => l.remaining > 0 && l.state !== "held");
  const toBill = p.lines.filter((l) => l.state === "to-bill").length;
  const credits12 = p.trend.reduce((a, m) => a + m.credited, 0);
  const ret = p.tabs.find((x) => x.tab === "returns")!;
  const sig = (k: string, label: string, value: ReactNode, meta: ReactNode, to: { to: string; search: Record<string, string | undefined> } | null, tone?: "warn" | "bad") => {
    const body = <><span className="dp-cc-label">{label}</span><span className="dp-cc-value" data-no-i18n>{value}</span><span className="dp-cc-meta">{meta}</span></>;
    return to ? <Link key={k} to={to.to as never} search={to.search as never} className={KPI_TILE} data-tone={tone} data-dp-c360-signal={k}>{body}</Link> : <div key={k} className={KPI_TILE} data-tone={tone} data-dp-c360-signal={k}>{body}</div>;
  };
  return <>
    <div data-dp-c360-hero><ContextStrip eyebrow={t("Customer 360", "ملف العميل 360")} title={<bdi data-no-i18n>{id.customerName}</bdi>}
      sub={<><span data-no-i18n>{id.name}{id.taxId ? ` · ${id.taxId}` : ""}</span><span className="ms-2 inline-flex flex-wrap gap-1.5 align-middle">{(() => { const h = customerHold(customer, asOf); return h.held ? <span className="dp-q2c-chip text-destructive" data-dp-c360-hold={h.release || "open"} title={b(h.message)}>{t("On hold", "موقوف")}{h.release ? <> · <bdi data-no-i18n>{h.release}</bdi></> : null}{h.reason ? <> · <bdi data-no-i18n>{h.reason}</bdi></> : null}</span> : null; })()}{id.type && <span className="dp-q2c-chip" data-dp-c360-type={id.type}>{(() => { const ty = CUSTOMER_TYPE[id.type]; return ty ? b(ty) : <bdi data-no-i18n>{id.type}</bdi>; })()}</span>}{[id.group, id.territory, id.currency, id.priceList, id.paymentTerms].filter(Boolean).map((x) => <span key={x} className="dp-q2c-chip" data-no-i18n>{x}</span>)}
            {id.disabled && <span className="dp-q2c-chip">{t("Disabled", "معطّل")}</span>}</span></>}
      actions={<span className="contents" data-dp-c360-actions>
          {canCreate("Quotation") && <button type="button" className="ek-context-btn" onClick={() => create("Quotation")} data-dp-c360-new="Quotation">+ {t("New quotation", "عرض سعر جديد")}</button>}
          {canCreate("Sales Order") && <button type="button" className="ek-context-btn" onClick={() => create("Sales Order")} data-dp-c360-new="Sales Order">+ {t("New sales order", "أمر بيع جديد")}</button>}
          <Link to="/app/$app/$doctype/$name" params={{ app: "erpnext", doctype: "customer", name: customer }} className="ek-context-btn" data-dp-c360-form>{t("Customer form", "نموذج العميل")}</Link>
          <Link to="/pro/general-ledger" search={{ company, party_type: "Customer", party: customer } as never} className="ek-context-btn">{t("Ledger", "دفتر الأستاذ")}</Link>
          <Link to="/report/$name" params={{ name: "Customer Ledger Summary" }} search={{ company, party: customer } as never} className="ek-context-btn">{t("Customer Ledger Summary", "ملخص دفتر العميل")}</Link>
        </span>} /></div>

    <div className="dp-cc-signals" data-dp-c360-signals>
      {sig("outstanding", t("Outstanding receivable", "الذمة المستحقة"), p.receivable.status !== "ok" ? t("Not Permitted", "غير مسموح") : <Money totals={p.receivable.outstanding} empty="0" />, <>{t("As of", "حتى")} <span data-no-i18n>{asOf}</span> · <span data-no-i18n>{p.receivable.rows.length}</span> {t("invoices", "فواتير")}</>,
        p.receivable.status === "ok" ? { to: "/pro/receivables", search: { company, party: customer, as_of: asOf === todayIso() ? undefined : asOf, fs: "drill" } } : null)}
      {sig("overdue", t("Overdue", "المتأخر"), p.receivable.status !== "ok" ? "—" : <Money totals={p.receivable.overdue} empty="0" />, <><span data-no-i18n>{p.receivable.overdueCount}</span> {t("invoices past due date", "فواتير تجاوزت الاستحقاق")}</>,
        p.receivable.status === "ok" ? { to: "/pro/receivables", search: { company, party: customer, overdue: "1", as_of: asOf === todayIso() ? undefined : asOf, fs: "drill" } } : null, p.receivable.overdueCount ? "bad" : undefined)}
      {sig("credit", t("Credit available", "الائتمان المتاح"), p.credit.status !== "ok" ? t("Not Permitted", "غير مسموح") : p.credit.available === null ? t("No limit set", "لا يوجد حد") : <Money totals={[{ currency, amount: p.credit.available }]} />,
        p.credit.status !== "ok" ? "" : <>{t("Exposure", "التعرض")} <Money totals={[{ currency, amount: p.credit.exposure }]} />{p.credit.limit ? <> · {t("limit", "الحد")} <Money totals={[{ currency, amount: p.credit.limit }]} /></> : null}{p.credit.bypass ? <> · {t("check bypassed on orders", "التحقق متجاوز على الأوامر")}</> : null}</>,
        null, p.credit.available !== null && p.credit.available < 0 ? "bad" : undefined)}
      {sig("orders", t("Order lines to deliver", "بنود أوامر للتسليم"), p.lineStatus !== "ok" ? "—" : toDeliver.length, p.lineStatus !== "ok" ? t("Not Permitted", "غير مسموح") : <><span data-no-i18n>{late}</span> {b(STATE_LABEL.late)} · <span data-no-i18n>{toBill}</span> {b(STATE_LABEL["to-bill"])}</>,
        p.lineStatus === "ok" ? { to: "/pro/order-fulfilment", search: { company, customer } } : null, late ? "bad" : undefined)}
      {sig("quotes", t("Open quotations", "عروض مفتوحة"), p.tabs[0]!.status !== "ok" ? "—" : p.quotes.open, p.tabs[0]!.status !== "ok" ? t("Not Permitted", "غير مسموح") : <><Money totals={p.quotes.openValue} empty="—" />{p.quotes.lapsed ? <> · <span data-no-i18n>{p.quotes.lapsed}</span> {t("past validity", "بعد الصلاحية")}</> : null}</>,
        p.tabs[0]!.status === "ok" ? { to: "/pro/quotation-pipeline", search: { company, customer } } : null, p.quotes.lapsed ? "warn" : undefined)}
      {sig("returns", t("Credit notes, 12 months", "إشعارات دائن خلال 12 شهرًا"), p.trendStatus !== "ok" ? "—" : <Money totals={[{ currency, amount: credits12 }]} empty="0" />, ret.status !== "ok" ? t("Not Permitted", "غير مسموح") : <><span data-no-i18n>{ret.docs.length}</span> {t("returns on record", "مرتجعات مسجلة")}</>,
        p.trendStatus === "ok" ? { to: "/pro/sales-returns", search: { company, customer } } : null)}
    </div>

    {p.receivable.status === "ok" && <div className="dp-cc-split dp-cc-split-even" data-dp-c360-pay>
      <PartyScoreCard side="receivable" company={company} party={customer} user={currentUser()} ar={ar} currency={currency} />
      <UpcomingDueCard rows={p.receivable.rows} side="receivable" ar={ar} currency={currency} />
    </div>}

    <div className="dp-cc-split dp-cc-split-even">
      <section className="dp-cc-panel" data-dp-c360-ageing>
        <div className="dp-cc-panel-h"><h2>{t("Receivable ageing", "تقادم الذمة")}</h2><span className="dp-cc-note">{t("Days past due date as of the date; a band opens those invoices in Receivables.", "أيام التأخر عن الاستحقاق حتى التاريخ؛ كل شريحة تفتح فواتيرها في الذمم المدينة.")}</span></div>
        <div className="dp-cc-panel-b">{p.receivable.status !== "ok" ? <Q2cState status={p.receivable.status} /> : !p.receivable.rows.length ? <Q2cState status="empty" /> :
          <BarList testId="c360-age" items={p.receivable.bands.map((x) => ({ key: String(x.bucket), label: (ar ? SEGMENTS_AR[x.bucket] : SEGMENTS[x.bucket]) ?? "", value: x.totals[0]?.amount ?? 0, tone: x.bucket === CREDIT_SEGMENT ? undefined : x.bucket >= 3 ? "bad" : x.bucket >= 1 ? "warn" : undefined,
            count: <>{x.count} · <Money totals={x.totals} empty="—" /></>, onClick: () => void nav({ to: "/pro/receivables", search: { company, party: customer, bucket: String(x.bucket), as_of: asOf === todayIso() ? undefined : asOf, fs: "drill" } as never }) }))} />}</div>
      </section>
      <section className="dp-cc-panel" data-dp-c360-trend>
        <div className="dp-cc-panel-h"><h2>{t("Invoiced by month", "المفوتر حسب الشهر")}</h2><span className="dp-cc-note"><span data-no-i18n>{currency}</span> · {t("submitted invoices and credit notes, last 12 months", "الفواتير وإشعارات الدائن المعتمدة، آخر 12 شهرًا")}</span></div>
        <div className="dp-cc-panel-b">{p.trendStatus !== "ok" ? <Q2cState status={p.trendStatus} /> : !p.trend.some((m) => m.invoiced || m.credited) ? <Q2cState status="empty" /> :
          <StackCols testId="c360-trend" cols={p.trend.map((m) => ({ key: m.month, label: m.month.slice(2), caption: m.invoices ? String(m.invoices) : "", segs: [{ key: "inv", value: Math.max(m.invoiced - m.credited, 0), tone: "t-primary", label: t("Invoiced (net)", "المفوتر (صافي)") }, { key: "cr", value: m.credited, tone: "t-bad", label: t("Credited", "المردود") }] }))}
            legend={[{ tone: "t-primary", label: t("Invoiced, net of credits", "المفوتر بعد خصم الإشعارات") }, { tone: "t-bad", label: t("Credit notes", "إشعارات الدائن") }]} />}</div>
      </section>
    </div>

    <section className="dp-cc-panel" data-dp-c360-contact>
      <div className="dp-cc-panel-h"><h2>{t("Contact and terms", "الاتصال والشروط")}</h2></div>
      <dl className="dp-cc-panel-b dp-q2c-id">
        <div><dt>{t("Primary contact", "جهة الاتصال الرئيسية")}</dt><dd>{id.contact ? <><DocLink dt="Contact" name={id.contact.name} /><div className="text-xs" data-no-i18n>{[id.contact.person, id.contact.email, id.contact.phone].filter(Boolean).join(" · ")}</div></> : "—"}</dd></div>
        <div><dt>{t("Address", "العنوان")}</dt><dd>{id.address ? <><DocLink dt="Address" name={id.address.name} /><div className="text-xs" data-no-i18n>{id.address.text}</div></> : "—"}</dd></div>
        <div><dt>{t("Payment terms", "شروط الدفع")}</dt><dd data-no-i18n>{id.paymentTerms || "—"}</dd></div>
        <div><dt>{t("Default price list", "قائمة الأسعار الافتراضية")}</dt><dd data-no-i18n>{id.priceList || "—"}</dd></div>
        <div><dt>{t("Customer group", "مجموعة العميل")}</dt><dd data-no-i18n>{id.group || "—"}</dd></div>
        <div><dt>{t("Territory", "المنطقة")}</dt><dd data-no-i18n>{id.territory || "—"}</dd></div>
      </dl>
    </section>

    <section className="dp-cc-panel" data-dp-c360-tabs={active}>
      <div className="dp-cc-panel-h">
        <div role="tablist" aria-label={t("Customer documents", "مستندات العميل")} className="dp-cc-tabs w-full">{p.tabs.map((x) => <button key={x.tab} type="button" role="tab" aria-selected={active === x.tab} className="dp-cc-tab" onClick={() => { setShown(PAGE); onTab(x.tab); }} data-dp-c360-tab={x.tab}>
          {b(CUST_TAB_LABEL[x.tab])}<span className="dp-cc-badge" data-no-i18n>{x.status === "ok" ? x.docs.length : "—"}</span></button>)}</div>
      </div>
      <div className="dp-q2c-filters">{td.list.map((l) => <NativeList key={l.doctype} doctype={l.doctype} filters={l.filters}>{t("Open in list", "فتح في القائمة")}: <DtText dt={l.doctype} /></NativeList>)}
        {active === "orders" && p.lineStatus === "ok" && <Link to="/pro/order-fulfilment" search={{ company, customer } as never} className="dp-link text-xs">{t("Order lines and deliveries", "بنود الأوامر والتسليمات")}</Link>}
        {active === "quotations" && <Link to="/pro/quotation-pipeline" search={{ company, customer } as never} className="dp-link text-xs">{t("Quotation pipeline", "مسار عروض الأسعار")}</Link>}
        {active === "returns" && <Link to="/pro/sales-returns" search={{ company, customer } as never} className="dp-link text-xs">{t("Sales returns", "مرتجعات المبيعات")}</Link>}
      </div>
      {td.status !== "ok" ? <div className="dp-cc-panel-b"><Q2cState status={td.status} /></div> : !td.docs.length ? <div className="dp-cc-panel-b"><Q2cState status="empty" /></div> : <>
        <div className="overflow-x-auto"><EntTable id="pro-customer-docs" wrap><table className="dp-cc-table dp-q2c-table min-w-[720px]" data-dp-c360-table={active}>
          <thead><tr><th>{t("Document", "المستند")}</th><th>{t("Date", "التاريخ")}</th><th>{t("Status", "الحالة")}</th><th className="num">{t("Amount", "المبلغ")}</th>
            {active === "invoices" && <><th className="num">{t("Outstanding", "المستحق")}</th><th>{t("Due date", "تاريخ الاستحقاق")}</th></>}
            {active === "quotations" && <th>{t("Valid till", "صالح حتى")}</th>}{active === "orders" && <th>{t("Delivered · billed", "المسلّم · المفوتر")}</th>}{active === "deliveries" && <th>{t("Billed", "المفوتر")}</th>}
            {active === "returns" && <th>{t("Return against", "مرتجع مقابل")}</th>}{active === "payments" && <th>{t("Mode / reference", "الطريقة / المرجع")}</th>}</tr></thead>
          <tbody>{td.docs.slice(0, shown).map((d) => <tr key={d.doctype + d.name} data-dp-c360-row={d.name}>
            <td><DocLink dt={d.doctype} name={d.name} />{td.doctypes.length > 1 && <div className="text-[11px] text-muted-foreground"><DtText dt={d.doctype} /></div>}</td>
            <td className="tabular-nums" data-no-i18n>{d.date}</td>
            <td><StatusText status={d.status} /></td>
            <td className="num"><Money totals={[{ currency: d.currency || currency, amount: d.amount }]} /></td>
            {active === "invoices" && <><td className="num">{d.outstanding === null ? "—" : <Money totals={[{ currency: d.currency || currency, amount: d.outstanding }]} empty="0" />}</td><td className={`tabular-nums ${d.outstanding && d.due && d.due < asOf ? "text-destructive" : ""}`} data-no-i18n>{d.due || "—"}</td></>}
            {active === "returns" ? <td>{d.info ? <DocLink dt={d.doctype} name={d.info} /> : "—"}</td> : active !== "invoices" && <td className="tabular-nums" data-no-i18n>{d.info || "—"}</td>}
          </tr>)}</tbody></table></EntTable></div>
        {td.docs.length > shown && <div className="p-3 text-center"><button type="button" className="btn-ghost text-xs" onClick={() => setShown(shown + PAGE)}>{t(`Show more (${td.docs.length - shown} left)`, `عرض المزيد (متبقٍ ${td.docs.length - shown})`)}</button></div>}
      </>}
    </section>

    {p.lineStatus === "ok" && toDeliver.length > 0 && <section className="dp-cc-panel" data-dp-c360-lines>
      <div className="dp-cc-panel-h"><h2>{t("Next order lines to deliver", "أقرب بنود الأوامر للتسليم")}</h2><Link to="/pro/order-fulfilment" search={{ company, customer } as never} className="dp-link ms-auto text-xs">{t("All order lines", "كل بنود الأوامر")}</Link></div>
      <ul className="divide-y divide-border text-sm">{toDeliver.slice(0, 5).map((l) => <li key={l.key} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2" data-dp-c360-line={l.key}>
        <DocLink dt="Sales Order" name={l.order} /><span data-no-i18n>{l.itemName}</span><span className="tabular-nums text-muted-foreground" data-no-i18n>{qty(l.remaining)} {l.uom}</span>
        <span className="ms-auto tabular-nums" data-no-i18n>{l.due || "—"}</span><Chip tone={l.state === "late" ? "bad" : l.state === "due" ? "warn" : undefined}>{b(STATE_LABEL[l.state])}</Chip></li>)}</ul>
    </section>}
  </>;
}
