// @ts-nocheck -- DIGIT Pro/HR apps are switched off in the merged site build; their original /pro/* and /hr/* app routes are not in this route tree (re-enabling the app needs those routes, then remove this line)
/** RXP-02 / SC-F-10 grouped close blockers on Period Control — counts from source records, each opening its exact queue. */
import { Link } from "@tanstack/react-router";
import { fmtCurrency } from "@/lib/format";
import { blockerSummary, closeBlockers, type Blocker, type BlockerGroup } from "./closeReview";
import { slug } from "./finance";

const GROUPS: { id: BlockerGroup; en: string; ar: string }[] = [
  { id: "drafts", en: "Unposted documents", ar: "مستندات غير مرحّلة" },
  { id: "bank", en: "Bank and allocation", ar: "البنك والتخصيص" },
  { id: "open", en: "Open credits", ar: "أرصدة مفتوحة" },
  { id: "ledger", en: "Ledger checks", ar: "فحوص الأستاذ" },
];

export function CloseBlockers({ company, from, to, user, ar }: { company: string; from: string; to: string; user: string; ar: boolean }) {
  const t = (en: string, arabic: string) => (ar ? arabic : en);
  const bs = closeBlockers(company, from, to, user);
  const sum = blockerSummary(bs);
  return (
    <section className="mt-3" aria-labelledby="dp-close-blockers-h" data-dp-close-blockers={sum.open}>
      <div className="flex flex-wrap items-baseline gap-2">
        <h3 id="dp-close-blockers-h" className="text-sm font-semibold">{t("Close blockers", "عوائق الإقفال")}</h3>
        <span className="text-xs text-muted-foreground" data-dp-close-summary>
          <bdi data-no-i18n>{sum.open}</bdi> {t("need review", "تحتاج مراجعة")} · <bdi data-no-i18n>{sum.clear}</bdi> {t("clear", "سليمة")}{sum.restricted > 0 && <> · <bdi data-no-i18n>{sum.restricted}</bdi> {t("not permitted or unavailable", "غير مسموحة أو غير متاحة")}</>}
        </span>
      </div>
      <div className="mt-2 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {GROUPS.map((g) => <div key={g.id} className="min-w-0" data-dp-close-group={g.id}>
          <h4 className="text-xs font-medium text-muted-foreground">{ar ? g.ar : g.en}</h4>
          <ul className="mt-1 space-y-1">{bs.filter((b) => b.group === g.id).map((b) => <li key={b.id}><Tile b={b} ar={ar} t={t} /></li>)}</ul>
        </div>)}
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">{t("Counts come from the source documents for this company and period. They show what needs a decision; they do not measure readiness, close the period or post anything.", "الأعداد مأخوذة من المستندات المصدر لهذه الشركة والفترة. تبيّن ما يحتاج قرارًا؛ ولا تقيس الجاهزية ولا تقفل الفترة ولا ترحّل أي شيء.")}</p>
    </section>
  );
}

function Tile({ b, ar, t }: { b: Blocker; ar: boolean; t: (en: string, ar: string) => string }) {
  const state = b.status !== "ok" ? (b.status === "denied" ? t("Not permitted", "غير مسموح") : t("Source unavailable", "المصدر غير متاح")) : b.count ? t("Review", "مراجعة") : t("Clear", "سليم");
  const tone = b.status !== "ok" ? "bg-muted" : b.count ? "bg-warning/20" : "bg-success/15 text-success-text";
  const body = <>
    <span className="min-w-0 flex-1"><span className="block leading-snug">{ar ? b.label[1] : b.label[0]}</span>
      {b.totals.length > 0 && <span className="block text-[11px] text-muted-foreground">{b.totals.map((x) => <bdi key={x.currency} className="me-2 tabular-nums" data-no-i18n>{x.currency ? fmtCurrency(x.amount, x.currency) : x.amount.toLocaleString()}</bdi>)}</span>}</span>
    <b className="tabular-nums" data-no-i18n>{b.status === "ok" ? b.count : "—"}</b>
    <span className={`chip text-[10px] ${tone}`}>{state}</span>
  </>;
  const cls = "flex w-full items-start gap-2 rounded-md border border-border px-2 py-1.5 text-start text-sm";
  if (b.status !== "ok" || !b.count) return <div className={`${cls} opacity-80`} data-dp-close-blocker={b.id} data-count={b.status === "ok" ? b.count : ""}>{body}</div>;
  const tg = b.target;
  if (tg.kind === "anchor") return <a href={`#${tg.id}`} className={`${cls} hover:bg-accent`} data-dp-close-blocker={b.id} data-count={b.count}>{body}</a>;
  if (tg.kind === "list") return <Link to="/app/$app/$doctype" params={{ app: "erpnext", doctype: slug(tg.doctype) }} search={{ filters: JSON.stringify(tg.filters) } as never} className={`${cls} hover:bg-accent`} data-dp-close-blocker={b.id} data-count={b.count}>{body}</Link>;
  return <Link to={tg.to} search={tg.search as never} className={`${cls} hover:bg-accent`} data-dp-close-blocker={b.id} data-count={b.count}>{body}</Link>;
}
