// @ts-nocheck -- DIGIT Pro/HR apps are switched off in the merged site build; their original /pro/* and /hr/* app routes are not in this route tree (re-enabling the app needs those routes, then remove this line)
/**
 * SC-F-02 Chart of Accounts (R2 P0-COA) — the native Account tree (same records, same parent_account hierarchy) with
 * every control of the pinned frappe treeview.js + erpnext account_tree.js: company, ID search, sort order, show all
 * (including disabled), Expand All / Collapse All, per-node expand, Add Account / Add Child (source dialog fields),
 * Edit / Details, View Ledger, Update Account Name / Number, Convert to Group / Non-Group, Move to…, Delete,
 * account-number / foreign-currency / frozen badges, Dr/Cr balances, the View menu (Chart of Cost Centers, Opening
 * Invoice Creation Tool, seven financial reports) and Print / View List / New Company. Mutations go only through
 * src/lib/accountOps.ts (account.py port) and are offered per Account permission. Expansion, selection, search and
 * sort live in the URL, so Back/refresh restore the tree; a ledger preview keeps the tree in view (UX_PAT_03/05).
 */
import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { fmtCurrency } from "@/lib/format";
import { adapter, useStoreVersion } from "@/lib/adapter";
import { cachedMeta } from "@/lib/catalog";
import { scopedList } from "@/lib/scope";
import { withChildren } from "@/lib/dimensions";
import { addAccount, convertGroupToLedger, convertLedgerToGroup, deleteAccount, moveAccount, updateAccountNumber, type OpResult } from "@/lib/accountOps";
import { useLang } from "@/i18n";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { accountMatches, accountTree, appOf, can, coaBalanceMode, financeContext, slug, sourceStatus, type AccNode } from "./finance";
import { ProFrame, SourceState } from "./ProFrame";

export interface AccountsSearch { company?: string | undefined; q?: string | undefined; root?: string | undefined; disabled?: string | undefined; sel?: string | undefined; open?: string | undefined; order?: string | undefined }
const ROOTS = ["Asset", "Liability", "Equity", "Income", "Expense"];
const ROOTS_AR: Record<string, string> = { Asset: "الأصول", Liability: "الخصوم", Equity: "حقوق الملكية", Income: "الإيرادات", Expense: "المصروفات" };
type Bi = [string, string];
/** account_tree.js View menu: financial statements open with the tree's company (Pro screens where they exist). */
const REPORTS: { label: Bi; to: string; search?: Record<string, string> }[] = [
  { label: ["Trial Balance", "ميزان المراجعة"], to: "/pro/trial-balance" },
  { label: ["General Ledger", "دفتر الأستاذ العام"], to: "/pro/general-ledger" },
  { label: ["Balance Sheet", "الميزانية العمومية"], to: "/pro/statements", search: { report: "Balance Sheet" } },
  { label: ["Profit and Loss Statement", "قائمة الأرباح والخسائر"], to: "/pro/statements", search: { report: "Profit and Loss Statement" } },
  { label: ["Cash Flow", "التدفقات النقدية"], to: "/pro/statements", search: { report: "Cash Flow" } },
  { label: ["Accounts Payable", "الذمم الدائنة"], to: "/pro/payables" },
  { label: ["Accounts Receivable", "الذمم المدينة"], to: "/pro/receivables" },
];

export function AccountsPro({ search }: { search: AccountsSearch }) {
  return <ProFrame title="Chart of Accounts" subtitle="Search, expand and inspect the native account tree.">
    {({ user }) => <Body search={search} user={user} />}
  </ProFrame>;
}

type DialogState = null | { kind: "add"; parent?: string | undefined } | { kind: "update"; name: string } | { kind: "move"; name: string } | { kind: "confirm"; name: string; op: "delete" | "to-group" | "to-ledger" };

function Body({ search, user }: { search: AccountsSearch; user: string }) {
  const nav = useNavigate();
  const ver = useStoreVersion();
  const ar = useLang() === "ar";
  const t = (en: string, arabic: string) => (ar ? arabic : en);
  const listRef = useRef<HTMLUListElement>(null);
  const [dialog, setDialog] = useState<DialogState>(null);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [dlgErr, setDlgErr] = useState("");
  const set = (p: Partial<AccountsSearch>) => void nav({ to: "/pro/accounts", search: (prev: AccountsSearch) => ({ ...prev, ...p }) as never, replace: true });
  const ctx = financeContext(search.company, user);
  const st = sourceStatus("Account", user);
  const { roots, byName, glReadable } = useMemo(() => accountTree(ctx.company, user), [ctx.company, user, ver]); // eslint-disable-line react-hooks/exhaustive-deps
  // Return parity: the selected account is scrolled into view when Back/refresh restores this URL
  useEffect(() => { if (!search.sel) return; const el = listRef.current?.querySelector(`[data-dp-acc="${CSS.escape(search.sel)}"]`) as HTMLElement | null; el?.scrollIntoView({ block: "nearest" }); }, [search.sel, byName]);
  if (st !== "ok") return <SourceState status={st} doctype="Account" />;
  // account_tree.js: tree balances render only when GL Entry is readable AND Accounts Settings.show_balance_in_coa (default 1)
  const treeBalances = coaBalanceMode(glReadable) === "show";
  const canCreate = can("Account", "create", undefined, user), canWrite = can("Account", "write", undefined, user), canDelete = can("Account", "delete", undefined, user);
  const order = search.order === "asc" || search.order === "desc" ? search.order : "default";
  const label = (a: AccNode) => String(a.doc["account_name"] ?? a.name);
  const sortKids = (xs: AccNode[]) => (order === "default" ? xs : [...xs].sort((x, y) => (order === "asc" ? 1 : -1) * label(x).localeCompare(label(y))));
  const match = accountMatches(byName, search.q ?? "", search.root ?? "", search.disabled === "1");
  const openSet = new Set((search.open ?? "").split(",").filter(Boolean));
  const filtering = !!match && !!(search.q || search.root);
  const isOpen = (a: AccNode) => filtering || openSet.has(a.name);
  const visible: AccNode[] = [];
  const walk = (a: AccNode) => { if (match && !match.has(a.name)) return; visible.push(a); if (isOpen(a)) sortKids(a.children).forEach(walk); };
  sortKids(roots).forEach(walk);
  const sel = byName.get(search.sel ?? "") ?? visible[0];
  const toggle = (a: AccNode, force?: boolean) => { const s = new Set(openSet); (force ?? !s.has(a.name)) ? s.add(a.name) : s.delete(a.name); set({ open: [...s].join(",") || undefined }); };
  const select = (a: AccNode) => { set({ sel: a.name }); requestAnimationFrame(() => (listRef.current?.querySelector(`[data-dp-acc="${CSS.escape(a.name)}"]`) as HTMLElement | null)?.focus()); };
  const onKey = (e: React.KeyboardEvent, a: AccNode) => {
    const i = visible.indexOf(a); const rtl = document.documentElement.dir === "rtl";
    const fwd = rtl ? "ArrowLeft" : "ArrowRight", back = rtl ? "ArrowRight" : "ArrowLeft";
    if (e.key === "ArrowDown" && visible[i + 1]) { e.preventDefault(); select(visible[i + 1]!); }
    else if (e.key === "ArrowUp" && visible[i - 1]) { e.preventDefault(); select(visible[i - 1]!); }
    else if (e.key === "Home" && visible[0]) { e.preventDefault(); select(visible[0]); }
    else if (e.key === "End" && visible.length) { e.preventDefault(); select(visible[visible.length - 1]!); }
    else if (e.key === fwd && a.children.length) { e.preventDefault(); toggle(a, true); }
    else if (e.key === back) { e.preventDefault(); if (isOpen(a) && a.children.length) toggle(a, false); else { const p = byName.get(a.parent); if (p) select(p); } }
    else if (e.key === "Enter") void nav({ to: "/app/$app/$doctype/$name", params: { app: "erpnext", doctype: "account", name: a.name } });
  };
  const allGroups = [...byName.values()].filter((a) => a.children.length).map((a) => a.name);
  const openGroups = allGroups.filter((g) => openSet.has(g)).length;
  const expansion = filtering ? "expanded" : openGroups === 0 ? "collapsed" : openGroups === allGroups.length ? "expanded" : "partial";
  const coCur = ctx.currency;
  const run = (r: OpResult, okText: string, after?: (name: string) => void) => {
    if (r.ok) { setNotice({ ok: true, text: okText }); setDlgErr(""); after?.(r.name); setDialog(null); } else setDlgErr(r.error);
    return r.ok;
  };
  const close = () => { setDlgErr(""); setDialog(null); };
  const fyFrom = ctx.fiscalYear?.start, fyTo = ctx.fiscalYear?.end;
  const ledgerSearch = (a: AccNode) => ({ company: ctx.company, account: a.name, from: "accounts", ...(fyFrom ? { from_date: fyFrom } : {}), ...(fyTo ? { to_date: fyTo } : {}), ...(a.children.length || Number(a.doc["is_group"]) ? { group_by: "Group by Account" } : {}) });
  const dlgName = dialog && "name" in dialog ? dialog.name : undefined;
  return <>
    <section className="dp-context" data-dp-context data-dp-coa-toolbar>
      <label className="dp-ctx-item"><span>{t("Company", "الشركة")}</span><select className="field-input" value={ctx.company} onChange={(e) => set({ company: e.target.value, sel: undefined, open: undefined })} data-dp-coa-company data-no-i18n>{ctx.companies.map((c) => <option key={c}>{c}</option>)}</select></label>
      <label className="dp-ctx-item grow"><span>{t("ID", "المعرّف")}</span><input className="field-input" value={search.q ?? ""} placeholder={t("Account name or number", "اسم الحساب أو رقمه")} onChange={(e) => set({ q: e.target.value || undefined })} data-dp-acc-search /></label>
      <label className="dp-ctx-item"><span>{t("Root Type", "النوع الأساسي")}</span><select className="field-input" value={search.root ?? ""} onChange={(e) => set({ root: e.target.value || undefined })} data-dp-root><option value="">{t("All", "الكل")}</option>{ROOTS.map((r) => <option key={r} value={r}>{ar ? ROOTS_AR[r] : r}</option>)}</select></label>
      <label className="dp-ctx-item"><span>{t("Sort", "الترتيب")}</span><select className="field-input" value={order} onChange={(e) => set({ order: e.target.value === "default" ? undefined : e.target.value })} data-dp-coa-order>
        <option value="default">{t("Default Order", "الترتيب الافتراضي")}</option><option value="asc">{t("Name A to Z", "الاسم تصاعدياً")}</option><option value="desc">{t("Name Z to A", "الاسم تنازلياً")}</option></select></label>
      <label className="flex items-center gap-2 self-end pb-2 text-sm"><input type="checkbox" checked={search.disabled === "1"} onChange={(e) => set({ disabled: e.target.checked ? "1" : undefined })} data-dp-coa-disabled /><span>{t("Show all (including disabled)", "إظهار الكل (بما فيها المعطلة)")}</span></label>
    </section>

    <div className="mt-2 flex flex-wrap items-center gap-2" role="toolbar" aria-label={t("Chart of Accounts actions", "إجراءات دليل الحسابات")} data-dp-coa-actions>
      {canCreate && <button type="button" className="btn-primary" onClick={() => setDialog({ kind: "add", parent: sel ? (sel.children.length || Number(sel.doc["is_group"]) ? sel.name : sel.parent || undefined) : undefined })} data-dp-coa-add>+ {t("Add Account", "إضافة حساب")}</button>}
      <button type="button" className="btn-ghost" disabled={expansion === "expanded"} onClick={() => set({ open: allGroups.join(",") })} data-dp-expand-all>{t("Expand All", "توسيع الكل")}</button>
      <button type="button" className="btn-ghost" disabled={expansion === "collapsed"} onClick={() => set({ open: undefined })} data-dp-collapse-all>{t("Collapse All", "طي الكل")}</button>
      <Menu label={t("View", "عرض")} attr="view">
        <DropdownMenuItem asChild><Link to="/pro/cost-centers" search={{ company: ctx.company } as never}>{t("Chart of Cost Centers", "دليل مراكز التكلفة")}</Link></DropdownMenuItem>
        {cachedMeta("Opening Invoice Creation Tool") && <DropdownMenuItem asChild><Link to="/app/$app/$doctype" params={{ app: appOf("Opening Invoice Creation Tool"), doctype: slug("Opening Invoice Creation Tool") }}>{t("Opening Invoice Creation Tool", "أداة إنشاء فواتير افتتاحية")}</Link></DropdownMenuItem>}
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-xs text-muted-foreground">{t("Financial Statements", "القوائم المالية")}</DropdownMenuLabel>
        {REPORTS.map((r) => <DropdownMenuItem key={r.label[0]} asChild><Link to={r.to as never} search={{ company: ctx.company, ...(r.search ?? {}) } as never} data-dp-coa-report={r.label[0]}>{r.label[ar ? 1 : 0]}</Link></DropdownMenuItem>)}
      </Menu>
      <Menu label={t("Menu", "القائمة")} attr="menu">
        <DropdownMenuItem onSelect={() => window.print()} data-dp-coa-print>{t("Print", "طباعة")}</DropdownMenuItem>
        <DropdownMenuItem asChild><Link to="/app/$app/$doctype" params={{ app: "erpnext", doctype: "account" }}>{t("View List", "عرض القائمة")}</Link></DropdownMenuItem>
        {can("Company", "create", undefined, user) && cachedMeta("Company") && <DropdownMenuItem onSelect={() => { const doc = adapter.insert(cachedMeta("Company")!); void nav({ to: "/app/$app/$doctype/$name", params: { app: appOf("Company"), doctype: "company", name: doc.name } }); }} data-dp-coa-new-company>{t("New Company", "شركة جديدة")}</DropdownMenuItem>}
        <DropdownMenuItem asChild><Link to="/app/$app/$doctype/view/tree" params={{ app: "erpnext", doctype: "account" }}>{t("Standard tree", "الشجرة القياسية")}</Link></DropdownMenuItem>
      </Menu>
      <span className="ms-auto text-xs text-muted-foreground" data-no-i18n>{byName.size} {t("accounts", "حساب")}</span>
    </div>
    {notice && <p role={notice.ok ? "status" : "alert"} className={`mt-2 rounded-md px-3 py-2 text-sm ${notice.ok ? "bg-success/10 text-success-text" : "bg-destructive/10 text-destructive"}`} data-dp-coa-notice={notice.ok ? "ok" : "error"}>{notice.text}</p>}

    <div className="mt-3 grid gap-4 lg:grid-cols-12">
      <section className="dp-card p-0 lg:col-span-7 xl:col-span-8" data-dp-tree>
        <div className="dp-thead grid grid-cols-[minmax(0,1fr)_auto] sm:grid-cols-[minmax(0,1fr)_7rem_6.5rem_minmax(8rem,auto)] gap-2 px-4 py-2"><span>{t("Account", "الحساب")}</span><span className="hidden sm:block">{t("Account Type", "نوع الحساب")}</span><span className="hidden sm:block">{t("Status", "الحالة")}</span><span className="text-end">{t("Balance", "الرصيد")}</span></div>
        {!visible.length ? <div className="p-6"><SourceState status="empty" /></div> :
        <ul ref={listRef} role="tree" aria-label={t("Chart of Accounts", "دليل الحسابات")} className="max-h-[70vh] overflow-y-auto">
          {visible.map((a) => { const on = sel?.name === a.name; const dis = !!Number(a.doc["disabled"]); const group = a.children.length > 0 || !!Number(a.doc["is_group"]);
            const acur = String(a.doc["account_currency"] || coCur); const frozen = a.doc["freeze_account"] === "Yes";
            return <li key={a.name} role="treeitem" aria-level={a.depth + 1} aria-selected={on} aria-expanded={a.children.length ? isOpen(a) : undefined} tabIndex={on ? 0 : -1} data-dp-acc={a.name} data-dp-acc-group={group ? "1" : "0"}
              className={`dp-row grid grid-cols-[minmax(0,1fr)_auto] sm:grid-cols-[minmax(0,1fr)_7rem_6.5rem_minmax(8rem,auto)] gap-2 ${on ? "dp-row-on" : ""} ${dis ? "opacity-60" : ""}`} onClick={() => set({ sel: a.name })} onKeyDown={(e) => onKey(e, a)}>
              <span className="flex min-w-0 items-center gap-1" style={{ paddingInlineStart: `${a.depth * 18}px` }}>
                <button type="button" tabIndex={-1} className="w-5 shrink-0 text-muted-foreground" aria-label={isOpen(a) ? t("Collapse", "طي") : t("Expand", "توسيع")} disabled={!a.children.length} onClick={(e) => { e.stopPropagation(); toggle(a); }}>{a.children.length ? (isOpen(a) ? "▾" : <span className="inline-block rtl:-scale-x-100">▸</span>) : group ? "▫" : "·"}</button>
                <span className={`truncate ${group ? "font-semibold" : ""}`} data-no-i18n>{label(a)}</span>
                {a.doc["account_number"] ? <span className="chip shrink-0 bg-muted font-mono text-[10px]" data-no-i18n data-dp-acc-number>{String(a.doc["account_number"])}</span> : null}
                {acur !== coCur && <span className="chip shrink-0 bg-info/15 text-info-text text-[10px]" data-no-i18n data-dp-acc-currency>{acur}</span>}
                {frozen && <span className="chip shrink-0 bg-warning/15 text-warning-text text-[10px]" title={t("Frozen - entries restricted", "مجمّد - القيود مقيّدة")} data-dp-acc-frozen>🔒 {t("Frozen", "مجمّد")}</span>}
              </span>
              <span className="hidden truncate text-xs text-muted-foreground sm:block">{String(a.doc["account_type"] || (ar ? ROOTS_AR[String(a.doc["root_type"])] : a.doc["root_type"]) || "")}</span>
              <span className="hidden sm:block">{dis ? <span className="chip bg-muted">{t("Disabled", "معطل")}</span> : <span className="chip dp-chip-ok">{t("Enabled", "مفعّل")}</span>}</span>
              <span className="text-end tabular-nums whitespace-nowrap" data-no-i18n data-dp-acc-balance>{treeBalances ? <Balance a={a} coCur={coCur} ar={ar} /> : glReadable ? "" : "—"}</span>
            </li>; })}
        </ul>}
        <p className="border-t border-border px-4 py-2 text-[11px] text-muted-foreground">{t("Arrow keys move and expand", "الأسهم للتنقل والتوسيع")} · <kbd data-no-i18n>Home</kbd>/<kbd data-no-i18n>End</kbd> {t("jump", "للقفز")} · <kbd data-no-i18n>Enter</kbd> {t("opens the account", "لفتح الحساب")}</p>
      </section>
      <aside className="lg:col-span-5 xl:col-span-4">{sel ? <AccountDetail a={sel} parent={byName.get(sel.parent)} glReadable={glReadable} coCur={coCur} user={user} ar={ar}
        canCreate={canCreate} canWrite={canWrite} canDelete={canDelete} ledgerSearch={ledgerSearch(sel)} onAction={setDialog} /> : <section className="dp-card"><SourceState status="empty" /></section>}</aside>
    </div>

    <AddDialog open={dialog?.kind === "add"} parent={dialog?.kind === "add" ? dialog.parent : undefined} company={ctx.company} groups={[...byName.values()].filter((a) => a.children.length || Number(a.doc["is_group"])).map((a) => a.name).sort()} ar={ar} error={dlgErr} onClose={close}
      onSubmit={(v) => run(addAccount({ ...v, company: ctx.company }), t("Account created", "تم إنشاء الحساب"), (name) => { const s = new Set(openSet); if (v.parent_account) s.add(v.parent_account); set({ sel: name, open: [...s].join(",") || undefined }); })} />
    {dialog?.kind === "update" && dlgName && <UpdateDialog acc={adapter.get("Account", dlgName)} ar={ar} error={dlgErr} onClose={close} onSubmit={(nm, num) => run(updateAccountNumber(dlgName, nm, num), t("Account updated", "تم تحديث الحساب"), (name) => set({ sel: name }))} />}
    {dialog?.kind === "move" && dlgName && <MoveDialog name={dlgName} groups={[...byName.values()].filter((a) => (a.children.length || Number(a.doc["is_group"])) && a.name !== dlgName).map((a) => a.name).sort()} ar={ar} error={dlgErr} onClose={close}
      onSubmit={(p) => run(moveAccount(dlgName, p), t("Account moved", "تم نقل الحساب"), () => { const s = new Set(openSet); s.add(p); set({ open: [...s].join(",") }); })} />}
    {dialog?.kind === "confirm" && <ConfirmDialog op={dialog.op} name={dialog.name} ar={ar} error={dlgErr} onClose={close}
      onConfirm={() => dialog.op === "delete" ? run(deleteAccount(dialog.name), t("Account deleted", "تم حذف الحساب"), () => set({ sel: sel?.parent || undefined }))
        : dialog.op === "to-group" ? run(convertLedgerToGroup(dialog.name), t("Converted to group", "تم التحويل إلى مجموعة"))
        : run(convertGroupToLedger(dialog.name), t("Converted to ledger", "تم التحويل إلى حساب فرعي"))} />}
  </>;
}

/** account_tree.js balance area: "<account-currency> / <company-currency> Dr|Cr" — the sign shown as Dr (debit) or Cr (credit). */
function Balance({ a, coCur, ar }: { a: AccNode; coCur: string; ar: boolean }) {
  const acur = String(a.doc["account_currency"] || coCur);
  const drcr = a.balance > 0 ? (ar ? "مدين" : "Dr") : a.balance < 0 ? (ar ? "دائن" : "Cr") : "";
  const foreign = acur !== coCur && a.balanceAc !== undefined;
  return <><span>{foreign ? `${fmtCurrency(Math.abs(a.balanceAc!), acur)} / ` : ""}{fmtCurrency(Math.abs(a.balance), coCur)}</span>{drcr && <span className="ms-1 text-[11px] text-muted-foreground" data-dp-acc-drcr={a.balance > 0 ? "Dr" : "Cr"}>{drcr}</span>}</>;
}

function Menu({ label, attr, children }: { label: string; attr: string; children: ReactNode }) {
  return <DropdownMenu><DropdownMenuTrigger asChild><button type="button" className="btn-ghost" data-dp-coa-menu={attr}>{label} ▾</button></DropdownMenuTrigger><DropdownMenuContent align="start" className="min-w-56">{children}</DropdownMenuContent></DropdownMenu>;
}

function AccountDetail({ a, parent, glReadable, coCur, user, ar, canCreate, canWrite, canDelete, ledgerSearch, onAction }: { a: AccNode; parent?: AccNode | undefined; glReadable: boolean; coCur: string; user: string; ar: boolean; canCreate: boolean; canWrite: boolean; canDelete: boolean; ledgerSearch: Record<string, string>; onAction: (d: DialogState) => void }) {
  const t = (en: string, arabic: string) => (ar ? arabic : en);
  const d = a.doc; const group = a.children.length > 0 || !!Number(d["is_group"]);
  const writeDoc = canWrite && can("Account", "write", d, user);
  const F = (label: string, v: unknown, tr = false) => <><dt>{label}</dt><dd data-no-i18n={tr ? undefined : ""}>{v === undefined || v === null || v === "" ? "—" : String(v)}</dd></>;
  // Ledger preview (UX_PAT_03): latest permitted, non-cancelled GL rows of this account and its descendants; the full ledger opens with the same scope
  const accounts = withChildren("Account", a.name);
  const recent = glReadable ? scopedList("GL Entry", user).filter((g) => accounts.has(String(g["account"])) && !Number(g["is_cancelled"])).sort((x, y) => String(y["posting_date"]).localeCompare(String(x["posting_date"])) || String(y.name).localeCompare(String(x.name))).slice(0, 6) : [];
  return <section className="dp-card sticky top-20" data-dp-acc-detail={a.name}>
    <p className="text-xs text-muted-foreground">{group ? t("Group account", "حساب مجموعة") : t("Ledger account", "حساب فرعي (دفتر)")}</p>
    <h2 className="text-lg font-semibold" data-no-i18n>{a.name}</h2>
    <dl className="dp-dl mt-2">
      {F(t("Account Number", "رقم الحساب"), d["account_number"])}{F(t("Account Name", "اسم الحساب"), d["account_name"])}{F(t("Company", "الشركة"), d["company"])}
      {F(t("Root Type", "النوع الأساسي"), d["root_type"], true)}{F(t("Account Type", "نوع الحساب"), d["account_type"], true)}{F(t("Account Currency", "عملة الحساب"), d["account_currency"])}
      {F(t("Parent Account", "الحساب الرئيسي"), parent?.name ?? d["parent_account"])}<dt>{t("Is Group", "مجموعة")}</dt><dd>{group ? t("Yes", "نعم") : t("No", "لا")}</dd>
      <dt>{t("Frozen", "مجمّد")}</dt><dd>{d["freeze_account"] === "Yes" ? t("Yes", "نعم") : t("No", "لا")}</dd>
      <dt>{t("Balance", "الرصيد")}</dt><dd className="tabular-nums" data-no-i18n>{glReadable ? <Balance a={a} coCur={coCur} ar={ar} /> : "—"}</dd>
    </dl>
    {!glReadable && <SourceState status="denied" doctype="GL Entry" />}
    <div className="mt-3 flex flex-wrap gap-2" data-dp-acc-actions>
      <Link to="/app/$app/$doctype/$name" params={{ app: "erpnext", doctype: "account", name: a.name }} className="btn-primary" data-dp-acc-open>{writeDoc ? t("Edit", "تعديل") : t("Details", "التفاصيل")}</Link>
      {glReadable && <Link to="/pro/general-ledger" search={ledgerSearch as never} className="btn-ghost" data-dp-acc-gl>{t("View Ledger", "عرض دفتر الأستاذ")}</Link>}
      {canCreate && group && <button type="button" className="btn-ghost" onClick={() => onAction({ kind: "add", parent: a.name })} data-dp-acc-add-child>+ {t("Add Child", "إضافة حساب فرعي")}</button>}
    </div>
    {(writeDoc || canDelete) && <div className="mt-2 flex flex-wrap gap-2 border-t border-border pt-2" data-dp-acc-more>
      {writeDoc && <button type="button" className="btn-ghost text-xs" onClick={() => onAction({ kind: "update", name: a.name })} data-dp-acc-update>{t("Update Account Name / Number", "تحديث اسم / رقم الحساب")}</button>}
      {writeDoc && !group && <button type="button" className="btn-ghost text-xs" onClick={() => onAction({ kind: "confirm", name: a.name, op: "to-group" })} data-dp-acc-to-group>{t("Convert to Group", "تحويل إلى مجموعة")}</button>}
      {writeDoc && group && !a.children.length && !!a.parent && <button type="button" className="btn-ghost text-xs" onClick={() => onAction({ kind: "confirm", name: a.name, op: "to-ledger" })} data-dp-acc-to-ledger>{t("Convert to Non-Group", "تحويل إلى غير مجموعة")}</button>}
      {writeDoc && <button type="button" className="btn-ghost text-xs" onClick={() => onAction({ kind: "move", name: a.name })} data-dp-acc-move>{t("Move to…", "نقل إلى…")}</button>}
      {canDelete && can("Account", "delete", d, user) && <button type="button" className="btn-ghost text-xs text-destructive" onClick={() => onAction({ kind: "confirm", name: a.name, op: "delete" })} data-dp-acc-delete>{t("Delete", "حذف")}</button>}
    </div>}
    {glReadable && <div className="mt-3 border-t border-border pt-2" data-dp-acc-ledger-preview>
      <p className="mb-1 text-xs font-semibold text-muted-foreground">{t("Latest ledger entries", "أحدث قيود الدفتر")}</p>
      {!recent.length ? <p className="text-xs text-muted-foreground">{t("No posted entries for this account.", "لا توجد قيود مرحّلة لهذا الحساب.")}</p>
        : <ul className="space-y-1 text-xs">{recent.map((g) => <li key={g.name} className="flex items-center justify-between gap-2">
          <span className="min-w-0 truncate"><span className="text-muted-foreground" data-no-i18n>{String(g["posting_date"])}</span> · <Link to="/app/$app/$doctype/$name" params={{ app: appOf(String(g["voucher_type"])), doctype: slug(String(g["voucher_type"])), name: String(g["voucher_no"]) }} className="text-primary hover:underline" data-no-i18n data-dp-acc-preview-voucher>{String(g["voucher_no"])}</Link></span>
          <span className="tabular-nums" data-no-i18n>{Number(g["debit"]) ? `${fmtCurrency(Number(g["debit"]), coCur)} ${ar ? "م" : "Dr"}` : `${fmtCurrency(Number(g["credit"]), coCur)} ${ar ? "د" : "Cr"}`}</span></li>)}</ul>}
    </div>}
  </section>;
}

const ACCOUNT_TYPES = (): string[] => { const f = cachedMeta("Account")?.fields.find((x) => x.fieldname === "account_type"); return String(f?.options ?? "").split("\n"); };

function AddDialog({ open, parent, company, groups, ar, error, onClose, onSubmit }: { error: string; open: boolean; parent?: string | undefined; company: string; groups: string[]; ar: boolean; onClose: () => void; onSubmit: (v: { account_name: string; account_number: string; is_group: boolean; root_type: string; account_type: string; tax_rate: number; account_currency: string; parent_account?: string | undefined }) => boolean }) {
  const t = (en: string, arabic: string) => (ar ? arabic : en);
  const [v, setV] = useState({ account_name: "", account_number: "", is_group: false, root_type: "", account_type: "", tax_rate: 0, account_currency: "", parent_account: parent ?? "" });
  useEffect(() => { if (open) setV({ account_name: "", account_number: "", is_group: false, root_type: "", account_type: "", tax_rate: 0, account_currency: "", parent_account: parent ?? "" }); }, [open, parent]);
  const currencies = scopedList("Currency").filter((c) => c["enabled"] === undefined || Number(c["enabled"])).map((c) => c.name).sort();
  return <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
    <DialogContent data-dp-coa-add-dialog>
      <DialogHeader><DialogTitle>{v.parent_account ? t("Add Child", "إضافة حساب فرعي") : t("Add Account", "إضافة حساب")}</DialogTitle>
        <DialogDescription>{t("Name of new Account. Note: Please don't create accounts for Customers and Suppliers", "اسم الحساب الجديد. ملاحظة: لا تنشئ حسابات للعملاء والموردين")}</DialogDescription></DialogHeader>
      <form className="grid gap-3" onSubmit={(e) => { e.preventDefault(); onSubmit({ ...v, parent_account: v.parent_account || undefined }); }}>
        <label className="grid gap-1 text-sm"><span>{t("Parent Account", "الحساب الرئيسي")}</span><select className="field-input" value={v.parent_account} onChange={(e) => setV({ ...v, parent_account: e.target.value })} data-dp-coa-f="parent_account" data-no-i18n><option value="">{t("— Root (no parent) —", "— جذر (بدون رئيسي) —")}</option>{groups.map((g) => <option key={g} value={g}>{g}</option>)}</select></label>
        <label className="grid gap-1 text-sm"><span>{t("New Account Name", "اسم الحساب الجديد")} *</span><input required className="field-input" value={v.account_name} onChange={(e) => setV({ ...v, account_name: e.target.value })} data-dp-coa-f="account_name" /></label>
        <label className="grid gap-1 text-sm"><span>{t("Account Number", "رقم الحساب")}</span><input className="field-input" value={v.account_number} onChange={(e) => setV({ ...v, account_number: e.target.value })} data-dp-coa-f="account_number" data-no-i18n /><span className="text-[11px] text-muted-foreground">{t("Number of new Account, it will be included in the account name as a prefix", "رقم الحساب الجديد، يُضاف إلى اسم الحساب كبادئة")}</span></label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={v.is_group} onChange={(e) => setV({ ...v, is_group: e.target.checked, root_type: e.target.checked ? v.root_type : "" })} data-dp-coa-f="is_group" /><span>{t("Is Group", "مجموعة")}</span></label>
        {v.is_group && !v.parent_account && <label className="grid gap-1 text-sm"><span>{t("Root Type", "النوع الأساسي")}</span><select className="field-input" value={v.root_type} onChange={(e) => setV({ ...v, root_type: e.target.value })} data-dp-coa-f="root_type"><option value=""></option>{ROOTS.map((r) => <option key={r} value={r}>{ar ? ROOTS_AR[r] : r}</option>)}</select></label>}
        <label className="grid gap-1 text-sm"><span>{t("Account Type", "نوع الحساب")}</span><select className="field-input" value={v.account_type} onChange={(e) => setV({ ...v, account_type: e.target.value })} data-dp-coa-f="account_type">{ACCOUNT_TYPES().map((o) => <option key={o} value={o}>{o}</option>)}</select></label>
        {!v.is_group && v.account_type === "Tax" && <label className="grid gap-1 text-sm"><span>{t("Tax Rate", "نسبة الضريبة")}</span><input type="number" step="0.01" className="field-input" value={v.tax_rate} onChange={(e) => setV({ ...v, tax_rate: Number(e.target.value) })} data-dp-coa-f="tax_rate" /></label>}
        <label className="grid gap-1 text-sm"><span>{t("Currency", "العملة")}</span><select className="field-input" value={v.account_currency} onChange={(e) => setV({ ...v, account_currency: e.target.value })} data-dp-coa-f="account_currency" data-no-i18n><option value="">{t("Company currency", "عملة الشركة")}</option>{currencies.map((c) => <option key={c}>{c}</option>)}</select></label>
        <p className="text-[11px] text-muted-foreground" data-no-i18n>{company}</p>
        {error && <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive" data-dp-coa-error>{error}</p>}
        <DialogFooter><button type="button" className="btn-ghost" onClick={onClose}>{t("Cancel", "إلغاء")}</button><button type="submit" className="btn-primary" data-dp-coa-create>{t("Create New", "إنشاء")}</button></DialogFooter>
      </form>
    </DialogContent>
  </Dialog>;
}

function UpdateDialog({ acc, ar, error, onClose, onSubmit }: { error: string; acc: Record<string, unknown> | undefined; ar: boolean; onClose: () => void; onSubmit: (name: string, num: string) => boolean }) {
  const t = (en: string, arabic: string) => (ar ? arabic : en);
  const [nm, setNm] = useState(String(acc?.["account_name"] ?? "")); const [num, setNum] = useState(String(acc?.["account_number"] ?? ""));
  return <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}><DialogContent data-dp-coa-update-dialog>
    <DialogHeader><DialogTitle>{t("Update Account Number / Name", "تحديث رقم / اسم الحساب")}</DialogTitle><DialogDescription data-no-i18n>{String(acc?.["name"] ?? "")}</DialogDescription></DialogHeader>
    <form className="grid gap-3" onSubmit={(e) => { e.preventDefault(); onSubmit(nm, num); }}>
      <label className="grid gap-1 text-sm"><span>{t("Account Name", "اسم الحساب")} *</span><input required className="field-input" value={nm} onChange={(e) => setNm(e.target.value)} data-dp-coa-f="update_name" /></label>
      <label className="grid gap-1 text-sm"><span>{t("Account Number", "رقم الحساب")}</span><input className="field-input" value={num} onChange={(e) => setNum(e.target.value)} data-dp-coa-f="update_number" data-no-i18n /></label>
      {error && <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive" data-dp-coa-error>{error}</p>}
        <DialogFooter><button type="button" className="btn-ghost" onClick={onClose}>{t("Cancel", "إلغاء")}</button><button type="submit" className="btn-primary" data-dp-coa-update-submit>{t("Update", "تحديث")}</button></DialogFooter>
    </form>
  </DialogContent></Dialog>;
}

function MoveDialog({ name, groups, ar, error, onClose, onSubmit }: { error: string; name: string; groups: string[]; ar: boolean; onClose: () => void; onSubmit: (parent: string) => boolean }) {
  const t = (en: string, arabic: string) => (ar ? arabic : en);
  const [p, setP] = useState("");
  return <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}><DialogContent data-dp-coa-move-dialog>
    <DialogHeader><DialogTitle>{t("Move to…", "نقل إلى…")}</DialogTitle><DialogDescription data-no-i18n>{name}</DialogDescription></DialogHeader>
    <form className="grid gap-3" onSubmit={(e) => { e.preventDefault(); if (p) onSubmit(p); }}>
      <label className="grid gap-1 text-sm"><span>{t("New Parent", "الحساب الرئيسي الجديد")}</span><select required className="field-input" value={p} onChange={(e) => setP(e.target.value)} data-dp-coa-f="new_parent" data-no-i18n><option value=""></option>{groups.map((g) => <option key={g}>{g}</option>)}</select></label>
      {error && <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive" data-dp-coa-error>{error}</p>}
        <DialogFooter><button type="button" className="btn-ghost" onClick={onClose}>{t("Cancel", "إلغاء")}</button><button type="submit" className="btn-primary" disabled={!p} data-dp-coa-move-submit>{t("Move", "نقل")}</button></DialogFooter>
    </form>
  </DialogContent></Dialog>;
}

function ConfirmDialog({ op, name, ar, error, onClose, onConfirm }: { error: string; op: "delete" | "to-group" | "to-ledger"; name: string; ar: boolean; onClose: () => void; onConfirm: () => boolean }) {
  const t = (en: string, arabic: string) => (ar ? arabic : en);
  const title = op === "delete" ? t("Delete account?", "حذف الحساب؟") : op === "to-group" ? t("Convert to Group?", "التحويل إلى مجموعة؟") : t("Convert to Non-Group?", "التحويل إلى غير مجموعة؟");
  return <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}><DialogContent data-dp-coa-confirm={op}>
    <DialogHeader><DialogTitle>{title}</DialogTitle><DialogDescription><bdi data-no-i18n>{name}</bdi> · {op === "delete" ? t("Permanently delete this account? Accounts with transactions or child accounts cannot be deleted.", "حذف هذا الحساب نهائياً؟ لا يمكن حذف الحسابات التي لها حركات أو حسابات فرعية.") : t("The change follows the native account rules and is refused if transactions exist.", "يخضع التغيير لقواعد الحساب الأصلية ويُرفض إذا وُجدت حركات.")}</DialogDescription></DialogHeader>
    {error && <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive" data-dp-coa-error>{error}</p>}
        <DialogFooter><button type="button" className="btn-ghost" onClick={onClose}>{t("Cancel", "إلغاء")}</button><button type="button" className={op === "delete" ? "btn-primary bg-destructive" : "btn-primary"} onClick={() => onConfirm()} data-dp-coa-confirm-yes>{op === "delete" ? t("Delete", "حذف") : t("Convert", "تحويل")}</button></DialogFooter>
  </DialogContent></Dialog>;
}
