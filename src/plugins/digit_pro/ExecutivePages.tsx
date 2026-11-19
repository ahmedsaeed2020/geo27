// @ts-nocheck -- DIGIT Pro/HR apps are switched off in the merged site build; their original /pro/* and /hr/* app routes are not in this route tree (re-enabling the app needs those routes, then remove this line)
/**
 * Executive sub-pages (owner 2026-11-12, template T5; rich pages 2026-11-13): one route per CFO board, listed in the
 * Executive sidebar under the Overview. Each page = the shared green context band (company + period + Customize) → the
 * source board (Dash92Board, unchanged figures and drills) → the executive blocks moved here from the Overview (each block
 * lives on exactly one page), composed by the shared Dashboard Designer so users reorder, resize and remove them.
 * When the year-to-date comparison window holds no posted ledger rows the page opens on the quarter to date, so its
 * deltas compare two periods that both have records instead of showing "no comparison".
 */
import { CloseOutlookPanel } from "@/components/enterprise/PlanningDesk";
import { Link, useNavigate } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { ContextStrip, CustomizeScope, LINK_CHIP, LinkGroup, Page, Zone } from "@/components/enterprise/kit";
import { PageBlocks, pageDashboard } from "@/components/dashboards/PageBlocks";
import { useLang } from "@/i18n";
import { scopedList } from "@/lib/scope";
import { ProFrame } from "./ProFrame";
import { Dash92Board, PeriodBar, type BoardSearch } from "./Dash92Board";
import { boardCtx } from "./dash92";
import { financeContext, sourceStatus, todayIso } from "./finance";
import { EXEC_ARCHETYPE, EXEC_PAGES, type ExecPage } from "./execPages";
import { ExecQuestions } from "./ExecQuestions";
import { RelationsBoard } from "./RelationsBoard";
import { Liquidity } from "./MainDashboard";
import { COMMAND_DOCTYPES } from "./command";

export interface ExecSearch extends BoardSearch { company?: string | undefined }
const DTS = [...new Set([...COMMAND_DOCTYPES, "Budget", "Cost Center", "Accounting Dimension", "Period Closing Voucher", "Bank Account", "Bank Transaction", "Asset", "Bin", "Warehouse", "Sales Invoice Item", "Sales Team"])];

/** Blocks the Overview used to carry, now placed on the page whose question they answer. */
function Extra({ page, company, currency, ar, today, user, part = "main" }: { page: ExecPage; company: string; currency: string; ar: boolean; today: string; user: string; part?: "main" | "relations" }): ReactNode {
  const t = (en: string, x: string) => (ar ? x : en);
  if (part === "relations" && page.slug !== "dimensions-budget") return null;
  switch (page.slug) {
    case "financial-position": return <Zone zone="panels"><ExecQuestions company={company} currency={currency} ar={ar} /></Zone>;
    // the company-wide sales charts live on Sales Analytics / the Selling overview (one dashboard per page): linked here, not stacked
    case "performance": return <Zone zone="links"><LinkGroup id="exec-perf-sales" title={t("Sales behind this result", "المبيعات وراء هذه النتيجة")}>
      <Link to="/pro/sales-analytics" search={{ company } as never} className={LINK_CHIP} data-dp-exec-link="sales-analytics">{t("Sales analytics — trend, items, customers, salespeople", "تحليلات المبيعات — الاتجاه والأصناف والعملاء والمندوبون")}</Link>
      <Link to="/pro/selling-overview" search={{ company } as never} className={LINK_CHIP} data-dp-exec-link="selling-overview">{t("Selling command center", "مركز قيادة المبيعات")}</Link>
      <Link to="/pro/customer-360" search={{ company } as never} className={LINK_CHIP} data-dp-exec-link="customer-360">{t("Customer 360", "ملف العميل 360")}</Link>
    </LinkGroup></Zone>;
    case "cash-liquidity": return <Zone zone="panels" title={ar ? "توقيت السيولة" : "Liquidity timing"}><Liquidity company={company} currency={currency} user={user} ar={ar} /></Zone>;
    // owner 2026-11-13 §2d: the screen links and the branches board are two blocks (each with its own block menu)
    case "dimensions-budget": return part === "relations"
      ? <Zone zone="panels"><RelationsBoard company={company} currency={currency} asOf={today} ar={ar} title={["Branches, locations and warehouses", "الفروع والمواقع والمستودعات"]} only={["rel-branch-sales", "rel-asset-location", "rel-stock-warehouse", "rel-supplier-groups"]} /></Zone>
      : <Zone zone="links"><LinkGroup id="exec-dim-screens" title={t("Dimension and budget screens", "شاشات الأبعاد والموازنات")}>
      <Link to="/pro/cost-centers" search={{ company } as never} className={LINK_CHIP} data-dp-exec-link="cost-centers">{t("Cost centres — actual against budget", "مراكز التكلفة — الفعلي مقابل الموازنة")}</Link>
      <Link to="/pro/general-ledger" search={{ company } as never} className={LINK_CHIP} data-dp-exec-link="general-ledger">{t("General ledger by dimension", "دفتر الأستاذ حسب البعد")}</Link>
    </LinkGroup></Zone>;
    default: return null;
  }
}

const iso = (d: Date) => d.toISOString().slice(0, 10);
/** Year to date unless its comparison window has no posted ledger rows; then the quarter to date (whose prior quarter has them). */
export function execDefaultFrom(company: string, user: string, fyStart: string | undefined, today: string, compare: "prior_period" | "prior_year"): string | undefined {
  if (sourceStatus("GL Entry", user) !== "ok") return undefined;
  const from = fyStart || `${today.slice(0, 4)}-01-01`;
  const days = Math.round((Date.parse(today) - Date.parse(from)) / 86400000) + 1;
  const pFrom = compare === "prior_year" ? `${Number(from.slice(0, 4)) - 1}${from.slice(4)}` : iso(new Date(Date.parse(from) - days * 86400000));
  const pTo = compare === "prior_year" ? `${Number(today.slice(0, 4)) - 1}${today.slice(4)}` : iso(new Date(Date.parse(from) - 86400000));
  const gl = scopedList("GL Entry", user).filter((g) => (!company || g["company"] === company) && !Number(g["is_cancelled"]));
  if (gl.some((g) => { const d = String(g["posting_date"] ?? ""); return d >= pFrom && d <= pTo; })) return undefined;
  const m = Number(today.slice(5, 7)); const q = `${today.slice(0, 4)}-${String(m - ((m - 1) % 3)).padStart(2, "0")}-01`;
  return q > from ? q : undefined;
}

export function ExecutivePage({ slug, search }: { slug: ExecPage["slug"]; search: ExecSearch }) {
  const page = EXEC_PAGES.find((p) => p.slug === slug)!;
  const nav = useNavigate(); const ar = useLang() === "ar";
  const set = (p: Partial<ExecSearch>) => void nav({ to: page.to, search: (prev: ExecSearch) => ({ ...prev, ...p }) as never, replace: true });
  return <ProFrame bare band={false} tabs={false} title={ar ? page.label[1] : page.label[0]} doctypes={DTS}>
    {({ user }) => {
      const ctx = financeContext(search.company, user); const today = todayIso();
      const cmp = search.cmp === "prior_year" ? "prior_year" : "prior_period";
      const from = search.from ?? (search.to ? undefined : execDefaultFrom(ctx.company, user, ctx.fiscalYear?.start, today, cmp));
      const bc = boardCtx(ctx.company, from, search.to, cmp, user);
      const def = pageDashboard("digit_pro", `exec:${page.slug}`, page.label, [
        { id: "board", title: page.label, meaning: page.question },
        { id: "extra", title: ["Related blocks", "كتل مرتبطة"] },
        { id: "relations", title: ["Branches, locations and warehouses", "الفروع والمواقع والمستودعات"] },
        { id: "close", title: ["Close tasks and sign-off", "مهام الإقفال والاعتماد"] },
      ]);
      return <Page template="T5" id={`exec-${page.slug}`}><div className="ek-stack" data-dp-exec-page={page.slug} data-dp-cfo-board={page.board.slice(4)} data-dp-exec-archetype={EXEC_ARCHETYPE[page.board]?.[0]}>
        <CustomizeScope><Zone zone="context"><ContextStrip icon={<img src="/icons/digit/ui/digit-ui-dashboard-light.svg" alt="" className="h-7 w-7" />}
          eyebrow={ar ? "ديجيت برو · القيادة التنفيذية" : "DIGIT Pro · Executive"} title={ar ? page.label[1] : page.label[0]} sub={ar ? page.question[1] : page.question[0]}
          aside={<PeriodBar from={bc.from} to={bc.to} cmp={bc.compare} today={today} ar={ar} onChange={(p) => set(p)} company={ctx.company} companies={ctx.companies} onCompany={(company) => set({ company })} />} /></Zone></CustomizeScope>
        <PageBlocks def={def} company={ctx.company} nodes={{
          board: <Zone zone="charts"><Dash92Board bare boardKey={page.board} company={ctx.company} user={user} ar={ar} from={bc.from} to={bc.to} compare={bc.compare} /></Zone>,
          // Extra has no hooks: called directly so a page without related blocks leaves the block out (no empty card)
          extra: Extra({ page, company: ctx.company, currency: ctx.currency, ar, today, user }),
          relations: Extra({ page, company: ctx.company, currency: ctx.currency, ar, today, user, part: "relations" }),
          // owner 2026-11-13 §2d: the closing page answers "is the period ready to close?" with the shared close outlook too
          close: page.slug === "closing-control" ? <Zone zone="panels" title={ar ? "مهام الإقفال والاعتماد" : "Close tasks and sign-off"}><CloseOutlookPanel company={ctx.company} periodEnd={bc.to} /></Zone> : null,
        }} />
      </div></Page>;
    }}
  </ProFrame>;
}
