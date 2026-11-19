// @ts-nocheck -- DIGIT Pro/HR apps are switched off in the merged site build; their original /pro/* and /hr/* app routes are not in this route tree (re-enabling the app needs those routes, then remove this line)
/**
 * SC-F-03 General Ledger (R2 P0-GL) — renders the SHARED Core General Ledger runner (src/lib/generalLedger.ts, a port of
 * erpnext general_ledger.py/.js, mapped through ./glControls) with EVERY native control: company, finance book, dates, multi-account,
 * voucher / against voucher, party type + multi-party (with party name / tax id), categorize by, presentation
 * currency, multi cost center / project, dynamic accounting dimensions and the eleven check options. Filters live in
 * the URL (refresh/Back/deep link safe); RXP-01 Saved Views, columns, export and print sit on top. Nothing is written.
 */
import { AreaChart, GroupedColumns, KitEmpty, KpiTile, money, moneyShort, monthLabel } from "@/components/enterprise/kit";
import { Link, useCanGoBack, useNavigate, useRouter, useRouterState } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { allDimensions } from "@/lib/dimensions";
import { fmtCurrency, fmtDate } from "@/lib/format";
import { runnerDefaults, type RResult } from "@/lib/reportRunner";
import { GL_CHECKS, glDefaults, joinMulti, resultCurrency, resultMessage, toCategorize, toGroupBy } from "./glControls";
import { glPartyFilters } from "@/lib/generalLedger";
import { useLang } from "@/i18n";
import { financeContext, sourceStatus, todayIso } from "./finance";
import { ProFrame, SourceState } from "./ProFrame";
import { ViewToolbar } from "./ViewToolbar";
import { GL_SPEC } from "./viewSpecs";
import type { Search } from "./savedViews";
import { NativeReportBody, useNativeReport } from "@/components/report/NativeReport";
import { DocLink } from "@/components/enterprise/FinanceDesk";

type Check = (typeof GL_CHECKS)[number];
export interface LedgerSearch {
  company?: string | undefined; from_date?: string | undefined; to_date?: string | undefined; account?: string | undefined; party_type?: string | undefined; party?: string | undefined;
  voucher_no?: string | undefined; against_voucher_no?: string | undefined; group_by?: string | undefined; categorize_by?: string | undefined; from?: string | undefined; je?: string | undefined;
  finance_book?: string | undefined; presentation_currency?: string | undefined; cost_center?: string | undefined; project?: string | undefined; dimensions?: string | undefined; sel?: string | undefined;
  include_dimensions?: string | undefined; disable_opening_balance_calculation?: string | undefined; show_opening_entries?: string | undefined; include_default_book_entries?: string | undefined;
  show_cancelled_entries?: string | undefined; show_net_values_in_party_account?: string | undefined; show_amount_in_company_currency?: string | undefined; add_values_in_transaction_currency?: string | undefined;
  show_remarks?: string | undefined; ignore_err?: string | undefined; ignore_cr_dr_notes?: string | undefined;
  view?: string | undefined; cols?: string | undefined; sort?: string | undefined; density?: string | undefined; fs?: string | undefined;
}
/** Every URL key the route accepts (route validateSearch reads this list). */
export const LEDGER_KEYS = ["company", "from_date", "to_date", "account", "party_type", "party", "voucher_no", "against_voucher_no", "group_by", "categorize_by", "from", "je", "finance_book", "presentation_currency", "cost_center", "project", "dimensions", "sel", ...GL_CHECKS, "view", "cols", "sort", "density", "fs"] as const;
const TEXT_KEYS = ["company", "from_date", "to_date", "account", "party_type", "party", "voucher_no", "against_voucher_no", "group_by", "finance_book", "presentation_currency", "cost_center", "project"] as const;


/** Pro screens that open the ledger with `from=<key>`; the label names where Back returns. */
const ORIGIN: Record<string, [string, string]> = {
  accounts: ["Chart of Accounts", "دليل الحسابات"], je: ["Journal Entry", "القيد اليومي"], finance: ["Finance Control Center", "مركز التحكم المالي"],
  receivables: ["Receivables", "الذمم المدينة"], payables: ["Payables", "الذمم الدائنة"], payments: ["Payments", "المدفوعات"],
  period: ["Period Control", "التحكم في الفترات"], statements: ["Financial Statements", "القوائم المالية"], "cost-centers": ["Cost Centers", "مراكز التكلفة"],
  "trial-balance": ["Trial Balance", "ميزان المراجعة"], bank: ["Bank Reconciliation", "التسوية البنكية"], intelligence: ["Finance Intelligence", "التحليل المالي للإدارة"],
};

/** Back: browser history first (restores the origin's exact filters and scroll); a cold-opened link falls back to the origin route. */
function BackLink({ search }: { search: LedgerSearch }) {
  const ar = useLang() === "ar"; const router = useRouter(); const canBack = useCanGoBack();
  const o = ORIGIN[search.from ?? ""]; const label = `← ${o ? (ar ? o[1] : o[0]) : ar ? "رجوع" : "Back"}`;
  if (canBack) return <button type="button" className="btn-ghost" onClick={() => router.history.back()} data-dp-back data-no-i18n>{label}</button>;
  if (search.from === "accounts") return <Link to="/pro/accounts" search={{ company: search.company, sel: search.account } as never} className="btn-ghost" data-dp-back data-no-i18n>{label}</Link>;
  if (search.from === "je" && search.voucher_no) return <Link to="/app/$app/$doctype/$name" params={{ app: "erpnext", doctype: "journal_entry", name: search.voucher_no }} className="btn-ghost" data-dp-back data-no-i18n>{label}</Link>;
  if (search.from === "receivables") return <Link to="/pro/receivables" search={{ company: search.company } as never} className="btn-ghost" data-dp-back data-no-i18n>{label}</Link>;
  if (search.from === "payables") return <Link to="/pro/payables" search={{ company: search.company } as never} className="btn-ghost" data-dp-back data-no-i18n>{label}</Link>;
  if (search.from === "period") return <Link to="/pro/period-control" search={{ company: search.company } as never} className="btn-ghost" data-dp-back data-no-i18n>{label}</Link>;
  if (search.from === "bank") return <Link to="/pro/bank-reconciliation" search={{ company: search.company } as never} className="btn-ghost" data-dp-back data-no-i18n>{label}</Link>;
  if (search.from === "statements") return <Link to="/pro/statements" search={{ company: search.company } as never} className="btn-ghost" data-dp-back data-no-i18n>{label}</Link>;
  return <Link to="/pro/finance" search={{ company: search.company } as never} className="btn-ghost" data-dp-back data-no-i18n>{`← ${ar ? ORIGIN["finance"]![1] : ORIGIN["finance"]![0]}`}</Link>;
}

export function LedgerPro({ search }: { search: LedgerSearch }) {
  return <ProFrame title="General Ledger" subtitle="Core General Ledger report — same source, filters and totals." actions={<BackLink search={search} />} doctypes={["Finance Book", "Cost Center", "Project", "Customer", "Supplier"]}>
    {({ user }) => <Body search={search} user={user} />}
  </ProFrame>;
}

/** Runner filter set for a URL state: text keys verbatim, checks "1"/"0" override the source default, dimensions JSON. */
export function ledgerFilters(search: LedgerSearch, company: string): Record<string, string> {
  const d = glDefaults(runnerDefaults("General Ledger"));
  for (const k of TEXT_KEYS) if (search[k] !== undefined) d[k] = String(search[k]);
  if (!search.group_by && search.categorize_by) d["group_by"] = search.categorize_by.replace("Categorize by", "Group by");
  for (const k of GL_CHECKS) if (search[k] === "1") d[k] = "1"; else if (search[k] === "0") d[k] = "";
  d["categorize_by"] = toCategorize(d["group_by"]); // the Core runner reads categorize_by
  d["company"] = company;
  try { const x: unknown = JSON.parse(search.dimensions || "{}"); if (x && typeof x === "object" && !Array.isArray(x)) for (const [k, v] of Object.entries(x)) if ((typeof v === "string" || Array.isArray(v)) && allDimensions().some((dim) => dim.fieldname === k)) d[k] = typeof v === "string" ? v : joinMulti(v.map(String)); } catch { /* invalid dimension scope is ignored */ }
  return d;
}

/** Native filter values for a ledger deep link: only the keys the link sets, mapped to the native report's own fieldnames. */
export function nativeSeed(search: LedgerSearch): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of TEXT_KEYS) if (k !== "group_by" && search[k] !== undefined) out[k] = String(search[k]);
  if (search.group_by !== undefined) out["categorize_by"] = toCategorize(search.group_by);
  else if (search.categorize_by) out["categorize_by"] = search.categorize_by;
  for (const k of GL_CHECKS) if (search[k] === "1") out[k] = "1"; else if (search[k] === "0") out[k] = "";
  try { const x: unknown = JSON.parse(search.dimensions || "{}"); if (x && typeof x === "object" && !Array.isArray(x)) for (const [k, v] of Object.entries(x)) if ((typeof v === "string" || Array.isArray(v)) && allDimensions().some((dim) => dim.fieldname === k)) out[k] = typeof v === "string" ? v : joinMulti(v.map(String)); } catch { /* invalid dimension scope is ignored */ }
  if (out["party"] !== undefined || out["party_type"] !== undefined) Object.assign(out, glPartyFilters(out["party_type"] ?? "", out["party"] ?? ""));
  return out;
}
/** The saved-view state of the native filters (inverse of nativeSeed), so a saved view reopens the same report. */
function ledgerState(values: Record<string, string>, defs: Record<string, string>, keep: LedgerSearch): LedgerSearch {
  const out: Record<string, string | undefined> = { view: keep.view, fs: keep.fs };
  for (const k of TEXT_KEYS) if (k !== "group_by" && values[k]) out[k] = values[k];
  if ((values["categorize_by"] ?? "") !== (defs["categorize_by"] ?? "")) out["group_by"] = toGroupBy(values["categorize_by"]);
  for (const k of GL_CHECKS) if ((values[k] === "1") !== (defs[k] === "1")) out[k] = values[k] === "1" ? "1" : "0";
  return out as LedgerSearch;
}

/** View tabs over the native "Categorize by" filter (the report's own options; nothing recomputed). */
const VIEW_TABS: { id: string; cat: string; label: [string, string] }[] = [
  { id: "consolidated", cat: "Categorize by Voucher (Consolidated)", label: ["All entries", "كل القيود"] },
  { id: "account", cat: "Categorize by Account", label: ["By account", "حسب الحساب"] },
  { id: "party", cat: "Categorize by Party", label: ["By party", "حسب الطرف"] },
  { id: "voucher", cat: "Categorize by Voucher", label: ["By document", "حسب المستند"] },
  { id: "none", cat: "", label: ["Entry lines", "سطور القيود"] },
];
type ChartKind = "combo" | "bars" | "net";
const CHART_KINDS: { id: ChartKind; label: [string, string] }[] = [{ id: "combo", label: ["Bars + net", "أعمدة + الصافي"] }, { id: "bars", label: ["Bars", "أعمدة"] }, { id: "net", label: ["Net line", "خط الصافي"] }];

function Body({ search, user }: { search: LedgerSearch; user: string }) {
  const nav = useNavigate();
  const ar = useLang() === "ar";
  const t = (en: string, arabic: string) => (ar ? arabic : en);
  // one history entry = one seed: Back restores the filters changed afterwards, a new link applies its own filters
  const locKey = useRouterState({ select: (x) => String((x.location.state as { __TSR_key?: string } | undefined)?.__TSR_key ?? x.location.href) });
  const ctx = financeContext(search.company, user);
  const seedValues = useMemo(() => nativeSeed({ ...search, company: search.company ?? ctx.company }), [search, ctx.company]);
  const seed = useMemo(() => ({ key: `${locKey}|${JSON.stringify(seedValues)}`, values: seedValues }), [locKey, seedValues]);
  const r = useNativeReport("General Ledger", undefined, seed);
  const defs = useMemo(() => runnerDefaults("General Ledger"), []);
  const [kind, setKind] = useState<ChartKind>("combo");
  const st = sourceStatus("GL Entry", user);
  if (st !== "ok") return <SourceState status={st} doctype="GL Entry" />;
  if (r.state === "denied") return <SourceState status="denied" doctype="GL Entry" />;
  if (r.state !== "ok") return <div className="dp-card mt-3 p-6 text-sm text-muted-foreground" data-dp-gl-loading>{t("Loading the ledger…", "جارٍ تحميل الدفتر…")}</div>;
  const v = r.values;
  const rows = (r.result?.rows ?? []) as Record<string, unknown>[];
  const cur = resultCurrency((r.runnerOut ?? undefined) as RResult | undefined) ?? ctx.currency;
  const message = resultMessage((r.runnerOut ?? undefined) as RResult | undefined) || r.result?.error || "";
  const opening = rows.find((x) => x["total_kind"] === "opening"), period = [...rows].reverse().find((x) => x["total_kind"] === "total"), closing = [...rows].reverse().find((x) => x["total_kind"] === "closing");
  const net = (x?: Record<string, unknown>) => (x ? Number(x["debit"] ?? 0) - Number(x["credit"] ?? 0) : 0);
  const body = rows.filter((x) => !x["is_total"] && !x["is_group"] && !x["is_blank"] && x["posting_date"]);
  // monthly debit / credit of the report's own entry rows (the table below), so the chart equals the report
  const months = new Map<string, { d: number; c: number }>();
  for (const x of body) { const m = String(x["posting_date"]).slice(0, 7); const e = months.get(m) ?? { d: 0, c: 0 }; e.d += Number(x["debit"] ?? 0); e.c += Number(x["credit"] ?? 0); months.set(m, e); }
  const keys = [...months.keys()].sort();
  const groups = keys.map((k) => ({ key: k, label: `${monthLabel(k, ar)} ${k.slice(2, 4)}` }));
  const debit = keys.map((k) => Math.round(months.get(k)!.d * 100) / 100), credit = keys.map((k) => Math.round(months.get(k)!.c * 100) / 100);
  const netLine = keys.map((_, i) => Math.round((debit[i]! - credit[i]!) * 100) / 100);
  const vouchers = new Set(body.map((x) => `${String(x["voucher_type"] ?? "")}:${String(x["voucher_no"] ?? "")}`)).size;
  const accounts = new Map<string, number>(); for (const x of body) { const a = String(x["account"] ?? ""); if (a) accounts.set(a, (accounts.get(a) ?? 0) + Number(x["debit"] ?? 0) + Number(x["credit"] ?? 0)); }
  const parties = new Set(body.filter((x) => x["party"]).map((x) => `${String(x["party_type"] ?? "")}:${String(x["party"])}`)).size;
  const top = [...accounts.entries()].sort((a, b) => b[1] - a[1])[0];
  // owner GL-01 side card: largest, average, first and last entry of the report's own entry rows (the table below)
  const amt = (x: Record<string, unknown>) => Math.max(Number(x["debit"] ?? 0), Number(x["credit"] ?? 0));
  const largest = body.reduce<Record<string, unknown> | undefined>((m, x) => (!m || amt(x) > amt(m) ? x : m), undefined);
  const average = body.length ? Math.round((body.reduce((a, x) => a + amt(x), 0) / body.length) * 100) / 100 : 0;
  const byDate = [...body].sort((a, b) => String(a["posting_date"]).localeCompare(String(b["posting_date"])));
  const first = byDate[0], last = byDate[byDate.length - 1];
  const fmt = money(cur);
  // the four totals are the report's own Opening / Total / Closing rows (get_data_with_opening_closing), always shown as cards
  const oneAccount = !!v["account"] || !!v["party"];
  const items: { id: string; label: string; value: string; sub: string; tone: "secondary" | "good" | "attention" | "risk" }[] = [
    { id: "opening", label: t("Opening", "الافتتاحي"), value: fmtCurrency(net(opening), cur), tone: "secondary", sub: net(opening) === 0 ? t("No balance before the period start for these filters", "لا رصيد قبل بداية الفترة لهذه الفلاتر") : t("Debit − credit before the period", "مدين − دائن قبل الفترة") },
    { id: "debit", label: t("Period debit", "مدين الفترة"), value: fmtCurrency(Number(period?.["debit"] ?? 0), cur), tone: "good", sub: t("Total row of the report", "صف الإجمالي في التقرير") },
    { id: "credit", label: t("Period credit", "دائن الفترة"), value: fmtCurrency(Number(period?.["credit"] ?? 0), cur), tone: "attention", sub: t("Total row of the report", "صف الإجمالي في التقرير") },
    { id: "closing", label: t("Closing balance", "الرصيد الختامي"), value: fmtCurrency(net(closing), cur), tone: net(closing) < 0 ? "risk" : "good", sub: net(closing) === 0 && !oneAccount ? t("All accounts: debits equal credits", "كل الحسابات: المدين يساوي الدائن") : t("Opening + period movement", "الافتتاحي + حركة الفترة") },
  ];
  const tab = VIEW_TABS.find((x) => x.cat === (v["categorize_by"] ?? ""))?.id ?? "none";
  const apply = (next: Search) => void nav({ to: "/pro/general-ledger", search: ((prev: LedgerSearch) => ({ ...prev, ...next })) as never, replace: true });
  const state = ledgerState(v, defs, search);
  return <>
    <section className="ek-card ek-card-pad mt-3" aria-label={t("Ledger overview", "نظرة على الدفتر")} data-dp-gl-upper>
      <div className="flex flex-wrap items-center gap-2">
        <div role="tablist" aria-label={t("Ledger view", "عرض الدفتر")} className="flex flex-wrap gap-1" data-dp-gl-tabs>
          {VIEW_TABS.map((x) => <button key={x.id} type="button" role="tab" aria-selected={tab === x.id} className="btn-ghost px-2.5 py-1 text-xs aria-selected:bg-primary/10 aria-selected:font-semibold aria-selected:text-primary" onClick={() => r.setMany({ categorize_by: x.cat, ...(x.cat.startsWith("Categorize by Voucher") ? {} : {}) })} data-dp-gl-tab={x.id}>{ar ? x.label[1] : x.label[0]}</button>)}
        </div>
        <div className="ms-auto flex flex-wrap items-center gap-1" role="group" aria-label={t("Quick period", "فترة سريعة")} data-dp-gl-periods>
          <span className="text-xs text-muted-foreground">{t("Quick period", "فترة سريعة")}</span>
          {glPeriods(ctx.fiscalYear?.start, todayIso()).map((p) => { const on = v["from_date"] === p.from && v["to_date"] === p.to;
            return <button key={p.id} type="button" className="btn-ghost px-2 py-0.5 text-xs aria-pressed:bg-primary/10 aria-pressed:text-primary" aria-pressed={on} onClick={() => r.setMany({ from_date: p.from, to_date: p.to })} data-dp-gl-period={p.id}>{ar ? p.label[1] : p.label[0]}</button>; })}
        </div>
      </div>
      {message ? <div role="alert" className="mt-3 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive" data-dp-gl-message>{glMessage(message, ar)}</div>
        : <div className="mt-3 ek-kpis" data-dp-gl-summary><div className="ek-kpi-grid" style={{ ["--ek-kpi-n" as string]: "4", ["--ek-kpi-rest" as string]: "4", ["--ek-kpi-cols" as string]: "4" }}>
          {items.map((k) => <KpiTile key={k.id} label={k.label} value={k.value} sub={k.sub} tone={k.tone} ar={ar} attrs={{ "data-dp-gl-kpi": k.id }} />)}</div></div>}
      {!message && <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1fr)_17rem]">
        <div className="ek-card ek-card-pad" data-dp-gl-chart={kind}>
          <div className="mb-2 flex flex-wrap items-center gap-2"><h2 className="me-auto text-sm font-semibold">{t("Debit and credit by month", "المدين والدائن شهريًا")}</h2>
            <div role="group" aria-label={t("Chart type", "نوع الرسم")} className="flex gap-1">{CHART_KINDS.map((c) => <button key={c.id} type="button" aria-pressed={kind === c.id} className="btn-ghost px-2 py-0.5 text-xs aria-pressed:bg-primary/10 aria-pressed:text-primary" onClick={() => setKind(c.id)} data-dp-gl-chart-kind={c.id}>{ar ? c.label[1] : c.label[0]}</button>)}</div></div>
          {!groups.length ? <KitEmpty ar={ar} text={["No entries in this period — choose another period or clear a filter.", "لا توجد قيود في هذه الفترة — اختر فترة أخرى أو أزل أحد الفلاتر."]} />
            : kind === "net" ? <AreaChart data={groups.map((g, i) => ({ key: g.key, label: g.label, value: netLine[i]! }))} fmt={fmt} axisFmt={moneyShort(cur)} ar={ar} valueLabel={t("Net (debit − credit)", "الصافي (مدين − دائن)")} />
            : <GroupedColumns groups={groups} series={[{ label: t("Debit", "مدين"), values: debit, tone: "good" }, { label: t("Credit", "دائن"), values: credit, tone: "attention" }]} fmt={fmt} axisFmt={moneyShort(cur)} ar={ar} line={kind === "combo" ? { label: t("Net", "الصافي"), values: netLine } : undefined} />}
        </div>
        <aside className="ek-card ek-card-pad text-sm" aria-label={t("Summary", "الملخص")} data-dp-gl-side>
          <h2 className="mb-2 text-sm font-semibold">{t("Summary", "الملخص")}</h2>
          <dl className="grid grid-cols-2 gap-x-3 gap-y-2">
            <div><dt className="text-xs text-muted-foreground">{t("Period", "الفترة")}</dt><dd className="tabular-nums" data-no-i18n>{v["from_date"] ? fmtDate(v["from_date"]) : "—"} – {v["to_date"] ? fmtDate(v["to_date"]) : "—"}</dd></div>
            <div><dt className="text-xs text-muted-foreground">{t("Entry lines", "سطور القيود")}</dt><dd className="font-semibold tabular-nums" data-no-i18n data-dp-gl-rows={body.length}>{body.length.toLocaleString("en-US")}</dd></div>
            <div><dt className="text-xs text-muted-foreground">{t("Documents", "المستندات")}</dt><dd className="font-semibold tabular-nums" data-no-i18n>{vouchers.toLocaleString("en-US")}</dd></div>
            <div><dt className="text-xs text-muted-foreground">{t("Accounts", "الحسابات")}</dt><dd className="font-semibold tabular-nums" data-no-i18n>{accounts.size.toLocaleString("en-US")}</dd></div>
            <div><dt className="text-xs text-muted-foreground">{t("Parties", "الأطراف")}</dt><dd className="font-semibold tabular-nums" data-no-i18n>{parties.toLocaleString("en-US")}</dd></div>
            <div><dt className="text-xs text-muted-foreground">{t("Net movement", "صافي الحركة")}</dt><dd className="font-semibold tabular-nums" data-no-i18n>{fmtCurrency(Number(period?.["debit"] ?? 0) - Number(period?.["credit"] ?? 0), cur)}</dd></div>
            {largest && <div className="col-span-2" data-dp-gl-side-largest><dt className="text-xs text-muted-foreground">{t("Largest entry", "أكبر قيد")}</dt><dd className="flex flex-wrap items-baseline gap-x-2"><span className="font-semibold tabular-nums" data-no-i18n>{fmtCurrency(amt(largest), cur)}</span><GlVoucher row={largest} /></dd></div>}
            <div data-dp-gl-side-average><dt className="text-xs text-muted-foreground">{t("Average entry", "متوسط القيد")}</dt><dd className="font-semibold tabular-nums" data-no-i18n>{fmtCurrency(average, cur)}</dd></div>
            {first && <div data-dp-gl-side-first><dt className="text-xs text-muted-foreground">{t("First entry", "أول قيد")}</dt><dd className="tabular-nums"><span data-no-i18n>{fmtDate(first["posting_date"])}</span> <GlVoucher row={first} /></dd></div>}
            {last && <div data-dp-gl-side-last><dt className="text-xs text-muted-foreground">{t("Last entry", "آخر قيد")}</dt><dd className="tabular-nums"><span data-no-i18n>{fmtDate(last["posting_date"])}</span> <GlVoucher row={last} /></dd></div>}
            {top && <div className="col-span-2"><dt className="text-xs text-muted-foreground">{t("Most active account", "الحساب الأكثر حركة")}</dt><dd><button type="button" className="text-start text-primary hover:underline" onClick={() => r.setMany({ account: joinMulti([top[0]]) })} title={t("Filter by this account", "تصفية بهذا الحساب")} data-dp-gl-top-account data-no-i18n>{top[0]}</button></dd></div>}
          </dl>
        </aside>
      </div>}
      <div className="mt-3"><ViewToolbar spec={{ ...GL_SPEC, columns: [] }} search={state as Search} companies={ctx.companies} onApply={apply} /></div>
    </section>
    <section className="mt-4" aria-label={t("General Ledger report", "تقرير دفتر الأستاذ العام")} data-dp-gl-native>
      <NativeReportBody r={r} embedded />
    </section>
  </>;
}

/** The entry's voucher as a coloured link that opens in the same-screen side panel (owner GL-03). */
function GlVoucher({ row }: { row: Record<string, unknown> }) {
  const dt = String(row["voucher_type"] ?? ""), no = String(row["voucher_no"] ?? "");
  return dt && no ? <span className="text-xs"><DocLink dt={dt} name={no} /></span> : null;
}

const MSG_AR: Record<string, string> = {
  "Can not filter based on Child Account, if grouped by Account": "لا يمكن التصفية بحساب فرعي عند التصنيف حسب الحساب",
  "Can not filter based on Voucher No, if grouped by Voucher": "لا يمكن التصفية برقم المستند عند التصنيف حسب المستند",
  "From Date must be before To Date": "يجب أن يكون تاريخ البداية قبل تاريخ النهاية",
  "To use a different finance book, please uncheck 'Include Default FB Entries'": "لاستخدام دفتر مالي مختلف، ألغِ تحديد «تضمين قيود الدفتر المالي الافتراضي»",
  "Company is mandatory": "الشركة إلزامية",
  "From Date and To Date are mandatory": "تاريخ البداية وتاريخ النهاية إلزاميان",
};
function glMessage(m: string, ar: boolean): string {
  if (!ar) return m;
  if (MSG_AR[m]) return MSG_AR[m]!;
  if (m.startsWith("Presentation Currency cannot be")) return "لا يمكن اختيار عملة عرض غير عملة الشركة عند تفعيل «إظهار المدين والدائن بعملة الشركة»";
  if (m.startsWith("Account ")) return `الحساب ${m.slice(8).replace(" does not exists", "")} غير موجود`;
  return m;
}

/** Quick periods of the ledger filter bar: this month, this quarter and year to date (fiscal-year start → today). */
export function glPeriods(fyStart: string | undefined, today: string): { id: "month" | "quarter" | "ytd"; label: [string, string]; from: string; to: string }[] {
  const m = Number(today.slice(5, 7)); const q = `${today.slice(0, 4)}-${String(Math.floor((m - 1) / 3) * 3 + 1).padStart(2, "0")}-01`;
  return [{ id: "month", label: ["This month", "هذا الشهر"], from: `${today.slice(0, 7)}-01`, to: today }, { id: "quarter", label: ["This quarter", "هذا الربع"], from: q, to: today },
    { id: "ytd", label: ["Year to date", "منذ بداية السنة"], from: fyStart && fyStart <= today ? fyStart : `${today.slice(0, 4)}-01-01`, to: today }];
}
