/**
 * DIGIT Pro policy surfaces: the approval path on draft documents (S5 + the SL8/PU8/PU15 defaults it applies) and the
 * approval inbox (E4 executive home, PUR-017 purchasing). Both read policyDefaults.ts, the same rules the submit applies.
 */
import { Link } from "@tanstack/react-router";
import { DateInput } from "@/components/form/DateInput";
import { useState } from "react";
import { QuickLink } from "@/components/enterprise/QuickView";
import { useQuery } from "@tanstack/react-query";
import { runtimeContractQuery } from "@/lib/runtimeContract";
import { useScopeMetas } from "@/lib/scope";
import { toast } from "sonner";
import { adapter, useStoreVersion, type Doc } from "@/lib/adapter";
import { cachedMeta } from "@/lib/catalog";
import { submitDocument } from "@/lib/documentApi";
import { applyWorkflow } from "@/lib/workflow";
import { hasPerm, useSessionUser } from "@/lib/session";
import { fmtCurrency } from "@/lib/format";
import { useLang, t as tr } from "@/i18n";
import { approvalPath, canSeeMargin, discountLines, heldReferences, INBOX_DOCTYPES, lineMargins, SELLING_POLICY_DOCS, threeWayIssues, unmatchedReferences, type Bi, type InboxItem } from "./policyDefaults";
import { actOn, activeDelegationsTo, bulkAction, bulkApprove, delegations, endDelegation, setDelegation, underThreshold, unifiedInbox, type DelegatedItem } from "./approvalDelegation";

const slug = (dt: string) => dt.toLowerCase().replace(/ /g, "_");
const bi = (ar: boolean, x: Bi) => (ar ? x[1] : x[0]);
const ROLE_AR: Record<string, string> = { "Sales Manager": "مدير المبيعات", "Accounts Manager": "مدير الحسابات", "Purchase Manager": "مدير المشتريات" };
const role = (ar: boolean, r: string) => (ar ? ROLE_AR[r] ?? tr(r) : r);
const docLink = (dt: string, name: string) => <QuickLink doctype={dt} name={name} />;

/** Approval path of a draft (Workflow when configured, otherwise the policy gates + submit roles). */
export function ApprovalPathPanel({ doctype, doc }: { doctype: string; doc: Doc }) {
  useStoreVersion();
  const ar = useLang() === "ar"; const user = useSessionUser();
  const t = (en: string, a: string) => (ar ? a : en);
  if (Number(doc.docstatus ?? 0) !== 0) return null;
  const path = approvalPath(doctype, doc, user);
  const selling = (SELLING_POLICY_DOCS as readonly string[]).includes(doctype);
  const disc = selling ? discountLines(doc) : null;
  const margins = selling && canSeeMargin(user) ? lineMargins(doc) : [];
  const held = doctype === "Payment Entry" ? heldReferences(doc) : [];
  const unmatched = doctype === "Payment Entry" ? unmatchedReferences(doc) : [];
  return <section className="dp-card" data-dp-approval-path={path.source} aria-label={t("Approval path", "مسار الاعتماد")}>
    <div className="flex flex-wrap items-center gap-2">
      <h3 className="font-semibold">{t("Approval path", "مسار الاعتماد")}</h3>
      <span className="chip bg-muted text-[11px]">{path.source === "workflow" ? t("Configured workflow", "سير العمل المهيأ") : t("Default approval rules", "قواعد الاعتماد الافتراضية")}</span>
    </div>
    <ol className="mt-2 grid gap-1.5 text-sm">{path.steps.map((st, i) => <li key={i} className="flex flex-wrap items-center gap-2" data-dp-path-step={bi(false, st.label)} data-you={st.you ? "1" : "0"}>
      <span className="grid size-6 place-items-center rounded-full bg-muted text-xs tabular-nums" aria-hidden data-no-i18n>{i + 1}</span>
      <span className="font-medium">{bi(ar, st.label)}</span>
      {st.state && <span className="text-xs text-muted-foreground" data-no-i18n>{st.state}</span>}
      <span className="text-xs text-muted-foreground">{st.roles.length ? st.roles.map((r) => role(ar, r)).join(ar ? "، " : ", ") : t("Nobody until resolved", "لا أحد حتى تتم المعالجة")}</span>
      <span className={`chip text-[11px] ${st.you ? "bg-primary/10 text-primary" : "bg-muted"}`}>{st.you ? t("You can", "يمكنك") : t("Needs another role", "يحتاج دورًا آخر")}</span>
      {st.reason && <span className="w-full ps-8 text-xs text-muted-foreground">{bi(ar, st.reason)}</span>}
    </li>)}</ol>
    {disc && (disc.lines.length > 0 || disc.header) && <p className="mt-2 text-xs text-muted-foreground" data-dp-discount-lines={disc.lines.length}>
      {disc.header ? t("A document discount is applied. ", "يوجد خصم على المستند. ") : ""}{disc.lines.length > 0 && <>{t("Discounted lines:", "البنود المخصومة:")} <bdi data-no-i18n>{disc.lines.map((l) => `#${l.idx} ${l.item} (${l.discountPct}%)`).join(" · ")}</bdi></>}
    </p>}
    {margins.length > 0 && <div className="mt-2 overflow-x-auto" data-dp-margins>
      <table className="dp-cc-table text-xs"><thead><tr><th scope="col">{t("Line", "البند")}</th><th scope="col">{t("Rate", "السعر")}</th><th scope="col">{t("Valuation", "التقييم")}</th><th scope="col">{t("Margin", "الهامش")}</th></tr></thead>
        <tbody>{margins.map((m) => <tr key={m.idx} data-dp-margin-row={m.idx}><td data-no-i18n>#{m.idx} {m.item}</td><td className="tabular-nums" data-no-i18n>{m.rate}</td><td className="tabular-nums" data-no-i18n>{m.cost ?? "—"}</td>
          <td className={`tabular-nums ${m.marginPct !== null && m.marginPct < 0 ? "text-destructive" : ""}`} data-no-i18n>{m.marginPct === null ? "—" : `${m.marginPct}%`}</td></tr>)}</tbody></table>
      <p className="mt-1 text-[11px] text-muted-foreground">{t("Margin is shown to Sales Managers only.", "يظهر الهامش لمديري المبيعات فقط.")}</p>
    </div>}
    {(held.length > 0 || unmatched.length > 0) && <ul className="mt-2 grid gap-1 text-xs" data-dp-payment-blocks>
      {held.map((x) => <li key={`h-${x}`} data-dp-held={x}>{docLink("Purchase Invoice", x)} — {t("on hold until its release date", "معلّقة حتى تاريخ الإفراج")}</li>)}
      {unmatched.map((x) => { const is = threeWayIssues(adapter.get("Purchase Invoice", x)); return <li key={`m-${x}`} data-dp-unmatched={x}>{docLink("Purchase Invoice", x)} — {is.map((i) => <bdi key={i.idx} data-no-i18n>#{i.idx} {i.item}: {i.kind === "over_received" ? `${i.billedQty} > ${i.receivedQty}` : `${i.rate} > ${i.orderRate}`} </bdi>)}
        <span className="text-muted-foreground">{t("(billed beyond receipt or above the order rate)", "(مفوتر بأكثر من المستلم أو بأعلى من سعر الأمر)")}</span></li>; })}
    </ul>}
  </section>;
}

/** Approval inbox: documents waiting for the current user, with their native workflow action or Approve & submit. */
export function ApprovalInbox({ company, doctypes = INBOX_DOCTYPES as unknown as string[], id = "exec" }: { company: string; doctypes?: string[]; id?: string }) {
  useStoreVersion();
  const ar = useLang() === "ar"; const user = useSessionUser();
  const t = (en: string, a: string) => (ar ? a : en);
  const [all, setAll] = useState(false); const [busy, setBusy] = useState("");
  // the submit gate needs the DocType metas (permissions) and the runtime contract (virtual lifecycle) loaded, as on the form
  useScopeMetas(doctypes); const rc = useQuery(runtimeContractQuery); const ready = !!rc.data;
  const allowed = (dt: string, p: "read" | "submit", d: Doc) => { const m = cachedMeta(dt); return !!m && hasPerm(m, p, d, user); };
  const items = unifiedInbox(user, company, allowed).filter((i) => doctypes.includes(i.doctype));
  const [max, setMax] = useState(""); const [picked, setPicked] = useState<string[]>([]);
  const keyOf = (i: DelegatedItem) => `${i.doctype}:${i.name}`;
  const bulk = () => { const sel = items.filter((i) => picked.includes(keyOf(i))); if (!sel.length || busy) return; setBusy("bulk");
    try { const r = bulkApprove(sel, user); setPicked([]); if (r.failed.length) toast.error(r.failed.map((f) => `${f.key}: ${f.errors.map((e) => tr(e)).join(" ")}`).join("\n")); if (r.done.length) toast.success(t(`${r.done.length} approved`, `اعتُمد ${r.done.length}`)); } finally { setBusy(""); } };
  const shown = all ? items : items.slice(0, 6);
  const act = (i: InboxItem, action: string) => {
    if (busy) return; setBusy(`${i.doctype}:${i.name}`);
    try {
      const m = cachedMeta(i.doctype);
      const errs = !m ? [`${i.doctype} is not loaded`] : actOn(i, action, user);
      if (errs.length) toast.error(errs.map((e) => tr(e)).join("\n")); else toast.success(t(`${i.name} submitted`, `اعتُمد ${i.name}`));
    } finally { setBusy(""); }
  };
  return <section className="dp-cc-panel" data-dp-approval-inbox={id} data-count={items.length}>
    <header className="dp-cc-panel-h flex-wrap"><h3>{t("Approvals for you", "اعتمادات بانتظارك")}</h3><b className="ms-auto tabular-nums" data-no-i18n>{items.length}</b>
      <span className="dp-cc-note w-full">{t("Workflow steps you can take, and drafts held by an approval rule your role releases.", "خطوات سير عمل يمكنك تنفيذها، ومسودات أوقفتها قاعدة اعتماد يفرج عنها دورك.")}</span></header>
    {!items.length ? <p className="p-4 text-sm text-muted-foreground" data-dp-inbox-empty>{t("Nothing is waiting for your approval.", "لا شيء بانتظار اعتمادك.")}</p>
      : <ul className="grid gap-1 p-2">{shown.map((i) => { const key = `${i.doctype}:${i.name}`; return <li key={key} className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-card px-3 py-2" data-dp-inbox-item={key} data-kind={i.kind} {...(i.onBehalfOf ? { "data-dp-on-behalf": i.onBehalfOf } : {})}>
        {bulkAction(i) && <input type="checkbox" aria-label={t(`Select ${i.name}`, `تحديد ${i.name}`)} checked={picked.includes(key)} onChange={(e) => setPicked((p) => e.target.checked ? [...p, key] : p.filter((x) => x !== key))} data-dp-inbox-pick={key} />}
        {i.onBehalfOf && <span className="chip bg-primary/10 text-[11px] text-primary">{t("On behalf of", "نيابة عن")} <bdi data-no-i18n>{i.onBehalfOf}</bdi></span>}
        <span className="min-w-0 flex-1"><span className="block text-xs text-muted-foreground">{tr(i.doctype)} · {bi(ar, i.reason)}{i.state ? <> · <bdi data-no-i18n>{i.state}</bdi></> : null}</span>
          {docLink(i.doctype, i.name)} <span className="text-xs text-muted-foreground" data-no-i18n>{i.party}</span></span>
        {i.amount > 0 && <span className="text-xs tabular-nums" data-no-i18n>{fmtCurrency(i.amount, i.currency || undefined)}</span>}
        {i.actions.map((a) => <button key={a} type="button" className="btn-primary min-h-9 text-xs" disabled={!ready || busy === key} onClick={() => act(i, a)} data-dp-inbox-action={a}>{a === "Approve & submit" ? t("Approve & submit", "اعتماد وترحيل") : tr(a)}</button>)}
      </li>; })}</ul>}
    {items.some((i) => bulkAction(i)) && <div className="flex flex-wrap items-center gap-2 border-t border-border p-2 text-xs" data-dp-inbox-bulk>
      <label className="flex items-center gap-1">{t("Up to amount", "حتى مبلغ")}<input className="field-input w-28" inputMode="decimal" dir="ltr" value={max} onChange={(e) => setMax(e.target.value)} data-dp-inbox-max /></label>
      <button type="button" className="btn-ghost min-h-9" onClick={() => setPicked(underThreshold(items, Number(max)).map(keyOf))} disabled={max === "" || !Number.isFinite(Number(max))} data-dp-inbox-select-max>{t("Select up to amount", "تحديد حتى المبلغ")}</button>
      <button type="button" className="btn-primary min-h-9" disabled={!picked.length || !ready || !!busy} onClick={bulk} data-dp-inbox-bulk-approve>{t(`Approve selected (${picked.length})`, `اعتماد المحدد (${picked.length})`)}</button>
    </div>}
    <DelegationBar user={user} />
    {items.length > 6 && <div className="border-t border-border p-2"><button type="button" className="btn-ghost w-full text-xs" aria-expanded={all} onClick={() => setAll((v) => !v)}>{all ? t("Show fewer", "عرض أقل") : t(`Show all (${items.length})`, `عرض الكل (${items.length})`)}</button></div>}
  </section>;
}

/** S4 delegation: hand my approvals to another user for a date range (the actions run with my rights and are logged). */
function DelegationBar({ user }: { user: string }) {
  useStoreVersion();
  const ar = useLang() === "ar"; const t = (en: string, a: string) => (ar ? a : en);
  const mine = delegations().find((d) => d.delegator === user && d.enabled);
  const toMe = activeDelegationsTo(user);
  const users = adapter.list("User").filter((u) => u.name !== user && u.name !== "Guest" && Number(u["enabled"] ?? 1));
  const [to, setTo] = useState(""); const [from, setFrom] = useState(new Date().toISOString().slice(0, 10)); const [till, setTill] = useState("");
  return <div className="grid gap-2 border-t border-border p-2 text-xs" data-dp-delegation>
    {toMe.length > 0 && <p data-dp-delegated-to-me>{t("You act on behalf of:", "تعمل نيابة عن:")} <bdi data-no-i18n>{toMe.map((d) => d.delegator).join(", ")}</bdi></p>}
    {mine ? <p className="flex flex-wrap items-center gap-2" data-dp-my-delegation={mine.delegate}>{t("Your approvals are delegated to", "اعتماداتك مفوضة إلى")} <bdi data-no-i18n>{mine.delegate}</bdi> <bdi data-no-i18n>{mine.from_date} → {mine.to_date || "…"}</bdi>
      <button type="button" className="btn-ghost min-h-8" onClick={() => endDelegation(user)} data-dp-delegation-end>{t("End delegation", "إنهاء التفويض")}</button></p>
    : <div className="flex flex-wrap items-end gap-2">
      <label className="grid gap-0.5">{t("Delegate my approvals to", "فوّض اعتماداتي إلى")}<select className="field-input" value={to} onChange={(e) => setTo(e.target.value)} data-dp-delegation-user data-no-i18n><option value="">—</option>{users.map((u) => <option key={u.name} value={u.name}>{String(u["full_name"] || u.name)}</option>)}</select></label>
      <label className="grid gap-0.5">{t("From", "من")}<DateInput className="field-input" value={from} onChange={(e) => setFrom(e.target.value)} data-dp-delegation-from /></label>
      <label className="grid gap-0.5">{t("To", "إلى")}<DateInput className="field-input" value={till} onChange={(e) => setTill(e.target.value)} data-dp-delegation-to /></label>
      <button type="button" className="btn-ghost min-h-9" disabled={!to} onClick={() => { const e = setDelegation(user, to, from, till); if (e.length) toast.error(e.map((x) => tr(x)).join("\n")); else toast.success(t("Delegation saved", "حُفظ التفويض")); }} data-dp-delegation-save>{t("Delegate", "تفويض")}</button>
    </div>}
  </div>;
}
