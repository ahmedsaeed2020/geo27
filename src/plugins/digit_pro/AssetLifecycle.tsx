/**
 * SC-A-01 Phase 7 panels for the Fixed Assets Control Center: lifecycle timeline (A1/A2), prioritized depreciation
 * schedule (A3/A5) and scheduled-vs-booked depreciation chart (A4). Read-only over assetLifecycle.ts; every node, row
 * and bar opens the asset register, the native schedule / asset / journal entry, or Depreciation Review for the month.
 * The Assets screen root is marked record content, so every label here goes through `l()` (both languages).
 */
import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { fmtCurrency } from "@/lib/format";
import { SourceState } from "./ProFrame";
import { GroupedColumns, money, moneyShort, monthLabel } from "@/components/enterprise/kit";
import { proWrap } from "./ProKit";
import { AssetDocLink, useAssetLabels } from "./AssetUI";
import { DrillLink, drillNav, SevDot } from "./CommandUi";
import { addDays } from "./command";
import { lifecycleStages, PHASES, type DepLifecycle, type DepState, type Stage } from "./assetLifecycle";

const STATE: Record<DepState, [string, string]> = {
  due: ["Due, not booked", "مستحق غير مقيّد"],
  reference: ["Journal reference — posting not verified", "مرجع قيد — الترحيل غير متحقق"],
  upcoming: ["Upcoming", "قادم"],
  verified: ["Posted (ledger verified)", "مُرحّل (متحقق من الأستاذ)"],
};

/** A1/A2 — native Asset.status in lifecycle order, grouped by phase; each node opens All Assets with the same scope + status. */
export function LifecycleTimeline({ stages, currency }: { stages: ReturnType<typeof lifecycleStages>; currency: string }) {
  const { label: l } = useAssetLabels();
  const total = stages.reduce((t, x) => t + x.count, 0);
  const node = (x: Stage) => {
    const body = <>
      <span className="dp-ast-node-l">{l(x.label[0], x.label[1])}</span>
      <b className="dp-ast-node-v tabular-nums">{x.count}</b>
      <span className="dp-ast-node-m tabular-nums">{x.count ? (x.book === undefined ? l("Book value unavailable", "القيمة الدفترية غير متاحة") : fmtCurrency(x.book, currency)) : "—"}</span>
    </>;
    return x.count ? <DrillLink drill={x.drill} className="dp-ast-node" data-phase={x.phase} data-dp-ast-stage={x.status} data-count={x.count}>{body}</DrillLink>
      : <span className="dp-ast-node" data-phase={x.phase} data-empty data-dp-ast-stage={x.status} data-count={0}>{body}</span>;
  };
  return <section className="dp-cc-panel" data-dp-ast-lifecycle>
    <div className="dp-cc-panel-h"><h2>{l("Asset lifecycle", "دورة حياة الأصول")}</h2>
      <span className="dp-cc-note">{l(`${total} assets in scope by their native status. A stage opens All Assets with the same company, date and finance book.`, `${total} أصلًا ضمن النطاق حسب حالتها في النظام. المرحلة تفتح كل الأصول بنفس الشركة والتاريخ ودفتر التمويل.`)}</span></div>
    <ol className="dp-ast-timeline">
      {PHASES.map((p) => { const xs = stages.filter((x) => x.phase === p.id); const n = xs.reduce((t, x) => t + x.count, 0);
        return <li key={p.id} className="dp-ast-phase" data-phase={p.id} data-dp-ast-phase={p.id}>
          <div className="dp-ast-phase-h"><span className="dp-ast-dot" aria-hidden /><span>{l(p.label[0], p.label[1])}</span><b className="tabular-nums">{n}</b></div>
          <div className="dp-ast-nodes">{xs.map((x) => <span key={x.status} className="contents">{node(x)}</span>)}</div>
        </li>; })}
    </ol>
  </section>;
}

/** A3/A5 — prioritized depreciation schedule: due (oldest first), the next 90 days, then unverified journal references. */
export function DepreciationQueue({ d, currency, company, book, asof }: { d: DepLifecycle; currency: string; company: string; book?: string | undefined; asof: string }) {
  const { label: l } = useAssetLabels();
  const [all, setAll] = useState(false);
  const money = (v: number | undefined) => v === undefined ? "—" : fmtCurrency(v, currency);
  const head = <div className="dp-cc-panel-h"><h2>{l("Depreciation schedule", "جدول الإهلاك")}</h2>
    <span className="dp-cc-note">{l("Due rows first, then the next 90 days, then journal references whose posting cannot be verified. Booking runs on the DIGIT server.", "المستحق أولًا، ثم الأيام التسعون القادمة، ثم مراجع القيود التي لا يمكن التحقق من ترحيلها. القيد يتم على خادم DIGIT.")}</span></div>;
  if (d.status !== "ok") return <section className="dp-cc-panel" data-dp-ast-queue>{head}<div className="dp-cc-panel-b"><SourceState status={d.status} doctype="Asset Depreciation Schedule" /></div></section>;
  // Every chip opens Depreciation Review with the same state (and window for due/upcoming); "posted" and "reference"
  // there use the same postedJournalCheck rule, so totals match.
  const chip = (k: DepState, search?: Record<string, string | undefined>) => {
    const body = <><b className="tabular-nums">{money(d.totals[k])}</b><span className="text-xs">{l(STATE[k][0], STATE[k][1])}{k === "upcoming" ? l(" · next 90 days", " · 90 يومًا القادمة") : ""}</span></>;
    const tone = k === "due" && d.totals.due ? "bad" : k === "reference" && d.totals.reference ? "warn" : undefined;
    return search ? <li><DrillLink drill={{ kind: "pro", to: "/pro/depreciation", search: { company, book: book || undefined, ...search } }} className="dp-cc-chip" data-tone={tone} data-dp-ast-total={k}>{body}</DrillLink></li>
      : <li className="dp-cc-chip" data-tone={tone} data-dp-ast-total={k}>{body}</li>;
  };
  const rows = all ? d.queue : d.queue.slice(0, 8);
  return <section className="dp-cc-panel" data-dp-ast-queue>
    {head}
    <ul className="dp-cc-chips pt-3">{chip("due", { state: "due", to: asof })}{chip("reference", { state: "reference" })}{chip("upcoming", { state: "upcoming", from: addDays(asof, 1), to: addDays(asof, 90) })}{chip("verified", { state: "posted" })}</ul>
    {d.verifiable !== "ok" && <p className="mx-4 mb-2 rounded-md bg-warning/15 px-3 py-1.5 text-xs" data-dp-ast-unverified>{l("Depreciation posting not verified — you cannot read journal entries or the general ledger, so no row is shown as posted.", "قيد الإهلاك لم يُتحقق منه — لا تملك صلاحية قراءة قيود اليومية أو دفتر الأستاذ، لذا لا يظهر أي صف كمُرحّل.")}</p>}
    {!d.queue.length ? <p className="dp-cc-panel-b text-sm text-muted-foreground" data-dp-ast-queue-empty>{l("Nothing due, unverified or scheduled in the next 90 days.", "لا يوجد مستحق أو غير متحقق أو مجدول خلال 90 يومًا.")}</p> : <>
      <div className="overflow-x-auto"><table className="dp-cc-table" data-dp-ast-table>
        <thead><tr><th scope="col">{l("Asset", "الأصل")}</th><th scope="col">{l("Category · location · custodian", "الفئة · الموقع · العهدة")}</th><th scope="col">{l("Scheduled", "تاريخ الجدولة")}</th><th scope="col" className="text-end">{l("Amount", "المبلغ")}</th><th scope="col">{l("State", "الحالة")}</th><th scope="col" className="text-end">{l("Current book value", "القيمة الدفترية الحالية")}</th><th scope="col">{l("Source", "المصدر")}</th><th scope="col">{l("Next action", "الإجراء التالي")}</th></tr></thead>
        <tbody>{rows.map((r) => <tr key={r.key} data-dp-ast-row={r.state} data-severity={r.severity}>
          <td className="min-w-40"><span className="inline-flex items-start gap-1.5"><SevDot sev={r.severity} /><span><AssetDocLink dt="Asset" name={r.asset}>{r.assetName}</AssetDocLink><span className="block text-[11px] text-muted-foreground" data-no-i18n>{r.asset}</span></span></span></td>
          <td className="min-w-44 text-xs"><span className="block" data-no-i18n>{r.category || "—"}</span>
            <span className="block">{r.location ? <span data-no-i18n>{r.location}</span> : <span className="text-destructive">{l("No location", "بلا موقع")}</span>} · {r.custodian ? <AssetDocLink dt="Employee" name={r.custodian} /> : <span className="text-destructive">{l("No custodian", "بلا عهدة")}</span>}</span></td>
          <td className="whitespace-nowrap tabular-nums" data-no-i18n>{r.date}</td>
          <td className="whitespace-nowrap text-end tabular-nums" data-no-i18n>{money(r.amount)}</td>
          <td className="min-w-36"><span className={`chip text-[11px] ${r.state === "due" ? "bg-destructive/10 text-destructive" : r.state === "reference" ? "bg-warning/20" : r.state === "verified" ? "bg-success/15 text-success-text" : "bg-muted"}`}>{l(STATE[r.state][0], STATE[r.state][1])}</span></td>
          <td className="whitespace-nowrap text-end tabular-nums" data-no-i18n>{money(r.nbv)}</td>
          <td className="whitespace-nowrap text-xs"><DrillLink drill={{ kind: "doc", doctype: "Asset Depreciation Schedule", name: r.schedule }} className="block text-primary hover:underline" data-dp-ast-schedule={r.schedule}><span className="text-muted-foreground">{l("Schedule", "الجدول")} · </span><span data-no-i18n>{r.schedule}</span></DrillLink>
            {r.je && <DrillLink drill={{ kind: "doc", doctype: "Journal Entry", name: r.je }} className="block text-primary hover:underline" data-dp-ast-je={r.je}><span className="text-muted-foreground">{l("Journal", "القيد")} · </span><span data-no-i18n>{r.je}</span></DrillLink>}
            {r.marker && <span className="block text-muted-foreground" data-dp-ast-marker>{l("Marked booked, no journal entry", "معلَّم كمقيد بلا قيد يومية")}</span>}</td>
          <td className="min-w-48 text-[11px] text-primary">{l(r.next[0], r.next[1])}</td>
        </tr>)}</tbody></table></div>
      {d.queue.length > 8 && <div className="border-t border-border p-2"><button type="button" className="btn-ghost w-full text-xs" aria-expanded={all} onClick={() => setAll((v) => !v)} data-dp-ast-more>{all ? l("Show fewer", "عرض أقل") : `${l("Show all", "عرض الكل")} (${d.queue.length})`}</button></div>}
    </>}
  </section>;
}

/** A4 — scheduled vs booked depreciation per month (6 back, 3 ahead). Booked splits into ledger-verified and reference-only. */
export function DepreciationChart({ d, currency, asof }: { d: DepLifecycle; currency: string; asof: string }) {
  const { label: l, lang } = useAssetLabels(); const isAr = lang === "ar";
  if (d.status !== "ok") return <SourceState status={d.status} doctype="Asset Depreciation Schedule" />;
  const ms = d.months; const cur = asof.slice(0, 7);
  const drills = ms.map((m) => (m.scheduled > 0 ? m.drill : undefined));
  return <figure data-dp-ast-chart>
    <GroupedColumns ar={isAr} wrap={proWrap} fmt={money(currency)} axisFmt={moneyShort(currency)} height={170}
      groups={ms.map((m) => ({ key: m.month, label: `${monthLabel(m.month, isAr)}${m.month > cur ? " ·" : ""}` }))}
      series={[
        { label: l("Scheduled", "مجدول"), tone: "secondary", values: ms.map((m) => m.scheduled), drills },
        { label: l("Posted (ledger verified)", "مُرحّل (متحقق من الأستاذ)"), tone: "good", values: ms.map((m) => m.verified), drills },
        { label: l("Journal reference only", "مرجع قيد فقط"), tone: "attention", values: ms.map((m) => m.reference), drills },
      ]} />
    <figcaption className="mt-1 space-y-1 text-xs">
      <span className="block text-muted-foreground">{l("Months marked · are after the as-of date. A month opens Depreciation Review for that month with the same posted and reference totals.", "الأشهر المعلّمة بـ · بعد تاريخ الاحتساب. الشهر يفتح مراجعة الإهلاك لذلك الشهر بنفس إجماليات المُرحّل والمرجع.")}</span>
      {d.verifiable !== "ok" && <span className="block font-medium text-destructive">{l("Depreciation posting not verified", "قيد الإهلاك لم يُتحقق منه")}</span>}
    </figcaption>
  </figure>;
}
