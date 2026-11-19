// @ts-nocheck -- DIGIT Pro/HR apps are switched off in the merged site build; their original /pro/* and /hr/* app routes are not in this route tree (re-enabling the app needs those routes, then remove this line)
/** SC-F-10 Period Control — closing (Period Closing Voucher) shown separately from locking (frozen-till date, Accounting Periods). Native links only. */
import { Link, useNavigate } from "@tanstack/react-router";
import { adapter } from "@/lib/adapter";
import { scopedList } from "@/lib/scope";
import { useLang } from "@/i18n";
import { Button } from "@/components/ui/button";
import { closingDrafts, closings, lastClosed, locks } from "./periods";
import { guardedReport } from "./intelligence";
import { can, financeContext, slug, sourceStatus } from "./finance";
import { ProFrame, SourceState } from "./ProFrame";
import { FinanceExceptionReview } from "./FinanceExceptionReview";
import { EXCEPTION_SOURCES } from "./financeExceptions";
import { previousPeriod } from "./intelligence";
import { DimensionReview } from './DimensionReview';
import { DIMENSION_REVIEW_SOURCES } from './dimensionReviewData';
import { CloseBlockers } from './CloseBlockers';
import { CLOSE_SOURCES } from './closeReview';
import { DateInput } from "@/components/form/DateInput";

export interface PeriodSearch { company?: string | undefined; from_date?: string | undefined; to_date?: string | undefined }
const chip = (s: string) => s === "Submitted" ? "bg-success/15 text-success-text" : s === "Cancelled" ? "bg-muted" : "bg-warning/20";

export function PeriodPro({ search }: { search: PeriodSearch }) {
  const nav = useNavigate();
  const ar = useLang() === "ar", t = (en: string, arabic: string) => ar ? arabic : en;
  const set = (p: Partial<PeriodSearch>) => void nav({to:"/pro/period-control",search:{...search,...p},replace:true});
  return (
    <ProFrame title="Period Control" subtitle="Closing a period and locking it for posting are separate controls in DIGIT." doctypes={[...EXCEPTION_SOURCES,...DIMENSION_REVIEW_SOURCES,...CLOSE_SOURCES]}>
      {({ user }) => {
        const ctx = financeContext(search.company, user);
        if (!ctx.companies.length) return <SourceState status={sourceStatus("Company", user) === "ok" ? "empty" : "denied"} doctype="Company" />;
        const today = new Date().toISOString().slice(0, 10);
        const pSt = sourceStatus("Period Closing Voucher", user), aSt = sourceStatus("Accounting Period", user);
        const cl = pSt === "ok" ? closings(scopedList("Period Closing Voucher", user), ctx.company) : [];
        const lk = aSt === "ok" ? locks(scopedList("Accounting Period", user), ctx.company, today) : [];
        const co = adapter.get("Company", ctx.company);
        const frozen = String(co?.["accounts_frozen_till_date"] ?? ""), frozenRole = String(co?.["role_allowed_for_frozen_entries"] ?? "");
        const last = lastClosed(cl);
        const from = search.from_date || ctx.fiscalYear?.start || today, to = search.to_date || today;
        const valid = !!previousPeriod(from,to);
        const reviewTypes = ["Journal Entry","Payment Entry","Sales Invoice","Purchase Invoice"];
        const drafts = reviewTypes.map(dt => ({dt,status:sourceStatus(dt,user),rows:closingDrafts(scopedList(dt,user),ctx.company,from,to)}));
        const balance = valid ? guardedReport("Trial Balance",{company:ctx.company,from_date:from,to_date:to},user) : {status:"unavailable" as const};
        return <>
          <section className="dp-context" data-dp-context>
            <label className="dp-ctx-item"><span>Company</span>
              <select className="field-input" value={ctx.company} onChange={(e) => set({company:e.target.value})} data-no-i18n>{ctx.companies.map((c) => <option key={c}>{c}</option>)}</select></label>
            <label className="dp-ctx-item"><span>{t("From Date","من تاريخ")}</span><DateInput className="field-input" value={from} onChange={e=>set({from_date:e.target.value})} /></label>
            <label className="dp-ctx-item"><span>{t("To Date","إلى تاريخ")}</span><DateInput className="field-input" value={to} onChange={e=>set({to_date:e.target.value})} /></label>
            <div className="dp-ctx-item"><span>Last closed</span><b data-no-i18n>{last || "—"}</b></div>
            <div className="dp-ctx-item"><span>Accounts Frozen Till Date</span><b data-no-i18n>{frozen || "—"}</b></div>
          </section>

          <section className="mt-4 border-y border-border py-4" data-dp-close-review>
            <h2 className="font-semibold">{t("Close preparation","التحضير للإقفال")}</h2>
            <p className="mt-1 text-xs text-muted-foreground">{t("Drafts require review; these checks do not certify readiness or close the period.","المسودات تتطلب مراجعة؛ هذه الفحوص لا تؤكد الجاهزية ولا تقفل الفترة.")}</p>
            {!valid ? <SourceState status="unavailable" /> : <>
              <CloseBlockers company={ctx.company} from={from} to={to} user={user} ar={ar} />
              <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{drafts.map(x=><section key={x.dt} data-dp-close-source={x.dt}><h3 className="text-sm font-semibold">{x.dt}</h3>{x.status !== "ok" ? <SourceState status={x.status} /> : <><p className="mt-1 text-lg font-semibold" data-no-i18n>{x.rows.length}</p><ul className="mt-2 space-y-1 text-xs">{x.rows.slice(0,5).map(d=><li key={d.name}><Link to="/app/$app/$doctype/$name" params={{app:"erpnext",doctype:slug(x.dt),name:d.name}} className="text-primary hover:underline" data-no-i18n>{d.name}</Link></li>)}</ul><Button variant="ghost" size="sm" asChild><Link to="/app/$app/$doctype" params={{app:"erpnext",doctype:slug(x.dt)}} search={{filters:JSON.stringify([["company","=",ctx.company],["docstatus","=","0"],["posting_date",">=",from],["posting_date","<=",to]])} as never}>{t("Review drafts","مراجعة المسودات")}</Link></Button></>}</section>)}</div>
              <div className="mt-4 border-t border-border pt-3"><h3 className="text-sm font-semibold">{t("Trial Balance checks","فحوص ميزان المراجعة")}</h3>{balance.status !== "ok" ? <SourceState status={balance.status} /> : balance.result?.checks?.map(c=><p key={c.label} className={c.ok ? "mt-1 text-xs text-success-text" : "mt-1 text-xs text-destructive"}><span>{c.label}</span> <span data-no-i18n>{c.detail}</span></p>)}<div className="mt-2 flex flex-wrap gap-2"><Button variant="outline" size="sm" asChild><Link to="/pro/trial-balance" search={{company:ctx.company,from_date:from,to_date:to}}>{t("Trial Balance","ميزان المراجعة")}</Link></Button><Button variant="outline" size="sm" asChild><Link to="/pro/finance-intelligence" search={{company:ctx.company,from_date:from,to_date:to}}>{t("Finance Intelligence","التحليل المالي للإدارة")}</Link></Button><Button variant="outline" size="sm" asChild><Link to="/pro/audit" search={{company:ctx.company} as never}>{t("Audit & Exceptions","التدقيق والاستثناءات")}</Link></Button></div></div>
            </>}
          </section>

          {valid && <div id="dp-close-exceptions" className="scroll-mt-20"><FinanceExceptionReview company={ctx.company} from={from} to={to} user={user}/></div>}
          {valid && <div id="dp-close-dimensions" className="scroll-mt-20"><DimensionReview company={ctx.company} from={from} to={to} user={user}/></div>}
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <section id="dp-close-closings" className="dp-card scroll-mt-20" data-dp-closings={cl.length}>
              <div className="flex items-center gap-2"><h2 className="font-semibold">Closing</h2>
                {can("Period Closing Voucher", "create") && <Link to="/app/$app/$doctype/$name" params={{ app: "erpnext", doctype: "period_closing_voucher", name: "new" }} className="btn-primary ms-auto py-0.5 text-xs">New Period Closing Voucher</Link>}</div>
              <p className="mt-1 text-xs text-muted-foreground">Moves profit and loss to the closing account. It does not lock posting.</p>
              {pSt !== "ok" ? <div className="mt-2"><SourceState status={pSt} doctype="Period Closing Voucher" /></div>
                : !cl.length ? <p className="mt-2 text-sm text-muted-foreground">No period closing vouchers yet.</p>
                : <ul className="mt-2 divide-y divide-border">{cl.map((c) => <li key={c.name} className="flex flex-wrap items-center gap-2 py-2 text-sm" data-dp-pcv={c.name}>
                  <Link to="/app/$app/$doctype/$name" params={{ app: "erpnext", doctype: "period_closing_voucher", name: c.name }} className="font-medium hover:underline" data-no-i18n>{c.name}</Link>
                  <span className="text-xs text-muted-foreground" data-no-i18n>{c.start} → {c.end}</span>
                  <span className={`chip ms-auto text-[11px] ${chip(c.status)}`}>{c.status}</span>
                </li>)}</ul>}
            </section>

            <section className="dp-card" data-dp-locks={lk.length}>
              <div className="flex items-center gap-2"><h2 className="font-semibold">Locking</h2>
                {can("Accounting Period", "create") && <Link to="/app/$app/$doctype/$name" params={{ app: "erpnext", doctype: "accounting_period", name: "new" }} className="btn-primary ms-auto py-0.5 text-xs">New Accounting Period</Link>}</div>
              <p className="mt-1 text-xs text-muted-foreground">Blocks submit and cancel of the listed documents in the period.</p>
              <div className="mt-2 flex flex-wrap items-center gap-2 border-b border-border pb-2 text-sm">
                <span>Accounts Frozen Till Date</span><b data-no-i18n>{frozen || "—"}</b>
                {frozenRole && <span className="chip bg-muted text-[11px]" data-no-i18n>{frozenRole}</span>}
                <Link to="/app/$app/$doctype/$name" params={{ app: "erpnext", doctype: "company", name: ctx.company }} className="btn-ghost ms-auto py-0.5 text-xs">Company</Link>
              </div>
              {aSt !== "ok" ? <div className="mt-2"><SourceState status={aSt} doctype="Accounting Period" /></div>
                : !lk.length ? <p className="mt-2 text-sm text-muted-foreground">No accounting periods defined.</p>
                : <ul className="mt-1 divide-y divide-border">{lk.map((l) => <li key={l.name} className="py-2 text-sm" data-dp-ap={l.name}>
                  <div className="flex flex-wrap items-center gap-2">
                    <Link to="/app/$app/$doctype/$name" params={{ app: "erpnext", doctype: "accounting_period", name: l.name }} className="font-medium hover:underline" data-no-i18n>{l.label}</Link>
                    <span className="text-xs text-muted-foreground" data-no-i18n>{l.start} → {l.end}</span>
                    {l.open && <span className="chip bg-accent text-[11px]">Current</span>}
                    <span className={`chip ms-auto text-[11px] ${l.disabled ? "bg-muted" : "bg-success/15 text-success-text"}`}>{l.disabled ? "Disabled" : "Enabled"}</span>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1 text-[11px]">{l.closed.length ? l.closed.map((d) => <Link key={d} to="/app/$app/$doctype" params={{ app: "erpnext", doctype: slug(d) }} className="chip bg-warning/20 hover:underline">{d}</Link>) : <span className="text-muted-foreground">No closed documents</span>}</div>
                </li>)}</ul>}
            </section>
          </div>
        </>;
      }}
    </ProFrame>
  );
}
