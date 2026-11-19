/**
 * DIGIT Enterprise shared control panels and the receiving controls page (Part B): the receipt check table with putaway and
 * landed-cost actions (src/lib/coreShared/receiving.ts) and the review-before-posting panel (src/lib/coreShared/review.ts).
 * and the RFQ supplier follow-up (src/lib/coreShared/procurementFollowup.ts). Logic lives in the Core modules; every app's forms get these panels through CorePanels.
 */
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { adapter, useStoreVersion, type Doc } from "@/lib/adapter";
import { cachedMeta } from "@/lib/catalog";
import { canReadType, useScopeMetas } from "@/lib/scope";
import { hasPerm, useSessionUser } from "@/lib/session";
import { saveDocument } from "@/lib/documentApi";
import { CORE_DT } from "@/lib/coreShared/doctypes";
import * as RCV from "@/lib/coreShared/receiving";
import * as REV from "@/lib/coreShared/review";
import * as PF from "@/lib/coreShared/procurementFollowup";
import { qtyAt } from "@/lib/stock";
import { EntDialog, EntFrame } from "./Surfaces";
import { NewDocLink, Bar, CompanySelect, Denied, DocLink, Field, Kpi, Table, money, pick, today, tr, useCompany, useT } from "./FinanceDesk";

const QI_TONE: Record<RCV.QiState, string> = { "Not required": "draft", Missing: "bad", Draft: "draft", Accepted: "ok", Rejected: "bad" };
const QI_AR: Record<RCV.QiState, string> = { "Not required": "غير مطلوب", Missing: "مفقود", Draft: "مسودة", Accepted: "مقبول", Rejected: "مرفوض" };
const num = (v: number) => v.toLocaleString("en-US", { maximumFractionDigits: 3 });
const itemName = (code: string) => String(adapter.get("Item", code)?.["item_name"] ?? "") || code;

/* ------------------------------------------------------------------ receipt checks (PR / PI with update stock) ------------------------------------------------------------------ */
export function ReceivingChecksPanel({ doctype, doc }: { doctype: "Purchase Receipt" | "Purchase Invoice"; doc: Doc }) {
  useStoreVersion(); const { ar, t } = useT(); const user = useSessionUser();
  const checks = RCV.receiptChecks(doctype, doc); const bad = checks.filter((c) => c.problems.length).length;
  const ds = Number(doc.docstatus ?? 0); const meta = cachedMeta(doctype); const canWrite = !!meta && ds === 0 && hasPerm(meta, "write", doc, user);
  const hasRules = checks.some((c) => adapter.list("Putaway Rule").some((p) => p["item_code"] === c.item && !Number(p["disable"]))) && doctype === "Purchase Receipt";
  const [plan, setPlan] = useState<ReturnType<typeof RCV.putawayPreview> | null>(null);
  const apply = () => { if (!meta) return; const r = saveDocument(meta, doc.name, { apply_putaway_rule: 1 }, { user }); if (r.errors.length) toast.error(r.errors.join("\n")); else { toast.success(t("Putaway rules applied.", "طُبّقت قواعد التخزين.")); setPlan(null); } };
  return <EntFrame id="receiving-checks" title={t("Receiving checks", "فحوص الاستلام")}
    note={t("Accepted + rejected must equal received; rejected stock needs its own (quarantine) warehouse; inspection and putaway per line.", "المقبول + المرفوض = المستلم؛ للمرفوض مستودع مستقل (حجر)؛ الفحص والتخزين لكل سطر.")}
    actions={<span className={`ent-qv-status ent-qv-tone-${bad ? "bad" : "ok"}`} data-rcv-state={bad ? "blocked" : "ok"}>{bad ? t(`${bad} line(s) to fix`, `${bad} سطر يحتاج تصحيحًا`) : t("Ready", "جاهز")}</span>}>
    <Table id="rcv-lines" head={["#", t("Item", "الصنف"), t("Accepted", "المقبول"), t("Rejected", "المرفوض"), t("Received", "المستلم"), t("Warehouse", "المستودع"), t("Rejected to", "المرفوض إلى"), t("Inspection", "الفحص"), t("Putaway rule", "قاعدة التخزين")]}>
      {checks.map((c) => <tr key={c.idx} className={tr} data-rcv-line={c.idx} data-rcv-problems={c.problems.length}>
        <td className="p-2 tabular-nums" data-no-i18n>{c.idx}</td><td className="p-2"><DocLink dt="Item" name={c.item} /></td>
        <td className="p-2 tabular-nums" data-no-i18n>{num(c.accepted)}</td><td className="p-2 tabular-nums" data-no-i18n>{num(c.rejected)}</td><td className="p-2 tabular-nums" data-no-i18n>{num(c.received)}</td>
        <td className="p-2" data-no-i18n>{c.warehouse || "—"}</td><td className="p-2" data-no-i18n>{c.rejectedWarehouse || "—"}</td>
        <td className="p-2"><span className={`ent-qv-status ent-qv-tone-${QI_TONE[c.qi]}`} data-rcv-qi={c.qi}>{ar ? QI_AR[c.qi] : c.qi}</span>{c.qiName && <> <DocLink dt="Quality Inspection" name={c.qiName} /></>}</td>
        <td className="p-2" data-no-i18n>{c.putawayRule ? <DocLink dt="Putaway Rule" name={c.putawayRule} /> : "—"}</td>
      </tr>)}
    </Table>
    {bad > 0 && <ul className="mt-2 space-y-0.5 text-sm text-destructive" data-rcv-problem-list>{checks.flatMap((c) => c.problems).map((p) => <li key={p} data-no-i18n>{p}</li>)}</ul>}
    {hasRules && canWrite && <div className="mt-2 flex flex-wrap items-center gap-2"><button type="button" className="btn-ghost" onClick={() => setPlan(RCV.putawayPreview(doctype, doc))} data-rcv-putaway-preview>{t("Apply putaway rules…", "تطبيق قواعد التخزين…")}</button>
      {Number(doc["apply_putaway_rule"]) ? <span className="ent-mint-chip" data-rcv-putaway-on>{t("Putaway rules are applied on every save", "تُطبّق قواعد التخزين عند كل حفظ")}</span> : null}</div>}
    <EntDialog open={!!plan} onOpenChange={(o) => !o && setPlan(null)} title={t("Putaway plan", "خطة التخزين")} id="rcv-putaway"
      footer={<><button type="button" className="btn-ghost" onClick={() => setPlan(null)}>{t("Cancel", "إلغاء")}</button><button type="button" className="btn-primary" onClick={apply} disabled={!!plan?.unassigned.length} data-rcv-putaway-apply>{t("Apply", "تطبيق")}</button></>}>
      {plan && <div className="space-y-2 text-sm">
        <Table id="rcv-putaway-plan" head={[t("Item", "الصنف"), t("Quantity", "الكمية"), t("Warehouse", "المستودع"), t("Rule", "القاعدة")]}>
          {plan.rows.map((r, i) => <tr key={i} className={tr} data-rcv-plan-row={String(r["warehouse"])}><td className="p-2" data-no-i18n>{itemName(String(r["item_code"]))}</td><td className="p-2 tabular-nums" data-no-i18n>{num(Number(r["qty"]))}</td><td className="p-2" data-no-i18n>{String(r["warehouse"] ?? "")}</td><td className="p-2" data-no-i18n>{String(r["putaway_rule"] ?? "—")}</td></tr>)}
        </Table>
        {plan.unassigned.length > 0 && <p className="text-destructive" data-rcv-unassigned={plan.unassigned.length}>{t("Not enough free space under the rules for: ", "لا تتسع القواعد لـ: ")}<bdi data-no-i18n>{plan.unassigned.map((u) => `${u.item} (${num(u.qty)})`).join(", ")}</bdi></p>}
      </div>}
    </EntDialog>
    {ds === 1 && <LandedCostLine doctype={doctype} doc={doc} />}
  </EntFrame>;
}

function LandedCostLine({ doctype, doc }: { doctype: "Purchase Receipt" | "Purchase Invoice"; doc: Doc }) {
  const { ar, t } = useT(); const user = useSessionUser(); const [open, setOpen] = useState<"expect" | "dismiss" | null>(null); const [amount, setAmount] = useState(""); const [note, setNote] = useState("");
  const q = RCV.landedCostQueue(String(doc["company"] ?? "")).find((r) => r.receipt === doc.name);
  const covered = adapter.list("Landed Cost Voucher").some((l) => Number(l.docstatus) === 1 && ((l["purchase_receipts"] as Doc[] | undefined) ?? []).some((p) => p["receipt_document"] === doc.name));
  const run = (r: { ok: true; name: string } | { ok: false; reason: [string, string] }, done: string) => { if (r.ok) { toast.success(done); setOpen(null); setNote(""); setAmount(""); } else toast.error(pick(ar, r.reason)); };
  return <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-2 text-sm" data-rcv-landed={covered ? "covered" : q ? "waiting" : "none"}>
    <span className="font-medium">{t("Landed costs", "تكاليف الوصول")}</span>
    {covered ? <span className="ent-qv-status ent-qv-tone-ok">{t("Covered by a Landed Cost Voucher", "مغطاة بقسيمة تكلفة وصول")}</span>
      : q ? <><span className="ent-qv-status ent-qv-tone-draft">{q.reason === "import" ? t("Waiting — imported goods", "بالانتظار — بضاعة مستوردة") : t("Waiting — marked as expected", "بالانتظار — مُعلّمة كمتوقعة")}</span>
        <button type="button" className="btn-primary" onClick={() => { const r = RCV.startLandedCostVoucher(doctype, doc.name, user); if (r.ok) toast.success(t(`Draft ${r.name} created — add the charges and submit.`, `أُنشئت المسودة ${r.name} — أضف التكاليف واعتمد.`)); else toast.error(pick(ar, r.reason)); }} data-rcv-lcv-start>{t("Start landed cost voucher", "بدء قسيمة تكلفة وصول")}</button>
        <button type="button" className="btn-ghost" onClick={() => setOpen("dismiss")} data-rcv-lcv-dismiss>{t("Not expected", "غير متوقعة")}</button></>
      : <button type="button" className="btn-ghost" onClick={() => setOpen("expect")} data-rcv-lcv-expect>{t("Expect landed costs", "توقع تكاليف وصول")}</button>}
    <EntDialog open={!!open} onOpenChange={(o) => !o && setOpen(null)} title={open === "expect" ? t("Expect landed costs", "توقع تكاليف وصول") : t("No landed costs expected", "لا تكاليف وصول متوقعة")} id="rcv-landed" size="sm"
      footer={<><button type="button" className="btn-ghost" onClick={() => setOpen(null)}>{t("Cancel", "إلغاء")}</button><button type="button" className="btn-primary" data-rcv-landed-save
        onClick={() => open === "expect" ? run(RCV.expectLandedCost(doctype, doc.name, Number(amount) || 0, note, user), t("Added to the landed-cost queue.", "أُضيف إلى قائمة تكاليف الوصول.")) : run(RCV.dismissLandedCost(doctype, doc.name, note, user), t("Removed from the queue.", "أُزيل من القائمة."))}>{t("Save", "حفظ")}</button></>}>
      <div className="space-y-2">{open === "expect" && <Field label={t("Expected charges", "التكاليف المتوقعة")}><input className="field-input" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} data-rcv-landed-amount /></Field>}
        <Field label={open === "expect" ? t("Note", "ملاحظة") : t("Reason", "السبب")}><textarea className="field-input" rows={2} value={note} onChange={(e) => setNote(e.target.value)} data-rcv-landed-note /></Field></div>
    </EntDialog>
  </div>;
}

/* ------------------------------------------------------------------ review before posting (JE / Stock Reconciliation) ------------------------------------------------------------------ */
export function ReviewPanel({ doctype, doc }: { doctype: "Journal Entry" | "Stock Reconciliation"; doc: Doc }) {
  useStoreVersion(); const { ar, t } = useT(); const user = useSessionUser(); const [open, setOpen] = useState<"Approved" | "Returned" | null>(null); const [note, setNote] = useState("");
  const st = REV.reviewState(doctype, doc); const need = st.need; if (!need) return null;
  const may = REV.mayReview(doctype, doc, user); const cur = String(doc["currency"] ?? "SAR");
  const state = !need.enabled ? "off" : !need.required ? "below" : st.approved ? "approved" : st.stamp?.["decision"] === "Returned" ? "returned" : "waiting";
  const LABEL: Record<string, [string, string]> = { off: ["Rule off for this company", "القاعدة غير مفعلة لهذه الشركة"], below: ["Below the review amount", "أقل من مبلغ المراجعة"], approved: ["Approved", "معتمد"], returned: ["Returned for changes", "أُعيد للتعديل"], waiting: ["Waiting for review", "بانتظار المراجعة"] };
  const kind = need.kind === "Journal review" ? t("Journal review", "مراجعة القيد") : t("Stock variance approval", "اعتماد فروق الجرد");
  return <EntFrame id="review-stamp" title={kind}
    note={t(`At or above ${money(need.threshold, cur)} a ${need.role} other than the preparer approves before posting.`, `عند ${money(need.threshold, cur)} فأكثر يعتمد ${need.role} غير المُعِدّ قبل الترحيل.`)}
    actions={<span className={`ent-qv-status ent-qv-tone-${state === "approved" || state === "below" ? "ok" : state === "off" ? "draft" : "bad"}`} data-review-state={state}>{pick(ar, LABEL[state]!)}</span>}>
    <p className="text-sm" data-review-amount={need.amount}>{need.kind === "Journal review" ? t("Amount", "المبلغ") : t("Value difference", "فرق القيمة")}: <bdi className="font-semibold tabular-nums" data-no-i18n>{money(need.amount, cur)}</bdi></p>
    {st.stamp && <p className="mt-1 text-sm text-muted-foreground" data-review-stamp={st.stamp.name}><span data-no-i18n>{String(st.stamp["reviewed_by"])}</span> · <span data-no-i18n>{String(st.stamp["reviewed_on"]).slice(0, 16)}</span> · {String(st.stamp["decision"]) === "Approved" ? t("Approved", "معتمد") : t("Returned", "مُعاد")}{st.stale ? ` · ${t("amount changed since", "تغيّر المبلغ بعدها")}` : ""}{st.stamp["note"] ? <> — <span data-no-i18n>{String(st.stamp["note"])}</span></> : null}</p>}
    {Number(doc.docstatus ?? 0) === 0 && need.enabled && (may.ok ? <div className="mt-2 flex gap-2"><button type="button" className="btn-primary" onClick={() => setOpen("Approved")} data-review-approve>{t("Approve", "اعتماد")}</button><button type="button" className="btn-ghost" onClick={() => setOpen("Returned")} data-review-return>{t("Return", "إعادة")}</button></div>
      : <p className="mt-2 text-xs text-muted-foreground" data-review-why>{pick(ar, may.reason)}</p>)}
    <EntDialog open={!!open} onOpenChange={(o) => !o && setOpen(null)} title={open === "Approved" ? t("Approve for posting", "اعتماد للترحيل") : t("Return for changes", "إعادة للتعديل")} id="review-dialog" size="sm"
      footer={<><button type="button" className="btn-ghost" onClick={() => setOpen(null)}>{t("Cancel", "إلغاء")}</button><button type="button" className="btn-primary" data-review-save
        onClick={() => { const r = REV.recordReview(doctype, doc.name, open!, note, user); if (r.ok) { toast.success(t("Review recorded.", "سُجّلت المراجعة.")); setOpen(null); setNote(""); } else toast.error(pick(ar, r.reason)); }}>{t("Save", "حفظ")}</button></>}>
      <Field label={t("Note", "ملاحظة")}><textarea className="field-input" rows={2} value={note} onChange={(e) => setNote(e.target.value)} data-review-note /></Field>
    </EntDialog>
  </EntFrame>;
}

/* ------------------------------------------------------------------ receiving controls page ------------------------------------------------------------------ */
export function ReceivingControlsPage() {
  useStoreVersion(); const { ar, t } = useT(); const c = useCompany(); const user = useSessionUser();
  useScopeMetas(["Purchase Receipt", "Purchase Invoice", "Putaway Rule", "Landed Cost Voucher", CORE_DT.landedCostExpect, "Quality Inspection"]);
  if (!canReadType("Purchase Receipt")) return <Denied />;
  const asOf = today(); const queue = RCV.landedCostQueue(c.company, asOf); const cur = String(adapter.get("Company", c.company)?.["default_currency"] ?? "SAR");
  const rules = adapter.list("Putaway Rule").filter((p) => p["company"] === c.company && !Number(p["disable"])).sort((a, b) => String(a["item_code"]).localeCompare(String(b["item_code"])) || Number(a["priority"]) - Number(b["priority"]));
  const rejected = adapter.list("Purchase Receipt").filter((d) => d["company"] === c.company && Number(d.docstatus) === 1).flatMap((d) => ((d["items"] as Doc[] | undefined) ?? []).filter((r) => Number(r["rejected_qty"]) > 0).map((r) => ({ d, r }))).slice(0, 50);
  const pendingQi = adapter.list("Quality Inspection").filter((q) => Number(q.docstatus) === 0 && (!q["company"] || q["company"] === c.company)).slice(0, 50);
  const pol = adapter.get(CORE_DT.controlPolicy, c.company);
  const prMeta = cachedMeta("Putaway Rule");
  return <div className="space-y-3" data-rcv-page>
    <Bar><CompanySelect c={c} />{prMeta && hasPerm(prMeta, "create", undefined, user) && <NewDocLink dt="Putaway Rule" data-rcv-rule-new>{t("New putaway rule", "قاعدة تخزين جديدة")}</NewDocLink>}</Bar>
    <div className="flex flex-wrap gap-2">
      <Kpi id="rcv-landed" label={t("Receipts waiting for landed costs", "إيصالات بانتظار تكاليف الوصول")} value={String(queue.length)} sub={money(queue.reduce((a, q) => a + q.amount, 0), cur)} />
      <Kpi id="rcv-rules" label={t("Putaway rules", "قواعد التخزين")} value={String(rules.length)} />
      <Kpi id="rcv-rejected" label={t("Lines received with rejections", "أسطر استُلمت مع رفض")} value={String(rejected.length)} />
      <Kpi id="rcv-qi" label={t("Inspections not submitted", "فحوص غير معتمدة")} value={String(pendingQi.length)} />
      <Kpi id="rcv-quarantine" label={t("Quarantine warehouse", "مستودع الحجر")} value={String(pol?.["quarantine_warehouse"] ?? "") || t("Not set", "غير محدد")} />
    </div>
    <EntFrame id="rcv-landed-queue" title={t("Landed-cost queue", "قائمة تكاليف الوصول")} note={t("Receipts marked as awaiting charges or from suppliers outside Saudi Arabia, until a submitted Landed Cost Voucher covers them.", "الإيصالات المعلّمة بانتظار تكاليف أو من موردين خارج المملكة، حتى تغطيها قسيمة تكلفة وصول معتمدة.")}>
      {queue.length ? <div className="max-h-[26rem] overflow-auto"><Table id="rcv-landed-rows" head={[t("Receipt", "الإيصال"), t("Supplier", "المورد"), t("Date", "التاريخ"), t("Amount", "المبلغ"), t("Waiting (days)", "الانتظار (أيام)"), t("Why", "السبب"), ""]}>
        {queue.map((q) => <tr key={q.receipt} className={tr} data-rcv-landed-row={q.receipt}>
          <td className="p-2"><DocLink dt={q.receiptType} name={q.receipt} /></td><td className="p-2" data-no-i18n>{q.supplierName}</td><td className="p-2 tabular-nums" data-no-i18n>{q.postingDate}</td>
          <td className="p-2 tabular-nums" data-no-i18n>{money(q.amount, cur)}</td><td className="p-2 tabular-nums" data-no-i18n>{q.days}</td>
          <td className="p-2">{q.reason === "import" ? t("Imported goods", "بضاعة مستوردة") : t("Marked as expected", "مُعلّمة كمتوقعة")}{q.expected ? <> · <bdi data-no-i18n>{money(q.expected, cur)}</bdi></> : null}</td>
          <td className="p-2"><button type="button" className="btn-ghost" onClick={() => { const r = RCV.startLandedCostVoucher(q.receiptType, q.receipt, user); if (r.ok) toast.success(t(`Draft ${r.name} created.`, `أُنشئت المسودة ${r.name}.`)); else toast.error(pick(ar, r.reason)); }} data-rcv-landed-start={q.receipt}>{t("Start voucher", "بدء القسيمة")}</button></td>
        </tr>)}
      </Table></div> : <p className="text-sm text-muted-foreground" data-rcv-landed-rows={0}>{t("No receipt is waiting for landed costs.", "لا يوجد إيصال بانتظار تكاليف وصول.")}</p>}
    </EntFrame>
    <EntFrame id="rcv-putaway" title={t("Putaway & slotting", "التخزين وتوزيع المواقع")} note={t("Each rule's capacity, current stock and free space; receipts with Apply Putaway Rule fill them by priority.", "سعة كل قاعدة ومخزونها الحالي والمساحة الحرة؛ الإيصالات التي تطبّق قواعد التخزين تملؤها حسب الأولوية.")}>
      {rules.length ? <div className="max-h-[22rem] overflow-auto"><Table id="rcv-putaway-rules" head={[t("Item", "الصنف"), t("Warehouse", "المستودع"), t("Priority", "الأولوية"), t("Capacity", "السعة"), t("In stock", "بالمخزون"), t("Free", "متاح")]}>
        {rules.map((p) => { const cap = Number(p["stock_capacity"]) || Number(p["capacity"]); const bal = qtyAt(String(p["item_code"]), String(p["warehouse"]), asOf); return <tr key={p.name} className={tr} data-rcv-rule={p.name}>
          <td className="p-2"><DocLink dt="Item" name={String(p["item_code"])}>{itemName(String(p["item_code"]))}</DocLink></td><td className="p-2" data-no-i18n>{String(p["warehouse"])}</td><td className="p-2 tabular-nums" data-no-i18n>{String(p["priority"] ?? "")}</td>
          <td className="p-2 tabular-nums" data-no-i18n>{num(cap)}</td><td className="p-2 tabular-nums" data-no-i18n>{num(bal)}</td><td className="p-2 tabular-nums" data-no-i18n>{num(Math.max(0, cap - bal))}</td></tr>; })}
      </Table></div> : <p className="text-sm text-muted-foreground">{t("No putaway rules for this company.", "لا قواعد تخزين لهذه الشركة.")}</p>}
    </EntFrame>
    <div className="grid gap-3 lg:grid-cols-2">
      <EntFrame id="rcv-rejections" title={t("Recent rejections", "الرفض الأخير")}>
        {rejected.length ? <div className="max-h-[18rem] overflow-auto"><Table id="rcv-rejection-rows" head={[t("Receipt", "الإيصال"), t("Item", "الصنف"), t("Rejected", "المرفوض"), t("Rejected to", "المرفوض إلى")]}>
          {rejected.map(({ d, r }) => <tr key={`${d.name}-${String(r["idx"])}`} className={tr}><td className="p-2"><DocLink dt="Purchase Receipt" name={d.name} /></td><td className="p-2"><DocLink dt="Item" name={String(r["item_code"])}>{itemName(String(r["item_code"]))}</DocLink></td><td className="p-2 tabular-nums" data-no-i18n>{num(Number(r["rejected_qty"]))}</td><td className="p-2" data-no-i18n>{String(r["rejected_warehouse"] || d["rejected_warehouse"] || "—")}</td></tr>)}
        </Table></div> : <p className="text-sm text-muted-foreground">{t("No rejected quantities received.", "لا كميات مرفوضة مستلمة.")}</p>}
      </EntFrame>
      <EntFrame id="rcv-qi-pending" title={t("Inspections to submit", "فحوص بانتظار الاعتماد")}>
        {pendingQi.length ? <ul className="max-h-[18rem] space-y-1 overflow-auto text-sm">{pendingQi.map((q) => <li key={q.name} className="flex gap-2"><DocLink dt="Quality Inspection" name={q.name} /><span className="text-muted-foreground" data-no-i18n>{String(q["item_code"] ?? "")}</span></li>)}</ul>
          : <p className="text-sm text-muted-foreground">{t("Every inspection is submitted.", "كل الفحوص معتمدة.")}</p>}
      </EntFrame>
    </div>
  </div>;
}

/* ------------------------------------------------------------------ RFQ follow-up (PU2-b / PUR-002-b) ------------------------------------------------------------------ */
const RS_TONE: Record<PF.ReminderState, string> = { due: "warn", later: "draft", overdue: "bad", sent: "ok", "no-email": "bad", quoted: "ok" };
const RS_LABEL: Record<PF.ReminderState, [string, string]> = { due: ["Reminder due", "التذكير مستحق"], later: ["Not yet due", "لم يحن بعد"], overdue: ["Overdue", "متأخر"], sent: ["Reminded today", "ذُكّر اليوم"], "no-email": ["No e-mail", "لا يوجد بريد"], quoted: ["Quoted", "قدّم عرضه"] };

function RfqRows({ list, user, company }: { list: PF.RfqReminderRow[]; user: string; company: string }) {
  const { ar, t } = useT(); const asOf = today();
  const send = (r: PF.RfqReminderRow) => { const x = PF.sendRfqReminders(company, asOf, user, [{ rfq: r.rfq, supplier: r.supplier }]); if (x.sent) toast.success(t("Reminder sent.", "أُرسل التذكير.")); else toast.error(x.skipped.map((b) => pick(ar, b)).join("\n") || t("Nothing to send.", "لا شيء للإرسال.")); };
  return <Table id="rfq-followup-rows" head={[t("Request", "الطلب"), t("Supplier", "المورد"), t("Due", "الاستحقاق"), t("Days left", "الأيام المتبقية"), t("State", "الحالة"), t("Last reminder", "آخر تذكير"), ""]}>
    {list.map((r) => <tr key={`${r.rfq}-${r.supplier}`} className={tr} data-rfq-row={`${r.rfq}|${r.supplier}`} data-rfq-state={r.state}>
      <td className="p-2"><DocLink dt="Request for Quotation" name={r.rfq} /></td><td className="p-2" data-no-i18n>{r.supplierName}</td>
      <td className="p-2 tabular-nums" data-no-i18n>{r.due || "—"}</td><td className="p-2 tabular-nums" data-no-i18n>{r.due ? r.daysLeft : "—"}</td>
      <td className="p-2"><span className={`ent-qv-status ent-qv-tone-${RS_TONE[r.state]}`}>{pick(ar, RS_LABEL[r.state])}</span></td>
      <td className="p-2 tabular-nums" data-no-i18n>{r.lastSent ? `${r.lastSent} (${r.sentCount})` : "—"}</td>
      <td className="p-2">{r.state !== "quoted" && r.state !== "sent" && r.email ? <button type="button" className="btn-ghost" data-rfq-send={`${r.rfq}|${r.supplier}`} onClick={() => send(r)}>{t("Send reminder", "إرسال تذكير")}</button> : null}</td>
    </tr>)}
  </Table>;
}

export function RfqFollowUpPanel({ doc }: { doc: Doc }) {
  useStoreVersion(); const { t } = useT(); const user = useSessionUser();
  if (Number(doc.docstatus ?? 0) !== 1) return null;
  const list = PF.rfqFollowUp(String(doc["company"] ?? ""), today(), user).filter((r) => r.rfq === doc.name);
  if (!list.length) return null;
  const open = list.filter((r) => r.state !== "quoted").length;
  return <EntFrame id="rfq-followup" title={t("Supplier follow-up", "متابعة الموردين")} note={t("Suppliers who have not quoted get an e-mail reminder before the required date; one per day at most.", "يُرسل للموردين الذين لم يقدموا عروضهم تذكير بالبريد قبل التاريخ المطلوب؛ مرة يوميًا على الأكثر.")}
    actions={<span className={`ent-qv-status ent-qv-tone-${open ? "warn" : "ok"}`} data-rfq-open={open}>{open ? t(`${open} waiting`, `${open} بالانتظار`) : t("All quoted", "قدّم الجميع")}</span>}>
    <RfqRows list={list} user={user} company={String(doc["company"] ?? "")} />
  </EntFrame>;
}

export function RfqFollowUpPage() {
  useStoreVersion(); const { ar, t } = useT(); const c = useCompany(); const user = useSessionUser();
  useScopeMetas(["Request for Quotation", "Supplier Quotation", CORE_DT.rfqReminder, "Communication"]);
  const asOf = today();
  // the daily reminder job (frappe scheduler in production): idempotent, runs once when the page opens for a user who may follow up
  useEffect(() => { const sent = PF.runRfqReminderJob(asOf, user); if (sent) toast.success(ar ? `أُرسل ${sent} تذكير مستحق.` : `${sent} due reminder(s) sent.`); }, [asOf, user, ar]);
  if (!canReadType("Request for Quotation")) return <Denied />;
  const list = PF.rfqFollowUp(c.company, asOf, user); const pol = adapter.get(CORE_DT.controlPolicy, c.company);
  const cnt = (st: PF.ReminderState) => list.filter((r) => r.state === st).length;
  const sentTotal = adapter.list(CORE_DT.rfqReminder).filter((x) => x["company"] === c.company).length;
  return <div className="space-y-3" data-rfq-page>
    <Bar><CompanySelect c={c} />
      <button type="button" className="btn-primary" data-rfq-send-due disabled={!cnt("due")} onClick={() => { const r = PF.sendRfqReminders(c.company, asOf, user); toast[r.sent ? "success" : "error"](r.sent ? t(`${r.sent} reminder(s) sent.`, `أُرسل ${r.sent} تذكير.`) : r.skipped.map((b) => pick(ar, b)).join("\n") || t("Nothing due.", "لا شيء مستحق.")); }}>{t("Send due reminders", "إرسال التذكيرات المستحقة")}</button>
    </Bar>
    <div className="flex flex-wrap gap-2">
      <Kpi id="rfq-due" label={t("Reminders due", "تذكيرات مستحقة")} value={String(cnt("due"))} />
      <Kpi id="rfq-overdue" label={t("Past the required date", "تجاوزت التاريخ المطلوب")} value={String(cnt("overdue"))} />
      <Kpi id="rfq-quoted" label={t("Suppliers who quoted", "موردون قدّموا عروضهم")} value={`${cnt("quoted")} / ${list.length}`} />
      <Kpi id="rfq-sent" label={t("Reminders sent", "تذكيرات مُرسلة")} value={String(sentTotal)} />
      <Kpi id="rfq-lead" label={t("Reminder starts (days before due)", "يبدأ التذكير (أيام قبل الاستحقاق)")} value={String(pol?.["rfq_reminder_days"] ?? 2)} />
    </div>
    <EntFrame id="rfq-followup-all" title={t("Quotation requests follow-up", "متابعة طلبات عروض الأسعار")} note={t("Every supplier on a submitted request: quoted, waiting, or reminded. E-mails go through Administration → External providers.", "كل مورد على طلب معتمد: قدّم عرضه أو بالانتظار أو ذُكّر. يُرسل البريد عبر الإدارة ← المزودون الخارجيون.")}>
      {list.length ? <div className="max-h-[30rem] overflow-auto"><RfqRows list={list} user={user} company={c.company} /></div> : <p className="text-sm text-muted-foreground">{t("No submitted quotation request.", "لا يوجد طلب عرض سعر معتمد.")}</p>}
    </EntFrame>
  </div>;
}
