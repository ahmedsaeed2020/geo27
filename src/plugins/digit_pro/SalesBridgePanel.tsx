/** SL12-b / SEL-014-b panels on Collections & Analytics: revenue bridge and salesperson target vs actual. */
import { adapter, useStoreVersion } from "@/lib/adapter";
import { fmtCurrency } from "@/lib/format";
import { compareAsOf, type SectionCtx } from "./sections";
import { revenueBridge, salesTargets } from "./salesBridge";
import { SourceState } from "./ProFrame";
import { Meter } from "@/components/enterprise/kit";

const monthStart = (d: string) => `${d.slice(0, 7)}-01`;
/** Fiscal Year record that contains the date (year_start_date … year_end_date), else the calendar year. */
function fiscalYearOf(date: string): { name: string; from: string; to: string } {
  const fy = adapter.list("Fiscal Year").find((f) => String(f["year_start_date"] ?? "") <= date && String(f["year_end_date"] ?? "") >= date);
  return fy ? { name: fy.name, from: String(fy["year_start_date"]), to: String(fy["year_end_date"]) } : { name: date.slice(0, 4), from: `${date.slice(0, 4)}-01-01`, to: `${date.slice(0, 4)}-12-31` };
}

export function SalesBridgePanel({ ctx, user, ar }: { ctx: SectionCtx; user: string; ar: boolean }) {
  useStoreVersion();
  const t = (en: string, a: string) => (ar ? a : en);
  const prevTo = compareAsOf(ctx.asOf, "month");
  const b = revenueBridge(ctx.company, { from: monthStart(prevTo), to: prevTo }, { from: ctx.monthFrom, to: ctx.asOf }, user);
  const fy = fiscalYearOf(ctx.asOf);
  const tg = salesTargets(ctx.company, fy.name, { from: fy.from, to: ctx.asOf }, user);
  const money = (x: number) => fmtCurrency(x, ctx.currency);
  const steps: [string, string, number, "base" | "delta"][] = [
    ["prev", t("Same period last month", "الفترة نفسها من الشهر السابق"), b.previous, "base"], ["volume", t("Volume", "الحجم"), b.volume, "delta"],
    ["price", t("Price", "السعر"), b.price, "delta"], ["mix", t("Mix", "المزيج"), b.mix, "delta"], ["cur", t("This month to date", "هذا الشهر حتى تاريخه"), b.current, "base"]];
  const max = Math.max(1, ...steps.map((s) => Math.abs(s[2])));
  return <div className="grid gap-4 lg:grid-cols-2">
    <section className="dp-card" data-dp-revenue-bridge={b.status} aria-label={t("Revenue bridge", "جسر الإيرادات")}>
      <h3 className="font-semibold">{t("Revenue bridge", "جسر الإيرادات")}</h3>
      <p className="text-xs text-muted-foreground">{t("Net sales from submitted invoices; volume, price and mix add up to the change.", "صافي المبيعات من الفواتير المعتمدة؛ الحجم والسعر والمزيج يساوي مجموعها التغير.")}</p>
      {b.status !== "ok" ? <SourceState status={b.status} doctype="Sales Invoice" /> : <ul className="mt-2 grid gap-1.5 text-sm">{steps.map(([k, label, v, kind]) => <li key={k} className="grid grid-cols-[9rem_1fr_auto] items-center gap-2" data-dp-bridge-step={k} data-value={v}>
        <span className="text-xs">{label}</span>
        <Meter value={v} max={max} tone={kind === "base" ? "good" : v < 0 ? "risk" : "secondary"} />
        <bdi className={`tabular-nums text-xs ${kind === "delta" && v < 0 ? "text-destructive" : ""}`} data-no-i18n>{kind === "delta" && v > 0 ? "+" : ""}{money(v)}</bdi></li>)}</ul>}
    </section>
    <section className="dp-card" data-dp-sales-targets={tg.rows.length} aria-label={t("Salesperson targets", "أهداف مندوبي المبيعات")}>
      <h3 className="font-semibold">{t("Salesperson targets", "أهداف مندوبي المبيعات")} <span className="text-xs font-normal text-muted-foreground" data-no-i18n>{fy.name}</span></h3>
      <p className="text-xs text-muted-foreground">{t("Target from the Sales Person's targets; actual is their allocated share of submitted invoices this fiscal year.", "الهدف من أهداف مندوب المبيعات؛ الفعلي حصته المخصصة من الفواتير المعتمدة في هذه السنة المالية.")}</p>
      {tg.status !== "ok" ? <SourceState status={tg.status} doctype="Sales Person" /> : <ul className="mt-2 grid gap-1.5 text-sm">{tg.rows.map((r) => <li key={r.person} className="grid grid-cols-[9rem_1fr_auto] items-center gap-2" data-dp-target-row={r.person} data-pct={r.pct ?? ""}>
        <span className="truncate text-xs" data-no-i18n>{String(adapter.get("Sales Person", r.person)?.["sales_person_name"] ?? r.person)}</span>
        {r.target ? <span title={`${r.pct}%`}><Meter value={Math.min(100, r.pct ?? 0)} max={100} tone={(r.pct ?? 0) >= 100 ? "good" : "secondary"} label={`${r.pct}%`} /></span>
          : <span className="text-[11px] text-muted-foreground">{t("No target set", "لا يوجد هدف محدد")}</span>}
        <bdi className="tabular-nums text-xs" data-no-i18n>{money(r.actual)}{r.target ? ` / ${money(r.target)} (${r.pct}%)` : ""}</bdi></li>)}</ul>}
    </section>
  </div>;
}
