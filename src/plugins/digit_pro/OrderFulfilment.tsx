// @ts-nocheck -- DIGIT Pro/HR apps are switched off in the merged site build; their original /pro/* and /hr/* app routes are not in this route tree (re-enabling the app needs those routes, then remove this line)
/**
 * RXP-03 / SC-S-04 + SC-S-05 — Order Fulfilment (/pro/order-fulfilment). Line-grain view of every open Sales Order:
 * what was promised, delivered, returned and invoiced per line, what is late, and the native documents behind it.
 * State cards, date buckets and order bars filter the same line set (kept in the URL, so Back and reload restore it);
 * every order, delivery and invoice opens its native form. Read-only — deliveries and invoices are created from the
 * native Sales Order "Create" menu, never here.
 */
import { useCallback, useState } from "react";
import { EntTable } from "@/components/enterprise/kit/EntTable";
import { Link, useNavigate } from "@tanstack/react-router";
import { ProFrame } from "./ProFrame";
import { financeContext, sourceStatus, todayIso } from "./finance";
import { freshness } from "./command";
import {
  BUCKET_LABEL, DUE_BUCKETS, filterLines, fulfilmentSummary, LINE_STATES, openOrdersFilter, orderFulfilment, orderProgress, REVIEW_LABEL, STATE_LABEL,
  type FulfilLine, type LineState,
} from "./orderFulfilment";
import { BarList, Chip, CustomerLink, DocLink, FilterCard, Money, NativeList, Progress, Q2cState, qty, StatusText, useBi, validIso } from "./Q2cUi";
import { ViewToolbar } from "./ViewToolbar";
import { FULFIL_SPEC } from "./viewSpecs";
import { VIEW_KEYS, type Search, type ViewSearchKeys } from "./savedViews";
import { DateInput } from "@/components/form/DateInput";

export interface FulfilSearch extends ViewSearchKeys { company?: string | undefined; as_of?: string | undefined; state?: string | undefined; bucket?: string | undefined; customer?: string | undefined; order?: string | undefined; q?: string | undefined; review?: string | undefined }
export const FULFIL_KEYS = ["company", "as_of", "state", "bucket", "customer", "order", "q", "review", ...VIEW_KEYS];
const DTS = ["Sales Order", "Delivery Note", "Sales Invoice", "Customer", "Item", "Company"];
const TONE: Partial<Record<LineState, "bad" | "warn">> = { late: "bad", due: "warn", held: "warn", "to-bill": "warn" };
const CHIP: Record<LineState, "bad" | "warn" | "ok" | "muted" | undefined> = { late: "bad", due: "warn", partial: undefined, open: "muted", "to-bill": "warn", held: "warn", done: "ok" };
const PAGE = 60;

export function OrderFulfilmentPro({ search }: { search: FulfilSearch }) {
  const nav = useNavigate();
  const { t, b } = useBi();
  const [shown, setShown] = useState(PAGE);
  const set = (p: Partial<FulfilSearch>) => { setShown(PAGE); void nav({ to: "/pro/order-fulfilment", search: (prev: FulfilSearch) => ({ ...prev, ...p }) as never, replace: true }); };
  // EQ-01 P3: personal Saved Views (filters only) — the URL stays the effective state, so Back/refresh keep the view.
  const apply = useCallback((next: Search) => void nav({ to: "/pro/order-fulfilment", search: ((prev: FulfilSearch) => ({ ...prev, ...next })) as never, replace: true }), [nav]);
  return (
    <ProFrame title={t("Order Fulfilment", "تنفيذ أوامر البيع")} subtitle={t("Every open order line: promised, delivered, returned and invoiced — with the documents behind each figure.", "كل بند أمر بيع مفتوح: المطلوب والمسلّم والمرتجع والمفوتر — مع المستندات خلف كل رقم.")} tabs={false} doctypes={DTS}>
      {({ user }) => {
        const ctx = financeContext(search.company, user);
        if (!ctx.companies.length) return <Q2cState status={sourceStatus("Company", user) === "ok" ? "empty" : "denied"} />;
        const asOf = validIso(search.as_of) ? search.as_of : todayIso();
        const r = orderFulfilment(ctx.company, asOf, user);
        const all = r.lines;
        const sum = fulfilmentSummary(all);
        const lines = filterLines(all, search);
        const progress = orderProgress(filterLines(all, { ...search, order: undefined })).slice(0, 8);
        const customers = [...new Map(all.map((l) => [l.customer, l.customerName])).entries()].sort((a, c) => a[1].localeCompare(c[1]));
        const filtered = !!(search.state || search.bucket || search.customer || search.order || search.q || search.review);
        return <div className="dp-cc" data-dp-screen="SO-FULFIL">
          <section className="dp-context flex-wrap" data-dp-context>
            <label className="dp-ctx-item"><span>{t("Company", "الشركة")}</span>
              <select className="field-input" value={ctx.company} onChange={(e) => set({ company: e.target.value, customer: undefined, order: undefined })} data-no-i18n>{ctx.companies.map((c) => <option key={c}>{c}</option>)}</select></label>
            <label className="dp-ctx-item"><span>{t("As of", "حتى تاريخ")}</span><DateInput className="field-input" value={asOf} onChange={(e) => validIso(e.target.value) && set({ as_of: e.target.value })} /></label>
            <label className="dp-ctx-item"><span>{t("Customer", "العميل")}</span>
              <select className="field-input max-w-[14rem]" value={search.customer ?? ""} onChange={(e) => set({ customer: e.target.value || undefined, order: undefined })}>
                <option value="">{t("All customers", "كل العملاء")}</option>{customers.map(([id, nm]) => <option key={id} value={id} data-no-i18n>{nm}</option>)}</select></label>
            <input type="search" className="field-input max-w-xs" value={search.q ?? ""} onChange={(e) => set({ q: e.target.value || undefined })} placeholder={t("Find order, customer, item or warehouse", "بحث عن أمر أو عميل أو صنف أو مستودع")} aria-label={t("Find order, customer, item or warehouse", "بحث عن أمر أو عميل أو صنف أو مستودع")} />
            <div className="dp-ctx-item"><span>{t("Last change", "آخر تعديل")}</span><b className="tabular-nums" data-no-i18n>{freshness(["Sales Order", "Delivery Note"], user)}</b></div>
            <div className="ms-auto flex flex-wrap gap-1.5">
              <NativeList doctype="Sales Order" filters={openOrdersFilter(ctx.company)} className="btn-ghost text-xs">{t("Open orders list", "قائمة الأوامر المفتوحة")}</NativeList>
              <Link to="/report/$name" params={{ name: "Sales Order Analysis" }} search={{ company: ctx.company } as never} className="btn-ghost text-xs">{t("Sales Order Analysis", "تحليل أوامر البيع")}</Link>
              <Link to="/pro/delivered-not-billed" search={{ company: ctx.company } as never} className="btn-ghost text-xs">{t("Delivered not billed", "مسلّم غير مفوتر")}</Link>
            </div>
          </section>
          <ViewToolbar spec={FULFIL_SPEC} search={search as Search} companies={ctx.companies} onApply={apply} />

          {r.status !== "ok" ? <Q2cState status={r.status} what={["Sales Order", "أمر بيع"]} /> : <>
            {r.linkStatus !== "ok" && <p className="dp-cc-note text-warning" data-dp-link-status={r.linkStatus}>{t("Some deliveries or invoices are hidden by your permissions: quantities come from the order lines, linked documents may be incomplete.", "بعض أذونات التسليم أو الفواتير محجوبة بصلاحياتك: الكميات من بنود الأمر، وقد تكون المستندات المرتبطة ناقصة.")}</p>}
            <div className="dp-cc-signals" data-dp-fulfil-cards>
              {LINE_STATES.map((k) => { const x = sum.byState[k];
                return <FilterCard key={k} testId={k} label={b(STATE_LABEL[k])} tone={x.lines ? TONE[k] : undefined} active={search.state === k} onClick={() => set({ state: search.state === k ? undefined : k })}
                  value={<>{x.lines} <small className="text-xs font-normal text-muted-foreground">{t("lines", "بنود")}</small></>}
                  meta={<><span>{x.orders} {t("orders", "أوامر")}</span> · <Money totals={x.value} empty={t("no value", "بدون قيمة")} /></>} />; })}
            </div>

            <div className="dp-cc-split dp-cc-split-even">
              <section className="dp-cc-panel" data-dp-fulfil-buckets>
                <div className="dp-cc-panel-h"><h2>{t("Backlog by promised date", "المتبقي حسب تاريخ التسليم الموعود")}</h2><span className="dp-cc-note">{t("Lines still to deliver (held orders excluded); value = remaining qty × line rate.", "البنود المتبقية للتسليم (دون المعلّقة)؛ القيمة = الكمية المتبقية × سعر البند.")}</span></div>
                <div className="dp-cc-panel-b">
                  <BarList testId="buckets" items={DUE_BUCKETS.map((k) => { const x = sum.byBucket[k];
                    return { key: k, label: b(BUCKET_LABEL[k]), value: x.lines, tone: k === "overdue" ? "bad" : k === "d7" ? "warn" : k === "none" ? "muted" : undefined, active: search.bucket === k,
                      count: <>{x.lines} · <Money totals={x.value} empty="—" /></>, onClick: () => set({ bucket: search.bucket === k ? undefined : k }) }; })} />
                </div>
              </section>
              <section className="dp-cc-panel" data-dp-fulfil-orders>
                <div className="dp-cc-panel-h"><h2>{t("Order progress", "تقدم الأوامر")}</h2><span className="dp-cc-note">{t("Delivered share of each order's line value; most urgent first.", "نسبة المسلّم من قيمة بنود كل أمر؛ الأكثر إلحاحًا أولًا.")}</span></div>
                {!progress.length ? <div className="dp-cc-panel-b"><Q2cState status="empty" /></div> :
                  <div className="overflow-x-auto"><EntTable id="pro-fulfil-summary" wrap><table className="dp-cc-table dp-q2c-table"><thead><tr><th>{t("Order", "الأمر")}</th><th>{t("Customer", "العميل")}</th><th>{t("Delivered", "المسلّم")}</th><th className="num">{t("Remaining value", "القيمة المتبقية")}</th><th /></tr></thead>
                    <tbody>{progress.map((o) => <tr key={o.order} data-selected={search.order === o.order ? "" : undefined}>
                      <td><DocLink dt="Sales Order" name={o.order} /><div className="text-[11px] text-muted-foreground" data-no-i18n>{o.due}</div></td>
                      <td><CustomerLink customer={o.customer} name={o.customerName} company={ctx.company} /></td>
                      <td><Progress done={o.deliveredValue} total={o.amount} label={t("Delivered", "المسلّم")} /></td>
                      <td className="num"><Money totals={[{ currency: o.currency, amount: o.remainingValue }]} /></td>
                      <td><button type="button" className="dp-link text-xs" aria-pressed={search.order === o.order} onClick={() => set({ order: search.order === o.order ? undefined : o.order })} data-dp-fulfil-order={o.order}>{search.order === o.order ? t("All lines", "كل البنود") : t("Lines", "البنود")}</button></td>
                    </tr>)}</tbody></table></EntTable></div>}
              </section>
            </div>

            <section className="dp-cc-panel" data-dp-fulfil-lines>
              <div className="dp-cc-panel-h"><h2>{t("Order lines", "بنود الأوامر")}</h2>
                <span className="dp-cc-note" data-dp-fulfil-count={lines.length}>{t(`${lines.length} of ${all.length} lines`, `${lines.length} من ${all.length} بندًا`)}</span>
                <label className="ms-auto flex items-center gap-1.5 text-xs"><input type="checkbox" checked={search.review === "1"} onChange={(e) => set({ review: e.target.checked ? "1" : undefined })} />{t("Needs review only", "المحتاج إلى مراجعة فقط")} <span data-no-i18n>({sum.review})</span></label>
                {filtered && <button type="button" className="dp-link text-xs" onClick={() => set({ state: undefined, bucket: undefined, customer: undefined, order: undefined, q: undefined, review: undefined })} data-dp-fulfil-clear>{t("Clear filters", "مسح عوامل التصفية")}</button>}
              </div>
              {!lines.length ? <div className="dp-cc-panel-b"><Q2cState status="empty" /></div> : <>
                <ul className="dp-q2c-card-list md:hidden" data-dp-fulfil-cards-mobile>{lines.slice(0, shown).map((l) => <LineCard key={l.key} l={l} company={ctx.company} />)}</ul>
                <div className="hidden overflow-x-auto md:block"><EntTable id="pro-fulfil-orders" wrap><table className="dp-cc-table dp-q2c-table min-w-[1100px]" data-dp-fulfil-table>
                  <thead><tr><th>{t("Order / line", "الأمر / البند")}</th><th>{t("Customer", "العميل")}</th><th>{t("Item", "الصنف")}</th><th>{t("Promised", "الموعد")}</th>
                    <th className="num">{t("Ordered", "المطلوب")}</th><th className="num">{t("Delivered", "المسلّم")}</th><th className="num">{t("Returned", "المرتجع")}</th><th className="num">{t("Invoiced", "المفوتر")}</th><th className="num">{t("To deliver", "المتبقي")}</th><th className="num">{t("Remaining value", "القيمة المتبقية")}</th>
                    <th>{t("State", "الحالة")}</th><th>{t("Linked documents", "المستندات المرتبطة")}</th></tr></thead>
                  <tbody>{lines.slice(0, shown).map((l) => <tr key={l.key} data-dp-fulfil-row={l.key} data-state={l.state}>
                    <td><DocLink dt="Sales Order" name={l.order} /><div className="text-[11px] text-muted-foreground"><span data-no-i18n>#{l.idx}</span> · <StatusText status={l.orderStatus} /></div></td>
                    <td><CustomerLink customer={l.customer} name={l.customerName} company={ctx.company} /></td>
                    <td><span data-no-i18n>{l.itemName}</span><div className="text-[11px] text-muted-foreground" data-no-i18n>{l.item}{l.warehouse ? ` · ${l.warehouse}` : ""}</div></td>
                    <td><span className="tabular-nums" data-no-i18n>{l.due || "—"}</span>{l.dueSource === "order" && <div className="text-[11px] text-muted-foreground">{t("order date", "تاريخ الأمر")}</div>}</td>
                    <td className="num" data-no-i18n>{qty(l.ordered)} <small className="text-muted-foreground">{l.uom}</small></td>
                    <td className="num" data-no-i18n>{qty(l.delivered)}</td><td className="num" data-no-i18n>{l.returned ? qty(l.returned) : "—"}</td><td className="num" data-no-i18n>{l.linksChecked ? qty(l.billedQty) : "—"}</td>
                    <td className="num font-medium" data-no-i18n>{qty(l.remaining)}</td>
                    <td className="num"><Money totals={l.remaining ? [{ currency: l.currency, amount: l.remainingValue }] : []} /></td>
                    <td><StateChip l={l} /></td>
                    <td><Linked l={l} /></td>
                  </tr>)}</tbody></table></EntTable></div>
                {lines.length > shown && <div className="p-3 text-center"><button type="button" className="btn-ghost text-xs" onClick={() => setShown(shown + PAGE)} data-dp-fulfil-more>{t(`Show more (${lines.length - shown} left)`, `عرض المزيد (متبقٍ ${lines.length - shown})`)}</button></div>}
              </>}
              <p className="dp-cc-note px-4 pb-3" data-dp-fulfil-basis>{t("Delivered and invoiced quantities follow the native order-line links (row link first, else the item when it is on one line only); returns net off. Lines where linked rows disagree with the stored delivered quantity, cannot be tied to one line or use another unit are flagged for review, never adjusted. Deliveries and invoices are created from the order's native Create menu.", "الكميات المسلّمة والمفوترة تتبع روابط بنود الأمر الأصلية (رابط البند أولًا، ثم الصنف إن ورد في بند واحد فقط)، وتُخصم المرتجعات. البنود التي تختلف فيها الروابط عن الكمية المسلّمة المخزنة أو لا يمكن ربطها ببند واحد أو بوحدة مختلفة تُعلَّم للمراجعة ولا تُعدّل. تُنشأ أذونات التسليم والفواتير من قائمة «إنشاء» في أمر البيع.")}</p>
            </section>
          </>}
        </div>;
      }}
    </ProFrame>
  );
}

function StateChip({ l }: { l: FulfilLine }) {
  const { t, b } = useBi();
  return <span className="inline-flex flex-col items-start gap-1"><Chip tone={CHIP[l.state]} data-dp-line-state={l.state}>{b(STATE_LABEL[l.state])}{l.daysLate > 0 && <span data-no-i18n>· {l.daysLate}</span>}{l.daysLate > 0 && <span>{t("days", "يومًا")}</span>}</Chip>
    {l.review.map((x) => <span key={x} className="text-[11px] text-warning" data-dp-line-review={x}>{b(REVIEW_LABEL[x])}</span>)}</span>;
}
function Linked({ l }: { l: FulfilLine }) {
  const { t } = useBi();
  if (!l.docs.length) return <span className="text-xs text-muted-foreground">{t("None yet", "لا يوجد بعد")}</span>;
  return <span className="dp-q2c-docs">{l.docs.map((d) => <span key={d.doctype + d.name} className="inline-flex items-center gap-1 text-xs">
    <DocLink dt={d.doctype} name={d.name} />{d.isReturn && <Chip tone="warn">{t("Return", "مرتجع")}</Chip>}{d.docstatus === 0 && <Chip tone="muted">{t("Draft", "مسودة")}</Chip>}</span>)}</span>;
}
function LineCard({ l, company }: { l: FulfilLine; company: string }) {
  const { t } = useBi();
  return <li className="dp-q2c-row-card" data-dp-fulfil-card={l.key}>
    <div className="flex flex-wrap items-center gap-2"><DocLink dt="Sales Order" name={l.order} /><span className="text-xs text-muted-foreground" data-no-i18n>#{l.idx}</span><span className="ms-auto"><StateChip l={l} /></span></div>
    <div className="text-sm"><span data-no-i18n>{l.itemName}</span> · <CustomerLink customer={l.customer} name={l.customerName} company={company} /></div>
    <dl><div><dt>{t("Ordered", "المطلوب")}</dt><dd data-no-i18n>{qty(l.ordered)} {l.uom}</dd></div><div><dt>{t("Delivered", "المسلّم")}</dt><dd data-no-i18n>{qty(l.delivered)}</dd></div><div><dt>{t("To deliver", "المتبقي")}</dt><dd data-no-i18n>{qty(l.remaining)}</dd></div>
      <div><dt>{t("Invoiced", "المفوتر")}</dt><dd data-no-i18n>{l.linksChecked ? qty(l.billedQty) : "—"}</dd></div><div><dt>{t("Promised", "الموعد")}</dt><dd data-no-i18n>{l.due || "—"}</dd></div><div><dt>{t("Remaining value", "القيمة المتبقية")}</dt><dd><Money totals={l.remaining ? [{ currency: l.currency, amount: l.remainingValue }] : []} /></dd></div></dl>
    <Linked l={l} />
  </li>;
}
