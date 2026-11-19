// @ts-nocheck -- DIGIT Pro/HR apps are switched off in the merged site build; their original /pro/* and /hr/* app routes are not in this route tree (re-enabling the app needs those routes, then remove this line)
/**
 * RXP-03 / SC-S-03 — Quotation Pipeline (/pro/quotation-pipeline). Live pipeline as of a date (open, expiring, open past
 * validity, drafts) plus outcomes of the quotations dated in a period (ordered, partly ordered, lost, expired), month
 * cohorts by document count and recorded lost reasons. Every quotation and linked Sales Order opens its native form;
 * cards and bars filter the same rows (URL state) and offer the matching native list when it can express the predicate.
 */
import { useCallback, useState } from "react";
import { EntTable } from "@/components/enterprise/kit/EntTable";
import { Link, useNavigate } from "@tanstack/react-router";
import { adapter } from "@/lib/adapter";
import { cachedMeta } from "@/lib/catalog";
import { hasPerm } from "@/lib/session";
import { ProFrame } from "./ProFrame";
import { financeContext, slug, sourceStatus, todayIso } from "./finance";
import { freshness } from "./command";
import {
  BIN_LABEL, EXPIRY_BINS, filterQuotes, lostReasons, nativeQuoteFilter, OUTCOME_LABEL, outcomeCohorts, pipelineSummary, quotationPipeline,
  type ExpiryBin, type Outcome, type QuoteRow,
} from "./quotationPipeline";
import { plusDays } from "./orderFulfilment";
import { lastMonthsTo } from "./customerProfile";
import { BarList, Chip, CustomerLink, DocLink, FilterCard, Money, NativeList, Q2cState, StackCols, StatusText, useBi, validIso } from "./Q2cUi";
import { ViewToolbar } from "./ViewToolbar";
import { PIPELINE_SPEC } from "./viewSpecs";
import { VIEW_KEYS, type Search, type ViewSearchKeys } from "./savedViews";
import { DateInput } from "@/components/form/DateInput";

export interface PipelineSearch extends ViewSearchKeys { company?: string | undefined; as_of?: string | undefined; from?: string | undefined; to?: string | undefined; outcome?: string | undefined; bin?: string | undefined; customer?: string | undefined; q?: string | undefined }
export const PIPELINE_KEYS = ["company", "as_of", "from", "to", "outcome", "bin", "customer", "q", ...VIEW_KEYS];
const DTS = ["Quotation", "Sales Order", "Customer", "Company"];
const CLOSED: Outcome[] = ["ordered", "partial", "lost", "expired"];
const LIVE: Outcome[] = ["open", "lapsed", "partial", "draft"];
const SEG_TONE: Record<Outcome, string> = { ordered: "t-success", partial: "t-soft", lost: "t-bad", expired: "t-muted", lapsed: "t-warn", open: "t-primary", draft: "t-info" };
const CHIP: Record<Outcome, "bad" | "warn" | "ok" | "muted" | undefined> = { ordered: "ok", partial: "ok", lost: "bad", expired: "muted", lapsed: "warn", open: undefined, draft: "muted" };
const PAGE = 60;

export function QuotationPipelinePro({ search }: { search: PipelineSearch }) {
  const nav = useNavigate();
  const { ar, t, b } = useBi();
  const [shown, setShown] = useState(PAGE);
  const set = (p: Partial<PipelineSearch>) => { setShown(PAGE); void nav({ to: "/pro/quotation-pipeline", search: (prev: PipelineSearch) => ({ ...prev, ...p }) as never, replace: true }); };
  // EQ-01 P3: personal Saved Views (filters only) — the URL stays the effective state, so Back/refresh keep the view.
  const apply = useCallback((next: Search) => void nav({ to: "/pro/quotation-pipeline", search: ((prev: PipelineSearch) => ({ ...prev, ...next })) as never, replace: true }), [nav]);
  return (
    <ProFrame title={t("Quotation Pipeline", "مسار عروض الأسعار")} subtitle={t("Which quotes are open, expiring or past validity — and what happened to the ones already decided.", "ما العروض المفتوحة أو القريبة من الانتهاء أو المنتهية — وما مصير العروض المحسومة.")} tabs={false} doctypes={DTS}>
      {({ user }) => {
        const ctx = financeContext(search.company, user);
        if (!ctx.companies.length) return <Q2cState status={sourceStatus("Company", user) === "ok" ? "empty" : "denied"} />;
        const asOf = validIso(search.as_of) ? search.as_of : todayIso();
        const to = validIso(search.to) ? search.to : asOf;
        const from = validIso(search.from) ? search.from : `${lastMonthsTo(to, 6)[0]}-01`;
        const badRange = from > to;
        const r = quotationPipeline(ctx.company, asOf, user);
        const sum = pipelineSummary(r.rows);
        const inPeriod = (q: QuoteRow) => q.date >= from && q.date <= to;
        const closedIn = (o: Outcome) => r.rows.filter((q) => q.outcome === o && inPeriod(q));
        const outcome = (CLOSED as string[]).concat(LIVE).includes(search.outcome ?? "") ? (search.outcome as Outcome) : undefined;
        const bin = (EXPIRY_BINS as string[]).includes(search.bin ?? "") ? (search.bin as ExpiryBin) : undefined;
        const base = filterQuotes(r.rows, { customer: search.customer, q: search.q });
        const rows = (outcome ? base.filter((q) => q.outcome === outcome && (!CLOSED.includes(outcome) || outcome === "partial" || inPeriod(q)))
          : bin ? base.filter((q) => q.bin === bin)
          : base.filter((q) => LIVE.includes(q.outcome) || inPeriod(q)));
        const cohorts = badRange ? [] : outcomeCohorts(r.rows, from, to);
        const reasons = badRange ? [] : lostReasons(r.rows, from, to);
        const customers = [...new Map(r.rows.map((q) => [q.customer, q.customerName])).entries()].sort((a, c) => a[1].localeCompare(c[1]));
        const native = nativeQuoteFilter(ctx.company, asOf, { outcome, bin });
        const qm = cachedMeta("Quotation"); const canNew = !!qm && hasPerm(qm, "create");
        const newQuote = () => { if (!qm) return; const d = adapter.insert(qm); adapter.update("Quotation", d.name, { company: ctx.company, quotation_to: "Customer", ...(search.customer ? { party_name: search.customer } : {}) }); void nav({ to: "/app/$app/$doctype/$name", params: { app: "erpnext", doctype: slug("Quotation"), name: d.name } }); };
        const card = (k: string, label: string, count: number, totals: { currency: string; amount: number }[], active: boolean, onClick: () => void, tone?: "warn" | "bad") =>
          <FilterCard key={k} testId={k} label={label} active={active} onClick={onClick} tone={count ? tone : undefined} value={count} meta={<Money totals={totals} empty={t("no value", "بدون قيمة")} />} />;
        return <div className="dp-cc" data-dp-screen="QTN-PIPE">
          <section className="dp-context flex-wrap" data-dp-context>
            <label className="dp-ctx-item"><span>{t("Company", "الشركة")}</span>
              <select className="field-input" value={ctx.company} onChange={(e) => set({ company: e.target.value, customer: undefined })} data-no-i18n>{ctx.companies.map((c) => <option key={c}>{c}</option>)}</select></label>
            <label className="dp-ctx-item"><span>{t("As of", "حتى تاريخ")}</span><DateInput className="field-input" value={asOf} onChange={(e) => validIso(e.target.value) && set({ as_of: e.target.value })} /></label>
            <label className="dp-ctx-item"><span>{t("Quotations dated from", "عروض مؤرخة من")}</span><DateInput className="field-input" value={from} onChange={(e) => validIso(e.target.value) && set({ from: e.target.value })} /></label>
            <label className="dp-ctx-item"><span>{t("To", "إلى")}</span><DateInput className="field-input" value={to} onChange={(e) => validIso(e.target.value) && set({ to: e.target.value })} /></label>
            <label className="dp-ctx-item"><span>{t("Customer", "العميل")}</span>
              <select className="field-input max-w-[14rem]" value={search.customer ?? ""} onChange={(e) => set({ customer: e.target.value || undefined })}>
                <option value="">{t("All customers", "كل العملاء")}</option>{customers.map(([id, nm]) => <option key={id} value={id} data-no-i18n>{nm}</option>)}</select></label>
            <input type="search" className="field-input max-w-xs" value={search.q ?? ""} onChange={(e) => set({ q: e.target.value || undefined })} placeholder={t("Find quotation or customer", "بحث عن عرض أو عميل")} aria-label={t("Find quotation or customer", "بحث عن عرض أو عميل")} />
            <div className="dp-ctx-item"><span>{t("Last change", "آخر تعديل")}</span><b className="tabular-nums" data-no-i18n>{freshness(["Quotation"], user)}</b></div>
            <div className="ms-auto flex flex-wrap gap-1.5">
              {canNew && <button type="button" className="btn-primary text-xs" onClick={newQuote} data-dp-new-quotation>+ {t("New quotation", "عرض سعر جديد")}</button>}
              <Link to="/report/$name" params={{ name: "Quotation Trends" }} search={{ company: ctx.company } as never} className="btn-ghost text-xs">{t("Quotation Trends", "اتجاهات عروض الأسعار")}</Link>
            </div>
          </section>
          <ViewToolbar spec={PIPELINE_SPEC} search={search as Search} companies={ctx.companies} onApply={apply} />

          {r.status !== "ok" ? <Q2cState status={r.status} what={["Quotation", "عرض سعر"]} /> : badRange ? <p className="text-destructive">{t("Choose a valid date range.", "اختر نطاق تاريخ صحيحًا.")}</p> : <>
            {r.orderStatus !== "ok" && <p className="dp-cc-note text-warning" data-dp-order-status={r.orderStatus}>{t("Sales Orders are hidden by your permissions: outcomes come from quotation status, linked orders are not listed.", "أوامر البيع محجوبة بصلاحياتك: النتائج من حالة العرض ولا تُعرض الأوامر المرتبطة.")}</p>}
            <div className="dp-cc-signals" data-dp-pipe-cards>
              {card("open", t("Open and valid", "مفتوحة وسارية"), sum.byOutcome.open.count, sum.byOutcome.open.value, outcome === "open", () => set({ outcome: outcome === "open" ? undefined : "open", bin: undefined }))}
              {card("d7", t("Expiring in 7 days", "تنتهي خلال 7 أيام"), sum.byBin.d7.count, sum.byBin.d7.value, bin === "d7", () => set({ bin: bin === "d7" ? undefined : "d7", outcome: undefined }), "warn")}
              {card("lapsed", t("Open past validity", "مفتوحة بعد انتهاء الصلاحية"), sum.byOutcome.lapsed.count, sum.byOutcome.lapsed.value, outcome === "lapsed", () => set({ outcome: outcome === "lapsed" ? undefined : "lapsed", bin: undefined }), "bad")}
              {card("draft", t("Drafts to submit", "مسودات للاعتماد"), sum.byOutcome.draft.count, sum.byOutcome.draft.value, outcome === "draft", () => set({ outcome: outcome === "draft" ? undefined : "draft", bin: undefined }))}
              {card("ordered", t("Ordered in period", "تم طلبها في الفترة"), closedIn("ordered").length + closedIn("partial").length, [], outcome === "ordered", () => set({ outcome: outcome === "ordered" ? undefined : "ordered", bin: undefined }))}
              {card("lost", t("Lost in period", "مفقودة في الفترة"), closedIn("lost").length, [], outcome === "lost", () => set({ outcome: outcome === "lost" ? undefined : "lost", bin: undefined }), "warn")}
            </div>

            <div className="dp-cc-split dp-cc-split-7">
              <section className="dp-cc-panel" data-dp-pipe-cohorts>
                <div className="dp-cc-panel-h"><h2>{t("Outcomes by quotation month", "النتائج حسب شهر العرض")}</h2><span className="dp-cc-note">{t("Submitted quotations dated in the period, by current outcome — document counts, not a probability. Pick a month to narrow the period.", "العروض المعتمدة المؤرخة في الفترة حسب نتيجتها الحالية — أعداد مستندات وليست احتمالًا. اختر شهرًا لتضييق الفترة.")}</span></div>
                <div className="dp-cc-panel-b">
                  {!cohorts.some((c) => c.total) ? <Q2cState status="empty" /> :
                    <StackCols testId="cohorts" onPick={(m) => { const [y, mo] = m.split("-").map(Number) as [number, number]; set({ from: `${m}-01`, to: new Date(Date.UTC(y, mo, 0)).toISOString().slice(0, 10) }); }}
                      cols={cohorts.map((c) => ({ key: c.month, label: c.month, caption: String(c.total), segs: (["ordered", "partial", "open", "lapsed", "lost", "expired"] as Outcome[]).map((o) => ({ key: o, value: c.counts[o], tone: SEG_TONE[o], label: b(OUTCOME_LABEL[o]) })) }))}
                      legend={(["ordered", "partial", "open", "lapsed", "lost", "expired"] as Outcome[]).map((o) => ({ tone: SEG_TONE[o], label: b(OUTCOME_LABEL[o]) }))} />}
                </div>
              </section>
              <section className="dp-cc-panel" data-dp-pipe-bins>
                <div className="dp-cc-panel-h"><h2>{t("Open quotations by validity", "العروض المفتوحة حسب الصلاحية")}</h2><span className="dp-cc-note">{t("Open, replied and partly ordered quotations as of the date.", "العروض المفتوحة والمردود عليها والمطلوبة جزئيًا حتى التاريخ.")}</span></div>
                <div className="dp-cc-panel-b">
                  <BarList testId="bins" items={EXPIRY_BINS.map((k) => ({ key: k, label: b(BIN_LABEL[k]), value: sum.byBin[k].count, tone: k === "lapsed" ? "bad" : k === "d7" ? "warn" : k === "none" ? "muted" : undefined, active: bin === k,
                    count: <>{sum.byBin[k].count} · <Money totals={sum.byBin[k].value} empty="—" /></>, onClick: () => set({ bin: bin === k ? undefined : k, outcome: undefined }) }))} />
                  <h3 className="mt-4 text-sm font-semibold">{t("Lost reasons in the period", "أسباب الفقد في الفترة")}</h3>
                  {!reasons.length ? <p className="text-xs text-muted-foreground">{t("No lost quotation in the period.", "لا يوجد عرض مفقود في الفترة.")}</p> :
                    <ul className="mt-1 divide-y divide-border text-sm" data-dp-pipe-reasons>{reasons.map((x) => <li key={x.reason || "-"} className="flex items-center gap-2 py-1.5">
                      <span className="min-w-0 flex-1 truncate" data-no-i18n={x.reason ? "" : undefined}>{x.reason || t("No reason recorded", "لم يُسجَّل سبب")}</span><b className="tabular-nums" data-no-i18n>{x.count}</b></li>)}</ul>}
                </div>
              </section>
            </div>

            <section className="dp-cc-panel" data-dp-pipe-table-panel>
              <div className="dp-cc-panel-h"><h2>{t("Quotations", "عروض الأسعار")}</h2>
                <span className="dp-cc-note" data-dp-pipe-count={rows.length}>{outcome ? b(OUTCOME_LABEL[outcome]) : bin ? b(BIN_LABEL[bin]) : t("Live pipeline + decided in the period", "المسار الحالي + المحسومة في الفترة")} · <span data-no-i18n>{rows.length}</span></span>
                {native ? <NativeList doctype="Quotation" filters={native} className="dp-link ms-auto text-xs">{t("Open in Quotation list", "فتح في قائمة عروض الأسعار")}</NativeList>
                  : <span className="ms-auto text-xs text-muted-foreground">{t("This selection has no single native list filter; rows open their native forms.", "هذا الاختيار ليس له مرشح واحد في القائمة الأصلية؛ الصفوف تفتح نماذجها الأصلية.")}</span>}
                {(outcome || bin || search.customer || search.q) && <button type="button" className="dp-link text-xs" onClick={() => set({ outcome: undefined, bin: undefined, customer: undefined, q: undefined })} data-dp-pipe-clear>{t("Clear filters", "مسح عوامل التصفية")}</button>}
              </div>
              {!rows.length ? <div className="dp-cc-panel-b"><Q2cState status="empty" /></div> : <>
                <ul className="dp-q2c-card-list md:hidden">{rows.slice(0, shown).map((q) => <li key={q.name} className="dp-q2c-row-card" data-dp-pipe-card={q.name}>
                  <div className="flex flex-wrap items-center gap-2"><DocLink dt="Quotation" name={q.name} /><Chip tone={CHIP[q.outcome]} data-dp-outcome={q.outcome}>{b(OUTCOME_LABEL[q.outcome])}</Chip><span className="ms-auto"><Money totals={[{ currency: q.currency, amount: q.amount }]} /></span></div>
                  <div className="text-sm"><CustomerLink customer={q.quotationTo === "Customer" ? q.customer : ""} name={q.customerName} company={ctx.company} /></div>
                  <dl><div><dt>{t("Date", "التاريخ")}</dt><dd data-no-i18n>{q.date}</dd></div><div><dt>{t("Valid till", "صالح حتى")}</dt><dd data-no-i18n>{q.validTill || "—"}</dd></div><div><dt>{t("Orders", "الأوامر")}</dt><dd>{q.orders.map((o) => <DocLink key={o} dt="Sales Order" name={o} />)}{!q.orders.length && "—"}</dd></div></dl>
                </li>)}</ul>
                <div className="hidden overflow-x-auto md:block"><EntTable id="pro-quotation-pipeline" wrap><table className="dp-cc-table dp-q2c-table min-w-[980px]" data-dp-pipe-table>
                  <thead><tr><th>{t("Quotation", "عرض السعر")}</th><th>{t("Customer", "العميل")}</th><th>{t("Date", "التاريخ")}</th><th>{t("Valid till", "صالح حتى")}</th><th className="num">{t("Value", "القيمة")}</th><th>{t("Outcome", "النتيجة")}</th><th>{t("Linked sales orders", "أوامر البيع المرتبطة")}</th><th>{t("Next step", "الخطوة التالية")}</th></tr></thead>
                  <tbody>{rows.slice(0, shown).map((q) => <tr key={q.name} data-dp-pipe-row={q.name} data-outcome={q.outcome}>
                    <td><DocLink dt="Quotation" name={q.name} /><div className="text-[11px] text-muted-foreground"><StatusText status={q.docstatus === 0 ? "Draft" : q.status} /> · <span data-no-i18n>{q.items}</span> {t("lines", "بنود")}</div></td>
                    <td>{q.quotationTo === "Customer" ? <CustomerLink customer={q.customer} name={q.customerName} company={ctx.company} /> : <span data-no-i18n>{q.customerName}</span>}</td>
                    <td className="tabular-nums" data-no-i18n>{q.date}</td>
                    <td><span className="tabular-nums" data-no-i18n>{q.validTill || "—"}</span>{q.daysToExpiry !== null && q.bin && <div className={`text-[11px] ${q.daysToExpiry < 0 ? "text-destructive" : "text-muted-foreground"}`}>{q.daysToExpiry < 0 ? t(`${-q.daysToExpiry} days ago`, `منذ ${-q.daysToExpiry} يومًا`) : t(`in ${q.daysToExpiry} days`, `بعد ${q.daysToExpiry} يومًا`)}</div>}</td>
                    <td className="num"><Money totals={[{ currency: q.currency, amount: q.amount }]} /></td>
                    <td><Chip tone={CHIP[q.outcome]} data-dp-outcome={q.outcome}>{b(OUTCOME_LABEL[q.outcome])}</Chip>
                      {q.outcome === "lost" && (q.lostReasons.length || q.lostNote) && <div className="mt-1 text-[11px] text-muted-foreground" data-no-i18n>{[...q.lostReasons, q.lostNote].filter(Boolean).join(" · ")}</div>}</td>
                    <td><span className="dp-q2c-docs">{q.orders.map((o) => <DocLink key={o} dt="Sales Order" name={o} />)}{q.draftOrders.map((o) => <span key={o} className="inline-flex items-center gap-1"><DocLink dt="Sales Order" name={o} /><Chip tone="muted">{t("Draft", "مسودة")}</Chip></span>)}
                      {!q.orders.length && !q.draftOrders.length && <span className="text-xs text-muted-foreground">{(q.outcome === "ordered" || q.outcome === "partial") && r.orderStatus === "ok" ? t("Status says ordered, no linked order found", "الحالة تفيد بالطلب ولا يوجد أمر مرتبط") : "—"}</span>}</span></td>
                    <td className="text-xs">{nextStep(q, ar, asOf)}</td>
                  </tr>)}</tbody></table></EntTable></div>
                {rows.length > shown && <div className="p-3 text-center"><button type="button" className="btn-ghost text-xs" onClick={() => setShown(shown + PAGE)}>{t(`Show more (${rows.length - shown} left)`, `عرض المزيد (متبقٍ ${rows.length - shown})`)}</button></div>}
              </>}
              <p className="dp-cc-note px-4 pb-3" data-dp-pipe-basis>{t(`Outcome comes from the native quotation status and the Sales Orders that point at it. "Open past validity" is still Open or Replied after its valid-till date (as of ${asOf}); the site's daily job normally marks these Expired. Values are per quotation currency and never added across currencies.`, `النتيجة من حالة العرض الأصلية وأوامر البيع المرتبطة به. «مفتوح بعد انتهاء الصلاحية» ما زال مفتوحًا أو مردودًا عليه بعد تاريخ صلاحيته (حتى ${asOf})، وتعلّمه المهمة اليومية عادةً منتهيًا. القيم بعملة كل عرض ولا تُجمع عبر العملات.`)}</p>
            </section>
          </>}
        </div>;
      }}
    </ProFrame>
  );
}

function nextStep(q: QuoteRow, ar: boolean, asOf: string): string {
  const t = (en: string, a: string) => (ar ? a : en);
  switch (q.outcome) {
    case "draft": return t("Review and submit", "راجع واعتمد");
    case "lapsed": return t("Extend validity or mark as lost", "مدّد الصلاحية أو سجّله مفقودًا");
    case "open": return q.validTill && q.validTill <= plusDays(asOf, 7) ? t("Follow up before it expires", "تابع قبل انتهاء الصلاحية") : t("Follow up or create the Sales Order", "تابع أو أنشئ أمر البيع");
    case "partial": return t("Order the remaining lines or close", "اطلب البنود المتبقية أو أغلق العرض");
    default: return "—";
  }
}
