/**
 * DIGIT Enterprise shared trade panels and the marketplace orders screen (owner gap list A14, A38, A43, B04, B09, B11):
 * quick process (deliver + invoice / receive + bill in one confirmed step), customer hold, blanket order close / re-open
 * per order and per line, drop-ship ordering and "delivered by supplier", the compare-first ledger repost, and channel
 * orders from Salla, Zid, Amazon.sa and Noon. Logic lives in src/lib/coreShared (quickProcess, customerHold,
 * blanketOrders, dropShip, ledgerRepost, channelOrders); every app gets these panels on the native forms.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { adapter, useStoreVersion, type Doc } from "@/lib/adapter";
import { cachedMeta, type DocTypeMeta } from "@/lib/catalog";
import { formActionsQuery } from "@/lib/engines";
import { formRulesQuery } from "@/lib/formRules";
import { canReadType, useScopeMetas } from "@/lib/scope";
import { hasPerm, useSessionUser } from "@/lib/session";
import { fmtCurrency } from "@/lib/format";
import { featureOn } from "@/lib/coreShared/features";
import { QUICK_FEATURE, quickPlan, runQuickProcess } from "@/lib/coreShared/quickProcess";
import { customerHold, HOLD_BLOCKED_DOCS } from "@/lib/coreShared/customerHold";
import { blanketState, mayChangeBlanket, setBlanketClosed, setBlanketRowClosed } from "@/lib/coreShared/blanketOrders";
import { deliverDropShip, dropShipLines, makeDropShipOrders, mayDeliverDropShip } from "@/lib/coreShared/dropShip";
import { ledgerCheck, mayRepost, repostLedger, REPOST_TYPES, type LedgerCheck } from "@/lib/coreShared/ledgerRepost";
import { CHANNEL_DT, CHANNEL_LABEL, channelOrders, channelSummary, convertChannelOrder, fetchChannelOrders, mayConvert, rejectChannelOrder } from "@/lib/coreShared/channelOrders";
import { CORE_DT } from "@/lib/coreShared/doctypes";
import { bookedJournal, bookExchangeDifference, exchangeLines, mayBookExchange } from "@/lib/coreShared/exchangeDiff";
import { EntDialog, EntFrame } from "./Surfaces";
import { Bar, CompanySelect, Denied, DocLink, Field, Kpi, Table, tr, useCompany, useT } from "./FinanceDesk";

type Bi = [string, string];
const n = (v: unknown) => Number(v) || 0;
const s = (v: unknown) => String(v ?? "");
const say = (ar: boolean, b: Bi) => (ar ? b[1] : b[0]);
const DT_AR: Record<string, string> = { "Delivery Note": "إذن تسليم", "Sales Invoice": "فاتورة مبيعات", "Purchase Receipt": "إيصال استلام", "Purchase Invoice": "فاتورة مشتريات", "Purchase Order": "أمر شراء", "Sales Order": "أمر بيع" };
const dtName = (ar: boolean, dt: string) => (ar ? DT_AR[dt] ?? dt : dt);

/* ------------------------------------------------------------------ quick process (A14 / D8) ------------------------------------------------------------------ */
export function QuickProcessPanel({ doctype, doc }: { doctype: "Sales Order" | "Purchase Order"; doc: Doc }) {
  useStoreVersion(); const { ar, t } = useT(); const user = useSessionUser();
  const actions = useQuery(formActionsQuery); const rules = useQuery(formRulesQuery);
  const [open, setOpen] = useState(false); const [busy, setBusy] = useState(false); const [done, setDone] = useState<{ doctype: string; name: string }[]>([]);
  const plan = quickPlan(doctype, doc, user);
  if (!plan.applicable && !done.length) return null;
  const sales = doctype === "Sales Order";
  const title = sales ? t("Deliver and invoice in one step", "التسليم والفوترة بخطوة واحدة") : t("Receive and bill in one step", "الاستلام والفوترة بخطوة واحدة");
  const run = () => {
    if (!actions.data || !rules.data) return;
    setBusy(true);
    const r = runQuickProcess(doctype, doc.name, actions.data, rules.data, user);
    setBusy(false); setOpen(false);
    if (r.ok) { setDone(r.created); toast.success(r.created.map((c) => `${dtName(ar, c.doctype)} ${c.name}`).join(" · ")); }
    else toast.error(r.errors.join("\n"));
  };
  return <EntFrame id="quick-process" title={title}
    note={sales ? t("Makes the delivery note and the sales invoice for everything still open, submits both and posts stock and ledger — the same documents you would make by hand.", "يُنشئ إذن التسليم وفاتورة المبيعات لكل ما تبقّى، ويعتمدهما ويرحّل المخزون والقيود — نفس المستندات التي تُنشئها يدويًا.")
      : t("Makes the purchase receipt and the supplier invoice for everything still open, submits both and posts stock and ledger.", "يُنشئ إيصال الاستلام وفاتورة المورد لكل ما تبقّى، ويعتمدهما ويرحّل المخزون والقيود.")}
    actions={plan.applicable ? <button type="button" className="btn-primary" disabled={!plan.ok || !actions.data || !rules.data} onClick={() => setOpen(true)} data-quick-process-open>{sales ? t("Deliver and invoice", "تسليم وفوترة") : t("Receive and bill", "استلام وفوترة")}</button> : undefined}>
    <ol className="flex flex-wrap items-center gap-2 text-sm" data-quick-steps={plan.steps.length}>
      {plan.steps.map((st, i) => <li key={st.target} className="ent-frame flex items-center gap-2 px-2 py-1" data-quick-step={st.target} data-allowed={st.allowed ? 1 : 0}>
        <span className="grid h-6 w-6 place-items-center rounded-full bg-primary text-xs font-bold text-primary-foreground" data-no-i18n>{i + 1}</span>
        <span>{say(ar, st.label)} · {dtName(ar, st.target)}</span>{i === 0 && <span className="text-xs text-muted-foreground">{ar ? `${st.lines} سطر` : `${st.lines} line(s)`}</span>}
      </li>)}
    </ol>
    {plan.reasons.map((r, i) => <p key={i} className="mt-1 text-sm text-destructive" data-quick-reason>{say(ar, r)}</p>)}
    {!!done.length && <p className="mt-2 flex flex-wrap gap-2 text-sm" data-quick-done={done.length}><span className="ent-mint-chip">{t("Done", "تم")}</span>{done.map((c) => <DocLink key={c.name} dt={c.doctype} name={c.name} />)}</p>}
    <EntDialog open={open} onOpenChange={setOpen} id="quick-process" title={title} description={t(`This creates and submits ${plan.steps.map((x) => x.target).join(" and ")} for ${doc.name}. If any step is refused, nothing is kept.`, `سيُنشأ ويُعتمد ${plan.steps.map((x) => dtName(true, x.target)).join(" ثم ")} للمستند ${doc.name}. إذا رُفضت أي خطوة لا يُحفظ شيء.`)}
      footer={<><button type="button" className="btn-ghost" onClick={() => setOpen(false)}>{t("Cancel", "إلغاء")}</button><button type="button" className="btn-primary" disabled={busy} onClick={run} data-quick-process-confirm>{t("Confirm", "تأكيد")}</button></>}>
      <p className="text-sm">{t("Quantities and prices come from the order; taxes and totals are recalculated exactly as on the form.", "الكميات والأسعار من الأمر؛ وتُعاد حساب الضرائب والإجماليات كما في النموذج.")}</p>
    </EntDialog>
  </EntFrame>;
}

/* ------------------------------------------------------------------ customer hold (B09 / U26F-10) ------------------------------------------------------------------ */
export function CustomerHoldPanel({ customer, doctype }: { customer: string; doctype: string }) {
  useStoreVersion(); const { ar, t } = useT();
  const h = customerHold(customer);
  if (!h.onHold) return null;
  return <EntFrame id="customer-hold" title={h.held ? t("Customer on hold", "العميل موقوف") : t("Hold has ended", "انتهى الإيقاف")}
    note={doctype === "Customer" ? t("Sales orders, delivery notes and sales invoices for this customer cannot be submitted while the hold lasts. Quotations and drafts stay possible.", "لا يمكن اعتماد أوامر البيع وأذون التسليم وفواتير المبيعات لهذا العميل أثناء الإيقاف. العروض والمسودات تبقى ممكنة.")
      : t("This document cannot be submitted until the hold on the customer is released.", "لا يمكن اعتماد هذا المستند حتى يُرفع الإيقاف عن العميل.")}>
    <dl className="grid gap-2 text-sm sm:grid-cols-3" data-customer-hold={h.held ? "held" : "ended"}>
      <div><dt className="text-xs text-muted-foreground">{t("Status", "الحالة")}</dt><dd className={h.held ? "font-semibold text-destructive" : "font-semibold"}>{h.held ? t("On hold", "موقوف") : t("Released", "مرفوع")}</dd></div>
      <div><dt className="text-xs text-muted-foreground">{t("Release date", "تاريخ رفع الإيقاف")}</dt><dd data-no-i18n>{h.release || "—"}</dd></div>
      <div><dt className="text-xs text-muted-foreground">{t("Reason", "السبب")}</dt><dd data-no-i18n>{h.reason || "—"}</dd></div>
    </dl>
    {h.held && <p className="sr-only">{say(ar, h.message)}</p>}
  </EntFrame>;
}

/* ------------------------------------------------------------------ blanket orders (A38) ------------------------------------------------------------------ */
export function BlanketOrderPanel({ doc }: { doc: Doc }) {
  useStoreVersion(); const { ar, t } = useT(); const user = useSessionUser();
  const st = blanketState(doc); const may = mayChangeBlanket(doc, user);
  const act = (r: { ok: true } | { ok: false; reason: Bi }, ok: string) => (r.ok ? toast.success(ok) : toast.error(say(ar, r.reason)));
  return <EntFrame id="blanket-order" title={t("Blanket order lines", "أسطر الأمر الإطاري")}
    note={st.closed ? t("Closed: no new orders can be made against it until it is re-opened.", "مقفل: لا تُنشأ أوامر جديدة عليه حتى يُعاد فتحه.") : st.expired ? t("Expired: the end date has passed.", "منتهي: انقضى تاريخ الانتهاء.") : t("Close a single line or the whole order when no more should be ordered against it.", "أقفل سطرًا واحدًا أو الأمر كله عندما لا يجب طلب المزيد عليه.")}
    actions={may ? <button type="button" className={st.closed ? "btn-primary" : "btn-ghost"} data-blanket-toggle={st.closed ? "reopen" : "close"} onClick={() => act(setBlanketClosed(doc.name, !st.closed, user), st.closed ? t("Blanket order re-opened", "أُعيد فتح الأمر الإطاري") : t("Blanket order closed", "أُقفل الأمر الإطاري"))}>{st.closed ? t("Re-open order", "إعادة فتح الأمر") : t("Close order", "إقفال الأمر")}</button> : undefined}>
    <Table id="blanket-lines" head={[t("Line", "السطر"), t("Item", "الصنف"), t("Quantity", "الكمية"), t("Ordered", "المطلوب"), t("Left", "المتبقي"), t("State", "الحالة"), ""]}>
      {st.lines.map((l) => <tr key={l.idx} className={tr} data-blanket-line={l.idx} data-closed={l.closed ? 1 : 0}>
        <td className="p-2 tabular-nums" data-no-i18n>{l.idx}</td><td className="p-2"><span data-no-i18n>{l.item_name || l.item_code}</span></td>
        <td className="p-2 tabular-nums" data-no-i18n>{l.qty}</td><td className="p-2 tabular-nums" data-no-i18n>{l.ordered}</td><td className="p-2 tabular-nums" data-no-i18n>{l.pending}</td>
        <td className="p-2">{l.closed || st.closed ? <span className="text-muted-foreground">{t("Closed", "مقفل")}</span> : l.pending <= 0 ? t("Fully ordered", "مطلوب بالكامل") : <span className="ent-mint-chip">{t("Open", "مفتوح")}</span>}</td>
        <td className="p-2 text-end">{may && !st.closed && <button type="button" className="btn-ghost min-h-8 text-xs" data-blanket-row={l.closed ? "reopen" : "close"} onClick={() => act(setBlanketRowClosed(doc.name, l.idx, !l.closed, user), l.closed ? t("Line re-opened", "أُعيد فتح السطر") : t("Line closed", "أُقفل السطر"))}>{l.closed ? t("Re-open line", "إعادة فتح السطر") : t("Close line", "إقفال السطر")}</button>}</td>
      </tr>)}
    </Table>
  </EntFrame>;
}

/* ------------------------------------------------------------------ drop-ship (B11) ------------------------------------------------------------------ */
export function DropShipPanel({ doctype, doc }: { doctype: "Sales Order" | "Purchase Order"; doc: Doc }) {
  useStoreVersion(); const { ar, t } = useT(); const user = useSessionUser();
  if (doctype === "Purchase Order") {
    const may = mayDeliverDropShip(doc);
    if (!s(doc["customer"]) || !(doc["items"] as Doc[] | undefined)?.some((r) => n(r["delivered_by_supplier"]))) return null;
    return <EntFrame id="drop-ship" title={t("Supplier delivers to the customer", "المورد يسلّم إلى العميل")}
      note={s(doc["status"]) === "Delivered" ? t("Delivered: the sales order lines are marked delivered.", "سُلّم: عُلّمت أسطر أمر البيع كمُسلّمة.") : t("When the supplier confirms delivery to the customer, mark it here; the sales order lines become delivered and ready to invoice.", "عندما يؤكد المورد التسليم إلى العميل علّمه هنا؛ فتصبح أسطر أمر البيع مُسلّمة وجاهزة للفوترة.")}
      actions={may ? <button type="button" className="btn-primary" data-dropship-deliver onClick={() => { const r = deliverDropShip(doc.name, user); if (r.ok) toast.success(t("Marked delivered", "عُلّم كمُسلّم")); else toast.error(say(ar, r.reason)); }}>{t("Mark delivered to customer", "تعليم كمُسلّم للعميل")}</button> : undefined}>
      <p className="text-sm"><span className="text-muted-foreground">{t("Customer", "العميل")}: </span><bdi data-no-i18n>{s(doc["customer_name"] || doc["customer"])}</bdi></p>
    </EntFrame>;
  }
  const lines = dropShipLines(doc);
  if (!lines.length) return null;
  const todo = lines.filter((l) => !l.po).length; const submitted = n(doc.docstatus) === 1;
  const pm = cachedMeta("Purchase Order"); const may = submitted && !!pm && hasPerm(pm, "create", undefined, user) && todo > 0;
  return <EntFrame id="drop-ship" title={t("Lines the supplier delivers", "أسطر يسلّمها المورد")}
    note={submitted ? t("These lines are not on a delivery note: order them from the supplier, who ships straight to the customer.", "هذه الأسطر لا تدخل في إذن التسليم: اطلبها من المورد الذي يشحن مباشرة إلى العميل.") : t("Submit the order, then order these lines from their supplier.", "اعتمد الأمر ثم اطلب هذه الأسطر من مورّدها.")}
    actions={may ? <button type="button" className="btn-primary" data-dropship-order onClick={() => { const r = makeDropShipOrders(doc.name, user); if (r.ok) toast.success(r.created.join(", ")); else toast.error(say(ar, r.reason)); }}>{t("Order from supplier", "اطلب من المورد")}</button> : undefined}>
    <Table id="drop-ship-lines" head={[t("Line", "السطر"), t("Item", "الصنف"), t("Quantity", "الكمية"), t("Supplier", "المورد"), t("Purchase order", "أمر الشراء"), t("Delivered", "المُسلّم")]}>
      {lines.map((l) => <tr key={l.idx} className={tr} data-dropship-line={l.idx} data-po={l.po || "none"}>
        <td className="p-2 tabular-nums" data-no-i18n>{l.idx}</td><td className="p-2" data-no-i18n>{l.item_name || l.item_code}</td><td className="p-2 tabular-nums" data-no-i18n>{l.qty}</td>
        <td className="p-2" data-no-i18n>{l.supplier || "—"}</td><td className="p-2">{l.po ? <><DocLink dt="Purchase Order" name={l.po} /> <span className="text-xs text-muted-foreground">{l.poStatus === "Draft" ? t("Draft", "مسودة") : l.poStatus === "Delivered" ? t("Delivered", "مُسلّم") : t("Submitted", "معتمد")}</span></> : <span className="text-muted-foreground">{t("Not ordered yet", "لم يُطلب بعد")}</span>}</td>
        <td className="p-2 tabular-nums" data-no-i18n>{l.delivered}</td>
      </tr>)}
    </Table>
  </EntFrame>;
}

/* ------------------------------------------------------------------ compare-first ledger repost (B04 / U26F-05) ------------------------------------------------------------------ */
export function LedgerRepostPanel({ doctype, doc }: { doctype: string; doc: Doc }) {
  useStoreVersion(); const { ar, t } = useT(); const user = useSessionUser();
  const [chk, setChk] = useState<LedgerCheck | null>(null); const [open, setOpen] = useState(false); const [reason, setReason] = useState("");
  const may = mayRepost(user);
  const money = (v: number) => fmtCurrency(v, s(adapter.get("Company", s(doc["company"]))?.["default_currency"]) || "SAR");
  return <EntFrame id="ledger-repost" title={t("Check the ledger of this document", "تحقق من قيود هذا المستند")}
    note={t("Compares the posted ledger lines with what the document should post now. Only an authorised administrator can repost, and only when they differ.", "يقارن قيود الأستاذ المرحّلة بما يجب أن يرحّله المستند الآن. إعادة الترحيل لمسؤول النظام المخوّل فقط وعند وجود فرق.")}
    actions={<button type="button" className="btn-ghost" data-ledger-check onClick={() => setChk(ledgerCheck(doctype, adapter.get(doctype, doc.name)))}>{t("Compare", "قارن")}</button>}>
    {chk && (chk.matches ? <p className="text-sm" data-ledger-match="1"><span className="ent-mint-chip">{t("Ledger matches", "القيود مطابقة")}</span> <span className="text-muted-foreground">{ar ? `${chk.postedCount} سطر مرحّل` : `${chk.postedCount} posted line(s)`}</span></p>
      : <div data-ledger-match="0">
        <Table id="ledger-diff" head={[t("Account", "الحساب"), t("Party", "الطرف"), t("Posted", "المرحّل"), t("Should be", "الصحيح"), t("Difference", "الفرق")]}>
          {chk.rows.filter((r) => Math.abs(r.diff) >= 0.005).map((r) => <tr key={`${r.account}|${r.party}`} className={tr} data-ledger-diff-row={r.account}>
            <td className="p-2" data-no-i18n>{r.account}</td><td className="p-2" data-no-i18n>{r.party || "—"}</td><td className="p-2 tabular-nums" data-no-i18n>{money(r.posted)}</td><td className="p-2 tabular-nums" data-no-i18n>{money(r.expected)}</td><td className="p-2 tabular-nums text-destructive" data-no-i18n>{money(r.diff)}</td></tr>)}
        </Table>
        {may ? <button type="button" className="btn-primary mt-2" data-ledger-repost-open onClick={() => setOpen(true)}>{t("Repost ledger", "إعادة الترحيل")}</button>
          : <p className="mt-2 text-sm text-muted-foreground" data-ledger-repost-denied>{t("Ask an authorised administrator to repost this document.", "اطلب من مسؤول النظام المخوّل إعادة ترحيل هذا المستند.")}</p>}
      </div>)}
    <EntDialog open={open} onOpenChange={setOpen} id="ledger-repost" title={t("Repost the ledger", "إعادة ترحيل القيود")} description={t("The posted lines of this document are replaced by the correct ones. The repost is recorded with your reason.", "تُستبدل القيود المرحّلة لهذا المستند بالقيود الصحيحة. وتُسجّل إعادة الترحيل مع السبب.")}
      footer={<><button type="button" className="btn-ghost" onClick={() => setOpen(false)}>{t("Cancel", "إلغاء")}</button><button type="button" className="btn-primary" data-ledger-repost-confirm onClick={() => { const r = repostLedger(doctype, doc.name, reason, user); if (r.ok) { toast.success(r.record); setOpen(false); setChk(ledgerCheck(doctype, adapter.get(doctype, doc.name))); } else toast.error(say(ar, r.reason)); }}>{t("Repost", "أعد الترحيل")}</button></>}>
      <Field label={t("Reason", "السبب")}><textarea className="field-input" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} data-ledger-repost-reason /></Field>
    </EntDialog>
  </EntFrame>;
}

/* ------------------------------------------------------------------ exchange differences (B06 / U26F-07) ------------------------------------------------------------------ */
export function ExchangeDiffPanel({ doc }: { doc: Doc }) {
  useStoreVersion(); const { ar, t } = useT(); const user = useSessionUser();
  const pe = adapter.get("Payment Entry", doc.name) ?? doc; const lines = exchangeLines(pe); const je = bookedJournal(doc.name); const may = mayBookExchange(user);
  const coCur = s(adapter.get("Company", s(pe["company"]))?.["default_currency"]) || "SAR"; const net = lines.reduce((x, l) => x + l.difference, 0);
  return <EntFrame id="exchange-diff" title={t("Exchange difference", "فرق العملة")}
    note={t("The invoice was booked at one rate and paid at another; the difference in riyals stays on the party account until it is booked as an exchange gain or loss.", "سُجّلت الفاتورة بسعر صرف وسُددت بسعر آخر؛ يبقى الفرق بالريال على حساب الطرف حتى يُسجّل كربح أو خسارة فرق عملة.")}
    actions={!je && may && Math.abs(net) >= 0.005 && n(pe.docstatus) === 1 ? <button type="button" className="btn-primary" data-fx-book onClick={() => { const r = bookExchangeDifference(doc.name, user); if (r.ok) toast.success(r.journal); else toast.error(say(ar, r.reason)); }}>{net >= 0 ? t("Book exchange gain", "تسجيل ربح فرق العملة") : t("Book exchange loss", "تسجيل خسارة فرق العملة")}</button> : undefined}>
    <Table id="exchange-diff" head={[t("Invoice", "الفاتورة"), t("Allocated", "المخصص"), t("Invoice rate", "سعر الفاتورة"), t("Payment rate", "سعر الدفعة"), t("Difference", "الفرق")]}>
      {lines.map((l) => <tr key={`${l.idx}|${l.invoice}`} className={tr} data-fx-line={l.invoice}><td className="p-2"><DocLink dt={l.doctype} name={l.invoice} /></td><td className="p-2 tabular-nums" data-no-i18n>{fmtCurrency(l.allocated, l.currency)}</td>
        <td className="p-2 tabular-nums" data-no-i18n>{l.invoiceRate.toFixed(4)}</td><td className="p-2 tabular-nums" data-no-i18n>{l.paymentRate.toFixed(4)}</td>
        <td className={`p-2 tabular-nums ${l.kind === "loss" ? "text-destructive" : ""}`}><span data-no-i18n>{fmtCurrency(Math.abs(l.difference), coCur)}</span> <span className="text-xs text-muted-foreground">{l.kind === "gain" ? t("gain", "ربح") : l.kind === "loss" ? t("loss", "خسارة") : "—"}</span></td></tr>)}
    </Table>
    <p className="mt-2 text-sm" data-fx-state={je ? "booked" : may ? "open" : "denied"}>{je ? <><span className="ent-mint-chip">{t("Booked", "مسجّل")}</span> <DocLink dt="Journal Entry" name={je.name} /></>
      : !may ? <span className="text-muted-foreground">{t("An accounts user books the exchange difference.", "يسجّل محاسب الحسابات فرق العملة.")}</span> : null}</p>
  </EntFrame>;
}

/* ------------------------------------------------------------------ channel orders (A43 / SEL-013) ------------------------------------------------------------------ */
export function ChannelOrderPanel({ doc }: { doc: Doc }) {
  useStoreVersion(); const { ar, t } = useT(); const user = useSessionUser(); const rules = useQuery(formRulesQuery);
  const [why, setWhy] = useState(""); const [open, setOpen] = useState(false);
  const st = s(doc["status"]) || "New"; const may = mayConvert(user);
  return <EntFrame id="channel-order" title={t("Channel order", "طلب قناة البيع")} note={st === "Converted" ? t("Converted into a sales order.", "حُوّل إلى أمر بيع.") : st === "Rejected" ? t("Rejected.", "مرفوض.") : t("Review the lines and turn the order into a draft sales order, or reject it with a reason.", "راجع الأسطر وحوّل الطلب إلى مسودة أمر بيع، أو ارفضه مع ذكر السبب.")}
    actions={st === "New" && may ? <span className="flex gap-2"><button type="button" className="btn-ghost" onClick={() => setOpen(true)} data-channel-reject-open>{t("Reject", "رفض")}</button>
      <button type="button" className="btn-primary" disabled={!rules.data} data-channel-convert onClick={() => { const r = convertChannelOrder(doc.name, rules.data, user); if (r.ok) toast.success(r.salesOrder); else toast.error(say(ar, r.reason)); }}>{t("Create sales order", "إنشاء أمر بيع")}</button></span> : undefined}>
    <p className="text-sm"><span className="ent-mint-chip" data-no-i18n>{say(ar, CHANNEL_LABEL[s(doc["channel"])] ?? [s(doc["channel"]), s(doc["channel"])])}</span> <bdi data-no-i18n>{s(doc["external_id"])}</bdi>
      {s(doc["sales_order"]) && <> · <DocLink dt="Sales Order" name={s(doc["sales_order"])} /></>}{s(doc["reject_reason"]) && <> · <bdi data-no-i18n>{s(doc["reject_reason"])}</bdi></>}</p>
    <EntDialog open={open} onOpenChange={setOpen} id="channel-reject" title={t("Reject channel order", "رفض طلب القناة")}
      footer={<><button type="button" className="btn-ghost" onClick={() => setOpen(false)}>{t("Cancel", "إلغاء")}</button><button type="button" className="btn-primary" data-channel-reject-confirm onClick={() => { const r = rejectChannelOrder(doc.name, why, user); if (r.ok) { setOpen(false); toast.success(t("Rejected", "رُفض")); } else toast.error(say(ar, r.reason)); }}>{t("Reject", "رفض")}</button></>}>
      <Field label={t("Reason", "السبب")}><textarea className="field-input" rows={2} value={why} onChange={(e) => setWhy(e.target.value)} data-channel-reject-reason /></Field>
    </EntDialog>
  </EntFrame>;
}

export function ChannelOrdersPage() {
  useStoreVersion(); const { ar, t } = useT(); const c = useCompany(); useScopeMetas([CHANNEL_DT, "Sales Order", "Customer"]);
  const rules = useQuery(formRulesQuery); const [chan, setChan] = useState(""); const [status, setStatus] = useState("New");
  if (!canReadType(CHANNEL_DT)) return <Denied />;
  const all = channelOrders(c.company); const sum = channelSummary(c.company);
  const list = all.filter((d) => (!chan || d["channel"] === chan) && (!status || (s(d["status"]) || "New") === status));
  const may = mayConvert(c.user);
  return <div className="space-y-4" data-channel-page>
    <Bar><CompanySelect c={c} />
      <Field label={t("Channel", "القناة")}><select className="field-input" value={chan} onChange={(e) => setChan(e.target.value)} data-channel-filter><option value="">{t("All channels", "كل القنوات")}</option>{["Salla", "Zid", "Amazon.sa", "Noon"].map((x) => <option key={x} value={x}>{say(ar, CHANNEL_LABEL[x]!)}</option>)}</select></Field>
      <Field label={t("Status", "الحالة")}><select className="field-input" value={status} onChange={(e) => setStatus(e.target.value)} data-channel-status><option value="">{t("All", "الكل")}</option><option value="New">{t("New", "جديد")}</option><option value="Converted">{t("Converted", "محوّل")}</option><option value="Rejected">{t("Rejected", "مرفوض")}</option></select></Field>
      <button type="button" className="btn-primary" data-band-primary data-channel-fetch onClick={() => { const r = fetchChannelOrders(c.company); if (r.connected) toast.success(t("Request sent to the marketplace provider", "أُرسل الطلب إلى مزوّد المتاجر")); else toast.message(t("The marketplace provider is not connected yet — the request is waiting in the integration log. Connect it in Administration ▸ Integrations.", "مزوّد المتاجر غير متصل بعد — الطلب بانتظار المزوّد في سجل التكامل. اربطه من الإدارة ▸ التكاملات.")); }}>{t("Fetch new orders", "جلب الطلبات الجديدة")}</button>
    </Bar>
    <div className="flex flex-wrap gap-3">{sum.map((x) => <Kpi key={x.channel} id={`channel-${x.channel}`} label={say(ar, CHANNEL_LABEL[x.channel] ?? [x.channel, x.channel])} value={String(x.fresh)} sub={`${t("new", "جديد")} · ${fmtCurrency(x.value, c.currency)} · ${t("converted", "محوّل")} ${x.converted}`} />)}</div>
    <EntFrame id="channel-orders" title={t("Marketplace orders", "طلبات المتاجر الإلكترونية")} note={t("Orders from Salla, Zid, Amazon.sa and Noon. Turn each into a draft sales order or reject it.", "طلبات سلة وزد وأمازون السعودية ونون. حوّل كل طلب إلى مسودة أمر بيع أو ارفضه.")}>
      {!list.length ? <p className="text-sm text-muted-foreground" data-channel-empty>{t("No channel orders match.", "لا توجد طلبات مطابقة.")}</p> :
        <Table id="channel-orders" head={[t("Channel", "القناة"), t("Order ID", "رقم الطلب"), t("Ordered on", "تاريخ الطلب"), t("Buyer", "المشتري"), t("Lines", "الأسطر"), t("Total", "الإجمالي"), t("Status", "الحالة"), ""]}>
          {list.map((d) => { const st = s(d["status"]) || "New"; return <tr key={d.name} className={tr} data-channel-row={d.name} data-status={st}>
            <td className="p-2">{say(ar, CHANNEL_LABEL[s(d["channel"])] ?? [s(d["channel"]), s(d["channel"])])}</td><td className="p-2"><DocLink dt={CORE_DT.channelOrder} name={d.name}>{s(d["external_id"])}</DocLink></td>
            <td className="p-2 tabular-nums" data-no-i18n>{s(d["ordered_on"]).slice(0, 16)}</td><td className="p-2" data-no-i18n>{s(d["buyer_name"])}</td><td className="p-2 tabular-nums" data-no-i18n>{(d["items"] as unknown[] | undefined)?.length ?? 0}</td>
            <td className="p-2 tabular-nums" data-no-i18n>{fmtCurrency(n(d["total"]), c.currency)}</td>
            <td className="p-2">{st === "Converted" ? <DocLink dt="Sales Order" name={s(d["sales_order"])} /> : st === "Rejected" ? <span className="text-muted-foreground" title={s(d["reject_reason"])}>{t("Rejected", "مرفوض")}</span> : <span className="ent-mint-chip">{t("New", "جديد")}</span>}</td>
            <td className="p-2 text-end">{st === "New" && may && <button type="button" className="btn-primary min-h-8 text-xs" disabled={!rules.data} data-channel-convert-row={d.name} onClick={() => { const r = convertChannelOrder(d.name, rules.data, c.user); if (r.ok) toast.success(r.salesOrder); else toast.error(say(ar, r.reason)); }}>{t("Create sales order", "إنشاء أمر بيع")}</button>}</td>
          </tr>; })}
        </Table>}
    </EntFrame>
  </div>;
}

/** Shared trade panels for one native form (merged into coreDocPanels). */
export function tradePanels(meta: DocTypeMeta, doc: Doc): { id: string; group: "work" | "control" | "flow" | "insight"; node: React.ReactNode }[] {
  const out: { id: string; group: "work" | "control" | "flow" | "insight"; node: React.ReactNode }[] = [];
  const dt = meta.name; const ds = n(doc.docstatus);
  if ((dt === "Sales Order" || dt === "Purchase Order") && ds === 1 && featureOn(QUICK_FEATURE, { company: s(doc["company"]) }) && quickPlan(dt, doc).applicable) out.push({ id: "quick-process", group: "work", node: <QuickProcessPanel doctype={dt} doc={doc} /> });
  if (dt === "Customer" && n(doc["on_hold"])) out.push({ id: "customer-hold", group: "control", node: <CustomerHoldPanel customer={doc.name} doctype="Customer" /> });
  if ((HOLD_BLOCKED_DOCS as readonly string[]).includes(dt) && ds === 0 && s(doc["customer"]) && customerHold(s(doc["customer"])).held) out.push({ id: "customer-hold", group: "control", node: <CustomerHoldPanel customer={s(doc["customer"])} doctype={dt} /> });
  if (dt === "Blanket Order" && ds === 1) out.push({ id: "blanket-order", group: "work", node: <BlanketOrderPanel doc={doc} /> });
  if (dt === "Sales Order" && (doc["items"] as Doc[] | undefined)?.some((r) => n(r["delivered_by_supplier"]))) out.push({ id: "drop-ship", group: "work", node: <DropShipPanel doctype="Sales Order" doc={doc} /> });
  if (dt === "Purchase Order" && ds === 1 && s(doc["customer"]) && (doc["items"] as Doc[] | undefined)?.some((r) => n(r["delivered_by_supplier"]))) out.push({ id: "drop-ship", group: "work", node: <DropShipPanel doctype="Purchase Order" doc={doc} /> });
  if (REPOST_TYPES.includes(dt) && ds === 1) out.push({ id: "ledger-repost", group: "control", node: <LedgerRepostPanel doctype={dt} doc={doc} /> });
  if (dt === CHANNEL_DT) out.push({ id: "channel-order", group: "work", node: <ChannelOrderPanel doc={doc} /> });
  if (dt === "Payment Entry" && ds === 1 && exchangeLines(doc).length) out.push({ id: "exchange-diff", group: "control", node: <ExchangeDiffPanel doc={doc} /> });
  return out;
}

